import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-chat-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-chat-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useChatStore.getState()) : mod.useChatStore.getState()),
    mod.useChatStore,
  );
  return { ...mod, useChatStore: hook };
});

import { InicioMisDias } from "@/components/athlete/inicio-mis-dias";
import { MembershipExpiredNotice } from "@/components/athlete/membership-paywall";
import { useAthleteStore } from "@/store/use-athlete-store";
import { DEFAULT_ATHLETE_SENDER, STAFF_COACH_PRINCIPAL, useChatStore } from "@/store/use-chat-store";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";

const PLAN_BASE: LiveSupabaseDataset = {
  alumnos: [
    {
      id: "al-1",
      email: "lucia@ejemplo.com",
      nombre_completo: "Lucía Fernández",
      nombre_preferido: null,
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      estado_cuenta: "ACTIVO",
      nivel_vista_alumno: "SIMPLE",
      profesor_asignado_id: "prof-1",
      fecha_baja: null,
      debe_cambiar_password: false,
      peso_corporal_kg: 62,
      sexo: "F",
      created_at: "2026-10-01T10:00:00-03:00",
      updated_at: new Date().toISOString(),
    } as any,
  ],
  planes: [
    {
      id: "plan-1",
      profesor_id: "prof-1",
      alumno_id: "al-1",
      nombre: "PLAN GENERAL",
      estado: "ACTIVO",
      tipo: "DE_ALUMNO",
      comentarios: null,
      fecha_inicio: "2026-11-02",
      fecha_fin: null,
      created_at: "2026-11-02T10:00:00-03:00",
      updated_at: "2026-11-02T10:00:00-03:00",
    } as any,
  ],
  dias: [
    { id: "d1", plan_id: "plan-1", orden: 1, nombre: "DÍA 1", created_at: "", updated_at: "" } as any,
    { id: "d2", plan_id: "plan-1", orden: 2, nombre: "DÍA 2", created_at: "", updated_at: "" } as any,
    { id: "d3", plan_id: "plan-1", orden: 3, nombre: "DÍA 3", created_at: "", updated_at: "" } as any,
  ],
  ejerciciosEnRutina: [
    { id: "er1", dia_id: "d1", ejercicio_id: "e1", orden: 1, series: 4, repeticiones: "6-8", descanso_segundos: 150, es_superserie: false } as any,
    { id: "er2", dia_id: "d1", ejercicio_id: "e2", orden: 2, series: 3, repeticiones: "8-10", descanso_segundos: 90, es_superserie: true, grupo_superserie: 1 } as any,
    { id: "er3", dia_id: "d2", ejercicio_id: "e3", orden: 1, series: 3, repeticiones: "10", descanso_segundos: 90, es_superserie: false } as any,
  ],
  ejercicios: [
    { id: "e1", nombre: "Sentadilla", musculos_principales: ["Piernas"] } as any,
    { id: "e2", nombre: "Press banca", musculos_principales: ["Pecho"] } as any,
    { id: "e3", nombre: "Jalón al pecho", musculos_principales: ["Espalda"] } as any,
  ],
};

