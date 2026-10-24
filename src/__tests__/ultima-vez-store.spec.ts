import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase/client";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

// Datos inventados (nada del export real).
const SENTADILLA = "11111111-1111-4111-8111-111111111111";
const REMO = "33333333-3333-4333-8333-333333333333";

const sesionHoy: LiveWorkoutSession = {
  id: "session-hoy",
  nombre_rutina: "Hipertrofia: Día A",
  fecha: "2026-10-24",
  studentId: "44444444-4444-4444-8444-444444444444",
  ejercicios: [
    { id: "er-1", ejercicio_id: SENTADILLA, nombre: "Sentadilla", musculos_principales: [], descanso_segundos: 90, rpe_objetivo: 8, repeticiones_objetivo: "6-8", series: [] },
    { id: "er-2", ejercicio_id: REMO, nombre: "Remo", musculos_principales: [], descanso_segundos: 60, rpe_objetivo: 8, repeticiones_objetivo: "10", series: [] },
  ],
};

// Cadena de PostgREST simulada: cada filtro devuelve la misma cadena y el await resuelve la respuesta.
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

const fila = (ejercicio_id: string, numero_serie: number, peso_kg: number, fecha = "2026-10-12T13:00:00Z") => ({
  ejercicio_id,
  sesion_id: "s-fuerza-base",
  numero_serie,
  peso_kg,
  reps_hechas: 6,
  rpe_real: null,
  completada: true,
  set_type: "NORMAL",
  registro_sesiones: { fecha },
});

describe("cargarUltimaVez (store offline-first)", () => {
  beforeEach(() => {
    useAthleteStore.setState({ currentSession: sesionHoy, ultimaVez: {}, cargandoUltimaVez: false });
    useOfflineQueueStore.setState({ isOnline: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("descarga por ejercicio canónico: con historial guarda la sesión, sin historial guarda null", async () => {
    const from = mockConsulta({ [SENTADILLA]: [fila(SENTADILLA, 2, 80), fila(SENTADILLA, 1, 77.5)] });
    await useAthleteStore.getState().cargarUltimaVez();

    expect(from).toHaveBeenCalledWith("registro_series");
    const { ultimaVez, cargandoUltimaVez } = useAthleteStore.getState();
    expect(cargandoUltimaVez).toBe(false);
    expect(ultimaVez[SENTADILLA]).toEqual({
      ejercicio_id: SENTADILLA,
      fecha: "2026-10-12T13:00:00Z",
      series: [
        { numero_serie: 1, peso_kg: 77.5, reps_hechas: 6, rpe_real: null },
        { numero_serie: 2, peso_kg: 80, reps_hechas: 6, rpe_real: null },
      ],
    });
    expect(ultimaVez[REMO]).toBeNull();
  });

  it("sin red no consulta y conserva lo persistido (modo avión)", async () => {
    const guardado = { ejercicio_id: SENTADILLA, fecha: "2026-10-12T13:00:00Z", series: [{ numero_serie: 1, peso_kg: 80, reps_hechas: 6, rpe_real: null }] };
    useAthleteStore.setState({ ultimaVez: { [SENTADILLA]: guardado } });
    useOfflineQueueStore.setState({ isOnline: false });
    const from = vi.spyOn(supabase, "from");

    await useAthleteStore.getState().cargarUltimaVez();

    expect(from).not.toHaveBeenCalled();
    expect(useAthleteStore.getState().ultimaVez[SENTADILLA]).toEqual(guardado);
    expect(useAthleteStore.getState().cargandoUltimaVez).toBe(false);
  });

  it("si la consulta falla no pisa lo guardado ni deja el esqueleto colgado", async () => {
    const guardado = { ejercicio_id: SENTADILLA, fecha: "2026-10-12T13:00:00Z", series: [{ numero_serie: 1, peso_kg: 80, reps_hechas: 6, rpe_real: null }] };
    useAthleteStore.setState({ ultimaVez: { [SENTADILLA]: guardado } });
    vi.spyOn(supabase, "from").mockImplementation(() => {
      throw new Error("sin conexión");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await useAthleteStore.getState().cargarUltimaVez();

    expect(useAthleteStore.getState().ultimaVez[SENTADILLA]).toEqual(guardado);
    expect(useAthleteStore.getState().cargandoUltimaVez).toBe(false);
  });

  it("ignora ejercicios de demo sin id de catálogo (no consulta)", async () => {
    useAthleteStore.setState({
      currentSession: { ...sesionHoy, ejercicios: [{ ...sesionHoy.ejercicios[0]!, id: "ej-sentadilla-1", ejercicio_id: undefined }] },
    });
    const from = vi.spyOn(supabase, "from");
    await useAthleteStore.getState().cargarUltimaVez();
    expect(from).not.toHaveBeenCalled();
  });

  it("persiste ultimaVez para usarla sin señal", () => {
    const opciones = useAthleteStore.persist.getOptions();
    const persistido = opciones.partialize?.(useAthleteStore.getState()) as Record<string, unknown>;
    expect(persistido).toHaveProperty("ultimaVez");
    expect(persistido).not.toHaveProperty("cargandoUltimaVez");
  });
});
