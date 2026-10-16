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
  setOnlineStatus: (isOnline: boolean) => void;
  enqueueEvent: (event: Omit<OfflineSyncEvent, "createdAt">) => void;
  removeEvent: (id: string) => void;
  clearQueue: () => void;
}

const memoryFallback: Record<string, string> = {};

const safeStorage: StateStorage = {
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
    }),
    {
      name: "gozster-offline-queue",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
