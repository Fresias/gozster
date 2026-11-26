const capturedSetStateCalls = vi.hoisted(() => [] as unknown[]);

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const wrappedUseState = ((initial: unknown) => {
    const [val, realSetter] = actual.useState(initial);
    const wrappedSetter = (next: unknown) => {
      capturedSetStateCalls.push(next);
      return (realSetter as (v: unknown) => void)(next);
    };
    return [val, wrappedSetter];
  }) as typeof actual.useState;
  return {
    ...actual,
    useState: wrappedUseState,
    default: {
      ...actual,
      useState: wrappedUseState,
    },
  };
});

import * as React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-test-1" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "test-key",
}));

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: unknown) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: unknown) => unknown) =>
      sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState(),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

import AthleteLoading from "@/app/(athlete)/athlete/loading";
import { EjercicioActivo } from "@/components/athlete/ejercicio-activo";
import { useLiveWorkout } from "@/components/athlete/use-live-workout";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const SESION_BASE: LiveWorkoutSession = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre_rutina: "Rutina Test Superserie",
  fecha: "2026-11-26",
  studentId: "22222222-2222-4222-8222-222222222222",
  studentName: "Atleta Test",
  dia_id: "33333333-3333-4333-8333-333333333333",
  molestias: [],
  ejercicios: [
    {
      id: "ej-ss-1",
      ejercicio_id: "cat-1",
      nombre: "Curl de muñeca inverso",
      musculos_principales: ["Antebrazos"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "20-30",
      es_superserie: true,
      grupo_superserie: 1,
      es_unilateral: true,
      series: [
        { numero_serie: 1, peso_kg: 12.5, reps_hechas: 25, rpe_real: 8, completada: false, estimated1RM: 0 },
        { numero_serie: 2, peso_kg: 12.5, reps_hechas: 25, rpe_real: 8, completada: false, estimated1RM: 0 },
      ],
    },
    {
      id: "ej-ss-2",
      ejercicio_id: "cat-2",
      nombre: "Curl Concentrado",
      musculos_principales: ["Bíceps"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "10-12",
      es_superserie: true,
      grupo_superserie: 1,
      es_unilateral: true,
      series: [
        { numero_serie: 1, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 0 },
        { numero_serie: 2, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 0 },
      ],
    },
    {
      id: "ej-uni-solo",
      ejercicio_id: "cat-3",
      nombre: "Remo con mancuerna",
      musculos_principales: ["Espalda"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "10-12",
      es_unilateral: true,
      series: [
        { numero_serie: 1, peso_kg: 24, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 0 },
      ],
    },
  ],
};

function mountLiveWorkoutWithStateCapture() {
  capturedSetStateCalls.length = 0;

  let api!: ReturnType<typeof useLiveWorkout>;
  function Probe() {
    api = useLiveWorkout();
    return null;
  }
  renderToStaticMarkup(<Probe />);

  return { api, setCalls: capturedSetStateCalls };
}

describe("GOZS-864 · Plausibilidad en Ciclo Superserie / Unilateral D-I y /athlete/loading.tsx", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: SESION_BASE.dia_id!,
      ejercicioAbiertoId: "ej-ss-1",
      sessionStartedAt: null,
      nivelVistaAlumno: "SIMPLE",
      mostrarTimerDescanso: true,
      restTimer: {
        isActive: false,
        isPaused: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        exerciseName: "",
        setNumber: 1,
      },
      currentSession: structuredClone(SESION_BASE),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleRegistrarVueltaSuperserie · validación de plausibilidad atómica", () => {
    it("bloquea la vuelta completa e informa plausibilityError si un ejercicio supera el tope de carga o reps con confirmarAtipica=false", () => {
      const { api, setCalls } = mountLiveWorkoutWithStateCapture();
      const ssGroup = useAthleteStore.getState().currentSession.ejercicios.slice(0, 2);

      // ej-ss-1 válido, ej-ss-2 con peso > 60 kg en bíceps (bloqueado)
      api.handleRegistrarVueltaSuperserie(
        ssGroup,
        1,
        {
          "ej-ss-1": { pesoKg: 12.5, reps: 25 },
          "ej-ss-2": { pesoKg: 120, reps: 12 },
        },
        false,
      );

      const state = useAthleteStore.getState();
      expect(state.currentSession.ejercicios[0]?.series[0]?.completada).toBe(false);
      expect(state.currentSession.ejercicios[1]?.series[0]?.completada).toBe(false);
      expect(state.restTimer.isActive).toBe(false);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      expect(
        setCalls.some((v) => typeof v === "string" && v.includes("supera el tope de 60 kg")),
      ).toBe(true);
    });

    it("bloquea la vuelta si un ejercicio tiene repeticiones > 100 (o en lado izquierdo de parUni)", () => {
      const { api, setCalls } = mountLiveWorkoutWithStateCapture();
      const ssGroup = useAthleteStore.getState().currentSession.ejercicios.slice(0, 2);

      api.handleRegistrarVueltaSuperserie(
        ssGroup,
        1,
        {
          "ej-ss-1": {
            pesoKg: 12.5,
            reps: 25,
            parUni: { D: { kg: 12.5, reps: 25 }, I: { kg: 12.5, reps: 150 } },
          },
          "ej-ss-2": { pesoKg: 12, reps: 12 },
        },
        false,
      );

      const state = useAthleteStore.getState();
      expect(state.currentSession.ejercicios[0]?.series[0]?.completada).toBe(false);
      expect(state.currentSession.ejercicios[1]?.series[0]?.completada).toBe(false);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      expect(
        setCalls.some(
          (v) => typeof v === "string" && v.includes("repeticiones deben ser un número entero entre 0 y 100"),
        ),
      ).toBe(true);
    });

    it("detecta carga atípica respecto a historial (requiere_confirmacion) y solo completa la vuelta al confirmar con confirmarAtipica=true", () => {
      // Marcar vuelta 1 completada para construir historial en ej-ss-1 y ej-ss-2 (12 kg)
      const sesionConHistorial = structuredClone(SESION_BASE);
      sesionConHistorial.ejercicios[0]!.series[0]!.completada = true;
      sesionConHistorial.ejercicios[1]!.series[0]!.completada = true;
      useAthleteStore.setState({ currentSession: sesionConHistorial });

      const { api, setCalls } = mountLiveWorkoutWithStateCapture();
      const ssGroup = useAthleteStore.getState().currentSession.ejercicios.slice(0, 2);

      // En vuelta 2, 45 kg vs 12 kg previos -> ratio 3.75 > 2.5 -> requiere_confirmacion
      api.handleRegistrarVueltaSuperserie(
        ssGroup,
        2,
        {
          "ej-ss-1": { pesoKg: 12.5, reps: 25 },
          "ej-ss-2": { pesoKg: 45, reps: 12 },
        },
        false,
      );

      // No se completó ninguna serie de la vuelta 2
      expect(useAthleteStore.getState().currentSession.ejercicios[0]?.series[1]?.completada).toBe(false);
      expect(useAthleteStore.getState().currentSession.ejercicios[1]?.series[1]?.completada).toBe(false);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);

      // Se emitió atypicalPrompt con contexto de superserie
      expect(
        setCalls.some(
          (v) =>
            typeof v === "object" &&
            v !== null &&
            "peso" in v &&
            (v as { peso: number; isSuperserie?: boolean; exerciseName?: string }).peso === 45 &&
            (v as { isSuperserie?: boolean }).isSuperserie === true &&
            (v as { exerciseName?: string }).exerciseName === "Curl Concentrado",
        ),
      ).toBe(true);

      // Confirmación consciente del atleta (confirmarAtipica = true) completa la vuelta marcando atipica=true
      api.handleRegistrarVueltaSuperserie(
        ssGroup,
        2,
        {
          "ej-ss-1": { pesoKg: 12.5, reps: 25 },
          "ej-ss-2": { pesoKg: 45, reps: 12 },
        },
        true,
      );

      const postConfirm = useAthleteStore.getState();
      expect(postConfirm.currentSession.ejercicios[0]?.series[1]?.completada).toBe(true);
      expect(postConfirm.currentSession.ejercicios[1]?.series[1]?.completada).toBe(true);
      expect(postConfirm.currentSession.ejercicios[1]?.series[1]?.atipica).toBe(true);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(2);
    });
  });

  describe("handleRegistrarParUnilateral · Separar D/I evalúa ambos lados (Math.max)", () => {
    it("dispara plausibilityError cuando par.D es válido pero par.I.reps es inválido (> 100)", () => {
      useAthleteStore.setState({ ejercicioAbiertoId: "ej-uni-solo" });
      const { api, setCalls } = mountLiveWorkoutWithStateCapture();

      api.handleRegistrarParUnilateral(
        { D: { kg: 24, reps: 10 }, I: { kg: 24, reps: 150 } },
        false,
      );

      const ej = useAthleteStore.getState().currentSession.ejercicios.find((e) => e.id === "ej-uni-solo");
      expect(ej?.series[0]?.completada).toBe(false);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      expect(
        setCalls.some(
          (v) => typeof v === "string" && v.includes("repeticiones deben ser un número entero entre 0 y 100"),
        ),
      ).toBe(true);
    });

    it("dispara plausibilityError cuando par.D es válido pero par.I.reps es negativo", () => {
      useAthleteStore.setState({ ejercicioAbiertoId: "ej-uni-solo" });
      const { api, setCalls } = mountLiveWorkoutWithStateCapture();

      api.handleRegistrarParUnilateral(
        { D: { kg: 24, reps: 10 }, I: { kg: 24, reps: -4 } },
        false,
      );

      const ej = useAthleteStore.getState().currentSession.ejercicios.find((e) => e.id === "ej-uni-solo");
      expect(ej?.series[0]?.completada).toBe(false);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      expect(
        setCalls.some(
          (v) => typeof v === "string" && v.includes("repeticiones deben ser un número entero entre 0 y 100"),
        ),
      ).toBe(true);
    });

    it("registra correctamente un par unilateral D/I válido usando el máximo de kg y reps", () => {
      useAthleteStore.setState({ ejercicioAbiertoId: "ej-uni-solo" });
      const { api } = mountLiveWorkoutWithStateCapture();

      api.handleRegistrarParUnilateral(
        { D: { kg: 24, reps: 10 }, I: { kg: 26, reps: 12 } },
        false,
      );

      const ej = useAthleteStore.getState().currentSession.ejercicios.find((e) => e.id === "ej-uni-solo");
      expect(ej?.series[0]?.completada).toBe(true);
      expect(ej?.series[0]?.peso_kg).toBe(26);
      expect(ej?.series[0]?.reps_hechas).toBe(12);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);
    });
  });

  describe("EjercicioActivo · cableado mínimo de confirmación atípica en Ciclo Superserie", () => {
    it("conserva el contrato visual de Ciclo Superserie y cablea confirmación atípica con confirmarAtipica=true", () => {
      const html = renderToStaticMarkup(<EjercicioActivo />);
      expect(html).toContain('data-testid="ss-cycle-card-1-1"');
      expect(html).toContain('data-testid="registrar-serie-btn"');
      expect(html).not.toContain('data-testid="atypical-confirmation-dialog"');

      const src = readFileSync(resolve(process.cwd(), "src/components/athlete/ejercicio-activo.tsx"), "utf8");
      expect(src).toContain('id="kgWarnSS"');
      expect(src).toContain("handleRegistrarVueltaSuperserie(ssEjercicios, vueltaActivaSS, entradas, true)");
      expect(src).toContain("handleRegistrarVueltaSuperserie(ssEjercicios, vueltaActivaSS, entradas, false)");
    });
  });

  describe("src/app/(athlete)/athlete/loading.tsx · esqueleto accesible sin datos demo (G4/G5)", () => {
    it("renderiza esqueleto monocromático accesible con data-testid, role=status y aria-busy=true sin literales demo", () => {
      const html = renderToStaticMarkup(<AthleteLoading />);

      expect(html).toContain('data-testid="athlete-loading-skeleton"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-label="Cargando entrenamiento"');
      expect(html).toContain("animate-pulse");

      // Cero datos demo, nombres reales o strings de ejercicios hardcodeados (G4/G5)
      const textoVisible = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      expect(textoVisible).toBe("Cargando entrenamiento");
      expect(html.toLowerCase()).not.toContain("demo");
      expect(html.toLowerCase()).not.toContain("mynter");
      expect(html.toLowerCase()).not.toContain("sentadilla");
      expect(html.toLowerCase()).not.toContain("press banca");
    });
  });
});
