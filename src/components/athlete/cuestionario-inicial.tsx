"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { useAthleteStore } from "@/store/use-athlete-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sanearTexto } from "@/lib/plausibilidad";
import type { AlumnoCuestionarioInicial } from "@/types/database.types";

interface CuestionarioInicialProps {
  athleteId?: string;
  athleteName?: string;
  onComplete?: () => void;
}

const OBJETIVOS_PRESET = [
  "Hipertrofia / Ganancia Muscular",
  "Pérdida de Grasa / Recomposición",
  "Fuerza Máxima & Powerlifting",
  "Salud General & Acondicionamiento",
  "Rendimiento Deportivo",
] as const;

const EXPERIENCIA_PRESET = [
  "Principiante (< 1 año constante)",
  "Intermedio (1 a 3 años entrenando)",
  "Avanzado (> 3 años con sobrecarga)",
] as const;

const EQUIPAMIENTO_PRESET = [
  "Gimnasio comercial completo",
  "Gimnasio de edificio / básico",
  "Equipamiento en casa (mancuernas/banco)",
  "Peso corporal / Calistenia",
] as const;

export function CuestionarioInicial({
  athleteId,
  athleteName,
  onComplete,
}: CuestionarioInicialProps) {
  const {
    currentSession,
    cuestionarioInicial,
    setCuestionarioInicial,
    saveCuestionarioInicial,
  } = useAthleteStore();

  const effectiveAthleteId =
    athleteId || currentSession.studentId || "66b92b9a-1ce7-4e2e-a47c-7c5600000000";
  const effectiveAthleteName =
    athleteName || currentSession.studentName || "Fernando Rosales";

  const [isEditing, setIsEditing] = React.useState(!cuestionarioInicial?.completado_at);
  const [isSaving, setIsSaving] = React.useState(false);
  const [feedbackMessage, setFeedbackMessage] = React.useState<string | null>(null);

  // Form State
  const [objetivo, setObjetivo] = React.useState(
    cuestionarioInicial?.objetivo_principal || "Hipertrofia / Ganancia Muscular",
  );
  const [experiencia, setExperiencia] = React.useState(
    cuestionarioInicial?.experiencia_previa || "Intermedio (1 a 3 años entrenando)",
  );
  const [dias, setDias] = React.useState<number>(
    cuestionarioInicial?.dias_disponibles_semana ?? 4,
  );
  const [molestias, setMolestias] = React.useState(
    cuestionarioInicial?.molestias_o_lesiones_previas || "",
  );
  const [equipamiento, setEquipamiento] = React.useState(
    cuestionarioInicial?.equipamiento_disponible || "Gimnasio comercial completo",
  );
  const [comentarios, setComentarios] = React.useState<string>(
    typeof cuestionarioInicial?.respuestas_extra === "object" &&
      cuestionarioInicial.respuestas_extra !== null &&
      "comentarios" in cuestionarioInicial.respuestas_extra
      ? String((cuestionarioInicial.respuestas_extra as Record<string, any>).comentarios || "")
      : "",
  );

  // Intentar cargar cuestionario desde Supabase si existe y sincronizarlo
  React.useEffect(() => {
    let isMounted = true;

    async function fetchCuestionario() {
      try {
        if (!supabase) return;
        const { data, error } = await supabase
          .from("alumno_cuestionario_inicial")
          .select("*")
          .eq("alumno_id", effectiveAthleteId)
          .maybeSingle();

        if (!error && data && isMounted) {
          const rec = data as AlumnoCuestionarioInicial;
          setCuestionarioInicial(rec);
          if (rec.completado_at) {
            setIsEditing(false);
            if (rec.objetivo_principal) setObjetivo(rec.objetivo_principal);
            if (rec.experiencia_previa) setExperiencia(rec.experiencia_previa);
            if (rec.dias_disponibles_semana !== null) setDias(rec.dias_disponibles_semana);
            if (rec.molestias_o_lesiones_previas) setMolestias(rec.molestias_o_lesiones_previas);
            if (rec.equipamiento_disponible) setEquipamiento(rec.equipamiento_disponible);
            if (
              typeof rec.respuestas_extra === "object" &&
              rec.respuestas_extra !== null &&
              "comentarios" in rec.respuestas_extra
            ) {
              setComentarios(String((rec.respuestas_extra as Record<string, any>).comentarios || ""));
            }
          }
        }
      } catch (e) {
        // En caso de fallo o modo avión, se preserva el estado local de Zustand
      }
    }

    fetchCuestionario();
    return () => {
      isMounted = false;
    };
  }, [effectiveAthleteId, setCuestionarioInicial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedbackMessage(null);

    const payload: Partial<AlumnoCuestionarioInicial> = {
      alumno_id: effectiveAthleteId,
      objetivo_principal: objetivo,
      experiencia_previa: experiencia,
      dias_disponibles_semana: dias,
      molestias_o_lesiones_previas: sanearTexto(molestias) || "Ninguna reportada",
      equipamiento_disponible: equipamiento,
      respuestas_extra: {
        comentarios: sanearTexto(comentarios),
        completado_por: effectiveAthleteName,
        fuente: "athlete_app_demo",
      },
      completado_at: new Date().toISOString(),
    };

    const res = await saveCuestionarioInicial(payload);
    setIsSaving(false);

    if (res.success) {
      setIsEditing(false);
      setFeedbackMessage("✓ Cuestionario guardado con éxito. Tu entrenador ya tiene acceso a tus respuestas.");
      onComplete?.();
    } else {
      setFeedbackMessage(res.error || "Ocurrió un error al guardar. Los datos se preservaron localmente.");
    }
  };

  const isCompleted = Boolean(cuestionarioInicial?.completado_at);

  return (
    <div className="space-y-4" data-testid="cuestionario-inicial-container">
      {/* Banner de Estado No Bloqueante */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <h2 className="text-sm font-bold text-foreground">
              Cuestionario Inicial (Opcional)
            </h2>
            {isCompleted ? (
              <Badge
                variant="success"
                className="text-[10px] font-bold"
                data-testid="cuestionario-completado-badge"
              >
                ✓ Completado
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="text-[10px] font-bold"
                data-testid="cuestionario-opcional-badge"
              >
                Opcional • Demo
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isCompleted
              ? `Completado por ${effectiveAthleteName}. Puedes editar tus datos cuando quieras.`
              : "No bloquea tu entrenamiento. Puedes entrenar directamente y completarlo cuando prefieras."}
          </p>
        </div>

        {isCompleted && !isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="text-xs font-semibold"
            data-testid="btn-editar-cuestionario"
          >
            ✏️ Modificar Respuestas
          </Button>
        )}
      </div>

      {feedbackMessage && (
        <div
          role="alert"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          data-testid="cuestionario-feedback-msg"
        >
          {feedbackMessage}
        </div>
      )}

      {/* Vista Resumen cuando ya está completado y no está en modo edición */}
      {isCompleted && !isEditing ? (
        <Card className="border border-border shadow-xs" data-testid="cuestionario-resumen-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-foreground">
              Respuestas Registradas
            </CardTitle>
            <CardDescription className="text-xs">
              Información visible para tu entrenador en el Coach Studio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Objetivo Principal
                </span>
                <p
                  className="mt-0.5 text-xs font-semibold text-foreground"
                  data-testid="cuestionario-resumen-objetivo"
                >
                  {cuestionarioInicial?.objetivo_principal || objetivo}
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Experiencia Previa
                </span>
                <p
                  className="mt-0.5 text-xs font-semibold text-foreground"
                  data-testid="cuestionario-resumen-experiencia"
                >
                  {cuestionarioInicial?.experiencia_previa || experiencia}
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Días Disponibles / Semana
                </span>
                <p
                  className="mt-0.5 text-xs font-semibold text-foreground"
                  data-testid="cuestionario-resumen-dias"
                >
                  {cuestionarioInicial?.dias_disponibles_semana ?? dias} días por semana
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Equipamiento Disponible
                </span>
                <p
                  className="mt-0.5 text-xs font-semibold text-foreground"
                  data-testid="cuestionario-resumen-equipamiento"
                >
                  {cuestionarioInicial?.equipamiento_disponible || equipamiento}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Molestias o Lesiones Previas
              </span>
              <p
                className="mt-0.5 text-xs font-medium text-foreground"
                data-testid="cuestionario-resumen-molestias"
              >
                {cuestionarioInicial?.molestias_o_lesiones_previas || molestias || "Ninguna reportada"}
              </p>
            </div>

            {comentarios && (
              <div className="rounded-lg border border-border/80 bg-secondary/30 p-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Comentarios o Preferencias
                </span>
                <p
                  className="mt-0.5 text-xs font-medium text-foreground"
                  data-testid="cuestionario-resumen-comentarios"
                >
                  {comentarios}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Formulario Interactivo */
        <Card className="border border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-foreground">
              {isCompleted ? "Editar Cuestionario Inicial" : "Formulario de Inicialización"}
            </CardTitle>
            <CardDescription className="text-xs">
              Preguntas para orientar tu planificación y sugerencias de cargas.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 1. Objetivo Principal */}
              <div className="space-y-1.5">
                <label
                  htmlFor="cuestionario-objetivo"
                  className="text-xs font-bold text-foreground block"
                >
                  1. ¿Cuál es tu objetivo principal?
                </label>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {OBJETIVOS_PRESET.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setObjetivo(opt)}
                      className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-all touch-manipulation ${
                        objetivo === opt
                          ? "border-primary bg-primary/10 text-primary shadow-xs"
                          : "border-border bg-card text-foreground hover:bg-secondary/40"
                      }`}
                      data-testid={`opt-objetivo-${opt}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Experiencia Previa */}
              <div className="space-y-1.5">
                <label
                  htmlFor="cuestionario-experiencia"
                  className="text-xs font-bold text-foreground block"
                >
                  2. ¿Qué nivel de experiencia previa tienes?
                </label>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {EXPERIENCIA_PRESET.map((exp) => (
                    <button
                      key={exp}
                      type="button"
                      onClick={() => setExperiencia(exp)}
                      className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-all touch-manipulation ${
                        experiencia === exp
                          ? "border-primary bg-primary/10 text-primary shadow-xs"
                          : "border-border bg-card text-foreground hover:bg-secondary/40"
                      }`}
                      data-testid={`opt-experiencia-${exp}`}
                    >
                      {exp}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Días Disponibles */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">
                  3. ¿Cuántos días por semana puedes entrenar?
                </label>
                <div className="flex items-center gap-2">
                  {[2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setDias(num)}
                      className={`flex-1 min-h-[44px] rounded-lg border text-xs font-bold transition-all touch-manipulation ${
                        dias === num
                          ? "border-primary bg-primary text-primary-foreground shadow-xs"
                          : "border-border bg-card text-foreground hover:bg-secondary/40"
                      }`}
                      data-testid={`opt-dias-${num}`}
                    >
                      {num} días
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Molestias o Lesiones */}
              <div className="space-y-1.5">
                <label
                  htmlFor="cuestionario-molestias"
                  className="text-xs font-bold text-foreground block"
                >
                  4. ¿Tienes molestias o lesiones previas? (Opcional)
                </label>
                <textarea
                  id="cuestionario-molestias"
                  rows={2}
                  value={molestias}
                  onChange={(e) => setMolestias(e.target.value)}
                  placeholder="Ej.: Dolor lumbar al hacer sentadillas pesadas, o molestia en rodilla derecha. (Si no tienes, deja vacío)."
                  className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  data-testid="input-molestias"
                />
              </div>

              {/* 5. Equipamiento */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block">
                  5. ¿Con qué equipamiento cuentas?
                </label>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {EQUIPAMIENTO_PRESET.map((eq) => (
                    <button
                      key={eq}
                      type="button"
                      onClick={() => setEquipamiento(eq)}
                      className={`min-h-[44px] rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-all touch-manipulation ${
                        equipamiento === eq
                          ? "border-primary bg-primary/10 text-primary shadow-xs"
                          : "border-border bg-card text-foreground hover:bg-secondary/40"
                      }`}
                      data-testid={`opt-equipamiento-${eq}`}
                    >
                      {eq}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Comentarios Adicionales */}
              <div className="space-y-1.5">
                <label
                  htmlFor="cuestionario-comentarios"
                  className="text-xs font-bold text-foreground block"
                >
                  6. Comentarios adicionales para el entrenador (Opcional)
                </label>
                <textarea
                  id="cuestionario-comentarios"
                  rows={2}
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  placeholder="Ej.: Horarios en los que suelo entrenar, preferencias sobre ejercicios..."
                  className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  data-testid="input-comentarios"
                />
              </div>

              {/* Botón Guardar */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 min-h-[48px] text-xs font-bold"
                  data-testid="submit-cuestionario-btn"
                >
                  {isSaving ? "Guardando cuestionario..." : "✓ Guardar Cuestionario Inicial"}
                </Button>

                {isCompleted && isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsEditing(false)}
                    className="min-h-[48px] text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
