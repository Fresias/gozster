import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UltimaVez } from "@/components/athlete/ultima-vez";
import type { UltimaVezEjercicio } from "@/lib/historial-ejercicio";

// Datos inventados: Sentadilla del 12/10 en el plan viejo "Fuerza Base".
const sentadilla: UltimaVezEjercicio = {
  ejercicio_id: "11111111-1111-4111-8111-111111111111",
  fecha: "2026-10-12T13:00:00Z",
  series: [
    { numero_serie: 1, peso_kg: 77.5, reps_hechas: 6, rpe_real: null },
    { numero_serie: 2, peso_kg: 80, reps_hechas: 6, rpe_real: null },
    { numero_serie: 3, peso_kg: 82.5, reps_hechas: 4, rpe_real: null },
  ],
};

const html = (props: Parameters<typeof UltimaVez>[0]) => renderToStaticMarkup(createElement(UltimaVez, props));
// Texto visible, sin etiquetas.
const texto = (h: string) => h.replace(/<[^>]+>/g, "");

describe("UltimaVez (spec historial-progreso §1.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("con datos: muestra la misma serie de la última vez aunque sea de otro plan", () => {
    const h = html({ ultima: sentadilla, numeroSerie: 2 });
    expect(texto(h)).toBe("Última vez:80 kg × 6·12/10");
    expect(h).toContain('data-testid="ultima-vez"');
    expect(h).toContain('aria-label="Última vez, 12 de octubre: 80 kilos por 6 repeticiones"');
    expect(h).toContain("<svg"); // ícono History en la tarjeta
    expect(h).toContain("font-mono font-bold tabular-nums text-foreground");
  });

  it("si hoy va por una serie que aquella vez no hizo, muestra la última que tuvo", () => {
    expect(texto(html({ ultima: sentadilla, numeroSerie: 4 }))).toBe("Última vez:82,5 kg × 4·12/10");
  });

  it("peso corporal: solo reps, nunca 0 kg", () => {
    const dominadas = { ...sentadilla, series: [{ numero_serie: 1, peso_kg: 0, reps_hechas: 12, rpe_real: null }] };
    const t = texto(html({ ultima: dominadas, numeroSerie: 1 }));
    expect(t).toBe("Última vez:12 reps·12/10");
    expect(t).not.toContain("0 kg");
  });

  it("vacío: sin historial muestra «Primera vez con este ejercicio», sin ícono ni peso inventado", () => {
    const h = html({ ultima: null, numeroSerie: 1 });
    expect(texto(h)).toBe("Primera vez con este ejercicio");
    expect(h).toContain("text-muted-foreground");
    expect(h).not.toContain("<svg");
    expect(h).not.toContain("kg");
  });

  it("vacío también cuando nunca se descargó y no hay red (no hay carga en curso)", () => {
    expect(texto(html({ ultima: undefined, numeroSerie: 1, cargando: false }))).toBe("Primera vez con este ejercicio");
  });

  it("cargando: esqueleto que respeta reduced-motion y no se muestra si ya hay datos guardados", () => {
    const h = html({ ultima: undefined, numeroSerie: 1, cargando: true });
    expect(h).toContain('data-testid="ultima-vez-cargando"');
    expect(h).toContain("h-4 w-44 rounded bg-muted animate-pulse motion-reduce:animate-none");
    // Sesión descargada + sin señal: aparece directo, sin esqueleto.
    expect(html({ ultima: sentadilla, numeroSerie: 2, cargando: true })).not.toContain("ultima-vez-cargando");
  });

  it("variante compacta de «Registro del día»: text-xs y sin ícono", () => {
    const h = html({ ultima: sentadilla, numeroSerie: 1, compacta: true });
    expect(h).toContain("text-xs");
    expect(h).not.toContain("<svg");
    expect(texto(h)).toBe("Última vez:77,5 kg × 6·12/10");
  });

  it("fecha de otro año con dd/MM/yy", () => {
    expect(texto(html({ ultima: { ...sentadilla, fecha: "2025-10-12T13:00:00Z" }, numeroSerie: 2 }))).toBe(
      "Última vez:80 kg × 6·12/10/25",
    );
  });

  it("sin «Mynter» en el copy (ADR-005)", () => {
    expect(html({ ultima: sentadilla, numeroSerie: 1 }) + html({ ultima: null, numeroSerie: 1 })).not.toMatch(/mynter/i);
  });
});
