import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Res = { data: unknown; error: unknown };

/** Cliente Supabase mínimo: cada tabla resuelve a un resultado (mutable); los filtros encadenan. */
function crearCliente(tablas: Record<string, Res>) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ALUMNO_ID } }, error: null }) },
    from(tabla: string) {
      const res = tablas[tabla] ?? { data: [], error: null };
      const builder: any = {
        then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko),
      };
      for (const m of ["select", "or", "eq", "gte", "in", "order", "limit", "maybeSingle"]) builder[m] = () => builder;
      return builder;
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;
}

const mocks = vi.hoisted(() => ({ client: null as any }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_t, k) => mocks.client?.[k as string] }),
}));

import { fireEvent, render } from "@/test-utils/no-demo-literals";
import { MiProgreso } from "@/components/athlete/mi-progreso";
import { HistorialSesiones } from "@/components/athlete/historial-sesiones";
import { AthleteClasses } from "@/components/athlete/athlete-classes";
import { MSG_ERROR_HISTORIAL, MSG_ERROR_PROGRESO, useAthleteStore } from "@/store/use-athlete-store";
import { MSG_ERROR_CLASES, useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { MiProgresoData } from "@/lib/mi-progreso";

const ALUMNO_ID = "00000000-0000-4000-8000-0000000000aa";
/** Deja correr las cargas async disparadas por efectos/clicks (el render de test no expone act). */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const ERROR_DB = { message: "permission denied for table registro_series", code: "42501" };
const SQL_CRUDO = /permission denied|42501|registro_series|PGRST/;

const PROGRESO_CACHE: MiProgresoData = {
  sesiones_mes: 3,
  sesiones_mes_anterior: 2,
  volumen_mes_kg: 1200,
  volumen_mes_anterior_kg: 900,
  ejercicios: [],
} as unknown as MiProgresoData;

const SESION_CACHE = {
  sesion: { id: "00000000-0000-4000-8000-0000000000s1", alumno_id: ALUMNO_ID, fecha: "2026-11-20" } as any,
  series: [],
};

const SESION_REMOTA = {
  id: "00000000-0000-4000-8000-0000000000s2",
  alumno_id: ALUMNO_ID,
  fecha: "2026-11-25",
  volumen_total_kg: 0,
};

const CLASE_REAL = {
  id: "00000000-0000-4000-8000-0000000000c1",
  actividad: "FUNCIONAL",
  inicio: "2026-11-27T12:00:00-03:00",
  fin: "2026-11-27T13:00:00-03:00",
  capacidad: 10,
};

beforeEach(() => {
  mocks.client = crearCliente({});
  useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
  useAthleteStore.setState({
    miProgreso: null,
    miProgresoFecha: null,
    miProgresoError: null,
    historialSesiones: [],
    historialError: null,
    currentSession: { ...useAthleteStore.getState().currentSession, studentId: ALUMNO_ID },
  });
  useClasesStore.setState({
    clases: [],
    misReservas: [],
    agendaReservas: [],
    actualizadoAt: null,
    error: null,
    errorCargaClases: false,
    aviso: null,
  });
});

afterEach(() => vi.restoreAllMocks());

describe("GOZS-917 · cargarMiProgreso propaga errores de PostgREST", () => {
  it("GIVEN error en registro_series sin caché THEN setea miProgresoError amigable y no pisa con vacío", async () => {
    mocks.client = crearCliente({ registro_series: { data: null, error: ERROR_DB } });
    await useAthleteStore.getState().cargarMiProgreso();
    const s = useAthleteStore.getState();
    expect(s.miProgresoError).toBe(MSG_ERROR_PROGRESO);
    expect(s.miProgresoError).not.toMatch(SQL_CRUDO);
    expect(s.miProgreso).toBeNull();
    expect(s.cargandoMiProgreso).toBe(false);
  });

  it("GIVEN caché previa y error en registro_sesiones THEN conserva miProgreso cacheado", async () => {
    useAthleteStore.setState({ miProgreso: PROGRESO_CACHE, miProgresoFecha: "2026-11-20T10:00:00Z" });
    mocks.client = crearCliente({ registro_sesiones: { data: null, error: ERROR_DB } });
    await useAthleteStore.getState().cargarMiProgreso({ forceRefresh: true });
    const s = useAthleteStore.getState();
    expect(s.miProgreso).toBe(PROGRESO_CACHE);
    expect(s.miProgresoFecha).toBe("2026-11-20T10:00:00Z");
    expect(s.miProgresoError).toBe(MSG_ERROR_PROGRESO);
  });

  it("GIVEN error en el catálogo de ejercicios THEN también se trata como fallo", async () => {
    useAthleteStore.setState({ miProgreso: PROGRESO_CACHE });
    mocks.client = crearCliente({
      registro_series: {
        data: [
          {
            ejercicio_id: "ej-1",
            sesion_id: "s-1",
            numero_serie: 1,
            peso_kg: 50,
            reps_hechas: 5,
            rpe_real: 8,
            completada: true,
            set_type: null,
            registro_sesiones: { fecha: "2026-11-25", alumno_id: ALUMNO_ID },
          },
        ],
        error: null,
      },
      ejercicios: { data: null, error: ERROR_DB },
    });
    await useAthleteStore.getState().cargarMiProgreso({ forceRefresh: true });
    expect(useAthleteStore.getState().miProgreso).toBe(PROGRESO_CACHE);
    expect(useAthleteStore.getState().miProgresoError).toBe(MSG_ERROR_PROGRESO);
  });

  it("GIVEN error previo WHEN Supabase se recupera y se reintenta THEN limpia el error y carga datos", async () => {
    useAthleteStore.setState({ miProgresoError: MSG_ERROR_PROGRESO });
    await useAthleteStore.getState().cargarMiProgreso({ forceRefresh: true });
    const s = useAthleteStore.getState();
    expect(s.miProgresoError).toBeNull();
    expect(s.miProgreso).not.toBeNull();
    expect(s.miProgresoFecha).not.toBeNull();
  });

  it("GIVEN offline THEN no consulta ni setea error", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    mocks.client = crearCliente({ registro_series: { data: null, error: ERROR_DB } });
    await useAthleteStore.getState().cargarMiProgreso();
    expect(useAthleteStore.getState().miProgresoError).toBeNull();
  });

  it("miProgresoError e historialError no se persisten", () => {
    const opts = (useAthleteStore as any).persist.getOptions();
    const persistido = opts.partialize({
      ...useAthleteStore.getState(),
      miProgresoError: "x",
      historialError: "y",
    });
    expect(persistido).not.toHaveProperty("miProgresoError");
    expect(persistido).not.toHaveProperty("historialError");
  });
});

