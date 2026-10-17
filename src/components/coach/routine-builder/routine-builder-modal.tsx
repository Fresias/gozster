"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Ejercicio, DiaRutina, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";

interface BuilderExercise {
  id: string;
  ejercicio_id: string;
  nombre: string;
  series: number;
  repeticiones: string;
  descanso_segundos: number;
  rpe_objetivo: number;
  tempo: string;
  force_rpe_required: boolean;
  notas: string;
  es_superserie: boolean;
  grupo_superserie: number | null;
  url_video?: string | null;
}

interface BuilderDay {
  id: string;
  nombre: string;
  orden: number;
  ejercicios: BuilderExercise[];
}

interface RoutineBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumnoId?: string;
  alumnoNombre?: string;
  catalogoEjercicios: Ejercicio[];
  onRoutineSaved?: (newPlan: PlanEntrenamiento) => void;
}

export function RoutineBuilderModal({
  isOpen,
  onClose,
  alumnoId,
  alumnoNombre = "Plantilla Maestra",
  catalogoEjercicios,
  onRoutineSaved,
}: RoutineBuilderModalProps) {
  const [planName, setPlanName] = React.useState("Bloque de Hipertrofia & Fuerza");
  const [comentarios, setComentarios] = React.useState("Enfocarse en sobrecarga progresiva y control excéntrico.");
  const [days, setDays] = React.useState<BuilderDay[]>([
    {
      id: "builder-day-1",
      nombre: "Día 1: Torso Pesado (Empuje / Tirón)",
      orden: 1,
      ejercicios: [
        {
          id: "be-1",
          ejercicio_id: "e2222222-2222-4222-8222-222222222202",
          nombre: "Press de Banca Plano con Barra",
          series: 4,
          repeticiones: "6-8",
          descanso_segundos: 120,
          rpe_objetivo: 8.5,
          tempo: "3-0-1-0",
          force_rpe_required: true,
          notas: "Retracción escapular firme y pausa de 1s en el pecho.",
          es_superserie: false,
          grupo_superserie: null,
          url_video: "rT7DgCr-3pg",
        },
        {
          id: "be-2",
          ejercicio_id: "e5555555-5555-4555-8555-555555555505",
          nombre: "Remo con Barra",
          series: 4,
          repeticiones: "8-10",
          descanso_segundos: 90,
          rpe_objetivo: 8.0,
          tempo: "2-0-1-1",
          force_rpe_required: false,
          notas: "Traccionar llevando los codos hacia la cadera.",
          es_superserie: false,
          grupo_superserie: null,
          url_video: "G8l_8chR5BE",
        },
      ],
    },
    {
      id: "builder-day-2",
      nombre: "Día 2: Piernas & Core",
      orden: 2,
      ejercicios: [
        {
          id: "be-3",
          ejercicio_id: "e1111111-1111-4111-8111-111111111101",
          nombre: "Sentadilla Trasera con Barra",
          series: 4,
          repeticiones: "6-8",
          descanso_segundos: 150,
          rpe_objetivo: 8.5,
          tempo: "3-1-1-0",
          force_rpe_required: true,
          notas: "Profundidad rompiendo el paralelo con torso erguido.",
          es_superserie: false,
          grupo_superserie: null,
          url_video: "bEv6CCg2BC8",
        },
      ],
    },
  ]);

  const [selectedDayIdx, setSelectedDayIdx] = React.useState(0);
  const [showCatalogModal, setShowCatalogModal] = React.useState(false);
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const currentDay = days[selectedDayIdx] || days[0];

  const handleAddDay = () => {
    const nextOrder = days.length + 1;
    const newDay: BuilderDay = {
      id: `builder-day-${Date.now()}`,
      nombre: `Día ${nextOrder}: Nueva Estación`,
      orden: nextOrder,
      ejercicios: [],
    };
    setDays([...days, newDay]);
    setSelectedDayIdx(days.length);
  };

  const handleAddExerciseToCurrentDay = (ej: Ejercicio) => {
    if (!currentDay) return;
    const newExercise: BuilderExercise = {
      id: `be-${Date.now()}`,
      ejercicio_id: ej.id,
      nombre: ej.nombre,
      series: 3,
      repeticiones: "8-10",
      descanso_segundos: 90,
      rpe_objetivo: 8.0,
      tempo: "3-0-1-0",
      force_rpe_required: false,
      notas: ej.comentario || "",
      es_superserie: false,
      grupo_superserie: null,
      url_video: ej.url_video,
    };

    setDays((prev) =>
      prev.map((d, idx) =>
        idx === selectedDayIdx
          ? { ...d, ejercicios: [...d.ejercicios, newExercise] }
          : d
      )
    );
    setShowCatalogModal(false);
  };

  const handleUpdateExercise = (
    exId: string,
    field: keyof BuilderExercise,
    value: any
  ) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === selectedDayIdx
          ? {
              ...d,
              ejercicios: d.ejercicios.map((e) =>
                e.id === exId ? { ...e, [field]: value } : e
              ),
            }
          : d
      )
    );
  };

  const handleRemoveExercise = (exId: string) => {
    setDays((prev) =>
      prev.map((d, idx) =>
        idx === selectedDayIdx
          ? {
              ...d,
              ejercicios: d.ejercicios.filter((e) => e.id !== exId),
            }
          : d
      )
    );
  };

  const handleMoveExercise = (index: number, direction: "UP" | "DOWN") => {
    if (!currentDay) return;
    const targetIdx = direction === "UP" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentDay.ejercicios.length) return;

    const list = [...currentDay.ejercicios];
    const [moved] = list.splice(index, 1);
    if (!moved) return;
    list.splice(targetIdx, 0, moved);

    setDays((prev) =>
      prev.map((d, idx) =>
        idx === selectedDayIdx ? { ...d, ejercicios: list } : d
      )
    );
  };

  // Toggle Superserie (A1 / A2)
  const handleToggleSuperset = (exId: string) => {
    if (!currentDay) return;
    const ex = currentDay.ejercicios.find((e) => e.id === exId);
    if (!ex) return;

    const willBeSuperset = !ex.es_superserie;
    // Si no tiene grupo asignado, asignar 1 por defecto
    const nextGroup = willBeSuperset ? ex.grupo_superserie || 1 : null;

    handleUpdateExercise(exId, "es_superserie", willBeSuperset);
    handleUpdateExercise(exId, "grupo_superserie", nextGroup);
  };

  // Guardar de verdad en Supabase (0 hardcodeado)
  const handleSaveToSupabase = async () => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      // 1. Guardar o actualizar Plan en Supabase
      const planId = `plan-${Date.now()}`;
      const nowIso = new Date().toISOString();

      const { data: planData, error: planErr } = await supabase
        .from("planes_entrenamiento")
        .insert({
          id: planId,
          nombre: planName,
          comentarios,
          estado: "ACTIVO",
          alumno_id: alumnoId || null,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select()
        .single();

      if (planErr) {
        throw new Error(`Error guardando plan en Supabase: ${planErr.message}`);
      }

      // 2. Guardar Días en Supabase
      for (let i = 0; i < days.length; i++) {
        const d = days[i]!;
        const diaId = `dia-${Date.now()}-${i + 1}`;

        const { error: diaErr } = await supabase.from("dias_rutina").insert({
          id: diaId,
          plan_id: planId,
          nombre: d.nombre,
          orden: i + 1,
          created_at: nowIso,
          updated_at: nowIso,
        });

        if (diaErr) {
          throw new Error(`Error guardando día "${d.nombre}": ${diaErr.message}`);
        }

        // 3. Guardar Ejercicios en Rutina en Supabase
        for (let j = 0; j < d.ejercicios.length; j++) {
          const ej = d.ejercicios[j]!;
          const { error: erErr } = await supabase
            .from("ejercicios_en_rutina")
            .insert({
              dia_id: diaId,
              ejercicio_id: ej.ejercicio_id,
              orden: j + 1,
              series: ej.series,
              repeticiones: ej.repeticiones,
              descanso_segundos: ej.descanso_segundos,
              rpe_objetivo: ej.rpe_objetivo,
              tempo: ej.tempo || "3-0-1-0",
              force_rpe_required: ej.force_rpe_required || false,
              notas: ej.notas || null,
              es_superserie: ej.es_superserie,
              grupo_superserie: ej.grupo_superserie,
              created_at: nowIso,
              updated_at: nowIso,
            });

          if (erErr) {
            throw new Error(`Error guardando ejercicio en rutina: ${erErr.message}`);
          }
        }
      }

      setSaveSuccess(true);
      if (onRoutineSaved && planData) {
        onRoutineSaved(planData as PlanEntrenamiento);
      }
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || "Error inesperado al guardar en Supabase.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCatalog = catalogoEjercicios.filter((e) =>
    e.nombre.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-3 sm:p-6 backdrop-blur-sm animate-in fade-in"
      data-testid="routine-builder-modal"
    >
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-border/60 p-4 bg-secondary/10">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary text-xl">
              🛠️
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Constructor Visual de Rutinas (Coach Studio)
              </h2>
              <p className="text-xs text-muted-foreground">
                Asignando a: <span className="font-semibold text-foreground">{alumnoNombre}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 rounded-md"
          >
            ✕
          </button>
        </div>

        {/* Formulario de Metadatos del Plan */}
        <div className="p-4 border-b border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-secondary/20">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Nombre de la Rutina:
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Comentarios Globales / Recomendaciones:
            </label>
            <input
              type="text"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Pestañas de Días */}
        <div className="flex items-center justify-between px-4 pt-3 border-b border-border/40 overflow-x-auto scrollbar-none">
          <div className="flex gap-2">
            {days.map((d, idx) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDayIdx(idx)}
                className={`px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
                  idx === selectedDayIdx
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.nombre} ({d.ejercicios.length})
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddDay}
            className="text-xs font-semibold h-7"
          >
            + Agregar Día
          </Button>
        </div>

        {/* Contenido del Día Seleccionado */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <input
              type="text"
              value={currentDay?.nombre || ""}
              onChange={(e) => {
                const val = e.target.value;
                setDays((prev) =>
                  prev.map((d, idx) =>
                    idx === selectedDayIdx ? { ...d, nombre: val } : d
                  )
                );
              }}
              className="text-sm font-bold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-1"
            />
            <Button
              size="sm"
              onClick={() => setShowCatalogModal(true)}
              className="bg-primary text-primary-foreground font-bold text-xs"
              data-testid="open-exercise-catalog-btn"
            >
              + Añadir Ejercicio del Catálogo
            </Button>
          </div>

          {currentDay?.ejercicios.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              No hay ejercicios cargados en este día. Haz clic en "+ Añadir Ejercicio" para armar la estación.
            </div>
          ) : (
            <div className="space-y-3">
              {currentDay?.ejercicios.map((ej, index) => {
                const isSuperset = ej.es_superserie;
                const groupLabel = isSuperset
                  ? `Superserie A${ej.grupo_superserie || 1}`
                  : null;

                return (
                  <div
                    key={ej.id}
                    className={`rounded-xl border p-3.5 space-y-3 transition-colors ${
                      isSuperset
                        ? "border-purple-500/40 bg-purple-500/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-secondary text-secondary-foreground font-mono font-bold text-xs border border-border/60">
                          #{index + 1}
                        </span>
                        <h4 className="text-sm font-bold text-foreground">
                          {ej.nombre}
                        </h4>
                        {isSuperset && (
                          <Badge className="bg-purple-600 text-white text-[10px] font-bold">
                            {groupLabel}
                          </Badge>
                        )}
                        {ej.force_rpe_required && (
                          <Badge variant="outline" className="border-amber-500 text-amber-400 text-[10px] font-bold">
                            RPE Forzado
                          </Badge>
                        )}
                        {ej.url_video && (
                          <span className="text-[10px] font-semibold text-primary inline-flex items-center gap-1">
                            <span>🎬</span> Video OK
                          </span>
                        )}
                      </div>

                      {/* Botones de ordenamiento y borrado con mayor ergonomía táctil */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveExercise(index, "UP")}
                          aria-label={`Subir orden de ${ej.nombre}`}
                          className="h-8 w-8 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center transition-colors cursor-pointer border border-border/40 font-bold"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === currentDay.ejercicios.length - 1}
                          onClick={() => handleMoveExercise(index, "DOWN")}
                          aria-label={`Bajar orden de ${ej.nombre}`}
                          className="h-8 w-8 rounded-xl bg-secondary text-xs disabled:opacity-30 hover:bg-secondary/80 flex items-center justify-center transition-colors cursor-pointer border border-border/40 font-bold"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(ej.id)}
                          aria-label={`Eliminar ${ej.nombre}`}
                          className="h-8 w-8 rounded-xl bg-destructive/15 text-destructive text-xs hover:bg-destructive/30 font-bold ml-1 flex items-center justify-center transition-colors cursor-pointer border border-destructive/30"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Banner de Superserie Conectada */}
                    {isSuperset && (
                      <div className="rounded-lg bg-purple-500/10 border border-purple-500/30 px-3 py-1.5 text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                        <span>🔗</span>
                        <span>Bloque de Superserie A{ej.grupo_superserie || 1} • Ejecutar consecutivamente sin descanso previo</span>
                      </div>
                    )}

                    {/* Parámetros de Entrenamiento con tipografía tabular */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Series:
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={ej.series}
                          onChange={(e) =>
                            handleUpdateExercise(
                              ej.id,
                              "series",
                              parseInt(e.target.value, 10) || 1
                            )
                          }
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Repeticiones:
                        </label>
                        <input
                          type="text"
                          value={ej.repeticiones}
                          onChange={(e) =>
                            handleUpdateExercise(ej.id, "repeticiones", e.target.value)
                          }
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Descanso (s):
                        </label>
                        <input
                          type="number"
                          step="15"
                          min="0"
                          value={ej.descanso_segundos}
                          onChange={(e) =>
                            handleUpdateExercise(
                              ej.id,
                              "descanso_segundos",
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          RPE Objetivo:
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="6"
                          max="10"
                          value={ej.rpe_objetivo}
                          onChange={(e) =>
                            handleUpdateExercise(
                              ej.id,
                              "rpe_objetivo",
                              parseFloat(e.target.value) || 8.0
                            )
                          }
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider mb-1">
                          Tempo:
                        </label>
                        <input
                          type="text"
                          placeholder="3-0-1-0"
                          value={ej.tempo}
                          onChange={(e) =>
                            handleUpdateExercise(ej.id, "tempo", e.target.value)
                          }
                          className="w-full min-h-[38px] rounded-xl border border-input bg-background px-2 py-1 text-center font-mono font-bold tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="flex flex-col justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggleSuperset(ej.id)}
                          className={`w-full min-h-[38px] text-xs font-bold rounded-xl border transition-all active:scale-95 cursor-pointer ${
                            isSuperset
                              ? "bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shadow-sm"
                              : "bg-secondary text-secondary-foreground border-border hover:bg-secondary/80"
                          }`}
                        >
                          {isSuperset ? "✓ Superserie A" : "+ Superserie"}
                        </button>
                      </div>
                    </div>

                    {/* Fila inferior: Notas del coach y switch de RPE forzado */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-border/40 text-xs">
                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          placeholder="Notas técnicas del coach para el atleta..."
                          value={ej.notas}
                          onChange={(e) =>
                            handleUpdateExercise(ej.id, "notas", e.target.value)
                          }
                          className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ej.force_rpe_required}
                          onChange={(e) =>
                            handleUpdateExercise(
                              ej.id,
                              "force_rpe_required",
                              e.target.checked
                            )
                          }
                          className="rounded accent-primary h-3.5 w-3.5"
                        />
                        <span>Obligar registro de RPE</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal de selección de ejercicios del catálogo */}
        {showCatalogModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h3 className="text-sm font-bold text-foreground">
                  Catálogo Maestro de Ejercicios ({catalogoEjercicios.length})
                </h3>
                <button
                  onClick={() => setShowCatalogModal(false)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <input
                type="text"
                placeholder="Buscar ejercicio por nombre o músculo..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />

              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {filteredCatalog.map((ej) => (
                  <div
                    key={ej.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/50 bg-secondary/10 hover:bg-secondary/30 transition-colors"
                  >
                    <div>
                      <span className="font-bold text-xs text-foreground block">
                        {ej.nombre}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {ej.musculos_principales.join(", ")}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="h-7 text-xs font-semibold"
                      onClick={() => handleAddExerciseToCurrentDay(ej)}
                    >
                      + Agregar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pie de modal con botón de guardado a Supabase */}
        <div className="p-4 border-t border-border/60 bg-secondary/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          {errorMessage && (
            <p className="text-xs text-destructive font-medium">{errorMessage}</p>
          )}
          {saveSuccess && (
            <p className="text-xs text-emerald-400 font-bold">
              ✓ ¡Rutina guardada y sincronizada en Supabase con éxito!
            </p>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              className="bg-primary text-primary-foreground font-bold shadow-md hover:opacity-90"
              onClick={handleSaveToSupabase}
              disabled={isSaving}
              data-testid="save-routine-to-supabase-btn"
            >
              {isSaving ? "Guardando en Supabase..." : "✓ Guardar Rutina en Supabase"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
