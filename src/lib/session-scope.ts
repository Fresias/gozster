import { createClient } from "@/lib/supabase/browser";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useRankingStore } from "@/store/use-ranking-store";
import { getStorageUser, purgeStoredUserData, setStorageUser } from "@/lib/user-storage";

type ScopedStore = {
  setState: (state: never, replace: true) => void;
  getInitialState: () => unknown;
  persist: { rehydrate: () => Promise<void> | void };
};

const stores: ScopedStore[] = [useAthleteStore, useChatStore, useOfflineQueueStore, useRankingStore] as unknown as ScopedStore[];

function resetStores() {
  for (const s of stores) s.setState(s.getInitialState() as never, true);
}

/** Fija el usuario activo: descarta el estado en memoria del anterior y rehidrata el propio. */
export async function activarUsuarioStorage(userId: string) {
  if (getStorageUser() === userId) return;
  setStorageUser(null); // el reset se escribe en memoria, nunca sobre los datos del usuario previo
  resetStores();
  purgeStoredUserData(null); // claves legado sin id de usuario
  setStorageUser(userId);
  await Promise.all(stores.map((s) => s.persist.rehydrate()));
}

/** Logout: limpia stores persistidos y cachés con datos de usuario, y cierra la sesión. */
export async function cerrarSesionAlumno() {
  const userId = getStorageUser();
  setStorageUser(null);
  resetStores();
  purgeStoredUserData(userId);
  if (typeof caches !== "undefined") {
    await caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
  }
  await createClient().auth.signOut().catch(() => {});
  window.location.replace("/login");
}
