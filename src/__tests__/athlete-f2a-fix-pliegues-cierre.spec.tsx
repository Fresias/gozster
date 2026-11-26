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
      usa_barra: true,
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

  it("Cierre con nombre largo renderiza el titular completo y la regla .a-dk-cierre .a-t-dxl aplica clamp sin hyphens: auto ni duplicado muerto", () => {
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

    const regla = CSS.match(/\.theme-athlete\[data-v7\] \.a-dk\.a-dk-cierre \.a-dk-in \.a-t-dxl\s*\{[^}]*\}/);
    expect(regla).not.toBeNull();
    expect(regla![0]).not.toMatch(/hyphens:\s*auto/);
    expect(regla![0]).not.toContain("overflow-wrap: anywhere");
    expect(regla![0]).toContain("font-size: clamp(1.5rem, 8vw, 2rem)");
    expect(regla![0]).toContain("overflow-wrap: break-word");
    expect(regla![0]).toContain("hyphens: none");
    expect(regla![0]).toContain("word-break: normal");
    expect(regla![0]).toContain("max-width: 100%");
    expect(CSS).not.toMatch(/\[data-testid="cierre-dia-titulo"\]\s*\{/);
  });

  it("Tus días: un único bloque .a-days .a-row compacto con target >= 44px y sin duplicados", () => {
    const bloques = [...CSS.matchAll(/\.a-days \.a-row \{([^}]*)\}/g)];
    expect(bloques).toHaveLength(1);
    const cuerpo = bloques[0]?.[1] ?? "";
    const min = Number(/min-height:\s*(\d+)px/.exec(cuerpo)?.[1]);
    expect(min).toBeGreaterThanOrEqual(44);
    expect(min).toBeLessThan(64);
    expect(cuerpo).toContain("padding: 6px 12px");
    expect(cuerpo).toContain("gap: 10px");
    expect(CSS).not.toContain("gap 12px entre tarjetas");
  });

  it(".a-hero sin duplicados, preserva min-height: 56px en .a-hero .a-btn.a-gym y 44px solo en .a-hero .a-hero-ghost", () => {
    const bloquesHero = [...CSS.matchAll(/\.theme-athlete\[data-v7\] \.a-hero\s*\{([^}]*)\}/g)];
    expect(bloquesHero).toHaveLength(1);
    const heroBody = bloquesHero[0]?.[1] ?? "";
    expect(heroBody).toContain("padding: var(--md-sys-measurement-space200)");
    expect(heroBody).toContain("gap: 8px");

    const gymBtn = CSS.match(/\.theme-athlete\[data-v7\] \.a-hero \.a-btn\.a-gym\s*\{([^}]*)\}/);
    expect(gymBtn).not.toBeNull();
    expect(gymBtn![1]).toContain("min-height: 56px");

    const ghostBtn = CSS.match(/\.theme-athlete\[data-v7\] \.a-hero \.a-hero-ghost\s*\{([^}]*)\}/);
    expect(ghostBtn).not.toBeNull();
    expect(ghostBtn![1]).toContain("min-height: 44px");

    expect(CSS).not.toMatch(/\.a-hero \.a-hbtn,\s*\.theme-athlete\[data-v7\] \.a-hero \.a-btn\s*\{/);
  });

  it("radios residuales alineados a tokens M3 y diferenciación tonal Claro/Oscuro", () => {
    expect(CSS.match(/\.theme-athlete\[data-v7\] \.a-banner\s*\{[^}]*\}/)?.[0]).toContain(
      "border-radius: var(--md-sys-shape-corner-large)",
    );
    expect(CSS.match(/\.theme-athlete\[data-v7\] \.a-racha-perm-card\s*\{[^}]*\}/)?.[0]).toContain(
      "border-radius: var(--md-sys-shape-corner-large)",
    );
    expect(CSS.match(/\.theme-athlete\[data-v7\] \.a-info\s*\{[^}]*\}/)?.[0]).toContain(
      "border-radius: var(--md-sys-shape-corner-medium)",
    );
    expect(CSS.match(/\.theme-athlete\[data-v7\] \.a-fold\s*\{[^}]*\}/)?.[0]).toContain(
      "border-radius: var(--md-sys-shape-corner-medium)",
    );
    const foldClosed = CSS.match(/\.theme-athlete\[data-v7\] \.a-fold:not\(\[open\]\)\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(foldClosed).not.toMatch(/padding-block:\s*0\s*;/);
    expect(foldClosed).toMatch(/padding(-block)?:\s*[1-9]\d*px/);

    // Diferenciación tonal Tonal + Shadow en Claro (sin colapsar l2/l3 a --a-surface)
    const claroBlock = CSS.slice(0, CSS.indexOf(".dark .theme-athlete[data-v7]"));
    const bg = /--a-bg:\s*(#[0-9A-Fa-f]{6})/.exec(claroBlock)?.[1];
    const s1 = /--a-surface:\s*(#[0-9A-Fa-f]{6})/.exec(claroBlock)?.[1];
    const s2 = /--a-surface-l2:\s*(#[0-9A-Fa-f]{6})/.exec(claroBlock)?.[1];
    const s3 = /--a-surface-l3:\s*(#[0-9A-Fa-f]{6})/.exec(claroBlock)?.[1];
    expect(new Set([bg, s1, s2, s3]).size).toBe(4);
  });
});
