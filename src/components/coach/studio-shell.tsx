"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { WorkspaceModeToggle } from "@/components/ui/workspace-mode-toggle";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

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
    if (isDashboardActive) return "Dashboard & Analíticas";
    if (isAgendaActive) return "Agenda de Clases";
    if (isCobrosActive) return "Cobros & Pagos";
    if (isDocumentacionActive) return "Documentación";
    if (isStudioActive) return "Atletas & Rutinas";
    return "Coach Studio";
  }, [isDashboardActive, isAgendaActive, isCobrosActive, isDocumentacionActive, isStudioActive]);

  const handleNuevaClase = () => {
    if (isAgendaActive) {
      window.dispatchEvent(new CustomEvent("gozster-open-create-class"));
    } else {
      router.push("/studio/agenda");
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("gozster-open-create-class"));
      }, 150);
    }
  };

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[248px_1fr] bg-background text-foreground transition-colors duration-150">
      <aside className="border-b border-border/80 bg-card/95 p-4 sm:p-5 lg:border-b-0 lg:border-r lg:p-4 backdrop-blur-md flex flex-col justify-between">
        <div className="flex flex-col gap-4 lg:gap-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-sm">
                G
              </span>
              <div>
                <span className="text-base sm:text-lg font-black tracking-tight text-foreground block">
                  GOZSter <span className="text-primary font-bold">Studio</span>
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
            className="flex flex-wrap gap-1 lg:w-full lg:flex-col lg:space-y-4"
          >
            {/* SECCIÓN PRINCIPAL */}
            <div className="space-y-1 w-full">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Principal
              </p>

              <Link
                href="/studio/dashboard"
                className={`flex h-10 w-full items-center rounded-lg px-2 text-sm transition-colors ${
                  isDashboardActive
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <svg
                  className={`mr-2.5 h-4 w-4 shrink-0 ${isDashboardActive ? "text-primary" : "text-muted-foreground"}`}
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
                <span className="truncate">Dashboard &amp; Analíticas</span>
              </Link>

              <Link
                href="/studio"
                className={`flex h-10 w-full items-center rounded-lg px-2 text-sm transition-colors ${
                  isStudioActive
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <svg
                  className={`mr-2.5 h-4 w-4 shrink-0 ${isStudioActive ? "text-primary" : "text-muted-foreground"}`}
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
                <span className="truncate">Atletas &amp; Rutinas</span>
              </Link>

              <Link
                href="/studio/agenda"
                className={`flex h-10 w-full items-center rounded-lg px-2 text-sm transition-colors ${
                  isAgendaActive
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <svg
                  className={`mr-2.5 h-4 w-4 shrink-0 ${isAgendaActive ? "text-primary" : "text-muted-foreground"}`}
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
                <span className="truncate">Agenda de Clases</span>
              </Link>
            </div>

            {/* SECCIÓN ADMINISTRACIÓN */}
            <div className="space-y-1 w-full">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Administración
              </p>

              <Link
                href="/studio/cobros"
                data-testid="sidebar-cobros-link"
                className={`flex h-10 w-full items-center rounded-lg px-2 text-sm transition-colors ${
                  isCobrosActive
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <svg
                  className={`mr-2.5 h-4 w-4 shrink-0 ${isCobrosActive ? "text-primary" : "text-muted-foreground"}`}
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
                <span className="truncate">Cobros &amp; Pagos</span>
              </Link>

              {mode === "TESTEO" && (
                <Link
                  href="/studio/documentacion"
                  data-testid="sidebar-documentacion-link"
                  className={`flex h-10 w-full items-center rounded-lg px-2 text-sm transition-colors ${
                    isDocumentacionActive
                      ? "bg-muted font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  <svg
                    className={`mr-2.5 h-4 w-4 shrink-0 ${isDocumentacionActive ? "text-primary" : "text-muted-foreground"}`}
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
                  <span className="truncate">Documentación</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => useCoachStudioStore.getState().setRoutineBuilderOpen(true)}
                className="flex h-10 w-full items-center rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors text-left"
                data-testid="sidebar-routine-builder-btn"
              >
                <svg
                  className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground"
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
                <span className="truncate">Constructor de Rutinas</span>
              </button>
            </div>

            {/* SECCIÓN ATLETA */}
            <div className="space-y-1 w-full">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Atleta
              </p>

              <Link
                href="/athlete"
                className={`flex h-10 w-full items-center rounded-lg px-2 text-sm transition-colors ${
                  isAthleteActive
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <svg
                  className={`mr-2.5 h-4 w-4 shrink-0 ${isAthleteActive ? "text-primary" : "text-muted-foreground"}`}
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
                <span className="truncate">Vista Atleta (PWA)</span>
              </Link>
            </div>
          </nav>
        </div>

        {/* FOOTER DEL SIDEBAR */}
        <div className="hidden lg:flex flex-col gap-3 pt-4 border-t border-border/60">
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

          {/* Switch de modo noche al pie */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">Modo noche</span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-30 hidden lg:flex h-14 items-center justify-between border-b border-border/80 bg-card/85 px-6 backdrop-blur-md gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base font-bold tracking-tight text-foreground truncate">
              {pageTitle}
            </h1>
            <span className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Panel Profesional
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Buscador w-72 h-9 */}
            <div className="relative w-72">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                placeholder="Buscar alumno, clase o rutina…"
                className="w-72 h-9 rounded-lg border border-border/80 bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                aria-label="Buscar en Studio"
              />
            </div>

            {/* Ayuda */}
            <button
              type="button"
              aria-label="Ayuda"
              title="Centro de ayuda"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Notificaciones */}
            <button
              type="button"
              aria-label="Notificaciones"
              title="Notificaciones"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>

            {/* Selector de modo */}
            <WorkspaceModeToggle />

            {/* CTA Nueva clase (h-9 bg-primary) */}
            <button
              type="button"
              onClick={handleNuevaClase}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 text-xs sm:text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all shrink-0"
              data-testid="topbar-create-class-btn"
            >
              <span>+</span> Nueva clase
            </button>
          </div>
        </header>

        <main className={`flex-1 p-4 sm:p-6 lg:p-8 ${mode === "TESTEO" ? "max-w-[1920px]" : "max-w-7xl"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
