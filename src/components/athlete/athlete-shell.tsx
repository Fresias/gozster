"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { repararSesionesNoUuid, useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { activarUsuarioStorage, cerrarSesion } from "@/lib/session-scope";
import { getStorageUser } from "@/lib/user-storage";
import { createClient } from "@/lib/supabase/browser";
import { AthleteThemeButton } from "@/components/athlete/athlete-theme-button";
import { ModeSwitcher } from "@/components/navigation/mode-switcher";
import { cn } from "@/lib/utils";
import { Calendar, Dumbbell, History, LogOut, TrendingUp } from "@/components/athlete/icons";

const SECCIONES = [
  { href: "/athlete", label: "Entrenar", Icon: Dumbbell },
  { href: "/athlete/historial", label: "Historial", Icon: History },
  { href: "/athlete/progreso", label: "Progreso", Icon: TrendingUp },
  { href: "/athlete/clases", label: "Clases", Icon: Calendar },
] as const;

const SERIES_SET_ACTIONS = new Set(["WORKOUT_SET_COMPLETED", "WORKOUT_SET_UPDATED"]);

export interface EstadoChipRed {
  texto: string;
  ariaLabel: string;
  esOff: boolean;
}

/**
 * Calcula texto, etiqueta accesible y estilo del chip de red v7 (4 estados).
 */
export function estadoChipRed(
  isOnline: boolean,
  pendingSeriesCount: number,
  syncingSeriesCount: number,
): EstadoChipRed {
  if (syncingSeriesCount > 0) {
    const palabra = syncingSeriesCount === 1 ? "serie" : "series";
    const texto = `Enviando ${syncingSeriesCount} ${palabra}…`;
    return { texto, ariaLabel: texto, esOff: true };
  }
  if (!isOnline) {
    if (pendingSeriesCount > 0) {
      const palabra = pendingSeriesCount === 1 ? "serie" : "series";
      const texto = `Sin señal · ${pendingSeriesCount} ${palabra}`;
      const guardadas = pendingSeriesCount === 1 ? "serie guardada" : "series guardadas";
      return {
        texto,
        ariaLabel: `Sin señal, ${pendingSeriesCount} ${guardadas} en el teléfono`,
        esOff: true,
      };
    }
    return {
      texto: "Sin señal · se guarda igual",
      ariaLabel: "Sin señal · se guarda igual",
      esOff: true,
    };
  }
  return { texto: "Online", ariaLabel: "Online", esOff: false };
}

function ControlesSesion({
  isOnline,
  pendingSeriesCount,
  syncingSeriesCount,
}: {
  isOnline: boolean;
  pendingSeriesCount: number;
  syncingSeriesCount: number;
}) {
  const chip = estadoChipRed(isOnline, pendingSeriesCount, syncingSeriesCount);

  return (
    <>
      <span
        data-testid="chip-red"
        role="status"
        aria-live="polite"
        aria-label={chip.ariaLabel}
        className={cn("a-net a-t-sec", chip.esOff && "a-off")}
      >
        <i aria-hidden="true" />
        {chip.texto}
      </span>
      <AthleteThemeButton />
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="a-icon-btn"
        aria-label="Cerrar sesión"
      >
        <LogOut width={18} height={18} className="a-i" />
        <span className="sr-only">Cerrar Sesión</span>
      </button>
    </>
  );
}

export async function activarYSincronizarAlAbrir(alActivar?: () => void): Promise<void> {
  try {
    const { data } = await createClient().auth.getUser();
    if (data.user) {
      await activarUsuarioStorage(data.user.id);
    }
    alActivar?.();
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      await useAthleteStore.getState().sincronizarNombrePreferidoPendiente();
      if (data.user) {
        await useAthleteStore.getState().flushMolestiasPendientes();
        await useAthleteStore.getState().cargarMolestiasDeSesion();
        await useAthleteStore.getState().sincronizarVideosPendientes(data.user.id);
      }
    }
  } catch {
    // Silencioso en modo offline o sin sesión
    alActivar?.();
  }
}

