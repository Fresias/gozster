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
import type { CoachStudioTab } from "@/store/use-coach-studio";
import { supabase } from "@/lib/supabase/client";
import {
  calculateStudentHealthScore,
  generateWhatsAppReactivationUrl,
} from "@/lib/strength-metrics";
import {
  ESTADO_CONTRATACION_LABEL,
  computeAnchoredRenewalDate,
  derivarContratacionDesdePerfil,
} from "@/lib/contrataciones";

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
  onActualizarNivelVista?: (
    alumnoId: string,
    nivel: NivelVistaAlumno,
  ) => Promise<unknown>;
  cuestionario?: AlumnoCuestionarioInicial | null;
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
  onOpenHistoricalLoads,
  onClonarUltimaRutina,
  onExtenderVigencia,
  isOffline,
  contratacion: contratacionProp,
  onRegistrarRenovacion,
  onExtenderExcepcional,
  onActualizarNivelVista,
  cuestionario: cuestionarioProp,
}: StudentDetailProps) {
  const [isCloning, setIsCloning] = React.useState(false);
  const [isExtending, setIsExtending] = React.useState(false);

  const [nivelVista, setNivelVista] = React.useState<NivelVistaAlumno>(
    alumno.nivel_vista_alumno ?? "SIMPLE",
  );
  const [isUpdatingNivel, setIsUpdatingNivel] = React.useState(false);
  const [cuestionario, setCuestionario] = React.useState<AlumnoCuestionarioInicial | null>(
    cuestionarioProp ?? null,
  );

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

  const handleToggleNivelVista = async (nuevoNivel: NivelVistaAlumno) => {
    if (nuevoNivel === nivelVista) return;
    setNivelVista(nuevoNivel);
    setIsUpdatingNivel(true);
    try {
      if (onActualizarNivelVista) {
        await onActualizarNivelVista(alumno.id, nuevoNivel);
      } else if (supabase) {
        await supabase
          .from("perfiles")
          .update({ nivel_vista_alumno: nuevoNivel })
          .eq("id", alumno.id);
      }
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

  const getPlanBadge = (estado: PlanEntrenamiento["estado"]) => {
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
  const contratacion = React.useMemo(
    () => contratacionProp ?? derivarContratacionDesdePerfil(alumno),
    [contratacionProp, alumno],
  );

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

      {/* Configuración de Modo de Vista del Alumno (ADR-004: SIMPLE vs TECNICA) */}
      <Card data-testid="coach-nivel-vista-card">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  Modo de Vista del Alumno (Athlete App)
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
                  getPlanBadge(rutinaActiva.estado)
                ) : (
                  <Badge variant="outline">Sin rutina</Badge>
                )}
              </div>
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
                    {getPlanBadge(rutinaActiva.estado)}
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
                            {getPlanBadge(plan.estado)}
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
    </div>
  );
}
