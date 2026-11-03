"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Database } from "@/types/database.types";

export type RolUsuario = Database["public"]["Enums"]["rol_usuario"];

export interface LandingUser {
  id: string;
  email: string;
  displayName: string;
  rol: RolUsuario;
}

export interface LandingSessionState {
  user: LandingUser | null;
  loading: boolean;
}

/**
 * Hook para consultar de forma idempotente y reactiva la sesión activa
 * del usuario para el cabezal inteligente y CTAs de la landing unificada.
 */
export function useLandingSession(): LandingSessionState {
  const [session, setSession] = React.useState<LandingSessionState>({
    user: null,
    loading: true,
  });

  React.useEffect(() => {
    let activo = true;

    async function checkAuthSession() {
      try {
        const supabase = createClient();
        const { data: auth, error: authError } = await supabase.auth.getUser();

        if (authError || !auth?.user) {
          if (activo) {
            setSession({ user: null, loading: false });
          }
          return;
        }

        const authUser = auth.user;
        const { data: perfil } = await supabase
          .from("perfiles")
          .select("rol, nombre_completo")
          .eq("id", authUser.id)
          .maybeSingle();

        if (activo) {
          const email = authUser.email ?? "";
          const fallbackName = email ? (email.split("@")[0] ?? "Usuario") : "Usuario";
          const displayName = perfil?.nombre_completo || fallbackName;
          const rol: RolUsuario = (perfil?.rol as RolUsuario) || "ALUMNO";

          setSession({
            user: {
              id: authUser.id,
              email,
              displayName,
              rol,
            },
            loading: false,
          });
        }
      } catch {
        if (activo) {
          setSession({ user: null, loading: false });
        }
      }
    }

    void checkAuthSession();

    return () => {
      activo = false;
    };
  }, []);

  return session;
}
