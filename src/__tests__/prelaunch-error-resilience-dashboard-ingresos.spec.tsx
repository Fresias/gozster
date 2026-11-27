import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/studio/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const rpcRetencion = vi.fn();
vi.mock("@/services/analiticas-service", () => ({
  obtenerMetricasRetencionRpc: (...args: unknown[]) => rpcRetencion(...args),
}));

const kpisMock = vi.fn();
vi.mock("@/lib/kpis-negocio", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/kpis-negocio")>();
  return { ...real, obtenerKpisNegocio: (...args: unknown[]) => kpisMock(...args) };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

vi.mock("@/services/alumnos-service", () => ({
  fetchLiveDatasetFromSupabase: async () => ({
    alumnos: [],
    planes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejercicios: [],
    contrataciones: [],
    alumnoActividades: [],
    planesMembresia: [],
  }),
  fetchAlumnosEstancados: async () => [],
}));

import StudioIngresosPage from "@/app/(coach)/studio/ingresos/page";
import CoachDashboardPage from "@/app/(coach)/studio/dashboard/page";
import { StudioSankeyView } from "@/components/coach/studio-sankey-view";
import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { crearKpisNegocioVacios } from "@/lib/kpis-negocio";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { fireEvent, render } from "@/test-utils/no-demo-literals";

// Las páginas server usan el runtime JSX automático; vitest compila con el clásico.
(globalThis as any).React = React;

const flush = () => new Promise((r) => setTimeout(r, 0));
const RAW_SQL = 'relation "public.cobros" does not exist';
const montoDemo = `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(DEMO_KPIS_NEGOCIO.facturado ?? 0)}`;
const filaRetencion = { cant_activas: 0, cant_sin_rutina: 0, churn_rate: 0 } as any;

beforeEach(() => {
  vi.clearAllMocks();
  useCoachStudioStore.setState({ isLiveDatabase: true, filtroActividad: "TODAS" });
});

describe("GOZS-912: /studio/ingresos propaga el error de KPIs", () => {
  it("GIVEN falla obtenerKpisNegocio en SSR THEN pasa un mensaje legible (sin SQL crudo) y KPIs en cero", async () => {
    kpisMock.mockRejectedValueOnce(new Error(RAW_SQL));
    const el = (await StudioIngresosPage()) as React.ReactElement<any>;
    expect(el.props.isLiveMode).toBe(true);
    expect(el.props.errorCarga).toBeTruthy();
    expect(el.props.errorCarga).not.toContain("relation");
    expect(el.props.kpis.facturado ?? 0).toBe(0);
  });

  it("GIVEN base vacía sin error THEN errorCarga es null", async () => {
    kpisMock.mockResolvedValueOnce(crearKpisNegocioVacios("ENTRENADOR"));
    const el = (await StudioIngresosPage()) as React.ReactElement<any>;
    expect(el.props.errorCarga).toBeNull();
  });

  it("GIVEN errorCarga en modo live THEN muestra role=alert, sin montos demo, y Reintentar refresca", () => {
    const { getByTestId, getByText, container } = render(
      <StudioSankeyView kpis={crearKpisNegocioVacios()} isLiveMode errorCarga="No pudimos cargar los ingresos y la cobranza." />,
    );
    expect(getByTestId("sankey-error-carga").getAttribute("role")).toBe("alert");
    expect(container.textContent).not.toContain(montoDemo);
    fireEvent.click(getByText("Reintentar"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("GIVEN onReintentar opcional THEN lo usa en lugar de router.refresh", () => {
    const onReintentar = vi.fn();
    const { getByText } = render(
      <StudioSankeyView isLiveMode errorCarga="No pudimos cargar los ingresos y la cobranza." onReintentar={onReintentar} />,
    );
    fireEvent.click(getByText("Reintentar"));
    expect(onReintentar).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("GIVEN sin error (base vacía) THEN no hay banner y se ven ceros reales", () => {
    const { queryByTestId, container } = render(<StudioSankeyView kpis={crearKpisNegocioVacios()} isLiveMode />);
    expect(queryByTestId("sankey-error-carga")).toBeNull();
    expect(container.textContent).not.toContain(montoDemo);
    expect(container.textContent).toContain("$0");
  });
});

describe("GOZS-912: /studio/dashboard y /studio/metricas propagan errores de KPIs y retención", () => {
  it("GIVEN falla obtenerKpisNegocio en SSR THEN pasa errorKpis legible sin SQL crudo", async () => {
    kpisMock.mockRejectedValueOnce(new Error(RAW_SQL));
    const el = (await CoachDashboardPage()) as React.ReactElement<any>;
    expect(el.props.errorKpis).toBeTruthy();
    expect(el.props.errorKpis).not.toContain("relation");
  });

  it("GIVEN base vacía sin error THEN errorKpis es null", async () => {
    kpisMock.mockResolvedValueOnce(crearKpisNegocioVacios("ENTRENADOR"));
    const el = (await CoachDashboardPage()) as React.ReactElement<any>;
    expect(el.props.errorKpis).toBeNull();
  });

  it("GIVEN /studio/metricas THEN reexporta la página del dashboard", async () => {
    const metricas = await import("@/app/(coach)/studio/metricas/page");
    expect(metricas.default).toBe(CoachDashboardPage);
  });

  it("GIVEN errorKpis THEN muestra role=alert y Reintentar reintenta la RPC y refresca", async () => {
    rpcRetencion.mockResolvedValue(filaRetencion);
    const { getByTestId, getByText } = render(
      <CoachDashboardView kpis={crearKpisNegocioVacios()} errorKpis="No pudimos cargar los KPIs del negocio." />,
    );
    await flush();
    expect(getByTestId("dashboard-error-carga").getAttribute("role")).toBe("alert");
    const llamadas = rpcRetencion.mock.calls.length;
    fireEvent.click(getByText("Reintentar"));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(rpcRetencion.mock.calls.length).toBe(llamadas + 1);
  });

  it("GIVEN falla obtenerMetricasRetencionRpc en cliente THEN aviso; al reintentar con éxito se limpia", async () => {
    rpcRetencion.mockRejectedValueOnce(new Error(RAW_SQL)).mockResolvedValue(filaRetencion);
    const { getByText, queryByTestId, container } = render(
      <CoachDashboardView kpis={crearKpisNegocioVacios()} />,
    );
    await flush();
    const alerta = queryByTestId("dashboard-error-carga");
    expect(alerta?.getAttribute("role")).toBe("alert");
    expect(container.textContent).not.toContain("relation");
    fireEvent.click(getByText("Reintentar"));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(queryByTestId("dashboard-error-carga")).toBeNull();
  });

  it("GIVEN base vacía sin error THEN no aparece banner", async () => {
    rpcRetencion.mockResolvedValue(filaRetencion);
    const { queryByTestId } = render(<CoachDashboardView kpis={crearKpisNegocioVacios()} />);
    await flush();
    expect(queryByTestId("dashboard-error-carga")).toBeNull();
  });
});
