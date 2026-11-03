import { createClient } from "@/lib/supabase/browser";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useRankingStore } from "@/store/use-ranking-store";
import { getStorageUser, purgeStoredUserData, setStorageUser } from "@/lib/user-storage";

type ScopedStore = {
  setState: (state: never, replace: true) => void;
  getInitialState: () => unknown;
  persist?: { rehydrate: () => Promise<void> | void };
};

const stores: ScopedStore[] = [
  useAthleteStore,
  useChatStore,
  useOfflineQueueStore,
  useRankingStore,
  useClasesStore,
  useCobrosStore,
  useCoachStudioStore,
] as unknown as ScopedStore[];

export function resetStores() {
  for (const s of stores) {
    if (typeof s.getInitialState === "function") {
      s.setState(s.getInitialState() as never, true);
    }
  }
}

/** Purgar cookies de autenticación de Supabase en SSR */
export function purgeAuthCookies() {
  if (typeof document === "undefined" || !document.cookie) return;
  try {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const eqPos = cookie.indexOf("=");
      const name = (eqPos > -1 ? cookie.slice(0, eqPos) : cookie).trim();
      if (!name) continue;
      if (
        name.startsWith("sb-") ||
        name.includes("auth-token") ||
        name.includes("supabase") ||
        name.startsWith("sb:")
      ) {
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`;
      }
    }
  } catch {
    // Ignorar si el entorno no permite mutar cookies
  }
}

/** Fija el usuario activo: descarta el estado en memoria del anterior y rehidrata el propio. */
export async function activarUsuarioStorage(userId: string) {
  if (getStorageUser() === userId) return;
  setStorageUser(null); // el reset se escribe en memoria, nunca sobre los datos del usuario previo
  resetStores();
  purgeStoredUserData(null); // claves legado sin id de usuario
  setStorageUser(userId);
  await Promise.all(stores.map((s) => s.persist?.rehydrate?.()));
}

/**
 * Logout Universal (Coach Studio, Athlete App y Landing):
 * 1. Invoca supabase.auth.signOut()
 * 2. Purga todas las cookies de autenticación de Supabase en SSR
 * 3. Purga localStorage y sessionStorage de datos de usuario (purgeStoredUserData)
 * 4. Resetea los stores en memoria de Zustand
 * 5. Elimina entradas sensibles de caches del Service Worker
 * 6. Redirige de inmediato a /login
 */
export async function cerrarSesion() {
  const client = createClient();
  let userId = getStorageUser();
  if (!userId) {
    try {
      const { data } = await client.auth.getUser();
      if (data?.user?.id) userId = data.user.id;
    } catch {
      // ignore
    }
  }

  // 1. Invoca supabase.auth.signOut()
  await client.auth.signOut().catch(() => {});

  // 2. Purga cookies SSR
  purgeAuthCookies();

  // 3. Desvincula usuario activo y resetea stores en memoria de Zustand
  setStorageUser(null);
  resetStores();

  // 4. Purga localStorage y sessionStorage de datos de usuario
  purgeStoredUserData(userId);

  // 5. Elimina entradas de caches del Service Worker
  if (typeof caches !== "undefined") {
    await caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
  }

  // 6. Redirige de inmediato a /login
  if (typeof window !== "undefined" && window.location) {
    window.location.replace("/login");
  }
}

/** Alias para compatibilidad con código existente */
export const cerrarSesionAlumno = cerrarSesion;
export const cerrarSesionUniversal = cerrarSesion;
