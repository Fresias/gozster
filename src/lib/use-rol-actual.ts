"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Perfil } from "@/types/database.types";

/** Rol (`perfiles.rol`) del usuario logueado; null mientras carga o sin sesión. */
export function useRolActual(): Perfil["rol"] | null {
  const [rol, setRol] = React.useState<Perfil["rol"] | null>(null);
  React.useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;
        const { data } = await supabase.from("perfiles").select("rol").eq("id", auth.user.id).maybeSingle();
        if (activo && data) setRol(data.rol);
      } catch {
        // Sin conexión o sin sesión: la franja ADMIN simplemente no se muestra.
      }
    })();
    return () => {
      activo = false;
    };
  }, []);
  return rol;
}
