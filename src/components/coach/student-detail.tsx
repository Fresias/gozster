import * as React from "react";
import type {
  Contratacion,
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  EstadoContratacion,
  EstadoCuenta,
  MedioPago,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachStudioTab } from "@/store/use-coach-studio";
import {
  calculateStudentHealthScore,
  generateWhatsAppReactivationUrl,
} from "@/lib/strength-metrics";
import {
  ESTADO_CONTRATACION_LABEL,
  computeAnchoredRenewalDate,
  derivarContratacionDesdePerfil,
} from "@/lib/contrataciones";
import {
  AVAILABLE_COACH_SENDERS,
  STAFF_COACH_FELIX,
  useChatStore,
} from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";

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
  onOpenChat?: () => void;
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
  onOpenChat,
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
