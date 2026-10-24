import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MiProgreso, type MiProgresoProps } from "@/components/athlete/mi-progreso";
import type { MiProgresoData } from "@/lib/mi-progreso";

const html = (props: MiProgresoProps) => renderToStaticMarkup(createElement(MiProgreso, props));
const texto = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// Datos inventados (nunca datos reales del export, ADR-005).
const DATA: MiProgresoData = {
  sesiones_mes: 9,
  sesiones_mes_anterior: 7,
  volumen_mes_kg: 42350,
  ejercicios: [
    {
      ejercicio_id: "11111111-1111-4111-8111-111111111111",
      nombre: "Sentadilla",
      a_peso_corporal: false,
      puntos: [
        { fecha: "2026-08-10T10:00:00Z", peso_max_kg: 75, reps_max: 6, epley_max_kg: 90 },
        { fecha: "2026-09-10T10:00:00Z", peso_max_kg: 80, reps_max: 5, epley_max_kg: 93 },
        { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 85, reps_max: 5, epley_max_kg: 99 },
      ],
    },
    {
      ejercicio_id: "33333333-3333-4333-8333-333333333333",
      nombre: "Dominadas",
      a_peso_corporal: true,
      puntos: [
        { fecha: "2026-08-10T10:00:00Z", peso_max_kg: 0, reps_max: 10, epley_max_kg: 0 },
        { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 0, reps_max: 14, epley_max_kg: 0 },
      ],
    },
    {
      ejercicio_id: "44444444-4444-4444-8444-444444444444",
      nombre: "Peso muerto",
      a_peso_corporal: false,
      puntos: [{ fecha: "2026-10-10T10:00:00Z", peso_max_kg: 120, reps_max: 3, epley_max_kg: 132 }],
    },
  ],
};

const props = (over: Partial<MiProgresoProps>): MiProgresoProps => ({
  estado: "listo",
  vista: "SIMPLE",
  data: DATA,
  ...over,
});

describe("MiProgreso — vista SIMPLE (spec historial-progreso §4.6, §4.8)", () => {
  const h = html(props({ vista: "SIMPLE" }));
  const t = texto(h);

  it("muestra sesiones del mes y del mes pasado", () => {
    expect(t).toContain("Sesiones este mes");
    expect(t).toContain("9");
    expect(t).toContain("el mes pasado:");
    expect(t).toContain("7");
  });

  it("muestra los ejercicios con su número grande y el delta", () => {
    expect(h).toContain('data-testid="progreso-ejercicio"');
    expect(t).toContain("Sentadilla");
    expect(t).toContain("85 kg");
    expect(t).toContain("+10 kg desde agosto");
  });

  it("peso corporal: el número son reps, nunca 0 kg", () => {
    expect(t).toContain("14 reps");
    expect(t).not.toMatch(/\b0 kg/); // nunca "0 kg" como marca (sí puede haber "120 kg")
  });

  it("dibuja la línea SVG (una sola) y el punto final", () => {
    expect(h).toContain("<polyline");
    expect(h).not.toContain("stroke-dasharray");
    expect(h).toContain('role="img"');
  });

  it("ejercicio con 1 sola sesión: invita a volver en vez de dibujar la línea", () => {
    expect(t).toContain("Con 2 sesiones vas a ver tu línea de progreso.");
  });

  it("NO aparecen las palabras 1RM, volumen ni RPE", () => {
    expect(t).not.toContain("1RM");
    expect(t.toLowerCase()).not.toContain("volumen");
    expect(t).not.toContain("RPE");
  });
});

describe("MiProgreso — vista TECNICA (spec historial-progreso §4.6, §4.8)", () => {
  const h = html(props({ vista: "TECNICA" }));
  const t = texto(h);

  it("agrega el volumen del mes", () => {
    expect(t).toContain("Volumen del mes: 42.350 kg");
  });

  it("agrega el 1RM estimado y la segunda línea punteada con leyenda", () => {
    expect(t).toContain("1RM est. 99 kg");
    expect(h).toContain('stroke-dasharray="3 3"');
    expect(t).toContain("1RM estimado");
  });

  it("peso corporal no inventa 1RM (sin línea punteada en esa tarjeta)", () => {
    // Dominadas (peso corporal) no debe mostrar "1RM est." pese a estar en TECNICA.
    expect(t).not.toContain("1RM est. 0");
  });
});

describe("MiProgreso — estados (spec historial-progreso §4.5)", () => {
  it("vacío: ícono, copy y botón «Ir a entrenar» hacia /athlete", () => {
    const h = html(props({ data: { sesiones_mes: 0, sesiones_mes_anterior: 0, volumen_mes_kg: 0, ejercicios: [] } }));
    const t = texto(h);
    expect(t).toContain("Todavía no hay entrenamientos");
    expect(t).toContain("Ir a entrenar");
    expect(h).toContain('href="/athlete"');
  });

  it("cargando: esqueleto con animate-pulse", () => {
    const h = html(props({ estado: "cargando", data: null }));
    expect(h).toContain('data-testid="mi-progreso-cargando"');
    expect(h).toContain("animate-pulse");
  });

  it("offline sin datos: CloudOff y copy de reconexión", () => {
    const t = texto(html(props({ estado: "offline-sin-datos", data: null })));
    expect(t).toContain("Sin conexión. Conectate para ver tu progreso.");
  });

  it("offline con datos: aviso con la fecha de descarga", () => {
    const t = texto(html(props({ offline: true, fechaDescarga: "2026-10-23T12:00:00Z" })));
    expect(t).toContain("Sin conexión · datos del 23/10");
  });
});
