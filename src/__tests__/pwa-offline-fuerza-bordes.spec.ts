import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GOZS-807 · Hardening de bordes: cola offline, fuerza (1RM / volumen / reps) y temporizador.
// Datos 100% sintéticos. Solo prueba comportamiento actual; no toca código de producción.

const upserts: { table: string; row: Record<string, unknown> }[] = [];
let failNext = 0; // cantidad de upserts que fallan por red antes de recuperarse

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u-auth" } } }) },
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>) => {
        if (failNext > 0) {
          failNext--;
          return { error: { message: "network" } };
        }
        upserts.push({ table, row });
        return { error: null };
      },
    }),
  },
}));

vi.mock("@/lib/sound", async (orig) => ({
  ...(await orig<typeof import("@/lib/sound")>()),
  playRestTimerAlert: vi.fn(),
  triggerHapticVibration: vi.fn(),
}));

import { useOfflineQueueStore, resetBackoffCola } from "@/store/use-offline-queue";
import { useAthleteStore } from "@/store/use-athlete-store";
import { playRestTimerAlert, triggerHapticVibration } from "@/lib/sound";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEffectiveVolume,
  calculateEpley1RM,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";
import { parseDefaultReps, parsePyramidSeriesCount, parseRepRange } from "@/lib/routine-helpers";
import { crearBackoff, delayBackoff, SYNC_MAX_REINTENTOS } from "@/lib/sync-backoff";

const queue = () => useOfflineQueueStore.getState();
const setEvent = (id: string, n: number, extra: Record<string, unknown> = {}) => ({
  id,
  action: "WORKOUT_SET_COMPLETED",
  payload: { sessionId: "s1", alumnoId: "a1", diaId: "d1", ejercicioId: "e1", setNumber: n, pesoKg: 50, reps: 8, ...extra },
});

describe("GOZS-807 · cola offline: orden, reconexión e idempotencia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    upserts.length = 0;
    failNext = 0;
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
  });
  afterEach(() => {
    resetBackoffCola();
    vi.useRealTimers();
  });

  it("cola vacía: flush no envía nada ni deja error", async () => {
    await queue().flushQueue();
    expect(upserts).toHaveLength(0);
    expect(queue().syncError).toBeNull();
  });

  it("un fallo transitorio corta el ciclo y conserva el orden de TODOS los pendientes", async () => {
    ["a", "b", "c"].forEach((id, i) => queue().enqueueEvent(setEvent(id, i + 1)));
    failNext = 1;
    await queue().flushQueue();
    expect(queue().pendingEvents.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(upserts).toHaveLength(0);
  });

  it("el backoff reenvía solo al recuperarse y deja la cola vacía sin duplicar series", async () => {
    ["a", "b"].forEach((id, i) => queue().enqueueEvent(setEvent(id, i + 1)));
    failNext = 1;
    await queue().flushQueue();
    await vi.advanceTimersByTimeAsync(delayBackoff(0));
    expect(queue().pendingEvents).toHaveLength(0);
    const series = upserts.filter((u) => u.table === "registro_series").map((u) => u.row.numero_serie);
    expect(series).toEqual([1, 2]);
  });

  it("flushes concurrentes (doble evento 'online') no duplican envíos", async () => {
    queue().enqueueEvent(setEvent("a", 1));
    await Promise.all([queue().flushQueue(), queue().flushQueue(), queue().flushQueue()]);
    expect(upserts.filter((u) => u.table === "registro_series")).toHaveLength(1);
    expect(queue().pendingEvents).toHaveLength(0);
  });

  it("al pasar a offline se corta el reintento pendiente (no gasta intentos sin señal)", async () => {
    queue().enqueueEvent(setEvent("a", 1));
    failNext = 1;
    await queue().flushQueue();
    queue().setOnlineStatus(false);
    await vi.advanceTimersByTimeAsync(delayBackoff(0) * 2);
    expect(upserts).toHaveLength(0);
    expect(queue().pendingEvents).toHaveLength(1);
    expect(queue().syncError).toBeNull();
  });

  it("clearQueue vacía la cola y cancela reintentos", async () => {
    queue().enqueueEvent(setEvent("a", 1));
    failNext = 1;
    await queue().flushQueue();
    queue().clearQueue();
    await vi.advanceTimersByTimeAsync(delayBackoff(0) * 2);
    expect(queue().pendingEvents).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });

  it("una acción desconocida no bloquea la cola", async () => {
    queue().enqueueEvent({ id: "x", action: "ACCION_DESCONOCIDA", payload: {} });
    queue().enqueueEvent(setEvent("a", 1));
    await queue().flushQueue();
    expect(queue().pendingEvents).toHaveLength(0);
    expect(upserts.filter((u) => u.table === "registro_series")).toHaveLength(1);
  });

  it("removeEvent con id inexistente es no-op y enqueue estampa createdAt ISO", () => {
    queue().enqueueEvent(setEvent("a", 1));
    queue().removeEvent("no-existe");
    expect(queue().pendingEvents).toHaveLength(1);
    expect(new Date(queue().pendingEvents[0]!.createdAt).toISOString()).toBe(queue().pendingEvents[0]!.createdAt);
  });
});

