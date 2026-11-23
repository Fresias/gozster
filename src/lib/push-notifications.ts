/**
 * Utilidades de registro de Push Notifications (PWA Web Push) para GOZSter
 * Soporte Offline-First: persistencia local y sincronización con Supabase.
 */

import { supabase } from "@/lib/supabase/client";

export interface PushSubscriptionInfo {
  endpoint: string;
  p256dh: string;
  auth: string;
  usuario_id: string;
  created_at: string;
}

export interface PushStatus {
  isSupported: boolean;
  permission: NotificationPermission | "unsupported";
  isSubscribed: boolean;
  subscription: PushSubscriptionInfo | null;
}

const STORAGE_KEY_PREFIX = "gozs_push_sub_";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

/** Clave pública VAPID (base64url) -> bytes para pushManager.subscribe. */
export function urlBase64ToBytes(base64Url: string): Uint8Array {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("No se pudo registrar el Service Worker:", err);
    return null;
  }
}

export async function requestPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn("Error al solicitar permisos de notificación:", err);
    return "denied";
  }
}

export async function getPushSubscriptionStatus(usuarioId: string): Promise<PushStatus> {
  if (!isPushSupported()) {
    return {
      isSupported: false,
      permission: "unsupported",
      isSubscribed: false,
      subscription: null,
    };
  }

  const permission = Notification.permission;

  // Revisar caché local primero (Offline-First)
  let cachedSub: PushSubscriptionInfo | null = null;
  try {
    const raw = getStorage()?.getItem(`${STORAGE_KEY_PREFIX}${usuarioId}`);
    if (raw) cachedSub = JSON.parse(raw);
  } catch {
    // ignorar error de parseo local
  }

  let swSub: PushSubscription | null = null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      swSub = await reg.pushManager.getSubscription();
    }
  } catch {
    // continuar con datos de caché
  }

  const isSubscribed = Boolean(swSub || cachedSub);

  return {
    isSupported: true,
    permission,
    isSubscribed,
    subscription: cachedSub,
  };
}

export async function subscribeToPush(
  usuarioId: string,
): Promise<{ success: boolean; subscription?: PushSubscriptionInfo; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: "Tu navegador no soporta notificaciones push PWA." };
  }

  const permission = await requestPushPermission();
  if (permission !== "granted") {
    return {
      success: false,
      error: "Permiso de notificaciones no concedido. Habilitalo en los ajustes de tu navegador.",
    };
  }

  try {
    const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
    if (!reg) {
      return { success: false, error: "No se pudo inicializar el Service Worker." };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        ...(vapid ? { applicationServerKey: urlBase64ToBytes(vapid) as BufferSource } : {}),
      });
    }

    const subJson = sub.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, error: "El navegador no devolvió una suscripción push válida." };
    }
    const subInfo: PushSubscriptionInfo = {
      usuario_id: usuarioId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth: subJson.keys.auth,
      created_at: new Date().toISOString(),
    };

    // 1. Persistir localmente en Offline-First
    try {
      getStorage()?.setItem(`${STORAGE_KEY_PREFIX}${usuarioId}`, JSON.stringify(subInfo));
    } catch {
      // safe storage fallback
    }

    // 2. Intentar guardar en Supabase si hay conexión
    try {
      if (navigator.onLine) {
        await (supabase as any).from("push_suscripciones").upsert(
          {
            usuario_id: subInfo.usuario_id,
            endpoint: subInfo.endpoint,
            p256dh: subInfo.p256dh,
            auth: subInfo.auth,
          },
          { onConflict: "usuario_id,endpoint" },
        );
      }
    } catch {
      // Mantener éxito local offline
    }

    return { success: true, subscription: subInfo };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Ocurrió un error al registrar la suscripción push.",
    };
  }
}

export async function unsubscribeFromPush(usuarioId: string): Promise<boolean> {
  try {
    getStorage()?.removeItem(`${STORAGE_KEY_PREFIX}${usuarioId}`);
    if (typeof window !== "undefined") {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        }
      }
      if (navigator.onLine) {
        await (supabase as any).from("push_suscripciones").delete().eq("usuario_id", usuarioId);
      }
    }
    return true;
  } catch {
    return false;
  }
}
