"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/browser";
import { cerrarSesion } from "@/lib/session-scope";
import { ModeSwitcher } from "@/components/navigation/mode-switcher";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isDashboardActive = pathname === "/studio/dashboard";
  const isStudioActive = pathname === "/studio";
  const isRutinasActive = pathname === "/studio/rutinas";
  const isAgendaActive = pathname === "/studio/agenda";
  const isRankingActive = pathname === "/studio/ranking-funcional";
  const isCobrosActive = pathname === "/studio/cobros";
  const isDocumentacionActive = pathname === "/studio/documentacion";
  const isAthleteActive = pathname?.startsWith("/athlete");

  const { isOnline, pendingEvents, setOnlineStatus } = useOfflineQueueStore();

  React.useEffect(() => {
    setOnlineStatus(navigator.onLine);
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnlineStatus]);

  const [userEmail, setUserEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active && data?.user?.email) {
          setUserEmail(data.user.email);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[280px_1fr] bg-background text-foreground transition-colors duration-150">
      <aside className="border-b border-border/80 bg-card/95 p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-6 backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:gap-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex min-h-[44px] min-w-[44px] items-center gap-2.5">
              <span className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-sm">
                G
              </span>
              <div>
                <span className="text-base sm:text-lg font-black tracking-tight text-foreground block">
                  GOZSter <span className="text-primary font-bold">Studio</span>
                </span>
                <span className="text-[10px] text-muted-foreground block -mt-0.5 font-medium">
                  Executive Workspace • M3 Edition
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-2 lg:hidden">
              <ModeSwitcher current="studio" />
              <ThemeToggle />
              <button
                type="button"
                onClick={() => void cerrarSesion()}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors cursor-pointer"
                aria-label="Cerrar sesión"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            </div>
          </div>

          <nav
            aria-label="Navegación Coach Studio"
            className="flex flex-wrap gap-2 lg:w-full lg:flex-col"
          >
            <Link
              href="/studio/dashboard"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isDashboardActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <span>Dashboard &amp; Analíticas</span>
            </Link>

            <Link
              href="/studio"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isStudioActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span>Atletas &amp; Rutinas</span>
            </Link>

            <Link
              href="/studio/rutinas"
              data-testid="sidebar-routine-builder-btn"
              title="Rutinas &amp; Constructor de Rutinas"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isRutinasActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              <span>Rutinas &amp; Constructor</span>
            </Link>

            <Link
              href="/studio/agenda"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isAgendaActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>Agenda de Clases</span>
            </Link>

            <Link
              href="/studio/ranking-funcional"
              data-testid="sidebar-ranking-link"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isRankingActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.004 0V9.75m-5.004 4.5V9.75m0 0a3 3 0 013-3h.008a3 3 0 013 3m-6 0h6"
                />
              </svg>
              <span>Ranking Funcional</span>
            </Link>

            <Link
              href="/studio/cobros"
              data-testid="sidebar-cobros-link"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isCobrosActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Cobros &amp; Pagos</span>
            </Link>

            <Link
              href="/studio/documentacion"
              data-testid="sidebar-documentacion-link"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isDocumentacionActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <span>Documentación</span>
            </Link>

            <Link
              href="/athlete"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isAthleteActive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <svg
                className="mr-2.5 h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <span>Vista Atleta (PWA)</span>
            </Link>

          </nav>

          <div className="hidden lg:block mt-auto pt-6 border-t border-border/60">
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl bg-secondary/40 border border-border/40 p-3 space-y-1.5"
              data-testid="studio-sync-status"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-foreground">Sincronización GOZS</p>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all ${
                    isOnline
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300 animate-pulse"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isOnline ? "bg-emerald-500 dark:bg-emerald-400" : "bg-amber-500 dark:bg-amber-400"
                    }`}
                  />
                  {isOnline ? "GOZS Cloud" : "Modo Avión"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isOnline
                  ? pendingEvents.length > 0
                    ? `Sincronizando ${pendingEvents.length} ${pendingEvents.length === 1 ? "evento" : "eventos"} de la cola offline…`
                    : "Datos al día con GOZS Cloud."
                  : pendingEvents.length > 0
                    ? `${pendingEvents.length} ${pendingEvents.length === 1 ? "evento" : "eventos"} en cola · se sincronizarán al reconectar.`
                    : "Sin conexión · los cambios se guardan localmente."}
              </p>
            </div>

            {/* Perfil de Coach y Botón de Cerrar Sesión en Sidebar */}
            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate" title={userEmail || "Coach Studio"}>
                  {userEmail || "Coach Studio"}
                </p>
                <p className="text-[10px] text-muted-foreground">Sesión Activa</p>
              </div>
              <button
                type="button"
                onClick={() => void cerrarSesion()}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors cursor-pointer"
                aria-label="Cerrar sesión"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-30 hidden lg:flex h-14 items-center justify-between border-b border-border/80 bg-card/85 px-6 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-muted-foreground">
              Panel Profesional de Alto Rendimiento
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ModeSwitcher current="studio" />
            {userEmail && (
              <span className="text-xs font-medium text-muted-foreground max-w-[220px] truncate" title={userEmail}>
                {userEmail}
              </span>
            )}
            <ThemeToggle showLabel />
            <button
              type="button"
              onClick={() => void cerrarSesion()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-colors"
              aria-label="Cerrar sesión"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </header>
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 max-w-[1920px]`}>{children}</main>
      </div>
    </div>
  );
}
