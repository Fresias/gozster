import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { RutinasLibrary } from "@/components/coach/rutinas-library";
import { fetchLiveDatasetFromSupabase, type LiveSupabaseDataset } from "@/services/alumnos-service";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { fireEvent, render } from "@/test-utils/no-demo-literals";

type Res = { data: unknown; error: unknown };

/** Cliente Supabase mínimo: cada tabla resuelve a un resultado fijo; los métodos de filtro encadenan. */
function crearCliente(tablas: Record<string, Res>) {
  return {
    from: vi.fn((tabla: string) => {
      const res = tablas[tabla] ?? { data: [], error: null };
      const builder: any = {
        then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko),
      };
      for (const m of ["select", "or", "eq", "in", "order"]) builder[m] = () => builder;
      return builder;
    }),
  } as any;
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/studio",
  useSearchParams: () => new URLSearchParams(),
}));

// Cliente por defecto del servicio (usado por el store y por RutinasLibrary.recargar): reemplazable por test.
const clienteDefault = vi.hoisted(() => ({ actual: null as any }));
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => clienteDefault.actual.from(tabla),
  },
}));

const alumno = { id: "al-1", nombre_completo: "Alumno Uno", rol: "ALUMNO" };
const plan = { id: "plan-1", alumno_id: "al-1", nombre: "Plan" };
const ejercicio = { id: "ej-1", nombre: "Sentadilla" };
const errorPg = { code: "PGRST301", message: "JWT expired" };

function datasetVacio(extra: Partial<LiveSupabaseDataset> = {}): LiveSupabaseDataset {
  return {
    alumnos: [],
    planes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejercicios: [],
    currentUserId: "coach-1",
    currentUserRol: "ENTRENADOR",
    ...extra,
  };
}

