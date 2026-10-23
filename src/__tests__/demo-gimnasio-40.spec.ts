import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_ALUMNOS,
  DEMO_ALUMNOS_CLASES,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_KPIS_NEGOCIO,
  DEMO_GIMNASIO,
  DEMO_PLANES,
  DEMO_PLANES_MEMBRESIA,
  DEMO_PROFESOR_ID,
} from "@/services/coach-demo-dataset";
import { derivarKpisNegocio, generarDemoGimnasio } from "@/services/coach-demo-generator";
import { esSinEntrenar7d } from "@/lib/sin-entrenar";
import { esAlumnoNuevo } from "@/lib/alumno-nuevo";

const baseReal = {
  profesorId: DEMO_PROFESOR_ID,
  alumnos: [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES],
  planes: DEMO_PLANES,
  contrataciones: DEMO_CONTRATACIONES_CLASES,
  planesMembresia: DEMO_PLANES_MEMBRESIA,
};
const FECHA_REAL = Date.now();
const DIA = 86_400_000;

/** El dataset base es relativo a hoy; lo corremos N días para simular que "hoy" es otra fecha. */
function desplazar<T>(valor: T, ms: number): T {
  return JSON.parse(JSON.stringify(valor), (_k, v) => {
    if (typeof v !== "string") return v;
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(Date.parse(v) + ms).toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(Date.parse(v) + ms).toISOString().slice(0, 10);
    return v;
  });
}
const baseEn = (f: Date): typeof baseReal => desplazar(baseReal, f.getTime() - FECHA_REAL);
// Fechas locales fijas: mitad, inicio y fin de mes, y cruce de año.
const FECHAS = [
  new Date(2026, 9, 23, 12),
  new Date(2026, 9, 2, 9),
  new Date(2026, 0, 1, 10),
  new Date(2026, 2, 15, 18),
  new Date(2026, 11, 31, 22),
];
const esActivo = (estado: string) => estado === "ACTIVA" || estado === "ACTIVE";
describe("GOZS-139: dataset demo de ~40 alumnos con un mes de historia", () => {
  it("es determinista: la misma fecha da el mismo resultado", () => {
    for (const f of FECHAS) {
      const a = generarDemoGimnasio(baseEn(f), f);
      const b = generarDemoGimnasio(baseEn(f), f);
      expect(b).toEqual(a);
      expect(derivarKpisNegocio(b, DEMO_PLANES_MEMBRESIA, f)).toEqual(derivarKpisNegocio(a, DEMO_PLANES_MEMBRESIA, f));
    }
  });

  it("conserva los ids base y llega a 40 alumnos con ids únicos", () => {
    for (const f of FECHAS) {
      const g = generarDemoGimnasio(baseEn(f), f);
      expect(g.alumnos.length).toBe(40);
      expect(new Set(g.alumnos.map((a) => a.id)).size).toBe(40);
      const b = baseEn(f);
      for (const a of b.alumnos) expect(g.alumnos.find((x) => x.id === a.id)).toEqual(a);
      expect(g.planes.slice(0, b.planes.length)).toEqual(b.planes);
    }
  });

  it("rangos de los criterios de aceptación en cualquier fecha", () => {
    for (const f of FECHAS) {
      const g = generarDemoGimnasio(baseEn(f), f);
      const k = derivarKpisNegocio(g, DEMO_PLANES_MEMBRESIA, f);
      const ahora = f.getTime();
      expect(k.sin_entrenar_7d_ids.length).toBeGreaterThanOrEqual(6);
      expect(k.sin_entrenar_7d_ids.length).toBeLessThanOrEqual(8);
      expect(k.cobranza_vencidas).toBeGreaterThanOrEqual(5);
      expect(k.cobranza_vencidas).toBeLessThanOrEqual(7);
      expect(k.cobranza_pct).toBeGreaterThanOrEqual(70);
      expect(k.cobranza_pct).toBeLessThanOrEqual(90);
      expect(k.altas_mes).toBeGreaterThanOrEqual(3);
      expect(k.altas_mes).toBeLessThanOrEqual(5);
      expect(k.bajas_mes).toBeGreaterThanOrEqual(1);
      expect(k.bajas_mes).toBeLessThanOrEqual(3);

      const activos = g.alumnos.filter((a) => esActivo(a.estado_membresia));
      const sinPlan = activos.filter((a) => !g.planes.some((p) => p.alumno_id === a.id && p.estado === "ACTIVO"));
      expect(sinPlan.length).toBeGreaterThanOrEqual(3);
      expect(sinPlan.length).toBeLessThanOrEqual(5);
      // El filtro "Sin entrenar" de la tabla devuelve exactamente los ids del KPI.
      expect(g.alumnos.filter((a) => esSinEntrenar7d(a, ahora)).map((a) => a.id)).toEqual(k.sin_entrenar_7d_ids);
      // "Nuevos" incluye las altas del mes.
      expect(g.alumnos.filter((a) => esAlumnoNuevo(a.created_at, ahora)).length).toBeGreaterThanOrEqual(k.altas_mes);
    }
  });

  it("al menos 65 % de los vencimientos cae entre el día 1 y el 10, con casos fuera de término y vencidos", () => {
    for (const f of FECHAS) {
      const g = generarDemoGimnasio(baseEn(f), f);
      const dias = g.contrataciones.map((c) => c.dia_vencimiento);
      expect(dias.length).toBe(g.alumnos.length);
      const enTermino = dias.filter((d) => d >= 1 && d <= 10).length;
      expect(enTermino / dias.length).toBeGreaterThanOrEqual(0.65);
      expect(dias.some((d) => d >= 11 && d <= 25)).toBe(true);
      expect(g.contrataciones.some((c) => c.estado === "VENCIDA")).toBe(true);
    }
  });

  it("planes variados y series verosímiles", () => {
    const g = generarDemoGimnasio(baseReal, new Date(FECHA_REAL));
    expect(new Set(g.planes.map((p) => p.nombre)).size).toBeGreaterThanOrEqual(8);
    for (const e of Object.values(g.historial).flat()) {
      for (const s of e.series) {
        expect(s.peso_kg).toBeGreaterThan(0);
        expect(s.reps_hechas).toBeGreaterThanOrEqual(6);
        expect(s.reps_hechas).toBeLessThanOrEqual(12);
        expect(s.rpe_real).toBeGreaterThanOrEqual(6.5);
        expect(s.rpe_real).toBeLessThanOrEqual(9.5);
      }
    }
  });

  it("todo alumno tiene historial del último mes, salvo las altas de esta semana", () => {
    for (const f of FECHAS) {
      const g = generarDemoGimnasio(baseEn(f), f);
      const ahora = f.getTime();
      for (const a of g.alumnos) {
        if (ahora - Date.parse(a.created_at) < 7 * DIA) continue;
        const ses = g.historial[a.id] ?? [];
        expect(ses.length, a.nombre_completo).toBeGreaterThan(0);
        for (const s of ses) expect(ahora - Date.parse(s.sesion.fecha)).toBeLessThanOrEqual(31 * DIA);
        // ultimo_entreno_at sale de la última sesión (alumnos generados).
        if (a.id.startsWith("demo-alumno-g")) expect(ses[0]!.sesion.fecha).toBe(a.ultimo_entreno_at);
      }
    }
  });

  it("DEMO_KPIS_NEGOCIO se deriva del dataset con las reglas de la RPC", () => {
    const k = DEMO_KPIS_NEGOCIO;
    const g = DEMO_GIMNASIO;
    const ahora = new Date();
    const delMes = (iso: string) => {
      const d = new Date(iso);
      return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
    };
    expect(k.ingresos_mes).toBe(
      g.pagos.filter((p) => p.confirmado_at && delMes(p.confirmado_at)).reduce((s, p) => s + p.monto, 0),
    );
    expect(k.ingresos_ultimos_6_meses).toHaveLength(6);
    expect(k.ingresos_ultimos_6_meses[5]).toBe(k.ingresos_mes);
    expect([...k.ingresos_ultimos_6_meses].sort((a, b) => a - b)).toEqual(k.ingresos_ultimos_6_meses);
    expect(k.alumnos_activos).toBe(g.alumnos.filter((a) => esActivo(a.estado_membresia)).length);
    expect(k.sin_entrenar_7d_ids).toEqual(g.alumnos.filter((a) => esSinEntrenar7d(a)).map((a) => a.id));
    expect(k.cobranza_pct).toBe(Math.round((k.ingresos_mes / (k.ingresos_mes + k.cobranza_faltante)) * 100));
    const prev = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    expect(k.ingresos_mes_anterior_label).toBe(new Intl.DateTimeFormat("es-AR", { month: "short" }).format(prev));
  });

  it("conserva los alumnos base de los que dependen las alertas", () => {
    expect(DEMO_GIMNASIO.alumnos.some((a) => a.id === "demo-alumno-02-celeste")).toBe(true);
    expect(DEMO_ALUMNOS.length).toBe(10);
  });
});

describe("GOZS-139: visibilidad de la franja por modo y rol", () => {
  const view = fs.readFileSync(path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"), "utf-8");

  it("en Testeo la ve cualquier usuario del middleware de /studio, sin condición de rol", () => {
    expect(view).toContain("const showKpiStrip = isTestMode;");
    expect(view).not.toMatch(/rolActual|useRolActual/);
  });

  it("en Producción se mantiene el banner de retención", () => {
    expect(view).toMatch(/\{showKpiStrip \? \(\s*<BusinessKpiStrip[\s\S]*?\) : \(\s*<RetentionKpiCards/);
  });
});
