"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_ATHLETE_ID, repararSesionesNoUuid, useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { activarUsuarioStorage, cerrarSesion } from "@/lib/session-scope";
import { getStorageUser } from "@/lib/user-storage";
import { createClient } from "@/lib/supabase/browser";
import { AthleteThemeButton } from "@/components/athlete/athlete-theme-button";
import { AthleteBottomNav } from "@/components/athlete/athlete-bottom-nav";
import { useChatStore } from "@/store/use-chat-store";
import { cn } from "@/lib/utils";
import { Check, LogOut, MessageSquare, Trophy } from "@/components/athlete/icons";

const SERIES_SET_ACTIONS = new Set(["WORKOUT_SET_COMPLETED", "WORKOUT_SET_UPDATED"]);

/**
 * Decide si ocultar navegación inferior y FAB de chat (rutina, ejercicio, cierre, onboarding, cuestionario).
 */
export function debeOcultarNavegacion(params: {
  pathname: string;
  onboardingCompletado: boolean;
  diaActivoId: string | null;
  ejercicioAbiertoId: string | null;
  cierreAbierto: boolean;
  cuestionarioAbierto: boolean;
}): boolean {
  if (!params.onboardingCompletado && params.pathname === "/athlete") return true;
  if (params.cierreAbierto) return true;
  if (params.cuestionarioAbierto || params.pathname.startsWith("/athlete/cuestionario")) {
    return true;
  }
  if (
    params.pathname === "/athlete" &&
    (params.diaActivoId !== null || params.ejercicioAbiertoId !== null)
  ) {
    return true;
  }
  return false;
}

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
      await useAthleteStore.getState().sincronizarOnboardingPendiente();
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
  void useAthleteStore.getState().sincronizarOnboardingPendiente();
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
  const pathname = usePathname() ?? "/athlete";
  const { isOnline, pendingEvents, setOnlineStatus, flushQueue } = useOfflineQueueStore();
  const restTimerActive = useAthleteStore((s) => s.restTimer.isActive);
  const onboardingCompletado = useAthleteStore((s) => s.onboardingCompletado);
  const diaActivoId = useAthleteStore((s) => s.diaActivoId);
  const ejercicioAbiertoId = useAthleteStore((s) => s.ejercicioAbiertoId);
  const cierreAbierto = useAthleteStore((s) => s.cierreAbierto);
  const cuestionarioAbierto = useAthleteStore((s) => s.cuestionarioAbierto);
  const toastSesion = useAthleteStore((s) => s.toastSesion);
  const setToastSesion = useAthleteStore((s) => s.setToastSesion);
  const planAlumnoId = useAthleteStore((s) => s.planAlumno?.alumnos[0]?.id);
  const sessionStudentId = useAthleteStore((s) =>
    s.currentSession.studentId && s.currentSession.studentId !== DEFAULT_ATHLETE_ID
      ? s.currentSession.studentId
      : undefined,
  );
  const [authUserId, setAuthUserId] = React.useState<string | null>(() => getStorageUser());
  const resolvedAlumnoId = authUserId || planAlumnoId || sessionStudentId || undefined;
  const { getUnreadStaffCount, isAthleteChatOpen, setAthleteChatOpen } = useChatStore();
  const unreadChatCount = getUnreadStaffCount(resolvedAlumnoId);
  const reparadoRef = React.useRef(false);
  const [syncingSeriesCount, setSyncingSeriesCount] = React.useState(0);

  const ocultarNav = debeOcultarNavegacion({
    pathname,
    onboardingCompletado,
    diaActivoId,
    ejercicioAbiertoId,
    cierreAbierto,
    cuestionarioAbierto,
  });

  const pendingSeriesCount = React.useMemo(
    () => pendingEvents.filter((ev) => SERIES_SET_ACTIONS.has(ev.action)).length,
    [pendingEvents],
  );

  // Aísla la persistencia local por usuario: se rehidrata solo con los datos del alumno autenticado.
  React.useEffect(() => {
    let active = true;
    const repararUnaVez = () => {
      if (reparadoRef.current) return;
      reparadoRef.current = true;
      repararSesionesNoUuid();
    };
    void activarYSincronizarAlAbrir(repararUnaVez).then(() => {
      const storedUser = getStorageUser();
      if (active && storedUser) {
        setAuthUserId(storedUser);
        return;
      }
      void createClient()
        .auth.getUser()
        .then(({ data }) => {
          if (active && data?.user?.id) {
            setAuthUserId(data.user.id);
          }
        })
        .catch(() => {});
    });
    return () => {
      active = false;
    };
  }, []);

  // Sincroniza mensajes reales y suscribe a Supabase Realtime (INSERT/UPDATE en public.mensajes)
  React.useEffect(() => {
    if (!resolvedAlumnoId) return;
    if (isOnline) {
      void useChatStore.getState().syncWithSupabase(resolvedAlumnoId);
    }
    const unsubscribe = useChatStore.getState().subscribeToRealtime(resolvedAlumnoId);
    return () => {
      unsubscribe();
    };
  }, [resolvedAlumnoId, isOnline]);

  React.useEffect(() => {
    if (!toastSesion) return;
    const timer = window.setTimeout(() => {
      setToastSesion(null);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [toastSesion, setToastSesion]);

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
      void useAthleteStore.getState().sincronizarOnboardingPendiente();
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
        ocultarNav && "a-no-nav",
      )}
    >
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

        <main className="mt-3 space-y-4">
          {children}
        </main>
      </div>

      {!ocultarNav && <AthleteBottomNav />}
      {!ocultarNav && pathname === "/athlete" && (
        <button
          type="button"
          onClick={() => setAthleteChatOpen(!isAthleteChatOpen)}
          aria-expanded={isAthleteChatOpen}
          aria-controls="athlete-chat-drawer"
          aria-label={
            unreadChatCount === 0
              ? "Chat con el coach"
              : unreadChatCount === 1
                ? "Chat con el coach, 1 mensaje nuevo"
                : `Chat con el coach, ${unreadChatCount} mensajes nuevos`
          }
          className="a-fab"
          data-testid="athlete-chat-fab"
        >
          <MessageSquare width={24} height={24} className="a-i" />
          {unreadChatCount > 0 && (
            <b
              data-testid="unread-chat-badge"
              aria-label={`${unreadChatCount} mensajes no leídos del equipo GOZS`}
            >
              {unreadChatCount}
            </b>
          )}
        </button>
      )}
      {toastSesion && (
        <div
          role="status"
          aria-live="polite"
          data-testid="toast-sesion"
          className={cn(
            "a-toast a-t-sec a-show",
            toastSesion.tipo === "ok" && "a-ok",
            toastSesion.tipo === "rec" && "a-rec",
          )}
        >
          {toastSesion.tipo === "ok" && (
            <span className="a-tic">
              <Check width={16} height={16} className="a-i" />
            </span>
          )}
          {toastSesion.tipo === "rec" && (
            <span className="a-tic">
              <Trophy width={16} height={16} className="a-i" />
            </span>
          )}
          <span>{toastSesion.mensaje}</span>
        </div>
      )}
    </div>
  );
}
