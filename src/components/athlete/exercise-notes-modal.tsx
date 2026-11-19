"use client";

import * as React from "react";
import { AthleteSheet } from "@/components/athlete/athlete-sheet";
import { Check, X } from "@/components/athlete/icons";
import { parseIndicaciones, tieneIndicaciones } from "@/lib/athlete/indicaciones";
import type { LiveWorkoutExercise } from "@/store/use-athlete-store";

export interface ExerciseNotesModalProps {
  exercise: LiveWorkoutExercise | null;
  isOpen: boolean;
  onClose: () => void;
}

function IndicacionesBloque({ texto }: { texto: string }) {
  const p = parseIndicaciones(texto);
  if (!tieneIndicaciones(p)) return null;

  return (
    <div className="a-ind">
      {p.libre.map((linea, idx) => (
        <p key={`libre-${idx}`} className="a-t-body a-free">
          {linea}
        </p>
      ))}

      {p.pasos.length > 0 && (
        <section>
          <h3 className="a-t-label a-muted">Pasos</h3>
          <ol className="a-steps a-t-body">
            {p.pasos.map((paso, idx) => (
              <li key={`paso-${idx}`}>{paso}</li>
            ))}
          </ol>
        </section>
      )}

      {p.clave.length > 0 && (
        <section>
          <h3 className="a-t-label a-muted">Puntos clave</h3>
          <ul>
            {p.clave.map((item, idx) => (
              <li key={`clave-${idx}`}>
                <Check width={16} height={16} className="a-i" />
                <span className="a-t-body">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.errores.length > 0 && (
        <section>
          <h3 className="a-t-label a-muted">Errores comunes</h3>
          <ul className="a-err">
            {p.errores.map((item, idx) => (
              <li key={`err-${idx}`}>
                <X width={16} height={16} className="a-i" />
                <span className="a-t-body">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(p.tempo || p.respiracion) && (
        <section>
          <h3 className="a-t-label a-muted">Tempo y respiración</h3>
          <div className="a-kv2">
            {p.tempo && (
              <>
                <span className="a-t-label a-muted">Tempo</span>
                <span className="a-t-mm" style={{ fontSize: "1.5rem" }}>
                  {p.tempo}
                </span>
              </>
            )}
            {p.respiracion && (
              <>
                <span className="a-t-label a-muted">Respiración</span>
                <span className="a-t-body">{p.respiracion}</span>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function ExerciseNotesModal({
  exercise,
  isOpen,
  onClose,
}: ExerciseNotesModalProps) {
  if (!isOpen || !exercise) {
    return null;
  }

  const coachNotes = exercise.notas?.trim() || "";
  const libraryNotes = exercise.comentario?.trim() || "";
  const hasBoth = Boolean(coachNotes && libraryNotes && coachNotes !== libraryNotes);
  const principalNotes = coachNotes || libraryNotes;

  const subtitle =
    exercise.musculos_principales.length > 0
      ? `${exercise.nombre} · ${exercise.musculos_principales.join(", ")}`
      : exercise.nombre;

  return (
    <AthleteSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Indicaciones del ejercicio"
      subtitle={subtitle}
      titleId="notes-modal-title"
      closeAriaLabel="Cerrar"
      dialogTestId="exercise-notes-modal"
      titleTestId="exercise-notes-modal-title"
      closeTestId="close-notes-modal-btn"
    >
      <div className="a-ind" data-testid="exercise-notes-content">
        {principalNotes && <IndicacionesBloque texto={principalNotes} />}

        {hasBoth && (
          <section data-testid="indicaciones-biblioteca">
            <h3 className="a-t-label a-muted">De la biblioteca</h3>
            <IndicacionesBloque texto={libraryNotes} />
          </section>
        )}
      </div>

      <button
        type="button"
        className="a-btn a-soft"
        onClick={onClose}
        data-testid="return-to-workout-from-notes-btn"
      >
        Volver al ejercicio
      </button>
    </AthleteSheet>
  );
}
