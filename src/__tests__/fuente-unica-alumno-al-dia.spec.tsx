import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { claveDia } from "@/lib/clases";
import { mapearRpcAKpis } from "@/lib/kpis-negocio";
import type { EstadoAlumno, LiveSupabaseDataset } from "@/services/alumnos-service";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { mapearCobrosDataset, useCobrosStore } from "@/store/use-cobros-store";
import type { Cobro, Contratacion, Database, Perfil } from "@/types/database.types";

// GOZS-694: "alumno al día" sale de una sola fuente (v_estado_alumno, derivada de
// contrataciones y cobros). KPI, columna Cuota, chips de filtro y Cobros coinciden.

const mocks = vi.hoisted(() => ({
  fetchEstadosAlumno: vi.fn(),
  fetchLiveDatasetFromSupabase: vi.fn(),
  renovarContratacionRpc: vi.fn(),
  asignarSuscripcionYCobro: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/services/alumnos-service", async (orig) => ({
  ...(await orig<object>()),
  fetchEstadosAlumno: mocks.fetchEstadosAlumno,
  fetchLiveDatasetFromSupabase: mocks.fetchLiveDatasetFromSupabase,
}));
vi.mock("@/services/contrataciones-service", async (orig) => ({
  ...(await orig<object>()),
  renovarContratacionRpc: mocks.renovarContratacionRpc,
}));
vi.mock("@/services/cobros-service", async (orig) => ({
  ...(await orig<object>()),
  asignarSuscripcionYCobro: mocks.asignarSuscripcionYCobro,
}));
vi.mock("@/lib/supabase/client", async (orig) => {
  const real = await orig<{ supabase: object }>();
  return { ...real, supabase: { ...real.supabase, auth: { getUser: mocks.getUser } } };
});

const realAlumnosService = () =>
  vi.importActual<typeof import("@/services/alumnos-service")>("@/services/alumnos-service");

const ANA = "11111111-1111-4111-8111-111111111111";
const BETO = "22222222-2222-4222-8222-222222222222";
const CARLA = "33333333-3333-4333-8333-333333333333";

