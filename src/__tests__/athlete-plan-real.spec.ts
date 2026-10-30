import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fetchPlanAlumno } from "@/services/alumnos-service";
import { useAthleteStore } from "@/store/use-athlete-store";
import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";

const leer = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

/** Cliente Supabase falso: cada tabla responde con sus filas (la cadena de filtros es transparente). */
function clienteFalso(userId: string | null, tablas: Record<string, unknown[]>) {
  const query = (rows: unknown[]) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res({ data: rows, error: null }),
    };
    return q;
  };
  return {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: (t: string) => query(tablas[t] ?? []),
  } as any;
}

const perfil = { id: "u1", nombre_completo: "GABI AGOSTO", rol: "ALUMNO" };
const plan = { id: "p1", alumno_id: "u1", nombre: "GABI AGOSTO", estado: "ACTIVO" };
const dias = [1, 2, 3].map((o) => ({ id: `d${o}`, plan_id: "p1", orden: o, nombre: `D${o}` }));
const ejRutina = [
  { id: "er1", dia_id: "d1", ejercicio_id: "e1", orden: 1, series: 4, repeticiones: "8", descanso_segundos: 90, rpe_objetivo: 8 },
];
const ejercicios = [{ id: "e1", nombre: "Sentadilla", musculos_principales: [] }];

describe("GOZS-285: la Athlete App carga el plan real desde Supabase", () => {
  beforeEach(() => {
    useAthleteStore.setState({ planAlumno: null });
  });

  it("fetchPlanAlumno devuelve el perfil, plan, días y ejercicios del alumno autenticado", async () => {
    const data = await fetchPlanAlumno(
      clienteFalso("u1", {
        perfiles: [perfil],
        planes_entrenamiento: [plan],
        dias_rutina: dias,
        ejercicios_en_rutina: ejRutina,
        ejercicios,
      }),
    );
    expect(data?.alumnos[0]?.nombre_completo).toBe("GABI AGOSTO");
    expect(data?.dias.map((d) => d.nombre)).toEqual(["D1", "D2", "D3"]);
    expect(data?.ejerciciosEnRutina).toHaveLength(1);
  });

  it("alumno sin plan: dataset vacío (nunca la rutina de otro) y sin sesión: null", async () => {
    const sinPlan = await fetchPlanAlumno(clienteFalso("u1", { perfiles: [perfil] }));
    expect(sinPlan?.planes).toEqual([]);
    expect(sinPlan?.dias).toEqual([]);
    expect(await fetchPlanAlumno(clienteFalso(null, {}))).toBeNull();
  });

  it("loadStudentSession arma la sesión con el plan cargado y falla sin plan", () => {
    expect(useAthleteStore.getState().loadStudentSession("u1")).toBe(false);

    useAthleteStore.setState({
      planAlumno: { alumnos: [perfil], planes: [plan], dias, ejerciciosEnRutina: ejRutina, ejercicios } as any,
    });
    expect(useAthleteStore.getState().loadStudentSession("u1", "d1")).toBe(true);
    const s = useAthleteStore.getState().currentSession;
    expect(s.studentName).toBe("GABI AGOSTO");
    expect(s.ejercicios[0]?.nombre).toBe("Sentadilla");
    expect(s.ejercicios[0]?.series).toHaveLength(4);
  });

  it("no queda selector fijo de alumnos ni datos demo en la Athlete App", () => {
    for (const f of ["inicio-mis-dias.tsx", "live-workout.tsx", "historial-sesiones.tsx"]) {
      const code = leer(`../components/athlete/${f}`);
      expect(code).not.toContain("athlete-switcher");
      expect(code).not.toContain("real-mynter-data");
    }
    expect(leer("../store/use-athlete-store.ts")).not.toContain("real-mynter-data");
  });

  it("el helper de seed sigue permitiendo tests con dataset demo", () => {
    sembrarPlanAlumno("Fernando Rosales");
    expect(useAthleteStore.getState().loadStudentSession()).toBe(true);
  });
});
