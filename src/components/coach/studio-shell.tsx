import * as React from "react";
import Link from "next/link";

export function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-border bg-card p-6 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between lg:flex-col lg:items-start lg:gap-6">
          <div>
            <Link href="/" className="text-lg font-bold tracking-tight">
              GOZSter <span className="text-primary">Studio</span>
            </Link>
            <p className="text-xs text-muted-foreground">
              Coach Workspace • Desktop/Tablet
            </p>
          </div>
          <nav
            aria-label="Navegación Coach Studio"
            className="flex gap-2 lg:w-full lg:flex-col"
          >
            <Link
              href="/studio"
              className="inline-flex min-h-11 items-center rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground"
            >
              Dashboard &amp; Rutinas
            </Link>
            <Link
              href="/athlete"
              className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Vista Atleta (PWA)
            </Link>
          </nav>
        </div>
      </aside>
      <div className="flex flex-col">
        <main className="flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
