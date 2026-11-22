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

vi.mock("@/store/use-clases-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-clases-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useClasesStore.getState()) : mod.useClasesStore.getState()),
    mod.useClasesStore,
  );
  return { ...mod, useClasesStore: hook };
});

import { IndicadorRachaSemanas, InicioMisDias } from "@/components/athlete/inicio-mis-dias";
import { RachaFlama, especificacionRacha } from "@/components/athlete/icons";
import { MembershipExpiredNotice } from "@/components/athlete/membership-paywall";
import { useAthleteStore } from "@/store/use-athlete-store";
import { DEFAULT_ATHLETE_SENDER, STAFF_COACH_PRINCIPAL, useChatStore } from "@/store/use-chat-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { supabase } from "@/lib/supabase/client";
import * as alumnosService from "@/services/alumnos-service";
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
      fechasSesionesServidor: [],
      historialSesiones: [],
      membershipStatus: "ACTIVE",
    });
    useClasesStore.setState({
      clases: [],
      misReservas: [],
      agendaReservas: [],
      membresia: null,
      plan: null,
      contratacionesAlumno: [],
      actividadesAlumno: [],
      actividadesHabilitadas: [],
      testAhora: null,
    });
    useOfflineQueueStore.setState({ isOnline: true });
    useChatStore.getState().resetToDefaults();
    useChatStore.getState().markAsRead(DEFAULT_ATHLETE_SENDER.id);
  });

  it("cabecera limpia: omite saludo personal y último entreno, sin renderizar plan.nombre ni DE X", () => {
    useAthleteStore.setState({
      planAlumno: PLAN_BASE,
      nombrePreferido: "Lu",
    });
    const htmlPreferido = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlPreferido).not.toContain("Hola,");
    expect(htmlPreferido).not.toContain("Último entreno:");
    expect(htmlPreferido).not.toContain('data-testid="ultimo-entreno-relativo"');
    expect(htmlPreferido).not.toContain("PLAN GENERAL");
    expect(htmlPreferido).toContain('data-testid="semana-plan-titulo"');
    expect(htmlPreferido).toContain("SEMANA ");
    expect(htmlPreferido).not.toMatch(/SEMANA\s+\d+\s+DE\s+\d+/i);

    useAthleteStore.setState({
      planAlumno: { ...PLAN_BASE, planes: [], dias: [], ejerciciosEnRutina: [] },
      nombrePreferido: null,
    });
    const htmlSinPlan = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlSinPlan).not.toContain("Hola,");
    expect(htmlSinPlan).not.toContain("Último entreno:");
    expect(htmlSinPlan).not.toContain('data-testid="ultimo-entreno-relativo"');
  });

  it("renderiza el héroe Te toca hoy sin Con biserie, CTA Seguir cuando la sesión inició y lista de días con Hecho opción A", () => {
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
    expect(html).not.toContain("1/3 esta semana");
    expect(html).not.toContain("a-chip a-ok");
    expect(html).not.toContain(">Hecho<");
    expect(html).toContain('data-testid="dia-hecho-check"');
    expect(html).toContain('aria-label="Día 1, hecho"');
    expect(html).toContain("a-done");

    // En Día 1 con biserie y 0 series completadas: Empezar Día 1 sin chip Con biserie
    useAthleteStore.setState({ sesionesCompletadas: [] });
    const htmlDia1 = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlDia1).not.toContain("Con biserie");
    expect(htmlDia1).not.toContain('data-testid="hero-superserie-badge"');
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

  it("muestra la tarjeta del coach v7 cuando hay mensaje pusheado sin leer", () => {
    useAthleteStore.setState({ planAlumno: PLAN_BASE });
    useChatStore.getState().sendMessage({
      alumnoId: PLAN_BASE.alumnos[0]!.id,
      remitente: STAFF_COACH_PRINCIPAL,
      contenido: "Lucía, hoy subí 2,5 kg en la sentadilla",
      requiereLecturaInicio: true,
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
    useChatStore.getState().sendMessage({
      alumnoId,
      remitente: STAFF_COACH_PRINCIPAL,
      contenido: "Hola, revisá tu plan.",
      requiereLecturaInicio: true,
    });
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

  it("GIVEN plan iniciado hace 7 días y racha >= 1 THEN muestra SEMANA 2 y badge SVG Opción B sin Último entreno ni palabra RACHA", () => {
    const hace7Dias = new Date(Date.now() - 7 * 86_400_000);
    const fechaInicioStr = `${hace7Dias.getFullYear()}-${String(hace7Dias.getMonth() + 1).padStart(2, "0")}-${String(hace7Dias.getDate()).padStart(2, "0")}`;
    useAthleteStore.setState({
      planAlumno: {
        ...PLAN_BASE,
        planes: [{ ...PLAN_BASE.planes[0]!, fecha_inicio: fechaInicioStr, fecha_fin: null }],
      },
      sesionesCompletadas: [{ id: "s1", dia_id: "d1", fecha: new Date().toISOString() }],
    });

    const html = renderToStaticMarkup(<InicioMisDias />);
    expect(html).toContain("SEMANA 2");
    expect(html).not.toContain("PLAN GENERAL");
    expect(html).not.toMatch(/SEMANA\s+\d+\s+DE\s+\d+/i);
    expect(html).not.toContain('data-testid="ultimo-entreno-relativo"');
    expect(html).not.toContain("Último entreno:");
    expect(html).toContain('data-testid="racha-semanas-chip"');
    expect(html).toContain("1 SEM");
    expect(html).not.toContain("RACHA");
    expect(html).not.toContain("Racha 1 sem");
    expect(html).toContain('data-level="1"');

    // Sin sesiones previas, el chip Racha no se muestra
    useAthleteStore.setState({ sesionesCompletadas: [] });
    const htmlSinRacha = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlSinRacha).not.toContain('data-testid="racha-semanas-chip"');
  });

  it("GIVEN reserva activa ANOTADO en clase PROGRAMADA THEN muestra tarjeta CLASE RESERVADA sin botones encima de TE TOCA HOY y desaparece al cancelar", () => {
    useAthleteStore.setState({ planAlumno: PLAN_BASE });
    useClasesStore.setState({
      testAhora: "2026-11-20T12:00:00-03:00",
      clases: [
        {
          id: "clase-uuid-1",
          horario_id: null,
          actividad: "FUNCIONAL",
          inicio: "2026-11-20T19:00:00-03:00",
          duracion_minutos: 60,
          capacidad: 12,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          created_at: "2026-11-20T08:00:00Z",
          updated_at: "2026-11-20T08:00:00Z",
        },
      ],
      misReservas: [
        {
          id: "res-uuid-1",
          clase_id: "clase-uuid-1",
          alumno_id: "al-1",
          estado: "ANOTADO",
          created_at: "2026-11-20T09:00:00Z",
          updated_at: "2026-11-20T09:00:00Z",
        },
      ],
    });

    const htmlActiva = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlActiva).toContain('data-testid="clase-reservada-card"');
    expect(htmlActiva).toContain("CLASE RESERVADA");
    expect(htmlActiva).toContain("Funcional");
    expect(htmlActiva).toContain("Hoy · 19:00 hs");
    // Ubicada encima de "Te toca hoy" y sin botones dentro de la tarjeta
    expect(htmlActiva.indexOf('data-testid="clase-reservada-card"')).toBeLessThan(
      htmlActiva.indexOf('data-testid="heroe-te-toca-hoy"'),
    );
    const cardHtml = htmlActiva.slice(
      htmlActiva.indexOf('data-testid="clase-reservada-card"'),
      htmlActiva.indexOf("</section>", htmlActiva.indexOf('data-testid="clase-reservada-card"')),
    );
    expect(cardHtml).not.toContain("<button");

    // Baja del alumno -> desaparece
    useClasesStore.setState({
      misReservas: [{ ...useClasesStore.getState().misReservas[0]!, estado: "CANCELADO" }],
    });
    expect(renderToStaticMarkup(<InicioMisDias />)).not.toContain('data-testid="clase-reservada-card"');

    // Clase cancelada por coach -> desaparece
    useClasesStore.setState({
      misReservas: [{ ...useClasesStore.getState().misReservas[0]!, estado: "ANOTADO" }],
      clases: [{ ...useClasesStore.getState().clases[0]!, estado: "CANCELADA" }],
    });
    expect(renderToStaticMarkup(<InicioMisDias />)).not.toContain('data-testid="clase-reservada-card"');
  });

  it("useClasesStore.cargarClasesAlumno consulta Supabase con sesión real y preserva caché offline", async () => {
    const uid = "11111111-1111-4111-8111-111111111111";
    const claseId = "22222222-2222-4222-8222-222222222222";
    const reservaId = "33333333-3333-4333-8333-333333333333";

    const getUserSpy = vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: uid } as any },
      error: null,
    } as any);
    const fromSpy = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "clases") {
        return {
          select: () => ({
            order: async () => ({
              data: [
                {
                  id: claseId,
                  horario_id: null,
                  actividad: "BOXEO",
                  inicio: "2026-11-21T19:00:00-03:00",
                  duracion_minutos: 60,
                  capacidad: 10,
                  estado: "PROGRAMADA",
                  motivo_cancelacion: null,
                  created_at: "2026-11-20T10:00:00Z",
                  updated_at: "2026-11-20T10:00:00Z",
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      if (table === "reservas") {
        return {
          select: () => ({
            eq: async () => ({
              data: [
                {
                  id: reservaId,
                  clase_id: claseId,
                  alumno_id: uid,
                  estado: "ANOTADO",
                  created_at: "2026-11-20T10:00:00Z",
                  updated_at: "2026-11-20T10:00:00Z",
                },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      } as any;
    });

    try {
      await useClasesStore.getState().cargarClasesAlumno();
      expect(useClasesStore.getState().clases[0]?.id).toBe(claseId);
      expect(useClasesStore.getState().misReservas[0]?.id).toBe(reservaId);

      // En offline conserva la caché real sin sobrescribir con dataset demo
      useOfflineQueueStore.setState({ isOnline: false });
      await useClasesStore.getState().cargarClasesAlumno();
      expect(useClasesStore.getState().misReservas[0]?.id).toBe(reservaId);
    } finally {
      getUserSpy.mockRestore();
      fromSpy.mockRestore();
    }
  });

  it("RachaFlama progresa por categorías (Hierro 1-4, Bronce 5-24, Oro 25-48, Diamante 49-52) con IDs de clipPath únicos (useId)", () => {
    const svg1 = renderToStaticMarkup(<RachaFlama semanas={1} />);
    expect(svg1).toContain('data-category="hierro"');
    expect(svg1).toContain('data-level="1"');
    expect(svg1).toContain('data-fill-pct="0"');
    expect(svg1).toContain('data-bars="1"');
    expect(svg1).not.toContain("<animate");

    const svg3 = renderToStaticMarkup(<RachaFlama semanas={3} />);
    expect(svg3).toContain('data-category="hierro"');
    expect(svg3).toContain('data-level="1"');
    expect(svg3).toContain('data-fill-pct="53"');
    expect(svg3).toContain('data-bars="3"');
    expect(svg3).toContain('dur="1.87s"');

    const svg6 = renderToStaticMarkup(<RachaFlama semanas={6} />);
    expect(svg6).toContain('data-category="bronce"');
    expect(svg6).toContain('data-level="2"');
    expect(svg6).toContain('data-bars="2"');
    expect(svg6).not.toContain("<animate");

    const svg28 = renderToStaticMarkup(<RachaFlama semanas={28} />);
    expect(svg28).toContain('data-category="oro"');
    expect(svg28).toContain('data-level="3"');
    expect(svg28).toContain('data-gold-step="1"');
    expect(svg28).toContain('dur="0.80s"');

    const svg52 = renderToStaticMarkup(<RachaFlama semanas={52} />);
    expect(svg52).toContain('data-category="diamante"');
    expect(svg52).toContain('data-level="4"');
    expect(svg52).toContain('data-sparks="12"');
    expect(svg52).toContain('data-flame-part="left"');
    expect(svg52).toContain('data-flame-part="right"');
    expect(svg52).toContain('data-flame-part="main"');

    expect(especificacionRacha(53).semanaCiclo).toBe(1);

    // Dos flamas en un mismo árbol SSR producen IDs de clipPath distintos (sin colisión)
    const par = renderToStaticMarkup(
      <>
        <RachaFlama semanas={4} />
        <RachaFlama semanas={9} />
      </>,
    );
    const ids = [...par.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("IndicadorRachaSemanas abre popover accesible role='dialog' y cierra al volver a tocar, clic afuera o Escape", () => {
    const htmlCerrado = renderToStaticMarkup(<IndicadorRachaSemanas semanas={4} />);
    expect(htmlCerrado).toContain('data-testid="racha-semanas-chip"');
    expect(htmlCerrado).toContain("4 SEM");
    expect(htmlCerrado).not.toContain("RACHA");
    expect(htmlCerrado).not.toContain('data-testid="racha-popover"');
    expect(htmlCerrado).toContain('aria-expanded="false"');

    const htmlAbierto = renderToStaticMarkup(
      <IndicadorRachaSemanas semanas={4} initialPopoverOpen={true} />,
    );
    expect(htmlAbierto).toContain('data-testid="racha-popover"');
    expect(htmlAbierto).toContain('role="dialog"');
    expect(htmlAbierto).toContain("4 semanas consecutivas");
    expect(htmlAbierto).toContain("al menos 1 sesión por semana");

    // Verificar toggle, clic afuera y Escape con hooks stub
    const setPopoverMock = vi.fn();
    let cleanupFn: (() => void) | undefined;
    const listeners: Record<string, (e: any) => void> = {};
    const prevDoc = (globalThis as any).document;
    const prevNode = (globalThis as any).Node;
    class FakeNode {}
    (globalThis as any).Node = FakeNode;
    const outsideTarget = new FakeNode();
    const insideTarget = new FakeNode();
    (globalThis as any).document = {
      addEventListener: (ev: string, fn: (e: any) => void) => {
        listeners[ev] = fn;
      },
      removeEventListener: vi.fn(),
    };
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals.H;
    const wrapCurrent = { contains: (target: unknown) => target === insideTarget };
    let refCall = 0;
    internals.H = {
      useState: () => [true, setPopoverMock],
      useEffect: (fn: () => void | (() => void)) => {
        const res = fn();
        if (typeof res === "function") cleanupFn = res;
      },
      useMemo: (fn: () => unknown) => fn(),
      useCallback: (fn: unknown) => fn,
      useRef: () => {
        refCall += 1;
        return { current: refCall === 1 ? wrapCurrent : { focus: vi.fn() } };
      },
    };
    try {
      const tree = IndicadorRachaSemanas({ semanas: 4, initialPopoverOpen: true }) as any;
      const btn = tree.props.children.find((child: any) => child?.type === "button");
      btn.props.onClick();
      expect(setPopoverMock).toHaveBeenCalledTimes(1);

      // Clic adentro NO cierra
      listeners.pointerdown?.({ target: insideTarget });
      expect(setPopoverMock).toHaveBeenCalledTimes(1);

      // Clic afuera SÍ cierra
      listeners.pointerdown?.({ target: outsideTarget });
      expect(setPopoverMock).toHaveBeenCalledWith(false);

      // Escape SÍ cierra
      setPopoverMock.mockClear();
      listeners.keydown?.({ key: "Escape" });
      expect(setPopoverMock).toHaveBeenCalledWith(false);
      cleanupFn?.();
    } finally {
      internals.H = prevDispatcher;
      (globalThis as any).document = prevDoc;
      (globalThis as any).Node = prevNode;
    }
  });

  it("cargarPlanAlumno() hidrata fechas reales desde registro_sesiones y degrada seguro en offline/error", async () => {
    const ahora = Date.now();
    const fechas4Semanas = [0, 7, 14, 21].map((dias) =>
      new Date(ahora - dias * 86_400_000).toISOString(),
    );
    const fetchPlanSpy = vi.spyOn(alumnosService, "fetchPlanAlumno").mockResolvedValue(PLAN_BASE);
    const fromSpy = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "registro_sesiones") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: fechas4Semanas.map((fecha, idx) => ({
                    id: `00000000-0000-4000-8000-00000000000${idx + 1}`,
                    dia_id: "d1",
                    fecha,
                  })),
                  error: null,
                }),
              }),
            }),
          }),
        } as any;
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      } as any;
    });

    try {
      await useAthleteStore.getState().cargarPlanAlumno();
      expect(useAthleteStore.getState().fechasSesionesServidor).toEqual(fechas4Semanas);
      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).toContain('data-testid="racha-semanas-chip"');
      expect(html).toContain("4 SEM");
      expect(html).toContain('data-category="hierro"');
      expect(html).toContain('data-level="1"');

      // En offline conserva fechas ya hidratadas y sesiones locales pendientes
      useOfflineQueueStore.setState({ isOnline: false });
      useAthleteStore.setState({
        sesionesCompletadas: [{ id: "local-off-1", dia_id: "d2", fecha: new Date().toISOString() }],
      });
      await useAthleteStore.getState().cargarPlanAlumno();
      expect(useAthleteStore.getState().fechasSesionesServidor).toEqual(fechas4Semanas);
      expect(useAthleteStore.getState().sesionesCompletadas.some((s) => s.id === "local-off-1")).toBe(true);
      expect(useAthleteStore.getState().errorPlan).toBe(false);
    } finally {
      fetchPlanSpy.mockRestore();
      fromSpy.mockRestore();
    }
  });

  it("tocar una fila de día DONE inicia ese día para repetirlo (mantiene ChevronRight)", () => {
    useAthleteStore.setState({
      planAlumno: PLAN_BASE,
      sesionesCompletadas: [{ id: "s-done", dia_id: "d1", fecha: new Date().toISOString() }],
    });

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
      const findByTestId = (node: any, testId: string): any => {
        if (!node || typeof node !== "object") return null;
        if (Array.isArray(node)) return node.map((n) => findByTestId(n, testId)).find(Boolean) ?? null;
        if (node.props?.["data-testid"] === testId) return node;
        return findByTestId(node.props?.children, testId);
      };
      const rowDia1 = findByTestId((InicioMisDias as () => unknown)(), "dia-row-d1");
      expect(rowDia1).not.toBeNull();
      expect(rowDia1.props["aria-label"]).toBe("Día 1, hecho");
      rowDia1.props.onClick();
    } finally {
      internals.H = prevDispatcher;
    }

    expect(useAthleteStore.getState().diaActivoId).toBe("d1");
  });

  it("GIVEN alumno solo de clases con reserva futura THEN muestra tarjeta de clase y contador X de N clases esta semana sin 'Todavía no tenés un plan'", () => {
    const alumnoSinPeso = {
      ...PLAN_BASE.alumnos[0]!,
      peso_corporal_kg: null,
    } as any;
    useAthleteStore.setState({
      planAlumno: {
        alumnos: [alumnoSinPeso],
        planes: [],
        dias: [],
        ejerciciosEnRutina: [],
        ejercicios: [],
      },
      cargandoPlan: false,
      errorPlan: false,
    });
    useChatStore.getState().sendMessage({
      alumnoId: alumnoSinPeso.id,
      remitente: STAFF_COACH_PRINCIPAL,
      contenido: "Hoy trabajamos técnica de boxeo",
      requiereLecturaInicio: true,
    });
    useClasesStore.setState({
      testAhora: "2026-11-20T12:00:00-03:00",
      membresia: {
        id: "cont-1",
        alumno_id: alumnoSinPeso.id,
        plan_membresia_id: "pm-3",
        actividad: "BOXEO",
        estado: "ACTIVA",
        fecha_inicio: "2026-11-01",
        fecha_fin: "2026-11-30",
      } as any,
      plan: {
        id: "pm-3",
        nombre: "Boxeo 3x",
        cantidad_actividades: 1,
        limite_semanal: 3,
      } as any,
      actividadesHabilitadas: ["BOXEO"],
      clases: [
        {
          id: "clase-box-1",
          horario_id: null,
          actividad: "BOXEO",
          inicio: "2026-11-20T19:00:00-03:00",
          duracion_minutos: 60,
          capacidad: 12,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          created_at: "2026-11-20T08:00:00Z",
          updated_at: "2026-11-20T08:00:00Z",
        },
      ],
      misReservas: [
        {
          id: "res-box-1",
          clase_id: "clase-box-1",
          alumno_id: alumnoSinPeso.id,
          estado: "ANOTADO",
          created_at: "2026-11-20T09:00:00Z",
          updated_at: "2026-11-20T09:00:00Z",
        },
      ],
    });

    const html = renderToStaticMarkup(<InicioMisDias />);
    expect(html).toContain('data-testid="inicio-clases"');
    expect(html).not.toContain('data-testid="inicio-sin-plan"');
    expect(html).not.toContain("Todavía no tenés un plan");
    expect(html).toContain('data-testid="clase-reservada-card"');
    expect(html).toContain("Boxeo");
    expect(html).toContain("Hoy · 19:00 hs");
    expect(html).toContain('data-testid="clases-semana-contador"');
    expect(html).toContain("1 de 3 clases esta semana");
    expect(html).not.toContain('data-testid="reservar-proxima-clase-cta"');
    expect(html).toContain('data-testid="recordatorio-peso-card"');
    expect(html).toContain('data-testid="unread-coach-message-banner"');
    expect(html).not.toContain('data-testid="racha-semanas-chip"');
  });

  it("GIVEN alumno solo de clases sin reservas THEN muestra CTA 'Reservá tu próxima clase' hacia /athlete/clases y soporta Pase libre", () => {
    useAthleteStore.setState({
      planAlumno: {
        ...PLAN_BASE,
        planes: [],
        dias: [],
        ejerciciosEnRutina: [],
      },
      cargandoPlan: false,
      errorPlan: false,
    });
    useClasesStore.setState({
      testAhora: "2026-11-20T12:00:00-03:00",
      membresia: {
        id: "cont-2",
        alumno_id: "al-1",
        plan_membresia_id: "pm-2",
        actividad: "FUNCIONAL",
        estado: "ACTIVA",
        fecha_inicio: "2026-11-01",
        fecha_fin: "2026-11-30",
      } as any,
      plan: {
        id: "pm-2",
        nombre: "Funcional 2x",
        cantidad_actividades: 1,
        limite_semanal: 2,
      } as any,
      actividadesHabilitadas: ["FUNCIONAL"],
      clases: [],
      misReservas: [],
    });

    const html = renderToStaticMarkup(<InicioMisDias />);
    expect(html).toContain('data-testid="inicio-clases"');
    expect(html).not.toContain("Todavía no tenés un plan");
    expect(html).toContain('data-testid="reservar-proxima-clase-cta"');
    expect(html).toContain('href="/athlete/clases"');
    expect(html).toContain("Reservá tu próxima clase");
    expect(html).toContain("0 de 2 clases esta semana");

    useClasesStore.setState({
      plan: {
        id: "pm-libre",
        nombre: "Pase Libre",
        cantidad_actividades: 2,
        limite_semanal: null,
      } as any,
    });
    const htmlLibre = renderToStaticMarkup(<InicioMisDias />);
    expect(htmlLibre).toContain("Pase libre");
    expect(htmlLibre).not.toContain("clases esta semana");
  });
});
