import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/studio",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { CobrosPanel } from "@/components/coach/cobros-panel";
import { StudioSankeyView } from "@/components/coach/studio-sankey-view";
import { ClassAgenda } from "@/components/coach/class-agenda";
import { RankingFuncional } from "@/components/coach/ranking-funcional";
import { ChatFab } from "@/components/coach/chat-fab";
import { StudioShell } from "@/components/coach/studio-shell";
import { StudentDetail } from "@/components/coach/student-detail";
import { crearKpisNegocioVacios } from "@/lib/kpis-negocio";
import { derivarMontoSuscripcion } from "@/lib/alumno-ficha";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useRankingStore } from "@/store/use-ranking-store";
import { useChatStore } from "@/store/use-chat-store";
import { assertNoDemoLiteralsInLiveMode } from "@/test-utils/no-demo-literals";
import { supabase } from "@/lib/supabase/client";
import type { Clase, Perfil } from "@/types/database.types";

const STUDIO_FORBIDDEN_LITERALS = [
  "Lucía Ferraro",
  "$767.000",
  "$105.000",
  "$215.000",
  "$995.000",
  "29 alumnos al día",
  "7 alumnos con cuota vencida",
  "Félix",
];

describe("GOZS-685 (F-1): Studio sin datos demo con DB vacía y profesores reales en Agenda", () => {
  beforeEach(() => {
    useCoachStudioStore.setState({
      alumnos: [],
      planes: [],
      dias: [],
      ejerciciosEnRutina: [],
      ejercicios: [],
      historialCargas: {},
      contrataciones: [],
      alumnoActividades: [],
      isLiveDatabase: false,
      selectedAlumnoId: null,
    });
    useCobrosStore.setState({
      cobros: [],
      planes: [],
      pagosHistorial: [],
      isLiveMode: false,
    });
    useClasesStore.setState({
      clases: [],
      agendaReservas: [],
      profesoresPorClase: {},
      clasesAlumno: [],
      reservasAlumno: [],
    });
    useRankingStore.setState({
      prs: [],
      perfilesActualizados: {},
    });
    useChatStore.getState().resetToDefaults();
    useChatStore.setState({ staffCoaches: [] });
  });

  it("todos los stores de Studio arrancan vacíos sin datos demo inyectados", () => {
    const emptyDataset = {
      alumnos: [],
      planes: [],
      dias: [],
      ejerciciosEnRutina: [],
      ejercicios: [],
      alumnoActividades: [],
      contrataciones: [],
      planesMembresia: [],
      cobros: [],
    };
    useCobrosStore.getState().hydrateFromLiveDataset(emptyDataset);

    expect(useCoachStudioStore.getState().alumnos).toEqual([]);
    expect(useCoachStudioStore.getState().planes).toEqual([]);
    expect(useCobrosStore.getState().cobros).toEqual([]);
    expect(useCobrosStore.getState().planes).toEqual([]);
    expect(useCobrosStore.getState().isLiveMode).toBe(true);
    expect(useClasesStore.getState().clases).toEqual([]);
    expect(useRankingStore.getState().prs).toEqual([]);
  });

  it("CoachStudioView con DB vacía (alumnos: []) muestra $0, 0 de 0 y cero literales demo (ni Celeste ni Lucas)", () => {
    const kpisVacios = crearKpisNegocioVacios("ADMIN", "oct");
    const html = renderToStaticMarkup(
      <CoachStudioView
        initialDataset={{
          alumnos: [],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: [],
          contrataciones: [],
          planesMembresia: [],
          cobros: [],
        }}
        kpis={kpisVacios}
        initialAlumnosExpanded={true}
      />,
    );

    expect(html).toContain("$0");
    expect(html).toContain("Mostrando 0 de 0");
    expect(html).not.toContain("Celeste");
    assertNoDemoLiteralsInLiveMode(html, STUDIO_FORBIDDEN_LITERALS);
  });

  it("CoachDashboardView con DB vacía muestra KPIs en $0, empty states y cero literales demo", () => {
    const kpisVacios = crearKpisNegocioVacios("ADMIN", "oct");
    const html = renderToStaticMarkup(
      <CoachDashboardView
        initialDataset={{
          alumnos: [],
          planes: [],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
          alumnoActividades: [],
          contrataciones: [],
          planesMembresia: [],
          cobros: [],
        }}
        kpis={kpisVacios}
      />,
    );

    expect(html).toContain("Todas (0)");
    expect(html).toContain(">0<");
    assertNoDemoLiteralsInLiveMode(html, STUDIO_FORBIDDEN_LITERALS);
  });

  it("CobrosPanel en modo live con DB vacía muestra $0, 0% y cero cifras demo ($767.000/$105.000/$215.000/71%/29)", () => {
    const kpisVacios = crearKpisNegocioVacios("ADMIN", "oct");
    const html = renderToStaticMarkup(
      <CobrosPanel
        initialDataset={{
          cobros: [],
          contrataciones: [],
          planesMembresia: [],
          pagos: [],
          alumnoActividades: [],
        }}
        initialPerfiles={[]}
        kpis={kpisVacios}
        isLiveMode={true}
      />,
    );

    expect(html).toContain("$0");
    expect(html).toContain("0%");
    expect(html).toContain("Mostrando 0 de 0");
    expect(html).not.toContain("71%");
    assertNoDemoLiteralsInLiveMode(html, STUDIO_FORBIDDEN_LITERALS);
  });

  it("StudioSankeyView en modo live con KPIs vacíos muestra $0, 0 morosos (no 6) y 0% online (no $995.000)", () => {
    const kpisVacios = crearKpisNegocioVacios("ADMIN", "oct");
    const html = renderToStaticMarkup(
      <StudioSankeyView kpis={kpisVacios} isLiveMode={true} />,
    );

    expect(html).toContain("$0");
    expect(html).not.toContain("995.000");
    expect(html).toContain("0 alumnos morosos");
    assertNoDemoLiteralsInLiveMode(html, STUDIO_FORBIDDEN_LITERALS);
  });

  it("ClassAgenda en modo live lee profesores reales de clases_profesores y no muestra 'Lucía Ferraro'", () => {
    const claseReal: Clase = {
      id: "11111111-1111-4111-8111-111111111111",
      horario_id: null,
      actividad: "FUNCIONAL",
      inicio: "2026-11-22T18:00:00-03:00",
      duracion_minutos: 60,
      capacidad: 10,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      notas_coach: null,
      created_at: "2026-11-20T10:00:00Z",
      updated_at: "2026-11-20T10:00:00Z",
    };

    const html = renderToStaticMarkup(
      <ClassAgenda
        clases={[claseReal]}
        initialClases={[claseReal]}
        initialReservas={[]}
        initialProfesoresPorClase={{
          [claseReal.id]: [
            {
              clase_id: claseReal.id,
              profesor_id: "22222222-2222-4222-8222-222222222222",
              nombre_completo: "Martín Gómez",
            },
          ],
        }}
        alumnosDisponibles={[]}
        isLiveMode={true}
        initialSheetOpen={true}
        initialClaseId={claseReal.id}
        testAhora="2026-11-22T12:00:00-03:00"
      />,
    );

    expect(html).toContain("Entrenador a cargo: Martín Gómez");
    assertNoDemoLiteralsInLiveMode(html, STUDIO_FORBIDDEN_LITERALS);
  });

  it("RankingFuncional, ChatFab y StudioShell en modo live con DB vacía no filtran MOCK_ALUMNOS, Félix ni Lucía Ferraro", () => {
    const htmlRanking = renderToStaticMarkup(
      <RankingFuncional
        alumnosDisponibles={[]}
        ejerciciosDisponibles={[]}
        clasesDisponibles={[]}
        reservasDisponibles={[]}
        prsIniciales={[]}
        isLiveMode={true}
      />,
    );
    assertNoDemoLiteralsInLiveMode(htmlRanking, STUDIO_FORBIDDEN_LITERALS);

    const htmlChat = renderToStaticMarkup(
      <ChatFab alumno={null} isOpen={true} isLiveMode={true} />,
    );
    assertNoDemoLiteralsInLiveMode(htmlChat, STUDIO_FORBIDDEN_LITERALS);

    const htmlShell = renderToStaticMarkup(
      <StudioShell isLiveMode={true}>
        <div>Vista vacía</div>
      </StudioShell>,
    );
    expect(htmlShell).toContain("Entrenador");
    assertNoDemoLiteralsInLiveMode(htmlShell, STUDIO_FORBIDDEN_LITERALS);
  });

  it("StudentDetail con alumno real UUID llamado 'Lucas Pérez' no activa LUCAS_2_MONTHS_HISTORIAL ni demoCuestionarioLucas ni Félix", () => {
    useCoachStudioStore.setState({ isLiveDatabase: true });
    const lucasReal: Perfil = {
      id: "33333333-3333-4333-8333-333333333333",
      email: "lucas.perez@real.test",
      nombre_completo: "Lucas Pérez",
      rol: "ALUMNO",
      telefono: null,
      avatar_url: null,
      profesor_asignado_id: null,
      estado_membresia: "ACTIVA",
      nivel_vista_alumno: "SIMPLE",
      created_at: "2026-11-20T10:00:00Z",
      updated_at: "2026-11-20T10:00:00Z",
    };

    const html = renderToStaticMarkup(
      <StudentDetail
        alumno={lucasReal}
        activeTab="rutina_actual"
        onTabChange={vi.fn()}
        onBack={vi.fn()}
        rutinaActiva={null}
        historialPlanes={[]}
        dias={[]}
        ejerciciosEnRutina={[]}
        ejerciciosCatalogo={[]}
        onOpenHistoricalLoads={vi.fn()}
        onClonarUltimaRutina={vi.fn().mockResolvedValue(null)}
        onExtenderVigencia={vi.fn().mockResolvedValue(null)}
        isOffline={false}
      />,
    );

    expect(html).toContain("Lucas Pérez");
    expect(html).not.toContain("Hipertrofia / Ganancia Muscular y Fuerza Base");
    assertNoDemoLiteralsInLiveMode(html, STUDIO_FORBIDDEN_LITERALS);
  });

  it("derivarMontoSuscripcion devuelve 0 cuando no existen planes reales ni cobros", () => {
    const lucasReal: Perfil = {
      id: "44444444-4444-4444-8444-444444444444",
      email: "alumno@real.test",
      nombre_completo: "Alumno Real",
      rol: "ALUMNO",
      telefono: null,
      avatar_url: null,
      profesor_asignado_id: null,
      estado_membresia: "ACTIVA",
      nivel_vista_alumno: "SIMPLE",
      created_at: "2026-11-20T10:00:00Z",
      updated_at: "2026-11-20T10:00:00Z",
    };
    expect(
      derivarMontoSuscripcion({
        alumno: lucasReal,
        contrataciones: [],
        planesMembresia: [],
      }).monto,
    ).toBe(0);
  });

  it("useClasesStore.cargarAgenda consulta clases_profesores y resuelve el entrenador asignado", async () => {
    const claseId = "55555555-5555-4555-8555-555555555555";
    const profId = "66666666-6666-4666-8666-666666666666";
    const origGetUser = supabase.auth.getUser;
    const origFrom = supabase.from;

    try {
      (supabase.auth as any).getUser = vi.fn().mockResolvedValue({
        data: { user: { id: profId } },
      });
      (supabase as any).from = vi.fn((table: string) => {
        if (table === "clases") {
          return {
            select: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: claseId,
                      horario_id: null,
                      actividad: "FUNCIONAL",
                      inicio: "2026-11-22T18:00:00Z",
                      duracion_minutos: 60,
                      capacidad: 10,
                      estado: "PROGRAMADA",
                      motivo_cancelacion: null,
                      notas_coach: null,
                      created_at: "2026-11-20T00:00:00Z",
                      updated_at: "2026-11-20T00:00:00Z",
                    },
                  ],
                  error: null,
                }),
            }),
          };
        }
        if (table === "reservas") {
          return {
            select: () => ({
              order: () =>
                Promise.resolve({
                  data: [],
                  error: null,
                }),
            }),
          };
        }
        if (table === "clases_profesores") {
          return {
            select: () =>
              Promise.resolve({
                data: [
                  {
                    clase_id: claseId,
                    profesor_id: profId,
                    perfiles: { nombre_completo: "Coach Asignado Dev" },
                  },
                ],
                error: null,
              }),
          };
        }
        return { select: () => Promise.resolve({ data: [], error: null }) };
      });

      await useClasesStore.getState().cargarAgenda();
      const profes = useClasesStore.getState().profesoresPorClase[claseId] ?? [];
      expect(profes).toHaveLength(1);
      expect(profes[0]?.nombre_completo).toBe("Coach Asignado Dev");
    } finally {
      (supabase.auth as any).getUser = origGetUser;
      (supabase as any).from = origFrom;
    }
  });
});
