import * as React from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Mantiene la pantalla encendida mientras `activo` (API nativa, sin librerías).
 * Re-adquiere al volver la pestaña a visible. Cualquier ausencia de API o error es silencioso.
 */
export function useWakeLock(activo: boolean): void {
  React.useEffect(() => {
    if (!activo || typeof navigator === "undefined" || typeof document === "undefined") return;
    const wakeLock = (navigator as unknown as {
      wakeLock?: { request?: (tipo: "screen") => Promise<WakeLockSentinelLike> };
    }).wakeLock;
    if (!wakeLock?.request) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelado = false;

    const adquirir = async () => {
      try {
        const nuevo = await wakeLock.request!("screen");
        if (cancelado) {
          await nuevo.release().catch(() => undefined);
          return;
        }
        sentinel = nuevo;
      } catch {
        // Silencioso: sin permiso, batería baja o API no soportada.
      }
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible" && !sentinel) void adquirir();
    };
    // Al ocultarse la pestaña el navegador libera el lock: se descarta para re-adquirir luego.
    const alOcultar = () => {
      if (document.visibilityState === "hidden") sentinel = null;
    };

    void adquirir();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      document.removeEventListener("visibilitychange", alOcultar);
      const actual = sentinel;
      sentinel = null;
      void actual?.release().catch(() => undefined);
    };
  }, [activo]);
}
