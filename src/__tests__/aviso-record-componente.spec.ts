import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvisoRecord, type AvisoRecordProps } from "@/components/athlete/aviso-record";
import type { ResultadoRecord } from "@/lib/record-ejercicio";

const html = (props: AvisoRecordProps) => renderToStaticMarkup(createElement(AvisoRecord, props));
const texto = (h: string) => h.replace(/<[^>]+>/g, "");

const record = (over: Partial<ResultadoRecord>): ResultadoRecord => ({
  esRecord: true,
  tipo: "peso",
  epley_kg: null,
  delta_epley_kg: null,
  ...over,
});

describe("AvisoRecord (spec historial-progreso §3.5, §3.6)", () => {
  it("récord de peso: título, carga en font-mono y «tu mejor marca en»", () => {
    const h = html({
      resultado: record({ tipo: "peso" }),
      serie: { peso_kg: 85, reps_hechas: 5 },
      nombreEjercicio: "Sentadilla",
    });
    expect(texto(h)).toContain("¡Nuevo récord!");
    expect(texto(h)).toContain("85 kg × 5 · tu mejor marca en Sentadilla");
    expect(h).toContain('data-testid="nuevo-record-banner"');
    expect(h).toContain('role="status"');
    expect(h).toContain('aria-live="polite"');
    expect(h).toContain("font-mono font-bold tabular-nums");
    expect(h).toContain("border-warning");
  });

  it("récord de reps resalta las reps", () => {
    const h = html({
      resultado: record({ tipo: "reps" }),
      serie: { peso_kg: 80, reps_hechas: 9 },
      nombreEjercicio: "Sentadilla",
    });
    expect(texto(h)).toContain("80 kg × 9 · nunca hiciste tantas reps con este peso");
  });

  it("peso corporal: solo reps, nunca 0 kg", () => {
    const t = texto(
      html({
        resultado: record({ tipo: "reps" }),
        serie: { peso_kg: 0, reps_hechas: 14 },
        nombreEjercicio: "Dominadas",
      }),
    );
    expect(t).toContain("14 reps · tu mejor marca en Dominadas");
    expect(t).not.toContain("0 kg");
  });

  it("vista TECNICA agrega la línea de 1RM estimado", () => {
    const h = html({
      resultado: record({ tipo: "peso", epley_kg: 99.2, delta_epley_kg: 3.1 }),
      serie: { peso_kg: 100, reps_hechas: 2 },
      nombreEjercicio: "Sentadilla",
      tecnica: true,
    });
    expect(texto(h)).toContain("1RM estimado: 99 kg (+3 kg)");
  });

  it("vista SIMPLE nunca menciona 1RM (ADR-004)", () => {
    const props = {
      resultado: record({ tipo: "peso", epley_kg: 99.2, delta_epley_kg: 3.1 }),
      serie: { peso_kg: 100, reps_hechas: 2 },
      nombreEjercicio: "Sentadilla",
    };
    expect(html({ ...props, tecnica: false })).not.toMatch(/1RM/i);
    // Por defecto (sin tecnica) también es SIMPLE.
    expect(html(props)).not.toMatch(/1RM/i);
  });

  it("no renderiza nada si la serie no es récord", () => {
    const h = html({
      resultado: record({ esRecord: false, tipo: null }),
      serie: { peso_kg: 80, reps_hechas: 6 },
      nombreEjercicio: "Sentadilla",
    });
    expect(h).toBe("");
  });

  it("botón de cierre táctil de 48×48 px con etiqueta accesible", () => {
    const h = html({
      resultado: record({}),
      serie: { peso_kg: 85, reps_hechas: 5 },
      nombreEjercicio: "Sentadilla",
    });
    expect(h).toContain('aria-label="Cerrar aviso de récord"');
    expect(h).toContain("h-12 w-12");
  });

  it("sin emojis en el texto ni referencias a «Mynter» (ADR-005)", () => {
    const h = html({
      resultado: record({}),
      serie: { peso_kg: 85, reps_hechas: 5 },
      nombreEjercicio: "Sentadilla",
    });
    expect(h).not.toMatch(/mynter/i);
    expect(texto(h)).not.toMatch(/💪|🔥|bestia|increíble/i);
  });
});
