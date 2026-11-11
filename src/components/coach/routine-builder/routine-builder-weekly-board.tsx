"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { nombreUnico } from "@/lib/rutinas-biblioteca";
import { validarRutina, claveRutina, claveDia, claveEjercicio } from "@/lib/validar-rutina";
import { normalizarSuperseries, moverEjercicio, asignarGrupo } from "@/lib/superseries";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { ExercisePreviewModal, type ExercisePreviewData } from "./exercise-preview-modal";
import {
  type BuilderDay,
  type BuilderExercise,
  type SaveMode,
  buildGuardarRutinaPayload,
  clasificarErrorGuardado,
  resumenPayload,
  mapPlanToBuilderDays,
  DEFAULT_BUILDER_DAYS,
  TAGS_RUTINA_PREDEFINIDAS,
} from "./routine-builder-modal";
import type { Ejercicio, DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";
import {
  Search,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Video,
  X,
  Loader2,
  Check,
  AlertCircle,
  Dumbbell,
  Pencil,
} from "@/components/ui/icons";

export interface RoutineBuilderWeeklyBoardProps {
  isOpen?: boolean;
  embedded?: boolean;
  onClose?: () => void;
  catalogoEjercicios: Ejercicio[];
  alumnoId?: string;
  alumnoNombre?: string;
  planInicial?: PlanEntrenamiento | null;
  diasIniciales?: DiaRutina[];
  ejerciciosEnRutinaIniciales?: EjercicioEnRutina[];
  onRoutineSaved?: (newPlan: PlanEntrenamiento) => void;
  soloLectura?: boolean;
  nombresExistentes?: string[];

  // Props controladas opcionales (cuando se embebe dentro de RoutineBuilderModal para compartir estado)
  planName?: string;
  onPlanNameChange?: (name: string) => void;
  comentarios?: string;
  onComentariosChange?: (comentarios: string) => void;
  selectedTags?: string[];
  onToggleTag?: (tag: string) => void;
  estado?: "BORRADOR" | "ACTIVO";
  onEstadoChange?: (estado: "BORRADOR" | "ACTIVO") => void;
  days?: BuilderDay[];
  onDaysChange?: (days: BuilderDay[]) => void;
  selectedDayIdx?: number;
  onSelectDayIdx?: (idx: number) => void;
  onAddDay?: () => void;
  onRemoveDay?: (idx?: number) => void;
  onAddExerciseToCurrentDay?: (ej: Ejercicio) => void;
  onUpdateExercise?: (exId: string, field: keyof BuilderExercise, value: any) => void;
  onUpdateSeries?: (exId: string, value: number | null) => void;
  onUpdateReps?: (exId: string, value: string) => void;
  onUpdateDescanso?: (exId: string, value: number | null) => void;
  onRemoveExercise?: (exId: string) => void;
  onMoveExercise?: (exId: string, dir: "UP" | "DOWN") => void;
  onToggleSuperserie?: (exId: string) => void;
  onSave?: (modo?: SaveMode) => Promise<void>;
  isSaving?: boolean;
  saveSuccess?: boolean;
  errorMessage?: string | null;
  onSwitchToClassic?: () => void;
}

const CATEGORIAS_MUSCULARES = [
  "Todos",
  "Pecho",
  "Espalda",
  "Piernas",
  "Hombros",
  "Brazos",
  "Core",
] as const;

export function RoutineBuilderWeeklyBoard({
  isOpen = true,
  embedded = false,
  onClose,
  catalogoEjercicios,
  alumnoId,
  alumnoNombre = "Plantilla Maestra",
  planInicial,
  diasIniciales,
  ejerciciosEnRutinaIniciales,
  onRoutineSaved,
  soloLectura = false,
  nombresExistentes,

  // Props controladas
  planName: controlledPlanName,
  onPlanNameChange: controlledSetPlanName,
  comentarios: controlledComentarios,
  onComentariosChange: controlledSetComentarios,
  selectedTags: controlledSelectedTags,
  onToggleTag: controlledToggleTag,
  estado: controlledEstado,
  onEstadoChange: controlledSetEstado,
  days: controlledDays,
  onDaysChange: controlledSetDays,
  selectedDayIdx: controlledSelectedDayIdx,
  onSelectDayIdx: controlledSetSelectedDayIdx,
  onAddDay: controlledAddDay,
  onRemoveDay: controlledRemoveDay,
  onAddExerciseToCurrentDay: controlledAddExercise,
  onUpdateExercise: controlledUpdateExercise,
  onUpdateSeries: controlledUpdateSeries,
  onUpdateReps: controlledUpdateReps,
  onUpdateDescanso: controlledUpdateDescanso,
  onRemoveExercise: controlledRemoveExercise,
  onMoveExercise: controlledMoveExercise,
  onToggleSuperserie: controlledToggleSuperserie,
  onSave: controlledSave,
  isSaving: controlledIsSaving,
  saveSuccess: controlledSaveSuccess,
  errorMessage: controlledErrorMessage,
  onSwitchToClassic,
}: RoutineBuilderWeeklyBoardProps) {
  // Estado local si se usa como componente no controlado
  const [internalPlanName, setInternalPlanName] = React.useState(() => planInicial?.nombre ?? "");
  const [internalComentarios, setInternalComentarios] = React.useState(() => planInicial?.comentarios ?? "");
  const [internalSelectedTags, setInternalSelectedTags] = React.useState<string[]>(
    () => (planInicial as any)?.tags ?? []
  );
  const [internalEstado, setInternalEstado] = React.useState<"BORRADOR" | "ACTIVO">(
    () => (planInicial?.estado === "ACTIVO" ? "ACTIVO" : "BORRADOR")
  );
  const [internalDays, setInternalDays] = React.useState<BuilderDay[]>(() => {
    if (planInicial) {
      return mapPlanToBuilderDays(
        planInicial.id,
        diasIniciales ?? [],
        ejerciciosEnRutinaIniciales ?? [],
        catalogoEjercicios
      );
    }
    return DEFAULT_BUILDER_DAYS.length > 0
      ? DEFAULT_BUILDER_DAYS
      : [
          {
            id: `builder-day-${Date.now()}`,
            nombre: "Día 1 · Principal",
            orden: 1,
            ejercicios: [],
          },
        ];
  });
  const [internalSelectedDayIdx, setInternalSelectedDayIdx] = React.useState(0);
  const [internalIsSaving, setInternalIsSaving] = React.useState(false);
  const [internalSaveSuccess, setInternalSaveSuccess] = React.useState(false);
  const [internalErrorMessage, setInternalErrorMessage] = React.useState<string | null>(null);

  // Sincronización Zustand bidireccional
  const setStudioBuilderMode = useCoachStudioStore((s) => s.setRoutineBuilderMode);
  const loadLiveSupabaseData = useCoachStudioStore((s) => s.loadLiveSupabaseData);

  // Selector efectivo (controlado vs interno)
  const isControlled = controlledDays !== undefined;
  const planName = isControlled ? controlledPlanName ?? "" : internalPlanName;
  const setPlanName = isControlled ? controlledSetPlanName ?? (() => {}) : setInternalPlanName;
  const comentarios = isControlled ? controlledComentarios ?? "" : internalComentarios;
  const setComentarios = isControlled ? controlledSetComentarios ?? (() => {}) : setInternalComentarios;
  const selectedTags = isControlled ? controlledSelectedTags ?? [] : internalSelectedTags;
  const estado = isControlled ? controlledEstado ?? "BORRADOR" : internalEstado;
  const setEstado = isControlled ? controlledSetEstado ?? (() => {}) : setInternalEstado;
  const days = isControlled ? controlledDays ?? [] : internalDays;
  const setDays = isControlled ? controlledSetDays ?? (() => {}) : setInternalDays;
  const selectedDayIdx = isControlled ? controlledSelectedDayIdx ?? 0 : internalSelectedDayIdx;
  const setSelectedDayIdx = isControlled ? controlledSetSelectedDayIdx ?? (() => {}) : setInternalSelectedDayIdx;
  const isSaving = isControlled ? controlledIsSaving ?? false : internalIsSaving;
  const saveSuccess = isControlled ? controlledSaveSuccess ?? false : internalSaveSuccess;
  const errorMessage = isControlled ? controlledErrorMessage ?? null : internalErrorMessage;

  // Filtros de biblioteca lateral
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("Todos");
  const [isCatalogDrawerOpen, setIsCatalogDrawerOpen] = React.useState(false);
  const [editingDayNameIdx, setEditingDayNameIdx] = React.useState<number | null>(null);
  const [tempDayName, setTempDayName] = React.useState("");
  const [previewEjercicio, setPreviewEjercicio] = React.useState<ExercisePreviewData | null>(null);
  const [draggedExerciseId, setDraggedExerciseId] = React.useState<string | null>(null);

  // Candado para guardado interno
  const lockRef = React.useRef(false);
  const versionRef = React.useRef<string | undefined>(planInicial?.updated_at);

  const currentDay = days[selectedDayIdx] ?? days[0] ?? null;

  // Handlers para modo no controlado
  const handleToggleTag = (tag: string) => {
    if (controlledToggleTag) {
      controlledToggleTag(tag);
    } else {
      setInternalSelectedTags((prev) =>
        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
      );
    }
  };

  const handleAddDay = () => {
    if (controlledAddDay) {
      controlledAddDay();
    } else {
      const nextOrder = days.length + 1;
      const newDay: BuilderDay = {
        id: `builder-day-${Date.now()}`,
        nombre: `Día ${nextOrder}`,
        orden: nextOrder,
        ejercicios: [],
      };
      const updated = normalizarSuperseries([...days, newDay], null);
      setInternalDays(updated);
      setSelectedDayIdx(days.length);
    }
  };

  const handleRemoveDay = (idx: number = selectedDayIdx) => {
    if (controlledRemoveDay) {
      controlledRemoveDay(idx);
    } else {
      if (days.length <= 1) return;
      const dia = days[idx];
      if (
        dia &&
        dia.ejercicios.length > 0 &&
        typeof window !== "undefined" &&
        !window.confirm(`¿Borrar "${dia.nombre}" y sus ejercicios?`)
      ) {
        return;
      }
      const updated = days.filter((_, i) => i !== idx).map((d, i) => ({ ...d, orden: i + 1 }));
      setInternalDays(normalizarSuperseries(updated, null));
      setSelectedDayIdx(Math.max(0, Math.min(idx, updated.length - 1)));
    }
  };

  const handleAddExerciseToCurrentDay = (ej: Ejercicio) => {
    if (controlledAddExercise) {
      controlledAddExercise(ej);
    } else {
      if (!currentDay) return;
      const newExercise: BuilderExercise = {
        id: `be-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ejercicio_id: ej.id,
        nombre: ej.nombre,
        series: 3,
        repeticiones: "10",
        descanso_segundos: 90,
        rpe_objetivo: null,
        tempo: "0",
        tempo_activo: false,
        force_rpe_required: false,
        notas: "",
        es_superserie: false,
        grupo_superserie: null,
        tipo_serie: "NORMAL",
        url_video: ej.url_video,
        tipo_medicion: "REPS",
        tiempo_objetivo_segundos: null,
        es_unilateral: false,
      };
      setInternalDays((prev) =>
        prev.map((d, i) => (i === selectedDayIdx ? { ...d, ejercicios: [...d.ejercicios, newExercise] } : d))
      );
    }
  };

  const handleUpdateExercise = (exId: string, field: keyof BuilderExercise, value: any) => {
    if (controlledUpdateExercise) {
      controlledUpdateExercise(exId, field, value);
    } else {
      setInternalDays((prev) =>
        prev.map((d, i) =>
          i === selectedDayIdx
            ? {
                ...d,
                ejercicios: d.ejercicios.map((e) => (e.id === exId ? { ...e, [field]: value } : e)),
              }
            : d
        )
      );
    }
  };

  const handleUpdateSeries = (exId: string, val: number | null) => {
    if (controlledUpdateSeries) {
      controlledUpdateSeries(exId, val);
    } else {
      setInternalDays((prev) =>
        prev.map((d, i) => {
          if (i !== selectedDayIdx) return d;
          const target = d.ejercicios.find((e) => e.id === exId);
          if (target && target.es_superserie && target.grupo_superserie !== null) {
            const circuito = d.ejercicios.filter(
              (e) => e.es_superserie && e.grupo_superserie === target.grupo_superserie
            );
            if (circuito[0]?.id === exId) {
              return {
                ...d,
                ejercicios: d.ejercicios.map((e) =>
                  e.es_superserie && e.grupo_superserie === target.grupo_superserie
                    ? { ...e, series: val }
                    : e
                ),
              };
            }
          }
          return {
            ...d,
            ejercicios: d.ejercicios.map((e) => (e.id === exId ? { ...e, series: val } : e)),
          };
        })
      );
    }
  };

  const handleUpdateReps = (exId: string, val: string) => {
    if (controlledUpdateReps) {
      controlledUpdateReps(exId, val);
    } else {
      handleUpdateExercise(exId, "repeticiones", val);
    }
  };

  const handleUpdateDescanso = (exId: string, val: number | null) => {
    if (controlledUpdateDescanso) {
      controlledUpdateDescanso(exId, val);
    } else {
      handleUpdateExercise(exId, "descanso_segundos", val);
    }
  };

  const handleRemoveExercise = (exId: string) => {
    if (controlledRemoveExercise) {
      controlledRemoveExercise(exId);
    } else {
      setInternalDays((prev) =>
        prev.map((d, i) =>
          i === selectedDayIdx
            ? {
                ...d,
                ejercicios: d.ejercicios.filter((e) => e.id !== exId),
              }
            : d
        )
      );
    }
  };

  const handleMoveExercise = (exId: string, dir: "UP" | "DOWN") => {
    if (controlledMoveExercise) {
      controlledMoveExercise(exId, dir);
    } else {
      if (!currentDay) return;
      const idx = currentDay.ejercicios.findIndex((e) => e.id === exId);
      if (idx < 0) return;
      const updatedList = moverEjercicio(currentDay.ejercicios, idx, dir);
      setInternalDays((prev) =>
        prev.map((d, i) => (i === selectedDayIdx ? { ...d, ejercicios: updatedList } : d))
      );
    }
  };

  const handleToggleSuperserie = (exId: string) => {
    if (controlledToggleSuperserie) {
      controlledToggleSuperserie(exId);
    } else {
      if (!currentDay) return;
      const ex = currentDay.ejercicios.find((e) => e.id === exId);
      if (!ex) return;
      let nuevoGrupo: number | null = null;
      if (!ex.es_superserie || ex.grupo_superserie === null) {
        // Encontrar siguiente número de grupo disponible en el día
        const maxGrupo = Math.max(0, ...currentDay.ejercicios.map((e) => e.grupo_superserie ?? 0));
        nuevoGrupo = maxGrupo + 1;
      }
      const updated = asignarGrupo(currentDay.ejercicios, exId, nuevoGrupo);
      setInternalDays((prev) =>
        prev.map((d, i) => (i === selectedDayIdx ? { ...d, ejercicios: updated } : d))
      );
    }
  };

  const handleSaveInternal = async (modo: SaveMode = "guardar") => {
    if (controlledSave) {
      return controlledSave(modo);
    }
    if (lockRef.current) return;
    lockRef.current = true;
    setInternalIsSaving(true);
    setInternalErrorMessage(null);

    const payload = buildGuardarRutinaPayload({
      planId: planInicial?.id,
      version: versionRef.current,
      comoNueva: modo !== "guardar",
      nombre: modo === "nueva" && nombresExistentes ? nombreUnico(planName, nombresExistentes) : planName,
      comentarios,
      tags: selectedTags,
      alumnoId,
      estado,
      days: normalizarSuperseries(days, null, true),
    });

    try {
      const validacion = validarRutina({ nombre: planName, days });
      const claves = Object.keys(validacion.errores);
      if (claves.length > 0) {
        throw { code: "GZ010", message: `Revisá los campos obligatorios (${claves.length} errores).`, details: claves.join(", ") };
      }

      const { data: planId, error } = await supabase.rpc("guardar_rutina", { p_payload: payload });
      if (error) throw error;

      const { data: planData, error: planErr } = await supabase
        .from("planes_entrenamiento")
        .select("*")
        .eq("id", planId)
        .single();
      if (planErr) throw planErr;

      if (planData?.updated_at) versionRef.current = planData.updated_at;
      setInternalSaveSuccess(true);
      if (onRoutineSaved && planData) {
        onRoutineSaved(planData as PlanEntrenamiento);
      }
      await loadLiveSupabaseData();
      setTimeout(() => {
        setInternalSaveSuccess(false);
        if (onClose) onClose();
      }, 1200);
    } catch (err: any) {
      const { mensaje } = clasificarErrorGuardado(err, modo);
      setInternalErrorMessage(mensaje);
    } finally {
      lockRef.current = false;
      setInternalIsSaving(false);
    }
  };

  // Filtrado de biblioteca de ejercicios
  const catalogoFiltrado = React.useMemo(() => {
    return catalogoEjercicios.filter((ej) => {
      const matchSearch =
        catalogSearch.trim() === "" ||
        ej.nombre.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (ej.musculos_principales || []).some((m) => m.toLowerCase().includes(catalogSearch.toLowerCase()));

      const matchCat =
        selectedCategory === "Todos" ||
        (ej.musculos_principales || []).some((m) =>
          m.toLowerCase().includes(selectedCategory.toLowerCase())
        );

      return matchSearch && matchCat;
    });
  }, [catalogoEjercicios, catalogSearch, selectedCategory]);

  const handleStartRenameDay = (idx: number) => {
    setEditingDayNameIdx(idx);
    setTempDayName(days[idx]?.nombre ?? `Día ${idx + 1}`);
  };

  const handleConfirmRenameDay = (idx: number) => {
    if (tempDayName.trim() !== "") {
      setDays(
        days.map((d, i) => (i === idx ? { ...d, nombre: tempDayName.trim() } : d))
      );
    }
    setEditingDayNameIdx(null);
  };

  if (!isOpen) return null;

  return (
    <div
      className={
        embedded
          ? "w-full flex flex-col rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
          : "fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-2 sm:p-4 md:p-6 backdrop-blur-sm animate-in fade-in"
      }
      data-testid="routine-builder-weekly-board"
    >
      <div
        className={
          embedded
            ? "w-full flex flex-col min-h-[640px]"
            : "w-full max-w-6xl max-h-[94vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        }
      >
        {/* ==================== 1. ENCABEZADO SUPERIOR ==================== */}
        <header className="border-b border-border/70 bg-secondary/15 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Título de rutina y metadata */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Tablero Semanal · Planner
                </span>
                <span className="text-xs text-muted-foreground/60">|</span>
                <span className="text-xs font-semibold text-muted-foreground">
                  Asignando a: <strong className="text-foreground">{alumnoNombre}</strong>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="Ej. Fuerza · Tren inferior o Hipertrofia A"
                  data-testid="board-plan-name-input"
                  disabled={soloLectura}
                  className="w-full max-w-md bg-transparent text-lg font-black tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5"
                />
              </div>
            </div>

            {/* Acciones principales y conmutador */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Switcher a vista modal clásica */}
              {onSwitchToClassic && (
                <button
                  type="button"
                  onClick={() => {
                    setStudioBuilderMode("modal");
                    onSwitchToClassic();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
                  data-testid="board-switch-to-classic"
                  title="Cambiar a la vista por pasos clásica"
                >
                  <span>↔ Vista Clásica</span>
                </button>
              )}

              {/* Selector de estado Borrador / Activo */}
              <div className="inline-flex rounded-full border border-border p-0.5 bg-background">
                <button
                  type="button"
                  onClick={() => setEstado("BORRADOR")}
                  disabled={soloLectura}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    estado === "BORRADOR"
                      ? "bg-secondary text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="board-status-borrador"
                >
                  Borrador
                </button>
                <button
                  type="button"
                  onClick={() => setEstado("ACTIVO")}
                  disabled={soloLectura}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    estado === "ACTIVO"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="board-status-activo"
                >
                  Activo
                </button>
              </div>

              {/* Botones de guardado */}
              {!soloLectura && (
                <Button
                  size="touch"
                  variant="default"
                  disabled={isSaving}
                  onClick={() => handleSaveInternal(estado === "BORRADOR" ? "guardar" : "guardar")}
                  data-testid="board-save-plan-btn"
                  className="font-bold min-h-10 px-4"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Guardando…</span>
                    </span>
                  ) : saveSuccess ? (
                    <span className="flex items-center gap-1.5 text-emerald-300">
                      <Check className="h-4 w-4" />
                      <span>¡Guardado!</span>
                    </span>
                  ) : (
                    "Guardar y sincronizar"
                  )}
                </Button>
              )}

              {/* Botón cerrar si es modal flotante */}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Cerrar tablero"
                  data-testid="board-close-btn"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Feedback de guardado o error */}
          {errorMessage && (
            <div
              role="alert"
              data-testid="board-save-error-alert"
              className="mt-2.5 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div
              role="status"
              data-testid="board-save-success-alert"
              className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400"
            >
              <Check className="h-4 w-4 shrink-0" />
              <span>Plan persistido con éxito en la base de datos y sincronizado con tu estado.</span>
            </div>
          )}
        </header>

        {/* ==================== 2. SELECTOR DE DÍAS EN CHIPS HORIZONTALES ==================== */}
        <nav
          aria-label="Días del plan de entrenamiento"
          className="border-b border-border/50 bg-background px-4 py-2.5 sm:px-6 overflow-x-auto"
          data-testid="board-days-chips-container"
        >
          <div className="flex items-center gap-2">
            {days.map((dia, idx) => {
              const isSelected = selectedDayIdx === idx;
              const isEditing = editingDayNameIdx === idx;
              return (
                <div key={dia.id} className="relative inline-flex items-center">
                  {isEditing ? (
                    <input
                      type="text"
                      value={tempDayName}
                      autoFocus
                      onChange={(e) => setTempDayName(e.target.value)}
                      onBlur={() => handleConfirmRenameDay(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleConfirmRenameDay(idx);
                        if (e.key === "Escape") setEditingDayNameIdx(null);
                      }}
                      className="rounded-full border border-primary bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:outline-none"
                      data-testid={`board-day-rename-input-${idx}`}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedDayIdx(idx)}
                      onDoubleClick={() => handleStartRenameDay(idx)}
                      className={`group flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                          : "border border-border/80 bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      }`}
                      data-testid={`board-day-chip-${idx}`}
                      aria-pressed={isSelected}
                    >
                      <span>{dia.nombre}</span>
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                          isSelected
                            ? "bg-white/20 text-white dark:bg-black/20 dark:text-zinc-900"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {dia.ejercicios.length}
                      </span>
                    </button>
                  )}

                  {/* Acciones de día en chip activo */}
                  {isSelected && !isEditing && (
                    <div className="ml-1 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleStartRenameDay(idx)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Renombrar este día"
                        data-testid={`board-day-rename-btn-${idx}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {days.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDay(idx)}
                          className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Eliminar este día"
                          data-testid={`board-day-remove-${idx}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Botón "+ Día" */}
            <button
              type="button"
              onClick={handleAddDay}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              data-testid="board-add-day-btn"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Día</span>
            </button>
          </div>
        </nav>

        {/* ==================== 3. CUERPO PRINCIPAL: GRILLES EJERCICIOS + BIBLIOTECA ==================== */}
        <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto">
          {/* COLUMNA CENTRAL: Ejercicios del día seleccionado (8 columnas en desktop) */}
          <section
            aria-label={`Ejercicios de ${currentDay?.nombre ?? "Día"}`}
            className="col-span-1 lg:col-span-8 flex flex-col p-4 sm:p-6 overflow-y-auto space-y-4"
            data-testid="board-exercises-column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const raw = e.dataTransfer.getData("application/json");
                if (raw) {
                  const parsed = JSON.parse(raw);
                  if (parsed?.id) handleAddExerciseToCurrentDay(parsed);
                }
              } catch {
                // Ignore parse errors
              }
            }}
          >
            {/* Header del día */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {currentDay?.nombre ?? "Día de entrenamiento"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {currentDay?.ejercicios.length === 0
                    ? "Sin ejercicios configurados"
                    : `${currentDay?.ejercicios.length} ejercicio(s) en este día`}
                </p>
              </div>

              {/* Botón móvil para abrir biblioteca */}
              <button
                type="button"
                onClick={() => setIsCatalogDrawerOpen((prev) => !prev)}
                className="lg:hidden inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-foreground"
                data-testid="board-toggle-catalog-drawer"
              >
                <Dumbbell className="h-3.5 w-3.5" />
                <span>Biblioteca ({catalogoEjercicios.length})</span>
              </button>
            </div>

            {/* Listado de tarjetas de ejercicios */}
            {currentDay?.ejercicios.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-secondary/10 p-8 text-center"
                data-testid="board-empty-day-state"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Dumbbell className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-sm font-bold text-foreground">
                  No hay ejercicios en este día todavía
                </h4>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Seleccioná ejercicios de la biblioteca lateral con el botón <strong>+</strong> o arrastralos directamente acá.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCatalogDrawerOpen(true)}
                  className="mt-4 lg:hidden rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground"
                >
                  Abrir Biblioteca
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {currentDay?.ejercicios.map((ex, exIdx) => {
                  const esSuperserie = ex.es_superserie && ex.grupo_superserie !== null;
                  return (
                    <li
                      key={ex.id}
                      draggable={!soloLectura}
                      onDragStart={(e) => {
                        setDraggedExerciseId(ex.id);
                        e.dataTransfer.setData("text/plain", ex.id);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedExerciseId && draggedExerciseId !== ex.id) {
                          const originIdx = currentDay.ejercicios.findIndex((i) => i.id === draggedExerciseId);
                          const targetIdx = exIdx;
                          if (originIdx >= 0 && targetIdx >= 0) {
                            const dir = targetIdx > originIdx ? "DOWN" : "UP";
                            handleMoveExercise(draggedExerciseId, dir);
                          }
                        }
                        setDraggedExerciseId(null);
                      }}
                      className={`group flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs transition-all ${
                        esSuperserie
                          ? "border-primary/80 ring-1 ring-primary/30 dark:border-primary"
                          : "border-border/80 hover:border-border"
                      }`}
                      data-testid={`board-exercise-card-${ex.id}`}
                    >
                      {/* Fila superior: Handle, orden, nombre, tags de superserie y controles */}
                      <div className="flex items-center gap-2.5">
                        {/* Drag dots handle */}
                        <span
                          className="cursor-grab text-muted-foreground/50 hover:text-foreground grid grid-cols-2 gap-0.5"
                          title="Arrastrar para reordenar"
                        >
                          {[0, 1, 2, 3, 4, 5].map((dot) => (
                            <span key={dot} className="size-1 rounded-full bg-muted-foreground/60" />
                          ))}
                        </span>

                        {/* Índice numérico */}
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[11px] font-bold text-foreground">
                          {exIdx + 1}
                        </span>

                        {/* Nombre del ejercicio */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="truncate text-sm font-bold text-foreground"
                              data-testid={`board-exercise-name-${ex.id}`}
                            >
                              {ex.nombre}
                            </span>
                            {ex.url_video && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewEjercicio({
                                    nombre: ex.nombre,
                                    musculos_principales: [],
                                    url_video: ex.url_video,
                                  })
                                }
                                className="text-muted-foreground hover:text-primary"
                                title="Ver video del ejercicio"
                                data-testid={`board-exercise-video-btn-${ex.id}`}
                              >
                                <Video className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Indicador de superserie agrupada */}
                          {esSuperserie && (
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <span
                                className="font-mono text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded"
                                data-testid={`board-superserie-badge-${ex.id}`}
                              >
                                Superserie #{ex.grupo_superserie}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Controles de orden y acciones */}
                        <div className="flex items-center gap-1">
                          {/* Botón toggle superserie */}
                          <button
                            type="button"
                            onClick={() => handleToggleSuperserie(ex.id)}
                            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                              esSuperserie
                                ? "bg-primary/15 text-primary"
                                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                            title={esSuperserie ? "Desagrupar superserie" : "Agrupar en superserie"}
                            data-testid={`board-toggle-superserie-${ex.id}`}
                          >
                            {esSuperserie ? "Desagrupar" : "Superserie"}
                          </button>

                          {/* Mover arriba / abajo */}
                          <button
                            type="button"
                            disabled={exIdx === 0}
                            onClick={() => handleMoveExercise(ex.id, "UP")}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                            title="Subir"
                            data-testid={`board-move-up-${ex.id}`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={exIdx === currentDay.ejercicios.length - 1}
                            onClick={() => handleMoveExercise(ex.id, "DOWN")}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
                            title="Bajar"
                            data-testid={`board-move-down-${ex.id}`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>

                          {/* Eliminar ejercicio */}
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(ex.id)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            title="Quitar ejercicio"
                            data-testid={`board-remove-exercise-${ex.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Fila inferior: Campos editables inline (Series, Repeticiones, Descanso, RPE) */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1 border-t border-border/40">
                        {/* Series */}
                        <div>
                          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">
                            Series
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={ex.series ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : Number(e.target.value);
                              handleUpdateSeries(ex.id, val);
                            }}
                            className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            data-testid={`board-exercise-series-input-${ex.id}`}
                          />
                        </div>

                        {/* Repeticiones */}
                        <div>
                          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">
                            Reps
                          </label>
                          <input
                            type="text"
                            value={ex.repeticiones}
                            placeholder="10 o 10-8-6"
                            onChange={(e) => handleUpdateReps(ex.id, e.target.value)}
                            className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            data-testid={`board-exercise-reps-input-${ex.id}`}
                          />
                        </div>

                        {/* Descanso */}
                        <div>
                          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">
                            Descanso (s)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="900"
                            step="15"
                            value={ex.descanso_segundos ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : Number(e.target.value);
                              handleUpdateDescanso(ex.id, val);
                            }}
                            className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            data-testid={`board-exercise-rest-input-${ex.id}`}
                          />
                        </div>

                        {/* RPE opcional */}
                        <div className="hidden sm:block">
                          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">
                            RPE Obj
                          </label>
                          <input
                            type="text"
                            value={ex.rpe_objetivo ?? ""}
                            placeholder="Ej. 8 o 7.5"
                            onChange={(e) => handleUpdateExercise(ex.id, "rpe_objetivo", e.target.value)}
                            className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            data-testid={`board-exercise-rpe-input-${ex.id}`}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Botón "+ Agregar ejercicio" abajo de la lista */}
            <button
              type="button"
              onClick={() => setIsCatalogDrawerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 py-3 text-xs font-bold text-muted-foreground hover:border-foreground/50 hover:text-foreground transition-colors"
              data-testid="board-add-exercise-btn"
            >
              <Plus className="h-4 w-4" />
              <span>Agregar ejercicio al {currentDay?.nombre ?? "día"}</span>
            </button>
          </section>

          {/* ==================== 4. PANEL LATERAL / DRAWER DE BIBLIOTECA MAESTRO ==================== */}
          <aside
            aria-label="Biblioteca de ejercicios del catálogo"
            className={`col-span-1 lg:col-span-4 border-t lg:border-t-0 lg:border-l border-border/70 bg-background/50 flex flex-col p-4 sm:p-5 ${
              isCatalogDrawerOpen ? "block" : "hidden lg:flex"
            }`}
            data-testid="board-catalog-panel"
          >
            {/* Header del catálogo */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Catálogo Maestro
                </div>
                <h4 className="text-sm font-black text-foreground">Tu Biblioteca</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsCatalogDrawerOpen(false)}
                className="lg:hidden rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                aria-label="Cerrar biblioteca"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Búsqueda en catálogo */}
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Buscar ejercicio…"
                className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="board-catalog-search-input"
              />
            </div>

            {/* Filtro por grupo muscular */}
            <div className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-1">
              {CATEGORIAS_MUSCULARES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 transition-colors ${
                    selectedCategory === cat
                      ? "bg-foreground text-background font-bold"
                      : "border border-border/80 text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`board-catalog-cat-${cat}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Listado de ejercicios del catálogo */}
            <div className="mt-3 flex-1 overflow-y-auto pr-1">
              {catalogoFiltrado.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No se encontraron ejercicios para “{catalogSearch}”.
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-border/50">
                  {catalogoFiltrado.map((ej) => (
                    <li
                      key={ej.id}
                      draggable={!soloLectura}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/json", JSON.stringify(ej));
                      }}
                      className="group flex items-center justify-between gap-2 py-2 text-xs hover:bg-secondary/30 rounded-lg px-2 transition-colors cursor-grab"
                      data-testid={`board-catalog-item-${ej.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-foreground">
                          {ej.nombre}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {ej.musculos_principales?.[0] && (
                            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {ej.musculos_principales[0]}
                            </span>
                          )}
                          {ej.url_video && (
                            <span className="font-mono text-[9px] text-primary">● Video</span>
                          )}
                        </div>
                      </div>

                      {/* Botón "+" para agregar al día activo */}
                      <button
                        type="button"
                        onClick={() => handleAddExerciseToCurrentDay(ej)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"
                        title={`Agregar ${ej.nombre} a ${currentDay?.nombre ?? "este día"}`}
                        data-testid={`board-catalog-add-${ej.id}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Modal de previsualización de video de ejercicio */}
      {previewEjercicio && (
        <ExercisePreviewModal
          isOpen={true}
          exercise={previewEjercicio}
          onClose={() => setPreviewEjercicio(null)}
          onAddExercise={(data) => {
            const ejEncontrado = catalogoEjercicios.find((e) => e.nombre === data.nombre);
            if (ejEncontrado) handleAddExerciseToCurrentDay(ejEncontrado);
            setPreviewEjercicio(null);
          }}
        />
      )}
    </div>
  );
}
