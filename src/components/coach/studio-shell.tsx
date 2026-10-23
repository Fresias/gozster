"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { WorkspaceModeToggle } from "@/components/ui/workspace-mode-toggle";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isDashboardActive = pathname === "/studio/dashboard";
  const isStudioActive = pathname === "/studio";
  const isAgendaActive = pathname === "/studio/agenda";
  const isDocumentacionActive = pathname === "/studio/documentacion";
  const isAthleteActive = pathname?.startsWith("/athlete");

  const { isOnline, pendingEvents, setOnlineStatus } = useOfflineQueueStore();
  const { mode } = useWorkspaceModeStore();

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

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[280px_1fr] bg-background text-foreground transition-colors duration-150">
      <aside className="border-b border-border/80 bg-card/95 p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-6 backdrop-blur-md">
        <div className="flex flex-col gap-4 lg:gap-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-sm">
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
              <WorkspaceModeToggle />
              <ThemeToggle />
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

            {mode === "TESTEO" && (
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
            )}

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

            <button
              type="button"
              onClick={() => useCoachStudioStore.getState().setRoutineBuilderOpen(true)}
              className="inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent text-left w-full"
              data-testid="sidebar-routine-builder-btn"
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              <span>Constructor de Rutinas</span>
            </button>
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
            <WorkspaceModeToggle />
            <ThemeToggle showLabel />
          </div>
        </header>
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 ${mode === "TESTEO" ? "max-w-[1920px]" : "max-w-7xl"}`}>{children}</main>
      </div>
    </div>
  );
}