function alumno(id: string, nombre: string): Perfil {
  // estado_membresia/fecha_vencimiento_cuota dicen "al día": la vista debe mandar.
  return {
    id,
    nombre_completo: nombre,
    email: `${id.slice(0, 4)}@ejemplo.test`,
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    fecha_vencimiento_cuota: "2999-01-01",
    profesor_asignado_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as Perfil;
}

function estado(alumno_id: string, e: EstadoAlumno["estado"], al_dia: boolean): EstadoAlumno {
  return {
    alumno_id,
    estado: e,
    al_dia,
    fecha_vencimiento: "2026-12-31",
    cobros_vencidos: e === "VENCIDA" ? 1 : 0,
  } as EstadoAlumno;
}

function datasetStudio(estadosAlumno?: EstadoAlumno[]): LiveSupabaseDataset {
  return {
    alumnos: [alumno(ANA, "Ana Prueba"), alumno(BETO, "Beto Prueba"), alumno(CARLA, "Carla Prueba")],
    planes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejercicios: [],
    estadosAlumno,
  };
}

function textoTestId(html: string, testId: string): string {
  const m = html.match(new RegExp(`data-testid="${testId}"[^>]*>(.*?)</(div|button)>`));
  return (m?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
}

function badgesCuota(html: string): string[] {
  // Primer badge de estado dentro de cada celda de la columna Cuota.
  return html
    .split('data-testid="columna-cuota-actividad"><div')
    .slice(1)
    .map((celda) => celda.match(/role="status"><span>([^<]+)<\/span>/)?.[1] ?? "");
}

/** Cliente falso: cada `from(tabla)` resuelve con la respuesta configurada. */
function clienteFalso(respuestas: Record<string, { data: unknown; error: unknown }>) {
  const tablas: string[] = [];
  const client = {
    from(tabla: string) {
      tablas.push(tabla);
      const res = respuestas[tabla] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko),
      };
      for (const m of ["select", "in", "eq", "or", "order"]) builder[m] = () => builder;
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, tablas };
}

const kpisRpc = mapearRpcAKpis({ activos_fin: 0, alumnos_al_dia: 0, ingresos: 0 }, "oct.", "ADMIN");

describe("GOZS-694: fuente única para alumno al día", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  describe("BusinessKpiStrip", () => {
    it("GIVEN alumnosAlDia de la tabla WHEN se renderiza el KPI THEN muestra ese conteo y no el del RPC", () => {
      const html = renderToStaticMarkup(
        <BusinessKpiStrip kpis={kpisRpc} totalAlumnos={2} alumnosAlDia={2} puedeVer rol="ADMIN" />,
      );
      expect(textoTestId(html, "kpi-alumnos-al-dia")).toBe("2 de 2");
    });

    it("GIVEN sin alumnosAlDia (modo demo) WHEN se renderiza el KPI THEN conserva el valor previo", () => {
      const html = renderToStaticMarkup(<BusinessKpiStrip kpis={kpisRpc} totalAlumnos={2} puedeVer rol="ADMIN" />);
      expect(textoTestId(html, "kpi-alumnos-al-dia")).toBe("0 de 2");
    });
  });

  describe("CoachStudioView con initialDataset.estadosAlumno", () => {
    it("GIVEN la vista contradice a perfiles WHEN se abre Inicio THEN KPI, columna Cuota y chips coinciden con la vista", () => {
      const html = renderToStaticMarkup(
        <CoachStudioView
          initialDataset={datasetStudio([
            estado(ANA, "VENCIDA", false),
            estado(BETO, "POR_VENCER", true),
            estado(CARLA, "PENDIENTE", false),
          ])}
          coachName="Coach"
        />,
      );

      expect(textoTestId(html, "kpi-alumnos-al-dia")).toBe("1 de 3");
      expect(textoTestId(html, "chip-filtro-al-dia")).toBe("Al día 1");
      expect(textoTestId(html, "chip-filtro-pago-pendiente")).toBe("Pago pendiente 2");
      expect(badgesCuota(html).sort()).toEqual(["Al día", "Pendiente", "Vencida"]);
    });

    it("GIVEN un alumno sin fila en la vista WHEN se abre Inicio THEN cuenta como no al día y se ve 'Sin plan'", () => {
      const html = renderToStaticMarkup(
        <CoachStudioView initialDataset={datasetStudio([estado(ANA, "AL_DIA", true)])} coachName="Coach" />,
      );

      expect(textoTestId(html, "kpi-alumnos-al-dia")).toBe("1 de 3");
      expect(textoTestId(html, "chip-filtro-al-dia")).toBe("Al día 1");
      expect(textoTestId(html, "chip-filtro-pago-pendiente")).toBe("Pago pendiente 2");
      expect(badgesCuota(html).sort()).toEqual(["Al día", "Sin plan", "Sin plan"]);
    });

    it("GIVEN estadosAlumno undefined WHEN se abre Inicio THEN conserva el criterio previo (perfiles) en KPI, chips y Cuota", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={datasetStudio(undefined)} coachName="Coach" />);

      expect(textoTestId(html, "kpi-alumnos-al-dia")).toBe("3 de 3");
      expect(textoTestId(html, "chip-filtro-al-dia")).toBe("Al día 3");
      expect(textoTestId(html, "chip-filtro-pago-pendiente")).toBe("Pago pendiente 0");
      expect(badgesCuota(html)).toEqual(["Al día", "Al día", "Al día"]);
    });
  });

  describe("fetchLiveDatasetFromSupabase lee v_estado_alumno", () => {
    const perfiles = { data: [alumno(ANA, "Ana Prueba")], error: null };

    it("GIVEN la vista responde WHEN se arma el dataset THEN trae estadosAlumno", async () => {
      const { fetchLiveDatasetFromSupabase } = await realAlumnosService();
      const filas = [estado(ANA, "VENCIDA", false)];
      const { client, tablas } = clienteFalso({ perfiles, v_estado_alumno: { data: filas, error: null } });

      const dataset = await fetchLiveDatasetFromSupabase(client);

      expect(tablas).toContain("v_estado_alumno");
      expect(dataset.estadosAlumno).toEqual(filas);
    });

    it("GIVEN la vista devuelve error WHEN se arma el dataset THEN estadosAlumno queda undefined", async () => {
      const { fetchLiveDatasetFromSupabase } = await realAlumnosService();
      const { client } = clienteFalso({ perfiles, v_estado_alumno: { data: null, error: { message: "denegado" } } });

      expect((await fetchLiveDatasetFromSupabase(client)).estadosAlumno).toBeUndefined();
    });

    it("GIVEN la vista devuelve { data: null, error: null } WHEN se arma el dataset THEN estadosAlumno queda undefined", async () => {
      const { fetchLiveDatasetFromSupabase } = await realAlumnosService();
      const { client } = clienteFalso({ perfiles, v_estado_alumno: { data: null, error: null } });

      expect((await fetchLiveDatasetFromSupabase(client)).estadosAlumno).toBeUndefined();
    });

    it("GIVEN fetchEstadosAlumno WHEN la vista responde, falla o trae null THEN devuelve filas o undefined", async () => {
      const { fetchEstadosAlumno } = await realAlumnosService();
      const filas = [estado(ANA, "AL_DIA", true)];

      expect(await fetchEstadosAlumno(clienteFalso({ v_estado_alumno: { data: filas, error: null } }).client)).toEqual(filas);
      expect(
        await fetchEstadosAlumno(clienteFalso({ v_estado_alumno: { data: null, error: { message: "x" } } }).client),
      ).toBeUndefined();
      expect(await fetchEstadosAlumno(clienteFalso({ v_estado_alumno: { data: null, error: null } }).client)).toBeUndefined();
    });
  });

  describe("Cobros con el mismo criterio que la vista", () => {
    const base = { contratacion_id: "c1", alumno_id: "a1", monto: 1000, concepto: null, notas: null };

    function estadosCobros(cobros: Cobro[]) {
      const { cobros: items } = mapearCobrosDataset({
        cobros,
        contrataciones: [],
        planesMembresia: [],
        pagos: [],
      } as unknown as Parameters<typeof mapearCobrosDataset>[0]);
      return Object.fromEntries(items.map((i) => [i.id, i.estado]));
    }

    it("GIVEN cobros impagos con vencimiento pasado WHEN se mapean THEN quedan VENCIDO", () => {
      expect(
        estadosCobros([
          { ...base, id: "pend-pasado", estado: "PENDIENTE", fecha_vencimiento: "2000-01-10" },
          { ...base, id: "pend-futuro", estado: "PENDIENTE", fecha_vencimiento: "2999-01-10" },
          { ...base, id: "pagado-pasado", estado: "PAGADO", fecha_vencimiento: "2000-01-10" },
        ] as unknown as Cobro[]),
      ).toEqual({ "pend-pasado": "VENCIDO", "pend-futuro": "PENDIENTE", "pagado-pasado": "PAGADO" });
    });

    it("GIVEN un cobro impago que vence hoy (hora del gimnasio) WHEN se mapea THEN sigue PENDIENTE", () => {
      const hoy = claveDia(new Date());
      expect(
        estadosCobros([{ ...base, id: "vence-hoy", estado: "PENDIENTE", fecha_vencimiento: hoy }] as unknown as Cobro[]),
      ).toEqual({ "vence-hoy": "PENDIENTE" });
    });
  });

  describe("use-coach-studio refresca estadosAlumno tras mutaciones", () => {
    const previos = [estado(ANA, "VENCIDA", false)];
    const nuevos = [estado(ANA, "AL_DIA", true)];
    const contratacion = {
      id: "c-1",
      alumno_id: ANA,
      estado: "VENCIDA",
      fecha_inicio: "2026-10-10",
      fecha_fin: "2026-11-10",
      dia_vencimiento: 10,
      updated_at: "2026-11-01T00:00:00Z",
    } as unknown as Contratacion;

    beforeEach(() => {
      useCoachStudioStore.setState({
        alumnos: [alumno(ANA, "Ana Prueba")],
        contrataciones: [contratacion],
        estadosAlumno: previos,
        isLiveDatabase: true,
        toast: null,
      });
    });

    it("GIVEN registrarRenovacionManual WHEN el dataset trae la vista THEN actualiza estadosAlumno", async () => {
      mocks.renovarContratacionRpc.mockResolvedValue({ fechaFin: "2026-12-10", estado: "VIGENTE" });
      mocks.fetchLiveDatasetFromSupabase.mockResolvedValue({ ...datasetStudio(nuevos), cobros: [] });

      await useCoachStudioStore.getState().registrarRenovacionManual({ contratacion, monto: 5000, medioPago: "EFECTIVO" });

      expect(useCoachStudioStore.getState().estadosAlumno).toEqual(nuevos);
    });

    it("GIVEN registrarRenovacionManual WHEN la vista no se pudo leer THEN conserva el estado previo", async () => {
      mocks.renovarContratacionRpc.mockResolvedValue({ fechaFin: "2026-12-10", estado: "VIGENTE" });
      mocks.fetchLiveDatasetFromSupabase.mockResolvedValue({ ...datasetStudio(undefined), cobros: [] });

      await useCoachStudioStore.getState().registrarRenovacionManual({ contratacion, monto: 5000, medioPago: "EFECTIVO" });

      expect(useCoachStudioStore.getState().estadosAlumno).toEqual(previos);
    });

    it("GIVEN asignar suscripción en vivo WHEN la RPC crea la contratación THEN relee v_estado_alumno", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "coach-1" } } });
      mocks.asignarSuscripcionYCobro.mockResolvedValue({
        contratacion_id: "44444444-4444-4444-8444-444444444444",
        cobro_id: "55555555-5555-4555-8555-555555555555",
        estado_cobro: "PAGADO",
        concepto: "Funcional",
        monto: 25000,
      });
      mocks.fetchEstadosAlumno.mockResolvedValue(nuevos);

      await useCoachStudioStore.getState().vincularPlanMembresiaAlumno({
        alumnoId: ANA,
        actividad: "FUNCIONAL",
        monto: 25000,
        pagado: true,
      });

      expect(mocks.fetchEstadosAlumno).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(useCoachStudioStore.getState().estadosAlumno).toEqual(nuevos));
    });

    it("GIVEN asignar suscripción WHEN la relectura de la vista falla THEN conserva el estado previo", async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: "coach-1" } } });
      mocks.asignarSuscripcionYCobro.mockResolvedValue({
        contratacion_id: "44444444-4444-4444-8444-444444444444",
        cobro_id: null,
        estado_cobro: "PENDIENTE",
        concepto: "Funcional",
        monto: 25000,
      });
      mocks.fetchEstadosAlumno.mockResolvedValue(undefined);

      await useCoachStudioStore.getState().vincularPlanMembresiaAlumno({
        alumnoId: ANA,
        actividad: "FUNCIONAL",
        monto: 25000,
        pagado: false,
      });

      expect(mocks.fetchEstadosAlumno).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(useCoachStudioStore.getState().estadosAlumno).toEqual(previos);
    });
  });
});
