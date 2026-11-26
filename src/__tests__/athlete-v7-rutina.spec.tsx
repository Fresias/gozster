import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
    },
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

vi.mock("@/store/use-chat-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-chat-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useChatStore.getState()) : mod.useChatStore.getState()),
    mod.useChatStore,
  );
  return { ...mod, useChatStore: hook };
});

import { RutinaDelDia } from "@/components/athlete/rutina-del-dia";
import AthleteAppPage from "@/app/(athlete)/athlete/page";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useChatStore, DEFAULT_ATHLETE_SENDER } from "@/store/use-chat-store";

const SESION_TEST: LiveWorkoutSession = {
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
      series: [
        { numero_serie: 1, peso_kg: 62.5, reps_hechas: 7, rpe_real: 8, completada: true, estimated1RM: 77 },
        { numero_serie: 2, peso_kg: 62.5, reps_hechas: 7, rpe_real: 8, completada: true, estimated1RM: 77 },
      ],
    },
    {
      id: "ej-bp",
      ejercicio_id: "cat-bp",
      nombre: "Press banca plano",
      musculos_principales: ["Pecho"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "8-10",
      es_superserie: true,
      grupo_superserie: 1,
      series: [
        { numero_serie: 1, peso_kg: 47.5, reps_hechas: 8, rpe_real: 8, completada: true, estimated1RM: 60 },
        { numero_serie: 2, peso_kg: 47.5, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: 0 },
      ],
    },
    {
      id: "ej-rm",
      ejercicio_id: "cat-rm",
      nombre: "Remo con mancuerna",
      musculos_principales: ["Espalda"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "10-12",
      es_superserie: true,
      grupo_superserie: 1,
      series: [
        { numero_serie: 1, peso_kg: 20, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 0 },
        { numero_serie: 2, peso_kg: 20, reps_hechas: 10, rpe_real: 8, completada: false, estimated1RM: 0 },
      ],
    },
    {
      id: "ej-pl",
      ejercicio_id: "cat-pl",
      nombre: "Plancha frontal",
      musculos_principales: ["Core"],
      descanso_segundos: 60,
      rpe_objetivo: 7,
      repeticiones_objetivo: "45s",
      tipo_medicion: "TIEMPO",
      tiempo_objetivo_segundos: 45,
      series: [
        { numero_serie: 1, peso_kg: 0, reps_hechas: 45, rpe_real: 7, completada: false, estimated1RM: 0 },
      ],
    },
  ],
};