describe("GOZS-917 · cargarHistorialSesiones propaga errores", () => {
  it("GIVEN sesErr sin caché THEN setea historialError amigable", async () => {
    mocks.client = crearCliente({ registro_sesiones: { data: null, error: ERROR_DB } });
    await useAthleteStore.getState().cargarHistorialSesiones();
    const s = useAthleteStore.getState();
    expect(s.historialError).toBe(MSG_ERROR_HISTORIAL);
    expect(s.historialError).not.toMatch(SQL_CRUDO);
    expect(s.historialSesiones).toEqual([]);
    expect(s.cargandoHistorial).toBe(false);
  });

  it("GIVEN caché previa y error en registro_series THEN conserva el historial cacheado", async () => {
    useAthleteStore.setState({ historialSesiones: [SESION_CACHE] });
    mocks.client = crearCliente({
      registro_sesiones: { data: [SESION_REMOTA], error: null },
      registro_series: { data: null, error: ERROR_DB },
    });
    await useAthleteStore.getState().cargarHistorialSesiones();
    const s = useAthleteStore.getState();
    expect(s.historialSesiones).toEqual([SESION_CACHE]);
    expect(s.historialError).toBe(MSG_ERROR_HISTORIAL);
  });

  it("GIVEN error previo WHEN se recupera THEN limpia el error y fusiona las sesiones remotas", async () => {
    useAthleteStore.setState({ historialError: MSG_ERROR_HISTORIAL });
    mocks.client = crearCliente({ registro_sesiones: { data: [SESION_REMOTA], error: null } });
    await useAthleteStore.getState().cargarHistorialSesiones();
    const s = useAthleteStore.getState();
    expect(s.historialError).toBeNull();
    expect(s.historialSesiones.map((h) => h.sesion.id)).toContain(SESION_REMOTA.id);
  });

  it("GIVEN lista vacía real sin error THEN limpia historialError", async () => {
    useAthleteStore.setState({ historialError: MSG_ERROR_HISTORIAL });
    await useAthleteStore.getState().cargarHistorialSesiones();
    expect(useAthleteStore.getState().historialError).toBeNull();
  });
});

