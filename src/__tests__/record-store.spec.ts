import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase/client";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { esNuevoRecord } from "@/lib/record-ejercicio";

// Datos inventados (nada del export real, ADR-005).
const SENTADILLA = "11111111-1111-4111-8111-111111111111";

const sesionHoy: LiveWorkoutSession = {
  id: "session-hoy",
  nombre_rutina: "Fuerza: Día A",
  fecha: "2026-10-24",
  studentId: "44444444-4444-4444-8444-444444444444",
  ejercicios: [
    { id: "er-1", ejercicio_id: SENTADILLA, nombre: "Sentadilla", musculos_principales: [], descanso_segundos: 90, rpe_objetivo: 8, repeticiones_objetivo: "6-8", series: [] },
  ],
};

function mockConsulta(respuestas: Record<string, unknown[]>) {
  return vi.spyOn(supabase, "from").mockImplementation((() => {
    let ejercicioId = "";
    const cadena: Record<string, unknown> = {};
    for (const m of ["select", "gte", "or", "lt", "order", "limit"]) cadena[m] = () => cadena;
    cadena.eq = (col: string, v: string) => {
      if (col === "ejercicio_id") ejercicioId = v;
      return cadena;
    };
    cadena.then = (ok: (r: unknown) => unknown) => ok({ data: respuestas[ejercicioId] ?? [], error: null });
    return cadena;
  }) as never);
}

const fila = (peso_kg: number, reps_hechas: number, fecha: string) => ({
  ejercicio_id: SENTADILLA,
  sesion_id: `s-${fecha}`,
  numero_serie: 1,
  peso_kg,
  reps_hechas,
  rpe_real: null,
  completada: true,
  set_type: "NORMAL",
  registro_sesiones: { fecha },
});

describe("marcas (store, GOZS-161 §3.3 / §3.5)", () => {
  beforeEach(() => {
    useAthleteStore.setState({ currentSession: sesionHoy, ultimaVez: {}, marcas: {} });
    useOfflineQueueStore.setState({ isOnline: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("la descarga de la sesión también construye la frontera de marcas", async () => {
    mockConsulta({
      [SENTADILLA]: [fila(100, 3, "2026-10-10T13:00:00Z"), fila(90, 6, "2026-10-12T13:00:00Z"), fila(80, 8, "2026-10-14T13:00:00Z")],
    });
    await useAthleteStore.getState().cargarUltimaVez();

    const marca = useAthleteStore.getState().marcas[SENTADILLA];
    expect(marca).not.toBeNull();
    expect(marca!.max_peso_kg).toBe(100);
    expect(marca!.frontera).toHaveLength(3);
    // 102,5 × 1 supera el máximo → sería récord de peso con estas marcas.
    expect(esNuevoRecord({ peso_kg: 102.5, reps_hechas: 1 }, marca ?? null).tipo).toBe("peso");
  });

  it("sin red no consulta y usa las marcas persistidas (modo avión)", async () => {
    const guardado = { ejercicio_id: SENTADILLA, frontera: [{ peso_kg: 80, reps_hechas: 6, fecha: "2026-10-12T13:00:00Z" }], max_peso_kg: 80, max_epley_kg: 96 };
    useAthleteStore.setState({ marcas: { [SENTADILLA]: guardado } });
    useOfflineQueueStore.setState({ isOnline: false });
    const from = vi.spyOn(supabase, "from");

    await useAthleteStore.getState().cargarUltimaVez();

    expect(from).not.toHaveBeenCalled();
    expect(useAthleteStore.getState().marcas[SENTADILLA]).toEqual(guardado);
  });

  it("registrarSerieEnMarcas evita festejar dos veces el mismo récord (una sola vez)", () => {
    useAthleteStore.setState({
      marcas: { [SENTADILLA]: { ejercicio_id: SENTADILLA, frontera: [{ peso_kg: 80, reps_hechas: 5, fecha: "2026-10-12T13:00:00Z" }], max_peso_kg: 80, max_epley_kg: 93.3 } },
    });

    // Serie 2: 85 × 5 es récord con las marcas actuales.
    expect(esNuevoRecord({ peso_kg: 85, reps_hechas: 5 }, useAthleteStore.getState().marcas[SENTADILLA] ?? null).esRecord).toBe(true);
    useAthleteStore.getState().registrarSerieEnMarcas(SENTADILLA, { peso_kg: 85, reps_hechas: 5 });

    // Serie 3: repite 85 × 5 → ya no es récord.
    expect(esNuevoRecord({ peso_kg: 85, reps_hechas: 5 }, useAthleteStore.getState().marcas[SENTADILLA] ?? null).esRecord).toBe(false);
  });

  it("persiste marcas para decidir récords sin señal", () => {
    const persistido = useAthleteStore.persist.getOptions().partialize?.(useAthleteStore.getState()) as Record<string, unknown>;
    expect(persistido).toHaveProperty("marcas");
  });
});
