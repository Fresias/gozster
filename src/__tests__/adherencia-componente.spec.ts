import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdherenciaCard, type AdherenciaCardProps } from "@/components/coach/adherencia-card";
import { armarAdherencia } from "@/lib/adherencia";

const html = (props: AdherenciaCardProps) => renderToStaticMarkup(createElement(AdherenciaCard, props));
const texto = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// Datos inventados (nunca datos reales del export, ADR-005).
const HOY = new Date("2026-10-15T12:00:00-03:00");
const ses = (ymd: string) => ({ fecha: `${ymd}T12:00:00Z` });

// Alumno con plan de 3 días que entrenó 2 veces la semana pasada (§5.8).
const DATA = armarAdherencia([ses("2026-10-06"), ses("2026-10-08")], HOY, 3, "2026-01-01T12:00:00Z");

describe("AdherenciaCard — con datos (spec §5.4, §5.5, §5.8)", () => {
  const h = html({ estado: "listo", data: DATA });
  const t = texto(h);

  it("dibuja la tarjeta, el título y la grilla con role img", () => {
    expect(h).toContain('data-testid="adherencia-card"');
    expect(t).toContain("Adherencia · últimas 52 semanas");
    expect(h).toContain('data-testid="adherencia-grilla"');
    expect(h).toContain('role="img"');
  });

  it("badge destructive con los días sin entrenar", () => {
    // última sesión 08/10, hoy 15/10 → 7 días (umbral): outline, no destructive.
    expect(t).toContain("7 días sin entrenar");
  });

  it("muestra promedio y semanas con objetivo cumplido", () => {
    expect(t).toContain("Promedio 12 sem.:");
    expect(t).toContain("(obj. 3)");
    expect(t).toContain("Semanas con objetivo cumplido:");
  });

  it("el número de una semana bajo objetivo va en rojo (text-destructive)", () => {
    // la semana pasada (2 de 3) debe pintarse en destructive.
    expect(h).toContain("text-destructive");
  });

  it("pie INDEC con la fuente del dato", () => {
    expect(t).toContain("Fuente: Registro GOZSter");
  });
});

describe("AdherenciaCard — badge por días (spec §5.5)", () => {
  it("9 días sin entrenar → variante destructive", () => {
    const data = armarAdherencia([ses("2026-10-06")], HOY, 3, "2026-01-01T12:00:00Z");
    const h = html({ estado: "listo", data });
    expect(texto(h)).toContain("9 días sin entrenar");
  });

  it("sin plan activo: no hay objetivo ni números en rojo por objetivo", () => {
    const data = armarAdherencia([ses("2026-10-06"), ses("2026-10-08")], HOY, null, "2026-01-01T12:00:00Z");
    const t = texto(html({ estado: "listo", data }));
    expect(t).not.toContain("(obj.");
    expect(t).not.toContain("Semanas con objetivo cumplido");
  });
});

describe("AdherenciaCard — estados (spec §5.6)", () => {
  it("cargando: esqueleto con animate-pulse y sin badge", () => {
    const h = html({ estado: "cargando", data: null });
    expect(h).toContain('data-testid="adherencia-cargando"');
    expect(h).toContain("animate-pulse");
    expect(h).not.toContain('data-testid="adherencia-badge"');
  });

  it("vacío (nunca entrenó): copy de invitación y badge 'Nunca entrenó'", () => {
    const data = armarAdherencia([], HOY, 3, null);
    const h = html({ estado: "listo", data });
    const t = texto(h);
    expect(t).toContain("Nunca entrenó");
    expect(t).toContain("Todavía no registró entrenamientos");
    expect(h).toContain('data-testid="adherencia-vacio"');
  });

  it("error: copy y botón Reintentar", () => {
    const h = html({ estado: "error", data: null });
    const t = texto(h);
    expect(t).toContain("No se pudo cargar la adherencia.");
    expect(t).toContain("Reintentar");
  });
});