describe("Athlete v7 · FE-03 Inicio y sus estados", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      planAlumno: null,
      cargandoPlan: false,
      errorPlan: false,
      nombrePreferido: null,
      sesionesCompletadas: [],
      membershipStatus: "ACTIVE",
    });
    useChatStore.getState().resetToDefaults();
    useChatStore.getState().markAsRead(DEFAULT_ATHLETE_SENDER.id);
  });

  it("usa nombreParaSaludo: nombre_preferido primero, sino primer nombre de nombre_completo", () => {
    useAthleteStore.setState({
      planAlumno: PLAN_BASE,
      nombrePreferido: "Lu",
    });
    const htmlPreferido = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlPreferido).toContain("Hola, Lu");
    expect(htmlPreferido).toContain("PLAN GENERAL");

    useAthleteStore.setState({
      planAlumno: PLAN_BASE,
      nombrePreferido: null,
    });
    const htmlCompleto = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlCompleto).toContain("Hola, Lucía");
  });

  it("renderiza el héroe Te toca hoy con biserie, CTA Seguir cuando la sesión inició y lista de días", () => {
    const baseEx = useAthleteStore.getState().currentSession.ejercicios[0]!;
    useAthleteStore.setState({
      planAlumno: PLAN_BASE,
      sesionesCompletadas: [
        { id: "s-done", dia_id: "d1", fecha: new Date().toISOString() },
      ],
      currentSession: {
        ...useAthleteStore.getState().currentSession,
        dia_id: "d2",
        ejercicios: [
          {
            ...baseEx,
            id: "er3",
            ejercicio_id: "e3",
            nombre: "Jalón al pecho",
            es_superserie: false,
            series: [{ ...baseEx.series[0]!, numero_serie: 1, peso_kg: 40, reps_hechas: 10, completada: true }],
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<InicioMisDias />);
    expect(html).toContain('data-testid="heroe-te-toca-hoy"');
    expect(html).toContain("a-hero");
    expect(html).toContain("Seguir Día 2");
    expect(html).toContain("1/3 esta semana");
    expect(html).toContain("Hecho");

    // En Día 1 hay biserie y 0 series completadas: Empezar Día 1 + chip Con biserie
    useAthleteStore.setState({ sesionesCompletadas: [] });
    const htmlDia1 = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlDia1).toContain("Con biserie");
    expect(htmlDia1).toContain("Empezar Día 1");
  });

  it("no muestra 'Todavía no tenés un plan' mientras planAlumno es null (carga < 1s) y renderiza estado de error", () => {
    useAthleteStore.setState({ planAlumno: null, cargandoPlan: true, errorPlan: false });
    const htmlLoadingEarly = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlLoadingEarly).toContain('data-testid="inicio-cargando-espera"');
    expect(htmlLoadingEarly).not.toContain("Todavía no tenés un plan");

    useAthleteStore.setState({ planAlumno: null, cargandoPlan: false, errorPlan: true });
    const htmlError = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlError).toContain('data-testid="inicio-error"');
    expect(htmlError).toContain("No pudimos cargar tu plan");
    expect(htmlError).toContain("Reintentar");

    useAthleteStore.setState({
      planAlumno: { ...PLAN_BASE, planes: [], dias: [], ejerciciosEnRutina: [] },
      cargandoPlan: false,
      errorPlan: false,
    });
    const htmlSinPlan = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlSinPlan).toContain('data-testid="inicio-sin-plan"');
    expect(htmlSinPlan).toContain("Todavía no tenés un plan");
    expect(htmlSinPlan).toContain("Escribirle al coach");
  });

  it("muestra la tarjeta del coach v7 cuando hay mensaje sin leer", () => {
    useAthleteStore.setState({ planAlumno: PLAN_BASE });
    useChatStore.getState().sendMessage({
      alumnoId: DEFAULT_ATHLETE_SENDER.id,
      remitente: STAFF_COACH_PRINCIPAL,
      contenido: "Lucía, hoy subí 2,5 kg en la sentadilla",
    });
    const html = renderToStaticMarkup(<InicioMisDias />);
    expect(html).toContain("a-coachmsg");
    expect(html).toContain("Mensaje del coach");
    expect(html).toContain("Nuevo");
    expect(html).toContain("Lucía, hoy subí 2,5 kg en la sentadilla");
  });

  it("MembershipExpiredNotice usa banner y hoja centrada v7 sin botón QA ni emojis", () => {
    const html = renderToStaticMarkup(<MembershipExpiredNotice />);
    expect(html).toContain('data-testid="athlete-expired-banner"');
    expect(html).toContain("a-banner");
    expect(html).toContain("Tu suscripción venció");
    expect(html).toContain('data-testid="athlete-expired-dialog"');
    expect(html).toContain("a-sheet-wrap a-center");
    expect(html).toContain("GOZSTER.FIT");
    expect(html).toContain("Copiar");
    expect(html).not.toContain("simulate-active-btn");
    expect(html).not.toContain("Simular Pago Confirmado");
    expect(html).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("el clic en la tarjeta del coach abre el chat del alumno", () => {
    const alumnoId = DEFAULT_ATHLETE_SENDER.id;
    useChatStore.getState().markAsRead(alumnoId);
    useChatStore.getState().sendMessage({ alumnoId, remitente: STAFF_COACH_PRINCIPAL, contenido: "Hola, revisá tu plan." });
    useAthleteStore.setState({
      planAlumno: {
        alumnos: [{ id: alumnoId, nombre_completo: "Lucía Fernández", rol: "ALUMNO" } as any],
        planes: [{ id: "p-x", alumno_id: alumnoId, nombre: "PLAN", estado: "ACTIVO", fecha_inicio: "2026-11-01", fecha_fin: null } as any],
        dias: [{ id: "d-x", plan_id: "p-x", orden: 1, nombre: "DÍA 1" } as any],
        ejerciciosEnRutina: [],
        ejercicios: [],
      },
    });
    useChatStore.getState().setAthleteChatOpen(false);

    // Render sin DOM: se evalúa el componente con hooks stub y se busca el botón en el árbol de elementos.
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals.H;
    internals.H = {
      useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, () => undefined],
      useEffect: () => undefined,
      useMemo: (fn: () => unknown) => fn(),
      useCallback: (fn: unknown) => fn,
      useRef: (v: unknown) => ({ current: v }),
    };
    try {
      const find = (node: any): any => {
        if (!node || typeof node !== "object") return null;
        if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null;
        if (node.props?.["data-testid"] === "unread-coach-message-banner") return node;
        return find(node.props?.children);
      };
      const banner = find((InicioMisDias as () => unknown)());
      expect(banner).not.toBeNull();
      banner.props.onClick();
    } finally {
      internals.H = prevDispatcher;
    }
    expect(useChatStore.getState().isAthleteChatOpen).toBe(true);
  });
});
