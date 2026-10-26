"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function AthleteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isOnline, setOnlineStatus, flushQueue } = useOfflineQueueStore();

  React.useEffect(() => {
    setOnlineStatus(navigator.onLine);
    const handleOnline = () => {
      setOnlineStatus(true);
      // Al volver la señal, la cola sincroniza sola y en silencio: el alumno
      // nunca ve "pendientes", para él sus datos ya estaban guardados.
      flushQueue();
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col border-x border-border/80 bg-background text-foreground shadow-2xl transition-colors duration-150">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/80 bg-card/95 px-4 py-3 backdrop-blur-md transition-colors">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-black tracking-tight text-foreground hover:opacity-90 transition-opacity"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-black">
            G
          </span>
          <span>
            GOZSter <span className="text-primary font-bold">Athlete</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
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
            <span className="font-semibold text-[11px]">
              {isOnline ? "Online" : "Modo Avión"}
            </span>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Navegación táctil de secciones athlete (adaptada de grid-cols-3 a 4 secciones min-h-12) */}
      <nav aria-label="Secciones Athlete" className="grid grid-cols-4 gap-1.5 border-b border-border/80 bg-card/95 px-2 py-2">
        {[
          { href: "/athlete", label: "Entrenar" },
          { href: "/athlete/historial", label: "Historial" },
          { href: "/athlete/progreso", label: "Progreso" },
          { href: "/athlete/clases", label: "Clases" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center rounded-xl text-xs sm:text-sm font-bold transition-colors ${
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 space-y-4 p-4">{children}</main>
    </div>
  );
}
