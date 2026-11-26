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
import { Check, LogOut, MessageSquare, PlaneAndroid, PlaneIos, Trophy } from "@/components/athlete/icons";
import { detectPhoneOS, type PhoneOS } from "@/components/athlete/instalar-app-card";

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

export interface IndicadorEstadoRedProps {
  isOnline: boolean;
  pendingSeriesCount: number;
  syncingSeriesCount: number;
  phoneOsOverride?: PhoneOS;
  initialPopoverOpen?: boolean;
}

/**
 * Indicador mínimo Online / Modo avión (1 ícono 18×18 px en botón 44×44 px) + popover explicativo.
 */
export function IndicadorEstadoRed({
  isOnline,
  pendingSeriesCount,
  syncingSeriesCount,
  phoneOsOverride,
  initialPopoverOpen = false,
}: IndicadorEstadoRedProps) {
  const chip = estadoChipRed(isOnline, pendingSeriesCount, syncingSeriesCount);
  const [phoneOS, setPhoneOS] = React.useState<PhoneOS>(() => phoneOsOverride ?? detectPhoneOS());
  const [popoverOpen, setPopoverOpen] = React.useState(initialPopoverOpen);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setPhoneOS(phoneOsOverride ?? detectPhoneOS());
  }, [phoneOsOverride]);

  React.useEffect(() => {
    if (!popoverOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) {
        setPopoverOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopoverOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen]);

  const activeOs = phoneOsOverride ?? phoneOS;
  const PlaneIcon = activeOs === "android" ? PlaneAndroid : PlaneIos;

  return (
    <div ref={wrapRef} className="a-net-wrap">
      <button
        ref={buttonRef}
        type="button"
        data-testid="chip-red"
        aria-label={chip.ariaLabel}
        aria-expanded={popoverOpen}
        aria-haspopup="dialog"
        onClick={() => setPopoverOpen((prev) => !prev)}
        className={cn("a-net-btn", chip.esOff && "a-off")}
      >
        {isOnline ? (
          <span className="a-net-dot" aria-hidden="true" data-testid="online-dot-icon" />
        ) : (
          <PlaneIcon
            width={18}
            height={18}
            className="a-i"
            data-testid={activeOs === "android" ? "plane-icon-android" : "plane-icon-ios"}
          />
        )}
      </button>

      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Estado de conexión"
          className="a-net-popover"
          data-testid="network-status-popover"
        >
          <div className="a-net-pop-row">
            <span className="a-net-pop-ic" aria-hidden="true">
              <span className="a-net-pop-dot" />
            </span>
            <div>
              <b className="a-t-bs block">En línea</b>
              <small className="a-t-sec a-muted">
                Tus series se guardan y sincronizan al instante.
              </small>
            </div>
          </div>

          <div className="a-net-pop-row">
            <span className="a-net-pop-ic" aria-hidden="true">
              <PlaneIcon width={15} height={15} className="a-i" />
            </span>
            <div>
              <b className="a-t-bs block">Modo avión</b>
              <small className="a-t-sec a-muted">
                Entrenás igual: se guarda en el teléfono y se envía al volver.
              </small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
  return (
    <>
      <IndicadorEstadoRed
        isOnline={isOnline}
        pendingSeriesCount={pendingSeriesCount}
        syncingSeriesCount={syncingSeriesCount}
      />
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
  const queueSyncingCount = useOfflineQueueStore((s) => s.syncingSeriesCount);
  const isSyncingSession = useAthleteStore((s) => s.syncingSessionId !== null);

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
  const syncingSeriesCount = queueSyncingCount || (isSyncingSession ? pendingSeriesCount : 0);

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
    const online = navigator.onLine;
    setOnlineStatus(online);
    if (online) {
      if (useOfflineQueueStore.getState().pendingEvents.length > 0) {
        void flushQueue();
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
      void manejarReconexionOnline(flushQueue);
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
            href="/athlete"
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
