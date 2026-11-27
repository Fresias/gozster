import * as React from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Res = { data: unknown; error: unknown };

/** Cliente Supabase mínimo: cada tabla resuelve a un resultado fijo; los filtros encadenan. */
function crearCliente(tablas: Record<string, Res>, extra: Record<string, unknown> = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "coach-1" } }, error: null }) },
    from(tabla: string) {
      const res = tablas[tabla] ?? { data: [], error: null };
      const builder: any = {
        then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko),
      };
      for (const m of ["select", "or", "eq", "in", "order", "maybeSingle"]) builder[m] = () => builder;
      return builder;
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    ...extra,
  } as any;
}

const mocks = vi.hoisted(() => ({
  browserClient: null as any,
  serverClient: null as any,
  fetchCobros: null as any,
  fetchLive: null as any,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_t, k) => mocks.browserClient?.[k as string] }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.serverClient }));

vi.mock("@/services/cobros-service", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/services/cobros-service")>();
  return { ...mod, fetchCobrosDatasetFromSupabase: (...args: unknown[]) => mocks.fetchCobros(...args) };
});

vi.mock("@/services/alumnos-service", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/services/alumnos-service")>();
  return { ...mod, fetchLiveDatasetFromSupabase: (...args: unknown[]) => mocks.fetchLive(...args) };
});

vi.mock("@/lib/kpis-negocio", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/kpis-negocio")>();
  return { ...mod, obtenerKpisNegocio: async () => mod.crearKpisNegocioVacios("ENTRENADOR") };
});

import { fireEvent, render } from "@/test-utils/no-demo-literals";
import { CobrosPanel } from "@/components/coach/cobros-panel";
import { ClassAgenda } from "@/components/coach/class-agenda";
import { MiProgreso } from "@/components/athlete/mi-progreso";
import { RankingFuncional } from "@/components/coach/ranking-funcional";
import CobrosPage from "@/app/(coach)/studio/cobros/page";
import StudioAgendaPage from "@/app/(coach)/studio/agenda/page";
import StudioRankingFuncionalPage from "@/app/(coach)/studio/ranking-funcional/page";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useRankingStore } from "@/store/use-ranking-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { MiProgresoData } from "@/lib/mi-progreso";

// Las páginas server usan el runtime JSX automático de Next; en vitest el JSX es clásico.
(globalThis as any).React = React;

const DATASET_VACIO = { cobros: [], contrataciones: [], planesMembresia: [], pagos: [], alumnoActividades: [] };
const ERROR_DB = { message: "permission denied for table perfiles", code: "42501" };

beforeEach(() => {
  mocks.browserClient = crearCliente({});
  mocks.serverClient = crearCliente({});
  mocks.fetchCobros = vi.fn().mockResolvedValue(DATASET_VACIO);
  mocks.fetchLive = vi.fn().mockResolvedValue({ alumnos: [], ejercicios: [] });
  useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
});

afterEach(() => vi.restoreAllMocks());

describe("GOZS-904 · Cobros: errores de carga con Reintentar", () => {
  it("GIVEN perfilesRes.error en cargarCobros THEN el store expone el error real (no mapea en silencio)", async () => {
    mocks.browserClient = crearCliente({ perfiles: { data: null, error: ERROR_DB } });
    await useCobrosStore.getState().cargarCobros();
    const { error, cargando } = useCobrosStore.getState();
    expect(cargando).toBe(false);
    expect(error).toContain("No se pudieron cargar los perfiles de alumnos");
    expect(error).toContain(ERROR_DB.message);
  });

  it("GIVEN fallo SSR de perfiles/cobros THEN la página pasa initialError a CobrosPanel", async () => {
    mocks.serverClient = crearCliente({ perfiles: { data: null, error: ERROR_DB } });
    mocks.fetchCobros = vi.fn().mockRejectedValue(new Error("timeout cobros"));
    const el = (await CobrosPage()) as React.ReactElement<{ initialError?: string | null }>;
    expect(el.props.initialError).toContain("No se pudieron cargar los cobros: timeout cobros");
    expect(el.props.initialError).toContain(`No se pudieron cargar los perfiles de alumnos: ${ERROR_DB.message}`);
  });

  it("GIVEN carga SSR correcta THEN initialError es null", async () => {
    const el = (await CobrosPage()) as React.ReactElement<{ initialError?: string | null }>;
    expect(el.props.initialError).toBeNull();
  });

  it("GIVEN initialError THEN CobrosPanel muestra role=alert y Reintentar dispara cargarCobros()", () => {
    const cargarCobros = vi.fn().mockResolvedValue(undefined);
    useCobrosStore.setState({ cargarCobros, error: null, aviso: null, cargando: false });
    const { getByTestId, queryByTestId } = render(
      <CobrosPanel initialDataset={DATASET_VACIO} initialPerfiles={[]} isLiveMode initialError="No se pudieron cargar los cobros: x." />,
    );
    const alerta = getByTestId("cobros-error-alert");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain("No se pudieron cargar los cobros: x.");
    fireEvent.click(getByTestId("cobros-error-reintentar"));
    expect(cargarCobros).toHaveBeenCalledTimes(1);
    expect(queryByTestId("cobros-error-alert")).toBeNull();
  });
});

