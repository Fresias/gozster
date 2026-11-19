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
import { CloudOff, History, Info, Pencil, Trophy, TriangleAlert, X } from "@/components/athlete/icons";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import { evaluarPlausibilidadSerie } from "@/lib/plausibilidad-series";

export interface HistorialSesionesProps {
  offline?: boolean;
  initialTab?: "sesiones" | "dashboard";
}

const ZONA = "America/Argentina/Buenos_Aires";
const numero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const esAproximacion = (t: string) => t === "WARMUP" || t === "W";

function tipoDeSerie(setType: string): string | null {
  if (esAproximacion(setType)) return "Aproximación";
  if (setType === "FAILURE" || setType === "F") return "Fallo";
  if (setType === "DROPSET" || setType === "D") return "Drop";
  return null;
}

function diaYMes(fecha: string): { dia: string; mes: string } {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return { dia: "–", mes: "" };
  return {
    dia: d.toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric" }),
    mes: d.toLocaleDateString("es-AR", { timeZone: ZONA, month: "short" }).replace(".", "").toUpperCase(),
  };
}

/** Récords por sesión: ejercicios cuyo peso máximo (sin aproximaciones) supera a todo lo anterior. */
function contarRecordsPorSesion(sesiones: SesionHistoricaDetalle[]): Record<string, number> {
  const cronologicas = [...sesiones].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const maxPrevio = new Map<string, number>();
  const resultado: Record<string, number> = {};
  for (const sesion of cronologicas) {
    let n = 0;
    for (const ej of sesion.ejercicios) {
      const pesos = ej.series.filter((s) => !esAproximacion(s.setType)).map((s) => s.pesoKg);
      if (pesos.length === 0) continue;
      const mejor = Math.max(...pesos);
      const previo = maxPrevio.get(ej.ejercicioId);
      if (previo !== undefined && mejor > previo) n += 1;
      maxPrevio.set(ej.ejercicioId, Math.max(previo ?? 0, mejor));
    }
    resultado[sesion.id] = n;
  }
  return resultado;
}

interface SerieEnEdicion {
  sesionId: string;
  serieId: string;
  ejercicioNombre: string;
  numeroSerie: number;
  fechaLegible: string;
  peso: number;
  reps: number;
}

