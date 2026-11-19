import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase/client";
import { nombreParaSaludo } from "@/lib/athlete/nombre";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import * as fs from "node:fs";
import * as path from "node:path";

function datasetMinimo(nombrePreferido: string | null = null): LiveSupabaseDataset {
  return {
    alumnos: [
      {
        id: "00000000-0000-0000-0000-000000000004",
        email: "lucia@gozster.test",
        nombre_completo: "Lucía Fernández",
        rol: "ALUMNO",
        estado_membresia: "ACTIVA",
        profesor_asignado_id: null,
        fecha_baja: null,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
        nombre_preferido: nombrePreferido,
      } as LiveSupabaseDataset["alumnos"][number] & { nombre_preferido: string | null },
    ],
    planes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejercicios: [],
  };
}

describe("BE-01: nombreParaSaludo (src/lib/athlete/nombre.ts)", () => {
  it("prioriza nombre_preferido recortado cuando tiene contenido", () => {
    expect(
      nombreParaSaludo({
        nombre_preferido: "  Lu ",
        nombre_completo: "Lucía Fernández",
      }),
    ).toBe("Lu");
  });

  it("usa el primer nombre de nombre_completo cuando nombre_preferido es null o vacío", () => {
    expect(
      nombreParaSaludo({
        nombre_preferido: null,
        nombre_completo: "Lucía Fernández",
      }),
    ).toBe("Lucía");

    expect(
      nombreParaSaludo({
        nombre_preferido: "   ",
        nombre_completo: "  Lucía Fernández  ",
      }),
    ).toBe("Lucía");
  });

  it('devuelve "" cuando faltan ambos nombres', () => {
    expect(
      nombreParaSaludo({
        nombre_preferido: null,
        nombre_completo: null,
      }),
    ).toBe("");
    expect(nombreParaSaludo(null)).toBe("");
  });
});

