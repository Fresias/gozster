import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
import { CierreDiaModal } from "@/components/athlete/cierre-dia-modal";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";

const SESION: LiveWorkoutSession = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre_rutina: "Lucía Fernández: DÍA 1",
  fecha: "2026-11-17",
  studentId: "22222222-2222-4222-8222-222222222222",
  studentName: "Lucía Fernández",
  dia_id: "33333333-3333-4333-8333-333333333333",
  molestias: [],
  ejercicios: [
    {
      id: "ej-sq",
      ejercicio_id: "cat-sq",
      nombre: "Sentadilla con barra",
      musculos_principales: ["Piernas"],
      descanso_segundos: 150,
      rpe_objetivo: 8,
      repeticiones_objetivo: "6-8",
      series: [{ numero_serie: 1, peso_kg: 62.5, reps_hechas: 7, rpe_real: 8, completada: false, estimated1RM: 77 }],
    },
  ],
};

const CSS = fs.readFileSync(
  path.resolve(__dirname, "../app/(athlete)/athlete/athlete-v7.css"),
  "utf-8",
);

function openTag(html: string, testid: string): string {
  const m = html.match(new RegExp(`<details[^>]*data-testid="${testid}"[^>]*>`));
  expect(m, `${testid} debe renderizarse como <details>`).not.toBeNull();
  return m![0];
}

describe("GOZS-850 · pliegues técnicos y Cierre sin cortes", () => {
  it("vista-tecnica y calculadora-barra son <details> cerrados por defecto (sin open)", () => {
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: SESION.dia_id!,
      ejercicioAbiertoId: "ej-sq",
      sessionStartedAt: Date.now() - 60_000,
      nivelVistaAlumno: "TECNICA",
      vistaRecomendadaCoach: "TECNICA",
      vistaElegidaPorAlumno: null,
      currentSession: structuredClone(SESION),
    });
    const html = renderToStaticMarkup(<EjercicioActivo />);
    expect(openTag(html, "vista-tecnica")).not.toMatch(/\sopen(=|\s|>)/);
    expect(openTag(html, "calculadora-barra")).not.toMatch(/\sopen(=|\s|>)/);
  });

  it("Cierre con nombre largo renderiza el titular completo y el CSS no usa hyphens: auto", () => {
    const html = renderToStaticMarkup(
      <CierreDiaModal
        isOpen
        onClose={() => {}}
        tonelajeKg={1000}
        seriesCompletadas={3}
        totalSeries={3}
        nombrePreferido="Maximiliano Alejandro"
        studentName="Maximiliano Alejandro"
      />,
    );
    const titulo = html.match(/data-testid="cierre-dia-titulo"[^>]*>([\s\S]*?)<\/h1>/);
    expect(titulo).not.toBeNull();
    expect((titulo?.[1] ?? "").replace(/<!-- -->/g, "")).toContain("Maximiliano Alejandro");

    const regla = CSS.match(/\[data-testid="cierre-dia-titulo"\]\s*\{[^}]*\}/);
    expect(regla).not.toBeNull();
    expect(regla![0]).not.toMatch(/hyphens:\s*auto/);
    expect(regla![0]).toContain("clamp(");
    expect(regla![0]).toContain("overflow-wrap: break-word");
  });

  it("Tus días: filas compactas con target >= 44px", () => {
    const bloques = [...CSS.matchAll(/\.a-days \.a-row \{([^}]*)\}/g)];
    const ultimo = bloques[bloques.length - 1]?.[1] ?? "";
    const min = Number(/min-height:\s*(\d+)px/.exec(ultimo)?.[1]);
    expect(min).toBeGreaterThanOrEqual(44);
    expect(min).toBeLessThan(64);
  });
});
