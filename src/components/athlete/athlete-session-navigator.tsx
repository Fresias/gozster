"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAthleteStore } from "@/store/use-athlete-store";

/**
 * Navega a `/athlete/historial` cuando se solicita al cerrar la sesión (FE-11 `toast-sesion`),
 * manteniéndose en `layout.tsx` para no exigir `useRouter` en tests unitarios de `LiveWorkout` ni `AthleteShell`.
 */
export function AthleteSessionNavigator() {
  const router = useRouter();
  const irAHistorial = useAthleteStore((s) => Boolean(s.toastSesion?.irAHistorial));
  const consumirNavegacionHistorialToast = useAthleteStore(
    (s) => s.consumirNavegacionHistorialToast,
  );

  React.useEffect(() => {
    if (!irAHistorial) return;
    consumirNavegacionHistorialToast();
    router.push("/athlete/historial");
  }, [irAHistorial, consumirNavegacionHistorialToast, router]);

  return null;
}
