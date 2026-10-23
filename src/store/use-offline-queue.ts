import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

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
   * Vacía la cola de forma silenciosa al recuperar la señal. El alumno nunca
   * ve el proceso: para él sus datos ya estaban "guardados".
   */
  flushQueue: () => void;
  setSyncError: (message: string) => void;
  clearSyncError: () => void;
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
    (set) => ({
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
      flushQueue: () => set({ pendingEvents: [], syncError: null }),
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