describe("BE-01: guardarNombrePreferido y pendiente offline en useAthleteStore", () => {
  beforeEach(() => {
    useAthleteStore.setState({
      planAlumno: datasetMinimo(null),
      nombrePreferido: null,
      nombrePreferidoPendiente: undefined,
    });
    useOfflineQueueStore.setState({ isOnline: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con señal actualiza estado local al instante y llama a la RPC actualizar_nombre_preferido", async () => {
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: "Lu", error: null } as never);

    const res = await useAthleteStore.getState().guardarNombrePreferido("  Lu  ");

    expect(res).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("actualizar_nombre_preferido", { p_nombre: "Lu" });

    const state = useAthleteStore.getState();
    expect(state.nombrePreferido).toBe("Lu");
    expect(state.nombrePreferidoPendiente).toBeUndefined();
    expect(
      nombreParaSaludo(
        state.planAlumno?.alumnos[0] as { nombre_preferido?: string | null; nombre_completo: string },
      ),
    ).toBe("Lu");
  });

  it("vacío se normaliza a null y limpia nombre_preferido en el saludo", async () => {
    useAthleteStore.setState({
      planAlumno: datasetMinimo("Lu"),
      nombrePreferido: "Lu",
      nombrePreferidoPendiente: undefined,
    });
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: null, error: null } as never);

    const res = await useAthleteStore.getState().guardarNombrePreferido("   ");

    expect(res).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("actualizar_nombre_preferido", { p_nombre: null });
    expect(useAthleteStore.getState().nombrePreferido).toBeNull();
    expect(useAthleteStore.getState().nombrePreferidoPendiente).toBeUndefined();
    expect(
      nombreParaSaludo(
        useAthleteStore.getState().planAlumno?.alumnos[0] as {
          nombre_preferido?: string | null;
          nombre_completo: string;
        },
      ),
    ).toBe("Lucía");
  });

  it("rechaza más de 30 caracteres sin llamar a Supabase ni pisar el estado", async () => {
    const rpc = vi.spyOn(supabase, "rpc");

    const res = await useAthleteStore.getState().guardarNombrePreferido("A".repeat(31));

    expect(res.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(useAthleteStore.getState().nombrePreferido).toBeNull();
    expect(useAthleteStore.getState().nombrePreferidoPendiente).toBeUndefined();
  });

  it("sin señal cambia el nombre al instante, persiste nombrePreferidoPendiente y lo envía al volver la red", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: "Lu", error: null } as never);

    const resOffline = await useAthleteStore.getState().guardarNombrePreferido("  Lu ");

    expect(resOffline).toEqual({ success: true, offline: true });
    expect(rpc).not.toHaveBeenCalled();

    // El nombre cambia al instante en memoria y en planAlumno
    const estadoOffline = useAthleteStore.getState();
    expect(estadoOffline.nombrePreferido).toBe("Lu");
    expect(estadoOffline.nombrePreferidoPendiente).toBe("Lu");
    expect(
      nombreParaSaludo(
        estadoOffline.planAlumno?.alumnos[0] as {
          nombre_preferido?: string | null;
          nombre_completo: string;
        },
      ),
    ).toBe("Lu");

    // Verificar que tanto nombrePreferido como nombrePreferidoPendiente están en partialize
    const persistido = useAthleteStore.persist
      .getOptions()
      .partialize?.(estadoOffline) as Record<string, unknown>;
    expect(persistido.nombrePreferido).toBe("Lu");
    expect(persistido.nombrePreferidoPendiente).toBe("Lu");

    // Vuelve la red y se reintenta el pendiente
    useOfflineQueueStore.setState({ isOnline: true });
    const synced = await useAthleteStore.getState().sincronizarNombrePreferidoPendiente();

    expect(synced).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("actualizar_nombre_preferido", { p_nombre: "Lu" });
    expect(useAthleteStore.getState().nombrePreferidoPendiente).toBeUndefined();
  });

  it("distingue pendiente de borrado (null) de sin pendiente (undefined) en offline", async () => {
    useAthleteStore.setState({
      planAlumno: datasetMinimo("Lu"),
      nombrePreferido: "Lu",
      nombrePreferidoPendiente: undefined,
    });
    useOfflineQueueStore.setState({ isOnline: false });
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: null, error: null } as never);

    await useAthleteStore.getState().guardarNombrePreferido("");
    expect(useAthleteStore.getState().nombrePreferido).toBeNull();
    expect(useAthleteStore.getState().nombrePreferidoPendiente).toBeNull();

    const persistido = useAthleteStore.persist
      .getOptions()
      .partialize?.(useAthleteStore.getState()) as Record<string, unknown>;
    expect(JSON.parse(JSON.stringify(persistido)).nombrePreferidoPendiente).toBeNull();

    useOfflineQueueStore.setState({ isOnline: true });
    const synced = await useAthleteStore.getState().sincronizarNombrePreferidoPendiente();
    expect(synced).toBe(true);
    expect(rpc).toHaveBeenCalledWith("actualizar_nombre_preferido", { p_nombre: null });
    expect(useAthleteStore.getState().nombrePreferidoPendiente).toBeUndefined();
  });

  it("si falla la RPC por caída de red mantiene el pendiente y permite reintentar al abrir la app", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ data: "Gabi", error: null } as never);

    const res = await useAthleteStore.getState().guardarNombrePreferido("Gabi");
    expect(res).toEqual({ success: true, offline: true });
    expect(useAthleteStore.getState().nombrePreferido).toBe("Gabi");
    expect(useAthleteStore.getState().nombrePreferidoPendiente).toBe("Gabi");
    expect(warn).toHaveBeenCalled();

    const synced = await useAthleteStore.getState().sincronizarNombrePreferidoPendiente();
    expect(synced).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(useAthleteStore.getState().nombrePreferidoPendiente).toBeUndefined();
  });

  it("AthleteShell dispara sincronizarNombrePreferidoPendiente al abrir la app y al volver online", () => {
    const shell = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/athlete-shell.tsx"),
      "utf-8",
    );
    expect(shell).toContain("sincronizarNombrePreferidoPendiente");
  });
});