export function HistorialSesiones({ offline, initialTab = "sesiones" }: HistorialSesionesProps = {}) {
  const historialSesiones = useAthleteStore((s) => s.historialSesiones);
  const cargarHistorialSesiones = useAthleteStore((s) => s.cargarHistorialSesiones);
  const actualizarSerieHistorial = useAthleteStore((s) => s.actualizarSerieHistorial);
  const currentSession = useAthleteStore((s) => s.currentSession);
  const planDias = useAthleteStore((s) => s.planAlumno?.dias);
  const vista = useAthleteStore((s) => s.nivelVistaAlumno);
  const storeIsOnline = useOfflineQueueStore((s) => s.isOnline);
  const isOnline = offline !== undefined ? !offline : storeIsOnline;
  const esTecnica = vista === "TECNICA";

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

  const recordsPorSesion = React.useMemo(() => contarRecordsPorSesion(sesiones), [sesiones]);

  // Contrato estructurado para el análisis por ejercicio
  const contratoDashboard = React.useMemo(() => {
    return generarContratoMiniDashboard(historialSesiones, currentSession.studentId, planDias ?? []);
  }, [historialSesiones, currentSession.studentId, planDias]);

  const [tabActiva, setTabActiva] = React.useState<"sesiones" | "dashboard">(initialTab);

  // Acordeón: la sesión más reciente arranca abierta.
  const [expandedIds, setExpandedIds] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (sesiones.length > 0 && Object.keys(expandedIds).length === 0) {
      setExpandedIds({ [sesiones[0]!.id]: true });
    }
  }, [sesiones, expandedIds]);

  const toggleExpand = (sesionId: string) => {
    setExpandedIds((prev) => ({ ...prev, [sesionId]: !prev[sesionId] }));
  };

  // Hoja "Corregir serie"
  const [editingSerie, setEditingSerie] = React.useState<SerieEnEdicion | null>(null);
  // Series corregidas en esta sesión de la app. Deuda (02 §5): no hay columna para el valor original en registro_series.
  const [corregidas, setCorregidas] = React.useState<Set<string>>(() => new Set());
  const [guardadoExitoso, setGuardadoExitoso] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [atypicalPrompt, setAtypicalPrompt] = React.useState<{
    mensaje: string;
    peso: number;
    reps: number;
  } | null>(null);
  const atypicalDialogRef = React.useRef<HTMLDialogElement>(null);
  const tituloHojaRef = React.useRef<HTMLHeadingElement>(null);
  const disparadorRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (atypicalPrompt) {
      if (!atypicalDialogRef.current?.open) atypicalDialogRef.current?.showModal();
    } else {
      if (atypicalDialogRef.current?.open) atypicalDialogRef.current?.close();
    }
  }, [atypicalPrompt]);

  const hojaAbierta = editingSerie !== null;
  React.useEffect(() => {
    if (hojaAbierta) tituloHojaRef.current?.focus();
  }, [hojaAbierta]);

  const handleStartEdit = (sesion: SesionHistoricaDetalle, ejercicioNombre: string, s: SerieHistoricaDetalle) => {
    setErrorMessage(null);
    disparadorRef.current = document.activeElement as HTMLElement | null;
    setEditingSerie({
      sesionId: sesion.id,
      serieId: s.id,
      ejercicioNombre,
      numeroSerie: s.numeroSerie,
      fechaLegible: sesion.fechaLegible,
      peso: s.pesoKg,
      reps: s.repsHechas,
    });
  };

  const cerrarHoja = () => {
    setEditingSerie(null);
    setErrorMessage(null);
    disparadorRef.current?.focus();
  };

  const ajustar = (campo: "peso" | "reps", delta: number) => {
    setEditingSerie((prev) =>
      prev ? { ...prev, [campo]: Math.max(0, Number((prev[campo] + delta).toFixed(2))) } : null,
    );
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

      const evalRes = evaluarPlausibilidadSerie({ peso, reps, historialPesos });

      if (evalRes.estado === "bloqueado") {
        setErrorMessage(evalRes.error);
        return;
      }
      if (evalRes.estado === "requiere_confirmacion") {
        setAtypicalPrompt({ mensaje: evalRes.mensaje, peso: evalRes.peso, reps: evalRes.reps });
        return;
      }
    }

    await actualizarSerieHistorial(sesionId, serieId, peso, reps, Boolean(confirmarAtipica));
    setCorregidas((prev) => new Set(prev).add(serieId));
    setGuardadoExitoso(`Serie guardada (${peso} kg × ${reps} reps)`);
    setEditingSerie(null);
    setAtypicalPrompt(null);
    disparadorRef.current?.focus();
    setTimeout(() => setGuardadoExitoso(null), 3000);
  };

  // Filtro de ejercicio para la vista por ejercicio
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

  const totalSeries = sesiones.reduce((acc, s) => acc + s.totalSeries, 0);
  const fechaDatos = sesiones[0] ? new Date(sesiones[0].fecha) : null;
  const fechaDatosTexto =
    fechaDatos && !Number.isNaN(fechaDatos.getTime())
      ? fechaDatos.toLocaleDateString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit" })
      : null;

  return (
    <div className="grid gap-4 pb-20" data-testid="historial-sesiones-container">
      {/* Cabecera invertida de noche */}
      <section className="a-hhero">
        <h1 className="a-t-d">Historial</h1>
        {sesiones.length > 0 && (
          <small className="a-t-sec">Tus sesiones y series. Si cargaste algo mal, lo podés corregir.</small>
        )}
        <div className="a-stats">
          <div>
            <div className="a-t-mm">{sesiones.length}</div>
            <small className="a-t-label">Sesiones</small>
          </div>
          <div>
            <div className="a-t-mm">{totalSeries}</div>
            <small className="a-t-label">Series</small>
          </div>
        </div>
      </section>

      {!isOnline && (
        <p className="a-eb a-t-label a-offnote" data-testid="historial-sin-conexion" style={{ justifySelf: "start" }}>
          <CloudOff width={12} height={12} aria-hidden="true" />
          Sin conexión{fechaDatosTexto ? ` · datos del ${fechaDatosTexto}` : ""}
        </p>
      )}

      {sesiones.length > 0 && (
        <div className="a-seg" role="group" aria-label="Agrupar historial">
          <button
            type="button"
            onClick={() => setTabActiva("sesiones")}
            aria-pressed={tabActiva === "sesiones"}
            data-testid="tab-sesiones"
          >
            Por sesión
          </button>
          <button
            type="button"
            onClick={() => setTabActiva("dashboard")}
            aria-pressed={tabActiva === "dashboard"}
            data-testid="tab-dashboard"
          >
            Por ejercicio
          </button>
        </div>
      )}

      {guardadoExitoso && (
        <p role="status" aria-live="polite" className="a-info a-t-sec" data-testid="toast-guardado-exitoso">
          <Info width={18} height={18} aria-hidden="true" />
          <span>{guardadoExitoso}</span>
        </p>
      )}

      {/* VISTA 1: sesiones */}
      {(tabActiva === "sesiones" || sesiones.length === 0) &&
        (sesiones.length === 0 ? (
          <section className="a-card a-state" data-testid="historial-vacio">
            <span className="a-ic">
              <History width={24} height={24} aria-hidden="true" />
            </span>
            <h2 className="a-t-title">Todavía no hay sesiones</h2>
            <p className="a-t-sec">Cuando termines un entrenamiento, aparece acá con sus series y cargas.</p>
            <Link href="/athlete" className="a-btn">
              Empezar a entrenar
            </Link>
          </section>
        ) : (
          sesiones.map((sesion, i) => {
            const isExpanded =
              expandedIds[sesion.id] !== undefined ? !!expandedIds[sesion.id] : sesion.id === sesiones[0]?.id;
            const { dia, mes } = diaYMes(sesion.fecha);
            const prs = recordsPorSesion[sesion.id] ?? 0;
            return (
              <article className="a-hcard" key={sesion.id} data-testid={`sesion-card-${sesion.id}`}>
                <div className={`a-date${i === 0 ? " a-cur" : ""}`}>
                  <span className="a-t-mm" style={{ fontSize: "1.5rem" }}>
                    {dia}
                  </span>
                  <small className="a-t-label">{mes}</small>
                </div>
                <div className="a-hbody">
                  <div className="a-ht">
                    <b className="a-t-bs">{sesion.diaNombre}</b>
                    {prs > 0 && (
                      <span className="a-chip a-pr a-t-label" data-testid="chip-pr">
                        <Trophy width={12} height={12} aria-hidden="true" /> {prs} PR
                      </span>
                    )}
                    {sesion.motivoCambioDia && (
                      <span className="a-chip a-line a-t-label" data-testid="badge-cambio-dia">
                        Cambio de día
                      </span>
                    )}
                  </div>
                  <small className="a-t-sec a-muted">
                    {sesion.totalEjercicios} ejercicios · {sesion.totalSeries} series
                  </small>

                  {isExpanded && (
                    <div data-testid={`detalle-sesion-${sesion.id}`}>
                      {sesion.ejercicios.length === 0 ? (
                        <p className="a-t-sec a-muted">Sin series registradas en esta sesión.</p>
                      ) : (
                        sesion.ejercicios.map((ej) => (
                          <React.Fragment key={ej.ejercicioId}>
                            <p className="a-exn">
                              <b className="a-t-bs">{ej.ejercicioNombre}</b>
                              <span className="a-t-label a-muted">Máx {numero.format(ej.maxPesoKg)} kg</span>
                            </p>
                            <div style={{ display: "grid", gap: 6 }}>
                              {ej.series.map((s) => {
                                const tipo = tipoDeSerie(s.setType);
                                return (
                                  <div className="a-srow a-t-sec" key={s.id} data-testid={`serie-item-${s.id}`}>
                                    <span className="a-sn">{s.numeroSerie}</span>
                                    <b>
                                      {numero.format(s.pesoKg)} kg × {s.repsHechas}
                                    </b>
                                    {esTecnica && s.rpeReal ? (
                                      <span className="a-muted">RPE {numero.format(s.rpeReal)}</span>
                                    ) : null}
                                    {tipo && <span className="a-chip a-t-label">{tipo}</span>}
                                    {corregidas.has(s.id) && (
                                      <span className="a-chip a-line a-t-label">Corregida</span>
                                    )}
                                    <button
                                      type="button"
                                      className="a-ed"
                                      onClick={() => handleStartEdit(sesion, ej.ejercicioNombre, s)}
                                      aria-label={`Corregir serie ${s.numeroSerie} de ${ej.ejercicioNombre}`}
                                      data-testid={`btn-editar-serie-${s.id}`}
                                    >
                                      <Pencil width={15} height={15} aria-hidden="true" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </React.Fragment>
                        ))
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="a-link"
                    style={{ justifySelf: "start", paddingLeft: 0 }}
                    onClick={() => toggleExpand(sesion.id)}
                    aria-expanded={isExpanded}
                    data-testid={`btn-expand-sesion-${sesion.id}`}
                  >
                    {isExpanded ? "Ver menos" : "Ver series y corregir"}
                  </button>
                </div>
              </article>
            );
          })
        ))}

      {/* VISTA 2: por ejercicio */}
      {tabActiva === "dashboard" && sesiones.length > 0 && (
        <div className="grid gap-3" data-testid="mini-dashboard-container">
          <label className="a-t-label a-muted" htmlFor="select-ejercicio-dashboard">
            Ejercicio para analizar
          </label>
          <select
            id="select-ejercicio-dashboard"
            className="a-sel-native"
            value={selectedEjercicioId}
            onChange={(e) => setSelectedEjercicioId(e.target.value)}
            data-testid="select-ejercicio-dashboard"
          >
            {contratoDashboard.listaEjercicios.map((ej) => (
              <option key={ej.ejercicioId} value={ej.ejercicioId}>
                {ej.ejercicioNombre} ({ej.totalSesiones} {ej.totalSesiones === 1 ? "sesión" : "sesiones"})
              </option>
            ))}
          </select>

          {resumenEjercicioActual ? (
            <div className="grid gap-3" data-testid="metricas-ejercicio-dashboard">
              <div className="a-tiles">
                <div className="a-card a-tile">
                  <span className="a-t-label a-muted">Récord de carga</span>
                  <span className="a-t-mm">
                    {numero.format(resumenEjercicioActual.recordPesoKg)}
                    <span className="a-t-sec a-muted"> kg</span>
                  </span>
                </div>
                <div className="a-card a-tile">
                  <span className="a-t-label a-muted">Máx. repeticiones</span>
                  <span className="a-t-mm">
                    {resumenEjercicioActual.recordReps}
                    <span className="a-t-sec a-muted"> reps</span>
                  </span>
                </div>
                {esTecnica && (
                  <div className="a-card a-tile" style={{ gridColumn: "1 / 3" }}>
                    <span className="a-t-label a-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Mejor 1RM estimado (Epley)
                      <Tooltip1RM size="sm" />
                    </span>
                    <span className="a-t-mm">
                      {Math.round(resumenEjercicioActual.record1RM)}
                      <span className="a-t-sec a-muted"> kg</span>
                    </span>
                  </div>
                )}
              </div>

              <p className="a-eb a-t-label">
                Evolución · {resumenEjercicioActual.puntos.length}{" "}
                {resumenEjercicioActual.puntos.length === 1 ? "sesión" : "sesiones"}
              </p>
              {resumenEjercicioActual.puntos.map((punto, idx) => (
                <div className="a-card a-row" key={`${punto.sesionId}-${idx}`} data-testid={`punto-progresion-${idx}`}>
                  <span className="a-rt">
                    <b className="a-t-bs">{punto.fechaLegible}</b>
                    <small className="a-t-sec">
                      {punto.diaNombre} · {punto.seriesCount} {punto.seriesCount === 1 ? "serie" : "series"}
                      {esTecnica ? ` · 1RM ${Math.round(punto.bestEstimated1RM)} kg` : ""}
                    </small>
                  </span>
                  <span className="a-t-bs">{numero.format(punto.maxPesoKg)} kg</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="a-t-sec a-muted">Elegí un ejercicio para ver su evolución y sus récords.</p>
          )}
        </div>
      )}

      {/* Hoja "Corregir serie" */}
      {editingSerie && (
        <div
          className="a-sheet-wrap"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarHoja();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") cerrarHoja();
          }}
        >
          <div
            className="a-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hist-fix-titulo"
            data-testid={`form-editar-serie-${editingSerie.serieId}`}
          >
            <div className="a-sh-h">
              <div>
                <h2 id="hist-fix-titulo" ref={tituloHojaRef} className="a-t-h" tabIndex={-1}>
                  Corregir serie
                </h2>
                <span className="a-t-sec a-muted">
                  {editingSerie.ejercicioNombre} · serie {editingSerie.numeroSerie} · {editingSerie.fechaLegible}
                </span>
              </div>
              <button
                type="button"
                className="a-icon-btn"
                onClick={cerrarHoja}
                aria-label="Cerrar"
                data-testid={`btn-cancelar-serie-${editingSerie.serieId}`}
              >
                <X width={18} height={18} aria-hidden="true" />
              </button>
            </div>

            <span className="a-t-label a-muted">Peso</span>
            <div className="a-stepper">
              <button type="button" onClick={() => ajustar("peso", -2.5)} aria-label="Restar 2,5 kg">
                −2,5
              </button>
              <div className="a-val">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  inputMode="decimal"
                  autoComplete="off"
                  className="a-t-mi"
                  style={{ ["--n" as string]: String(numero.format(editingSerie.peso).length) }}
                  value={editingSerie.peso}
                  onChange={(e) =>
                    setEditingSerie((prev) => (prev ? { ...prev, peso: Number(e.target.value) || 0 } : null))
                  }
                  aria-label="Peso en kilogramos"
                  data-testid={`input-peso-${editingSerie.serieId}`}
                />
                <span className="a-t-sec">kg</span>
              </div>
              <button type="button" onClick={() => ajustar("peso", 2.5)} aria-label="Sumar 2,5 kg">
                +2,5
              </button>
            </div>

            <span className="a-t-label a-muted">Repeticiones</span>
            <div className="a-stepper a-sm">
              <button type="button" onClick={() => ajustar("reps", -1)} aria-label="Restar una repetición">
                −1
              </button>
              <div className="a-val">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  inputMode="numeric"
                  autoComplete="off"
                  className="a-t-mi"
                  style={{ ["--n" as string]: String(editingSerie.reps).length }}
                  value={editingSerie.reps}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setEditingSerie((prev) => (prev ? { ...prev, reps: Number.isNaN(val) ? 0 : val } : null));
                  }}
                  aria-label="Repeticiones realizadas"
                  data-testid={`input-reps-${editingSerie.serieId}`}
                />
                <span className="a-t-sec">reps</span>
              </div>
              <button type="button" onClick={() => ajustar("reps", 1)} aria-label="Sumar una repetición">
                +1
              </button>
            </div>

            {errorMessage && (
              <p role="alert" className="a-info a-t-sec" data-testid="historial-edit-error">
                <TriangleAlert width={18} height={18} aria-hidden="true" />
                <span>{errorMessage}</span>
              </p>
            )}
            <p className="a-info a-t-sec">
              <Info width={18} height={18} aria-hidden="true" />
              <span>La serie queda marcada como corregida y tu coach ve el valor original.</span>
            </p>
            <button
              type="button"
              className="a-btn a-gym"
              onClick={() => handleSaveEdit(false)}
              data-testid={`btn-guardar-serie-${editingSerie.serieId}`}
            >
              Guardar corrección
            </button>
          </div>
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
          <div className="flex items-center gap-2 font-bold text-base">
            <TriangleAlert className="h-5 w-5" />
            <span>Carga atípica</span>
          </div>
          <p className="text-sm font-semibold text-foreground">{atypicalPrompt?.mensaje}</p>
          <p className="text-xs text-muted-foreground">
            Ingresaste {atypicalPrompt?.peso} kg ({atypicalPrompt?.reps} reps). ¿Querés confirmarlo como serie atípica o corregir el valor?
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
