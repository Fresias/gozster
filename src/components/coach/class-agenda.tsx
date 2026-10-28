"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { COLOR_ACTIVIDAD, DaysStrip, NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";
import {
  claveDia,
  detectarSolapes,
  diasDeLaSemana,
  diasDelMes,
  horaLocal,
  ocupaCupo,
  semanaEnCurso,
} from "@/lib/clases";
import { DEMO_ALUMNOS, DEMO_ALUMNOS_CLASES } from "@/services/coach-demo-dataset";
import { useClasesStore, type VistaAgenda } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import type { ActividadClase } from "@/types/database.types";
import { AgendaResumenPanel } from "@/components/coach/agenda-resumen-panel";
import { AgendaReservasTable } from "@/components/coach/agenda-reservas-table";

const MOTIVO_MINIMO = 5;

// Coach Studio · Agenda de Clases (#113 / GH #122 / GOZS-184 / GOZS-190):
// Vistas semana/día/mes, navegación por rango visible, creación, movimiento y redimensión
// de clases con cupo flexible, panel de resumen semanal y tabla de reservas.
export function ClassAgenda() {
  const router = useRouter();

  const {
    vista,
    setVista,
    clases,
    agendaReservas,
    testAhora,
    cargando,
    accionEnCurso,
    error,
    aviso,
    cargarAgenda,
    marcarAusente,
    cancelarClase,
    crearClase,
    moverClase,
    redimensionarClase,
    actualizarCupoClase,
    anotarAlumnoCoach,
    quitarAnotadoCoach,
    limpiarMensajes,
  } = useClasesStore();

  const isOnline = useOfflineQueueStore((s) => s.isOnline);
  const mode = useWorkspaceModeStore((s) => s.mode);
  const isTestMode = mode === "TESTEO";

  const ahoraMs = testAhora ? new Date(testAhora).getTime() : Date.now();
  const hoy = claveDia(new Date(ahoraMs));

  // Fecha de referencia para navegación coherente
  const [fechaReferencia, setFechaReferencia] = React.useState<Date>(() => new Date(ahoraMs));
  const [dia, setDia] = React.useState(hoy);
  const [claseId, setClaseId] = React.useState<string | null>(null);

  // Filtro de estado para la tabla de reservas
  const [filtroTabla, setFiltroTabla] = React.useState<
    "todas" | "confirmadas" | "ausentes" | "canceladas"
  >("todas");

  // Sincronizar fechaReferencia si testAhora cambia desde el exterior
  React.useEffect(() => {
    if (testAhora) {
      const d = new Date(testAhora);
      setFechaReferencia(d);
      setDia(claveDia(d));
    }
  }, [testAhora]);

  // Días de la semana y del mes calculados según fechaReferencia
  const dias = React.useMemo(() => diasDeLaSemana(fechaReferencia), [fechaReferencia]);
  const diasMes = React.useMemo(() => diasDelMes(fechaReferencia), [fechaReferencia]);

  // Rango visible según la vista activa (Día, Semana o Mes)
  const rangoVisible = React.useMemo(() => {
    if (vista === "dia") {
      const inicio = new Date(`${dia}T00:00:00-03:00`);
      const fin = new Date(`${dia}T23:59:59.999-03:00`);
      return { inicio, fin };
    }
    if (vista === "mes") {
      const y = fechaReferencia.getFullYear();
      const m = fechaReferencia.getMonth();
      const inicio = new Date(y, m, 1, 0, 0, 0, 0);
      const fin = new Date(y, m + 1, 0, 23, 59, 59, 999);
      return { inicio, fin };
    }
    // "semana" (default)
    return semanaEnCurso(fechaReferencia);
  }, [vista, dia, fechaReferencia]);

  // Clases y reservas dentro del rango visible
  const clasesEnRango = React.useMemo(() => {
    const tInicio = rangoVisible.inicio.getTime();
    const tFin = rangoVisible.fin.getTime();
    return clases.filter((c) => {
      const t = new Date(c.inicio).getTime();
      return t >= tInicio && t <= tFin;
    });
  }, [clases, rangoVisible]);

  const claseIdsEnRango = React.useMemo(
    () => new Set(clasesEnRango.map((c) => c.id)),
    [clasesEnRango],
  );

  const reservasEnRango = React.useMemo(() => {
    return agendaReservas.filter((r) => claseIdsEnRango.has(r.clase_id));
  }, [agendaReservas, claseIdsEnRango]);

  // Navegación: Hoy, Anterior, Siguiente
  const irAHoy = React.useCallback(() => {
    const d = new Date(ahoraMs);
    setFechaReferencia(d);
    setDia(claveDia(d));
    setClaseId(null);
  }, [ahoraMs]);

  const irAnterior = React.useCallback(() => {
    setFechaReferencia((prev) => {
      const next = new Date(prev);
      if (vista === "dia") {
        next.setDate(next.getDate() - 1);
      } else if (vista === "mes") {
        next.setMonth(next.getMonth() - 1);
      } else {
        next.setDate(next.getDate() - 7);
      }
      setDia(claveDia(next));
      setClaseId(null);
      return next;
    });
  }, [vista]);

  const irSiguiente = React.useCallback(() => {
    setFechaReferencia((prev) => {
      const next = new Date(prev);
      if (vista === "dia") {
        next.setDate(next.getDate() + 1);
      } else if (vista === "mes") {
        next.setMonth(next.getMonth() + 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      setDia(claveDia(next));
      setClaseId(null);
      return next;
    });
  }, [vista]);

  // Atajos de teclado: T = hoy, flechas = navegar, D/S/M = vista
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.closest("dialog[open]"))
      ) {
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        irAHoy();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        irAnterior();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        irSiguiente();
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setVista("dia");
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setVista("semana");
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setVista("mes");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [irAHoy, irAnterior, irSiguiente, setVista]);

  // Escuchar evento de top bar de studio-shell para abrir modal de crear clase
  React.useEffect(() => {
    const handleOpen = () => {
      createDialogRef.current?.showModal();
    };
    window.addEventListener("gozster-open-create-class", handleOpen);
    return () => window.removeEventListener("gozster-open-create-class", handleOpen);
  }, []);

  // Estados de modales y formularios
  const [motivo, setMotivo] = React.useState("");
  const cancelDialogRef = React.useRef<HTMLDialogElement>(null);

  // Modal Crear Clase
  const createDialogRef = React.useRef<HTMLDialogElement>(null);
  const [crearActividad, setCrearActividad] = React.useState<ActividadClase>("FUNCIONAL");
  const [crearFecha, setCrearFecha] = React.useState(hoy);
  const [crearHora, setCrearHora] = React.useState("18:00");
  const [crearDuracion, setCrearDuracion] = React.useState(60);
  const [crearCapacidad, setCrearCapacidad] = React.useState<number | null>(6);
  const [crearSinLimite, setCrearSinLimite] = React.useState(false);

  // Modal Anotar Alumno
  const enrollDialogRef = React.useRef<HTMLDialogElement>(null);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = React.useState<string>("");
  const [advertenciaAnotacion, setAdvertenciaAnotacion] = React.useState<string | null>(null);
  const [requiereConfirmacion, setRequiereConfirmacion] = React.useState(false);

  // Edición directa de cupo
  const [editandoCupo, setEditandoCupo] = React.useState(false);
  const [nuevoCupo, setNuevoCupo] = React.useState<number>(3);

  // Edición de movimiento / hora
  const [editandoHora, setEditandoHora] = React.useState(false);
  const [nuevaHora, setNuevaHora] = React.useState<string>("18:00");

  React.useEffect(() => {
    if (isOnline || isTestMode) void cargarAgenda();
  }, [isOnline, isTestMode, cargarAgenda]);

  const delDia = clases.filter((c) => claveDia(c.inicio) === dia);
  const seleccionada = delDia.find((c) => c.id === claseId) ?? delDia[0] ?? null;
  const anotados = seleccionada ? agendaReservas.filter((r) => r.clase_id === seleccionada.id) : [];

  const ocupacion = (id: string) =>
    agendaReservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length;

  const solapes = React.useMemo(() => detectarSolapes(delDia), [delDia]);

  const claseIniciada = seleccionada
    ? new Date(seleccionada.inicio).getTime() <= ahoraMs
    : false;

  const listaAlumnos = React.useMemo(() => {
    const combinados = [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES];
    const unicos = new Map<string, (typeof combinados)[0]>();
    for (const a of combinados) {
      if (!unicos.has(a.id)) unicos.set(a.id, a);
    }
    return [...unicos.values()].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));
  }, []);

  const confirmarCancelacion = async () => {
    if (!seleccionada) return;
    if (await cancelarClase(seleccionada.id, motivo.trim())) {
      setMotivo("");
      cancelDialogRef.current?.close();
    }
  };

  const handleCrearClase = async (e: React.FormEvent) => {
    e.preventDefault();
    const fechaHora = `${crearFecha}T${crearHora}:00-03:00`;
    const nueva = await crearClase({
      actividad: crearActividad,
      inicio: new Date(fechaHora).toISOString(),
      duracion_minutos: crearDuracion,
      capacidad: crearSinLimite ? null : crearCapacidad,
    });
    setDia(crearFecha);
    setFechaReferencia(new Date(`${crearFecha}T12:00:00-03:00`));
    setClaseId(nueva.id);
    createDialogRef.current?.close();
  };

  const abrirAnotarAlumno = () => {
    setAlumnoSeleccionado(listaAlumnos[0]?.id ?? "");
    setAdvertenciaAnotacion(null);
    setRequiereConfirmacion(false);
    enrollDialogRef.current?.showModal();
  };

  const handleVerificarAnotar = async (forzar = false) => {
    if (!seleccionada || !alumnoSeleccionado) return;
    const res = await anotarAlumnoCoach(seleccionada.id, alumnoSeleccionado, forzar);
    if (!res.ok) {
      setAdvertenciaAnotacion(res.advertencia ?? "Advertencia al anotar alumno.");
      setRequiereConfirmacion(Boolean(res.requiereConfirmacion));
    } else {
      setAdvertenciaAnotacion(null);
      setRequiereConfirmacion(false);
      enrollDialogRef.current?.close();
    }
  };

  const guardarNuevoCupo = async () => {
    if (!seleccionada) return;
    await actualizarCupoClase(seleccionada.id, nuevoCupo > 0 ? nuevoCupo : null);
    setEditandoCupo(false);
  };

  const guardarNuevaHora = async () => {
    if (!seleccionada) return;
    const fechaSolo = claveDia(seleccionada.inicio);
    const nuevoIso = new Date(`${fechaSolo}T${nuevaHora}:00-03:00`).toISOString();
    await moverClase(seleccionada.id, nuevoIso);
    setEditandoHora(false);
  };

  const handleVerAusentes = () => {
    setFiltroTabla("ausentes");
    const el = document.querySelector('[data-testid="agenda-reservas-table"]');
    el?.scrollIntoView({ behavior: "smooth" });
  };

  // Cabecera: Mes y año (ej. Octubre 2026) y rango de fechas
  const mesAnioTexto = React.useMemo(() => {
    const raw = fechaReferencia.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [fechaReferencia]);

  const subLabelRango = React.useMemo(() => {
    if (vista === "dia") {
      const d = new Date(`${dia}T12:00:00-03:00`);
      return d.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }
    if (vista === "mes") {
      return `Mes de ${fechaReferencia.toLocaleDateString("es-AR", { month: "long" })}`;
    }
    // vista === "semana"
    const { inicio, fin } = semanaEnCurso(fechaReferencia);
    const tmp = new Date(Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()));
    const dayNr = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayNr + 3);
    const firstThursday = tmp.getTime();
    tmp.setUTCMonth(0, 1);
    if (tmp.getUTCDay() !== 4) {
      tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay() + 7) % 7));
    }
    const numSemana = 1 + Math.ceil((firstThursday - tmp.getTime()) / 604800000);

    const fInicio = `${inicio.getDate()} ${inicio.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}`;
    const fFin = `${fin.getDate()} ${fin.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}`;

    return `Semana ${numSemana} · ${fInicio} – ${fFin}`;
  }, [vista, dia, fechaReferencia]);

  return (
    <section className="space-y-6" aria-labelledby="agenda-titulo" data-testid="class-agenda">
      {/* Cabecera del calendario (Sección 4) */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="agenda-titulo" className="text-xl sm:text-2xl font-black tracking-tight">
            {mesAnioTexto}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium font-mono">
            {subLabelRango}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Hoy */}
          <button
            type="button"
            onClick={irAHoy}
            className="h-9 rounded-lg border border-border/80 bg-card px-3 text-xs font-bold text-foreground hover:bg-muted transition-colors shadow-xs"
            data-testid="agenda-today-btn"
          >
            Hoy
          </button>

          {/* Flechas unidas (-ml-px) */}
          <div className="inline-flex items-center shadow-xs">
            <button
              type="button"
              onClick={irAnterior}
              className="h-9 w-9 rounded-l-lg border border-border/80 bg-card flex items-center justify-center text-foreground hover:bg-muted transition-colors"
              aria-label="Período anterior"
              data-testid="agenda-prev-btn"
            >
              <span className="text-base font-bold">‹</span>
            </button>
            <button
              type="button"
              onClick={irSiguiente}
              className="h-9 w-9 rounded-r-lg border border-border/80 bg-card -ml-px flex items-center justify-center text-foreground hover:bg-muted transition-colors"
              aria-label="Período siguiente"
              data-testid="agenda-next-btn"
            >
              <span className="text-base font-bold">›</span>
            </button>
          </div>

          {/* Segmented Día/Semana/Mes (h-9 bg-muted p-1) */}
          <div
            className="inline-flex h-9 items-center rounded-lg bg-muted p-1 gap-1"
            role="group"
            aria-label="Vistas de agenda"
          >
            <button
              type="button"
              onClick={() => setVista("dia")}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                vista === "dia"
                  ? "bg-card text-foreground font-semibold ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
              data-testid="view-day-btn"
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setVista("semana")}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                vista === "semana"
                  ? "bg-card text-foreground font-semibold ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
              data-testid="view-week-btn"
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setVista("mes")}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                vista === "mes"
                  ? "bg-card text-foreground font-semibold ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground font-medium"
              }`}
              data-testid="view-month-btn"
            >
              Mes
            </button>
          </div>

          <Button
            type="button"
            onClick={() => createDialogRef.current?.showModal()}
            className="gap-1.5 font-bold h-9 bg-primary text-primary-foreground shadow-xs"
            size="sm"
            data-testid="create-class-btn"
          >
            <span>+</span> Nueva clase
          </Button>

          {isTestMode && (
            <span
              className="hidden xl:inline-flex rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300"
              data-testid="demo-coach-badge"
            >
              Modo Testeo · Coach Lucía Ferraro
            </span>
          )}
          {!isOnline && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Sin conexión · agenda guardada
            </span>
          )}
        </div>
      </header>

      {/* Alertas */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
          data-testid="agenda-error-alert"
        >
          <span>{error}</span>
          <button type="button" onClick={limpiarMensajes} className="min-h-8 px-1 font-bold" aria-label="Cerrar error">
            ✕
          </button>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
          data-testid="agenda-aviso-alert"
        >
          <span>{aviso}</span>
          <button type="button" onClick={limpiarMensajes} className="min-h-8 px-1 font-bold" aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {/* CUERPO PRINCIPAL: grid-cols-[1fr_288px] -> Calendario | Panel de resumen */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6 items-start">
        <div className="min-w-0 space-y-6">
          {/* VISTA MES */}
          {vista === "mes" && (
            <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-4" data-testid="month-calendar-grid">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Calendario Mensual</h2>
                <span className="text-xs text-muted-foreground">
                  Selecciona un día para ver sus clases en detalle.
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs font-bold text-muted-foreground pb-2 border-b border-border/60">
                <span>Lun</span>
                <span>Mar</span>
                <span>Mié</span>
                <span>Jue</span>
                <span>Vie</span>
                <span>Sáb</span>
                <span>Dom</span>
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {diasMes.map((d) => {
                  const clasesDia = clases.filter((c) => claveDia(c.inicio) === d.clave);
                  const esSeleccionado = dia === d.clave;
                  return (
                    <button
                      key={d.clave}
                      type="button"
                      onClick={() => {
                        setDia(d.clave);
                        setFechaReferencia(new Date(`${d.clave}T12:00:00-03:00`));
                        setClaseId(null);
                        setVista("semana");
                      }}
                      className={`min-h-20 sm:min-h-24 rounded-xl border p-2 text-left transition-all flex flex-col justify-between ${
                        esSeleccionado
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : d.esHoy
                            ? "border-sky-500/60 bg-sky-500/5 font-bold"
                            : d.esMesActual
                              ? "border-border/60 bg-card hover:border-primary/40 hover:bg-secondary/40"
                              : "border-transparent bg-secondary/20 text-muted-foreground opacity-50"
                      }`}
                      data-testid="month-day-cell"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${d.esHoy ? "text-sky-500 font-black" : ""}`}>
                          {d.numero}
                        </span>
                        {d.esHoy && <span className="text-[10px] text-sky-500 font-bold">Hoy</span>}
                      </div>

                      {clasesDia.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {clasesDia.slice(0, 2).map((c) => (
                            <div
                              key={c.id}
                              className={`truncate rounded px-1 text-[10px] font-bold ${COLOR_ACTIVIDAD[c.actividad]}`}
                            >
                              {horaLocal(c.inicio)} {c.actividad}
                            </div>
                          ))}
                          {clasesDia.length > 2 && (
                            <span className="text-[9px] text-muted-foreground block text-right font-semibold">
                              +{clasesDia.length - 2} más
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* VISTA SEMANA / DÍA */}
          {vista !== "mes" && (
            <>
              <div className="max-w-xl">
                <DaysStrip
                  dias={dias}
                  seleccionado={dia}
                  hoy={hoy}
                  onSeleccionar={(c) => {
                    setDia(c);
                    setFechaReferencia(new Date(`${c}T12:00:00-03:00`));
                    setClaseId(null);
                  }}
                />
              </div>

              {cargando && clases.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Cargando agenda…</p>
              ) : delDia.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground space-y-3">
                  <p>No hay clases programadas para este día.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCrearFecha(dia);
                      createDialogRef.current?.showModal();
                    }}
                  >
                    + Crear clase el {dia}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)]">
                  {/* Lista de clases del día con soporte para solapes */}
                  <div className="space-y-3" aria-label="Clases del día">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Clases ({delDia.length})
                      </span>
                      {delDia.some((c) => (solapes.get(c.id)?.totalColumnas ?? 1) > 1) && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                          Clases con solape horario
                        </span>
                      )}
                    </div>

                    <ul className="space-y-2.5">
                      {delDia.map((clase) => {
                        const ocupados = ocupacion(clase.id);
                        const activa = seleccionada?.id === clase.id;
                        const cancelada = clase.estado === "CANCELADA";
                        const solape = solapes.get(clase.id);
                        const tieneSolape = solape && solape.totalColumnas > 1;

                        return (
                          <li key={clase.id}>
                            <button
                              type="button"
                              onClick={() => setClaseId(clase.id)}
                              aria-pressed={activa}
                              className={`w-full rounded-2xl border bg-card p-4 text-left transition-all ${
                                activa
                                  ? "border-primary ring-2 ring-primary/30"
                                  : "border-border/80 hover:border-primary/40"
                              } ${cancelada ? "opacity-60" : ""} ${
                                tieneSolape ? "border-l-4 border-l-amber-500" : ""
                              }`}
                              data-testid="class-block-card"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl font-black tabular-nums">
                                    {horaLocal(clase.inicio)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    ({clase.duracion_minutos} min)
                                  </span>
                                </div>
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLOR_ACTIVIDAD[clase.actividad]}`}
                                >
                                  {NOMBRE_ACTIVIDAD[clase.actividad]}
                                </span>
                              </div>

                              <div className="mt-2 flex items-center justify-between text-sm">
                                <p className="font-semibold tabular-nums">
                                  {cancelada
                                    ? "Cancelada"
                                    : clase.capacidad !== null
                                      ? `${ocupados}/${clase.capacidad} cupos${
                                          ocupados > clase.capacidad
                                            ? " · Sobrecupo"
                                            : ocupados === clase.capacidad
                                              ? " · Lleno"
                                              : ""
                                        }`
                                      : `${ocupados} anotados · sin límite de cupo`}
                                </p>
                                {tieneSolape && (
                                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                    Solape Col {solape.columna + 1}/{solape.totalColumnas}
                                  </span>
                                )}
                              </div>

                              {!cancelada && clase.capacidad ? (
                                <div className="mt-2 h-1.5 rounded-full bg-secondary" aria-hidden="true">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      ocupados > clase.capacidad ? "bg-amber-500" : "bg-primary"
                                    }`}
                                    style={{
                                      width: `${Math.min(100, (ocupados / clase.capacidad) * 100)}%`,
                                    }}
                                  />
                                </div>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {/* Detalle y gestión de clase seleccionada */}
                  {seleccionada && (
                    <div
                      className="rounded-2xl border border-border/80 bg-card p-5 space-y-5"
                      data-testid="class-detail"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLOR_ACTIVIDAD[seleccionada.actividad]}`}
                            >
                              {NOMBRE_ACTIVIDAD[seleccionada.actividad]}
                            </span>
                            <h2 className="text-xl font-black">
                              {horaLocal(seleccionada.inicio)}
                            </h2>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Duración: {seleccionada.duracion_minutos} min · {claveDia(seleccionada.inicio)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {seleccionada.estado === "PROGRAMADA" && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={abrirAnotarAlumno}
                                data-testid="enroll-student-dialog-btn"
                              >
                                + Anotar alumno
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!isOnline && !isTestMode}
                                onClick={() => cancelDialogRef.current?.showModal()}
                                data-testid="cancel-class-dialog-btn"
                              >
                                Cancelar clase
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {seleccionada.estado === "CANCELADA" && (
                        <p
                          className="rounded-xl bg-secondary/60 p-3 text-sm text-rose-600 dark:text-rose-400 font-semibold"
                          data-testid="class-canceled-banner"
                        >
                          Clase cancelada
                          {seleccionada.motivo_cancelacion
                            ? `: ${seleccionada.motivo_cancelacion}`
                            : "."}
                        </p>
                      )}

                      {/* Panel de Controles: Mover, Redimensionar y Cupo flexible */}
                      {seleccionada.estado === "PROGRAMADA" && (
                        <div className="rounded-xl bg-secondary/30 border border-border/60 p-3 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground">
                              Controles de Clase (Cupo flexible &amp; Horario)
                            </span>
                          </div>

                          {/* Redimensión rápida de duración */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground font-semibold">Duración:</span>
                            <button
                              type="button"
                              onClick={() => void redimensionarClase(seleccionada.id, 45)}
                              className={`px-2.5 py-1 rounded-lg border font-bold ${
                                seleccionada.duracion_minutos === 45
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border hover:bg-secondary/60"
                              }`}
                              data-testid="resize-class-45-btn"
                            >
                              45m
                            </button>
                            <button
                              type="button"
                              onClick={() => void redimensionarClase(seleccionada.id, 60)}
                              className={`px-2.5 py-1 rounded-lg border font-bold ${
                                seleccionada.duracion_minutos === 60
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border hover:bg-secondary/60"
                              }`}
                              data-testid="resize-class-60-btn"
                            >
                              60m
                            </button>
                            <button
                              type="button"
                              onClick={() => void redimensionarClase(seleccionada.id, 90)}
                              className={`px-2.5 py-1 rounded-lg border font-bold ${
                                seleccionada.duracion_minutos === 90
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border hover:bg-secondary/60"
                              }`}
                              data-testid="resize-class-90-btn"
                            >
                              90m
                            </button>
                          </div>

                          {/* Mover horario */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground font-semibold">Horario:</span>
                            {editandoHora ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="time"
                                  value={nuevaHora}
                                  onChange={(e) => setNuevaHora(e.target.value)}
                                  className="rounded-lg border border-border bg-background px-2 py-0.5 text-xs"
                                  data-testid="move-class-time"
                                />
                                <Button size="sm" onClick={guardarNuevaHora} data-testid="save-move-class-btn">
                                  Guardar
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditandoHora(false)}>
                                  Cancelar
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setNuevaHora(horaLocal(seleccionada.inicio));
                                  setEditandoHora(true);
                                }}
                                data-testid="move-class-btn"
                              >
                                Mover horario ({horaLocal(seleccionada.inicio)})
                              </Button>
                            )}
                          </div>

                          {/* Editar cupo flexible */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground font-semibold">Cupo flexible:</span>
                            {editandoCupo ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  max="50"
                                  value={nuevoCupo}
                                  onChange={(e) => setNuevoCupo(Number(e.target.value))}
                                  className="w-16 rounded-lg border border-border bg-background px-2 py-0.5 text-xs"
                                  data-testid="edit-capacity-input"
                                />
                                <Button size="sm" onClick={guardarNuevoCupo} data-testid="save-capacity-btn">
                                  Guardar
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditandoCupo(false)}>
                                  Cancelar
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setNuevoCupo(seleccionada.capacidad ?? 6);
                                  setEditandoCupo(true);
                                }}
                                data-testid="edit-capacity-btn"
                              >
                                Editar cupo ({seleccionada.capacidad ?? "Sin límite"})
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Listado de Anotados */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold">
                            Anotados ({anotados.length}
                            {seleccionada.capacidad ? ` / ${seleccionada.capacidad}` : ""})
                          </h3>
                          {anotados.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {anotados.filter((r) => r.estado === "ANOTADO").length} presentes
                            </span>
                          )}
                        </div>

                        {anotados.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground">
                            Todavía no hay alumnos anotados en esta clase.
                          </p>
                        ) : (
                          <ul className="divide-y divide-border/60" aria-label="Anotados">
                            {anotados.map((r) => (
                              <li
                                key={r.id}
                                className="flex items-center justify-between gap-3 py-2.5"
                                data-testid="student-row"
                              >
                                <div>
                                  <span className="text-sm font-semibold">{r.alumno_nombre}</span>
                                  <span className="text-[11px] text-muted-foreground block">
                                    {r.estado}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {r.estado === "ANOTADO" ? (
                                    <div
                                      className="flex rounded-xl border border-border/80 p-0.5"
                                      role="group"
                                      aria-label={`Asistencia de ${r.alumno_nombre}`}
                                    >
                                      <span className="flex min-h-11 items-center rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white">
                                        Presente
                                      </span>
                                      <button
                                        type="button"
                                        disabled={
                                          (!isOnline && !isTestMode) ||
                                          accionEnCurso === r.id ||
                                          !claseIniciada
                                        }
                                        title={
                                          !claseIniciada
                                            ? "Disponible solo después del inicio de la clase"
                                            : undefined
                                        }
                                        onClick={() => void marcarAusente(r.id)}
                                        className="min-h-11 rounded-lg px-3 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed dark:text-rose-400"
                                        data-testid="mark-absent-btn"
                                      >
                                        Ausente
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                        r.estado === "AUSENTE"
                                          ? "bg-rose-600/15 text-rose-600 dark:text-rose-400"
                                          : "bg-secondary text-muted-foreground"
                                      }`}
                                      data-testid="reservation-state-badge"
                                    >
                                      {r.estado === "AUSENTE"
                                        ? "Ausente · consume cupo"
                                        : "Anulada"}
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    title="Quitar de la clase"
                                    onClick={() => void quitarAnotadoCoach(r.id)}
                                    className="min-h-9 px-2 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors"
                                    data-testid="remove-reservation-btn"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Panel "Resumen de la semana" (288 px) (Sección 8) */}
        <AgendaResumenPanel
          vista={vista}
          clases={clases}
          agendaReservas={agendaReservas}
          rangoInicio={rangoVisible.inicio}
          rangoFin={rangoVisible.fin}
          ahoraMs={ahoraMs}
          onVerAusentes={handleVerAusentes}
        />
      </div>

      {/* Tabla "Reservas de la semana" a todo el ancho (Sección 9) */}
      <div className="w-full pt-2">
        <AgendaReservasTable
          vista={vista}
          reservas={reservasEnRango}
          clases={clases}
          todasReservas={agendaReservas}
          filtroEstado={filtroTabla}
          onFiltroEstadoChange={setFiltroTabla}
          onMarcarAusente={marcarAusente}
          onQuitarReserva={quitarAnotadoCoach}
          onVerAlumno={() => router.push("/studio")}
          onAnotarAlumno={abrirAnotarAlumno}
          isOnline={isOnline}
          isTestMode={isTestMode}
          ahoraMs={ahoraMs}
        />
      </div>

      {/* DIÁLOGO: CREAR NUEVA CLASE */}
      <dialog
        ref={createDialogRef}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        aria-labelledby="crear-clase-titulo"
        data-testid="create-class-dialog"
      >
        <form onSubmit={handleCrearClase} className="space-y-4">
          <h2 id="crear-clase-titulo" className="text-lg font-black">
            Crear nueva clase
          </h2>

          <label className="block space-y-1.5 text-sm font-semibold">
            Actividad / Servicio
            <select
              value={crearActividad}
              onChange={(e) => setCrearActividad(e.target.value as ActividadClase)}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
              data-testid="create-class-activity"
            >
              <option value="FUNCIONAL">Funcional</option>
              <option value="BOXEO">Boxeo</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-sm font-semibold">
              Fecha
              <input
                type="date"
                required
                value={crearFecha}
                onChange={(e) => setCrearFecha(e.target.value)}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
                data-testid="create-class-date"
              />
            </label>

            <label className="block space-y-1.5 text-sm font-semibold">
              Hora de inicio
              <input
                type="time"
                required
                value={crearHora}
                onChange={(e) => setCrearHora(e.target.value)}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
                data-testid="create-class-time"
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm font-semibold">
            Duración (minutos)
            <select
              value={crearDuracion}
              onChange={(e) => setCrearDuracion(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
              data-testid="create-class-duration"
            >
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos (1 hora)</option>
              <option value={90}>90 minutos (1.5 horas)</option>
            </select>
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={crearSinLimite}
                onChange={(e) => setCrearSinLimite(e.target.checked)}
                className="rounded border-border"
              />
              Sin límite de cupo
            </label>

            {!crearSinLimite && (
              <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
                Cupo flexible (capacidad recomendada)
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={crearCapacidad ?? 6}
                  onChange={(e) => setCrearCapacidad(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-normal text-foreground"
                  data-testid="create-class-capacity"
                />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => createDialogRef.current?.close()}
            >
              Cancelar
            </Button>
            <Button type="submit" data-testid="create-class-submit">
              Crear clase
            </Button>
          </div>
        </form>
      </dialog>

      {/* DIÁLOGO: ANOTAR ALUMNO (VALIDACIÓN Y FORZADO) */}
      <dialog
        ref={enrollDialogRef}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        aria-labelledby="anotar-alumno-titulo"
        data-testid="enroll-student-dialog"
      >
        <div className="space-y-4">
          <h2 id="anotar-alumno-titulo" className="text-lg font-black">
            Anotar alumno a la clase
          </h2>
          <p className="text-xs text-muted-foreground">
            {seleccionada ? `${NOMBRE_ACTIVIDAD[seleccionada.actividad]} · ${horaLocal(seleccionada.inicio)}` : ""}
          </p>

          <label className="block space-y-1.5 text-sm font-semibold">
            Seleccionar alumno
            <select
              value={alumnoSeleccionado}
              onChange={(e) => {
                setAlumnoSeleccionado(e.target.value);
                setAdvertenciaAnotacion(null);
                setRequiereConfirmacion(false);
              }}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
              data-testid="enroll-student-select"
            >
              {listaAlumnos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre_completo} ({a.estado_membresia})
                </option>
              ))}
            </select>
          </label>

          {/* Banner de advertencia (Suscripción vencida, límite semanal o sobrecupo) */}
          {advertenciaAnotacion && (
            <div
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1"
              role="alert"
              data-testid="enroll-warning-banner"
            >
              <p className="font-bold">⚠️ Atención del Coach:</p>
              <p>{advertenciaAnotacion}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => enrollDialogRef.current?.close()}
            >
              Volver
            </Button>
            {requiereConfirmacion ? (
              <Button
                variant="destructive"
                type="button"
                onClick={() => void handleVerificarAnotar(true)}
                data-testid="confirm-enroll-student-btn"
              >
                Forzar anotación con confirmación
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleVerificarAnotar(false)}
                data-testid="confirm-enroll-student-btn"
              >
                Anotar alumno
              </Button>
            )}
          </div>
        </div>
      </dialog>

      {/* DIÁLOGO: CANCELAR CLASE */}
      <dialog
        ref={cancelDialogRef}
        onClose={() => setMotivo("")}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        aria-labelledby="cancelar-clase-titulo"
      >
        <form
          method="dialog"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmarCancelacion();
          }}
        >
          <h2 id="cancelar-clase-titulo" className="text-lg font-black">
            ¿Cancelar la clase?
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Se anulan las reservas activas ({seleccionada ? ocupacion(seleccionada.id) : 0}).</li>
            <li>A los alumnos no les cuenta en el límite semanal.</li>
          </ul>
          <label className="block space-y-1.5 text-sm font-semibold">
            Motivo
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              minLength={MOTIVO_MINIMO}
              rows={3}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm font-normal"
              placeholder="Ej.: corte de luz en el gimnasio"
              data-testid="cancel-class-reason"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => cancelDialogRef.current?.close()}>
              Volver
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={motivo.trim().length < MOTIVO_MINIMO || accionEnCurso === seleccionada?.id}
              data-testid="confirm-cancel-class-btn"
            >
              Cancelar clase
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
