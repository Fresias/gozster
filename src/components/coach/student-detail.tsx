import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { TrendingUp } from "@/components/athlete/icons";
import * as React from "react";
import type {
  AlumnoCuestionarioInicial,
  Contratacion,
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  EstadoContratacion,
  EstadoCuenta,
  MedioPago,
  NivelVistaAlumno,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCoachStudioStore, type CoachStudioTab } from "@/store/use-coach-studio";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { supabase } from "@/lib/supabase/client";
import {
  calculateStudentHealthScore,
  generateWhatsAppReactivationUrl,
} from "@/lib/strength-metrics";
import {
  ESTADO_CONTRATACION_LABEL,
  computeAnchoredRenewalDate,
  derivarContratacionDesdePerfil,
  derivarEstadoContratacion,
  toDateOnly,
} from "@/lib/contrataciones";
import {
  AVAILABLE_COACH_SENDERS,
  STAFF_COACH_FELIX,
  useChatStore,
} from "@/store/use-chat-store";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";
import { StudentPainAlerts } from "@/components/coach/student-pain-alerts";
import type { CriticalAlert } from "@/components/coach/critical-alerts-data";
import { AdherenciaCard, type EstadoAdherencia } from "@/components/coach/adherencia-card";
import { armarAdherencia, type Adherencia } from "@/lib/adherencia";
import { useCobrosStore } from "@/store/use-cobros-store";
import {
  derivarActividadFrecuencia,
  derivarEstadoPagoAlumno,
  derivarMontoSuscripcion,
  formatearDinero,
} from "@/lib/alumno-ficha";

export interface StudentDetailProps {
  alumno: Perfil;
  activeTab: CoachStudioTab;
  onTabChange: (tab: CoachStudioTab) => void;
  onBack: () => void;
  rutinaActiva: PlanEntrenamiento | null;
  historialPlanes: PlanEntrenamiento[];
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejerciciosCatalogo: Ejercicio[];
  historialCargas?: HistoricalLoadEntry[];
  onOpenHistoricalLoads: () => void;
  onClonarUltimaRutina: (alumnoId: string) => Promise<unknown>;
  onExtenderVigencia: (planId: string) => Promise<unknown>;
  isOffline: boolean;
  contratacion?: Contratacion | null;
  onRegistrarRenovacion?: (input: {
    contratacion: Contratacion;
    monto: number;
    medioPago: MedioPago;
  }) => Promise<unknown>;
  onExtenderExcepcional?: (input: {
    contratacion: Contratacion;
    nuevaFechaFin: string;
    motivo: string;
  }) => Promise<unknown>;
  onOpenChat?: () => void;
  onActualizarNivelVista?: (
    alumnoId: string,
    nivel: NivelVistaAlumno,
  ) => Promise<unknown>;
  cuestionario?: AlumnoCuestionarioInicial | null;
  onQuickSwap?: (alert: CriticalAlert) => void;
}

