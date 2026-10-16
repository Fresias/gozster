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
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-border bg-card p-4 sm:p-6 lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-4 lg:gap-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-lg font-bold tracking-tight">
                GOZSter <span className="text-primary">Studio</span>
              </Link>
              <p className="text-xs text-muted-foreground">
                Coach Workspace • Desktop/Tablet/Mobile
              </p>
            </div>
          </div>
          <nav
            aria-label="Navegación Coach Studio"
            className="flex flex-wrap gap-2 lg:w-full lg:flex-col"
          >
            <Link
              href="/studio/dashboard"
              className={`inline-flex min-h-11 items-center rounded-md px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                isDashboardActive
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              📊 Dashboard &amp; Analíticas
            </Link>
            <Link
              href="/studio"
              className={`inline-flex min-h-11 items-center rounded-md px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                isStudioActive
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              👥 Atletas &amp; Rutinas
            </Link>
            <Link
              href="/athlete"
              className={`inline-flex min-h-11 items-center rounded-md px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                isAthleteActive
                  ? "bg-secondary text-secondary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              📱 Vista Atleta (PWA)
            </Link>
          </nav>
        </div>
      </aside>
      <div className="flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
