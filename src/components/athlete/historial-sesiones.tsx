"use client";

import * as React from "react";
import Link from "next/link";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  normalizarSesionesDetalladas,
  generarContratoMiniDashboard,
} from "@/lib/historial-sesiones";
import type {
  SesionHistoricaDetalle,
  SerieHistoricaDetalle,
} from "@/lib/historial-sesiones";
import {
  History,
  Dumbbell,
  Calendar,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Flame,
  TrendingUp,
  Trophy,
  CloudOff,
  TriangleAlert,
} from "@/components/athlete/icons";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import { evaluarPlausibilidadSerie } from "@/lib/plausibilidad-series";

export interface HistorialSesionesProps {
  offline?: boolean;
  initialTab?: "sesiones" | "dashboard";
}

export function HistorialSesiones({ offline, initialTab = "sesiones" }: HistorialSesionesProps = {}) {
  const historialSesiones = useAthleteStore((s) => s.historialSesiones);
  const cargandoHistorial = useAthleteStore((s) => s.cargandoHistorial);
  const cargarHistorialSesiones = useAthleteStore((s) => s.cargarHistorialSesiones);
  const actualizarSerieHistorial = useAthleteStore((s) => s.actualizarSerieHistorial);
  const currentSession = useAthleteStore((s) => s.currentSession);
  const planDias = useAthleteStore((s) => s.planAlumno?.dias);
  const storeIsOnline = useOfflineQueueStore((s) => s.isOnline);
  const isOnline = offline !== undefined ? !offline : storeIsOnline;

  // Sincronizar desde Supabase al montar si estamos online
  React.useEffect(() => {
    if (isOnline) {
      void cargarHistorialSesiones();
    }
  }, [isOnline, cargarHistorialSesiones]);

  // Sesiones normalizadas y ordenadas (más reciente a más antigua)
  const sesiones = React.useMemo(() => {
    return normalizarSesionesDetalladas(historialSesiones, planDias ?? []);
  }, [historialSesiones, planDias]);

  // Contrato estructurado para mini-dashboard de progresión
  const contratoDashboard = React.useMemo(() => {
    return generarContratoMiniDashboard(historialSesiones, currentSession.studentId, planDias ?? []);
  }, [historialSesiones, currentSession.studentId, planDias]);

  // Estado de vista: listado de sesiones o mini-dashboard por ejercicio
  const [tabActiva, setTabActiva] = React.useState<"sesiones" | "dashboard">(initialTab);

  // Estado de acordeón: primer elemento expandido por defecto
  const [expandedIds, setExpandedIds] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (sesiones.length > 0 && Object.keys(expandedIds).length === 0) {
      setExpandedIds({ [sesiones[0]!.id]: true });
    }
  }, [sesiones, expandedIds]);

  const toggleExpand = (sesionId: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [sesionId]: !prev[sesionId],
    }));
  };

  // Estado para la edición en línea de una serie
  const [editingSerie, setEditingSerie] = React.useState<{
    sesionId: string;
    serieId: string;
    peso: number;
    reps: number;
  } | null>(null);

  const [guardadoExitoso, setGuardadoExitoso] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [atypicalPrompt, setAtypicalPrompt] = React.useState<{
    mensaje: string;
    peso: number;
    reps: number;
  } | null>(null);
  const atypicalDialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    if (atypicalPrompt) {
      if (!atypicalDialogRef.current?.open) atypicalDialogRef.current?.showModal();
    } else {
      if (atypicalDialogRef.current?.open) atypicalDialogRef.current?.close();
    }
  }, [atypicalPrompt]);

  const handleStartEdit = (sesionId: string, s: SerieHistoricaDetalle) => {
    setErrorMessage(null);
    setEditingSerie({
      sesionId,
      serieId: s.id,
      peso: s.pesoKg,
      reps: s.repsHechas,
    });
  };

  const handleCancelEdit = () => {
    setEditingSerie(null);
    setErrorMessage(null);
  };

  const handleSaveEdit = async (confirmarAtipica = false) => {
    if (!editingSerie) return;
    setErrorMessage(null);
    const { sesionId, serieId, peso, reps } = editingSerie;

    if (!confirmarAtipica) {
      const entradaActual = historialSesiones.find((h) => h.sesion.id === sesionId);
      const serieActual = entradaActual?.series.find((s) => s.id === serieId);
      const ejId = serieActual?.ejercicio_id;

      const historialPesos: number[] = [];
      if (ejId) {
        for (const entry of historialSesiones) {
          for (const s of entry.series) {
            if (s.ejercicio_id === ejId && s.id !== serieId) {
              historialPesos.push(s.peso_kg);
            }
          }
        }
      }

      const evalRes = evaluarPlausibilidadSerie({
        peso,
        reps,
        historialPesos,
      });

      if (evalRes.estado === "bloqueado") {
        setErrorMessage(evalRes.error);
        return;
      }
      if (evalRes.estado === "requiere_confirmacion") {
        setAtypicalPrompt({
          mensaje: evalRes.mensaje,
          peso: evalRes.peso,
          reps: evalRes.reps,
        });
        return;
      }
    }

    await actualizarSerieHistorial(sesionId, serieId, peso, reps, Boolean(confirmarAtipica));
    setGuardadoExitoso(`Serie guardada (${peso} kg × ${reps} reps)`);
    setEditingSerie(null);
    setAtypicalPrompt(null);
    setTimeout(() => setGuardadoExitoso(null), 3000);
  };

  // Filtro de ejercicio para el mini-dashboard (inicializa con el primer ejercicio disponible)
  const primerEjercicioId = contratoDashboard.listaEjercicios[0]?.ejercicioId || "";
  const [selectedEjercicioId, setSelectedEjercicioId] = React.useState<string>(primerEjercicioId);

  React.useEffect(() => {
    if (!selectedEjercicioId && primerEjercicioId) {
      setSelectedEjercicioId(primerEjercicioId);
    }
  }, [primerEjercicioId, selectedEjercicioId]);

  const resumenEjercicioActual = selectedEjercicioId
    ? contratoDashboard.ejercicios[selectedEjercicioId]
    : null;

  return (
    <div className="space-y-4 pb-20" data-testid="historial-sesiones-container">
      {/* Encabezado y selector de pestañas táctil */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-foreground">
                Historial de Sesiones
              </h1>
              <p className="text-xs text-muted-foreground">
                Revisa tus entrenamientos y corrige registros en línea
              </p>
            </div>
          </div>

          {!isOnline && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500"
              title="Modo Avión: las correcciones se guardan localmente y se sincronizan al volver la conexión"
            >
              <CloudOff className="h-3.5 w-3.5" />
              <span>Offline (Modo Avión)</span>
            </div>
          )}
        </div>

        {/* Resumen numérico rápido (Poda de Volumen Total según GOZS-359) */}
        <div className="grid grid-cols-2 gap-2 pt-1 text-center">
          <div className="rounded-xl border border-border/60 bg-background/60 p-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sesiones Realizadas
            </span>
            <div className="font-mono text-xl font-black text-foreground">
              {sesiones.length}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Series Totales
            </span>
            <div className="font-mono text-xl font-black text-primary">
              {sesiones.reduce((acc, s) => acc + s.totalSeries, 0)}
            </div>
          </div>
        </div>

        {/* Selector de modo: Lista de Sesiones vs Mini-Dashboard */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTabActiva("sesiones")}
            className={`flex min-h-11 items-center justify-center rounded-lg transition-colors ${
              tabActiva === "sesiones"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-sesiones"
          >
            <Calendar className="mr-1.5 h-4 w-4" />
            Por Sesión
          </button>
          <button
            type="button"
            onClick={() => setTabActiva("dashboard")}
            className={`flex min-h-11 items-center justify-center rounded-lg transition-colors ${
              tabActiva === "dashboard"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-dashboard"
          >
            <TrendingUp className="mr-1.5 h-4 w-4" />
            Progreso (Mini-Dash)
          </button>
        </div>
      </div>

      {/* Feedback Toast de guardado */}
      {guardadoExitoso && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in slide-in-from-top-1"
          data-testid="toast-guardado-exitoso"
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>{guardadoExitoso}</span>
        </div>
      )}

      {/* VISTA 1: LISTADO CRONOLÓGICO DE SESIONES */}
      {tabActiva === "sesiones" && (
        <div className="space-y-3">
          {sesiones.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center">
              <Dumbbell className="h-10 w-10 text-muted-foreground/60 mb-2" />
              <h2 className="text-base font-bold text-foreground">
                No hay sesiones completadas aún
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Cuando finalices tus entrenamientos en vivo aparecerán aquí con su detalle de series y cargas.
              </p>
              <Link
                href="/athlete"
                className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
              >
                Comenzar a entrenar
              </Link>
            </div>
          ) : (
            sesiones.map((sesion) => {
              const isExpanded =
                expandedIds[sesion.id] !== undefined
                  ? !!expandedIds[sesion.id]
                  : sesion.id === sesiones[0]?.id;
              return (
                <div
                  key={sesion.id}
                  className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-all"
                  data-testid={`sesion-card-${sesion.id}`}
                >
                  {/* Encabezado colapsable táctil min-h-12 */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(sesion.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full min-h-12 items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    data-testid={`btn-expand-sesion-${sesion.id}`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-foreground">
                          {sesion.encabezado}
                        </span>
                        {sesion.motivoCambioDia && (
                          <span
                            className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"
                            data-testid="badge-cambio-dia"
                          >
                            Cambio de día
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                        <span>{sesion.totalEjercicios} ejercicios</span>
                        <span>·</span>
                        <span>{sesion.totalSeries} series</span>
                      </div>
                    </div>

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </div>
                  </button>

                  {/* Detalle de ejercicios y series al expandir */}
                  {isExpanded && (
                    <div
                      className="border-t border-border/70 bg-background/50 p-4 space-y-4"
                      data-testid={`detalle-sesion-${sesion.id}`}
                    >
                      {sesion.ejercicios.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          Sin series registradas en esta sesión.
                        </p>
                      ) : (
                        sesion.ejercicios.map((ej) => (
                          <div
                            key={ej.ejercicioId}
                            className="space-y-2 rounded-xl border border-border/60 bg-card p-3"
                          >
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span>{ej.ejercicioNombre}</span>
                              </h3>
                              <span className="text-[11px] font-mono font-semibold text-muted-foreground">
                                Máx: {ej.maxPesoKg} kg
                              </span>
                            </div>

                            {/* Lista de series del ejercicio */}
                            <div className="space-y-1.5">
                              {ej.series.map((s) => {
                                const isEditingThis =
                                  editingSerie?.sesionId === sesion.id &&
                                  editingSerie?.serieId === s.id;

                                return (
                                  <div
                                    key={s.id}
                                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                                      isEditingThis
                                        ? "border-primary bg-primary/5"
                                        : "border-border/50 bg-background/70"
                                    }`}
                                    data-testid={`serie-item-${s.id}`}
                                  >
                                    {isEditingThis ? (
                                      /* FORMULARIO DE EDICIÓN EN LÍNEA */
                                      <div
                                        className="flex w-full items-center justify-between gap-2 flex-wrap"
                                        data-testid={`form-editar-serie-${s.id}`}
                                      >
                                        <div className="flex items-center gap-1 font-bold text-xs">
                                          <span className="text-muted-foreground font-mono">
                                            #{s.numeroSerie}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              step="0.5"
                                              min="0"
                                              value={editingSerie.peso}
                                              onChange={(e) =>
                                                setEditingSerie((prev) =>
                                                  prev
                                                    ? {
                                                        ...prev,
                                                        peso: Number(e.target.value) || 0,
                                                      }
                                                    : null,
                                                )
                                              }
                                              aria-label="Peso en kilogramos"
                                              className="h-11 w-20 min-h-[44px] rounded-lg border border-input bg-background px-2 text-center font-mono text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                                              data-testid={`input-peso-${s.id}`}
                                            />
                                            <span className="text-[11px] text-muted-foreground">
                                              kg
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              step="1"
                                              min="0"
                                              max="100"
                                              inputMode="numeric"
                                              value={editingSerie.reps}
                                              onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                setEditingSerie((prev) =>
                                                  prev
                                                    ? {
                                                        ...prev,
                                                        reps: isNaN(val) ? 0 : val,
                                                      }
                                                    : null,
                                                );
                                              }}
                                              aria-label="Repeticiones realizadas"
                                              className="h-11 w-16 min-h-[44px] rounded-lg border border-input bg-background px-2 text-center font-mono text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                                              data-testid={`input-reps-${s.id}`}
                                            />
                                            <span className="text-[11px] text-muted-foreground">
                                              reps
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleSaveEdit(false)}
                                            aria-label="Guardar corrección"
                                            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-transform"
                                            data-testid={`btn-guardar-serie-${s.id}`}
                                          >
                                            <Check className="h-4 w-4 mr-1" />
                                            Guardar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            aria-label="Cancelar edición"
                                            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-muted px-2.5 text-xs font-bold text-muted-foreground hover:bg-muted/80"
                                            data-testid={`btn-cancelar-serie-${s.id}`}
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        </div>
                                        {errorMessage && (
                                          <div
                                            role="alert"
                                            className="w-full text-xs text-destructive font-semibold flex items-center gap-1.5 pt-1"
                                            data-testid="historial-edit-error"
                                          >
                                            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                                            <span>{errorMessage}</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      /* VISTA NORMAL DE SERIE */
                                      <>
                                        <div className="flex items-center gap-2">
                                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-mono font-bold text-muted-foreground">
                                            {s.numeroSerie}
                                          </span>

                                          {/* Badge tipo de serie */}
                                          <span
                                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                              s.setType === "WARMUP" || s.setType === "W"
                                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                                : s.setType === "FAILURE" || s.setType === "F"
                                                ? "bg-destructive/15 text-destructive font-black"
                                                : s.setType === "DROPSET" || s.setType === "D"
                                                ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                                                : "bg-primary/10 text-primary"
                                            }`}
                                          >
                                            {s.setType === "WARMUP" || s.setType === "W"
                                              ? "W"
                                              : s.setType === "FAILURE" || s.setType === "F"
                                              ? "Fallo"
                                              : s.setType === "DROPSET" || s.setType === "D"
                                              ? "Drop"
                                              : "Normal"}
                                          </span>

                                          <div className="flex items-baseline gap-1.5">
                                            <span className="font-mono font-bold text-foreground">
                                              {s.pesoKg} kg
                                            </span>
                                            <span className="text-muted-foreground">×</span>
                                            <span className="font-mono font-bold text-foreground">
                                              {s.repsHechas} reps
                                            </span>
                                            {s.rpeReal && (
                                              <span className="text-[11px] text-muted-foreground">
                                                @ RPE {s.rpeReal}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                                            <span>1RM: {Math.round(s.estimated1RM)} kg</span>
                                            <Tooltip1RM size="sm" />
                                          </span>

                                          <button
                                            type="button"
                                            onClick={() => handleStartEdit(sesion.id, s)}
                                            aria-label={`Editar serie ${s.numeroSerie} de ${ej.ejercicioNombre}`}
                                            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                            data-testid={`btn-editar-serie-${s.id}`}
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VISTA 2: MINI-DASHBOARD ANALÍTICO DE PROGRESIÓN POR EJERCICIO */}
      {tabActiva === "dashboard" && (
        <div className="space-y-4" data-testid="mini-dashboard-container">
          <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="select-ejercicio-dashboard"
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                Ejercicio para Analizar
              </label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {contratoDashboard.listaEjercicios.length} ejercicios registrados
              </span>
            </div>

            {/* Selector nativo ergonómico */}
            <select
              id="select-ejercicio-dashboard"
              value={selectedEjercicioId}
              onChange={(e) => setSelectedEjercicioId(e.target.value)}
              className="w-full h-12 rounded-xl border border-input bg-background px-3 text-sm font-bold text-foreground focus:border-primary focus:outline-none"
              data-testid="select-ejercicio-dashboard"
            >
              {contratoDashboard.listaEjercicios.map((ej) => (
                <option key={ej.ejercicioId} value={ej.ejercicioId}>
                  {ej.ejercicioNombre} ({ej.totalSesiones} {ej.totalSesiones === 1 ? "sesión" : "sesiones"})
                </option>
              ))}
            </select>
          </div>

          {resumenEjercicioActual ? (
            <div className="space-y-3" data-testid="metricas-ejercicio-dashboard">
              {/* Tarjetas de Récords y Métricas (Poda de Volumen Total en UI según GOZS-359) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/80 bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span>Récord de Carga</span>
                  </div>
                  <div className="mt-1 font-mono text-2xl font-black text-foreground">
                    {resumenEjercicioActual.recordPesoKg}{" "}
                    <span className="text-xs font-bold text-muted-foreground">kg</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-card p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                    <div className="flex items-center gap-1.5">
                      <Flame className="h-4 w-4 text-rose-500" />
                      <span>Mejor 1RM (Epley)</span>
                    </div>
                    <Tooltip1RM size="sm" />
                  </div>
                  <div className="mt-1 font-mono text-2xl font-black text-foreground">
                    {Math.round(resumenEjercicioActual.record1RM)}{" "}
                    <span className="text-xs font-bold text-muted-foreground">kg</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span>Máx. Repeticiones</span>
                  </div>
                  <div className="mt-1 font-mono text-2xl font-black text-foreground">
                    {resumenEjercicioActual.recordReps}{" "}
                    <span className="text-xs font-bold text-muted-foreground">reps</span>
                  </div>
                </div>
              </div>

              {/* Historial cronológico de progresión por fecha */}
              <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Evolución en el tiempo ({resumenEjercicioActual.puntos.length} puntos)
                </h4>

                <div className="space-y-2">
                  {resumenEjercicioActual.puntos.map((punto, idx) => (
                    <div
                      key={`${punto.sesionId}-${idx}`}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-xs"
                      data-testid={`punto-progresion-${idx}`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-foreground">
                          {punto.fechaLegible}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {punto.diaNombre} · {punto.seriesCount} {punto.seriesCount === 1 ? "serie" : "series"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono text-sm font-black text-primary">
                          {punto.maxPesoKg} kg
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground inline-flex items-center gap-1 justify-end">
                          <span>1RM: {Math.round(punto.bestEstimated1RM)} kg</span>
                          <Tooltip1RM size="sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center text-xs text-muted-foreground">
              Selecciona un ejercicio para ver su curva de progresión y métricas clave.
            </div>
          )}
        </div>
      )}

      {/* Diálogo HTML5 nativo para confirmación de serie atípica (GOZS-200) */}
      <dialog
        ref={atypicalDialogRef}
        className="fixed inset-0 m-auto z-50 rounded-2xl bg-card p-6 text-card-foreground shadow-2xl backdrop:bg-black/60 max-w-sm w-[90%] border border-border space-y-4"
        data-testid="historial-atypical-dialog"
        onClose={() => setAtypicalPrompt(null)}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-500 font-bold text-base">
            <TriangleAlert className="h-5 w-5" />
            <span>Carga atípica</span>
          </div>
          <p className="text-sm font-semibold text-foreground">
            {atypicalPrompt?.mensaje}
          </p>
          <p className="text-xs text-muted-foreground">
            Ingresaste {atypicalPrompt?.peso} kg ({atypicalPrompt?.reps} reps). ¿Deseas confirmarlo como serie atípica o corregir el valor?
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setAtypicalPrompt(null)}
            className="min-h-[44px] px-4 py-2 text-xs font-bold rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-all touch-manipulation cursor-pointer"
            data-testid="historial-atypical-corregir-btn"
          >
            Corregir
          </button>
          <button
            type="button"
            onClick={() => handleSaveEdit(true)}
            className="min-h-[44px] px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:brightness-105 active:scale-95 transition-all touch-manipulation cursor-pointer"
            data-testid="historial-atypical-confirmar-btn"
          >
            Confirmar
          </button>
        </div>
      </dialog>
    </div>
  );
}
