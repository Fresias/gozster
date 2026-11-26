import React from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudioLoading from "@/app/(coach)/studio/loading";
import { assertNoDemoLiteralsInLiveMode } from "@/test-utils/no-demo-literals";

const ALUMNO_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const DIA_ID = "33333333-3333-4333-8333-333333333331";
const EJ_SENTADILLA = "44444444-4444-4444-8444-444444444441";
const EJ_REMO = "44444444-4444-4444-8444-444444444442";
const ER_SENTADILLA = "55555555-5555-4555-8555-555555555551";
const ER_REMO = "55555555-5555-4555-8555-555555555552";
const SESION_ID = "66666666-6666-4666-8666-666666666666";

function planConUsaBarra(sentadilla: boolean, remo: boolean) {
  return {
    alumnos: [{ id: ALUMNO_ID, nombre_completo: "Alumno Prueba", nivel_vista_alumno: "SIMPLE" }],
    planes: [{ id: PLAN_ID, alumno_id: ALUMNO_ID, nombre: "Fuerza", estado: "ACTIVO" }],
    dias: [{ id: DIA_ID, plan_id: PLAN_ID, orden: 1, nombre: "Día 1" }],
    ejerciciosEnRutina: [
      { id: ER_SENTADILLA, dia_id: DIA_ID, ejercicio_id: EJ_SENTADILLA, orden: 1, series: 2, repeticiones: "8", descanso_segundos: 90, rpe_objetivo: 8 },
      { id: ER_REMO, dia_id: DIA_ID, ejercicio_id: EJ_REMO, orden: 2, series: 2, repeticiones: "10", descanso_segundos: 60, rpe_objetivo: 8 },
    ],
    ejercicios: [
      { id: EJ_SENTADILLA, nombre: "Sentadilla", musculos_principales: ["Cuádriceps"], usa_barra: sentadilla },
      { id: EJ_REMO, nombre: "Remo con barra", musculos_principales: ["Dorsal"], usa_barra: remo },
    ],
  };
}

vi.mock("@/services/alumnos-service", () => ({
  fetchPlanAlumno: vi.fn(async () => null),
}));

import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

function serie(numero: number, completada: boolean, peso: number, reps: number, rpe: number | null) {
  return { numero_serie: numero, peso_kg: peso, reps_hechas: reps, rpe_real: rpe, completada, estimated1RM: 0, set_type: "NORMAL" };
}

/** Sesión en curso persistida (p. ej. en localStorage) con progreso ya registrado. */
function sesionEnCurso(usaBarraSentadilla: boolean | undefined, usaBarraRemo: boolean | undefined) {
  const ej = (id: string, ejercicioId: string, nombre: string, usaBarra: boolean | undefined, series: unknown[]) => ({
    id,
    ejercicio_id: ejercicioId,
    nombre,
    musculos_principales: [],
    descanso_segundos: 90,
    rpe_objetivo: 8,
    repeticiones_objetivo: "8",
    series,
    url_video: null,
    notas: "nota del alumno",
    ...(usaBarra === undefined ? {} : { usa_barra: usaBarra }),
  });
  return {
    id: SESION_ID,
    nombre_rutina: "Alumno Prueba: Día 1",
    fecha: "2026-11-26",
    studentId: ALUMNO_ID,
    studentName: "Alumno Prueba",
    dia_id: DIA_ID,
    ejercicios: [
      ej(ER_SENTADILLA, EJ_SENTADILLA, "Sentadilla", usaBarraSentadilla, [serie(1, true, 100, 8, 8), serie(2, false, 100, 8, null)]),
      ej(ER_REMO, EJ_REMO, "Remo con barra", usaBarraRemo, [serie(1, true, 60, 10, 7), serie(2, true, 62.5, 9, 9)]),
    ],
    molestias: [],
  };
}

function prepararStore(plan: ReturnType<typeof planConUsaBarra>, sesion: ReturnType<typeof sesionEnCurso>) {
  useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [], syncError: null });
  useAthleteStore.getState().resetSessionToDefaults();
  useAthleteStore.setState({
    sesionesCompletadas: [],
    historialSesiones: [],
    planAlumno: plan as any,
    currentSession: sesion as any,
  });
}

describe("GOZS-878 · usa_barra al retomar una sesión en curso", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  it("una sesión persistida sin usa_barra (pre-deploy) recibe el valor fresco del catálogo sin perder progreso", () => {
    const previa = sesionEnCurso(undefined, undefined);
    prepararStore(planConUsaBarra(true, true), previa);

    expect(useAthleteStore.getState().loadStudentSession(ALUMNO_ID, DIA_ID)).toBe(true);

    const { currentSession } = useAthleteStore.getState();
    expect(currentSession.id).toBe(SESION_ID);
    expect(currentSession.ejercicios.map((e) => e.usa_barra)).toEqual([true, true]);
    // Progreso intacto: series, pesos, reps, RPE, notas.
    currentSession.ejercicios.forEach((ej, i) => {
      expect(ej.series).toEqual(previa.ejercicios[i]!.series);
      expect(ej.notas).toBe("nota del alumno");
    });
  });

  it("si el coach cambió usa_barra de true a false, la sesión retomada lo refleja con las series intactas", () => {
    const previa = sesionEnCurso(true, true);
    prepararStore(planConUsaBarra(false, true), previa);

    useAthleteStore.getState().loadStudentSession(ALUMNO_ID, DIA_ID);

    const { currentSession } = useAthleteStore.getState();
    expect(currentSession.id).toBe(SESION_ID);
    expect(currentSession.ejercicios[0]!.usa_barra).toBe(false);
    expect(currentSession.ejercicios[1]!.usa_barra).toBe(true);
    expect(currentSession.ejercicios[0]!.series).toEqual(previa.ejercicios[0]!.series);
    expect(currentSession.ejercicios[1]!.series).toEqual(previa.ejercicios[1]!.series);
  });

  it("si un ejercicio en curso no matchea por id de rutina, usa ejercicio_id; sin match conserva su valor", () => {
    const previa = sesionEnCurso(undefined, true);
    previa.ejercicios[0]!.id = "id-local-legacy";
    previa.ejercicios[1]!.id = "otro-id";
    previa.ejercicios[1]!.ejercicio_id = "ejercicio-fuera-del-plan";
    prepararStore(planConUsaBarra(true, false), previa);

    useAthleteStore.getState().loadStudentSession(ALUMNO_ID, DIA_ID);

    const [sentadilla, huerfano] = useAthleteStore.getState().currentSession.ejercicios;
    expect(sentadilla!.usa_barra).toBe(true);
    expect(huerfano!.usa_barra).toBe(true);
    expect(huerfano!.series).toEqual(previa.ejercicios[1]!.series);
  });
});

describe("GOZS-878 · StudioLoading accesible (paridad WCAG con AthleteLoading)", () => {
  const html = renderToString(React.createElement(StudioLoading));

  it("expone role=status, aria-busy, testid y texto sr-only", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="studio-loading-skeleton"');
    expect(html).toContain('aria-label="Cargando Coach Studio"');
    expect(html).toMatch(/<span class="sr-only">Cargando Coach Studio<\/span>/);
  });

  it("no contiene datos demo (G5)", () => {
    expect(() => assertNoDemoLiteralsInLiveMode(html)).not.toThrow();
  });
});
