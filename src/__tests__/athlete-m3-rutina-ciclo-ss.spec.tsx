import * as React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState()),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

import { EjercicioActivo } from "@/components/athlete/ejercicio-activo";
import { RutinaDelDia } from "@/components/athlete/rutina-del-dia";
import { useLiveWorkout } from "@/components/athlete/use-live-workout";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const SESION_SS: LiveWorkoutSession = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre_rutina: "Gabriel: Tren superior",
  fecha: "2026-11-26",
  studentId: "22222222-2222-4222-8222-222222222222",
  studentName: "Gabriel",
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
      repeticiones_objetivo: "12-10",
      es_superserie: true,
      grupo_superserie: 1,
      es_unilateral: true,
      series: [
        { numero_serie: 1, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 0 },
        { numero_serie: 2, peso_kg: 12, reps_hechas: 12, rpe_real: 8, completada: false, estimated1RM: 0 },
      ],
    },
    {
      id: "ej-solo-3",
      ejercicio_id: "cat-3",
      nombre: "Jalón al pecho agarre neutro",
      musculos_principales: ["Espalda"],
      descanso_segundos: 120,
      rpe_objetivo: 8,
      repeticiones_objetivo: "10-12",
      series: [
        { numero_serie: 1, peso_kg: 60, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 0 },
      ],
    },
  ],
};

describe("GOZS-853 · Rediseño M3+v7 Opción 4 Final y Ciclo Unificado de Superserie", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: SESION_SS.dia_id!,
      ejercicioAbiertoId: null,
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
      currentSession: structuredClone(SESION_SS),
    });
  });

  it("RutinaDelDia: anillo monocromático sin 0/5 series, píldora SS sin '?', sin '1 descanso al final' y sin botón de molestia", () => {
    const html = renderToStaticMarkup(<RutinaDelDia />);
    expect(html).toContain('data-testid="rutina-progress-card"');
    expect(html).toContain("a-ring-fill");
    expect(html).not.toContain("0/5 series");
    expect(html).not.toContain("Gabriel ·");
    expect(html).toContain("3 ejercicios · ~");
    expect(html).toContain('data-testid="ss-pill-1"');
    expect(html).toContain(">SS</button>");
    expect(html).not.toContain("1 descanso al final");
    expect(html).not.toContain('data-testid="header-pain-report-btn"');
  });

  it("EjercicioActivo en Superserie: renderiza Ciclo Unificado con los ejercicios del grupo y 1 solo CTA de vuelta", () => {
    useAthleteStore.setState({ ejercicioAbiertoId: "ej-ss-1" });
    const html = renderToStaticMarkup(<EjercicioActivo />);
    expect(html).toContain('data-testid="ss-cycle-card-1-1"');
    expect(html).toContain('data-testid="ss-cycle-item-ej-ss-1"');
    expect(html).toContain('data-testid="ss-cycle-item-ej-ss-2"');
    expect(html).toContain('data-testid="ss-uni-same-ej-ss-1"');
    expect(html).toContain('data-testid="ss-uni-split-ej-ss-1"');
    expect(html).toContain("Registrar vuelta 1 · 90 s");
    expect(html).toContain('data-testid="exercise-pain-report-btn-ej-ss-1"');
    expect(html).not.toContain(">Tengo una molestia<");
  });

  it("handleRegistrarVueltaSuperserie registra todos los ejercicios de la vuelta en 1 paso y activa un único descanso al final", () => {
    useAthleteStore.setState({ ejercicioAbiertoId: "ej-ss-1" });
    let api!: ReturnType<typeof useLiveWorkout>;
    function Probe() {
      api = useLiveWorkout();
      return null;
    }
    renderToStaticMarkup(<Probe />);

    const ssGroup = useAthleteStore.getState().currentSession.ejercicios.slice(0, 2);
    api.handleRegistrarVueltaSuperserie(ssGroup, 1, {
      "ej-ss-1": { pesoKg: 12.5, reps: 25, parUni: { D: { kg: 12.5, reps: 25 }, I: { kg: 12.5, reps: 25 } } },
      "ej-ss-2": { pesoKg: 14, reps: 12, parUni: { D: { kg: 12, reps: 12 }, I: { kg: 14, reps: 12 } } },
    });

    const state = useAthleteStore.getState();
    expect(state.currentSession.ejercicios[0]?.series[0]?.completada).toBe(true);
    expect(state.currentSession.ejercicios[1]?.series[0]?.completada).toBe(true);
    expect(state.currentSession.ejercicios[1]?.series[0]?.peso_kg).toBe(14);
    expect(state.currentSession.ejercicios[0]?.series[1]?.completada).toBe(false);
    // Descanso único disparado al cerrar la vuelta completa
    expect(state.restTimer.isActive).toBe(true);
    expect(state.restTimer.totalSeconds).toBe(90);
    // Ambas series encoladas para sync offline
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(2);
  });

  it("athlete-v7.css: anillo monocromático usa var(--a-fg) con transición suave >= 1000ms y sin verde en .a-ring-fill", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/(athlete)/athlete/athlete-v7.css"), "utf8");
    const ringFill = css.match(/\.theme-athlete\[data-v7\] \.a-ring-fill\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(ringFill).toContain("stroke: var(--a-fg)");
    expect(ringFill).toMatch(/transition:\s*stroke-dashoffset\s+1\d{3}ms/);
    expect(ringFill).not.toContain("--a-ok");
  });
});
