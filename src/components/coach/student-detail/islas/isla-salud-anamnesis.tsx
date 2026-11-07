import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import {
  Activity,
  Check,
  TriangleAlert,
  ClipboardList,
  ArrowRightLeft,
  FileText,
  ChevronDown,
  ChevronUp,
} from "@/components/coach/icons";
import {
  actualizarEstadoDolor,
  derivarSeveridadDesdeEva,
  nivelDesdeEva,
  type DolorActivo,
  type EstadoDolor,
  type NivelDolor,
  type SeveridadDolor,
} from "@/lib/dolor";
import { cn } from "@/lib/utils";

export interface AnamnesisData {
  objetivo?: string;
  frecuencia?: string;
  molestiaPrevia?: string;
  cirugias?: string;
}

export interface IslaSaludAnamnesisProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  cuestionarioNode?: React.ReactNode;
  painAlertsNode?: React.ReactNode;
  evaDolorActual?: number;
  zonaDolorActual?: string;
  ejercicioNombre?: string;
  fechaReporte?: string;
  reporteId?: string;
  dolorActivo?: (Partial<DolorActivo> & { notaCoach?: string | null }) | null;
  notaCoach?: string | null;
  estadoInicial?: EstadoDolor;
  onQuickSwap?: () => void;
  alumnoId?: string;
  anamnesisData?: AnamnesisData;
  onEstadoChange?: (nuevoEstado: EstadoDolor) => Promise<boolean | void> | void;
  onSaveNota?: (nota: string) => Promise<void> | void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onSeparateRow?: () => void;
  onResizeWidth?: (delta: number) => void;
  currentWidth?: number;
  isSharedRow?: boolean;
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

const SEGMENTED_OPTIONS = [
  { value: "PENDIENTE" as EstadoDolor, label: "Pendiente" },
  { value: "ATENDIDO" as EstadoDolor, label: <span title="Atendido">Atendida</span> },
  { value: "RESUELTO" as EstadoDolor, label: "Resuelta" },
];

