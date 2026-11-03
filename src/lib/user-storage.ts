import type { StateStorage } from "zustand/middleware";

/** Stores del alumno y del coach cuya persistencia se aísla por usuario. */
export const USER_SCOPED_STORE_NAMES = [
  "gozster-athlete-store",
  "gozster-chat-store",
  "gozster-offline-queue",
  "gozster-ranking-store",
  "gozster-clases",
  "gozster-cobros",
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

/** Borra claves persistidas: las sin sufijo (legado/coach) y las del usuario indicado en localStorage y sessionStorage. */
export function purgeStoredUserData(userId: string | null) {
  for (const name of USER_SCOPED_STORE_NAMES) {
    delete memory[name];
    if (hasLocalStorage()) {
      window.localStorage.removeItem(name);
      if (userId) window.localStorage.removeItem(`${name}:${userId}`);
    }
  }

  // Purga complementaria en sessionStorage
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      for (const name of USER_SCOPED_STORE_NAMES) {
        window.sessionStorage.removeItem(name);
        if (userId) window.sessionStorage.removeItem(`${name}:${userId}`);
      }
      window.sessionStorage.clear();
    } catch {
      // Ignorar fallos en entornos sin acceso a sessionStorage
    }
  }
}
