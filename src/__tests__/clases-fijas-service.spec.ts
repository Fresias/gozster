import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asignarClaseFijaRpc, quitarClaseFijaRpc } from "@/services/clases-fijas-service";
import { obtenerMetricasRetencionRpc } from "@/services/analiticas-service";

const cliente = (resp: unknown) =>
  ({ rpc: vi.fn().mockResolvedValue(resp) }) as unknown as SupabaseClient<never>;

describe("clases fijas y analíticas (servicios RPC)", () => {
  it("asigna una clase fija y devuelve el id", async () => {
    const c = cliente({ data: "fija-1", error: null });
    await expect(asignarClaseFijaRpc("h", "a", c as never)).resolves.toBe("fija-1");
    expect((c as never as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("asignar_clase_fija", {
      p_horario_id: "h",
      p_alumno_id: "a",
    });
  });

  it("propaga el mensaje humano de errores de negocio (GZ002)", async () => {
    const c = cliente({ data: null, error: { code: "GZ002", message: "El plan permite como máximo 2 clases fijas" } });
    await expect(asignarClaseFijaRpc("h", "a", c as never)).rejects.toThrow("máximo 2");
  });

  it("oculta errores técnicos al quitar", async () => {
    const c = cliente({ error: { code: "XX000", message: "boom interno" } });
    await expect(quitarClaseFijaRpc("f", c as never)).rejects.toThrow("No pudimos quitar");
  });

  it("devuelve la primera fila de métricas de retención", async () => {
    const fila = { cantActivas: 5, cantClientesPerdidosMes: 1, cantSinPlanEntrenamiento: 2 };
    const c = cliente({ data: [fila], error: null });
    await expect(obtenerMetricasRetencionRpc(undefined, c as never)).resolves.toEqual(fila);
  });
});
