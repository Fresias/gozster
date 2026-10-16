"use client";

import * as React from "react";
import Link from "next/link";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export function AthleteShell({ children }: { children: React.ReactNode }) {
  const { isOnline, pendingEvents, setOnlineStatus } = useOfflineQueueStore();

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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col border-x border-border bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Link href="/" className="text-base font-bold tracking-tight">
          GOZSter <span className="text-primary">Athlete</span>
        </Link>
        <div
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium"
        >
          <span
            className={
              isOnline
                ? "h-2 w-2 rounded-full bg-primary"
                : "h-2 w-2 rounded-full bg-amber-400"
            }
          />
          <span>
            {isOnline ? "Online" : "Modo Avión"} • Cola: {pendingEvents.length}
          </span>
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4">{children}</main>
    </div>
  );
}
