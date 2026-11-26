import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EjerciciosLibraryTab } from "@/components/coach/ejercicios-library-tab";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { fireEvent, render } from "@/test-utils/no-demo-literals";

vi.mock("@/lib/supabase/browser", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  createClient: () => ({ from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
}));

type Res = { data: unknown; error: unknown };

/** Cliente Supabase mínimo: cada tabla resuelve a un resultado fijo; los métodos de filtro encadenan. */
function crearCliente(tablas: Record<string, Res>) {
  return {
    from(tabla: string) {
      const res = tablas[tabla] ?? { data: [], error: null };
      const builder: any = {
        then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, ko),
      };
      for (const m of ["select", "or", "eq", "in", "order"]) builder[m] = () => builder;
      return builder;
    },
  } as any;
}

const alumno = { id: "al-1", nombre_completo: "Alumno Uno", rol: "ALUMNO" };
const plan = { id: "plan-1", alumno_id: "al-1", nombre: "Plan" };

describe("GOZS-893: error de carga del catálogo de ejercicios", () => {
  afterEach(() => vi.restoreAllMocks());

  it("GIVEN error de Supabase en ejercicios WHEN carga el dataset THEN ejercicios=[], ejerciciosError poblado, warn y resto intacto", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ds = await fetchLiveDatasetFromSupabase(
      crearCliente({
        perfiles: { data: [alumno], error: null },
        planes_entrenamiento: { data: [plan], error: null },
        ejercicios: { data: null, error: { code: "42703", message: "column ejercicios.usa_barra does not exist" } },
      }),
    );
    expect(ds.ejercicios).toEqual([]);
    expect(ds.ejerciciosError).toBeTruthy();
    expect(ds.alumnos).toEqual([alumno]);
    expect(ds.planes).toEqual([plan]);
    expect(warn).toHaveBeenCalled();
  });

  it("GIVEN carga exitosa de ejercicios THEN ejerciciosError es null", async () => {
    const ej = { id: "ej-1", nombre: "Sentadilla" };
    const ds = await fetchLiveDatasetFromSupabase(
      crearCliente({ perfiles: { data: [alumno], error: null }, ejercicios: { data: [ej], error: null } }),
    );
    expect(ds.ejercicios).toEqual([ej]);
    expect(ds.ejerciciosError).toBeNull();
  });

  it("GIVEN excepción de conexión THEN ejerciciosError no es nulo", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ds = await fetchLiveDatasetFromSupabase({
      from: () => {
        throw new Error("Failed to fetch");
      },
    } as any);
    expect(ds.ejercicios).toEqual([]);
    expect(ds.ejerciciosError).toBeTruthy();
  });

  it("GIVEN ejerciciosError y ejercicios=[] THEN muestra alerta (no empty state) y Reintentar invoca onRecargar", () => {
    const onRecargar = vi.fn().mockResolvedValue(undefined);
    const { getByTestId, queryByTestId, container } = render(
      <EjerciciosLibraryTab
        ejercicios={[]}
        ejerciciosEnRutina={[]}
        ejerciciosError="No se pudo cargar la biblioteca de ejercicios."
        onRecargar={onRecargar}
      />,
    );
    const alerta = getByTestId("ejercicios-load-error");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(queryByTestId("empty-state-ejercicios")).toBeNull();
    expect(container.textContent).not.toContain("Todavía no hay ejercicios en el catálogo maestro");
    fireEvent.click(getByTestId("btn-reintentar-carga-ejercicios"));
    expect(onRecargar).toHaveBeenCalledTimes(1);
  });

  it("GIVEN sin ejerciciosError y ejercicios=[] THEN conserva el empty state habitual", () => {
    const { getByTestId, queryByTestId, container } = render(
      <EjerciciosLibraryTab ejercicios={[]} ejerciciosEnRutina={[]} ejerciciosError={null} />,
    );
    expect(getByTestId("empty-state-ejercicios")).toBeTruthy();
    expect(queryByTestId("ejercicios-load-error")).toBeNull();
    expect(container.textContent).toContain("Todavía no hay ejercicios en el catálogo maestro");
  });
});
