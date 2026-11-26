import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { useRankingStore } from "@/store/use-ranking-store";
import { agruparRankingPorEjercicio, sesionesDesdeFechas, type RankingFuncionalFila } from "@/lib/mi-progreso";

const A = "11111111-1111-4111-8111-111111111111";
const E = "22222222-2222-4222-8222-222222222222";
const datos = { clase_id: "no-uuid", alumno_id: A, ejercicio_id: E, peso_kg: 80, reps: 5, fecha: "2026-11-20" };

function setOnline(v: boolean) {
  Object.defineProperty(globalThis, "navigator", { value: { onLine: v }, configurable: true });
}

beforeEach(() => {
  rpc.mockReset();
  setOnline(true);
  useRankingStore.setState({ prs: [], pendientesMarcas: [], rankingAlumno: [], error: null, aviso: null });
});

describe("persistencia de marcas (B1)", () => {
  it("online: llama a registrar_marca_funcional y no deja cola", async () => {
    rpc.mockResolvedValue({ data: "s1", error: null });
    await useRankingStore.getState().registrarPr(datos);
    expect(rpc).toHaveBeenCalledWith("registrar_marca_funcional", expect.objectContaining({ p_alumno_id: A, p_peso_kg: 80, p_reps: 5 }));
    expect(useRankingStore.getState().pendientesMarcas).toHaveLength(0);
  });

  it("offline: no se pierde, queda en cola y se sincroniza al reconectar", async () => {
    setOnline(false);
    const r = await useRankingStore.getState().registrarPr(datos);
    expect(r.ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(useRankingStore.getState().pendientesMarcas).toHaveLength(1);
    expect(useRankingStore.getState().prs).toHaveLength(1);

    setOnline(true);
    rpc.mockResolvedValue({ data: "s1", error: null });
    await useRankingStore.getState().sincronizarMarcasPendientes();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(useRankingStore.getState().pendientesMarcas).toHaveLength(0);
  });

  it("error del servidor: informa el error y conserva la marca en cola", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await useRankingStore.getState().registrarPr(datos);
    expect(useRankingStore.getState().error).toContain("boom");
    expect(useRankingStore.getState().pendientesMarcas).toHaveLength(1);
  });

  it("ids no UUID (datos locales) no se envían", async () => {
    await useRankingStore.getState().registrarPr({ ...datos, alumno_id: "demo-1" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cargarRankingAlumno normaliza numéricos de la RPC", async () => {
    rpc.mockResolvedValue({
      data: [{ ejercicio_id: E, es_usuario_actual: true, nombre_corto: "Lucas G.", sexo: "M", peso_kg: "80.00", reps: 5, fecha: "2026-11-20", ratio: "1.20", posicion: "1" }],
      error: null,
    });
    await useRankingStore.getState().cargarRankingAlumno();
    expect(useRankingStore.getState().rankingAlumno[0]).toMatchObject({ peso_kg: 80, ratio: 1.2, posicion: 1 });
  });
});

describe("helpers puros", () => {
  const fila = (o: Partial<RankingFuncionalFila>): RankingFuncionalFila => ({
    ejercicio_id: E, es_usuario_actual: false, nombre_corto: "X Y.", sexo: "M", peso_kg: 50, reps: 5, fecha: "2026-11-20", ratio: 1, posicion: 1, ...o,
  });

  it("sesionesDesdeFechas deduplica por día y descarta vacíos", () => {
    const r = sesionesDesdeFechas(["2026-11-20T15:00:00Z", "2026-11-20T16:00:00Z", null, undefined, "x"]);
    expect(r).toHaveLength(1);
  });

  it("agruparRankingPorEjercicio: solo mi categoría, con mi fila aunque quede fuera del top", () => {
    const filas = [
      ...[1, 2, 3, 4, 5, 6].map((n) => fila({ nombre_corto: `P${n} Z.`, posicion: n })),
      fila({ nombre_corto: "Yo G.", es_usuario_actual: true, posicion: 7 }),
      fila({ nombre_corto: "Otra Q.", sexo: "F", posicion: 1 }),
    ];
    const [g] = agruparRankingPorEjercicio(filas);
    expect(g!.filas).toHaveLength(6);
    expect(g!.filas.at(-1)!.nombre_corto).toBe("Yo G.");
    expect(g!.filas.some((f) => f.nombre_corto === "Otra Q.")).toBe(false);
  });

  it("sin marca propia no hay tarjeta", () => {
    expect(agruparRankingPorEjercicio([fila({})])).toHaveLength(0);
  });
});
