import * as React from "react";
import { Equal, TrendingUp } from "@/components/athlete/icons";
import { motivoSugerencia, partesTitulo, type SugerenciaCarga as Sugerencia } from "@/lib/sugerencia-carga";

// Sugerencia de carga (spec historial-progreso §2). No es un botón: la acción ya
// ocurrió al precargar el stepper. `sugerencia` null = sin historial → no se renderiza.
export function SugerenciaCarga({
  sugerencia,
  vista = "TECNICA",
  pesoActual,
  repsActuales,
}: {
  sugerencia: Sugerencia | null;
  vista?: "SIMPLE" | "TECNICA";
  pesoActual?: number;
  repsActuales?: number;
}) {
  if (!sugerencia) return null;

  const subir = sugerencia.tipo === "subir";
  const { prefijo, valor } = partesTitulo(sugerencia);
  // §2.5: si el alumno ya cambió el valor, el título baja de tono para no gritar.
  const actual = sugerencia.esPesoCorporal ? repsActuales : pesoActual;
  const objetivo = sugerencia.esPesoCorporal ? sugerencia.repsSugeridas : sugerencia.pesoSugerido;
  const difiere = actual !== undefined && actual !== objetivo;

  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 ${subir ? "border-success/40 bg-success/10" : "border-border bg-secondary/60"}`}
      data-testid="sugerencia-carga"
      data-tipo={sugerencia.tipo}
      aria-live="polite"
    >
      <p className={`flex items-center gap-1.5 text-base font-bold ${difiere ? "text-muted-foreground" : "text-foreground"}`}>
        {subir ? (
          <TrendingUp className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <Equal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
        {prefijo} <span className="font-mono tabular-nums">{valor}</span>
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{motivoSugerencia(sugerencia, vista)}</p>
    </div>
  );
}
