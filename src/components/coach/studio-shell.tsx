"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { createClient } from "@/lib/supabase/browser";
import { cerrarSesion } from "@/lib/session-scope";
import { ModeSwitcher } from "@/components/navigation/mode-switcher";
import { ChatFab } from "@/components/coach/chat-fab";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useChatStore } from "@/store/use-chat-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useCobrosStore } from "@/store/use-cobros-store";
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
  const conversations = useChatStore((s) => s.conversations);
  const { isOnline, setOnlineStatus } = useOfflineQueueStore();
  const selectedAlumnoId = store.selectedAlumnoId;
  const selectAlumno = store.selectAlumno;
  const setChatOpen = store.setChatOpen;
  const isChatOpen = store.isChatOpen;
  const chatAlumnoId = store.chatAlumnoId;

  const unreadMessagesCount = React.useMemo(() => {
    return Object.values(conversations || {}).reduce(
      (sum, c) => sum + (c.unreadCount || 0),
      0
    );
  }, [conversations]);

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
  // Badge de Cobros: cuotas vencidas del mismo store que usa la vista Cobros (sin números fijos).
  const cuotasVencidasCount = useCobrosStore((s) => s.cobros.filter((c) => c.estado === "VENCIDO").length);

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
  const selectedAlumno = React.useMemo(
    () => alumnosList.find((a) => a.id === selectedAlumnoId) || null,
    [alumnosList, selectedAlumnoId]
  );
  const activeChatAlumno = React.useMemo(
    () => alumnosList.find((a) => a.id === chatAlumnoId) || null,
    [alumnosList, chatAlumnoId]
  );

  return (
    <div
      className={cn(
        "grid min-h-dvh grid-cols-1 md:grid-cols-[56px_1fr] bg-background text-foreground transition-colors",
        isSidebarCollapsed ? "lg:grid-cols-[56px_1fr]" : "lg:grid-cols-[240px_1fr]"
      )}
    >
      {/* Sidebar Desktop (240px) y Tablet (56px colapsado con Tooltips) */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar py-4 transition-all duration-150 overflow-x-hidden h-screen sticky top-0",
          isSidebarCollapsed ? "w-14 px-2" : "w-14 lg:w-60 px-2 lg:px-3"
        )}
      >
        {/* Cabecera del Sidebar: cuadrado 32px con G 14/700 + GOZSter 14/600 + Coach Studio 12 */}
        <div className="flex items-center justify-between px-2 pb-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 min-w-0"
            title="GOZSter Coach Studio"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-[14px]">
              G
            </span>
            {!isSidebarCollapsed && (
              <div className="hidden lg:flex flex-col min-w-0">
                <span className="text-[14px] leading-tight font-semibold text-foreground truncate">
                  GOZSter
                </span>
                <span className="text-xs leading-tight text-muted-foreground truncate">
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
              "hidden lg:inline-flex size-8 items-center justify-center rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer shrink-0",
              isSidebarCollapsed && "mx-auto"
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
          </button>
        </div>

        {/* Navegación agrupada por secciones (16px entre grupos, sentence case) */}
        <nav
          aria-label="Navegación Coach Studio"
          className="flex-1 overflow-y-auto py-2 space-y-4 w-full"
        >
          {/* SECCIÓN 1: Alumnos */}
          <div className="space-y-0.5">
            {!isSidebarCollapsed && (
              <p className="hidden lg:block px-2 pb-1 text-xs font-normal text-subtle-foreground">
                Alumnos
              </p>
            )}

            {/* 1.1 Inicio */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio"
                  onClick={() => selectAlumno(null)}
                  aria-label="Inicio"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start",
                    isStudioActive && !selectedAlumnoId
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!isSidebarCollapsed && <span className="hidden lg:inline">Inicio</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Inicio
              </TooltipContent>
            </Tooltip>

            {/* 1.2 Alumnos */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio"
                  onClick={() => selectAlumno(null)}
                  aria-label="Alumnos"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-between",
                    isStudioActive && selectedAlumnoId
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!isSidebarCollapsed && <span className="hidden lg:inline">Alumnos</span>}
                  </span>
                  {!isSidebarCollapsed && alumnosList.length > 0 && (
                    <span className="hidden lg:inline ml-auto text-xs text-subtle-foreground tabular-nums">
                      {alumnosList.length}
                    </span>
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Alumnos
              </TooltipContent>
            </Tooltip>

            {/* 1.3 Rutinas */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio/rutinas"
                  data-testid="sidebar-routine-builder-btn"
                  aria-label="Rutinas"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start",
                    isRutinasActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Dumbbell className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!isSidebarCollapsed && <span className="hidden lg:inline">Rutinas</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Rutinas
              </TooltipContent>
            </Tooltip>
          </div>

          {/* SECCIÓN 2: Operación */}
          <div className="space-y-0.5">
            {!isSidebarCollapsed && (
              <p className="hidden lg:block px-2 pb-1 text-xs font-normal text-subtle-foreground">
                Operación
              </p>
            )}

            {/* 2.1 Agenda */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio/agenda"
                  aria-label="Agenda"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start",
                    isAgendaActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!isSidebarCollapsed && <span className="hidden lg:inline">Agenda</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Agenda
              </TooltipContent>
            </Tooltip>

            {/* 2.2 Ranking */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio/ranking-funcional"
                  data-testid="sidebar-ranking-link"
                  aria-label="Ranking"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start",
                    isRankingActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!isSidebarCollapsed && <span className="hidden lg:inline">Ranking</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Ranking
              </TooltipContent>
            </Tooltip>
          </div>

          {/* SECCIÓN 3: Negocio */}
          <div className="space-y-0.5">
            {!isSidebarCollapsed && (
              <p className="hidden lg:block px-2 pb-1 text-xs font-normal text-subtle-foreground">
                Negocio
              </p>
            )}

            {/* 3.1 Cobros */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio/cobros"
                  data-testid="sidebar-cobros-link"
                  aria-label="Cobros"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-between",
                    isCobrosActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!isSidebarCollapsed && <span className="hidden lg:inline">Cobros</span>}
                  </span>
                  {!isSidebarCollapsed && cuotasVencidasCount > 0 && (
                    <span
                      className="hidden lg:inline ml-auto text-xs font-medium text-danger-soft-foreground tabular-nums"
                      aria-label={`${cuotasVencidasCount} cuotas vencidas`}
                    >
                      {cuotasVencidasCount}
                    </span>
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Cobros
              </TooltipContent>
            </Tooltip>

            {/* 3.2 Métricas */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio/dashboard"
                  data-testid="sidebar-metricas-link"
                  aria-label="Métricas"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start",
                    isDashboardActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!isSidebarCollapsed && <span className="hidden lg:inline">Métricas</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Métricas
              </TooltipContent>
            </Tooltip>

            {/* 3.3 Documentación */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio/documentacion"
                  data-testid="sidebar-documentacion-link"
                  aria-label="Documentación"
                  className={cn(
                    "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                    isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start",
                    isDocumentacionActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {!isSidebarCollapsed && <span className="hidden lg:inline">Documentación</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                Documentación
              </TooltipContent>
            </Tooltip>
          </div>
        </nav>

        {/* Pie del Sidebar: Vista del alumno + Botón de cuenta (sin tarjeta Sincronización/Cloud) */}
        <div className="mt-auto pt-3 border-t border-border flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/athlete"
                aria-label="Vista del alumno"
                className={cn(
                  "inline-flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-sm transition-colors",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start",
                  isAthleteActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-neutral-soft-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!isSidebarCollapsed && <span className="hidden lg:inline">Vista del alumno</span>}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              Vista del alumno
            </TooltipContent>
          </Tooltip>

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
                "flex items-center gap-2.5 w-full rounded-lg p-2 hover:bg-muted transition-colors cursor-pointer text-left",
                isSidebarCollapsed ? "justify-center px-0" : "justify-center lg:justify-start"
              )}
            >
              <Avatar className="size-7 shrink-0 bg-muted">
                <AvatarFallback className="bg-muted text-foreground font-semibold text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!isSidebarCollapsed && (
                <div className="hidden lg:block min-w-0 flex-1">
                  <p
                    className="text-sm font-medium text-foreground truncate leading-tight"
                    title={userName}
                  >
                    {userName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate leading-tight">
                    {isOnline ? "Sincronizado" : "Sin conexión · reintentando"}
                  </p>
                </div>
              )}
              {!isSidebarCollapsed && (
                <ChevronUp
                  className={cn(
                    "hidden lg:block h-4 w-4 text-muted-foreground shrink-0 ml-auto transition-transform",
                    isAccountMenuOpen && "rotate-180"
                  )}
                />
              )}
            </button>

            {/* Menú desplegable con el único control de Cerrar sesión */}
            <div
              role="menu"
              aria-label="Opciones de cuenta"
              className={cn(
                "absolute z-50 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-[0_8px_24px_rgb(0_0_0_/_0.08)] transition-all",
                isSidebarCollapsed
                  ? "left-full bottom-0 ml-2 w-64"
                  : "left-0 right-0 bottom-full mb-2",
                !isAccountMenuOpen && "hidden"
              )}
            >
              <div className="px-2 py-1.5 mb-1">
                <p className="text-xs font-semibold text-foreground truncate">
                  {userName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {userEmail || "coach@gozster.ar"}
                </p>
                <span className="inline-flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  {isOnline ? "Sincronizado" : "Sin conexión · reintentando"}
                </span>
              </div>
              <div className="my-1.5 h-px bg-border" />
              <div className="px-2 py-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Modo</span>
                <ModeSwitcher current="studio" />
              </div>
              <div className="px-2 py-1.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Tema</span>
                <ThemeToggle />
              </div>
              <div className="my-1.5 h-px bg-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => void cerrarSesion()}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-destructive hover:bg-danger-soft rounded-lg transition-colors cursor-pointer"
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
        {/* Topbar Desktop (md+) h-14 border-b px-6: Nombre de página / Breadcrumb · ⌘K (280px) · Mensajes (size-9 border) · Tema (size-9 border) — sin acción primaria (P02, P09) */}
        <header className="sticky top-0 z-30 hidden md:flex h-14 items-center justify-between border-b border-border bg-background px-6">
          {/* Nombre de página 14/500 o Breadcrumb en ficha */}
          <div className="flex items-center gap-2 min-w-0">
            {isStudioActive && selectedAlumno ? (
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <button
                  type="button"
                  onClick={() => selectAlumno(null)}
                  className="hover:text-foreground transition-colors"
                >
                  Alumnos
                </button>
                <span aria-hidden="true">/</span>
                <span className="text-sm font-medium text-foreground truncate">
                  {selectedAlumno.nombre_completo}
                </span>
              </nav>
            ) : (
              <h1 className="text-sm font-medium text-foreground">
                {sectionTitle}
              </h1>
            )}
          </div>

          {/* Derecha: Búsqueda ⌘K (280px h-9 rounded-lg border) · Mensajes (size-9 rounded-lg border) · Tema (size-9 rounded-lg border) */}
          <div className="flex items-center gap-2">
            {/* Buscador ⌘K */}
            <div className="relative w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
                placeholder="Buscar alumno o rutina…"
                data-testid="studio-quick-search-input"
                className="w-[280px] h-9 pl-9 pr-12 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                aria-label="Buscar alumno"
                role="combobox"
                aria-expanded={isSearchOpen && searchResults.length > 0}
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
                ⌘K
              </kbd>

              {/* Menú de resultados de búsqueda */}
              {isSearchOpen && searchResults.length > 0 && (
                <div
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border bg-popover shadow-[0_8px_24px_rgb(0_0_0_/_0.08)] overflow-hidden p-1 max-h-72 overflow-y-auto"
                >
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
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
                      className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-xs hover:bg-muted transition-colors cursor-pointer"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground text-xs font-semibold">
                        {alumno.nombre_completo.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {alumno.nombre_completo}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {alumno.email || "Alumno"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Ficha ↵
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Botón de ícono Mensajes (P09) */}
            <button
              type="button"
              onClick={() => setChatOpen(!isChatOpen)}
              data-testid="topbar-mensajes-btn"
              aria-label={
                unreadMessagesCount > 0
                  ? `Mensajes, ${unreadMessagesCount} sin leer`
                  : "Mensajes"
              }
              title="Mensajes"
              className="relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              {unreadMessagesCount > 0 && (
                <span
                  data-testid="topbar-mensajes-unread-dot"
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive"
                  aria-hidden="true"
                />
              )}
            </button>

            <ThemeToggle />
          </div>
        </header>

        {/* Cabecera Móvil (viewports < md) */}
        <header className="sticky top-0 z-30 md:hidden flex h-14 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-[14px]">
              G
            </span>
            <span className="text-sm font-medium text-foreground">
              {sectionTitle}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Buscador rápido móvil (≥ 44×44 px) */}
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
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted cursor-pointer"
              aria-label="Buscar alumno"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Avatar móvil que abre el Sheet 'Más' (≥ 44×44 px) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-xs font-semibold bg-muted text-foreground cursor-pointer"
              aria-label="Menú de navegación y cuenta"
            >
              {userInitials}
            </button>
          </div>
        </header>

        {/* Contenido principal de la página: w-full max-w-[1280px] px-6 en todas las vistas, alineado a la izquierda (P02) */}
        <main className="flex-1 w-full max-w-[1280px] px-6 py-6 pb-24 md:pb-8 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Sheet de Mensajes en rutas secundarias donde CoachStudioView/CoachDashboardView no montan ChatFab */}
      {!isStudioActive && !isDashboardActive && (
        <ChatFab
          alumno={activeChatAlumno}
          isOpen={isChatOpen}
          onToggle={() => setChatOpen(!isChatOpen)}
        />
      )}

      {/* BARRA INFERIOR MÓVIL (< 768px) - 5 ítems con cajas táctiles ≥ 44×44 px (min-h-11) */}
      <nav
        aria-label="Navegación inferior móvil"
        data-testid="studio-mobile-bottom-nav"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {/* 1. Inicio */}
          <Link
            href="/studio"
            onClick={() => selectAlumno(null)}
            className={cn(
              "flex flex-col items-center justify-center min-h-11 min-w-11 gap-1 text-xs font-medium transition-colors touch-manipulation",
              isStudioActive && !selectedAlumnoId
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Inicio"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            <span>Inicio</span>
          </Link>

          {/* 2. Alumnos */}
          <Link
            href="/studio"
            onClick={() => selectAlumno(null)}
            className={cn(
              "flex flex-col items-center justify-center min-h-11 min-w-11 gap-1 text-xs font-medium transition-colors touch-manipulation",
              isStudioActive && selectedAlumnoId
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Alumnos"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>Alumnos</span>
          </Link>

          {/* 3. Agenda */}
          <Link
            href="/studio/agenda"
            className={cn(
              "flex flex-col items-center justify-center min-h-11 min-w-11 gap-1 text-xs font-medium transition-colors touch-manipulation",
              isAgendaActive
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Agenda"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span>Agenda</span>
          </Link>

          {/* 4. Mensajes */}
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="flex flex-col items-center justify-center min-h-11 min-w-11 gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors touch-manipulation cursor-pointer relative"
            aria-label="Mensajes"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>Mensajes</span>
          </button>

          {/* 5. Más */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center min-h-11 min-w-11 gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors touch-manipulation cursor-pointer"
            aria-label="Más"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {/* Sheet lateral/inferior 'Más' para móvil */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 md:hidden bg-card"
        >
          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="text-base font-semibold text-foreground">
              Menú de Coach Studio
            </SheetTitle>
          </SheetHeader>

          <div className="py-4 space-y-4">
            {/* Sección Operación */}
            <div className="space-y-1">
              <p className="text-xs font-normal text-subtle-foreground mb-1">
                Operación
              </p>
              <Link
                href="/studio/rutinas"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center min-h-11 gap-3 px-2.5 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <Dumbbell className="h-4 w-4 text-muted-foreground" />
                <span>Rutinas</span>
              </Link>
              <Link
                href="/studio/ranking-funcional"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center min-h-11 gap-3 px-2.5 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span>Ranking</span>
              </Link>
            </div>

            {/* Sección Negocio */}
            <div className="space-y-1">
              <p className="text-xs font-normal text-subtle-foreground mb-1">
                Negocio
              </p>
              <Link
                href="/studio/cobros"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center min-h-11 gap-3 px-2.5 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span>Cobros</span>
              </Link>
              <Link
                href="/studio/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center min-h-11 gap-3 px-2.5 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span>Métricas</span>
              </Link>
              <Link
                href="/studio/documentacion"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center min-h-11 gap-3 px-2.5 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Documentación</span>
              </Link>
            </div>

            {/* Accesos rápidos */}
            <div className="space-y-2 pt-2 border-t border-border">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleOpenAltaAlumno();
                }}
                className="w-full justify-center min-h-11 text-sm font-medium"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                <span>Alta de alumno</span>
              </Button>
              <Link
                href="/athlete"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-center min-h-11 gap-2 p-2.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors text-muted-foreground"
              >
                <Smartphone className="h-4 w-4" />
                <span>Vista del alumno</span>
              </Link>
            </div>

            {/* Configuración de cuenta */}
            <div className="pt-2 border-t border-border space-y-3">
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