describe("Athlete v7 · FE-04 Rutina del día como pantalla propia", () => {
  beforeEach(() => {
    useChatStore.getState().resetToDefaults();
    useChatStore.getState().markAsRead(DEFAULT_ATHLETE_SENDER.id);
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: SESION_TEST.dia_id!,
      ejercicioAbiertoId: null,
      sessionStartedAt: Date.now() - 60_000,
      nivelVistaAlumno: "SIMPLE",
      vistaRecomendadaCoach: "SIMPLE",
      vistaElegidaPorAlumno: null,
      mostrarTimerDescanso: true,
      nombrePreferido: "Lu",
      currentSession: structuredClone(SESION_TEST),
    });
  });

  it("CP2: renderiza cabecera con anillo monocromático, próximo ejercicio (.a-next), tilde en número al terminar y card de superserie (.a-ss con píldora SS)", () => {
    const html = renderToStaticMarkup(<RutinaDelDia />);

    expect(html).toContain('data-testid="volver-a-mis-dias-btn"');
    expect(html).toContain('data-testid="athlete-settings-btn"');
    expect(html).toContain('<h1 class="a-t-d">DÍA 1</h1>');
    expect(html).toContain("4 ejercicios · ~");
    expect(html).toContain('data-testid="session-elapsed-chip"');

    // Anillo monocromático en cabecera sin barra ni texto "3/7 series"
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('data-testid="rutina-progress-card"');
    expect(html).not.toContain("3/7 series");

    // Sentadilla hecha (tilde en número con aria-label="Hecho"), Press banca plano es próximo (a-next) dentro de Superserie SS
    expect(html).toContain('aria-label="Hecho"');
    expect(html).toContain('data-testid="ss-pill-1"');
    expect(html).toContain(">SS</button>");
    expect(html).toContain("2 ejercicios");
    expect(html).toContain("a-ss-timeline");
    expect(html).toContain('class="a-row a-next"');
    expect(html).toContain("Seguir: Press banca plano");
    expect(html).toContain("45 s · 1 serie");
  });

  it("CP2: en Vista Técnica muestra volumen efectivo y bruto en la tarjeta de avance", () => {
    useAthleteStore.setState({ nivelVistaAlumno: "TECNICA" });
    const html = renderToStaticMarkup(<RutinaDelDia />);

    expect(html).toContain("Volumen efectivo:");
    expect(html).toContain("Bruto:");
  });

  it("CP2: omite como próximo el ejercicio bloqueado por molestia alta", () => {
    useAthleteStore.setState({
      currentSession: {
        ...structuredClone(SESION_TEST),
        molestias: [
          {
            id: "mol-1",
            sesionId: SESION_TEST.id,
            ejercicioEnRutinaId: "ej-bp",
            ejercicioId: "cat-bp",
            numeroSerie: 1,
            zona: "HOMBRO",
            eva: 8,
            nivel: "alta",
            sintomas: [],
            momento: "EN_SERIE",
            notas: null,
            reportadaAt: "2026-11-17T10:00:00Z",
            envio: "enviada",
          },
        ],
      },
    });
    const html = renderToStaticMarkup(<RutinaDelDia />);

    expect(html).toContain("Molestia");
    expect(html).toContain("Seguir: Remo con mancuerna");
  });

  it("CP3/CP5: page.tsx separa RutinaDelDia (ejercicioAbiertoId=null) de LiveWorkout (ejercicioAbiertoId!=null)", () => {
    const htmlRutina = renderToStaticMarkup(<AthleteAppPage />);
    expect(htmlRutina).toContain('data-testid="rutina-progress-card"');
    expect(htmlRutina).not.toContain('data-testid="registrar-serie-btn"');

    useAthleteStore.setState({ ejercicioAbiertoId: "ej-bp" });
    const htmlEjercicio = renderToStaticMarkup(<AthleteAppPage />);
    expect(htmlEjercicio).toContain('data-testid="registrar-serie-btn"');
    expect(htmlEjercicio).toContain('data-testid="volver-a-rutina-btn"');
  });

  it("CP3: Registro de la sesión deriva Guardada vs En el teléfono de pendingEvents (D3-A) y formatea en es-AR", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/rutina-del-dia.tsx"),
      "utf8",
    );
    expect(source).toContain("Guardada");
    expect(source).toContain("En el teléfono");
    expect(source).toContain("Todavía no guardaste ninguna serie hoy");
    expect(source).toContain("Te ");
    expect(source).toContain("Lo que registraste se guarda igual.");
    expect(source).toContain('data-testid="confirmar-terminar-card"');
  });

  it("CP4: hoja de Configuración incluye 'Cómo te llamamos', modo de visualización, paso, descanso y cuestionario", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/rutina-del-dia.tsx"),
      "utf8",
    );
    expect(source).toContain('htmlFor="cfgName"');
    expect(source).toContain("Cómo te llamamos");
    expect(source).toContain('data-testid="config-nombre-input"');
    expect(source).toContain("Listo, te llamamos");
    expect(source).toContain("guardarNombrePreferido");
    expect(source).toContain("Mostrar el descanso");
    expect(source).toContain('data-testid="tab-cuestionario"');
  });

  it("CP5: rutina-del-dia.tsx no usa clases de colores viejos ni microtextos ni emojis", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/rutina-del-dia.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(
      /(bg|text|border|from|to|ring)-(blue|sky|cyan|violet|purple|amber|yellow|orange|green|emerald|lime)-/,
    );
    expect(source).not.toContain("Modo Avión");
    expect(source).not.toContain("🎬");
    expect(source).not.toContain("🏆");
  });
});
