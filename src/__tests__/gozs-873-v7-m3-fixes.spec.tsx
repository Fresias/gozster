import * as fs from "fs";
import * as path from "path";
import * as React from "react";
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
import { resolverPrecargaSerie } from "@/components/athlete/use-live-workout";
import { calcularProgresoVueltasSuperserie } from "@/lib/superserie-vueltas";
import { filtrarEjercicios } from "@/lib/rutinas-biblioteca";
import { sugerirCarga } from "@/lib/sugerencia-carga";
import type { UltimaVezEjercicio } from "@/lib/historial-ejercicio";
import { useAthleteStore, type LiveWorkoutExercise, type LiveWorkoutSession, type LiveWorkoutSet } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { Ejercicio } from "@/types/database.types";

const set = (n: number, peso: number, reps: number, completada = false, set_type?: LiveWorkoutSet["set_type"]): LiveWorkoutSet => ({
  numero_serie: n,
  peso_kg: peso,
  reps_hechas: reps,
  rpe_real: null,
  completada,
  estimated1RM: 0,
  ...(set_type ? { set_type } : {}),
});

const ejercicio = (over: Partial<LiveWorkoutExercise>): LiveWorkoutExercise => ({
  id: "ej-x",
  ejercicio_id: "cat-x",
  nombre: "Ejercicio",
  musculos_principales: ["Espalda"],
  descanso_segundos: 90,
  rpe_objetivo: 8,
  repeticiones_objetivo: "10-12",
  series: [set(1, 55, 12), set(2, 55, 12)],
  ...over,
});

const sesion = (ejercicios: LiveWorkoutExercise[]): LiveWorkoutSession => ({
  id: "11111111-1111-4111-8111-111111111111",
  nombre_rutina: "DÍA 1",
  fecha: "2026-11-26",
  studentId: "22222222-2222-4222-8222-222222222222",
  studentName: "Alumno",
  dia_id: "33333333-3333-4333-8333-333333333333",
  molestias: [],
  ejercicios,
});

function abrir(ejercicios: LiveWorkoutExercise[], abiertoId: string, extra: Record<string, unknown> = {}) {
  useAthleteStore.setState({
    onboardingCompletado: true,
    diaActivoId: "33333333-3333-4333-8333-333333333333",
    ejercicioAbiertoId: abiertoId,
    sessionStartedAt: Date.now() - 60_000,
    nivelVistaAlumno: "SIMPLE",
    vistaRecomendadaCoach: "SIMPLE",
    vistaElegidaPorAlumno: null,
    toastSesion: null,
    currentSession: sesion(ejercicios),
    ...extra,
  });
  return renderToStaticMarkup(<EjercicioActivo />);
}