describe("GOZS-904 · Agenda: errores de carga con Reintentar", () => {
  it("GIVEN fallo SSR en clases/reservas/clases_profesores THEN la página pasa initialError a ClassAgenda", async () => {
    mocks.serverClient = crearCliente({ reservas: { data: null, error: { message: "reservas caídas" } } });
    const el = (await StudioAgendaPage()) as React.ReactElement<{ initialError?: string | null }>;
    expect(el.props.initialError).toBe("No se pudo cargar la agenda: reservas caídas.");

    mocks.serverClient = crearCliente({ clases_profesores: { data: null, error: { message: "profes caídos" } } });
    const el2 = (await StudioAgendaPage()) as React.ReactElement<{ initialError?: string | null }>;
    expect(el2.props.initialError).toBe("No se pudo cargar la agenda: profes caídos.");
  });

  it("GIVEN fetchLiveDatasetFromSupabase rechaza THEN initialError se informa sin romper la página", async () => {
    mocks.fetchLive = vi.fn().mockRejectedValue(new Error("red"));
    const el = (await StudioAgendaPage()) as React.ReactElement<{ initialError?: string | null; alumnosDisponibles?: unknown[] }>;
    expect(el.props.initialError).toContain("No se pudieron cargar los alumnos: red");
    expect(el.props.alumnosDisponibles).toEqual([]);
  });

  it("GIVEN initialError THEN ClassAgenda muestra role=alert y Reintentar recarga la agenda", () => {
    const cargarAgenda = vi.fn().mockResolvedValue(undefined);
    useClasesStore.setState({ cargarAgenda, subscribeToRealtime: () => () => {}, error: null, aviso: null, cargando: false });
    const { getByTestId, queryByTestId } = render(
      <ClassAgenda isLiveMode initialClases={[]} initialReservas={[]} initialError="No se pudo cargar la agenda: x." />,
    );
    const llamadasMontaje = cargarAgenda.mock.calls.length;
    const alerta = getByTestId("agenda-error-alert");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain("No se pudo cargar la agenda: x.");
    fireEvent.click(getByTestId("agenda-error-reintentar"));
    expect(cargarAgenda).toHaveBeenCalledTimes(llamadasMontaje + 1);
    expect(queryByTestId("agenda-error-alert")).toBeNull();
  });
});

