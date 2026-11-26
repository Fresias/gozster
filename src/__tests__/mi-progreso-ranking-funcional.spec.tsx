import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MiProgreso, type MiProgresoProps } from "@/components/athlete/mi-progreso";
import type { MiProgresoData, RankingFuncionalFila } from "@/lib/mi-progreso";

const renderHtml = (props: MiProgresoProps) => renderToStaticMarkup(createElement(MiProgreso, props));

const RANKING_FUNCIONAL: RankingFuncionalFila[] = [
  {
    ejercicio_id: "11111111-1111-4111-8111-111111111111",
    es_usuario_actual: true,
    nombre_corto: "Sofía M.",
    sexo: "F",
    peso_kg: 60,
    reps: 5,
    fecha: "2026-11-20",
    ratio: 1.05,
    posicion: 2,
  },
  {
    ejercicio_id: "11111111-1111-4111-8111-111111111111",
    es_usuario_actual: false,
    nombre_corto: "Camila R.",
    sexo: "F",
    peso_kg: 70,
    reps: 5,
    fecha: "2026-11-19",
    ratio: 1.18,
    posicion: 1,
  },
];

const DATA_VACIA: MiProgresoData = {
  sesiones_mes: 0,
  sesiones_mes_anterior: 0,
  volumen_mes_kg: 0,
  ejercicios: [],
};

describe("GOZS-853 · MiProgreso muestra Ranking Funcional a alumnos presenciales sin historial de musculación", () => {
  it("con data=null (sinHistorial=true) y rankingFuncional.length > 0 renderiza RankingFuncionalAlumno y NO EstadoVacio", () => {
    const html = renderHtml({
      estado: "listo",
      vista: "SIMPLE",
      data: null,
      rankingFuncional: RANKING_FUNCIONAL,
    });
    expect(html).toContain('data-testid="ranking-funcional-alumno"');
    expect(html).toContain('data-testid="ranking-funcional-propia"');
    expect(html).toContain("Sofía M. (vos)");
    expect(html).not.toContain('data-testid="progreso-vacio"');
    expect(html).not.toContain("Sesiones este mes");
  });

  it("con data vacía (sesiones_mes=0, ejercicios=[]) y rankingFuncional.length > 0 renderiza RankingFuncionalAlumno", () => {
    const html = renderHtml({
      estado: "listo",
      vista: "SIMPLE",
      data: DATA_VACIA,
      rankingFuncional: RANKING_FUNCIONAL,
    });
    expect(html).toContain('data-testid="ranking-funcional-alumno"');
    expect(html).not.toContain('data-testid="progreso-vacio"');
    expect(html).not.toContain("Sesiones este mes");
  });

  it("con sinHistorial=true y rankingFuncional vacío sí renderiza EstadoVacio", () => {
    const html = renderHtml({
      estado: "listo",
      vista: "SIMPLE",
      data: DATA_VACIA,
      rankingFuncional: [],
    });
    expect(html).toContain('data-testid="progreso-vacio"');
    expect(html).not.toContain('data-testid="ranking-funcional-alumno"');
  });

  it("progreso/page.tsx incluye rankingAlumno.length > 0 dentro de tieneDatosLocales", () => {
    const pageSrc = readFileSync(resolve(process.cwd(), "src/app/(athlete)/athlete/progreso/page.tsx"), "utf8");
    expect(pageSrc).toMatch(/const tieneDatosLocales\s*=\s*Boolean\([^)]*rankingAlumno\.length\s*>\s*0[^)]*\)/);
  });
});