export async function manejarReconexionOnline(flushQueue: () => Promise<void>): Promise<void> {
  void flushQueue();
  void useAthleteStore.getState().sincronizarNombrePreferidoPendiente();
  const userId = getStorageUser();
  if (userId) {
    await useAthleteStore.getState().sincronizarVideosPendientes(userId);
    return;
  }
  try {
    const { data } = await createClient().auth.getUser();
    if (data.user) {
      await useAthleteStore.getState().sincronizarVideosPendientes(data.user.id);
    }
  } catch {
    // Silencioso si no hay sesión activa
  }
}

export function AthleteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isOnline, pendingEvents, setOnlineStatus, flushQueue } = useOfflineQueueStore();
  const restTimerActive = useAthleteStore((s) => s.restTimer.isActive);
  const reparadoRef = React.useRef(false);
  const [syncingSeriesCount, setSyncingSeriesCount] = React.useState(0);

  const pendingSeriesCount = React.useMemo(
    () => pendingEvents.filter((ev) => SERIES_SET_ACTIONS.has(ev.action)).length,
    [pendingEvents],
  );

  // Aísla la persistencia local por usuario: se rehidrata solo con los datos del alumno autenticado.
  React.useEffect(() => {
    const repararUnaVez = () => {
      if (reparadoRef.current) return;
      reparadoRef.current = true;
      repararSesionesNoUuid();
    };
    void activarYSincronizarAlAbrir(repararUnaVez);
  }, []);

  React.useEffect(() => {
    const flushConIndicador = async () => {
      const count = useOfflineQueueStore
        .getState()
        .pendingEvents.filter((ev) => SERIES_SET_ACTIONS.has(ev.action)).length;
      if (count > 0) setSyncingSeriesCount(count);
      try {
        await flushQueue();
      } finally {
        setSyncingSeriesCount(0);
      }
    };

    const online = navigator.onLine;
    setOnlineStatus(online);
    if (online) {
      if (useOfflineQueueStore.getState().pendingEvents.length > 0) {
        void flushConIndicador();
      }
      void useAthleteStore.getState().sincronizarNombrePreferidoPendiente();
      void useAthleteStore
        .getState()
        .flushMolestiasPendientes()
        .then(() => useAthleteStore.getState().cargarMolestiasDeSesion());
    }
    const handleOnline = () => {
      setOnlineStatus(true);
      void manejarReconexionOnline(flushConIndicador);
      void useAthleteStore.getState().flushMolestiasPendientes();
    };
    const handleOffline = () => setOnlineStatus(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnlineStatus, flushQueue]);

  return (
    <div
      className={cn(
        "theme-athlete a-app bg-background text-foreground",
        restTimerActive && "a-has-rest",
      )}
    >
      <div className="a-chev" aria-hidden="true" />
      <div className="a-scroll">
        <header className="a-ahead">
          <Link
            href="/"
            aria-label="GOZS Athlete, ir al inicio"
            className="inline-flex min-h-11 items-center"
          >
            <img src="/brand/gozs-logo-negro.png" alt="" className="a-logo dark:hidden" />
            <img src="/brand/gozs-logo-blanco.png" alt="" className="a-logo hidden dark:block" />
          </Link>
          <ControlesSesion
            isOnline={isOnline}
            pendingSeriesCount={pendingSeriesCount}
            syncingSeriesCount={syncingSeriesCount}
          />
        </header>

        <ModeSwitcher
          current="athlete"
          showReturnButton={true}
          className="mt-2 w-full justify-between rounded-xl border border-border bg-card px-4 py-2"
        />

        <main className="mt-3 space-y-4">
          {children}
        </main>
      </div>

      {/* Navegación temporal hasta CP2 */}
      <nav
        aria-label="Secciones Athlete"
        className="grid grid-cols-4 gap-1.5 border-t border-border bg-card px-2 py-2"
      >
        {SECCIONES.map(({ href, label, Icon }) => {
          const activo = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors",
                activo
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="hidden size-5 sm:block" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