describe("GOZS-807 · backoff: bordes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("programar() repetido no apila timers", async () => {
    const ejecutar = vi.fn();
    const b = crearBackoff(ejecutar, vi.fn());
    b.programar();
    b.programar();
    b.programar();
    await vi.advanceTimersByTimeAsync(delayBackoff(0));
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it("reset() cancela el reintento pendiente y reinicia el contador", async () => {
    const ejecutar = vi.fn();
    const b = crearBackoff(ejecutar, vi.fn());
    b.programar();
    b.reset();
    await vi.advanceTimersByTimeAsync(delayBackoff(0) * 3);
    expect(ejecutar).not.toHaveBeenCalled();
    b.programar();
    await vi.advanceTimersByTimeAsync(delayBackoff(0));
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it("tras agotar, el ciclo reinicia desde el delay base", async () => {
    const ejecutar = vi.fn();
    const onAgotado = vi.fn();
    const b = crearBackoff(ejecutar, onAgotado);
    for (let i = 0; i < SYNC_MAX_REINTENTOS; i++) {
      b.programar();
      await vi.advanceTimersByTimeAsync(delayBackoff(i));
    }
    b.programar();
    expect(onAgotado).toHaveBeenCalledTimes(1);
    b.programar();
    await vi.advanceTimersByTimeAsync(delayBackoff(0));
    expect(ejecutar).toHaveBeenCalledTimes(SYNC_MAX_REINTENTOS + 1);
  });

  it("delayBackoff nunca supera el techo ni crece sin límite", () => {
    expect(delayBackoff(0)).toBe(2000);
    expect(delayBackoff(100)).toBe(60_000);
    expect(Number.isFinite(delayBackoff(1000))).toBe(true);
  });
});

describe("GOZS-807 · fuerza: 1RM, volumen y reps", () => {
  it("Epley/Brzycki con 1 rep devuelven ≈ el peso (decimales 62.5 kg)", () => {
    expect(calculateEpley1RM(62.5, 1)).toBeCloseTo(62.5 * (1 + 1 / 30), 10);
    expect(calculateBrzycki1RM(62.5, 1)).toBeCloseTo(62.5, 1);
  });

  it("peso 0 (bodyweight) o reps 0 → 1RM 0, nunca NaN", () => {
    for (const fn of [calculateEpley1RM, calculateBrzycki1RM]) {
      expect(fn(0, 10)).toBe(0);
      expect(fn(80, 0)).toBe(0);
      expect(Number.isNaN(fn(0, 0))).toBe(false);
    }
  });

  it("Brzycki en reps extremas (36 válido, 37+ corta a 0) sin Infinity", () => {
    expect(Number.isFinite(calculateBrzycki1RM(60, 36))).toBe(true);
    expect(calculateBrzycki1RM(60, 36)).toBeGreaterThan(0);
    expect(calculateBrzycki1RM(60, 37)).toBe(0);
    expect(calculateBrzycki1RM(60, 1000)).toBe(0);
  });

  it("Epley ≥ peso levantado y es monótono en reps", () => {
    const rms = [1, 3, 5, 8, 12].map((r) => calculateEpley1RM(100, r));
    expect(rms.every((v) => v >= 100)).toBe(true);
    expect([...rms].sort((a, b) => a - b)).toEqual(rms);
  });

  it("volumen: decimales exactos y bloques inválidos no contaminan el total", () => {
    expect(calculateBlockVolume(4, 10, 62.5)).toBe(2500);
    expect(calculateBlockVolume(Number.NaN, 10, 50)).toBe(0);
    expect(calculateBlockVolume(3, Number.POSITIVE_INFINITY, 50)).toBe(0);
    expect(
      calculateTotalTonnage([
        { series: 3, reps: 10, peso: 60 },
        { series: 3, reps: Number.NaN, peso: 60 },
        { series: 4, reps: 8, peso: 0 },
        { series: 2, reps: 5, peso: 62.5 },
      ]),
    ).toBe(1800 + 625);
    expect(calculateTotalTonnage([])).toBe(0);
  });

  it("volumen efectivo: excluye calentamiento (W/WARMUP, case-insensitive), no completadas y ceros", () => {
    const total = calculateEffectiveVolume([
      { peso_kg: 20, reps_hechas: 10, set_type: "warmup" },
      { peso_kg: 20, reps_hechas: 10, set_type: "W" },
      { peso_kg: 60, reps_hechas: 8, set_type: "NORMAL" },
      { peso_kg: 62.5, reps_hechas: 8 },
      { peso_kg: 70, reps_hechas: 5, completada: false },
      { peso_kg: 0, reps_hechas: 15 },
      { peso_kg: 50, reps_hechas: 0 },
    ]);
    expect(total).toBe(60 * 8 + 62.5 * 8);
    expect(calculateEffectiveVolume([])).toBe(0);
  });

  it("parseDefaultReps: '10-8-6' por serie, '4x10', '8-10', '4 a 6' y basura → valor seguro", () => {
    expect(parseDefaultReps("10-8-6", 3)).toBe(6);
    expect(parseDefaultReps("10-8-6", 7)).toBe(6);
    expect(parseDefaultReps("8-10", 1)).toBe(8);
    expect(parseDefaultReps("4 a 6", 1)).toBe(4);
    expect(parseDefaultReps("4x10", 1)).toBe(10); // comportamiento actual: no matchea (b), cae al default 10
    expect(parseDefaultReps("0", 1)).toBe(10);
    expect(parseDefaultReps("   ", 1)).toBe(10);
    expect(parseDefaultReps("abc", 1)).toBe(10);
    for (const s of ["10-8-6", "4x10", "NaN", "-", "--", "10-", "-5"]) {
      const v = parseDefaultReps(s, 1);
      expect(Number.isInteger(v) && v > 0).toBe(true);
    }
  });

  it("parseRepRange / parsePyramidSeriesCount rechazan formatos ambiguos", () => {
    expect(parseRepRange("8-12")).toBeNull();
    expect(parseRepRange("8/")).toBeNull();
    expect(parseRepRange("/12")).toBeNull();
    expect(parseRepRange("8/12/15")).toBeNull();
    expect(parseRepRange("12/8")).toEqual({ isRange: true, min: 8, max: 12 });
    expect(parsePyramidSeriesCount("10-8-6")).toBe(3);
    expect(parsePyramidSeriesCount("10")).toBeNull();
    expect(parsePyramidSeriesCount("10-0-6")).toBeNull();
    expect(parsePyramidSeriesCount("10 - 8")).toBeNull();
    expect(parsePyramidSeriesCount("1000-8")).toBeNull();
  });
});

describe("GOZS-807 · temporizador de descanso", () => {
  const timer = () => useAthleteStore.getState().restTimer;
  const s = () => useAthleteStore.getState();

  beforeEach(() => {
    vi.mocked(playRestTimerAlert).mockClear();
    vi.mocked(triggerHapticVibration).mockClear();
    s().stopTimer();
  });

  it("tick sin timer activo es no-op (pestaña reanudada tras stop)", () => {
    s().tickTimer();
    expect(timer().isActive).toBe(false);
    expect(timer().secondsRemaining).toBe(0);
    expect(playRestTimerAlert).not.toHaveBeenCalled();
  });

  it("cuenta regresiva exacta, alerta + vibración una sola vez al llegar a 0", () => {
    s().startRestTimer(3, "Press banca", 1);
    s().tickTimer();
    s().tickTimer();
    expect(timer().secondsRemaining).toBe(1);
    expect(playRestTimerAlert).not.toHaveBeenCalled();
    s().tickTimer();
    expect(timer()).toMatchObject({ isActive: false, secondsRemaining: 0 });
    expect(playRestTimerAlert).toHaveBeenCalledTimes(1);
    expect(triggerHapticVibration).toHaveBeenCalledTimes(1);
    // ticks rezagados después de terminar no vuelven a alertar ni dejan negativos
    s().tickTimer();
    s().tickTimer();
    expect(timer().secondsRemaining).toBe(0);
    expect(playRestTimerAlert).toHaveBeenCalledTimes(1);
  });

  it("pausa ignora ticks y reanudar continúa donde quedó", () => {
    s().startRestTimer(10, "Sentadilla", 2);
    s().tickTimer();
    s().pauseTimer();
    for (let i = 0; i < 20; i++) s().tickTimer();
    expect(timer().secondsRemaining).toBe(9);
    s().resumeTimer();
    s().tickTimer();
    expect(timer().secondsRemaining).toBe(8);
  });

  it("+30 s extiende restante y total; stop limpia todo", () => {
    s().startRestTimer(60, "Remo", 1);
    s().addTimerSeconds(30);
    expect(timer()).toMatchObject({ secondsRemaining: 90, totalSeconds: 90 });
    s().stopTimer();
    expect(timer()).toMatchObject({ isActive: false, secondsRemaining: 0, totalSeconds: 0, exerciseName: "", setNumber: 0 });
  });

  it("reiniciar un descanso reemplaza al anterior (no se acumulan)", () => {
    s().startRestTimer(60, "A", 1);
    s().tickTimer();
    s().startRestTimer(45, "B", 2);
    expect(timer()).toMatchObject({ secondsRemaining: 45, totalSeconds: 45, exerciseName: "B", setNumber: 2 });
  });

  it("el descanso se rige por ticks del intervalo, no por reloj: sin ticks (pestaña suspendida) no avanza", () => {
    // Caracterización del comportamiento actual (ver reporte GOZS-807): Date.now() no interviene.
    vi.useFakeTimers();
    try {
      s().startRestTimer(30, "Peso muerto", 1);
      vi.advanceTimersByTime(10 * 60_000); // 10 min "suspendida", sin intervalo montado
      expect(timer().secondsRemaining).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });
});
