"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { cerrarSesion } from "@/lib/session-scope";

export interface AuthUserData {
  email: string | null;
  nombre: string | null;
}

export function LandingSessionCapsule({ initialUser }: { initialUser?: AuthUserData | null }) {
  const [user, setUser] = React.useState<AuthUserData | null>(initialUser ?? null);

  React.useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        if (data?.user) {
          const email = data.user.email ?? null;
          const meta = data.user.user_metadata as Record<string, unknown> | undefined;
          const nombre = typeof meta?.nombre_completo === "string" ? meta.nombre_completo : null;
          setUser({ email, nombre });
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        if (mounted) setUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        const email = session.user.email ?? null;
        const meta = session.user.user_metadata as Record<string, unknown> | undefined;
        const nombre = typeof meta?.nombre_completo === "string" ? meta.nombre_completo : null;
        setUser({ email, nombre });
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-target items-center rounded-lg border border-border/80 bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-secondary active:scale-[0.98] transition-all"
      >
        Iniciar Sesión
      </Link>
    );
  }

  const initial = (user.nombre?.[0] || user.email?.[0] || "U").toUpperCase();
  const label = user.nombre || user.email || "Usuario";

  return (
    <div
      data-testid="landing-session-capsule"
      className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-foreground shadow-xs animate-in fade-in duration-200"
    >
      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-[11px] shadow-xs">
        {initial}
      </div>
      <span
        title={label}
        className="font-bold text-foreground truncate max-w-[120px] sm:max-w-[180px]"
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => void cerrarSesion()}
        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border/80 bg-background/80 px-2.5 py-1 text-xs font-bold text-muted-foreground transition-colors hover:bg-destructive/15 hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        aria-label="Cerrar sesión"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
        <span>Cerrar Sesión</span>
      </button>
    </div>
  );
}