export function StudentDetail({
  alumno,
  activeTab,
  onTabChange,
  onBack,
  rutinaActiva,
  historialPlanes,
  dias,
  ejerciciosEnRutina,
  ejerciciosCatalogo,
  historialCargas,
  onOpenHistoricalLoads,
  onClonarUltimaRutina,
  onExtenderVigencia,
  isOffline,
  contratacion: contratacionProp,
  onRegistrarRenovacion,
  onExtenderExcepcional,
  onOpenChat,
  onActualizarNivelVista,
  cuestionario: cuestionarioProp,
  onQuickSwap,
}: StudentDetailProps) {
  const [isCloning, setIsCloning] = React.useState(false);
  const [isExtending, setIsExtending] = React.useState(false);

  // Integración Chat GOZS (ADR-004)
  const { getConversation, transferirConversacion } = useChatStore();
  const chatConv = getConversation(alumno.id, alumno.nombre_completo);

  const [transferTargetCoachId, setTransferTargetCoachId] = React.useState<string>(
    AVAILABLE_COACH_SENDERS[1]?.id || STAFF_COACH_FELIX.id,
  );
  const [transferMotivo, setTransferMotivo] = React.useState("");
  const [isTransferring, setIsTransferring] = React.useState(false);
  const [transferSuccess, setTransferSuccess] = React.useState<string | null>(null);
  const [transferError, setTransferError] = React.useState<string | null>(null);

  const chatActivePainAlert = React.useMemo(() => {
    return DEMO_CRITICAL_ALERTS.find(
      (a) =>
        !a.resolved &&
        (a.alumnoId === alumno.id ||
          a.alumnoNombre.toLowerCase() ===
            alumno.nombre_completo.toLowerCase()),
    );
  }, [alumno.id, alumno.nombre_completo]);

  const handleTransferirConversacion = async () => {
    setIsTransferring(true);
    setTransferSuccess(null);
    setTransferError(null);

    const targetCoach = AVAILABLE_COACH_SENDERS.find(
      (c) => c.id === transferTargetCoachId,
    );
    const targetNombre = targetCoach?.nombre || "Coach Asignado";

    try {
      const res = await transferirConversacion({
        conversacionId: chatConv.id,
        nuevoResponsableId: transferTargetCoachId,
        motivo: transferMotivo.trim() || undefined,
        alumnoId: alumno.id,
      });

      if (!res.success && res.error) {
        setTransferError(res.error);
      } else {
        setTransferSuccess(`Responsable actualizado a ${targetNombre}`);
        setTransferMotivo("");
        setTimeout(() => {
          setTransferSuccess(null);
        }, 3000);
      }
    } catch (err: any) {
      setTransferError(err?.message || "Error al transferir");
    } finally {
      setIsTransferring(false);
    }
  };

  const [nivelVista, setNivelVista] = React.useState<NivelVistaAlumno>(
    alumno.nivel_vista_alumno ?? "SIMPLE",
  );
  const [cuestionario, setCuestionario] = React.useState<AlumnoCuestionarioInicial | null>(
    cuestionarioProp ?? null,
  );
  const [isUpdatingNivel, setIsUpdatingNivel] = React.useState(false);
  const [errorNivelVista, setErrorNivelVista] = React.useState<string | null>(null);

  const storeSustituciones = useCoachStudioStore((s) => s.sustituciones);
  const catalogoCompleto = useCoachStudioStore((s) => s.ejercicios);
  const isWhatsAppEnabled = useCoachStudioStore((s) => s.isWhatsAppEnabled);
  const openChatForAlumno = useCoachStudioStore((s) => s.openChatForAlumno);
  const isTestMode = useWorkspaceModeStore((s) => s.mode === "TESTEO");
  const alumnoSustituciones = storeSustituciones.filter((s) => {
    if (rutinaActiva && s.plan_id === rutinaActiva.id) return true;
    return historialPlanes.some((p) => p.id === s.plan_id);
  });

  React.useEffect(() => {
    setNivelVista(alumno.nivel_vista_alumno ?? "SIMPLE");
  }, [alumno.id, alumno.nivel_vista_alumno]);

  React.useEffect(() => {
    if (cuestionarioProp !== undefined) {
      setCuestionario(cuestionarioProp);
      return;
    }
    let isMounted = true;
    async function loadCuestionario() {
      try {
        if (!supabase) return;
        const { data, error } = await supabase
          .from("alumno_cuestionario_inicial")
          .select("*")
          .eq("alumno_id", alumno.id)
          .maybeSingle();
        if (!error && data && isMounted) {
          setCuestionario(data as AlumnoCuestionarioInicial);
        }
      } catch (e) {
        // offline fallback
      }
    }
    loadCuestionario();
    return () => {
      isMounted = false;
    };
  }, [alumno.id, cuestionarioProp]);

  // GOZS-163 (§5): calendario de adherencia. Lee registro_sesiones del alumno con el
  // cliente del coach (RLS lo permite) y arma el modelo con la función pura.
  const [adherencia, setAdherencia] = React.useState<Adherencia | null>(null);
  const [estadoAdherencia, setEstadoAdherencia] =
    React.useState<EstadoAdherencia>("cargando");
  const [recargaAdherencia, setRecargaAdherencia] = React.useState(0);
  const objetivoAdherencia = rutinaActiva
    ? dias.filter((d) => d.plan_id === rutinaActiva.id).length
    : null;

  React.useEffect(() => {
    let isMounted = true;
    async function cargarAdherencia() {
      setEstadoAdherencia("cargando");
      try {
        if (!supabase) {
          if (isMounted) {
            const fallbackSesiones = historialCargas ? historialCargas.map((e) => ({ fecha: e.sesion.fecha })) : [];
            const primeraSes = fallbackSesiones[fallbackSesiones.length - 1]?.fecha ?? null;
            setAdherencia(armarAdherencia(fallbackSesiones, new Date(), objetivoAdherencia, primeraSes));
            setEstadoAdherencia("listo");
          }
          return;
        }
        const desde = new Date(Date.now() - 371 * 86_400_000).toISOString();
        const [recientes, primera] = await Promise.all([
          supabase
            .from("registro_sesiones")
            .select("fecha")
            .eq("alumno_id", alumno.id)
            .gte("fecha", desde)
            .order("fecha", { ascending: false })
            .limit(1000),
          supabase
            .from("registro_sesiones")
            .select("fecha")
            .eq("alumno_id", alumno.id)
            .order("fecha", { ascending: true })
            .limit(1),
        ]);
        if (recientes.error || primera.error) throw recientes.error ?? primera.error;
        if (!isMounted) return;
        let sesiones = (recientes.data ?? []) as { fecha: string }[];
        if (sesiones.length === 0 && historialCargas && historialCargas.length > 0) {
          sesiones = historialCargas.map((e) => ({ fecha: e.sesion.fecha }));
        }
        const primeraSesion =
          (primera.data?.[0] as { fecha: string } | undefined)?.fecha ?? (sesiones[sesiones.length - 1]?.fecha ?? null);
        setAdherencia(armarAdherencia(sesiones, new Date(), objetivoAdherencia, primeraSesion));
        setEstadoAdherencia("listo");
      } catch {
        if (isMounted) setEstadoAdherencia("error");
      }
    }
    cargarAdherencia();
    return () => {
      isMounted = false;
    };
  }, [alumno.id, objetivoAdherencia, recargaAdherencia]);

  const handleToggleNivelVista = async (nuevoNivel: NivelVistaAlumno) => {
    if (nuevoNivel === nivelVista) return;
    const nivelAnterior = nivelVista;
    setErrorNivelVista(null);
    setNivelVista(nuevoNivel);
    setIsUpdatingNivel(true);
    try {
      if (onActualizarNivelVista) {
        const ok = await onActualizarNivelVista(alumno.id, nuevoNivel);
        if (ok === false) {
          throw new Error("No se pudo guardar, intentá de nuevo");
        }
      } else if (supabase) {
        const { error } = await supabase
          .from("perfiles")
          .update({ nivel_vista_alumno: nuevoNivel })
          .eq("id", alumno.id);
        if (error) {
          throw error;
        }
      }
    } catch {
      setNivelVista(nivelAnterior);
      setErrorNivelVista("No se pudo guardar, intentá de nuevo");
    } finally {
      setIsUpdatingNivel(false);
    }
  };

  const getPaymentBadge = (estado: Perfil["estado_membresia"]) => {
    switch (estado) {
      case "ACTIVA":
        return <Badge variant="success">Al día</Badge>;
      case "PENDIENTE":
        return <Badge variant="warning">Pago pendiente</Badge>;
      case "INACTIVA":
        return <Badge variant="secondary">Inactivo</Badge>;
      case "BAJA":
        return <Badge variant="destructive">Baja</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getPlanBadge = (
    estado: PlanEntrenamiento["estado"],
    fechaFin?: string | null,
  ) => {
    if (fechaFin && new Date(fechaFin).getTime() < Date.now()) {
      return <Badge variant="destructive">VENCIDO</Badge>;
    }
    switch (estado) {
      case "ACTIVO":
        return <Badge variant="success">ACTIVO</Badge>;
      case "INACTIVO":
        return <Badge variant="secondary">INACTIVO</Badge>;
      case "BORRADOR":
        return <Badge variant="warning">BORRADOR</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getContratacionBadge = (estado: EstadoContratacion) => {
    const label = ESTADO_CONTRATACION_LABEL[estado];
    switch (estado) {
      case "VIGENTE":
        return <Badge variant="success">{label}</Badge>;
      case "POR_VENCER":
        return <Badge variant="warning">{label}</Badge>;
      case "VENCIDA":
        return <Badge variant="destructive">{label}</Badge>;
      case "EN_PAUSA":
        return <Badge variant="secondary">{label}</Badge>;
      case "PENDIENTE_RENOVACION":
        return <Badge variant="warning">{label}</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getCuentaBadge = (estado: EstadoCuenta) => {
    switch (estado) {
      case "ACTIVO":
        return <Badge variant="success">Activo</Badge>;
      case "SUSPENDIDO":
        return <Badge variant="warning">Suspendido</Badge>;
      case "BAJA_ADMINISTRATIVA":
        return <Badge variant="destructive">Baja administrativa</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  // Contratación (ADR-001): si el padre no la inyecta, se deriva del perfil sin
  // inventar datos fuera del esquema generado por @backend-eng.
  const contratacion = React.useMemo(() => {
    if (contratacionProp) return contratacionProp;
    const base = derivarContratacionDesdePerfil(alumno);
    // Si el alumno no tiene fecha_vencimiento_cuota explícita pero tiene rutinaActiva con fecha_fin, sincronizar
    if (!alumno.fecha_vencimiento_cuota && rutinaActiva?.fecha_fin) {
      const finDate = rutinaActiva.fecha_fin.slice(0, 10);
      return {
        ...base,
        fecha_fin: finDate,
        dia_vencimiento: toDateOnly(finDate).getUTCDate(),
        estado: derivarEstadoContratacion(finDate, 5),
      };
    }
    return base;
  }, [contratacionProp, alumno, rutinaActiva]);

  const estadoCuenta: EstadoCuenta =
    alumno.estado_cuenta ??
    (alumno.estado_membresia === "BAJA"
      ? "BAJA_ADMINISTRATIVA"
      : alumno.estado_membresia === "INACTIVA"
      ? "SUSPENDIDO"
      : "ACTIVO");

  // Fecha de corte anclada que resultará de la próxima renovación ("no se corre
  // la fecha": mantiene el día de vencimiento original).
  const proximaFechaAnclada = computeAnchoredRenewalDate(
    contratacion.fecha_fin,
    contratacion.dia_vencimiento,
  );

  const [renovMedio, setRenovMedio] = React.useState<MedioPago>("TRANSFERENCIA");
  const [renovMonto, setRenovMonto] = React.useState("");
  const [isRenovando, setIsRenovando] = React.useState(false);
  const [extFecha, setExtFecha] = React.useState("");
  const [extMotivo, setExtMotivo] = React.useState("");
  const [isExtendiendoExc, setIsExtendiendoExc] = React.useState(false);

  // GOZS-247: Integración con Cobros Store y suscripción
  const cobros = useCobrosStore((s) => s.cobros);
  const registrarPagoStore = useCobrosStore((s) => s.registrarPago);

  const cobroItem = React.useMemo(() => {
    return (
      cobros.find(
        (c) => c.alumnoId === alumno.id || c.contratacionId === contratacion.id,
      ) ?? null
    );
  }, [cobros, alumno.id, contratacion.id]);

  const historialCobros = React.useMemo(
    () =>
      cobros
        .filter((c) => c.alumnoId === alumno.id)
        .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento)),
    [cobros, alumno.id],
  );

  const [pagoRegistradoEnSesion, setPagoRegistradoEnSesion] = React.useState(false);
  const [isRegistrandoPago, setIsRegistrandoPago] = React.useState(false);
  const [avisoPago, setAvisoPago] = React.useState<string | null>(null);

  const actividadFrecuencia = React.useMemo(() => {
    return derivarActividadFrecuencia({
      contratacion,
      rutinaActiva,
      cobroItem,
    });
  }, [contratacion, rutinaActiva, cobroItem]);

  const estadoPagoInfo = React.useMemo(() => {
    return derivarEstadoPagoAlumno({
      cobroItem,
      contratacion,
      alumno,
      pagoRegistradoEnSesion,
    });
  }, [cobroItem, contratacion, alumno, pagoRegistradoEnSesion]);

  const montoSuscripcion = React.useMemo(() => {
    return derivarMontoSuscripcion({
      cobroItem,
      contratacion,
    });
  }, [cobroItem, contratacion]);

  const dialogoPagoRef = React.useRef<HTMLDialogElement>(null);
  const [modalMonto, setModalMonto] = React.useState<number>(montoSuscripcion.monto);
  const [modalMedio, setModalMedio] = React.useState<MedioPago>("TRANSFERENCIA");
  const [modalNota, setModalNota] = React.useState<string>("");

  React.useEffect(() => {
    setModalMonto(montoSuscripcion.monto);
  }, [montoSuscripcion.monto]);

  const handleAbrirDialogoPago = () => {
    setModalMonto(montoSuscripcion.monto);
    setModalMedio("TRANSFERENCIA");
    setModalNota("");
    dialogoPagoRef.current?.showModal();
  };

  const handleCerrarDialogoPago = () => {
    dialogoPagoRef.current?.close();
  };

  const handleConfirmarRegistroPago = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsRegistrandoPago(true);
    setAvisoPago(null);
    try {
      if (cobroItem) {
        await registrarPagoStore({
          contratacionId: cobroItem.contratacionId,
          monto: modalMonto,
          montoLista: cobroItem.montoLista,
          medioPago: modalMedio === "EFECTIVO" ? "EFECTIVO" : "TRANSFERENCIA",
          notas: modalNota.trim() || undefined,
        });
      }

      if (onRegistrarRenovacion) {
        await onRegistrarRenovacion({
          contratacion,
          monto: modalMonto,
          medioPago: modalMedio,
        });
      }

      setPagoRegistradoEnSesion(true);
      setAvisoPago(`Pago de ${formatearDinero(modalMonto)} registrado con éxito.`);
      dialogoPagoRef.current?.close();
    } catch {
      setAvisoPago("No se pudo registrar el pago. Intentá nuevamente.");
    } finally {
      setIsRegistrandoPago(false);
    }
  };

  const formatFecha = (iso: string) => {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const handleRegistrarRenovacion = async () => {
    if (!onRegistrarRenovacion) return;
    setIsRenovando(true);
    try {
      const monto = Number.parseFloat(renovMonto);
      await onRegistrarRenovacion({
        contratacion,
        monto: Number.isFinite(monto) ? monto : 0,
        medioPago: renovMedio,
      });
      setRenovMonto("");
    } finally {
      setIsRenovando(false);
    }
  };

  const handleExtenderExcepcional = async () => {
    if (!onExtenderExcepcional) return;
    if (!extFecha || !extMotivo.trim()) return;
    setIsExtendiendoExc(true);
    try {
      await onExtenderExcepcional({
        contratacion,
        nuevaFechaFin: extFecha,
        motivo: extMotivo.trim(),
      });
      setExtFecha("");
      setExtMotivo("");
    } finally {
      setIsExtendiendoExc(false);
    }
  };

  const handleClonar = async () => {
    setIsCloning(true);
    try {
      await onClonarUltimaRutina(alumno.id);
    } finally {
      setIsCloning(false);
    }
  };

  const handleExtender = async () => {
    if (!rutinaActiva) return;
    setIsExtending(true);
    try {
      await onExtenderVigencia(rutinaActiva.id);
    } finally {
      setIsExtending(false);
    }
  };

  const cuotaScore =
    alumno.estado_membresia === "ACTIVA"
      ? 100
      : alumno.estado_membresia === "PENDIENTE"
      ? 50
      : 15;
  const healthScore = calculateStudentHealthScore({
    adherencia: rutinaActiva ? 90 : 35,
    frecuencia: rutinaActiva ? 85 : 40,
    interaccionChat: 75,
    estadoCuota: cuotaScore,
  });

  const whatsappUrl = generateWhatsAppReactivationUrl({
    phone: alumno.telefono,
    studentName: alumno.nombre_completo,
    daysInactive: rutinaActiva ? 4 : 8,
    routineName: rutinaActiva?.nombre,
  });

  const currentPlanDias = rutinaActiva
    ? dias.filter((d) => d.plan_id === rutinaActiva.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Top Bar / Back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="default"
          onClick={onBack}
          className="min-h-11 gap-2 text-xs font-semibold"
        >
          <span>← Volver a Alumnos</span>
        </Button>
        <div className="flex items-center gap-2">
          {isOffline && (
            <Badge variant="warning" className="text-[11px]">
              Modo Offline • Acciones en cola
            </Badge>
          )}
          <Button
            type="button"
            variant="default"
            size="default"
            onClick={() => {
              onOpenChat?.();
              openChatForAlumno(alumno.id);
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 text-xs font-bold"
            data-testid="enviar-mensaje-btn"
            aria-label={`Enviar mensaje a ${alumno.nombre_completo}`}
          >
            <span>💬 Enviar mensaje</span>
          </Button>
          {(isWhatsAppEnabled || isTestMode) && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp con ${alumno.nombre_completo}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 active:scale-[0.99]"
              data-testid="whatsapp-direct-btn"
            >
              <span>💬 WhatsApp 1-Clic</span>
            </a>
          )}
        </div>
      </div>

      {/* Ficha Header */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-bold text-secondary-foreground">
                {alumno.nombre_completo
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {alumno.nombre_completo}
                  </h2>
                  {getPaymentBadge(alumno.estado_membresia)}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${healthScore.colorClass}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Semáforo de Salud: {healthScore.score}/100 ({healthScore.badgeLabel})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {alumno.email ?? "Sin email"} • Cliente desde{" "}
                  {new Date(alumno.created_at).toLocaleDateString("es-AR", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={onOpenHistoricalLoads}
                className="min-h-11 w-full gap-2 text-xs font-semibold sm:w-auto"
                aria-label="Revisar cargas y RPE históricos"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
                <span>Cargas y RPE Históricos</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen Comercial y Estado de Pago (GOZS-247) */}
      <Card data-testid="ficha-suscripcion-resumen" className="border-primary/25 bg-card shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 flex-1">
              {/* 1. Actividad y frecuencia */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Actividad y Frecuencia
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-black text-foreground"
                    data-testid="ficha-actividad-frecuencia"
                  >
                    {actividadFrecuencia.etiqueta}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground" data-testid="ficha-actividad-detalle">
                  {actividadFrecuencia.detalle}
                </p>
              </div>

              {/* 2. Estado de pago (si pagó o no) */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Estado de Pago
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-black border ${
                      estadoPagoInfo.pago
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        : estadoPagoInfo.estado === "VENCIDO"
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                    }`}
                    data-testid="ficha-estado-pago"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        estadoPagoInfo.pago
                          ? "bg-emerald-500"
                          : estadoPagoInfo.estado === "VENCIDO"
                          ? "bg-rose-500"
                          : "bg-amber-500"
                      }`}
                    />
                    {estadoPagoInfo.etiquetaPrincipal} • {estadoPagoInfo.etiquetaDetalle}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {estadoPagoInfo.pago
                    ? "Cuota vigente al día"
                    : estadoPagoInfo.estado === "VENCIDO"
                    ? "Cuota vencida impaga"
                    : "Esperando confirmación de cobro"}
                </p>
              </div>

              {/* 3. Monto de la suscripción */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Monto de la Suscripción
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-lg font-black text-foreground tabular-nums"
                    data-testid="ficha-monto-sub"
                  >
                    {montoSuscripcion.formateado}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-semibold">/mes</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Día {contratacion.dia_vencimiento} anclado • Vence {formatFecha(contratacion.fecha_fin)}
                </p>
              </div>
            </div>

            {/* 4. Botón para registrar el pago */}
            <div className="flex items-center justify-end pt-1 lg:pt-0">
              <Button
                variant={estadoPagoInfo.pago ? "outline" : "default"}
                size="default"
                onClick={handleAbrirDialogoPago}
                className="min-h-11 w-full gap-2 text-xs font-bold sm:w-auto px-5 shadow-sm"
                data-testid="btn-registrar-pago"
                aria-label={`Registrar pago para ${alumno.nombre_completo}`}
              >
                <span>💳 Registrar pago</span>
              </Button>
            </div>
          </div>

          {avisoPago && (
            <div
              className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 font-medium"
              data-testid="aviso-pago-exitoso"
            >
              ✓ {avisoPago}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GOZS-257: historial completo de cuotas/pagos del alumno */}
      <Card data-testid="historial-pagos-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-foreground">Historial de pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {historialCobros.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin cuotas registradas.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-xs">
              {historialCobros.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2"
                  data-testid="historial-pago-item"
                >
                  <span className="font-semibold">
                    {c.servicioNombre} · vence {formatFecha(c.fechaVencimiento)}
                  </span>
                  <span className="tabular-nums">
                    ${(c.ultimoPago?.monto ?? c.monto).toLocaleString("es-AR")} ·{" "}
                    {c.estado === "PAGADO" ? "Pagado" : c.estado === "VENCIDO" ? "Vencido" : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Calendario de adherencia y "días sin entrenar" (GOZS-163, spec §5) */}
      <AdherenciaCard
        estado={estadoAdherencia}
        data={adherencia}
        onReintentar={() => setRecargaAdherencia((n) => n + 1)}
      />

      {/* Configuración de Modo de Vista del Alumno (ADR-004: SIMPLE vs TECNICA) */}
      <Card data-testid="coach-nivel-vista-card">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  Vista recomendada
                </h3>
                <Badge
                  variant={nivelVista === "SIMPLE" ? "secondary" : "default"}
                  className="text-[10px] font-bold"
                  data-testid="coach-nivel-vista-badge"
                >
                  {nivelVista === "SIMPLE" ? "SIMPLE (Minimalista)" : "TÉCNICA (Avanzada)"}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {nivelVista === "SIMPLE"
                  ? "Vista minimalista: El alumno visualiza únicamente Series × Reps × Peso + Video + Descanso (sin RPE ni 1RM)."
                  : "Vista técnica completa: Expone RPE objetivo/real, %1RM y fórmulas para atletas avanzados."}
              </p>
              {errorNivelVista && (
                <p
                  className="mt-1 text-xs font-semibold text-destructive"
                  data-testid="coach-nivel-vista-error"
                >
                  {errorNivelVista}
                </p>
              )}
            </div>

            <div
              className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 p-1"
              data-testid="coach-nivel-vista-switcher"
            >
              <Button
                variant={nivelVista === "SIMPLE" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleToggleNivelVista("SIMPLE")}
                disabled={isUpdatingNivel}
                className="min-h-11 text-xs font-bold sm:min-h-9"
                data-testid="coach-toggle-vista-simple"
              >
                Vista Simple (Minimalista)
              </Button>
              <Button
                variant={nivelVista === "TECNICA" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleToggleNivelVista("TECNICA")}
                disabled={isUpdatingNivel}
                className="min-h-11 text-xs font-bold sm:min-h-9"
                data-testid="coach-toggle-vista-tecnica"
              >
                Vista Técnica Avanzada
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cuestionario Inicial del Alumno (ADR-004 / Issue #65) */}
      <Card data-testid="coach-cuestionario-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <CardTitle className="text-sm font-bold text-foreground">
                Cuestionario Inicial del Alumno
              </CardTitle>
            </div>
            {cuestionario?.completado_at ? (
              <Badge
                variant="success"
                className="text-[10px] font-bold"
                data-testid="coach-cuestionario-badge-completado"
              >
                ✓ Completado ({formatFecha(cuestionario.completado_at)})
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] font-bold text-muted-foreground"
                data-testid="coach-cuestionario-badge-pendiente"
              >
                Pendiente (Opcional)
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            {cuestionario?.completado_at
              ? "Respuestas registradas por el alumno en su Athlete App."
              : "El alumno aún no ha completado el cuestionario inicial opcional."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          {cuestionario?.completado_at ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Objetivo Principal
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-objetivo">
                  {cuestionario.objetivo_principal || "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Experiencia Previa
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-experiencia">
                  {cuestionario.experiencia_previa || "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Días por Semana
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-dias">
                  {cuestionario.dias_disponibles_semana ? `${cuestionario.dias_disponibles_semana} días` : "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Equipamiento
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-equipamiento">
                  {cuestionario.equipamiento_disponible || "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5 sm:col-span-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Molestias o Lesiones Previas
                </span>
                <p
                  className={`mt-1 text-xs font-medium ${
                    cuestionario.molestias_o_lesiones_previas &&
                    cuestionario.molestias_o_lesiones_previas !== "Ninguna reportada"
                      ? "text-amber-500 font-semibold"
                      : "text-foreground"
                  }`}
                  data-testid="coach-cuestionario-molestias"
                >
                  {cuestionario.molestias_o_lesiones_previas || "Ninguna reportada"}
                </p>
              </div>
              {cuestionario.respuestas_extra &&
                typeof cuestionario.respuestas_extra === "object" && (
                  <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5 sm:col-span-2 lg:col-span-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Comentarios Extra
                    </span>
                    <p className="mt-1 text-xs font-medium text-foreground" data-testid="coach-cuestionario-comentarios">
                      {String((cuestionario.respuestas_extra as Record<string, any>).comentarios || "Sin comentarios adicionales")}
                    </p>
                  </div>
                )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 p-4 text-center" data-testid="coach-cuestionario-empty">
              <p className="text-xs text-muted-foreground">
                El alumno puede acceder a su rutina normalmente sin necesidad de completar este cuestionario.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <StudentPainAlerts alumnoId={alumno.id} onQuickSwap={onQuickSwap} />

      {/* Estado Comercial y Contratación (ADR-001: entidades/estados separados) */}
      <Card data-testid="contratacion-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">
            Estado Comercial y Contratación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de Cuenta
              </p>
              <div className="mt-1.5" data-testid="estado-cuenta">
                {getCuentaBadge(estadoCuenta)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de Contratación
              </p>
              <div className="mt-1.5" data-testid="estado-contratacion">
                {getContratacionBadge(contratacion.estado)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vencimiento
              </p>
              <p
                className="mt-1 text-sm font-bold text-foreground"
                data-testid="fecha-vencimiento"
              >
                {formatFecha(contratacion.fecha_fin)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Día {contratacion.dia_vencimiento} anclado
              </p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de Rutina
              </p>
              <div className="mt-1.5" data-testid="estado-rutina">
                {rutinaActiva ? (
                  getPlanBadge(rutinaActiva.estado, rutinaActiva.fecha_fin)
                ) : (
                  <Badge variant="outline">Sin rutina</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Plan de Membresía y Actividad Presencial (GH #122) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="membresia-clases-panel">
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Plan de Membresía
              </p>
              <p className="mt-1 text-sm font-bold text-foreground" data-testid="plan-membresia-nombre">
                {contratacion.plan_membresia_id === "demo-plan-funcional-2x"
                  ? "Funcional 2x semana"
                  : contratacion.plan_membresia_id === "demo-plan-pase-libre"
                  ? "Pase libre Funcional + Boxeo"
                  : contratacion.plan_membresia_id
                  ? "Plan Presencial"
                  : "Sin membresía de clases"}
              </p>
              <p className="text-[11px] text-muted-foreground" data-testid="plan-membresia-detalle">
                {contratacion.plan_membresia_id === "demo-plan-funcional-2x"
                  ? "Límite: 2 clases por semana · $25.000/mes"
                  : contratacion.plan_membresia_id === "demo-plan-pase-libre"
                  ? "Pase libre sin límite semanal · $40.000/mes"
                  : contratacion.plan_membresia_id
                  ? "Membresía activa"
                  : "Asesoría o sin plan de clases"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Actividad de la Contratación
              </p>
              <p className="mt-1 text-sm font-bold text-foreground" data-testid="actividad-contratacion">
                {contratacion.actividad
                  ? contratacion.actividad === "FUNCIONAL"
                    ? "Funcional"
                    : "Boxeo"
                  : contratacion.plan_membresia_id
                  ? "Funcional + Boxeo (Pase libre)"
                  : "No asignada"}
              </p>
              <p className="text-[11px] text-muted-foreground" data-testid="tipo-servicio-contratacion">
                {contratacion.tipo_servicio === "PRESENCIAL"
                  ? "Modalidad Presencial"
                  : "Modalidad Online"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Renovación manual (Transferencia / Efectivo) */}
            <div
              className="space-y-3 rounded-lg border border-border p-3.5"
              data-testid="renovacion-manual"
            >
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Renovación manual
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  No se corre la fecha: el próximo corte queda el{" "}
                  <strong className="text-foreground">
                    {formatFecha(proximaFechaAnclada)}
                  </strong>{" "}
                  (día {contratacion.dia_vencimiento}).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex-1 min-w-[8rem] text-[11px] font-semibold text-muted-foreground">
                  Medio de pago
                  <select
                    value={renovMedio}
                    onChange={(e) =>
                      setRenovMedio(e.target.value as MedioPago)
                    }
                    className="mt-1 min-h-11 w-full rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground"
                    data-testid="renovacion-medio"
                  >
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="EFECTIVO">Efectivo</option>
                  </select>
                </label>
                <label className="flex-1 min-w-[8rem] text-[11px] font-semibold text-muted-foreground">
                  Monto
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={renovMonto}
                    onChange={(e) => setRenovMonto(e.target.value)}
                    placeholder="0"
                    className="mt-1 min-h-11 w-full rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground"
                    data-testid="renovacion-monto"
                  />
                </label>
              </div>
              <Button
                size="default"
                className="min-h-11 w-full text-xs font-semibold"
                onClick={handleRegistrarRenovacion}
                disabled={isRenovando || !onRegistrarRenovacion}
                data-testid="renovacion-confirmar"
              >
                {isRenovando
                  ? "Confirmando…"
                  : "Confirmar renovación y pago"}
              </Button>
            </div>

            {/* Extensión excepcional (motivo obligatorio) */}
            <div
              className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5"
              data-testid="extension-excepcional"
            >
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Extensión excepcional
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Fuera de ciclo. Requiere motivo obligatorio para auditoría.
                </p>
              </div>
              <label className="block text-[11px] font-semibold text-muted-foreground">
                Nueva fecha de vencimiento
                <input
                  type="date"
                  value={extFecha}
                  onChange={(e) => setExtFecha(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground"
                  data-testid="extension-fecha"
                />
              </label>
              <label className="block text-[11px] font-semibold text-muted-foreground">
                Motivo (obligatorio)
                <textarea
                  value={extMotivo}
                  onChange={(e) => setExtMotivo(e.target.value)}
                  rows={2}
                  placeholder="Ej.: compensación por lesión / viaje coordinado con el equipo."
                  className="mt-1 w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground"
                  data-testid="extension-motivo"
                  required
                />
              </label>
              <Button
                variant="outline"
                size="default"
                className="min-h-11 w-full text-xs font-semibold"
                onClick={handleExtenderExcepcional}
                disabled={
                  isExtendiendoExc ||
                  !onExtenderExcepcional ||
                  !extFecha ||
                  !extMotivo.trim()
                }
                data-testid="extension-confirmar"
              >
                {isExtendiendoExc
                  ? "Aplicando…"
                  : "Aplicar extensión excepcional"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Atención y Chat GOZS: Responsable Asignado y Transferencia (ADR-004) */}
      <Card data-testid="chat-responsable-panel">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <span>Atención y Chat GOZS (Equipo)</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Canal Institucional
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {chatActivePainAlert && (
                <span
                  className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive"
                  data-testid="student-pain-alert-badge"
                >
                  🚨 Molestia: {chatActivePainAlert.zona || "Articular"}
                </span>
              )}
              <span
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground uppercase"
                data-testid="student-chat-estado"
              >
                {chatConv.estado || "ABIERTA"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Profesor Responsable
              </p>
              <p
                className="mt-1 text-sm font-bold text-foreground flex items-center gap-1.5"
                data-testid="student-chat-responsable"
              >
                <span>{chatConv.responsable_nombre || "Coach Principal"}</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Vínculo RLS en entrenador_alumnos
              </p>
            </div>

            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mensajes en Hilo
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {chatConv.mensajes.length} mensajes
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {chatConv.unreadCount > 0 ? (
                  <span className="text-amber-400 font-bold">
                    {chatConv.unreadCount} no leídos por el staff
                  </span>
                ) : (
                  "Hilo al día"
                )}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-secondary/30 p-3 flex flex-col justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Acceso a Chat
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Interactuar en tiempo real con {alumno.nombre_completo}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-9 w-full text-xs font-semibold"
                onClick={() => {
                  onOpenChat?.();
                  useCoachStudioStore.getState().setChatOpen(true);
                }}
                data-testid="open-student-chat-btn"
              >
                Abrir Chat en Vivo
              </Button>
            </div>
          </div>

          {/* Formulario de Reasignación / Transferencia de Responsable */}
          <div
            className="rounded-lg border border-border/80 bg-card p-3.5 space-y-3"
            data-testid="transferir-responsable-section"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Transferir responsable de conversación (RPC)
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Reasigna el caso a otro profesor del staff y audita el cambio en auditoria_cambios.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Nuevo Responsable
                <select
                  value={transferTargetCoachId}
                  onChange={(e) => setTransferTargetCoachId(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground"
                  data-testid="student-transfer-target-select"
                >
                  {AVAILABLE_COACH_SENDERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.rol})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-semibold text-muted-foreground">
                Motivo de la transferencia
                <input
                  type="text"
                  value={transferMotivo}
                  onChange={(e) => setTransferMotivo(e.target.value)}
                  placeholder="Ej.: Reasignación por rotación de pretemporada"
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground"
                  data-testid="student-transfer-motivo-input"
                />
              </label>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="default"
                size="default"
                className="min-h-11 px-5 text-xs font-semibold"
                onClick={handleTransferirConversacion}
                disabled={isTransferring}
                data-testid="student-transfer-confirm-btn"
              >
                {isTransferring ? "Transfiriendo…" : "Transferir Responsable"}
              </Button>

              {transferSuccess && (
                <span
                  className="text-xs font-semibold text-emerald-400"
                  data-testid="student-transfer-success"
                >
                  ✓ {transferSuccess}
                </span>
              )}
              {transferError && (
                <span
                  className="text-xs font-semibold text-destructive"
                  data-testid="student-transfer-error"
                >
                  ✕ {transferError}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Selector (Pestañas de Planes) */}
      <div
        role="tablist"
        aria-label="Pestañas de la Ficha del Alumno"
        className="flex w-full rounded-lg border border-border bg-card p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "rutina_actual"}
          onClick={() => onTabChange("rutina_actual")}
          className={`flex-1 rounded-md py-2.5 text-center text-xs font-semibold transition-all min-h-11 ${
            activeTab === "rutina_actual"
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Rutina Actual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "historial_rutinas"}
          onClick={() => onTabChange("historial_rutinas")}
          className={`flex-1 rounded-md py-2.5 text-center text-xs font-semibold transition-all min-h-11 ${
            activeTab === "historial_rutinas"
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Historial de Rutinas ({historialPlanes.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "registros_sesiones"}
          onClick={() => onTabChange("registros_sesiones")}
          className={`flex-1 rounded-md py-2.5 text-center text-xs font-semibold transition-all min-h-11 ${
            activeTab === "registros_sesiones"
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="tab-registros-sesiones"
        >
          Registros ({historialCargas?.length ?? 0})
        </button>
      </div>

      {/* TAB 1: Rutina Actual */}
      {activeTab === "rutina_actual" && (
        <div className="space-y-4">
          {rutinaActiva ? (
            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">
                      {rutinaActiva.nombre}
                    </CardTitle>
                    {getPlanBadge(rutinaActiva.estado, rutinaActiva.fecha_fin)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creado el{" "}
                    {new Date(rutinaActiva.created_at).toLocaleDateString(
                      "es-AR",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenHistoricalLoads}
                    className="min-h-11 text-xs font-medium"
                  >
                    Ver Cargas &amp; RPE
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {rutinaActiva.comentarios && (
                  <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Notas del Entrenador:{" "}
                    </span>
                    {rutinaActiva.comentarios}
                  </div>
                )}

                {/* Días y ejercicios */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Estructura del Plan ({currentPlanDias.length} Días)
                  </h4>

                  {currentPlanDias.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin días cargados en este plan.
                    </p>
                  ) : (
                    currentPlanDias.map((dia) => {
                      const ejerciciosDelDia = ejerciciosEnRutina.filter(
                        (er) => er.dia_id === dia.id,
                      );

                      return (
                        <div
                          key={dia.id}
                          className="rounded-lg border border-border bg-background/50 p-4"
                        >
                          <h5 className="text-sm font-semibold text-foreground">
                            {dia.nombre}
                          </h5>

                          <div className="mt-3 divide-y divide-border/40">
                            {ejerciciosDelDia.map((item) => {
                              const ejercicioInfo = ejerciciosCatalogo.find(
                                (e) => e.id === item.ejercicio_id,
                              );

                              return (
                                <div
                                  key={item.id}
                                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs first:pt-0 last:pb-0"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-foreground">
                                        {ejercicioInfo?.nombre ??
                                          "Ejercicio personalizado"}
                                      </span>
                                      {item.es_superserie && (
                                        <Badge
                                          variant="warning"
                                          className="text-[10px]"
                                        >
                                          Superserie G{item.grupo_superserie}
                                        </Badge>
                                      )}
                                    </div>
                                    {item.notas && (
                                      <p className="text-[11px] text-muted-foreground">
                                        {item.notas}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 font-mono text-[11px]">
                                    <span className="rounded bg-secondary px-2 py-1">
                                      {item.series} × {item.repeticiones}
                                    </span>
                                    {item.rpe_objetivo && (
                                      <span className="text-primary font-bold">
                                        RPE {item.rpe_objetivo}
                                      </span>
                                    )}
                                    <span className="text-muted-foreground">
                                      {item.descanso_segundos}s desc.
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  El alumno no tiene una rutina activa actualmente.
                </p>
                <div className="mt-4">
                  <Button
                    variant="default"
                    size="default"
                    onClick={handleClonar}
                    disabled={isCloning}
                    className="min-h-11 text-xs font-semibold"
                  >
                    Clonar última rutina ahora
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: Historial de Rutinas */}
      {activeTab === "historial_rutinas" && (
        <div className="space-y-4">
          {/* Quick Action Bar for Cloning and Extending */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Acciones Rápidas de Planificación
              </h3>
              <p className="text-xs text-muted-foreground">
                Invocación RPC optimista con soporte offline-first.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="default"
                onClick={handleClonar}
                disabled={isCloning}
                className="min-h-11 flex-1 sm:flex-none text-xs font-semibold"
                aria-label="Clonar última rutina"
              >
                {isCloning ? "Clonando..." : "[Clonar última rutina]"}
              </Button>
              <Button
                variant="secondary"
                size="default"
                onClick={handleExtender}
                disabled={isExtending || !rutinaActiva}
                className="min-h-11 flex-1 sm:flex-none text-xs font-semibold"
                aria-label="Extender vigencia"
              >
                {isExtending ? "Extendiendo..." : "[Extender vigencia]"}
              </Button>
            </div>
          </div>

          {/* Registro Histórico de Sustituciones Trazables (ADR-002) */}
          <div className="space-y-3" data-testid="routine-substitutions-history-section">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🔄</span>
                <h3 className="text-sm font-bold text-foreground">
                  Registro de Sustituciones Trazables (ADR-002)
                </h3>
                <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400 font-bold">
                  Inmutabilidad Garantizada
                </Badge>
              </div>
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="aviso-inmutabilidad-sustituciones"
              >
                Sesiones y series completadas previamente permanecen 100% inmutables.
              </p>
            </div>

            {alumnoSustituciones.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-center text-xs text-muted-foreground">
                  No se registran sustituciones de ejercicios en la rutina vigente. Las adaptaciones biomecánicas del profesor quedarán registradas aquí.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {alumnoSustituciones.map((sust) => {
                  const ejOrigen =
                    ejerciciosCatalogo.find((e) => e.id === sust.ejercicio_original_id)?.nombre ||
                    catalogoCompleto.find((e) => e.id === sust.ejercicio_original_id)?.nombre ||
                    "Ejercicio Original";
                  const ejSustituto =
                    ejerciciosCatalogo.find((e) => e.id === sust.ejercicio_sustituto_id)?.nombre ||
                    catalogoCompleto.find((e) => e.id === sust.ejercicio_sustituto_id)?.nombre ||
                    "Ejercicio Sustituto";
                  const fechaSust = new Date(sust.created_at).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <Card
                      key={sust.id}
                      className="border-border/80 bg-secondary/15 hover:border-primary/40 transition-colors"
                      data-testid={`substitution-record-${sust.id}`}
                    >
                      <CardContent className="p-3.5 sm:p-4 text-xs space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap font-bold">
                            <span className="line-through text-muted-foreground">{ejOrigen}</span>
                            <span className="text-primary font-black">→</span>
                            <span className="text-foreground text-sm font-black text-emerald-500">
                              {ejSustituto}
                            </span>
                            <Badge className="bg-primary/20 text-primary border border-primary/30 text-[10px]">
                              Toda la Rutina Vigente
                            </Badge>
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {fechaSust}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] pt-1 border-t border-border/40">
                          <div className="text-muted-foreground">
                            <strong className="text-foreground">Motivo:</strong>{" "}
                            {sust.motivo || "Sustitución biomecánica por molestia"}
                          </div>
                          <div className="text-muted-foreground font-medium">
                            <strong className="text-foreground">Profesor Responsable:</strong>{" "}
                            Coach Principal (Asignado)
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chronological List of All Previous Plans */}
          <div className="space-y-3">
            {historialPlanes.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No se encontraron planes anteriores registrados.
                </CardContent>
              </Card>
            ) : (
              historialPlanes.map((plan, index) => {
                const planDias = dias.filter((d) => d.plan_id === plan.id);
                const fechaCreacion = new Date(plan.created_at).toLocaleDateString(
                  "es-AR",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  },
                );

                return (
                  <Card
                    key={plan.id}
                    className="transition-colors hover:border-primary/40"
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-foreground">
                              {plan.nombre}
                            </h4>
                            {getPlanBadge(plan.estado, plan.fecha_fin)}
                            {index === 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                Más Reciente
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Creado: {fechaCreacion} • {planDias.length} días
                            configurados
                          </p>
                        </div>

                        <div className="text-xs font-mono text-muted-foreground">
                          ID: {plan.id.slice(0, 8)}...
                        </div>
                      </div>

                      {plan.comentarios && (
                        <p className="mt-3 text-xs text-muted-foreground rounded bg-secondary/40 p-2.5">
                          {plan.comentarios}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}
      {/* TAB 3: Registros de Sesiones y Cargas */}
      {activeTab === "registros_sesiones" && (
        <div className="space-y-4" data-testid="panel-registros-sesiones">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Registros de Entrenamiento & Cargas
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sesiones registradas y series ejecutadas con pesos reales
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenHistoricalLoads}
              className="text-xs gap-1.5"
            >
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>Ver Gráficos 1RM</span>
            </Button>
          </div>

          {(!historialCargas || historialCargas.length === 0) ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No hay sesiones de entrenamiento registradas aún para este alumno.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {historialCargas.map((entry, idx) => {
                const fechaStr = new Date(entry.sesion.fecha).toLocaleDateString("es-AR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                return (
                  <Card key={entry.sesion.id || `ses-${idx}`} className="border-border">
                    <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/20">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground capitalize">{fechaStr}</span>
                          {entry.plan?.nombre && (
                            <Badge variant="outline" className="text-[11px] font-normal">
                              {entry.plan.nombre}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                          {Boolean(entry.sesion.duracion_minutos && entry.sesion.duracion_minutos > 0) && (
                            <span>{entry.sesion.duracion_minutos} min</span>
                          )}
                          <span className="font-semibold text-foreground">
                            {entry.sesion.volumen_total_kg.toLocaleString("es-AR")} kg
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {entry.series.map((s, sIdx) => (
                          <div
                            key={s.id || `ser-${sIdx}`}
                            className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2 text-xs"
                          >
                            <span className="font-medium text-foreground truncate max-w-[160px]" title={s.ejercicioNombre}>
                              {s.ejercicioNombre}
                            </span>
                            <div className="flex items-center gap-1.5 font-mono text-muted-foreground shrink-0">
                              <span className="font-semibold text-foreground">
                                {s.peso_kg} kg × {s.reps_hechas}
                              </span>
                              {s.rpe_real ? (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1">
                                  @{s.rpe_real}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DIÁLOGO ACCESIBLE PARA REGISTRAR PAGO (GOZS-247) */}
      <dialog
        ref={dialogoPagoRef}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60 shadow-2xl"
        aria-labelledby="dialog-registrar-pago-titulo"
        data-testid="dialog-registrar-pago"
      >
        <form onSubmit={handleConfirmarRegistroPago} className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <h3 id="dialog-registrar-pago-titulo" className="text-base font-black text-foreground">
              Registrar Pago de Cuota
            </h3>
            <button
              type="button"
              onClick={handleCerrarDialogoPago}
              className="text-muted-foreground hover:text-foreground text-sm font-bold"
              aria-label="Cerrar diálogo"
            >
              ✕
            </button>
          </div>

          <div className="rounded-xl bg-secondary/40 border border-border/60 p-3 text-xs space-y-1">
            <p>
              <span className="font-bold">Alumno:</span> {alumno.nombre_completo}
            </p>
            <p>
              <span className="font-bold">Actividad:</span> {actividadFrecuencia.etiqueta}
            </p>
            <p className="text-muted-foreground text-[11px]">
              Ciclo anclado al día {contratacion.dia_vencimiento} de cada mes.
            </p>
          </div>

          <label className="block space-y-1.5 text-xs font-semibold text-foreground">
            <span>Monto a abonar ($ ARS)</span>
            <input
              type="number"
              required
              min="0"
              step="100"
              value={modalMonto}
              onChange={(e) => setModalMonto(Number(e.target.value) || 0)}
              className="w-full min-h-11 rounded-xl border border-border bg-background p-2.5 text-sm font-bold tabular-nums"
              data-testid="input-monto-pago"
            />
          </label>

          <div className="space-y-1.5 text-xs font-semibold text-foreground">
            <span>Medio de Pago</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModalMedio("TRANSFERENCIA")}
                className={`rounded-xl border p-2.5 text-left transition-all ${
                  modalMedio === "TRANSFERENCIA"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border/80 hover:bg-secondary/40"
                }`}
                data-testid="btn-medio-transferencia"
              >
                <p className="text-xs font-bold text-foreground">Transferencia</p>
                <p className="text-[10px] text-muted-foreground">CBU / MP</p>
              </button>

              <button
                type="button"
                onClick={() => setModalMedio("EFECTIVO")}
                className={`rounded-xl border p-2.5 text-left transition-all ${
                  modalMedio === "EFECTIVO"
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border/80 hover:bg-secondary/40"
                }`}
                data-testid="btn-medio-efectivo"
              >
                <p className="text-xs font-bold text-foreground">Efectivo</p>
                <p className="text-[10px] text-muted-foreground">En gimnasio</p>
              </button>
            </div>
          </div>

          <label className="block space-y-1.5 text-xs font-semibold text-foreground">
            <span>Nota de pago o descuento (opcional)</span>
            <input
              type="text"
              value={modalNota}
              onChange={(e) => setModalNota(e.target.value)}
              placeholder="Ej: Descuento 20% acordado"
              className="w-full min-h-11 rounded-xl border border-border bg-background p-2.5 text-xs"
              data-testid="input-nota-pago"
            />
          </label>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={handleCerrarDialogoPago}
              className="flex-1 min-h-11 text-xs font-semibold"
              data-testid="btn-cancelar-pago"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="default"
              size="default"
              disabled={isRegistrandoPago}
              className="flex-1 min-h-11 text-xs font-bold"
              data-testid="btn-confirmar-pago"
            >
              {isRegistrandoPago ? "Guardando…" : "Confirmar pago"}
            </Button>
          </div>
        </form>
      </dialog>

    </div>
  );
}
