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
  etiquetaNivelDolor,
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
  // Vocabulario único P07 (leve / moderado / alto) derivado de la EVA
  const nivelTexto = etiquetaNivelDolor(nivelDesdeEva(effectiveEva, severidad === "AGUDO" && effectiveEva >= 7));

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
      title="Salud"
      icon={<Activity className="h-4 w-4 text-primary" aria-label="Salud" />}
      badge={
        hasActiveDolor ? (
          <Badge
            variant={estado === "RESUELTO" ? "success" : estado === "ATENDIDO" ? "secondary" : "warning"}
            data-testid="red-flags-alert"
          >
            {estado === "RESUELTO" ? "Resuelta" : estado === "ATENDIDO" ? "Atendida" : `Dolor en ${effectiveZona.toLowerCase()}`}
          </Badge>
        ) : null
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
      <div className="p-4 space-y-4">
        {/* Alert de Salud (P07): "Dolor {nivel} · {zona} · EVA {n}" + estado + Cambiar ejercicio */}
        {hasActiveDolor ? (
          <Alert
            variant={alertVariant}
            data-testid="alert-salud"
            className="p-3.5 space-y-3 rounded-lg border"
          >
            <div className="flex items-start gap-2.5">
              <TriangleAlert
                className={cn("mt-0.5 h-4 w-4 shrink-0", effectiveEva >= 7 ? "text-destructive" : "text-warning-soft-foreground")}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <AlertTitle className="m-0 text-sm font-medium text-foreground">
                  Dolor {nivelTexto} · {effectiveZona.toLowerCase()} · EVA {effectiveEva}
                </AlertTitle>
                <AlertDescription className="text-[13px] text-neutral-soft-foreground">
                  {effectiveEjercicio} · {effectiveFecha}
                  <span className="sr-only">
                    {" "}
                    · Severidad {severidadLabel} · Estado{" "}
                    {estado === "RESUELTO" ? "Resuelta" : estado === "ATENDIDO" ? "Atendida" : "Pendiente"}
                  </span>
                </AlertDescription>
              </div>
            </div>

            <Segmented<EstadoDolor>
              value={estado}
              onChange={handleEstadoChange}
              options={SEGMENTED_OPTIONS}
              size="sm"
              aria-label="Estado de intervención"
              disabled={isUpdating}
              className="w-full [&>button]:flex-1"
            />

            {onQuickSwap && !isPainResolved && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onQuickSwap}
                className="h-9 w-full text-sm font-medium cursor-pointer"
              >
                Cambiar ejercicio
              </Button>
            )}

            {errorMsg && (
              <div
                role="alert"
                data-testid="salud-error-alert"
                className="text-xs text-destructive font-medium bg-destructive/10 border border-destructive/25 p-2 rounded-lg flex items-center justify-between gap-2"
              >
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-[11px] underline hover:text-foreground cursor-pointer"
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
            className="border-border bg-card text-muted-foreground p-3.5 rounded-lg"
          >
            <AlertDescription className="text-sm text-muted-foreground flex items-center gap-2">
              <Check className="h-4 w-4 text-success-soft-foreground shrink-0" aria-hidden="true" />
              <span>Sin dolores activos.</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Nota de intervención: un único guardado al salir del campo (onBlur) */}
        <div data-testid="nota-intervencion-block" className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor={`nota-intervencion-${alumnoId}`}
              className="text-[13px] font-medium text-foreground cursor-pointer"
            >
              Nota de intervención
              <span className="sr-only"> (bitácora de intervención del entrenador)</span>
            </label>
            {saveSuccess && (
              <span
                data-testid="nota-intervencion-guardado"
                className="text-xs font-medium text-success-soft-foreground inline-flex items-center gap-1"
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
            placeholder="Pauta o ajuste indicado para este caso"
            aria-label="Nota de intervención"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="m-0 text-xs text-muted-foreground">Se guarda al salir del campo.</p>
        </div>

        {/* Resumen de anamnesis (cuestionario inicial) */}
        <div data-testid="anamnesis-summary-collapsible" className="space-y-3 border-t border-border pt-4">
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
            {[
              { k: "Objetivo", v: anamnesisData?.objetivo },
              { k: "Frecuencia", v: anamnesisData?.frecuencia },
              { k: "Molestia previa", v: anamnesisData?.molestiaPrevia },
              { k: "Cirugías", v: anamnesisData?.cirugias },
            ].map((item) => (
              <div key={item.k} className="min-w-0">
                <dt className="text-[13px] text-neutral-soft-foreground">{item.k}</dt>
                <dd className="m-0 truncate text-sm font-medium text-foreground">{item.v || "—"}</dd>
              </div>
            ))}
          </dl>

          {cuestionarioNode && (
            <button
              type="button"
              onClick={() => setAnamnesisCollapsed((prev) => !prev)}
              className="text-[13px] text-foreground underline underline-offset-2 hover:text-muted-foreground cursor-pointer"
              aria-expanded={!anamnesisCollapsed}
            >
              {anamnesisCollapsed ? "Ver cuestionario inicial completo" : "Ocultar cuestionario"}
            </button>
          )}

          {!anamnesisCollapsed && cuestionarioNode && (
            <div className="pt-2 border-t border-border">{cuestionarioNode}</div>
          )}
        </div>
      </div>
    </IslaCardShell>
  );
}
