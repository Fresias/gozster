"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { activarUsuarioStorage, cerrarSesion } from "@/lib/session-scope";
import { createClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ModeSwitcher } from "@/components/navigation/mode-switcher";
import { cn } from "@/lib/utils";
import { LogOut } from "@/components/ui/icons";
import { Calendar, Dumbbell, History, TrendingUp } from "@/components/athlete/icons";

const SECCIONES = [
  { href: "/athlete", label: "Entrenar", Icon: Dumbbell },
  { href: "/athlete/historial", label: "Historial", Icon: History },
  { href: "/athlete/progreso", label: "Progreso", Icon: TrendingUp },
  { href: "/athlete/clases", label: "Clases", Icon: Calendar },
] as const;

function ControlesSesion({ isOnline }: { isOnline: boolean }) {
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
          isOnline
            ? "border-success-soft-border bg-success-soft text-success-soft-foreground"
            : "border-warning-soft-border bg-warning-soft text-warning-soft-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-full", isOnline ? "bg-success" : "bg-warning")}
        />
        {isOnline ? "Online" : "Modo Avión"}
      </div>
      <ThemeToggle />
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="inline-flex size-target items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger-soft-foreground"
        aria-label="Cerrar sesión"
      >
        <LogOut className="size-5" />
        <span className="sr-only">Cerrar Sesión</span>
      </button>
    </>
  );
}

export function AthleteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isOnline, setOnlineStatus, flushQueue } = useOfflineQueueStore();

  // Aísla la persistencia local por usuario: se rehidrata solo con los datos del alumno autenticado.
  React.useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => (data.user ? activarUsuarioStorage(data.user.id) : undefined))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    setOnlineStatus(navigator.onLine);
    const handleOnline = () => {
      setOnlineStatus(true);
      // Al volver la señal, la cola sincroniza sola y en silencio: el alumno
      // nunca ve "pendientes", para él sus datos ya estaban guardados.
      void flushQueue();
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
    <div className="theme-athlete min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Mobile: `contents` (header fijo + pestañas, como hoy). Desktop: riel lateral fijo. */}
      <div className="contents lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-border lg:bg-card">
        <header className="sticky top-0 z-20 border-b border-border bg-card lg:static lg:border-b-0">
          <div className="flex items-center justify-between gap-2 px-4 py-2 lg:px-5 lg:py-4">
            <Link
              href="/"
              aria-label="GOZS Athlete, ir al inicio"
              className="-m-2 flex min-h-12 items-center gap-2 p-2"
            >
              <img src="/brand/gozs-logo-negro.png" alt="" className="h-5 w-auto dark:hidden" />
              <img src="/brand/gozs-logo-blanco.png" alt="" className="hidden h-5 w-auto dark:block" />
              <span className="hidden text-base font-bold tracking-tight text-primary sm:inline">
                Athlete
              </span>
            </Link>
            <div className="flex items-center gap-2 lg:hidden">
              <ControlesSesion isOnline={isOnline} />
            </div>
          </div>
          <ModeSwitcher
            current="athlete"
            showReturnButton={true}
            className="w-full justify-between border-t border-border bg-secondary/30 px-4 py-2"
          />
        </header>

        {/* Navegación táctil de secciones athlete (adaptada de grid-cols-3 a 4 secciones min-h-12) */}
        <nav
          aria-label="Secciones Athlete"
          className="grid grid-cols-4 gap-1.5 border-b border-border bg-card px-2 py-2 lg:flex lg:flex-1 lg:flex-col lg:gap-1 lg:border-b-0 lg:px-3"
        >
          {SECCIONES.map(({ href, label, Icon }) => {
            const activo = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center justify-center gap-2.5 rounded-xl text-sm font-bold transition-colors lg:justify-start lg:px-3",
                  activo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="hidden size-5 lg:block" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center justify-between gap-2 border-t border-border p-3 lg:flex">
          <ControlesSesion isOnline={isOnline} />
        </div>
      </div>

      <main className="mx-auto w-full max-w-md space-y-4 p-4 lg:max-w-2xl lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
