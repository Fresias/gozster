import type { StateStorage } from "zustand/middleware";

/** Stores del alumno cuya persistencia se aísla por usuario. */
export const USER_SCOPED_STORE_NAMES = [
  "gozster-athlete-store",
  "gozster-chat-store",
  "gozster-offline-queue",
  "gozster-ranking-store",
] as const;

let currentUserId: string | null = null;
const memory: Record<string, string> = {};

const hasLocalStorage = () => typeof window !== "undefined" && !!window.localStorage;
const scopedKey = (name: string) => `${name}:${currentUserId}`;

export const getStorageUser = () => currentUserId;
export const setStorageUser = (id: string | null) => {
  currentUserId = id;
};

/**
 * Sin usuario identificado nada toca localStorage (solo memoria): así un
 * dispositivo compartido nunca rehidrata datos de otro alumno.
 */
export const userScopedStorage: StateStorage = {
  getItem: (name) =>
    currentUserId && hasLocalStorage()
      ? window.localStorage.getItem(scopedKey(name))
      : (memory[name] ?? null),
  setItem: (name, value) => {
    if (currentUserId && hasLocalStorage()) window.localStorage.setItem(scopedKey(name), value);
    else memory[name] = value;
  },
  removeItem: (name) => {
    if (currentUserId && hasLocalStorage()) window.localStorage.removeItem(scopedKey(name));
    else delete memory[name];
  },
};

/** Borra claves persistidas: las sin sufijo (legado) y las del usuario indicado. */
export function purgeStoredUserData(userId: string | null) {
  for (const name of USER_SCOPED_STORE_NAMES) {
    delete memory[name];
    if (!hasLocalStorage()) continue;
    window.localStorage.removeItem(name);
    if (userId) window.localStorage.removeItem(`${name}:${userId}`);
  }
}
