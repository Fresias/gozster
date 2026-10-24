"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { MiProgreso, type EstadoMiProgreso } from "@/components/athlete/mi-progreso";

export default function AthleteProgresoPage() {
  const nivelVistaAlumno = useAthleteStore((s) => s.nivelVistaAlumno);
  const miProgreso = useAthleteStore((s) => s.miProgreso);
  const miProgresoFecha = useAthleteStore((s) => s.miProgresoFecha);
  const cargando = useAthleteStore((s) => s.cargandoMiProgreso);
  const cargarMiProgreso = useAthleteStore((s) => s.cargarMiProgreso);
  const isOnline = useOfflineQueueStore((s) => s.isOnline);

  // Al abrir (y al volver la señal) se descarga; offline usa lo persistido (§0.3).
  React.useEffect(() => {
    if (isOnline) void cargarMiProgreso();
  }, [isOnline, cargarMiProgreso]);

  const estado: EstadoMiProgreso = !isOnline && !miProgreso
    ? "offline-sin-datos"
    : cargando && !miProgreso
      ? "cargando"
      : "listo";

  return (
    <MiProgreso
      estado={estado}
      vista={nivelVistaAlumno}
      data={miProgreso}
      offline={!isOnline}
      fechaDescarga={miProgresoFecha}
    />
  );
}
