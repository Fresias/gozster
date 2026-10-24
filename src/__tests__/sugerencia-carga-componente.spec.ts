import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SugerenciaCarga } from "@/components/athlete/sugerencia-carga";
import type { SugerenciaCarga as Sugerencia } from "@/lib/sugerencia-carga";

const html = (props: Parameters<typeof SugerenciaCarga>[0]) => renderToStaticMarkup(createElement(SugerenciaCarga, props));
// Texto visible, sin etiquetas.
const texto = (h: string) => h.replace(/<[^>]+>/g, "");

const subir: Sugerencia = { tipo: "subir", motivo: "completo", pesoSugerido: 82.5, repsSugeridas: 6, esPesoCorporal: false };
const repetir: Sugerencia = { tipo: "repetir", motivo: "incompleto", pesoSugerido: 80, repsSugeridas: 8, esPesoCorporal: false };

describe("SugerenciaCarga (spec historial-progreso §2.6 / §2.7)", () => {
  it("vacío: sin sugerencia no se renderiza nada", () => {
    expect(html({ sugerencia: null })).toBe("");
  });

  it("subir: título con peso en es-AR, motivo y estilo de éxito", () => {
    const h = html({ sugerencia: subir, pesoActual: 82.5 });
    expect(texto(h)).toBe("Subí a 82,5 kgLa última vez completaste todas las reps.");
    expect(h).toContain('data-testid="sugerencia-carga"');
    expect(h).toContain('data-tipo="subir"');
    expect(h).toContain("border-success/40 bg-success/10");
    expect(h).toContain('aria-live="polite"');
    expect(h).toContain('<span class="font-mono tabular-nums">82,5 kg</span>');
  });

  it("subir a peso corporal: propone reps y nunca 0 kg", () => {
    const h = html({ sugerencia: { ...subir, pesoSugerido: 0, repsSugeridas: 13, esPesoCorporal: true }, repsActuales: 13 });
    expect(texto(h)).toBe("Probá 13 repsLa última vez completaste todas las reps.");
    expect(texto(h)).not.toContain("0 kg");
  });

  it("repetir: neutro, sin rojo ni ámbar", () => {
    const h = html({ sugerencia: repetir, pesoActual: 80 });
    expect(texto(h)).toBe("Repetí 80 kgLa última vez quedaron reps sin completar. Primero completalas con este peso.");
    expect(h).toContain('data-tipo="repetir"');
    expect(h).toContain("border-border bg-secondary/60");
    expect(h).not.toMatch(/destructive|amber|rose|red-/);
  });

  it("repetir por RPE: con sigla en TECNICA y sin sigla en SIMPLE", () => {
    const rpe: Sugerencia = { ...repetir, motivo: "rpe-limite", rpe: 10 };
    expect(texto(html({ sugerencia: rpe, vista: "TECNICA" }))).toContain("La última vez fue al límite (RPE 10).");
    const simple = texto(html({ sugerencia: rpe, vista: "SIMPLE" }));
    expect(simple).toContain("La última vez fue al límite. Repetí y buscá más control.");
    expect(simple).not.toContain("RPE");
  });

  it("repetir sin objetivo numérico", () => {
    expect(texto(html({ sugerencia: { ...repetir, motivo: "mismo-peso" } }))).toBe("Repetí 80 kgMismo peso que la última vez.");
  });

  it("si el alumno cambió el peso, el título baja a muted pero el bloque sigue visible", () => {
    expect(html({ sugerencia: subir, pesoActual: 82.5 })).toContain("text-base font-bold text-foreground");
    const h = html({ sugerencia: subir, pesoActual: 85 });
    expect(h).toContain("text-base font-bold text-muted-foreground");
    expect(h).toContain('data-testid="sugerencia-carga"');
  });

  it("no es un botón: sin onClick, sin foco ni rol interactivo", () => {
    const h = html({ sugerencia: subir });
    expect(h).not.toMatch(/<button|tabindex|role="button"/);
  });
});

describe("live-workout: sugerencia bajo «La última vez» (§2.2 / §2.5)", () => {
  const src = readFileSync(join(process.cwd(), "src/components/athlete/live-workout.tsx"), "utf8");

  it("se renderiza entre «La última vez» y el stepper de Peso", () => {
    const iUltima = src.indexOf("<UltimaVez");
    const iSugerencia = src.indexOf("<SugerenciaCarga");
    const iPeso = src.indexOf("Stepper Peso");
    expect(iUltima).toBeGreaterThan(-1);
    expect(iSugerencia).toBeGreaterThan(iUltima);
    expect(iPeso).toBeGreaterThan(iSugerencia);
  });

  it("los steppers marcan la serie como tocada para no pisar el valor del alumno", () => {
    const tocadas = src.match(/seriesTocadas\.current\.add\(/g) ?? [];
    // precarga + ajuste de peso + ajuste de reps
    expect(tocadas.length).toBeGreaterThanOrEqual(3);
    expect(src).toContain("if (seriesTocadas.current.has(claveSerie)) return;");
  });
});
