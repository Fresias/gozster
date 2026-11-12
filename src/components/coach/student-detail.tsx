import { type HistoricalLoadEntry, MOCK_HISTORIAL_CARGAS, LUCAS_2_MONTHS_HISTORIAL } from "@/services/coach-mock-data";
import { TrendingUp } from "@/components/athlete/icons";
import {
  ClipboardList,
  Check,
  TriangleAlert,
  X,
  ArrowRightLeft,
  CreditCard,
  FileText,
  Eye,
  MessageSquare,
  Settings,
  LayoutGrid,
  RotateCcw,
  Timer,
  Activity,
  Dumbbell,
} from "@/components/coach/icons";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCoachStudioStore, type CoachStudioTab } from "@/store/use-coach-studio";
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
import { ModalAsignarPlan } from "@/components/coach/modal-asignar-plan";
import {
  IslaTimelineRibbon,
  IslaActivityFeed,
  IslaRoutineWorkbench,
  IslaMetricas1RM,
  IslaSaludAnamnesis,
  IslaAdministrativa,
  type ActivityFeedItem,
} from "@/components/coach/student-detail/islas";
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
  onPreviewAthlete?: (alumno: Perfil) => void;
  onAssignRoutine?: (alumno: Perfil) => void;
  onEditProfile?: (alumno: Perfil) => void;
  onRegisterPayment?: (alumno: Perfil) => void;
  onExportStudentSheet?: (alumno: Perfil) => void;
  headerMenuOpen?: boolean;
  onHeaderMenuOpenChange?: (open: boolean) => void;
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
  onPreviewAthlete,
  onAssignRoutine,
  onEditProfile,
  onRegisterPayment,
  onExportStudentSheet,
  headerMenuOpen,
  onHeaderMenuOpenChange,
}: StudentDetailProps) {
  const [isCloning, setIsCloning] = React.useState(false);
  const [isExtending, setIsExtending] = React.useState(false);

  const handleAsignarRutina = () => {
    if (onAssignRoutine) {
      onAssignRoutine(alumno);
    } else {
      onTabChange("rutina_actual");
    }
  };

  const handleEditarPerfil = () => {
    if (onEditProfile) {
      onEditProfile(alumno);
    }
  };

  const handleRegistrarPago = () => {
    if (onRegisterPayment) {
      onRegisterPayment(alumno);
    } else {
      handleAbrirDialogoPago();
    }
  };

  const handleExportarFicha = () => {
    if (onExportStudentSheet) {
      onExportStudentSheet(alumno);
    } else if (typeof window !== "undefined") {
      window.print();
    }
  };

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

  const demoCuestionarioLucas: AlumnoCuestionarioInicial = React.useMemo(() => ({
    id: "cuestionario-lucas",
    alumno_id: alumno.id,
    objetivo_principal: "Hipertrofia / Ganancia Muscular y Fuerza Base",
    experiencia_previa: "Intermedio (2 años entrenando en sala de musculación)",
    dias_disponibles_semana: 4,
    equipamiento_disponible: "Gimnasio comercial completo (Barras, Mancuernas, Máquinas)",
    molestias_o_lesiones_previas: "Molestia ocasional en hombro anterior derecho en press plano pesado.",
    respuestas_extra: {
      comentarios: "Busco progresar cargas en banca y sentadilla sin comprometer la articulación del hombro.",
      suplementacion: "Creatina monohidrato 5g/día y proteína de suero.",
      cirugias_previas: "Ninguna",
    },
    completado_at: "2026-09-02T15:00:00Z",
    created_at: "2026-09-02T15:00:00Z",
    updated_at: "2026-09-02T15:00:00Z",
  }), [alumno.id]);

  const isLucasStudent = React.useMemo(() => {
    return (
      alumno.nombre_completo.toLowerCase().includes("lucas") ||
      alumno.id.includes("lucas") ||
      alumno.id === "a1111111-1111-4111-8111-111111111101"
    );
  }, [alumno.id, alumno.nombre_completo]);

  const effectiveHistorialCargas = React.useMemo(() => {
    if (historialCargas && historialCargas.length > 0) return historialCargas;
    if (isLucasStudent) {
      return LUCAS_2_MONTHS_HISTORIAL;
    }
    return MOCK_HISTORIAL_CARGAS[alumno.id] ?? [];
  }, [historialCargas, isLucasStudent, alumno.id]);

  // Feed de actividad con datos del alumno (sin eventos de ejemplo): sesiones registradas + dolor reportado
  const activityFeedItems = React.useMemo<ActivityFeedItem[]>(() => {
    const ahora = new Date();
    const inicioDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const etiqueta = (d: Date): Pick<ActivityFeedItem, "fechaGrupo" | "horaOFecha"> => {
      const dias = Math.round((inicioDia(ahora) - inicioDia(d)) / 86_400_000);
      const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
      if (dias <= 0) return { fechaGrupo: "HOY", horaOFecha: `Hoy ${hora}` };
      if (dias === 1) return { fechaGrupo: "AYER", horaOFecha: "Ayer" };
      const dia = d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
      if (dias < 7) return { fechaGrupo: "ESTA SEMANA", horaOFecha: dia.charAt(0).toUpperCase() + dia.slice(1) };
      return {
        fechaGrupo: "ANTERIORES",
        horaOFecha: `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}`,
      };
    };
    const eventos: Array<ActivityFeedItem & { ts: number }> = [];
    (effectiveHistorialCargas ?? []).forEach((entry, idx) => {
      const f = entry?.sesion?.fecha ? new Date(entry.sesion.fecha) : null;
      if (!f || Number.isNaN(f.getTime())) return;
      const top = entry.series?.length ? [...entry.series].sort((a, b) => b.peso_kg - a.peso_kg)[0] : null;
      eventos.push({
        id: `ses-${entry.sesion.id || idx}`,
        tipo: "sesion",
        titulo: "Sesión registrada",
        detalle: top
          ? `${top.ejercicioNombre} ${String(top.peso_kg).replace(".", ",")} kg × ${top.reps_hechas}`
          : `${entry.series?.length ?? 0} series`,
        ...etiqueta(f),
        ts: f.getTime(),
      });
    });
    if (chatActivePainAlert) {
      const f = new Date(chatActivePainAlert.fecha);
      const valida = !Number.isNaN(f.getTime());
      eventos.push({
        id: `dolor-${chatActivePainAlert.id}`,
        tipo: "molestia",
        titulo: "Reportó dolor",
        detalle: [chatActivePainAlert.zona, chatActivePainAlert.ejercicioNombre].filter(Boolean).join(" · "),
        ...(valida ? etiqueta(f) : { fechaGrupo: "HOY" as const, horaOFecha: chatActivePainAlert.fecha }),
        ts: valida ? f.getTime() : ahora.getTime(),
      });
    }
    return eventos
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 6)
      .map(({ ts: _ts, ...e }) => e);
  }, [effectiveHistorialCargas, chatActivePainAlert]);

  const [cuestionario, setCuestionario] = React.useState<AlumnoCuestionarioInicial | null>(
    cuestionarioProp ?? (isLucasStudent ? demoCuestionarioLucas : null),
  );
  const [isUpdatingNivel, setIsUpdatingNivel] = React.useState(false);
  const [errorNivelVista, setErrorNivelVista] = React.useState<string | null>(null);

  const storeSustituciones = useCoachStudioStore((s) => s.sustituciones);
  const catalogoCompleto = useCoachStudioStore((s) => s.ejercicios);
  const openChatForAlumno = useCoachStudioStore((s) => s.openChatForAlumno);
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
        if (!supabase) {
          if (isMounted && isLucasStudent) {
            setCuestionario(demoCuestionarioLucas);
          }
          return;
        }
        const { data, error } = await supabase
          .from("alumno_cuestionario_inicial")
          .select("*")
          .eq("alumno_id", alumno.id)
          .maybeSingle();
        if (!error && data && isMounted) {
          setCuestionario(data as AlumnoCuestionarioInicial);
        } else if (isMounted && isLucasStudent) {
          setCuestionario(demoCuestionarioLucas);
        }
      } catch (e) {
        if (isMounted && isLucasStudent) {
          setCuestionario(demoCuestionarioLucas);
        }
      }
    }
    loadCuestionario();
    return () => {
      isMounted = false;
    };
  }, [alumno.id, cuestionarioProp, isLucasStudent, demoCuestionarioLucas]);

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

  // Multiactividad y asignación de planes (GOZS-362)
  const contratacionesStudio = useCoachStudioStore((s) => s.contrataciones);
  const vincularPlanMembresiaAlumno = useCoachStudioStore((s) => s.vincularPlanMembresiaAlumno);
  const planesCobros = useCobrosStore((s) => s.planes);
  const [modalAsignarPlanAbierto, setModalAsignarPlanAbierto] = React.useState(false);

  const todasContratacionesAlumno = React.useMemo(() => {
    const list = contratacionesStudio.filter(
      (c) => c.alumno_id === alumno.id && c.estado !== "VENCIDA"
    );
    if (list.length > 0) return list;
    return [contratacion];
  }, [contratacionesStudio, alumno.id, contratacion]);

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


  // Canvas State & Persistence v2 (GOZS-395 / Issue #355 / Página 5 PDF)
  const coachId = (alumno as any).entrenador_id || (alumno as any).coach_id || "default";
  const storageKey = `gozster_canvas_layout_${coachId}`;
  const storageKeyV1 = `gozster_canvas_layout_${coachId}`;
  const storageKeyV2 = `gozster_canvas_layout_v2_${coachId}`;

  const [isPersonalizing, setIsPersonalizing] = React.useState(false);
  const isCanvasMode = isPersonalizing;
  const setIsCanvasMode = setIsPersonalizing;

  const [liveAnnouncement, setLiveAnnouncement] = React.useState("");
  const announce = React.useCallback((message: string) => {
    setLiveAnnouncement(message);
  }, []);

  interface LayoutColumns {
    left: string[];
    right: string[];
  }

  const DEFAULT_LAYOUT_COLUMNS_V2: LayoutColumns = {
    left: ["routine_workbench", "metricas_1rm"],
    right: ["salud_anamnesis", "activity_feed", "administracion"],
  };

  const DEFAULT_ISLAND_ORDER = [
    "timeline",
    "routine_workbench",
    "metricas_1rm",
    "salud_anamnesis",
    "activity_feed",
    "administracion",
  ];

  interface CanvasRow {
    id: string;
    items: string[];
    widths?: Record<string, number>;
  }

  const DEFAULT_CANVAS_ROWS: CanvasRow[] = [
    { id: "row-timeline", items: ["timeline"] },
    { id: "row-left", items: ["routine_workbench", "metricas_1rm"] },
    { id: "row-right", items: ["salud_anamnesis", "activity_feed", "administracion"] },
  ];

  const [layoutColumns, setLayoutColumns] = React.useState<LayoutColumns>(DEFAULT_LAYOUT_COLUMNS_V2);

  const canvasRows = React.useMemo<CanvasRow[]>(() => [
    { id: "row-timeline", items: ["timeline"] },
    { id: "row-left", items: layoutColumns.left },
    { id: "row-right", items: layoutColumns.right },
  ], [layoutColumns]);

  const setCanvasRows = React.useCallback((rowsOrUpdater: CanvasRow[] | ((prev: CanvasRow[]) => CanvasRow[])) => {
    if (typeof rowsOrUpdater === "function") {
      const nextRows = rowsOrUpdater(canvasRows);
      const leftRow = nextRows.find((r) => r.id === "row-left" || r.id.includes("left"));
      const rightRow = nextRows.find((r) => r.id === "row-right" || r.id.includes("right"));
      setLayoutColumns({
        left: leftRow ? leftRow.items : DEFAULT_LAYOUT_COLUMNS_V2.left,
        right: rightRow ? rightRow.items : DEFAULT_LAYOUT_COLUMNS_V2.right,
      });
    } else {
      const leftRow = rowsOrUpdater.find((r) => r.id === "row-left" || r.id.includes("left"));
      const rightRow = rowsOrUpdater.find((r) => r.id === "row-right" || r.id.includes("right"));
      setLayoutColumns({
        left: leftRow ? leftRow.items : DEFAULT_LAYOUT_COLUMNS_V2.left,
        right: rightRow ? rightRow.items : DEFAULT_LAYOUT_COLUMNS_V2.right,
      });
    }
  }, [canvasRows]);

  const islandOrder = React.useMemo(
    () => ["timeline", ...layoutColumns.left, ...layoutColumns.right],
    [layoutColumns]
  );


  const [collapsedIslands, setCollapsedIslands] = React.useState<Record<string, boolean>>({
    timeline: false,
    activity_feed: false,
    routine_workbench: false,
    metricas_1rm: false,
    salud_anamnesis: false,
    administracion: false,
  });
  const [visibleIslands, setVisibleIslands] = React.useState<Record<string, boolean>>({
    timeline: true,
    activity_feed: true,
    routine_workbench: true,
    metricas_1rm: true,
    salud_anamnesis: true,
    administracion: true,
  });
  const [isConfigModalOpen, setIsConfigModalOpen] = React.useState(false);
  const [filtroRutinaRegistros, setFiltroRutinaRegistros] = React.useState<"TODAS" | "ACTUAL" | "PASADAS">("TODAS");

  const saveLayoutToStorage = React.useCallback(
    (
      columnsOrRows: LayoutColumns | CanvasRow[],
      collapsed: Record<string, boolean>,
      feedRail: boolean,
      visible?: Record<string, boolean>
    ) => {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          const cols: LayoutColumns = Array.isArray(columnsOrRows)
            ? {
                left: columnsOrRows.find((r) => r.id === "row-left")?.items ?? DEFAULT_LAYOUT_COLUMNS_V2.left,
                right: columnsOrRows.find((r) => r.id === "row-right")?.items ?? DEFAULT_LAYOUT_COLUMNS_V2.right,
              }
            : columnsOrRows;

          localStorage.setItem(
            storageKeyV2,
            JSON.stringify({
              version: 2,
              leftColumn: cols.left,
              rightColumn: cols.right,
              order: ["timeline", ...cols.left, ...cols.right],
              collapsed,
              feedRail,
              visible: visible ?? visibleIslands,
            })
          );
        } catch {
          // Fallback silencioso
        }
      }
    },
    [storageKeyV2, visibleIslands]
  );

  const resetLayout = () => {
    setLayoutColumns(DEFAULT_LAYOUT_COLUMNS_V2);
    setCollapsedIslands({
      timeline: false,
      activity_feed: false,
      routine_workbench: false,
      metricas_1rm: false,
      salud_anamnesis: false,
      administracion: false,
    });
    setVisibleIslands({
      timeline: true,
      activity_feed: true,
      routine_workbench: true,
      metricas_1rm: true,
      salud_anamnesis: true,
      administracion: true,
    });
    setIsFeedRailCollapsed(false);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.removeItem(storageKeyV2);
        localStorage.removeItem(storageKeyV1);
      } catch {}
    }
    announce("Disposición de islas restablecida al layout v2 predeterminado");
  };

  const [isFeedRailCollapsed, setIsFeedRailCollapsed] = React.useState(false);
  const [draggedIslandId, setDraggedIslandId] = React.useState<string | null>(null);
  const [dropTargetIslandId, setDropTargetIslandId] = React.useState<string | null>(null);

  // Carga inicial y migración v1 -> v2 (GOZS-395)
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;

    try {
      // 1. Intentar cargar versión v2
      const savedV2 = localStorage.getItem(storageKeyV2);
      if (savedV2) {
        const parsed = JSON.parse(savedV2);
        if (parsed && typeof parsed === "object") {
          if (Array.isArray(parsed.leftColumn) && Array.isArray(parsed.rightColumn)) {
            setLayoutColumns({
              left: parsed.leftColumn,
              right: parsed.rightColumn,
            });
          }
          if (parsed.collapsed && typeof parsed.collapsed === "object") {
            setCollapsedIslands((prev) => ({ ...prev, ...parsed.collapsed }));
          }
          if (parsed.visible && typeof parsed.visible === "object") {
            setVisibleIslands((prev) => ({ ...prev, ...parsed.visible }));
          }
          if (typeof parsed.feedRail === "boolean") {
            setIsFeedRailCollapsed(parsed.feedRail);
          }
          return;
        }
      }

      // 2. Si no hay v2, verificar si existe clave previa v1 en localStorage
      const savedV1 = localStorage.getItem(storageKeyV1);
      if (savedV1) {
        // Descartar de forma segura la configuración v1 y aplicar layout default v2
        try {
          localStorage.removeItem(storageKeyV1);
        } catch {}
        setLayoutColumns(DEFAULT_LAYOUT_COLUMNS_V2);
        try {
          localStorage.setItem(
            storageKeyV2,
            JSON.stringify({
              version: 2,
              leftColumn: DEFAULT_LAYOUT_COLUMNS_V2.left,
              rightColumn: DEFAULT_LAYOUT_COLUMNS_V2.right,
              order: DEFAULT_ISLAND_ORDER,
              collapsed: {
                timeline: false,
                activity_feed: false,
                routine_workbench: false,
                metricas_1rm: false,
                salud_anamnesis: false,
                administracion: false,
              },
              visible: {
                timeline: true,
                activity_feed: true,
                routine_workbench: true,
                metricas_1rm: true,
                salud_anamnesis: true,
                administracion: true,
              },
              feedRail: false,
            })
          );
        } catch {}
      } else {
        // Inicialización fresca default v2
        setLayoutColumns(DEFAULT_LAYOUT_COLUMNS_V2);
      }
    } catch {
      // Fallback seguro ante fallos de parseo
      setLayoutColumns(DEFAULT_LAYOUT_COLUMNS_V2);
    }
  }, [storageKeyV1, storageKeyV2]);

  const moveIslandUp = (id: string) => {
    if (id === "timeline") return;
    setLayoutColumns((prev) => {
      if (prev.left.includes(id)) {
        const idx = prev.left.indexOf(id);
        if (idx > 0) {
          const nextLeft = [...prev.left];
          const temp = nextLeft[idx - 1]!;
          nextLeft[idx - 1] = nextLeft[idx]!;
          nextLeft[idx] = temp;
          const next = { ...prev, left: nextLeft };
          saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
          announce(`Isla ${id} movida hacia arriba`);
          return next;
        }
        return prev;
      }
      if (prev.right.includes(id)) {
        const idx = prev.right.indexOf(id);
        if (idx > 0) {
          const nextRight = [...prev.right];
          const temp = nextRight[idx - 1]!;
          nextRight[idx - 1] = nextRight[idx]!;
          nextRight[idx] = temp;
          const next = { ...prev, right: nextRight };
          saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
          announce(`Isla ${id} movida hacia arriba`);
          return next;
        }
        return prev;
      }
      return prev;
    });
  };

  const moveIslandDown = (id: string) => {
    setLayoutColumns((prev) => {
      if (prev.left.includes(id)) {
        const idx = prev.left.indexOf(id);
        if (idx < prev.left.length - 1) {
          const nextLeft = [...prev.left];
          const temp = nextLeft[idx + 1]!;
          nextLeft[idx + 1] = nextLeft[idx]!;
          nextLeft[idx] = temp;
          const next = { ...prev, left: nextLeft };
          saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
          announce(`Isla ${id} movida hacia abajo`);
          return next;
        }
        return prev;
      }
      if (prev.right.includes(id)) {
        const idx = prev.right.indexOf(id);
        if (idx < prev.right.length - 1) {
          const nextRight = [...prev.right];
          const temp = nextRight[idx + 1]!;
          nextRight[idx + 1] = nextRight[idx]!;
          nextRight[idx] = temp;
          const next = { ...prev, right: nextRight };
          saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
          announce(`Isla ${id} movida hacia abajo`);
          return next;
        }
        return prev;
      }
      return prev;
    });
  };

  const moveIslandLeft = (id: string) => {
    setLayoutColumns((prev) => {
      if (prev.right.includes(id)) {
        const nextRight = prev.right.filter((it) => it !== id);
        const nextLeft = [...prev.left, id];
        const next = { left: nextLeft, right: nextRight };
        saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
        announce(`Isla ${id} movida a la columna izquierda`);
        return next;
      }
      return prev;
    });
  };

  const moveIslandRight = (id: string) => {
    setLayoutColumns((prev) => {
      if (prev.left.includes(id)) {
        const nextLeft = prev.left.filter((it) => it !== id);
        const nextRight = [...prev.right, id];
        const next = { left: nextLeft, right: nextRight };
        saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
        announce(`Isla ${id} movida a la columna derecha`);
        return next;
      }
      return prev;
    });
  };

  const separateIslandToOwnRow = (id: string) => {
    announce(`Isla ${id} expandida a ancho completo`);
  };

  const resizeIslandWidth = (id: string, delta: number) => {
    // Soporte para fractional units / minmax en filas adaptables
  };

  const toggleIslandVisibility = (id: string) => {
    setVisibleIslands((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveLayoutToStorage(layoutColumns, collapsedIslands, isFeedRailCollapsed, next);
      announce(`Isla ${id} ${next[id] ? "visible" : "oculta"}`);
      return next;
    });
  };

  const toggleCollapseIsland = (id: string) => {
    setCollapsedIslands((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveLayoutToStorage(layoutColumns, next, isFeedRailCollapsed);
      announce(`Isla ${id} ${next[id] ? "colapsada" : "expandida"}`);
      return next;
    });
  };

  const toggleFeedRail = () => {
    setIsFeedRailCollapsed((prev) => {
      const next = !prev;
      saveLayoutToStorage(layoutColumns, collapsedIslands, next);
      announce(`Riel lateral de bitácora ${next ? "colapsado" : "expandido"}`);
      return next;
    });
  };

  const handleDragStart = (id: string) => (e: React.DragEvent) => {
    setDraggedIslandId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetIslandId !== id) {
      setDropTargetIslandId(id);
    }
  };

  const handleDragLeave = (id: string) => () => {
    if (dropTargetIslandId === id) {
      setDropTargetIslandId(null);
    }
  };

  const handleDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = draggedIslandId || e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) {
      setDraggedIslandId(null);
      setDropTargetIslandId(null);
      return;
    }

    setLayoutColumns((prev) => {
      const cleanLeft = prev.left.filter((it) => it !== sourceId);
      const cleanRight = prev.right.filter((it) => it !== sourceId);

      if (cleanLeft.includes(targetId)) {
        const tIdx = cleanLeft.indexOf(targetId);
        const nextLeft = [...cleanLeft];
        nextLeft.splice(tIdx + 1, 0, sourceId);
        const next = { left: nextLeft, right: cleanRight };
        saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
        announce(`Isla ${sourceId} reubicada en columna izquierda`);
        return next;
      }

      if (cleanRight.includes(targetId)) {
        const tIdx = cleanRight.indexOf(targetId);
        const nextRight = [...cleanRight];
        nextRight.splice(tIdx + 1, 0, sourceId);
        const next = { left: cleanLeft, right: nextRight };
        saveLayoutToStorage(next, collapsedIslands, isFeedRailCollapsed);
        announce(`Isla ${sourceId} reubicada en columna derecha`);
        return next;
      }

      return prev;
    });

    setDraggedIslandId(null);
    setDropTargetIslandId(null);
  };

  // Nodos auxiliares para las Islas Modulares (Issue #355)
  const historialPagosNode = (
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
  );

  const adherenciaNode = (
    <AdherenciaCard
        estado={estadoAdherencia}
        data={adherencia}
        onReintentar={() => setRecargaAdherencia((n) => n + 1)}
      />
  );

  const cuestionarioNode = (
    <Card data-testid="coach-cuestionario-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-sm font-bold text-foreground">
                Cuestionario Inicial del Alumno
              </CardTitle>
            </div>
            {cuestionario?.completado_at ? (
              <Badge
                variant="success"
                className="text-xs font-bold inline-flex items-center gap-1"
                data-testid="coach-cuestionario-badge-completado"
              >
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Completado ({formatFecha(cuestionario.completado_at)})
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-xs font-bold text-muted-foreground"
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
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Objetivo Principal
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-objetivo">
                  {cuestionario.objetivo_principal || "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Experiencia Previa
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-experiencia">
                  {cuestionario.experiencia_previa || "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Días por Semana
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-dias">
                  {cuestionario.dias_disponibles_semana ? `${cuestionario.dias_disponibles_semana} días` : "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Equipamiento
                </span>
                <p className="mt-1 text-xs font-semibold text-foreground" data-testid="coach-cuestionario-equipamiento">
                  {cuestionario.equipamiento_disponible || "No especificado"}
                </p>
              </div>
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5 sm:col-span-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Molestias o Lesiones Previas
                </span>
                <p
                  className={`mt-1 text-xs font-medium ${
                    cuestionario.molestias_o_lesiones_previas &&
                    cuestionario.molestias_o_lesiones_previas !== "Ninguna reportada"
                      ? "text-warning font-semibold"
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
                    <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
  );

  const chatPanelNode = (
    <Card data-testid="chat-responsable-panel">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <span>Atención y Chat GOZS (Equipo)</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                Canal Institucional
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {chatActivePainAlert && (
                <span
                  className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive inline-flex items-center gap-1"
                  data-testid="student-pain-alert-badge"
                >
                  <TriangleAlert className="h-3 w-3 inline text-destructive" aria-hidden="true" />
                  Molestia: {chatActivePainAlert.zona || "Articular"}
                </span>
              )}
              <span
                className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground uppercase"
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Profesor Responsable
              </p>
              <p
                className="mt-1 text-sm font-bold text-foreground flex items-center gap-1.5"
                data-testid="student-chat-responsable"
              >
                <span>{chatConv.responsable_nombre || "Coach Principal"}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vínculo RLS en entrenador_alumnos
              </p>
            </div>

            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mensajes en Hilo
              </p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {chatConv.mensajes.length} mensajes
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {chatConv.unreadCount > 0 ? (
                  <span className="text-warning font-bold">
                    {chatConv.unreadCount} no leídos por el staff
                  </span>
                ) : (
                  "Hilo al día"
                )}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-secondary/30 p-3 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Acceso a Chat
                </p>
                <p className="text-xs text-muted-foreground mt-1">
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
                <p className="text-xs text-muted-foreground">
                  Reasigna el caso a otro profesor del staff y audita el cambio en auditoria_cambios.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-muted-foreground">
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

              <label className="text-xs font-semibold text-muted-foreground">
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
                  className="text-xs font-semibold text-success inline-flex items-center gap-1"
                  data-testid="student-transfer-success"
                >
                  <Check className="h-3 w-3 inline" aria-hidden="true" /> {transferSuccess}
                </span>
              )}
              {transferError && (
                <span
                  className="text-xs font-semibold text-destructive inline-flex items-center gap-1"
                  data-testid="student-transfer-error"
                >
                  <X className="h-3 w-3 inline" aria-hidden="true" /> {transferError}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
  );

  const routineTabsNode = (
    <div className="space-y-4">
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
          Registros ({effectiveHistorialCargas.length})
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
                                          className="text-xs"
                                        >
                                          Superserie G{item.grupo_superserie}
                                        </Badge>
                                      )}
                                      {item.tempo_activo && item.tempo && (
                                        <Badge
                                          variant="outline"
                                          className="border-neutral-soft-border text-neutral-soft-foreground text-xs"
                                        >
                                          Tempo {item.tempo}
                                        </Badge>
                                      )}
                                      {item.force_rpe_required && (
                                        <Badge
                                          variant="outline"
                                          className="border-warning-soft-border text-warning-soft-foreground text-xs"
                                        >
                                          RPE Obligatorio
                                        </Badge>
                                      )}
                                    </div>
                                    {item.notas && (
                                      <p className="text-xs text-muted-foreground">
                                        {item.notas}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 font-mono text-xs">
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

          {/* Registro Histórico de Sustituciones Trazables */}
          <div className="space-y-3" data-testid="routine-substitutions-history-section">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-bold text-foreground">
                  Registro de Sustituciones Trazables
                </h3>
                <Badge variant="outline" className="text-xs border-success-soft-border text-success-soft-foreground font-bold">
                  Inmutabilidad Garantizada
                </Badge>
              </div>
              <p
                className="text-xs text-muted-foreground"
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
                            <span className="text-sm font-black text-success">
                              {ejSustituto}
                            </span>
                            <Badge className="bg-primary/20 text-primary border border-primary/30 text-xs">
                              Toda la Rutina Vigente
                            </Badge>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">
                            {fechaSust}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs pt-1 border-t border-border/40">
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
                              <Badge variant="outline" className="text-xs">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Registros de Entrenamiento & Cargas
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sesiones registradas y series ejecutadas con pesos y reps reales (sin sumatorias de tonelaje)
              </p>
            </div>
            <div className="flex items-center gap-2">
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
          </div>

          {/* Filtro de Rutina para explorar sesiones de la rutina actual o pasadas */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Filtro de Rutina:
            </span>
            <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/60 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFiltroRutinaRegistros("TODAS")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filtroRutinaRegistros === "TODAS"
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Todas ({effectiveHistorialCargas.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroRutinaRegistros("ACTUAL")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filtroRutinaRegistros === "ACTUAL"
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Rutina Activa
              </button>
              <button
                type="button"
                onClick={() => setFiltroRutinaRegistros("PASADAS")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filtroRutinaRegistros === "PASADAS"
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Rutinas Pasadas
              </button>
            </div>
          </div>

          {(() => {
            const displayed = effectiveHistorialCargas.filter((entry) => {
              if (filtroRutinaRegistros === "ACTUAL" && rutinaActiva) {
                return entry.plan?.id === rutinaActiva.id || entry.sesion.dia_id?.startsWith("d");
              }
              if (filtroRutinaRegistros === "PASADAS" && rutinaActiva) {
                return entry.plan?.id !== rutinaActiva.id && !entry.sesion.dia_id?.startsWith("d");
              }
              return true;
            });

            if (displayed.length === 0) {
              return (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground text-sm">
                    No hay sesiones registradas para este filtro de rutina.
                  </CardContent>
                </Card>
              );
            }

            return (
              <div className="space-y-3">
                {displayed.map((entry, idx) => {
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
                              <Badge variant="outline" className="text-xs font-normal">
                                {entry.plan.nombre}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                            {Boolean(entry.sesion.duracion_minutos && entry.sesion.duracion_minutos > 0) && (
                              <span>{entry.sesion.duracion_minutos} min</span>
                            )}
                            <span className="font-semibold text-foreground">
                              {entry.series.length} series registradas
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
                                  <Badge variant="secondary" className="text-xs py-0 px-1">
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
            );
          })()}
        </div>
      )}
    </div>
  );

  const suscripcionNode = (
    /* Resumen Comercial y Estado de Pago (GOZS-247) */
    <Card data-testid="ficha-suscripcion-resumen" className="border-primary/25 bg-card shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 flex-1">
              {/* 1. Actividad y frecuencia */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                <p className="text-xs text-muted-foreground" data-testid="ficha-actividad-detalle">
                  {actividadFrecuencia.detalle}
                </p>
              </div>

              {/* 2. Estado de pago (si pagó o no) */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Estado de Pago
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-black border ${
                      estadoPagoInfo.pago
                        ? "bg-success-soft text-success-soft-foreground border-success-soft-border"
                        : estadoPagoInfo.estado === "VENCIDO"
                        ? "bg-danger-soft text-danger-soft-foreground border-danger-soft-border"
                        : "bg-warning-soft text-warning-soft-foreground border-warning-soft-border"
                    }`}
                    data-testid="ficha-estado-pago"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        estadoPagoInfo.pago
                          ? "bg-success"
                          : estadoPagoInfo.estado === "VENCIDO"
                          ? "bg-destructive"
                          : "bg-warning"
                      }`}
                    />
                    {estadoPagoInfo.etiquetaPrincipal} • {estadoPagoInfo.etiquetaDetalle}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {estadoPagoInfo.pago
                    ? "Cuota vigente al día"
                    : estadoPagoInfo.estado === "VENCIDO"
                    ? "Cuota vencida impaga"
                    : "Esperando confirmación de cobro"}
                </p>
              </div>

              {/* 3. Monto de la suscripción */}
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Monto de la Suscripción
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-lg font-black text-foreground tabular-nums"
                    data-testid="ficha-monto-sub"
                  >
                    {montoSuscripcion.formateado}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">/mes</span>
                </div>
                <p className="text-xs text-muted-foreground">
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
              className="mt-3 rounded-lg border border-success-soft-border bg-success-soft p-2.5 text-xs text-success-soft-foreground font-medium"
              data-testid="aviso-pago-exitoso"
            >
              ✓ {avisoPago}
            </div>
          )}
        </CardContent>
      </Card>
  );

  const nivelVistaNode = (
    /* Configuración de Modo de Vista del Alumno (ADR-004: SIMPLE vs TECNICA) */
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
                  className="text-xs font-bold"
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
  );

  const contratacionNode = (
    /* Estado Comercial y Contratación (ADR-001: entidades/estados separados) */
    <Card data-testid="contratacion-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">
            Estado Comercial y Contratación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de Cuenta
              </p>
              <div className="mt-1.5" data-testid="estado-cuenta">
                {getCuentaBadge(estadoCuenta)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estado de Contratación
              </p>
              <div className="mt-1.5" data-testid="estado-contratacion">
                {getContratacionBadge(contratacion.estado)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vencimiento
              </p>
              <p
                className="mt-1 text-sm font-bold text-foreground"
                data-testid="fecha-vencimiento"
              >
                {formatFecha(contratacion.fecha_fin)}
              </p>
              <p className="text-xs text-muted-foreground">
                Día {contratacion.dia_vencimiento} anclado
              </p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

          {/* Cabecera y Acción Rápida de Asignación / Cambio de Plan */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                Planes de Membresía & Multiactividad
                {todasContratacionesAlumno.length > 1 && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-bold">
                    Multiactividad ({todasContratacionesAlumno.length} planes)
                  </Badge>
                )}
              </h4>
              <p className="text-xs text-muted-foreground">
                Membresías activas vinculadas al atleta.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModalAsignarPlanAbierto(true)}
                data-testid="btn-asignar-nuevo-plan"
                className="text-xs font-semibold h-8"
              >
                + Asignar / Cambiar Plan
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModalAsignarPlanAbierto(true)}
                data-testid="btn-asignar-plan"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              >
                Asignar
              </Button>
            </div>
          </div>

          {/* Plan de Membresía y Actividad Presencial (GH #122 / GOZS-362 Multiactividad) */}
          <div className="space-y-3" data-testid="membresia-clases-panel">
            {todasContratacionesAlumno.map((c, idx) => {
              const plan = planesCobros.find((p) => p.id === c.plan_membresia_id);
              const nombrePlan =
                plan?.nombre ??
                (c.plan_membresia_id === "demo-plan-funcional-2x"
                  ? "Funcional 2x semana"
                  : c.plan_membresia_id === "demo-plan-pase-libre"
                  ? "Pase libre Funcional + Boxeo"
                  : c.plan_membresia_id ?? "Plan Presencial");

              const esGratis = c.precio_pactado === 0 || plan?.precio === 0;

              return (
                <div
                  key={c.id || idx}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/70 bg-secondary/20 p-3"
                  data-testid="item-plan-desglose"
                >
                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Plan {todasContratacionesAlumno.length > 1 ? `#${idx + 1}` : "de Membresía"}
                      </p>
                      {esGratis ? (
                        <Badge
                          variant="default"
                          className="bg-neutral-soft text-neutral-soft-foreground border-neutral-soft-border text-xs font-bold"
                          data-testid="badge-corpo-0"
                        >
                          CORPO $0
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs font-bold">
                          {c.precio_pactado ? formatearDinero(c.precio_pactado) : "Membresía"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-bold text-foreground" data-testid="plan-membresia-nombre">
                      {nombrePlan}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="plan-membresia-detalle">
                      {c.tipo_servicio === "ASESORIA_ONLINE" || plan?.actividad_tipo === "RUTINAS"
                        ? "Asesoría Online · Sin límite de clases"
                        : c.plan_membresia_id === "demo-plan-funcional-2x"
                        ? "Límite: 2 clases por semana · $25.000/mes"
                        : c.plan_membresia_id === "demo-plan-pase-libre"
                        ? "Pase libre sin límite semanal · $40.000/mes"
                        : plan?.limite_semanal
                        ? `Límite: ${plan.limite_semanal} clases/sem`
                        : "Pase libre sin límite semanal"}
                    </p>
                    {plan?.notas && (
                      <p className="mt-1 text-xs text-muted-foreground italic" data-testid="plan-membresia-notas">
                        📝 {plan.notas}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Actividad de la Contratación
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground" data-testid="actividad-contratacion">
                      {c.actividad
                        ? c.actividad === "FUNCIONAL"
                          ? "Funcional"
                          : c.actividad === "BOXEO"
                          ? "Boxeo"
                          : c.actividad
                        : c.tipo_servicio === "ASESORIA_ONLINE" || plan?.actividad_tipo === "RUTINAS"
                        ? "Rutinas Online (Asesoría)"
                        : "Funcional + Boxeo (Pase libre)"}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="tipo-servicio-contratacion">
                      {c.tipo_servicio === "ASESORIA_ONLINE" || plan?.actividad_tipo === "RUTINAS"
                        ? "Modalidad Online"
                        : "Modalidad Presencial"}
                    </p>
                  </div>
                </div>
              );
            })}
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
                <p className="text-xs text-muted-foreground">
                  No se corre la fecha: el próximo corte queda el{" "}
                  <strong className="text-foreground">
                    {formatFecha(proximaFechaAnclada)}
                  </strong>{" "}
                  (día {contratacion.dia_vencimiento}).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex-1 min-w-[8rem] text-xs font-semibold text-muted-foreground">
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
                <label className="flex-1 min-w-[8rem] text-xs font-semibold text-muted-foreground">
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
              className="space-y-3 rounded-lg border border-warning-soft-border bg-warning-soft p-3.5"
              data-testid="extension-excepcional"
            >
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Extensión excepcional
                </h4>
                <p className="text-xs text-muted-foreground">
                  Fuera de ciclo. Requiere motivo obligatorio para auditoría.
                </p>
              </div>
              <label className="block text-xs font-semibold text-muted-foreground">
                Nueva fecha de vencimiento
                <input
                  type="date"
                  value={extFecha}
                  onChange={(e) => setExtFecha(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground"
                  data-testid="extension-fecha"
                />
              </label>
              <label className="block text-xs font-semibold text-muted-foreground">
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
  );

  const renderIsland = (islandId: string, index = 0, total = 6) => {
    const isTarget = dropTargetIslandId === islandId && draggedIslandId !== islandId;
    const isCollapsed = !!collapsedIslands[islandId];

    const isTimeline = islandId === "timeline";
    const isLeft = layoutColumns.left.includes(islandId);
    const isRight = layoutColumns.right.includes(islandId);
    const colList = isLeft ? layoutColumns.left : isRight ? layoutColumns.right : ["timeline"];
    const colIndex = colList.indexOf(islandId);

    const isSharedRow = false;
    const currentWidth = isLeft ? 67 : isRight ? 33 : 100;

    const canMoveUp = isTimeline ? false : true;
    const canMoveDown = isTimeline ? true : islandId === "administracion" ? false : true;
    const canMoveLeft = isRight;
    const canMoveRight = isLeft;

    const onMoveUp = () => moveIslandUp(islandId);
    const onMoveDown = () => moveIslandDown(islandId);
    const onMoveLeft = () => moveIslandLeft(islandId);
    const onMoveRight = () => moveIslandRight(islandId);
    const onSeparateRow = () => separateIslandToOwnRow(islandId);
    const onResizeWidth = (delta: number) => resizeIslandWidth(islandId, delta);
    const onHide = () => toggleIslandVisibility(islandId);

    switch (islandId) {
      case "timeline":
        return (
          <IslaTimelineRibbon
            key="timeline"
            historialCargas={effectiveHistorialCargas}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapseIsland("timeline")}
            isCanvasMode={isCanvasMode}
            isDragTarget={isTarget}
            onDragStart={handleDragStart("timeline")}
            onDragOver={handleDragOver("timeline")}
            onDragLeave={handleDragLeave("timeline")}
            onDrop={handleDrop("timeline")}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onSeparateRow={onSeparateRow}
            onResizeWidth={onResizeWidth}
            currentWidth={currentWidth}
            isSharedRow={isSharedRow}
            onHide={onHide}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
          />
        );

      case "activity_feed":
        return (
          <IslaActivityFeed
            key="activity_feed"
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapseIsland("activity_feed")}
            isRailCollapsed={isFeedRailCollapsed}
            onToggleRail={toggleFeedRail}
            items={activityFeedItems}
            isCanvasMode={isCanvasMode}
            isDragTarget={isTarget}
            onDragStart={handleDragStart("activity_feed")}
            onDragOver={handleDragOver("activity_feed")}
            onDragLeave={handleDragLeave("activity_feed")}
            onDrop={handleDrop("activity_feed")}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onSeparateRow={onSeparateRow}
            onResizeWidth={onResizeWidth}
            currentWidth={currentWidth}
            isSharedRow={isSharedRow}
            onHide={onHide}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
          />
        );

      case "routine_workbench":
        return (
          <IslaRoutineWorkbench
            key="routine_workbench"
            rutinaActiva={rutinaActiva}
            dias={dias}
            ejerciciosEnRutina={ejerciciosEnRutina}
            ejerciciosCatalogo={ejerciciosCatalogo}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapseIsland("routine_workbench")}
            isCanvasMode={isCanvasMode}
            isDragTarget={isTarget}
            onDragStart={handleDragStart("routine_workbench")}
            onDragOver={handleDragOver("routine_workbench")}
            onDragLeave={handleDragLeave("routine_workbench")}
            onDrop={handleDrop("routine_workbench")}
            onQuickSwap={
              onQuickSwap && chatActivePainAlert
                ? () => onQuickSwap(chatActivePainAlert)
                : undefined
            }
            activeTab={activeTab}
            onTabChange={onTabChange}
            alumno={alumno}
            alumnoId={alumno.id}
            alumnoNombre={alumno.nombre_completo}
            alertasDolor={chatActivePainAlert ? [chatActivePainAlert] : []}
            historialCargas={effectiveHistorialCargas}
            historialPlanes={historialPlanes}
            onOpenHistoricalLoads={onOpenHistoricalLoads}
            childrenTabs={routineTabsNode}
            registrosNode={
              <div className="space-y-4">
                {/* P06: el heatmap de adherencia vive arriba de la pestaña Registros */}
                {adherenciaNode}
                {routineTabsNode}
              </div>
            }
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onSeparateRow={onSeparateRow}
            onResizeWidth={onResizeWidth}
            currentWidth={currentWidth}
            isSharedRow={isSharedRow}
            onHide={onHide}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
          />
        );

      case "metricas_1rm":
        return (
          <IslaMetricas1RM
            key="metricas_1rm"
            historialCargas={effectiveHistorialCargas}
            pesoCorporalActual={(alumno as any).peso_corporal_kg ?? null}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapseIsland("metricas_1rm")}
            isCanvasMode={isCanvasMode}
            isDragTarget={isTarget}
            onDragStart={handleDragStart("metricas_1rm")}
            onDragOver={handleDragOver("metricas_1rm")}
            onDragLeave={handleDragLeave("metricas_1rm")}
            onDrop={handleDrop("metricas_1rm")}

            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onSeparateRow={onSeparateRow}
            onResizeWidth={onResizeWidth}
            currentWidth={currentWidth}
            isSharedRow={isSharedRow}
            onHide={onHide}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
          />
        );

      case "salud_anamnesis":
        return (
          <IslaSaludAnamnesis
            key="salud_anamnesis"
            alumnoId={alumno.id}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapseIsland("salud_anamnesis")}
            isCanvasMode={isCanvasMode}
            isDragTarget={isTarget}
            onDragStart={handleDragStart("salud_anamnesis")}
            onDragOver={handleDragOver("salud_anamnesis")}
            onDragLeave={handleDragLeave("salud_anamnesis")}
            onDrop={handleDrop("salud_anamnesis")}
            cuestionarioNode={cuestionarioNode}
            painAlertsNode={<StudentPainAlerts alumnoId={alumno.id} onQuickSwap={onQuickSwap} />}
            evaDolorActual={
              chatActivePainAlert
                ? (/agudo/i.test(chatActivePainAlert.detalle) ? 8 : 5)
                : 0
            }
            zonaDolorActual={chatActivePainAlert?.zona || "Ninguna"}
            reporteId={chatActivePainAlert?.id}
            ejercicioNombre={chatActivePainAlert?.ejercicioNombre}
            fechaReporte={chatActivePainAlert?.fecha}
            onQuickSwap={
              onQuickSwap && chatActivePainAlert
                ? () => onQuickSwap(chatActivePainAlert)
                : undefined
            }
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onSeparateRow={onSeparateRow}
            onResizeWidth={onResizeWidth}
            currentWidth={currentWidth}
            isSharedRow={isSharedRow}
            onHide={onHide}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
          />
        );

      case "administracion":
        return (
          <IslaAdministrativa
            key="administracion"
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapseIsland("administracion")}
            isCanvasMode={isCanvasMode}
            isDragTarget={isTarget}
            onDragStart={handleDragStart("administracion")}
            onDragOver={handleDragOver("administracion")}
            onDragLeave={handleDragLeave("administracion")}
            onDrop={handleDrop("administracion")}
            suscripcionNode={suscripcionNode}
            historialPagosNode={historialPagosNode}
            contratacionNode={contratacionNode}
            chatResponsableNode={chatPanelNode}
            nivelVistaNode={nivelVistaNode}
            cuestionarioNode={cuestionarioNode}
            planActivo={cobroItem?.servicioNombre || "Pase libre · Funcional + Boxeo"}
            monto={montoSuscripcion.formateado}
            fechaVencimiento={contratacion?.fecha_fin ? formatFecha(contratacion.fecha_fin) : "26 nov"}
            estadoCobro={estadoPagoInfo.estado}
            detalleCobro={
              estadoPagoInfo.pago
                ? `Pagado por transferencia · vence ${contratacion?.fecha_fin ? formatFecha(contratacion.fecha_fin) : "26 nov"}`
                : estadoPagoInfo.estado === "VENCIDO"
                ? `Cuota vencida · venció ${contratacion?.fecha_fin ? formatFecha(contratacion.fecha_fin) : "el 20 nov"}`
                : `Pendiente de cobro · vence ${contratacion?.fecha_fin ? formatFecha(contratacion.fecha_fin) : "el 26 nov"}`
            }
            onRegistrarPago={handleAbrirDialogoPago}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
            onSeparateRow={onSeparateRow}
            onResizeWidth={onResizeWidth}
            currentWidth={currentWidth}
            isSharedRow={isSharedRow}
            onHide={onHide}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Cabecera de la ficha (objetivo Ficha.html): avatar 48 px, nombre, estado en badges con texto
             y tres acciones (Personalizar · Asignar rutina · Enviar mensaje) + menú ⋯ con lo secundario */}
      <div
        data-testid="student-detail-header"
        className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5"
      >
        <div className="flex min-w-0 items-center gap-4">
          {/* En móvil no hay breadcrumb en la topbar: el regreso vive acá */}
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-9 gap-1.5 text-xs font-medium md:hidden"
          >
            <span>← Volver</span>
          </Button>

          <Avatar className="h-12 w-12 shrink-0" data-testid="student-avatar">
            <AvatarFallback
              className="bg-muted text-foreground font-semibold text-sm"
              aria-label={alumno.nombre_completo}
            >
              {alumno.nombre_completo
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <h2 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
              {alumno.nombre_completo}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-neutral-soft-foreground">
              {getPaymentBadge(alumno.estado_membresia)}
              {chatActivePainAlert && (
                <Badge variant="warning">Dolor en {(chatActivePainAlert.zona || "articulación").toLowerCase()}</Badge>
              )}
              {isOffline && <Badge variant="warning">Offline</Badge>}
              <span className="truncate">
                {alumno.email ?? "Sin email"} · alumno desde{" "}
                {new Date(alumno.created_at).toLocaleDateString("es-AR", {
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Personalizar layout (Modo Canvas) como botón de ícono (D3) */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const next = !isPersonalizing;
              setIsPersonalizing(next);
              announce(next ? "Modo Personalizar activado" : "Modo Personalizar desactivado");
            }}
            className={`h-9 w-9 ${isPersonalizing ? "bg-muted" : ""}`}
            data-testid="btn-modo-canvas"
            data-personalizar="true"
            aria-pressed={isPersonalizing}
            aria-label="Personalizar el orden de las islas"
            title="Personalizar"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAsignarRutina}
            className="h-9 px-3.5 text-sm font-medium"
            data-testid="btn-asignar-rutina"
            aria-label={`Asignar rutina a ${alumno.nombre_completo}`}
          >
            Asignar rutina
          </Button>

          {/* Acción primaria única de la vista */}
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              onOpenChat?.();
              openChatForAlumno(alumno.id);
            }}
            className="h-9 gap-2 px-3.5 text-sm font-medium"
            data-testid="enviar-mensaje-btn"
            aria-label={`Enviar mensaje a ${alumno.nombre_completo}`}
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Enviar mensaje
          </Button>

          {/* Acciones complementarias ⋯ */}
          <DropdownMenu
            open={headerMenuOpen}
            onOpenChange={onHeaderMenuOpenChange}
          >
            <DropdownMenuTrigger
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-transparent text-foreground hover:bg-muted cursor-pointer"
              aria-label={`Más acciones para ${alumno.nombre_completo}`}
              data-testid="student-header-menu-trigger"
            >
              <span aria-hidden="true" className="leading-none text-base">⋯</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={handleEditarPerfil}
                data-testid="student-menu-editar-perfil"
                className="cursor-pointer"
              >
                <span>Editar perfil</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleRegistrarPago}
                data-testid="student-menu-registrar-pago"
                className="cursor-pointer"
              >
                <span>Registrar pago</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onOpenHistoricalLoads?.()}
                data-testid="student-menu-cargas-historicas"
                className="cursor-pointer"
              >
                <span>Cargas históricas</span>
              </DropdownMenuItem>
              {onPreviewAthlete && (
                <DropdownMenuItem
                  onClick={() => onPreviewAthlete(alumno)}
                  data-testid="detail-preview-athlete-btn"
                  className="cursor-pointer"
                >
                  <span>Ver como alumno</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setIsConfigModalOpen(true)}
                data-testid="btn-configurar-islas"
                className="cursor-pointer"
              >
                <span>
                  Configurar islas ({Object.values(visibleIslands).filter(Boolean).length}/6)
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (typeof window !== "undefined") window.open(whatsappUrl, "_blank", "noopener,noreferrer");
                }}
                data-testid="whatsapp-direct-btn"
                className="cursor-pointer"
              >
                <span>Escribir por WhatsApp</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportarFicha}
                data-testid="student-menu-exportar-ficha"
                className="cursor-pointer"
              >
                <span>Exportar ficha</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Región accesible aria-live para anunciar reordenamiento y cambios de personalización */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="student-detail-live-announcer"
      >
        {liveAnnouncement}
      </div>

      {/* Banner de Modo Canvas / Personalizar */}
      {isPersonalizing && (
        <div
          data-testid="banner-modo-canvas"
          className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs text-primary font-medium"
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <strong>Modo Personalizar Activo:</strong> Arrastrá las islas mediante el drag handle (⠿) para reordenar la grilla modular o usá [-] para colapsar. La disposición se persiste automáticamente en localStorage (Modo Canvas).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetLayout}
              className="h-7 text-xs font-semibold"
            >
              Restablecer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsPersonalizing(false);
                announce("Modo Personalizar desactivado");
              }}
              className="h-7 text-xs font-bold text-primary hover:bg-primary/20"
            >
              Listo
            </Button>
          </div>
        </div>
      )}

      {/* Canvas Modular de Islas Autónomas y Colapsables con Layout en 2 Columnas Balanceado (GOZS-395) */}
      <div
        data-testid="student-detail-modular-canvas"
        className="space-y-4 pt-2 max-w-full overflow-x-hidden"
      >
        {/* Upper Timeline Ribbon (Sesiones) */}
        {visibleIslands["timeline"] !== false && (
          <div data-testid="canvas-row-timeline" className="w-full min-w-0">
            {renderIsland("timeline", 0, 1)}
          </div>
        )}

        {/* Grilla balanceada en 2 columnas en desktop (≥ 960px) y 1 columna en < 960px */}
        <div
          data-testid="student-detail-grid-columns"
          className="grid grid-cols-1 min-[960px]:grid-cols-12 gap-4 items-start w-full max-w-full overflow-x-hidden"
        >
          {/* Columna Izquierda (≥ 960px: 8 cols): Rutina y Fuerza */}
          <div
            data-testid="canvas-column-left"
            className="space-y-4 w-full min-w-0 col-span-1 min-[960px]:col-span-8"
          >
            {layoutColumns.left
              .filter((id) => visibleIslands[id] !== false)
              .map((id, index, arr) => (
                <div key={id} className="w-full min-w-0">
                  {renderIsland(id, index, arr.length)}
                </div>
              ))}
          </div>

          {/* Columna Derecha (≥ 960px: 4 cols): Salud, Actividad y Membresía */}
          <div
            data-testid="canvas-column-right"
            className="space-y-4 w-full min-w-0 col-span-1 min-[960px]:col-span-4"
          >
            {layoutColumns.right
              .filter((id) => visibleIslands[id] !== false)
              .map((id, index, arr) => (
                <div key={id} className="w-full min-w-0">
                  {renderIsland(id, index, arr.length)}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Diálogo de Configuración de Visibilidad de Islas en el Canvas */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            data-testid="dialog-configurar-islas"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 text-foreground"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">⚙️</span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Personalizar Islas del Canvas
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Elegí qué componentes ver u ocultar en la vista del alumno.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2">
              {[
                { id: "timeline", title: "Sesiones", desc: "Cronología de sesiones y cargas pico", icon: <Timer className="h-4 w-4 text-primary" aria-hidden="true" /> },
                { id: "activity_feed", title: "Bitácora Omnicanal (Feed)", desc: "Eventos, cobros y mensajes en vivo", icon: <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" /> },
                { id: "routine_workbench", title: "Workbench de Rutinas", desc: "Rutina activa, pasadas y registros", icon: <Dumbbell className="h-4 w-4 text-primary" aria-hidden="true" /> },
                { id: "metricas_1rm", title: "Telemetría de Cargas & 1RM", desc: "Sobrecarga progresiva y peso corporal", icon: <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" /> },
                { id: "salud_anamnesis", title: "Clínica & Dolor", desc: "Anamnesis, molestias y bitácora del coach", icon: <Activity className="h-4 w-4 text-primary" aria-hidden="true" /> },
                { id: "administracion", title: "Gestión Administrativa", desc: "Cuotas, historial de pagos y staff", icon: <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" /> },
              ].map((item) => {
                const isChecked = visibleIslands[item.id] !== false;
                return (
                  <label
                    key={item.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      isChecked ? "border-primary/40 bg-primary/5" : "border-border/60 bg-muted/20 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center justify-center w-5 h-5">{item.icon}</span>
                      <div>
                        <span className="text-xs font-bold text-foreground block">
                          {item.title}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {item.desc}
                        </span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleIslandVisibility(item.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const allVisible = {
                    timeline: true,
                    activity_feed: true,
                    routine_workbench: true,
                    metricas_1rm: true,
                    salud_anamnesis: true,
                    administracion: true,
                  };
                  setVisibleIslands(allVisible);
                  saveLayoutToStorage(canvasRows, collapsedIslands, isFeedRailCollapsed, allVisible);
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Mostrar Todas
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setIsConfigModalOpen(false)}
                className="text-xs font-bold cursor-pointer"
              >
                Listo
              </Button>
            </div>
          </div>
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
            <p className="text-muted-foreground text-xs">
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
                <p className="text-xs text-muted-foreground">CBU / MP</p>
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
                <p className="text-xs text-muted-foreground">En gimnasio</p>
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

      {/* Modal Asignar / Cambiar Plan de Membresía (Multiactividad GOZS-362) */}
      <ModalAsignarPlan
        abierto={modalAsignarPlanAbierto}
        onCerrar={() => setModalAsignarPlanAbierto(false)}
        alumnoId={alumno.id}
        alumnoNombre={alumno.nombre_completo}
        planesDisponibles={planesCobros.filter((p) => p.activo !== false)}
        tienePlanesActivos={todasContratacionesAlumno.length > 0}
        onConfirmar={async ({ alumnoId, planId, esAdicional, notas }) => {
          await vincularPlanMembresiaAlumno({
            alumnoId,
            planId,
            esAdicional,
            notas,
          });
          setModalAsignarPlanAbierto(false);
        }}
      />
    </div>
  );
}