describe("GOZS-917 · cargarClasesAlumno propaga errores online", () => {
  it("GIVEN error en clases sin caché THEN error amigable, flag de reintento y sin actualizadoAt", async () => {
    mocks.client = crearCliente({ clases: { data: null, error: ERROR_DB } });
    await useClasesStore.getState().cargarClasesAlumno();
    const s = useClasesStore.getState();
    expect(s.error).toBe(MSG_ERROR_CLASES);
    expect(s.error).not.toMatch(SQL_CRUDO);
    expect(s.errorCargaClases).toBe(true);
    expect(s.actualizadoAt).toBeNull();
    expect(s.cargando).toBe(false);
  });

  it("GIVEN caché real y error en reservas THEN conserva clases y actualizadoAt previos", async () => {
    useClasesStore.setState({ clases: [CLASE_REAL as any], actualizadoAt: "2026-11-20T10:00:00Z" });
    mocks.client = crearCliente({ reservas: { data: null, error: ERROR_DB } });
    await useClasesStore.getState().cargarClasesAlumno();
    const s = useClasesStore.getState();
    expect(s.clases).toEqual([CLASE_REAL]);
    expect(s.actualizadoAt).toBe("2026-11-20T10:00:00Z");
    expect(s.errorCargaClases).toBe(true);
  });

  it("GIVEN excepción en la lectura THEN también se avisa con reintento", async () => {
    mocks.client = crearCliente({});
    mocks.client.from = () => {
      throw new Error("fetch failed");
    };
    await useClasesStore.getState().cargarClasesAlumno();
    expect(useClasesStore.getState().error).toBe(MSG_ERROR_CLASES);
    expect(useClasesStore.getState().errorCargaClases).toBe(true);
  });

  it("GIVEN error previo WHEN se recupera THEN limpia error y flag", async () => {
    useClasesStore.setState({ error: MSG_ERROR_CLASES, errorCargaClases: true });
    mocks.client = crearCliente({ clases: { data: [CLASE_REAL], error: null } });
    await useClasesStore.getState().cargarClasesAlumno();
    const s = useClasesStore.getState();
    expect(s.error).toBeNull();
    expect(s.errorCargaClases).toBe(false);
    expect(s.actualizadoAt).not.toBeNull();
    expect(s.clases).toEqual([CLASE_REAL]);
  });

  it("GIVEN offline THEN no setea error de carga", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    await useClasesStore.getState().cargarClasesAlumno();
    expect(useClasesStore.getState().errorCargaClases).toBe(false);
    expect(useClasesStore.getState().error).toBeNull();
  });
});

describe("GOZS-917 · vistas: aviso role=alert con Reintentar", () => {
  it("MiProgreso: con progresoError y sin historial muestra aviso y no el falso vacío", () => {
    const onReintentar = vi.fn();
    const { getByTestId, container } = render(
      <MiProgreso estado="listo" vista="SIMPLE" data={null} progresoError={MSG_ERROR_PROGRESO} onReintentarProgreso={onReintentar} />,
    );
    const alerta = getByTestId("progreso-load-error");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain(MSG_ERROR_PROGRESO);
    expect(container.textContent).not.toContain("Todavía no hay entrenamientos");
    fireEvent.click(getByTestId("progreso-reintentar"));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it("MiProgreso: sin progresoError no muestra aviso y conserva el estado vacío", () => {
    const { queryByTestId, container } = render(<MiProgreso estado="listo" vista="SIMPLE" data={null} />);
    expect(queryByTestId("progreso-load-error")).toBeNull();
    expect(container.textContent).toContain("Todavía no hay entrenamientos");
  });

  it("HistorialSesiones: con historialError muestra aviso, oculta el vacío y Reintentar recupera", async () => {
    mocks.client = crearCliente({ registro_sesiones: { data: null, error: ERROR_DB } });
    const ui = render(<HistorialSesiones />);
    await flush();
    const alerta = ui.getByTestId("historial-load-error");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).not.toMatch(SQL_CRUDO);
    expect(ui.queryByTestId("historial-vacio")).toBeNull();

    mocks.client = crearCliente({ registro_sesiones: { data: [SESION_REMOTA], error: null } });
    fireEvent.click(ui.getByTestId("historial-reintentar"));
    await flush();
    expect(ui.queryByTestId("historial-load-error")).toBeNull();
    expect(ui.queryByTestId(`sesion-card-${SESION_REMOTA.id}`)).not.toBeNull();
    ui.unmount();
  });

  it("HistorialSesiones: offline no muestra aviso aunque haya historialError", () => {
    useOfflineQueueStore.setState({ isOnline: false });
    useAthleteStore.setState({ historialError: MSG_ERROR_HISTORIAL });
    const ui = render(<HistorialSesiones />);
    expect(ui.queryByTestId("historial-load-error")).toBeNull();
    ui.unmount();
  });

  it("AthleteClasses: error de carga sin caché muestra Reintentar y no el falso vacío; reintento limpia", async () => {
    mocks.client = crearCliente({ clases: { data: null, error: ERROR_DB } });
    const ui = render(<AthleteClasses />);
    await flush();
    const alerta = ui.getByTestId("alert-message");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain(MSG_ERROR_CLASES);
    expect(ui.container.textContent).not.toContain("Todavía no tenés actividades habilitadas");
    expect(ui.container.textContent).not.toContain("No hay clases este día");

    mocks.client = crearCliente({ clases: { data: [], error: null } });
    fireEvent.click(ui.getByTestId("clases-reintentar"));
    await flush();
    expect(ui.queryByTestId("alert-message")).toBeNull();
    expect(useClasesStore.getState().actualizadoAt).not.toBeNull();
    ui.unmount();
  });

  it("AthleteClasses: offline no muestra Reintentar", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    const ui = render(<AthleteClasses />);
    await flush();
    expect(ui.queryByTestId("clases-reintentar")).toBeNull();
    ui.unmount();
  });
});
