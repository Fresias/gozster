import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { esSinEntrenar7d } from "@/lib/sin-entrenar";
import { DEMO_GIMNASIO, DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf-8");
const view = read("../components/coach/coach-studio-view.tsx");
const strip = read("../components/coach/business-kpi-strip.tsx");

describe("GOZS-136: franja de 4 KPIs de negocio", () => {
  it("visibilidad: siempre se muestra la franja (ENTRENADOR o ADMIN, GOZS-139), sin banner de retención", () => {
    expect(view).toContain("<BusinessKpiStrip");
    expect(view).not.toContain("showKpiStrip");
    expect(view).not.toContain("RetentionKpiCards");
  });

  it("el click despliega la tabla y aplica el filtro", () => {
    expect(view).toMatch(/setIsAlumnosExpanded\(true\);\s*setSinEntrenarFilter\(true\);/);
    expect(view).toContain("!sinEntrenarFilter || DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids.includes(a.id)");
    expect(view).toContain("sin_entrenar_7d_ids.includes(a.id)");
    expect(view).toContain("Sin entrenar +7 días");
  });

  it("sin entrenar: membresía activa y >7 días o nulo; ids del demo salen de los alumnos", () => {
    const ahora = Date.parse("2026-01-20T12:00:00Z");
    const dias = (d: number) => new Date(ahora - d * 86_400_000).toISOString();
    expect(esSinEntrenar7d({ estado_membresia: "ACTIVA", ultimo_entreno_at: dias(8) }, ahora)).toBe(true);
    expect(esSinEntrenar7d({ estado_membresia: "ACTIVA", ultimo_entreno_at: null }, ahora)).toBe(true);
    expect(esSinEntrenar7d({ estado_membresia: "ACTIVA", ultimo_entreno_at: dias(6) }, ahora)).toBe(false);
    expect(esSinEntrenar7d({ estado_membresia: "INACTIVA", ultimo_entreno_at: dias(30) }, ahora)).toBe(false);
    const ids = new Set(DEMO_GIMNASIO.alumnos.map((a) => a.id));
    expect(DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids.length).toBeGreaterThan(0);
    for (const id of DEMO_KPIS_NEGOCIO.sin_entrenar_7d_ids) expect(ids.has(id)).toBe(true);
  });

  it("grilla, formato es-AR y sin verde/rojo (ámbar solo en Sin entrenar)", () => {
    expect(strip).toContain("grid grid-cols-2 min-[1700px]:grid-cols-4 gap-4");
    expect(strip).toContain('Intl.NumberFormat("es-AR"');
    expect(strip).not.toMatch(/(emerald|green|lime|teal|red|rose)-\d/);
    expect(strip.match(/amber-/g)?.length).toBe(2);
    expect(strip).toContain("bg-amber-400/10 text-amber-300");
  });
});
