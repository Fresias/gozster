"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/browser";
import { cerrarSesion } from "@/lib/session-scope";
import { ModeSwitcher } from "@/components/navigation/mode-switcher";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { DEMO_GIMNASIO } from "@/services/coach-demo-dataset";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Home,
  Users,
  Calendar,
  Trophy,
  CreditCard,
  BarChart3,
  Dumbbell,
  MessageSquare,
  Menu,
  Plus,
  LogOut,
  Search,
  Smartphone,
  ChevronUp,
  FileText,
  X,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { Perfil } from "@/types/database.types";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isDashboardActive = pathname === "/studio/dashboard";
  const isStudioActive = pathname === "/studio";
  const isRutinasActive = pathname === "/studio/rutinas";
  const isAgendaActive = pathname === "/studio/agenda";
  const isRankingActive = pathname === "/studio/ranking-funcional";
  const isCobrosActive = pathname === "/studio/cobros";
  const isDocumentacionActive = pathname === "/studio/documentacion";
  const isAthleteActive = pathname?.startsWith("/athlete");

  const store = useCoachStudioStore();
  const { isOnline, pendingEvents, setOnlineStatus } = useOfflineQueueStore();
  const selectedAlumnoId = store.selectedAlumnoId;
  const selectAlumno = store.selectAlumno;
  const setChatOpen = store.setChatOpen;

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Quick search ⌘K state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = localStorage.getItem("gozster_coach_sidebar_collapsed");
        if (saved !== null) {
          setIsSidebarCollapsed(saved === "true");
        }
      } catch {}
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem("gozster_coach_sidebar_collapsed", String(next));
        } catch {}
      }
      return next;
    });
  };

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

  // Alumnos para buscador rápido
  const alumnosList = React.useMemo(() => {
    return store.alumnos && store.alumnos.length > 0
      ? store.alumnos
      : (DEMO_GIMNASIO.alumnos as Perfil[]) || [];
  }, [store.alumnos]);

  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return alumnosList
      .filter(
        (a) =>
          a.nombre_completo.toLowerCase().includes(q) ||
          (a.email && a.email.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [searchQuery, alumnosList]);

  // Manejo de atajo ⌘K / Ctrl+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setIsSearchOpen(true);
      }
      if (e.key === "Escape") {
        setIsSearchOpen(false);
        setIsAccountMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Click outside para cerrar menú de cuenta y buscador
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectAlumno = (alumno: Perfil) => {
    selectAlumno(alumno.id);
    if (pathname !== "/studio") {
      router.push("/studio");
    }
    setSearchQuery("");
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
  };

  const handleOpenAltaAlumno = () => {
    store.setInviteModalOpen(true);
    if (pathname !== "/studio") {
      router.push("/studio");
    }
  };

  // Título de la sección activa
  const sectionTitle = React.useMemo(() => {
    if (isStudioActive) return "Inicio";
    if (isRutinasActive) return "Rutinas";
    if (isAgendaActive) return "Agenda";
    if (isRankingActive) return "Ranking";
    if (isCobrosActive) return "Cobros";
    if (isDashboardActive) return "Métricas";
    if (isDocumentacionActive) return "Documentación";
    return "Studio";
  }, [
    isStudioActive,
    isRutinasActive,
    isAgendaActive,
    isRankingActive,
    isCobrosActive,
    isDashboardActive,
    isDocumentacionActive,
  ]);

  const userName = userEmail ? userEmail.split("@")[0] : "Lucía Ferraro";
  const userInitials = (userName || "LF").slice(0, 2).toUpperCase();

  return (
    <div
      className={`grid min-h-dvh grid-cols-1 ${
        isSidebarCollapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[280px_1fr]"
      } bg-background text-foreground transition-all duration-200`}
    >
      {/* Sidebar Desktop Agrupado */}
      <aside
        className={`hidden lg:flex flex-col border-r border-border/80 bg-card/95 ${
          isSidebarCollapsed ? "p-3 lg:p-2" : "p-4 sm:p-5"
        } backdrop-blur-md transition-all duration-200 overflow-x-hidden w-full max-w-full h-screen sticky top-0`}
      >
        {/* Cabecera del Sidebar */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <Link
            href="/"
            className="flex min-h-[44px] min-w-[44px] items-center gap-2.5"
            title="GOZSter Studio"
          >
            <span className="flex h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-sm">
              G
            </span>
            {!isSidebarCollapsed && (
              <div>
                <span className="text-base font-black tracking-tight text-foreground block">
                  GOZSter <span className="text-primary font-bold">Studio</span>
                </span>
                <span className="text-[10px] text-muted-foreground block -mt-0.5 font-medium">
                  Coach Studio
                </span>
              </div>
            )}
          </Link>

          {/* Botón de toggle colapsar sidebar */}
          <button
            type="button"
            onClick={toggleSidebar}
            data-testid="sidebar-toggle-btn"
            className={cn(
              "hidden lg:inline-flex min-h-9 min-w-9 items-center rounded-lg text-xs font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-all cursor-pointer",
              isSidebarCollapsed ? "justify-center px-0 w-full" : "justify-center p-2",
            )}
            title={
              isSidebarCollapsed
                ? "Expandir menú de navegación"
                : "Colapsar menú a la izquierda"
            }
            aria-label={
              isSidebarCollapsed
                ? "Expandir menú de navegación"
                : "Colapsar menú a la izquierda"
            }
          >
            <span className="font-mono text-xs">
              {isSidebarCollapsed ? "▶" : "◀"}
            </span>
            {!isSidebarCollapsed && (
              <span className="sr-only">Colapsar Menú</span>
            )}
          </button>
        </div>

        {/* Navegación agrupada por secciones */}
        <nav
          aria-label="Navegación Coach Studio"
          className="flex-1 overflow-y-auto py-4 space-y-5 lg:w-full"
        >
          {/* SECCIÓN 1: Alumnos */}
          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <p className="px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Alumnos
              </p>
            )}

            {/* 1.1 Inicio */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio"
                    onClick={() => selectAlumno(null)}
                    aria-label="Inicio"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isStudioActive && !selectedAlumnoId
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <Home className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Inicio</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Inicio
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio"
                onClick={() => selectAlumno(null)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full",
                  isStudioActive && !selectedAlumnoId
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <Home className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Inicio</span>
              </Link>
            )}

            {/* 1.2 Alumnos (Directorio con conteo) */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio"
                    onClick={() => selectAlumno(null)}
                    title="Atletas & Rutinas"
                    aria-label="Alumnos"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isStudioActive && selectedAlumnoId
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <Users className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Alumnos</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Alumnos
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio"
                onClick={() => selectAlumno(null)}
                title="Atletas & Rutinas"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full justify-between",
                  isStudioActive && selectedAlumnoId
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <div className="flex items-center">
                  <Users className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Alumnos</span>
                  <span className="hidden">
                    {!isSidebarCollapsed && <span>Atletas &amp; Rutinas</span>}
                  </span>
                </div>
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-secondary font-bold text-muted-foreground">
                  {alumnosList.length || 40}
                </span>
              </Link>
            )}

            {/* 1.3 Rutinas & Constructor */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio/rutinas"
                    data-testid="sidebar-routine-builder-btn"
                    title="Rutinas & Constructor de Rutinas"
                    aria-label="Rutinas & Constructor"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isRutinasActive
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <Dumbbell className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Rutinas &amp; Constructor</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Rutinas &amp; Constructor
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio/rutinas"
                data-testid="sidebar-routine-builder-btn"
                title="Rutinas & Constructor de Rutinas"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full",
                  isRutinasActive
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <Dumbbell className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {!isSidebarCollapsed && <span>Rutinas &amp; Constructor</span>}
              </Link>
            )}
          </div>

          {/* SECCIÓN 2: Operación */}
          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <p className="px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Operación
              </p>
            )}

            {/* 2.1 Agenda */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio/agenda"
                    aria-label="Agenda de Clases"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isAgendaActive
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <Calendar className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Agenda de Clases</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Agenda de Clases
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio/agenda"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full",
                  isAgendaActive
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <Calendar className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {!isSidebarCollapsed && <span>Agenda de Clases</span>}
              </Link>
            )}

            {/* 2.2 Ranking */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio/ranking-funcional"
                    data-testid="sidebar-ranking-link"
                    aria-label="Ranking Funcional"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isRankingActive
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <Trophy className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Ranking Funcional</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Ranking Funcional
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio/ranking-funcional"
                data-testid="sidebar-ranking-link"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full",
                  isRankingActive
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <Trophy className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Ranking Funcional</span>
              </Link>
            )}
          </div>

          {/* SECCIÓN 3: Negocio */}
          <div className="space-y-1">
            {!isSidebarCollapsed && (
              <p className="px-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Negocio
              </p>
            )}

            {/* 3.1 Cobros */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio/cobros"
                    data-testid="sidebar-cobros-link"
                    aria-label="Cobros & Pagos"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isCobrosActive
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <CreditCard className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Cobros &amp; Pagos</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Cobros &amp; Pagos
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio/cobros"
                data-testid="sidebar-cobros-link"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full justify-between",
                  isCobrosActive
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <div className="flex items-center">
                  <CreditCard className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Cobros &amp; Pagos</span>
                </div>
                <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-secondary font-bold text-muted-foreground">
                  7
                </span>
              </Link>
            )}

            {/* 3.2 Métricas */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio/dashboard"
                    data-testid="sidebar-metricas-link"
                    aria-label="Métricas & Retención"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isDashboardActive
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <BarChart3 className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Métricas &amp; Retención</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Métricas &amp; Retención
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio/dashboard"
                data-testid="sidebar-metricas-link"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full",
                  isDashboardActive
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <BarChart3 className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {!isSidebarCollapsed && <span>Métricas &amp; Retención</span>}
              </Link>
            )}

            {/* 3.3 Documentación */}
            {isSidebarCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/studio/documentacion"
                    data-testid="sidebar-documentacion-link"
                    aria-label="Documentación"
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all justify-center px-0 w-full",
                      isDocumentacionActive
                        ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                    )}
                  >
                    <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Documentación</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" align="center">
                  Documentación
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                href="/studio/documentacion"
                data-testid="sidebar-documentacion-link"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl text-xs sm:text-sm font-semibold transition-all px-3 py-2 w-full",
                  isDocumentacionActive
                    ? "bg-primary/10 text-primary border border-primary/30 shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <FileText className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Documentación</span>
              </Link>
            )}
          </div>
        </nav>

        {/* Pie del Sidebar: Vista Atleta + Sincronización + Menú de Cuenta */}
        <div className="mt-auto pt-3 border-t border-border/60 flex flex-col gap-2">
          {/* Enlace Vista Atleta (PWA) */}
          {isSidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/athlete"
                  aria-label="Vista Atleta (PWA)"
                  className={cn(
                    "inline-flex min-h-10 items-center rounded-xl text-xs font-semibold transition-all justify-center px-0 w-full",
                    isAthleteActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                  )}
                >
                  <Smartphone className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">Vista Atleta (PWA)</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Vista Atleta (PWA)
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/athlete"
              className={cn(
                "inline-flex min-h-10 items-center rounded-xl text-xs font-semibold transition-all px-3 py-2 w-full",
                isAthleteActive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
              )}
            >
              <Smartphone className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Vista Atleta (PWA)</span>
            </Link>
          )}

          {/* Sincronización GOZS */}
          {!isSidebarCollapsed && (
            <div
              role="status"
              aria-live="polite"
              data-testid="studio-sync-status"
              className="rounded-xl bg-secondary/30 border border-border/40 p-2.5 text-[10px]"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">Sincronización</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                    isOnline
                      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "text-amber-600 dark:text-amber-300 bg-amber-500/15 animate-pulse",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isOnline ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  {isOnline ? "Cloud" : "Offline"}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 truncate">
                {isOnline
                  ? pendingEvents.length > 0
                    ? `Sincronizando ${pendingEvents.length} eventos…`
                    : "Datos al día con GOZS Cloud."
                  : "Modo Avión: cambios en cola local."}
              </p>
            </div>
          )}

          {/* MENÚ DE CUENTA CON UN ÚNICO CONTROL ACCESIBLE 'Cerrar sesión' */}
          <div
            ref={accountMenuRef}
            data-testid="studio-account-menu"
            aria-label="Menú de cuenta"
            className="relative w-full"
          >
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
              aria-expanded={isAccountMenuOpen}
              aria-haspopup="true"
              aria-label="Menú de cuenta"
              className={cn(
                "flex items-center gap-2.5 w-full rounded-xl p-2 hover:bg-secondary/60 transition-colors cursor-pointer text-left border border-border/50",
                isSidebarCollapsed ? "justify-center px-0" : "px-2.5",
              )}
            >
              <Avatar className="h-8 w-8 ring-1 ring-border/70 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!isSidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p
                    className="text-xs font-semibold text-foreground truncate"
                    title={userName}
                  >
                    {userName}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isOnline ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    <span>{isOnline ? "Sincronizado" : "Modo Avión"}</span>
                  </div>
                </div>
              )}
              {!isSidebarCollapsed && (
                <ChevronUp
                  className={cn(
                    "h-4 w-4 text-muted-foreground shrink-0 ml-auto transition-transform",
                    isAccountMenuOpen && "rotate-180",
                  )}
                />
              )}
            </button>

            {/* Menú desplegable con el único control de Cerrar sesión */}
            <div
              role="menu"
              aria-label="Opciones de cuenta"
              className={cn(
                "absolute z-50 rounded-xl border border-border/80 bg-popover p-2 text-popover-foreground shadow-xl transition-all",
                isSidebarCollapsed
                  ? "left-full bottom-0 ml-2 w-64"
                  : "left-0 right-0 bottom-full mb-2",
                !isAccountMenuOpen && "hidden",
              )}
            >
              <div className="px-2 py-1.5 mb-1">
                <p className="text-xs font-bold text-foreground truncate">
                  {userName}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {userEmail || "coach@gozster.ar"}
                </p>
                <span className="inline-flex items-center gap-1.5 mt-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {isOnline
                    ? "GOZS Cloud · Sincronizado"
                    : "Modo Avión (offline)"}
                </span>
              </div>
              <div className="my-1.5 h-px bg-border/60" />
              <div className="px-2 py-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Modo</span>
                <ModeSwitcher current="studio" />
              </div>
              <div className="px-2 py-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Tema</span>
                <ThemeToggle />
              </div>
              <div className="my-1.5 h-px bg-border/60" />
              <button
                type="button"
                role="menuitem"
                onClick={() => void cerrarSesion()}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Área Principal de Contenido + Topbar + Barra Inferior Móvil */}
      <div className="flex flex-col min-w-0">
        {/* Topbar Desktop (lg+) con ⌘K y 'Alta de alumno' */}
        <header className="sticky top-0 z-30 hidden lg:flex h-14 items-center justify-between border-b border-border/80 bg-card/85 px-6 backdrop-blur-md">
          {/* Breadcrumb / Título de Sección */}
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-bold text-foreground tracking-tight">
              {sectionTitle}
            </h1>
          </div>

          {/* Centro / Derecha: Buscador rápido ⌘K + Acciones */}
          <div className="flex items-center gap-3">
            {/* Buscador ⌘K */}
            <div className="relative w-72 sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (searchResults.length > 0) {
                      handleSelectAlumno(searchResults[0]!);
                    }
                  } else if (e.key === "Escape") {
                    setIsSearchOpen(false);
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder="Buscar alumno, rutina, clase... ⌘K"
                data-testid="studio-quick-search-input"
                className="w-full h-9 pl-8 pr-12 rounded-lg border border-border/80 bg-background/80 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                aria-label="Buscar alumno"
                role="combobox"
                aria-expanded={isSearchOpen && searchResults.length > 0}
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shadow-2xs">
                ⌘K
              </kbd>

              {/* Menú de resultados de búsqueda */}
              {isSearchOpen && searchResults.length > 0 && (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border/80 bg-popover shadow-xl overflow-hidden p-1 max-h-72 overflow-y-auto animate-in fade-in-80 zoom-in-95"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Alumnos encontrados
                  </div>
                  {searchResults.map((alumno) => (
                    <button
                      key={alumno.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => handleSelectAlumno(alumno)}
                      data-testid={`search-result-${alumno.id}`}
                      className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-xs hover:bg-secondary/80 transition-colors cursor-pointer"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        {alumno.nombre_completo.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate">
                          {alumno.nombre_completo}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {alumno.email || "Alumno"}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        Ficha ↵
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ThemeToggle />

            {/* Botón primario: Alta de alumno */}
            <Button
              variant="default"
              size="sm"
              onClick={handleOpenAltaAlumno}
              data-testid="topbar-alta-alumno-btn"
              className="min-h-9 gap-1.5 rounded-lg text-xs font-bold"
              title="Dar de alta a un nuevo alumno"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Alta de alumno</span>
            </Button>
          </div>
        </header>

        {/* Cabecera Móvil (viewports < lg) */}
        <header className="sticky top-0 z-30 lg:hidden flex h-14 items-center justify-between border-b border-border/80 bg-card/95 px-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs">
              G
            </span>
            <span className="text-sm font-bold text-foreground">
              {sectionTitle}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Buscador rápido móvil */}
            <button
              type="button"
              onClick={() => {
                const query = window.prompt("Buscar alumno por nombre o email:");
                if (query && query.trim()) {
                  const match = alumnosList.find(
                    (a) =>
                      a.nombre_completo
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()) ||
                      (a.email &&
                        a.email
                          .toLowerCase()
                          .includes(query.trim().toLowerCase())),
                  );
                  if (match) {
                    handleSelectAlumno(match);
                  } else {
                    window.alert("No se encontró ningún alumno con ese nombre.");
                  }
                }
              }}
              data-testid="mobile-search-btn"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-secondary cursor-pointer"
              aria-label="Buscar alumno"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Avatar móvil que abre el Sheet 'Más' */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-border text-xs font-bold bg-primary/10 text-primary cursor-pointer"
              aria-label="Menú de navegación y cuenta"
            >
              {userInitials}
            </button>
          </div>
        </header>

        {/* Contenido principal de la página */}
        <main
          className="flex-1 w-full min-w-0 max-w-full p-4 sm:p-6 lg:p-8 max-w-[1920px] pb-24 lg:pb-8 overflow-x-hidden"
        >
          {children}
        </main>
      </div>

      {/* BARRA INFERIOR MÓVIL (viewports < lg) - 5 accesos ergonómicos táctiles */}
      <nav
        aria-label="Navegación inferior móvil"
        data-testid="studio-mobile-bottom-nav"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 border-t border-border/80 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {/* 1. Inicio */}
          <Link
            href="/studio"
            onClick={() => selectAlumno(null)}
            className={cn(
              "flex flex-col items-center justify-center min-h-[44px] gap-1 text-[11px] font-medium transition-colors touch-manipulation",
              isStudioActive && !selectedAlumnoId
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Inicio"
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            <span>Inicio</span>
          </Link>

          {/* 2. Alumnos */}
          <Link
            href="/studio"
            onClick={() => selectAlumno(null)}
            className={cn(
              "flex flex-col items-center justify-center min-h-[44px] gap-1 text-[11px] font-medium transition-colors touch-manipulation",
              isStudioActive && selectedAlumnoId
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Alumnos"
          >
            <Users className="h-5 w-5" aria-hidden="true" />
            <span>Alumnos</span>
          </Link>

          {/* 3. Agenda */}
          <Link
            href="/studio/agenda"
            className={cn(
              "flex flex-col items-center justify-center min-h-[44px] gap-1 text-[11px] font-medium transition-colors touch-manipulation",
              isAgendaActive
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Agenda"
          >
            <Calendar className="h-5 w-5" aria-hidden="true" />
            <span>Agenda</span>
          </Link>

          {/* 4. Mensajes */}
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="flex flex-col items-center justify-center min-h-[44px] gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors touch-manipulation cursor-pointer relative"
            aria-label="Mensajes"
          >
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
            <span>Mensajes</span>
          </button>

          {/* 5. Más */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center min-h-[44px] gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors touch-manipulation cursor-pointer"
            aria-label="Más"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {/* Sheet lateral/inferior 'Más' para móvil */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 lg:hidden bg-card"
        >
          <SheetHeader className="pb-3 border-b border-border/60">
            <SheetTitle className="text-base font-bold text-foreground">
              Menú de Coach Studio
            </SheetTitle>
          </SheetHeader>

          <div className="py-4 space-y-5">
            {/* Sección Operación */}
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Operación &amp; Rutinas
              </p>
              <Link
                href="/studio/rutinas"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 p-2.5 rounded-lg text-sm font-semibold hover:bg-secondary/60 transition-colors"
              >
                <Dumbbell className="h-4 w-4 text-muted-foreground" />
                <span>Rutinas &amp; Constructor</span>
              </Link>
              <Link
                href="/studio/ranking-funcional"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 p-2.5 rounded-lg text-sm font-semibold hover:bg-secondary/60 transition-colors"
              >
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span>Ranking Funcional</span>
              </Link>
            </div>

            {/* Sección Negocio */}
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Negocio &amp; Gestión
              </p>
              <Link
                href="/studio/cobros"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 p-2.5 rounded-lg text-sm font-semibold hover:bg-secondary/60 transition-colors"
              >
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span>Cobros &amp; Pagos</span>
              </Link>
              <Link
                href="/studio/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 p-2.5 rounded-lg text-sm font-semibold hover:bg-secondary/60 transition-colors"
              >
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span>Métricas &amp; Retención</span>
              </Link>
              <Link
                href="/studio/documentacion"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 p-2.5 rounded-lg text-sm font-semibold hover:bg-secondary/60 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Documentación</span>
              </Link>
            </div>

            {/* Accesos rápidos */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenAltaAlumno();
                }}
                className="w-full justify-center min-h-10 text-xs font-bold"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                <span>Alta de alumno</span>
              </Button>
              <Link
                href="/athlete"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 p-2.5 rounded-lg text-xs font-semibold border border-border/80 hover:bg-secondary/60 transition-colors text-muted-foreground"
              >
                <Smartphone className="h-4 w-4" />
                <span>Ir a Vista Atleta (PWA)</span>
              </Link>
            </div>

            {/* Configuración de cuenta y sincronización */}
            <div className="pt-2 border-t border-border/60 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tema visual</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Modo</span>
                <ModeSwitcher current="studio" />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
