"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { calcularRachaSemanas } from "@/lib/athlete-dias";
import { resolverActividadesHabilitadas } from "@/lib/clases";
import { calcularCumplimientoMes, sesionesDesdeFechas } from "@/lib/mi-progreso";
import { useRankingStore } from "@/store/use-ranking-store";
import { MiProgreso, type EstadoMiProgreso } from "@/components/athlete/mi-progreso";

export default function AthleteProgresoPage() {
  const nivelVistaAlumno = useAthleteStore((s) => s.nivelVistaAlumno);
  const miProgreso = useAthleteStore((s) => s.miProgreso);
  const miProgresoFecha = useAthleteStore((s) => s.miProgresoFecha);
  const cargando = useAthleteStore((s) => s.cargandoMiProgreso);
  const miProgresoError = useAthleteStore((s) => s.miProgresoError);
  const cargarMiProgreso = useAthleteStore((s) => s.cargarMiProgreso);
  const diamantesRacha = useAthleteStore((s) => s.diamantesRacha);
  const cargarLogrosRacha = useAthleteStore((s) => s.cargarLogrosRacha);
  const planAlumno = useAthleteStore((s) => s.planAlumno);
  const cargarPlanAlumno = useAthleteStore((s) => s.cargarPlanAlumno);
  const fechasSesionesServidor = useAthleteStore((s) => s.fechasSesionesServidor);
  const sesionesCompletadas = useAthleteStore((s) => s.sesionesCompletadas);
  const historialSesiones = useAthleteStore((s) => s.historialSesiones);
  const isOnline = useOfflineQueueStore((s) => s.isOnline);

  const resumenClases = useClasesStore((s) => s.resumenClases);
  const rankingAlumno = useRankingStore((s) => s.rankingAlumno);
  const cargarRankingAlumno = useRankingStore((s) => s.cargarRankingAlumno);
  const rankingAlumnoError = useRankingStore((s) => s.rankingAlumnoError);
  const sincronizarMarcasPendientes = useRankingStore((s) => s.sincronizarMarcasPendientes);
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
      void cargarLogrosRacha();
    }
  }, [isOnline, cargarMiProgreso, cargarClasesAlumno, cargarLogrosRacha]);

  React.useEffect(() => {
    if (isOnline && !planAlumno) void cargarPlanAlumno();
  }, [isOnline, planAlumno, cargarPlanAlumno]);

  const actividades = React.useMemo(
    () =>
      actividadesHabilitadas.length > 0
        ? actividadesHabilitadas
        : resolverActividadesHabilitadas({
            contrataciones: contratacionesAlumno,
            actividadesAlumno,
            membresia,
            plan: planClases,
          }),
    [actividadesHabilitadas, contratacionesAlumno, actividadesAlumno, membresia, planClases],
  );
  const esFuncional = actividades.includes("FUNCIONAL");

  // Ranking de Funcional: primero se envían las marcas en cola (offline) y luego se descarga.
  React.useEffect(() => {
    if (isOnline && esFuncional) void sincronizarMarcasPendientes().then(() => cargarRankingAlumno());
  }, [isOnline, esFuncional, sincronizarMarcasPendientes, cargarRankingAlumno]);

  const fechasSesiones = React.useMemo(
    () => [
      planAlumno?.alumnos[0]?.ultimo_entreno_at,
      ...(fechasSesionesServidor ?? []),
      ...sesionesCompletadas.map((s) => s.fecha),
      ...historialSesiones.map((h) => h.sesion?.fecha),
    ],
    [planAlumno, fechasSesionesServidor, sesionesCompletadas, historialSesiones],
  );

  // % de cumplimiento del plan: días del plan activo por semana (null sin plan).
  const cumplimientoPct = React.useMemo(() => {
    const plan = planAlumno?.planes[0];
    const diasPlan = plan ? planAlumno!.dias.filter((d) => d.plan_id === plan.id).length : 0;
    return diasPlan > 0 ? calcularCumplimientoMes(sesionesDesdeFechas(fechasSesiones), diasPlan) : null;
  }, [planAlumno, fechasSesiones]);

  const rachaSemanas = React.useMemo(() => {
    const rachaGym = calcularRachaSemanas(fechasSesiones);
    const rachaClases = resumenClases?.racha_semanas ?? 0;
    return Math.max(rachaGym, rachaClases);
  }, [fechasSesiones, resumenClases]);

  const tieneDatosLocales = Boolean(
    miProgreso || diamantesRacha > 0 || rankingAlumno.length > 0,
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
      cumplimientoPct={cumplimientoPct}
      rankingFuncional={esFuncional ? rankingAlumno : []}
      diamantesRacha={diamantesRacha}
      rachaSemanas={rachaSemanas}
      rankingError={esFuncional && isOnline ? rankingAlumnoError : null}
      onReintentarRanking={() => void cargarRankingAlumno()}
      progresoError={isOnline ? miProgresoError : null}
      onReintentarProgreso={() => void cargarMiProgreso({ forceRefresh: true })}
    />
  );
}