describe("GOZS-896: errores de carga de alumnos y rutinas en Coach Studio", () => {
  beforeEach(() => {
    clienteDefault.actual = crearCliente({});
  });
  afterEach(() => vi.restoreAllMocks());

  describe("fetchLiveDatasetFromSupabase", () => {
    it("GIVEN error en perfiles THEN datasetError poblado, alumnos=[] (sin datos demo) y planesError poblado", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const ds = await fetchLiveDatasetFromSupabase(
        crearCliente({
          perfiles: { data: null, error: errorPg },
          planes_entrenamiento: { data: [plan], error: null },
        }),
      );
      expect(ds.datasetError).toBeTruthy();
      expect(ds.planesError).toBeTruthy();
      expect(ds.alumnos).toEqual([]);
      expect(ds.planes).toEqual([]);
      expect(ds.ejercicios).toEqual([]);
    });

    it("GIVEN error en planes_entrenamiento THEN planesError poblado, planes=[], warn y resto del dataset intacto", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ds = await fetchLiveDatasetFromSupabase(
        crearCliente({
          perfiles: { data: [alumno], error: null },
          planes_entrenamiento: { data: [plan], error: errorPg },
          ejercicios: { data: [ejercicio], error: null },
        }),
      );
      expect(ds.planesError).toBeTruthy();
      expect(ds.planes).toEqual([]);
      expect(ds.datasetError).toBeNull();
      expect(ds.alumnos).toEqual([alumno]);
      expect(ds.ejercicios).toEqual([ejercicio]);
      expect(ds.ejerciciosError).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("rutinas"), "PGRST301", "JWT expired");
    });

    it("GIVEN carga exitosa THEN datasetError y planesError son null", async () => {
      const ds = await fetchLiveDatasetFromSupabase(
        crearCliente({
          perfiles: { data: [alumno], error: null },
          planes_entrenamiento: { data: [plan], error: null },
        }),
      );
      expect(ds.datasetError).toBeNull();
      expect(ds.planesError).toBeNull();
      expect(ds.alumnos).toEqual([alumno]);
      expect(ds.planes).toEqual([plan]);
    });

    it("GIVEN base vacía real sin errores THEN datasetError y planesError son null", async () => {
      const ds = await fetchLiveDatasetFromSupabase(crearCliente({}));
      expect(ds.alumnos).toEqual([]);
      expect(ds.planes).toEqual([]);
      expect(ds.datasetError).toBeNull();
      expect(ds.planesError).toBeNull();
    });

    it("GIVEN excepción de conexión THEN datasetError y planesError no son nulos y alumnos=[]", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const ds = await fetchLiveDatasetFromSupabase({
        from: () => {
          throw new Error("Failed to fetch");
        },
      } as any);
      expect(ds.datasetError).toBeTruthy();
      expect(ds.planesError).toBeTruthy();
      expect(ds.alumnos).toEqual([]);
    });
  });

  describe("RutinasLibrary", () => {
    it("GIVEN planesError y planes=[] THEN muestra alerta (no empty state) y Reintentar recarga el dataset", async () => {
      const { getByTestId, queryByTestId } = render(
        <RutinasLibrary
          initialDataset={datasetVacio({ planesError: "No se pudieron cargar las rutinas." })}
          defaultSubTab="plantillas"
        />,
      );
      const alerta = getByTestId("rutinas-load-error");
      expect(alerta.getAttribute("role")).toBe("alert");
      expect(alerta.textContent).toContain("No se pudieron cargar las rutinas");
      expect(queryByTestId("empty-state-plantillas")).toBeNull();

      expect(clienteDefault.actual.from).not.toHaveBeenCalled();
      fireEvent.click(getByTestId("btn-reintentar-carga-rutinas"));
      await vi.waitFor(() => {
        expect(clienteDefault.actual.from).toHaveBeenCalledWith("planes_entrenamiento");
      });
    });

    it("GIVEN planesError null y planes=[] THEN conserva el empty state habitual", () => {
      const { getByTestId, queryByTestId } = render(
        <RutinasLibrary initialDataset={datasetVacio({ planesError: null })} defaultSubTab="plantillas" />,
      );
      expect(getByTestId("empty-state-plantillas")).toBeTruthy();
      expect(queryByTestId("rutinas-load-error")).toBeNull();
    });
  });

  describe("CoachStudioView", () => {
    it("GIVEN datasetError y 0 alumnos THEN muestra banner role=alert con Reintentar", () => {
      const { getByTestId } = render(
        <CoachStudioView initialDataset={datasetVacio({ datasetError: "No se pudieron cargar los alumnos." })} />,
      );
      const banner = getByTestId("studio-dataset-load-error");
      expect(banner.getAttribute("role")).toBe("alert");
      expect(banner.textContent).toContain("No se pudieron cargar los alumnos.");
      expect(getByTestId("btn-reintentar-carga-studio")).toBeTruthy();
    });

    it("GIVEN base vacía real (datasetError null) THEN no muestra el banner de error", () => {
      const { queryByTestId } = render(<CoachStudioView initialDataset={datasetVacio({ datasetError: null })} />);
      expect(queryByTestId("studio-dataset-load-error")).toBeNull();
    });
  });

  describe("useCoachStudio.loadLiveSupabaseData", () => {
    it("propaga datasetError/planesError ante fallo y los limpia al recuperarse", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(useCoachStudioStore.getState().datasetError).toBeNull();
      expect(useCoachStudioStore.getState().planesError).toBeNull();

      clienteDefault.actual = crearCliente({ perfiles: { data: null, error: errorPg } });
      await useCoachStudioStore.getState().loadLiveSupabaseData();
      let estado = useCoachStudioStore.getState();
      expect(estado.datasetError).toBeTruthy();
      expect(estado.planesError).toBeTruthy();
      expect(estado.alumnos).toEqual([]);
      expect(estado.isLoading).toBe(false);

      clienteDefault.actual = crearCliente({
        perfiles: { data: [alumno], error: null },
        planes_entrenamiento: { data: [plan], error: null },
      });
      await useCoachStudioStore.getState().loadLiveSupabaseData();
      estado = useCoachStudioStore.getState();
      expect(estado.datasetError).toBeNull();
      expect(estado.planesError).toBeNull();
      expect(estado.alumnos).toEqual([alumno]);
      expect(estado.planes).toEqual([plan]);
    });

    it("GIVEN fallo solo en planes THEN planesError poblado y datasetError null", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      clienteDefault.actual = crearCliente({
        perfiles: { data: [alumno], error: null },
        planes_entrenamiento: { data: null, error: errorPg },
      });
      await useCoachStudioStore.getState().loadLiveSupabaseData();
      const estado = useCoachStudioStore.getState();
      expect(estado.planesError).toBeTruthy();
      expect(estado.datasetError).toBeNull();
      expect(estado.alumnos).toEqual([alumno]);
    });
  });
});
