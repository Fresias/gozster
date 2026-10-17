"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isDashboardActive = pathname === "/studio/dashboard";
  const isStudioActive = pathname === "/studio";
  const isAthleteActive = pathname?.startsWith("/athlete");

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[280px_1fr] bg-background">
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
                <span className="text-[10px] text-muted-foreground block -mt-0.5">
                  Executive Workspace • M3 Edition
                </span>
              </div>
            </Link>
          </div>

          <nav
            aria-label="Navegación Coach Studio"
            className="flex flex-wrap gap-2 lg:w-full lg:flex-col"
          >
            <Link
              href="/studio/dashboard"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isDashboardActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <span className="mr-2 text-base">📊</span>
              <span>Dashboard &amp; Analíticas</span>
            </Link>

            <Link
              href="/studio"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isStudioActive
                  ? "bg-primary/10 text-primary border border-primary/30 shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <span className="mr-2 text-base">👥</span>
              <span>Atletas &amp; Rutinas</span>
            </Link>

            <Link
              href="/athlete"
              className={`inline-flex min-h-12 items-center rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                isAthleteActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent"
              }`}
            >
              <span className="mr-2 text-base">📱</span>
              <span>Vista Atleta (PWA)</span>
            </Link>
          </nav>

          <div className="hidden lg:block mt-auto pt-6 border-t border-border/60">
            <div className="rounded-xl bg-secondary/40 border border-border/40 p-3 space-y-1">
              <p className="text-[11px] font-bold text-foreground">Estado del Servidor</p>
              <p className="text-[10px] text-muted-foreground">
                Sincronización en vivo con Supabase &amp; Mynter Backup activa.
              </p>
            </div>
          </div>
        </div>
      </aside>
      <div className="flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
