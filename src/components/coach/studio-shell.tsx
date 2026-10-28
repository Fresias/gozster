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
  const isCobrosActive = pathname === "/studio/cobros";
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

  const pageTitle = React.useMemo(() => {
    if (isAgendaActive) return "Agenda de clases";
    if (isDashboardActive) return "Dashboard & Analíticas";
    if (isCobrosActive) return "Cobros & Pagos";
    if (isDocumentacionActive) return "Documentación";
    return "Atletas & Rutinas";
  }, [isAgendaActive, isDashboardActive, isCobrosActive, isDocumentacionActive]);

  const navItemClass = (isActive: boolean) =>
    `flex h-10 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors ${
      isActive
        ? "bg-muted font-semibold text-foreground"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    }`;

  const iconClass = (isActive: boolean) =>
    `h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`;

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[248px_1fr] bg-background text-foreground transition-colors duration-150">
      {/* SIDEBAR · 248px */}
      <aside className="border-b border-border bg-card p-3 sm:p-4 lg:border-b-0 lg:border-r lg:p-3 flex flex-col justify-between">
        <div className="flex flex-col gap-4">
          {/* Logo & Brand Header */}
          <div className="flex h-14 items-center justify-between border-b border-border px-2">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm shadow-sm">
                G
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-foreground">
                GOZSter <span className="text-muted-foreground font-medium">Studio</span>
              </span>
            </Link>
            <div className="flex items-center gap-2 lg:hidden">
              <WorkspaceModeToggle />
              <ThemeToggle />
            </div>
          </div>

          {/* Grouped Navigation */}
          <nav
            aria-label="Navegación Coach Studio"
            className="flex flex-wrap gap-1 lg:w-full lg:flex-col text-sm"
          >
            {/* Principal */}
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Principal
            </p>
            <Link
              href="/studio/dashboard"
              className={navItemClass(isDashboardActive)}
            >
              <svg
                className={iconClass(isDashboardActive)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />
              </svg>
              <span>Dashboard</span>
            </Link>

            <Link
              href="/studio"
              className={navItemClass(isStudioActive)}
            >
              <svg
                className={iconClass(isStudioActive)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <circle cx="9" cy="8" r="4" />
                <path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5" />
              </svg>
              <span>Alumnos</span>
            </Link>

            <Link
              href="/studio/agenda"
              className={navItemClass(isAgendaActive)}
            >
              <svg
                className={iconClass(isAgendaActive)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M3 9h18M8 2v4M16 2v4" />
              </svg>
              <span>Agenda de clases</span>
            </Link>

            {/* Administración */}
            <p className="px-2 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Administración
            </p>
            <Link
              href="/studio/cobros"
              data-testid="sidebar-cobros-link"
              className={navItemClass(isCobrosActive)}
            >
              <svg
                className={iconClass(isCobrosActive)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
              </svg>
              <span>Cobros</span>
            </Link>

            {mode === "TESTEO" && (
              <Link
                href="/studio/documentacion"
                data-testid="sidebar-documentacion-link"
                className={navItemClass(isDocumentacionActive)}
              >
                <svg
                  className={iconClass(isDocumentacionActive)}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <path d="M14 3v6h6" />
                </svg>
                <span>Documentación</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => useCoachStudioStore.getState().setRoutineBuilderOpen(true)}
              className="flex h-10 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors text-muted-foreground hover:bg-muted/60 hover:text-foreground text-left w-full"
              data-testid="sidebar-routine-builder-btn"
            >
              <svg
                className="h-4 w-4 shrink-0 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Constructor de Rutinas</span>
            </button>

            {/* Atleta */}
            <p className="px-2 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Atleta
            </p>
            <Link
              href="/athlete"
              className={navItemClass(isAthleteActive)}
            >
              <svg
                className={iconClass(isAthleteActive)}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
                aria-hidden="true"
              >
                <rect x="7" y="2" width="10" height="20" rx="2" />
                <path d="M11 18h2" />
              </svg>
              <span>Vista atleta</span>
            </Link>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-border pt-3 mt-4 space-y-2 text-sm">
          <div className="flex h-10 items-center justify-between rounded-lg px-2 text-muted-foreground">
            <span className="flex items-center gap-2 text-xs font-medium">
              Tema
            </span>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              LF
            </span>
            <div className="leading-tight truncate">
              <p className="text-sm font-medium text-foreground truncate">Lucía Ferraro</p>
              <p className="text-xs text-muted-foreground truncate">Coach · Sede Centro</p>
            </div>
          </div>

          <div
            role="status"
            aria-live="polite"
            className="rounded-lg bg-muted/40 border border-border/40 p-2 space-y-1"
            data-testid="studio-sync-status"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-foreground">Sincronización GOZS</p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-semibold ${
                  isOnline
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-300 animate-pulse"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOnline ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {isOnline ? "En línea" : "Modo Avión"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex min-w-0 flex-col">
        {/* Top bar · h-14 */}
        <header className="sticky top-0 z-30 hidden lg:flex h-14 items-center justify-between border-b border-border bg-card/95 px-6 backdrop-blur-md">
          <h1 className="text-[15px] font-semibold text-foreground">{pageTitle}</h1>
          <div className="flex items-center gap-2">
            <label className="flex h-9 w-72 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="truncate">Buscar alumno o clase…</span>
              <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground">/</kbd>
            </label>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Ayuda"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" />
              </svg>
            </button>
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Notificaciones"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" />
              </svg>
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>
            <div className="ml-1 flex items-center gap-2">
              <WorkspaceModeToggle />
            </div>
            {isAgendaActive && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("gozster-open-create-class"));
                }}
                className="ml-1 flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
                data-testid="topbar-create-class-btn"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Nueva clase</span>
              </button>
            )}
          </div>
        </header>

        {/* Content View */}
        <main className={`flex-1 ${mode === "TESTEO" ? "max-w-[1920px]" : "max-w-7xl"} w-full`}>
          {children}
        </main>
      </div>
    </div>
  );
}
