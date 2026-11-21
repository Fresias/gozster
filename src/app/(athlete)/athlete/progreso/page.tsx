"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { derivarAsistenciasLocal, resolverActividadesHabilitadas } from "@/lib/clases";
import { MiProgreso, type EstadoMiProgreso } from "@/components/athlete/mi-progreso";

export default function AthleteProgresoPage() {
  const nivelVistaAlumno = useAthleteStore((s) => s.nivelVistaAlumno);
  const miProgreso = useAthleteStore((s) => s.miProgreso);
  const miProgresoFecha = useAthleteStore((s) => s.miProgresoFecha);
  const cargando = useAthleteStore((s) => s.cargandoMiProgreso);
  const cargarMiProgreso = useAthleteStore((s) => s.cargarMiProgreso);
  const isOnline = useOfflineQueueStore((s) => s.isOnline);

  const resumenClases = useClasesStore((s) => s.resumenClases);
  const clases = useClasesStore((s) => s.clases);
  const misReservas = useClasesStore((s) => s.misReservas);
  const feedbacksPorReserva = useClasesStore((s) => s.feedbacksPorReserva);
  const membresia = useClasesStore((s) => s.membresia);
  const planClases = useClasesStore((s) => s.plan);
  const contratacionesAlumno = useClasesStore((s) => s.contratacionesAlumno);
  const actividadesAlumno = useClasesStore((s) => s.actividadesAlumno);
  const actividadesHabilitadas = useClasesStore((s) => s.actividadesHabilitadas);
  const cargarClasesAlumno = useClasesStore((s) => s.cargarClasesAlumno);

  // Al abrir (y al volver la señal) se descarga; offline usa lo persistido (§0.3).
  React.useEffect(() => {
    if (isOnline) {
      void cargarMiProgreso();
      void cargarClasesAlumno();
    }
  }, [isOnline, cargarMiProgreso, cargarClasesAlumno]);

  const tieneMembresiaClases = React.useMemo(() => {
    const habilitadas =
      actividadesHabilitadas.length > 0
        ? actividadesHabilitadas
        : resolverActividadesHabilitadas({
            contrataciones: contratacionesAlumno,
            actividadesAlumno,
            membresia,
            plan: planClases,
          });
    return (
      habilitadas.length > 0 ||
      Boolean(
        planClases &&
          (!membresia || (membresia.estado !== "VENCIDA" && membresia.estado !== "EN_PAUSA")),
      )
    );
  }, [actividadesHabilitadas, contratacionesAlumno, actividadesAlumno, membresia, planClases]);

  const asistenciasClases = React.useMemo(() => {
    const base =
      resumenClases?.asistencias ??
      derivarAsistenciasLocal(misReservas, clases, feedbacksPorReserva);
    if (base.length === 0 && !tieneMembresiaClases) return undefined;
    return base.map((item) => ({
      ...item,
      sensacion: feedbacksPorReserva[item.reserva_id] ?? item.sensacion,
    }));
  }, [resumenClases, misReservas, clases, feedbacksPorReserva, tieneMembresiaClases]);

  const tieneDatosLocales = Boolean(
    miProgreso || (asistenciasClases && asistenciasClases.length > 0),
  );

  const estado: EstadoMiProgreso = !isOnline && !tieneDatosLocales
    ? "offline-sin-datos"
    : cargando && !tieneDatosLocales
      ? "cargando"
      : "listo";

  return (
    <MiProgreso
      estado={estado}
      vista={nivelVistaAlumno}
      data={miProgreso}
      offline={!isOnline}
      fechaDescarga={miProgresoFecha}
      asistenciasClases={asistenciasClases}
    />
  );
}
