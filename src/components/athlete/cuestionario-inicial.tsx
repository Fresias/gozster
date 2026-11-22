"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { DEFAULT_ATHLETE_ID, useAthleteStore } from "@/store/use-athlete-store";
import { Check, Pencil } from "@/components/athlete/icons";
import type { AlumnoCuestionarioInicial } from "@/types/database.types";

interface CuestionarioInicialProps {
  athleteId?: string;
  athleteName?: string;
  onComplete?: () => void;
}

const OBJETIVOS_PRESET = [
  "Hipertrofia / ganancia muscular",
  "Pérdida de grasa / recomposición",
  "Fuerza máxima",
  "Salud general",
  "Rendimiento deportivo",
] as const;

const EXPERIENCIA_PRESET = [
  "Principiante (menos de 1 año)",
  "Intermedio (1 a 3 años)",
  "Avanzado (más de 3 años)",
] as const;

const EQUIPAMIENTO_PRESET = [
  "Gimnasio comercial completo",
  "Gimnasio de edificio / básico",
  "Mancuernas y banco en casa",
  "Peso corporal",
] as const;

export function CuestionarioInicial({
  athleteId,
  athleteName,
  onComplete,
}: CuestionarioInicialProps) {
  const {
    currentSession,
    planAlumno,
    cuestionarioInicial,
    setCuestionarioInicial,
    saveCuestionarioInicial,
  } = useAthleteStore();

  const effectiveAthleteId =
    athleteId ||
    planAlumno?.alumnos?.[0]?.id ||
    (currentSession.studentId && currentSession.studentId !== DEFAULT_ATHLETE_ID
      ? currentSession.studentId
      : undefined);
  const effectiveAthleteName =
    athleteName ||
    planAlumno?.alumnos?.[0]?.nombre_completo ||
    (currentSession.studentId !== DEFAULT_ATHLETE_ID ? currentSession.studentName : "") ||
    "";

  const [isEditing, setIsEditing] = React.useState(!cuestionarioInicial?.completado_at);
  const [isSaving, setIsSaving] = React.useState(false);
  const [feedbackMessage, setFeedbackMessage] = React.useState<string | null>(null);

  // Form State
  const [objetivo, setObjetivo] = React.useState(
    cuestionarioInicial?.objetivo_principal || OBJETIVOS_PRESET[0],
  );
  const [experiencia, setExperiencia] = React.useState(
    cuestionarioInicial?.experiencia_previa || EXPERIENCIA_PRESET[1],
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
        if (!supabase || !effectiveAthleteId) return;
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
    if (!effectiveAthleteId) {
      setFeedbackMessage(
        "No pudimos identificar tu perfil de alumno. Volvé a iniciar sesión para guardar.",
      );
      return;
    }
    setIsSaving(true);
    setFeedbackMessage(null);

    const payload: Partial<AlumnoCuestionarioInicial> = {
      alumno_id: effectiveAthleteId,
      objetivo_principal: objetivo,
      experiencia_previa: experiencia,
      dias_disponibles_semana: dias,
      molestias_o_lesiones_previas: molestias.trim() || "Ninguna reportada",
      equipamiento_disponible: equipamiento,
      respuestas_extra: {
        comentarios: comentarios.trim(),
        completado_por: effectiveAthleteName,
        fuente: "athlete_app_demo",
      },
      completado_at: new Date().toISOString(),
    };

    const res = await saveCuestionarioInicial(payload);
    setIsSaving(false);

    if (res.success) {
      setIsEditing(false);
      setFeedbackMessage("Listo, guardamos tus respuestas. Tu coach ya puede verlas.");
      onComplete?.();
    } else {
      setFeedbackMessage(res.error || "Ocurrió un error al guardar. Los datos se preservaron localmente.");
    }
  };

  const isCompleted = Boolean(cuestionarioInicial?.completado_at);

  const resumen: Array<[string, string, string]> = [
    ["Objetivo principal", cuestionarioInicial?.objetivo_principal || objetivo, "objetivo"],
    ["Experiencia previa", cuestionarioInicial?.experiencia_previa || experiencia, "experiencia"],
    ["Días disponibles", `${cuestionarioInicial?.dias_disponibles_semana ?? dias} días por semana`, "dias"],
    ["Equipamiento", cuestionarioInicial?.equipamiento_disponible || equipamiento, "equipamiento"],
    ["Molestias o lesiones previas", cuestionarioInicial?.molestias_o_lesiones_previas || molestias || "Ninguna", "molestias"],
  ];
  if (comentarios) resumen.push(["Comentarios", comentarios, "comentarios"]);

  const grupo = (
    nombre: string,
    opciones: readonly string[],
    actual: string,
    onSelect: (v: string) => void,
    testPrefix: string,
  ) => (
    <div className="a-qgroup" role="group" aria-label={nombre}>
      {opciones.map((opt) => (
        <button
          key={opt}
          type="button"
          className="a-opt"
          aria-pressed={actual === opt}
          onClick={() => onSelect(opt)}
          data-testid={`${testPrefix}-${opt}`}
        >
          <span className="a-t-bs">{opt}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="cuestionario-inicial-container">
      {feedbackMessage && (
        <p role="alert" className="a-info a-t-sec" data-testid="cuestionario-feedback-msg">
          {feedbackMessage}
        </p>
      )}

      {isCompleted && !isEditing ? (
        <>
          <section className="a-card" style={{ padding: 16, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <h1 className="a-t-h">Cuestionario inicial</h1>
              <span className="a-chip a-ok a-t-label" data-testid="cuestionario-completado-badge">
                <Check width={12} height={12} className="a-i" /> Completado
              </span>
            </div>
            <p className="a-t-sec a-muted" style={{ margin: 0 }}>
              Tu coach ve estas respuestas en el Coach Studio. Podés editarlas cuando quieras.
            </p>
            <button
              type="button"
              className="a-btn a-ghost"
              onClick={() => setIsEditing(true)}
              data-testid="btn-editar-cuestionario"
            >
              <Pencil width={16} height={16} className="a-i" /> Modificar respuestas
            </button>
          </section>
          <div className="flex flex-col gap-3" data-testid="cuestionario-resumen-card">
            {resumen.map(([titulo, valor, clave]) => (
              <div key={clave} className="a-card" style={{ padding: "12px 14px", display: "grid", gap: 2 }}>
                <span className="a-t-label a-muted">{titulo}</span>
                <span className="a-t-bs" data-testid={`cuestionario-resumen-${clave}`}>{valor}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <section className="a-card" style={{ padding: 14, display: "grid", gap: 4 }}>
            <h1 className="a-t-h">Cuestionario inicial</h1>
            <span className="a-t-sec a-muted" data-testid="cuestionario-opcional-badge">
              Opcional. No bloquea tu entrenamiento: ayuda a tu coach a ajustar el plan y las sugerencias de carga.
            </span>
          </section>

          <p className="a-eb a-t-label">1 · Objetivo principal</p>
          {grupo("Objetivo principal", OBJETIVOS_PRESET, objetivo, setObjetivo, "opt-objetivo")}

          <p className="a-eb a-t-label">2 · Experiencia previa</p>
          {grupo("Experiencia previa", EXPERIENCIA_PRESET, experiencia, setExperiencia, "opt-experiencia")}

          <p className="a-eb a-t-label">3 · Días por semana</p>
          <div className="a-chips" role="group" aria-label="Días por semana">
            {[2, 3, 4, 5, 6].map((num) => (
              <button
                key={num}
                type="button"
                aria-pressed={dias === num}
                onClick={() => setDias(num)}
                data-testid={`opt-dias-${num}`}
              >
                {num} días
              </button>
            ))}
          </div>

          <label className="a-eb a-t-label" htmlFor="cuestionario-molestias">
            4 · Molestias o lesiones previas (opcional)
          </label>
          <textarea
            id="cuestionario-molestias"
            rows={3}
            value={molestias}
            onChange={(e) => setMolestias(e.target.value)}
            placeholder="Por ejemplo: molestia lumbar en sentadilla pesada."
            className="a-fin a-t-body"
            data-testid="input-molestias"
          />

          <p className="a-eb a-t-label">5 · Equipamiento</p>
          {grupo("Equipamiento", EQUIPAMIENTO_PRESET, equipamiento, setEquipamiento, "opt-equipamiento")}

          <label className="a-eb a-t-label" htmlFor="cuestionario-comentarios">
            6 · Comentarios para tu coach (opcional)
          </label>
          <textarea
            id="cuestionario-comentarios"
            rows={3}
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            placeholder="Por ejemplo: prefiero entrenar a la tarde."
            className="a-fin a-t-body"
            data-testid="input-comentarios"
          />

          <button type="submit" disabled={isSaving} className="a-btn a-gym" data-testid="submit-cuestionario-btn">
            {isSaving ? "Guardando…" : "Guardar respuestas"}
          </button>
          {isCompleted && isEditing && (
            <button type="button" className="a-btn a-ghost" onClick={() => setIsEditing(false)}>
              Cancelar
            </button>
          )}
        </form>
      )}
    </div>
  );
}
