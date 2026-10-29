import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
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

/**
 * Envía un evento de serie. Idempotente: la sesión se upsertea por id y la
 * serie por (sesion_id, ejercicio_id, numero_serie), así un reintento no duplica.
 */
async function sendSetEvent(ev: OfflineSyncEvent): Promise<boolean> {
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
  if (!supabase || !p.sessionId || !p.alumnoId || !p.ejercicioId) return true;
  const sesion = await supabase
    .from("registro_sesiones")
    .upsert(
      { id: p.sessionId, alumno_id: p.alumnoId, ...(p.diaId ? { dia_id: p.diaId } : {}) },
      { onConflict: "id" },
    );
  if (sesion.error) return false;
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
  return !serie.error;
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
        for (const ev of get().pendingEvents) {
          let ok = true;
          if (SET_ACTIONS.includes(ev.action)) {
            try {
              ok = await sendSetEvent(ev);
            } catch {
              ok = false;
            }
          }
          // Orden preservado: ante el primer fallo se corta y se reintenta luego.
          if (!ok) return;
          get().removeEvent(ev.id);
        }
        set({ syncError: null });
      },
      setSyncError: (message) => set({ syncError: message }),
      clearSyncError: () => set({ syncError: null }),
    }),
    {
      name: "gozster-offline-queue",
      storage: createJSONStorage(() => safeStorage),
      // Nunca persistimos el aviso de error: es efímero y no bloqueante.
      partialize: (state) => ({
        isOnline: state.isOnline,
        pendingEvents: state.pendingEvents,
      }),
    },
  ),
);
