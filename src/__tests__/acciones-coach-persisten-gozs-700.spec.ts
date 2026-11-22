import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contratacion } from "@/types/database.types";

const renovarMock = vi.hoisted(() => vi.fn());
const extenderMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/contrataciones-service", () => ({
  renovarContratacionRpc: renovarMock,
  extenderContratacionExcepcionalRpc: extenderMock,
}));
vi.mock("@/services/alumnos-service", async (orig) => ({
  ...(await orig<object>()),
  fetchLiveDatasetFromSupabase: vi.fn().mockResolvedValue(null),
}));

import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const base = {
  id: "c-1",
  alumno_id: "a-1",
  estado: "VIGENTE",
  fecha_inicio: "2026-10-10",
  fecha_fin: "2026-11-10",
  dia_vencimiento: 10,
  updated_at: "2026-11-01T00:00:00Z",
} as unknown as Contratacion;

describe("GOZS-700: renovación y extensión excepcional persisten por RPC", () => {
  beforeEach(() => {
    renovarMock.mockReset();
    extenderMock.mockReset();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [] });
    useCoachStudioStore.setState({ contrataciones: [base], toast: null });
  });

  it("renovar llama a la RPC con clave de idempotencia y toma fecha_fin de la base", async () => {
    renovarMock.mockResolvedValue({ fechaFin: "2026-12-10", estado: "VIGENTE" });

    await useCoachStudioStore
      .getState()
      .registrarRenovacionManual({ contratacion: base, monto: 5000, medioPago: "EFECTIVO" });

    expect(renovarMock).toHaveBeenCalledWith({
      contratacionId: "c-1",
      monto: 5000,
      medioPago: "EFECTIVO",
      idempotencyKey: "renov-c-1-2026-11-10-EFECTIVO",
    });
    expect(useCoachStudioStore.getState().contrataciones[0]?.fecha_fin).toBe("2026-12-10");
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
  });

  it("si renovar falla lanza y no cambia el estado local", async () => {
    renovarMock.mockRejectedValue(new Error("No autorizado"));

    await expect(
      useCoachStudioStore
        .getState()
        .registrarRenovacionManual({ contratacion: base, monto: 5000, medioPago: "EFECTIVO" }),
    ).rejects.toThrow("No autorizado");

    expect(useCoachStudioStore.getState().contrataciones[0]?.fecha_fin).toBe("2026-11-10");
    expect(useCoachStudioStore.getState().toast).toBeNull();
  });

  it("extensión excepcional usa la fila devuelta por la RPC", async () => {
    extenderMock.mockResolvedValue({ ...base, fecha_fin: "2026-11-25" });

    await useCoachStudioStore
      .getState()
      .extenderContratacionExcepcional({ contratacion: base, nuevaFechaFin: "2026-11-25", motivo: " viaje " });

    expect(extenderMock).toHaveBeenCalledWith({
      contratacionId: "c-1",
      nuevaFechaFin: "2026-11-25",
      motivo: "viaje",
    });
    expect(useCoachStudioStore.getState().contrataciones[0]?.fecha_fin).toBe("2026-11-25");
  });

  it("si la extensión falla lanza y no cambia el estado local", async () => {
    extenderMock.mockRejectedValue(new Error("fecha inválida"));

    await expect(
      useCoachStudioStore
        .getState()
        .extenderContratacionExcepcional({ contratacion: base, nuevaFechaFin: "2026-11-25", motivo: "x" }),
    ).rejects.toThrow("fecha inválida");

    expect(useCoachStudioStore.getState().contrataciones[0]?.fecha_fin).toBe("2026-11-10");
  });
});
