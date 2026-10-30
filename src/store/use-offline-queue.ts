import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-storage";
import { supabase } from "@/lib/supabase/client";

export interface OfflineSyncEvent {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface OfflineQueueState {
  isOnline: boolean;
  pendingEvents: OfflineSyncEvent[];
  /**
   * Aviso de fallo DEFINITIVO de sincronización (p. ej. 401 por sesión
   * vencida). Es la única excepción que la app del alumno muestra: un aviso
   * discreto y no bloqueante. Nunca exponemos el contador de la cola.
   */
  syncError: string | null;
  setOnlineStatus: (isOnline: boolean) => void;
  enqueueEvent: (event: Omit<OfflineSyncEvent, "createdAt">) => void;
  removeEvent: (id: string) => void;
  clearQueue: () => void;
  /**
   * Envía la cola a Supabase de forma silenciosa al recuperar la señal. Solo
   * quita los eventos confirmados por el servidor; ante un fallo (red/RLS) el
   * resto queda en cola para reintentar. El alumno nunca ve el proceso.
   */
  flushQueue: () => Promise<void>;
  setSyncError: (message: string) => void;
  clearSyncError: () => void;
}

const SET_ACTIONS = ["WORKOUT_SET_COMPLETED", "WORKOUT_SET_UPDATED"];

type SendResult = "ok" | "retry" | "rejected";

// Errores permanentes de Postgres: CHECK (23514), FK (23503) y RLS (42501).
// Reintentarlos no sirve y bloquearía la cola; los de red no traen código.
const PERMANENT_CODES = ["23514", "23503", "42501"];
const toResult = (error: { code?: string } | null): SendResult =>
  !error ? "ok" : PERMANENT_CODES.includes(error.code ?? "") ? "rejected" : "retry";

/**
 * Envía un evento de serie. Idempotente: la sesión se upsertea por id y la
 * serie por (sesion_id, ejercicio_id, numero_serie), así un reintento no duplica.
 */
async function sendSetEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  const p = ev.payload as {
    sessionId?: string;
    alumnoId?: string;
    diaId?: string;
    ejercicioId?: string;
    setNumber: number;
    pesoKg?: number;
    reps?: number;
    rpe?: number | null;
    setType?: string;
    painReported?: boolean;
    painNotes?: string | null;
    videoUrl?: string | null;
  };
  if (!supabase) return "retry";
  // Sin sesión o ejercicio no se puede atribuir la serie: reintentar no lo arregla.
  if (!p.sessionId || !p.ejercicioId) return "rejected";
  // Sin alumno en el evento, la serie es del usuario autenticado (RLS exige lo mismo).
  // Sin sesión de auth se conserva en cola: es dato del alumno, no se descarta.
  const alumnoId = p.alumnoId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!alumnoId) return "retry";
  const sesion = await supabase
    .from("registro_sesiones")
    .upsert(
      { id: p.sessionId, alumno_id: alumnoId, ...(p.diaId ? { dia_id: p.diaId } : {}) },
      { onConflict: "id" },
    );
  if (sesion.error) return toResult(sesion.error);
  const completed = ev.action === "WORKOUT_SET_COMPLETED";
  const serie = await supabase.from("registro_series").upsert(
    {
      sesion_id: p.sessionId,
      ejercicio_id: p.ejercicioId,
      numero_serie: p.setNumber,
      peso_kg: p.pesoKg,
      reps_hechas: p.reps,
      ...(completed
        ? {
            rpe_real: p.rpe ?? null,
            completada: true,
            set_type: (p.setType ?? "N") as "NORMAL", // la BD también acepta W/N/F/D
            pain_reported: p.painReported ?? false,
            pain_notes: p.painNotes ?? null,
            video_url: p.videoUrl ?? null,
          }
        : {}),
    },
    { onConflict: "sesion_id,ejercicio_id,numero_serie" },
  );
  return toResult(serie.error);
}

const memoryFallback: Record<string, string> = {};

export const safeStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(name);
    }
    return memoryFallback[name] ?? null;
  },
  setItem: (name: string, value: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(name, value);
      return;
    }
    memoryFallback[name] = value;
  },
  removeItem: (name: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(name);
      return;
    }
    delete memoryFallback[name];
  },
};

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
      setOnlineStatus: (isOnline) => set({ isOnline }),
      enqueueEvent: (event) =>
        set((state) => ({
          pendingEvents: [
            ...state.pendingEvents,
            { ...event, createdAt: new Date().toISOString() },
          ],
        })),
      removeEvent: (id) =>
        set((state) => ({
          pendingEvents: state.pendingEvents.filter((item) => item.id !== id),
        })),
      clearQueue: () => set({ pendingEvents: [] }),
      flushQueue: async () => {
        // Sin cliente Supabase no hay servidor que confirme: nada se descarta.
        if (!supabase) return;
        set({ syncError: null });
        for (const ev of get().pendingEvents) {
          let result: SendResult = "ok";
          if (SET_ACTIONS.includes(ev.action)) {
            try {
              result = await sendSetEvent(ev);
            } catch {
              result = "retry";
            }
          }
          // Orden preservado: ante un fallo transitorio se corta y se reintenta luego.
          if (result === "retry") return;
          // Rechazo permanente: se descarta ese evento para no bloquear la cola.
          if (result === "rejected") {
            set({ syncError: "No pudimos guardar una serie. Avisá a tu coach." });
          }
          get().removeEvent(ev.id);
        }
      },
      setSyncError: (message) => set({ syncError: message }),
      clearSyncError: () => set({ syncError: null }),
    }),
    {
      name: "gozster-offline-queue",
      storage: createJSONStorage(() => userScopedStorage),
      // Nunca persistimos el aviso de error: es efímero y no bloqueante.
      partialize: (state) => ({
        isOnline: state.isOnline,
        pendingEvents: state.pendingEvents,
      }),
    },
  ),
);