export function IslaSaludAnamnesis({
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  cuestionarioNode,
  painAlertsNode: _painAlertsNode,
  evaDolorActual = 3,
  zonaDolorActual = "Hombro derecho",
  ejercicioNombre,
  fechaReporte,
  reporteId,
  dolorActivo,
  notaCoach,
  estadoInicial,
  onQuickSwap,
  alumnoId = "demo-alumno-lucas",
  anamnesisData,
  onEstadoChange,
  onSaveNota,
  onMoveUp,
  onMoveDown,
  onMoveLeft,
  onMoveRight,
  onSeparateRow,
  onResizeWidth,
  currentWidth,
  isSharedRow,
  onHide,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
}: IslaSaludAnamnesisProps) {
  const [anamnesisCollapsed, setAnamnesisCollapsed] = React.useState(true);

  const initialNota = React.useMemo(() => {
    const raw =
      dolorActivo?.notas_profesor ??
      dolorActivo?.notaCoach ??
      notaCoach ??
      "";
    return typeof raw === "string" ? raw : "";
  }, [dolorActivo?.notas_profesor, dolorActivo?.notaCoach, notaCoach]);

  const [coachLog, setCoachLog] = React.useState<string>(() => initialNota);
  const coachLogRef = React.useRef<string>(initialNota);
  const lastSavedNotaRef = React.useRef<string>(initialNota.trim());
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const initialEstado: EstadoDolor = React.useMemo(() => {
    if (dolorActivo?.estado) return dolorActivo.estado;
    if (estadoInicial) return estadoInicial;
    return "PENDIENTE";
  }, [dolorActivo?.estado, estadoInicial]);

  const [estado, setEstado] = React.useState<EstadoDolor>(() => initialEstado);
  const estadoRef = React.useRef<EstadoDolor>(initialEstado);

  React.useEffect(() => {
    coachLogRef.current = initialNota;
    lastSavedNotaRef.current = initialNota.trim();
    setCoachLog(initialNota);
  }, [dolorActivo?.id, initialNota]);

  React.useEffect(() => {
    if (dolorActivo?.estado) {
      estadoRef.current = dolorActivo.estado;
      setEstado(dolorActivo.estado);
    } else if (estadoInicial) {
      estadoRef.current = estadoInicial;
      setEstado(estadoInicial);
    }
  }, [dolorActivo?.estado, estadoInicial]);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const savedEstado = localStorage.getItem(`gozster_coach_pain_estado_${alumnoId}`);
        if (savedEstado && ["PENDIENTE", "ATENDIDO", "RESUELTO"].includes(savedEstado)) {
          estadoRef.current = savedEstado as EstadoDolor;
          setEstado(savedEstado as EstadoDolor);
        } else {
          const savedStatus = localStorage.getItem(`gozster_coach_pain_status_${alumnoId}`);
          if (savedStatus === "true") {
            estadoRef.current = "ATENDIDO";
            setEstado("ATENDIDO");
          }
        }
      } catch {}
    }
  }, [alumnoId]);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const hasActiveDolor = React.useMemo(() => {
    if (dolorActivo === null) return false;
    if (dolorActivo && dolorActivo.eva !== undefined) return dolorActivo.eva > 0;
    if (evaDolorActual !== undefined) {
      return (
        evaDolorActual > 0 &&
        Boolean(zonaDolorActual) &&
        zonaDolorActual.toLowerCase() !== "ninguna"
      );
    }
    return Boolean(zonaDolorActual && zonaDolorActual.toLowerCase() !== "ninguna");
  }, [dolorActivo, evaDolorActual, zonaDolorActual]);

  const effectiveEva = React.useMemo(() => {
    if (dolorActivo?.eva !== undefined) return dolorActivo.eva;
    if (evaDolorActual !== undefined) return evaDolorActual;
    return 5;
  }, [dolorActivo?.eva, evaDolorActual]);

  const effectiveZona = React.useMemo(() => {
    if (dolorActivo?.zona_articular) return dolorActivo.zona_articular;
    if (zonaDolorActual && zonaDolorActual !== "Ninguna") return zonaDolorActual;
    return "Hombro anterior";
  }, [dolorActivo?.zona_articular, zonaDolorActual]);

  const effectiveEjercicio = React.useMemo(() => {
    return (
      dolorActivo?.ejercicio_nombre ||
      ejercicioNombre ||
      "Press de banca plano, serie 2"
    );
  }, [dolorActivo?.ejercicio_nombre, ejercicioNombre]);

  const effectiveFecha = React.useMemo(() => {
    return dolorActivo?.fecha_reporte || fechaReporte || "ayer 18:30";
  }, [dolorActivo?.fecha_reporte, fechaReporte]);

  const activeReporteId = React.useMemo(() => {
    return dolorActivo?.id || reporteId || `reporte-${alumnoId}`;
  }, [dolorActivo?.id, reporteId, alumnoId]);

  const _nivel: NivelDolor = nivelDesdeEva(effectiveEva);
  const severidad: SeveridadDolor = derivarSeveridadDesdeEva(effectiveEva);
  const severidadLabel =
    severidad === "AGUDO" ? "Agudo" : severidad === "MODERADO" ? "Moderado" : "Leve";

  const alertVariant: "destructive" | "warning" | "default" | "info" = React.useMemo(() => {
    if (!hasActiveDolor) return "default";
    if (effectiveEva >= 7) return "destructive";
    if (effectiveEva >= 4) return "warning";
    return "info";
  }, [hasActiveDolor, effectiveEva]);

  const handleEstadoChange = async (nextVal: EstadoDolor) => {
    if (nextVal === estadoRef.current) return;

    const prevEstado = estadoRef.current;
    estadoRef.current = nextVal;
    setEstado(nextVal);
    setErrorMsg(null);
    setIsUpdating(true);

    const trimmedNota = coachLogRef.current.trim();
    const hasNewUnsavedNota =
      trimmedNota !== "" && trimmedNota !== lastSavedNotaRef.current;
    const notaToSend: string | null = hasNewUnsavedNota ? trimmedNota : null;
    const prevSavedNota = lastSavedNotaRef.current;

    if (hasNewUnsavedNota) {
      lastSavedNotaRef.current = trimmedNota;
    }

    try {
      let success = true;
      let errMessage = "";

      const res = await actualizarEstadoDolor({
        reporteId: activeReporteId,
        nuevoEstado: nextVal,
        nota: notaToSend,
      });
      if (!res.ok) {
        success = false;
        errMessage = res.error || "No se pudo guardar. Reintentá.";
      } else if (onEstadoChange) {
        const cbRes = await onEstadoChange(nextVal);
        if (cbRes === false) {
          success = false;
          errMessage = "Error de red al actualizar estado";
        }
      }

      if (!success) {
        estadoRef.current = prevEstado;
        setEstado(prevEstado);
        if (hasNewUnsavedNota) {
          lastSavedNotaRef.current = prevSavedNota;
        }
        setErrorMsg(errMessage || "Error de red al actualizar el estado de molestia.");
      } else {
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            localStorage.setItem(`gozster_coach_pain_estado_${alumnoId}`, nextVal);
            localStorage.setItem(
              `gozster_coach_pain_status_${alumnoId}`,
              String(nextVal === "RESUELTO")
            );
          } catch {}
        }
      }
    } catch (err: any) {
      estadoRef.current = prevEstado;
      setEstado(prevEstado);
      if (hasNewUnsavedNota) {
        lastSavedNotaRef.current = prevSavedNota;
      }
      setErrorMsg(err?.message || "Error inesperado de red al conectar con el servidor.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCoachLogChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    coachLogRef.current = val;
    setCoachLog(val);
  };

  const handleSaveCoachLog = async () => {
    const trimmedNota = coachLogRef.current.trim();
    if (!trimmedNota || trimmedNota === lastSavedNotaRef.current) {
      return;
    }

    const prevSavedNota = lastSavedNotaRef.current;
    lastSavedNotaRef.current = trimmedNota;
    setErrorMsg(null);

    try {
      if (onSaveNota) {
        await onSaveNota(trimmedNota);
      } else {
        const res = await actualizarEstadoDolor({
          reporteId: activeReporteId,
          nuevoEstado: estadoRef.current,
          nota: trimmedNota,
        });
        if (!res.ok) {
          lastSavedNotaRef.current = prevSavedNota;
          setErrorMsg(res.error || "No se pudo guardar. Reintentá.");
          return;
        }
      }

      setSaveSuccess(true);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
    } catch (err: any) {
      lastSavedNotaRef.current = prevSavedNota;
      setErrorMsg(err?.message || "No se pudo guardar. Reintentá.");
    }
  };

  const isPainResolved = estado === "RESUELTO";

  return (
    <IslaCardShell
      id="salud_anamnesis"
      dataTestId="isla-salud-anamnesis"
      title="Clínica, Anamnesis &amp; Red Flags"
      icon={<Activity className="h-4 w-4 text-primary" aria-label="Salud" />}
      badge={
        hasActiveDolor ? (
          <Badge
            variant="outline"
            data-testid="red-flags-alert"
            className={cn(
              "text-[10px] font-bold border",
              estado === "RESUELTO"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : estado === "ATENDIDO"
                ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                : severidad === "AGUDO"
                ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                : "bg-amber-500/20 text-amber-400 border-amber-500/40"
            )}
          >
            {estado === "RESUELTO" ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Resuelta
              </span>
            ) : estado === "ATENDIDO" ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Atendida
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <TriangleAlert className="h-3 w-3 inline" aria-hidden="true" /> Molestia:{" "}
                {effectiveZona}
              </span>
            )}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Sin dolores activos
          </Badge>
        )
      }
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      isCanvasMode={isCanvasMode}
      isDragTarget={isDragTarget}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
      compactSummary={
        <div className="flex items-center justify-between text-xs">
          <span>
            Clínica: {hasActiveDolor ? effectiveZona : "Sin dolor activo"} •{" "}
            {estado === "RESUELTO"
              ? "Resuelta"
              : estado === "ATENDIDO"
              ? "Atendida"
              : "Pendiente"}{" "}
            • Anamnesis revisada
          </span>
        </div>
      }
    >
      <div className="p-3 sm:p-4 space-y-4">
        {/* Alert Semántico Unificado según EVA 0-10 */}
        {hasActiveDolor ? (
          <Alert
            variant={alertVariant}
            data-testid="alert-salud"
            className="p-3.5 space-y-2.5 rounded-xl border"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {effectiveEva >= 7 ? (
                  <TriangleAlert
                    className="h-4 w-4 text-destructive shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <TriangleAlert
                    className="h-4 w-4 text-amber-500 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5",
                    effectiveEva >= 7
                      ? "border-destructive/40 bg-destructive/15 text-destructive"
                      : effectiveEva >= 4
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
                      : "border-sky-500/40 bg-sky-500/15 text-sky-500"
                  )}
                >
                  {severidadLabel}
                </Badge>
                <span className="font-semibold text-foreground text-xs">
                  {effectiveZona}
                </span>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  EVA {effectiveEva}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5",
                    estado === "RESUELTO"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                      : estado === "ATENDIDO"
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-500"
                  )}
                >
                  {estado === "RESUELTO"
                    ? "Resuelta"
                    : estado === "ATENDIDO"
                    ? "Atendida"
                    : "Pendiente"}
                </Badge>
              </div>
            </div>

            <AlertTitle className="sr-only">Reporte de Molestia en Ejercicio</AlertTitle>

            <AlertDescription className="text-xs text-muted-foreground">
              <div className="text-[11px] text-muted-foreground">
                {effectiveEjercicio} · {effectiveFecha}
              </div>
            </AlertDescription>

            {/* Segmented Control de Intervención & Acción Cambiar Ejercicio */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5">
              <Segmented<EstadoDolor>
                value={estado}
                onChange={handleEstadoChange}
                options={SEGMENTED_OPTIONS}
                size="sm"
                aria-label="Estado de intervención"
                disabled={isUpdating}
              />

              {onQuickSwap && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onQuickSwap}
                  className="h-7 text-xs font-semibold text-rose-500 border-rose-500/40 hover:bg-rose-500/10 cursor-pointer"
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1 inline" aria-hidden="true" />
                  Cambiar ejercicio
                </Button>
              )}
            </div>

            {errorMsg && (
              <div
                role="alert"
                data-testid="salud-error-alert"
                className="mt-2 text-xs text-destructive font-medium bg-destructive/10 border border-destructive/25 p-2 rounded-lg flex items-center justify-between gap-2"
              >
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-[10px] underline hover:text-foreground cursor-pointer"
                >
                  Descartar
                </button>
              </div>
            )}
          </Alert>
        ) : (
          <Alert
            variant="default"
            data-testid="alert-salud-empty"
            className="border-border/70 bg-card text-muted-foreground p-3.5 rounded-xl"
          >
            <AlertDescription className="text-xs text-muted-foreground flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
              <span>Sin dolores activos.</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Bitácora / Nota de Intervención con único mecanismo de guardado al salir del foco (onBlur) */}
        <div
          data-testid="nota-intervencion-block"
          className="rounded-lg border border-border/80 bg-secondary/15 p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <label
              htmlFor={`nota-intervencion-${alumnoId}`}
              className="flex items-center gap-1.5 text-xs font-bold text-foreground cursor-pointer"
            >
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Nota de intervención</span>
              <span className="sr-only">Bitácora de Intervención del Entrenador</span>
            </label>
            {saveSuccess && (
              <span
                data-testid="nota-intervencion-guardado"
                className="text-xs font-semibold text-emerald-500 animate-in fade-in inline-flex items-center gap-1"
              >
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Guardado
              </span>
            )}
          </div>
          <textarea
            id={`nota-intervencion-${alumnoId}`}
            data-testid="nota-intervencion-textarea"
            value={coachLog}
            onChange={handleCoachLogChange}
            onBlur={handleSaveCoachLog}
            rows={3}
            placeholder="Registrá la pauta o ajuste de ejercicio indicado para este caso..."
            aria-label="Nota de intervención"
            className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground">Se guarda al salir del campo.</p>
        </div>

        {/* Bloque de Anamnesis accesible y colapsable */}
        <div
          data-testid="anamnesis-summary-collapsible"
          className="rounded-lg border border-border/80 bg-secondary/20 p-3 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Ficha de Anamnesis &amp; Cuestionario Inicial
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  Respuestas de ingreso y condiciones de salud reportadas
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnamnesisCollapsed((prev) => !prev)}
              className="h-7 text-xs font-semibold gap-1 cursor-pointer"
              aria-expanded={!anamnesisCollapsed}
            >
              <span>{anamnesisCollapsed ? "Ver cuestionario inicial completo" : "Ocultar cuestionario"}</span>
              {anamnesisCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Objetivo
              </span>
              <span className="font-semibold text-foreground truncate block">
                {anamnesisData?.objetivo || "Hipertrofia & Fuerza"}
              </span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Frecuencia
              </span>
              <span className="font-semibold text-foreground truncate block">
                {anamnesisData?.frecuencia || "4 días / semana"}
              </span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Molestia previa
              </span>
              <span className="font-semibold text-amber-500 truncate block">
                {anamnesisData?.molestiaPrevia || "Hombro anterior"}
              </span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Cirugías
              </span>
              <span className="font-semibold text-emerald-500 truncate block">
                {anamnesisData?.cirugias || "Ninguna"}
              </span>
            </div>
          </div>

          {!anamnesisCollapsed && cuestionarioNode && (
            <div className="p-3 pt-2 border-t border-border/40 animate-in fade-in duration-200">
              {cuestionarioNode}
            </div>
          )}
        </div>
      </div>
    </IslaCardShell>
  );
}