describe("GOZS-904 · Ranking Funcional y Progreso del alumno", () => {
  beforeEach(() => {
    useRankingStore.setState({ rankingAlumno: [], rankingAlumnoError: null, prs: [], perfilesActualizados: {} });
  });

  it("GIVEN obtener_ranking_funcional_alumno falla online THEN rankingAlumnoError contiene el error y se conserva el ranking previo", async () => {
    const previo = [{ ejercicio_id: "ej-1", peso_kg: 50, ratio: 0.7, posicion: 2 }] as any;
    useRankingStore.setState({ rankingAlumno: previo });
    mocks.browserClient = crearCliente({}, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "rpc caída" } }) });
    await useRankingStore.getState().cargarRankingAlumno();
    const s = useRankingStore.getState();
    expect(s.rankingAlumnoError).toContain("rpc caída");
    expect(s.rankingAlumno).toBe(previo);
    expect(s.cargandoRankingAlumno).toBe(false);
  });

  it("GIVEN excepción de red THEN rankingAlumnoError se setea; reintento exitoso y limpiarAviso lo limpian", async () => {
    mocks.browserClient = crearCliente({}, { rpc: vi.fn().mockRejectedValue(new Error("Failed to fetch")) });
    await useRankingStore.getState().cargarRankingAlumno();
    expect(useRankingStore.getState().rankingAlumnoError).toContain("Failed to fetch");

    useRankingStore.getState().limpiarAviso();
    expect(useRankingStore.getState().rankingAlumnoError).toBeNull();

    useRankingStore.setState({ rankingAlumnoError: "previo" });
    mocks.browserClient = crearCliente({}, { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) });
    await useRankingStore.getState().cargarRankingAlumno();
    expect(useRankingStore.getState().rankingAlumnoError).toBeNull();
  });

  it("GIVEN rankingError THEN MiProgreso muestra role=alert con Reintentar sin ocultar las sesiones", () => {
    const onReintentar = vi.fn();
    const data: MiProgresoData = { sesiones_mes: 5, sesiones_mes_anterior: 3, ejercicios: [] } as any;
    const { getByTestId, container } = render(
      <MiProgreso
        estado="listo"
        vista="SIMPLE"
        data={data}
        rankingError="No se pudo cargar tu ranking de Funcional: rpc caída."
        onReintentarRanking={onReintentar}
      />,
    );
    const alerta = getByTestId("progreso-ranking-error");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain("rpc caída");
    expect(container.textContent).toContain("Sesiones este mes");
    fireEvent.click(getByTestId("progreso-ranking-reintentar"));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it("GIVEN sin rankingError THEN MiProgreso no muestra el aviso", () => {
    const { queryByTestId } = render(<MiProgreso estado="listo" vista="SIMPLE" data={null} />);
    expect(queryByTestId("progreso-ranking-error")).toBeNull();
  });

  it("GIVEN fallo SSR de clases/reservas/v_prs THEN la página pasa initialSyncError y RankingFuncional muestra Reintentar desde el primer render", async () => {
    mocks.serverClient = crearCliente({ v_prs: { data: null, error: { message: "vista caída" } } });
    const el = (await StudioRankingFuncionalPage({})) as React.ReactElement<{ initialSyncError?: string | null }>;
    expect(el.props.initialSyncError).toBe("No se pudo actualizar el ranking: vista caída.");

    useRankingStore.setState({ syncError: null });
    const { getByTestId } = render(
      <RankingFuncional isLiveMode alumnosDisponibles={[]} ejerciciosDisponibles={[]} clasesDisponibles={[]} initialSyncError={el.props.initialSyncError} />,
    );
    expect(getByTestId("ranking-sync-estado").getAttribute("data-estado")).toBe("error");
    expect(getByTestId("ranking-sync-reintentar")).toBeTruthy();
  });

  it("GIVEN calcularRanking con PR de un alumno sin perfil cargado THEN usa 'Alumno' y no nombres demo (G5)", () => {
    useRankingStore.setState({
      prs: [
        { id: "pr-1", clase_id: "c-1", alumno_id: "demo-alumno-01-lucas", ejercicio_id: "ej-1", peso_kg: 20, reps: 3, fecha: "2026-11-20" },
      ] as any,
    });
    const res = useRankingStore.getState().calcularRanking({ claseId: "c-1", ejercicioId: "ej-1", alumnos: [] });
    const texto = JSON.stringify(res);
    for (const demo of ["Lucas Giménez", "Emilia Castro", "Camila Navarro", "Mateo Rossi", "Renata Quiroga", "Alumno Desconocido"]) {
      expect(texto).not.toContain(demo);
    }
    expect(texto).toContain('"Alumno"');

    const src = fs.readFileSync(path.resolve(__dirname, "../store/use-ranking-store.ts"), "utf-8");
    for (const demo of ["Lucas Giménez", "Emilia Castro", "Camila Navarro", "Mateo Rossi", "Renata Quiroga"]) {
      expect(src).not.toContain(demo);
    }
  });
});