describe("GOZS-873 · fixes visuales y funcionales v7 + M3", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useAthleteStore.setState({ ultimaVez: {} });
  });

  describe("b) cartel verde redundante", () => {
    it("GIVEN sugerencia 'repetir' THEN muestra Última vez y NO renderiza .a-sug", () => {
      const ultima: UltimaVezEjercicio = {
        ejercicio_id: "cat-jalon",
        fecha: "2026-11-20T10:00:00Z",
        series: [{ numero_serie: 1, peso_kg: 55, reps_hechas: 12, rpe_real: null }],
        sesiones: [],
      };
      expect(
        sugerirCarga(ultima, { numeroSerie: 1, repeticionesObjetivo: "10-12", seriesPrescriptas: 2, musculosPrincipales: ["Espalda"] })?.tipo,
      ).toBe("repetir");
      const html = abrir([ejercicio({ id: "ej-jalon", ejercicio_id: "cat-jalon" })], "ej-jalon", {
        ultimaVez: { "cat-jalon": ultima },
      });
      expect(html).toContain('data-testid="ultima-vez"');
      expect(html).toContain("55 kg × 12");
      expect(html).not.toContain('data-testid="sugerencia-carga"');
      expect(html).not.toContain("Repetí");
    });
  });

  describe("c) Barra + Aproximación", () => {
    it("GIVEN usa_barra = false y 55 kg THEN NO aparece Aproximación ni chip Barra", () => {
      const html = abrir(
        [ejercicio({ id: "ej-jalon", nombre: "Jalón al pecho agarre neutro", usa_barra: false })],
        "ej-jalon",
      );
      expect(html).not.toContain('data-testid="warmup-sets-section"');
      expect(html).not.toContain('data-testid="badge-barra"');
    });

    it("GIVEN usa_barra = true y 55 kg THEN chip Barra y aproximaciones en múltiplos de 5 kg (nunca 27,5)", () => {
      const html = abrir(
        [ejercicio({ id: "ej-press", nombre: "Press militar parado con barra", musculos_principales: ["Hombros"], usa_barra: true })],
        "ej-press",
      );
      expect(html).toContain('data-testid="badge-barra"');
      expect(html).toContain('data-testid="warmup-sets-section"');
      expect(html).toContain("20 × 8");
      expect(html).toContain("30 × 5");
      expect(html).not.toContain("27,5");
    });

    it("la precarga nunca pisa una serie W y la 1ª serie efectiva hereda la última vez, no el calentamiento", () => {
      const ref = { peso_kg: 55, reps_hechas: 12 };
      const w1 = set(1, 20, 8, false, "W");
      const w2 = set(2, 30, 5, false, "W");
      const n1 = set(3, 55, 12);
      expect(resolverPrecargaSerie([w1, w2, n1], w1, ref)).toBeNull();
      expect(resolverPrecargaSerie([w1, w2, n1], w2, ref)).toBeNull();

      const w1Hecha = { ...w1, completada: true };
      const w2Hecha = { ...w2, completada: true };
      expect(resolverPrecargaSerie([w1Hecha, w2Hecha, n1], n1, ref)).toEqual({ peso_kg: 55, reps_hechas: 12 });

      const n1Hecha = { ...n1, peso_kg: 57.5, reps_hechas: 10, completada: true };
      const n2 = set(4, 55, 12);
      expect(resolverPrecargaSerie([w1Hecha, w2Hecha, n1Hecha, n2], n2, ref)).toEqual({ peso_kg: 57.5, reps_hechas: 10 });
    });

    it("Coach Studio: filtro Barra + chip en tarjeta + toggle en el modal que persiste usa_barra", () => {
      const base = { comentario: null, url_video: null, musculos_secundarios: [], creado_por: null, created_at: "", updated_at: "" };
      const lista: Ejercicio[] = [
        { ...base, id: "1", nombre: "Press Plano con Barra", musculos_principales: ["Pecho"], usa_barra: true },
        { ...base, id: "2", nombre: "Aperturas con mancuernas", musculos_principales: ["Pecho"], usa_barra: false },
        { ...base, id: "3", nombre: "Sentadilla con Barra", musculos_principales: ["Piernas"], usa_barra: true },
      ];
      expect(filtrarEjercicios(lista, "Todos", "", true).map((e) => e.id)).toEqual(["1", "3"]);
      expect(filtrarEjercicios(lista, "Pecho", "", true).map((e) => e.id)).toEqual(["1"]);
      expect(filtrarEjercicios(lista, "Pecho", "").map((e) => e.id)).toEqual(["1", "2"]);

      const src = fs.readFileSync(path.resolve(__dirname, "../components/coach/ejercicios-library-tab.tsx"), "utf-8");
      expect(src).toContain('data-testid="filtro-barra"');
      expect(src).toContain("data-testid={`ejercicio-barra-${ej.id}`}");
      expect(src).toContain('data-testid="chip-usa-barra"');
      expect(src.match(/usa_barra: usaBarra/g)?.length).toBeGreaterThanOrEqual(3); // update payload, actualizado, insert
    });
  });

  describe("d) Superserie con vueltas dispares (3 vs 4)", () => {
    const ss = (id: string, n: number, hechas: number, extra: Partial<LiveWorkoutExercise> = {}) =>
      ejercicio({
        id,
        ejercicio_id: `cat-${id}`,
        nombre: `Ejercicio ${id}`,
        es_superserie: true,
        grupo_superserie: 1,
        series: Array.from({ length: n }, (_, i) => set(i + 1, 10, 10, i < hechas)),
        ...extra,
      });

    it("calcularProgresoVueltasSuperserie usa Math.max y no se traba en 3/4", () => {
      expect(calcularProgresoVueltasSuperserie([ss("a", 3, 0), ss("b", 4, 0), ss("c", 4, 0)])).toEqual({ total: 4, hechas: 0 });
      expect(calcularProgresoVueltasSuperserie([ss("a", 3, 3), ss("b", 4, 3), ss("c", 4, 3)])).toEqual({ total: 4, hechas: 3 });
      expect(calcularProgresoVueltasSuperserie([ss("a", 3, 3), ss("b", 4, 4), ss("c", 4, 3)])).toEqual({ total: 4, hechas: 3 });
      expect(calcularProgresoVueltasSuperserie([ss("a", 3, 3), ss("b", 4, 4), ss("c", 4, 4)])).toEqual({ total: 4, hechas: 4 });
    });

    it("en la vuelta 4 el ejercicio de 3 series muestra 'Completado · 3/3 series' sin controles ni toggle largo", () => {
      const html = abrir(
        [ss("a", 3, 3), ss("b", 4, 3, { es_unilateral: true }), ss("c", 4, 3)],
        "b",
      );
      expect(html).toContain('data-testid="ss-cycle-card-1-4"');
      expect(html).toContain('data-testid="ss-cycle-item-done-a"');
      expect(html).toContain("Completado · 3/3 series");
      expect(html).not.toContain('data-testid="ss-uni-same-a"');
      expect(html).toContain('data-testid="ss-uni-same-b"');
      expect(html).toMatch(/data-testid="ss-uni-same-b"[^>]*>= D\/I</);
      expect(html).not.toContain("Igual D/I");
      expect(html).toContain("Superserie 3 de 4 vueltas");
    });
  });

  describe("a/d) CSS de líneas conectoras", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../app/(athlete)/athlete/athlete-v7.css"), "utf-8");

    it("la línea de Rutina ya no usa top/bottom fijos y se dibuja por fila desde/hasta el centro del círculo", () => {
      expect(css).not.toMatch(/\.a-ss-timeline::before\s*\{/);
      expect(css).toMatch(/\.a-ss-timeline > \.a-row::before\s*\{\s*top: 0;\s*bottom: 50%;/);
      expect(css).toMatch(/\.a-ss-timeline > \.a-row::after\s*\{\s*top: 50%;\s*bottom: -2px;/);
      expect(css).toMatch(/\.a-ss-timeline > \.a-row:first-child::before,\s*\.theme-athlete\[data-v7\] \.a-ss-timeline > \.a-row:last-child::after\s*\{\s*content: none;/);
    });

    it("la Superserie activa usa carril de 30px y la línea no pasa por la columna de controles", () => {
      expect(css).not.toMatch(/\.a-ss-inline-list::before\s*\{/);
      expect(css).toMatch(/\.a-ss-ex-block\s*\{[^}]*grid-template-columns: 30px minmax\(0, 1fr\);[^}]*column-gap: 10px;/);
      expect(css).toMatch(/\.a-ss-ex-block:first-child::before,\s*\.theme-athlete\[data-v7\] \.a-ss-ex-block:last-child::after\s*\{\s*content: none;/);
      expect(css).toMatch(/\.a-seg\.a-seg-compact\s*\{\s*width: fit-content;/);
    });
  });
});
