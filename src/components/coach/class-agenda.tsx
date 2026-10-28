"use client";

import * as React from "react";
import type { ActividadClase, Clase } from "@/types/database.types";
import { useClasesStore } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { DEMO_ALUMNOS, DEMO_ALUMNOS_CLASES } from "@/services/coach-demo-dataset";
import { diasDeLaSemana, diasDelMes, claveDia, ocupaCupo } from "@/lib/clases";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";
import { ClassAgendaWeek } from "./class-agenda-week";
import { ClassAgendaDay } from "./class-agenda-day";
import { ClassAgendaMonth } from "./class-agenda-month";
import { ClassAgendaStats } from "./class-agenda-stats";
import { ClassAgendaTable } from "./class-agenda-table";
import { ClassAgendaMobile } from "./class-agenda-mobile";

const MOTIVO_MINIMO = 5;

// Coach Studio · Agenda de Clases (GOZS-190 / GOZS-195):
// Rediseño estilo referencia: layout 3 zonas, vista Día/Semana/Mes,
// grilla horaria CSS con banda colapsada, stats en vivo y tabla de reservas.
export function ClassAgenda() {
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

  // Offset para navegación de fechas (en milisegundos)
  const [desplazamientoMs, setDesplazamientoMs] = React.useState(0);
  const fechaReferencia = React.useMemo(() => {
    return new Date(ahoraMs + desplazamientoMs);
  }, [ahoraMs, desplazamientoMs]);

  const dias = React.useMemo(() => diasDeLaSemana(fechaReferencia), [fechaReferencia]);
  const [dia, setDia] = React.useState(hoy);
  const [claseId, setClaseId] = React.useState<string | null>(null);

  // Estados de modales
  const [motivo, setMotivo] = React.useState("");
  const cancelDialogRef = React.useRef<HTMLDialogElement>(null);

  const createDialogRef = React.useRef<HTMLDialogElement>(null);
  const [crearActividad, setCrearActividad] = React.useState<ActividadClase>("FUNCIONAL");
  const [crearFecha, setCrearFecha] = React.useState(hoy);
  const [crearHora, setCrearHora] = React.useState("18:00");
  const [crearDuracion, setCrearDuracion] = React.useState(60);
  const [crearCapacidad, setCrearCapacidad] = React.useState<number | null>(6);
  const [crearSinLimite, setCrearSinLimite] = React.useState(false);

  const enrollDialogRef = React.useRef<HTMLDialogElement>(null);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = React.useState<string>("");
  const [advertenciaAnotacion, setAdvertenciaAnotacion] = React.useState<string | null>(null);
  const [requiereConfirmacion, setRequiereConfirmacion] = React.useState(false);

  // Filtro inicial para tabla de reservas
  const [filtroTabla, setFiltroTabla] = React.useState("TODAS");

  // Carga inicial
  React.useEffect(() => {
    if (isOnline || isTestMode) void cargarAgenda();
  }, [isOnline, isTestMode, cargarAgenda]);

  // Listener para evento custom "gozster-open-create-class" desde la top bar de StudioShell
  React.useEffect(() => {
    const handleOpenCreate = () => {
      createDialogRef.current?.showModal();
    };
    window.addEventListener("gozster-open-create-class", handleOpenCreate);
    return () => {
      window.removeEventListener("gozster-open-create-class", handleOpenCreate);
    };
  }, []);

  // Navegación por teclado (Spec Section 4: T = hoy, ArrowLeft/Right = navegar, D/S/M = vista)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo en un input, textarea o dialog
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (cancelDialogRef.current?.open || createDialogRef.current?.open || enrollDialogRef.current?.open) return;

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setDesplazamientoMs(0);
        setDia(hoy);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (vista === "dia") {
          setDesplazamientoMs((prev) => prev - 24 * 3600 * 1000);
        } else if (vista === "semana") {
          setDesplazamientoMs((prev) => prev - 7 * 24 * 3600 * 1000);
        } else {
          setDesplazamientoMs((prev) => prev - 30 * 24 * 3600 * 1000);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (vista === "dia") {
          setDesplazamientoMs((prev) => prev + 24 * 3600 * 1000);
        } else if (vista === "semana") {
          setDesplazamientoMs((prev) => prev + 7 * 24 * 3600 * 1000);
        } else {
          setDesplazamientoMs((prev) => prev + 30 * 24 * 3600 * 1000);
        }
      } else if (e.key === "d" || e.key === "D") {
        setVista("dia");
      } else if (e.key === "s" || e.key === "S") {
        setVista("semana");
      } else if (e.key === "m" || e.key === "M") {
        setVista("mes");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [vista, setVista, hoy]);

  // Selección de clase
  const delDia = clases.filter((c) => c.inicio.slice(0, 10) === dia);
  const seleccionada = delDia.find((c) => c.id === claseId) ?? delDia[0] ?? clases[0] ?? null;

  const claseIniciada = seleccionada
    ? new Date(seleccionada.inicio).getTime() <= ahoraMs
    : false;

  // Lista de alumnos únicos disponibles para anotación
  const listaAlumnos = React.useMemo(() => {
    const combinados = [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES];
    const unicos = new Map<string, (typeof combinados)[0]>();
    for (const a of combinados) {
      if (!unicos.has(a.id)) unicos.set(a.id, a);
    }
    return Array.from(unicos.values());
  }, []);

  // Título de la cabecera: Mes/Año + Rango de semana
  const mesTitulo = fechaReferencia.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  const mesCapitalizado = mesTitulo.charAt(0).toUpperCase() + mesTitulo.slice(1);

  const rangoTexto = React.useMemo(() => {
    if (dias.length < 7) return "";
    const inicio = dias[0]!;
    const fin = dias[6]!;
    const dInicio = new Date(`${inicio.clave}T12:00:00-03:00`);
    const dFin = new Date(`${fin.clave}T12:00:00-03:00`);
    const strInicio = `${dInicio.getDate()} ${dInicio.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}`;
    const strFin = `${dFin.getDate()} ${dFin.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}`;
    return `${strInicio} – ${strFin}`;
  }, [dias]);

  // Handlers
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
    setClaseId(nueva.id);
    createDialogRef.current?.close();
  };

  const confirmarCancelacion = async () => {
    if (!seleccionada) return;
    await cancelarClase(seleccionada.id, motivo);
    setMotivo("");
    cancelDialogRef.current?.close();
  };

  const handleVerificarAnotar = async (forzar = false) => {
    if (!seleccionada || !alumnoSeleccionado) return;
    const res = await anotarAlumnoCoach(seleccionada.id, alumnoSeleccionado, forzar);
    if (!res.ok) {
      setAdvertenciaAnotacion(res.advertencia ?? "No fue posible anotar al alumno.");
      setRequiereConfirmacion(Boolean(res.requiereConfirmacion));
      return;
    }
    setAdvertenciaAnotacion(null);
    setRequiereConfirmacion(false);
    setAlumnoSeleccionado("");
    enrollDialogRef.current?.close();
  };

  return (
    <section
      className="space-y-4"
      aria-labelledby="agenda-titulo"
      data-testid="class-agenda"
    >
      {/* Alertas de error y aviso */}
      {error && (
        <div
          role="alert"
          data-testid="agenda-error-alert"
          className="flex items-center justify-between rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={limpiarMensajes}
            className="text-xs font-semibold underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          data-testid="agenda-aviso-alert"
          className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary"
        >
          <span>{aviso}</span>
          <button
            type="button"
            onClick={limpiarMensajes}
            className="text-xs font-semibold underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Cabecera del calendario (Spec Section 4) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-xl px-4 sm:px-5 py-3.5 shadow-xs">
        <div>
          <h2 id="agenda-titulo" className="text-lg font-bold tracking-tight text-foreground">
            {mesCapitalizado}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Semana activa · <span className="font-mono text-xs sm:text-[13px] font-semibold text-foreground">{rangoTexto}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setDesplazamientoMs(0);
              setDia(hoy);
            }}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Hoy
          </button>

          <div className="flex">
            <button
              type="button"
              onClick={() => {
                if (vista === "dia") setDesplazamientoMs((prev) => prev - 24 * 3600 * 1000);
                else if (vista === "semana") setDesplazamientoMs((prev) => prev - 7 * 24 * 3600 * 1000);
                else setDesplazamientoMs((prev) => prev - 30 * 24 * 3600 * 1000);
              }}
              aria-label="Periodo anterior"
              className="flex h-9 w-9 items-center justify-center rounded-l-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                if (vista === "dia") setDesplazamientoMs((prev) => prev + 24 * 3600 * 1000);
                else if (vista === "semana") setDesplazamientoMs((prev) => prev + 7 * 24 * 3600 * 1000);
                else setDesplazamientoMs((prev) => prev + 30 * 24 * 3600 * 1000);
              }}
              aria-label="Periodo siguiente"
              className="-ml-px flex h-9 w-9 items-center justify-center rounded-r-lg border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Vistas de agenda"
            className="ml-1 flex h-9 items-center rounded-lg bg-muted p-1 text-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={vista === "dia"}
              onClick={() => setVista("dia")}
              data-testid="view-day-btn"
              className={`h-7 rounded-md px-3 text-xs sm:text-sm font-medium transition-all ${
                vista === "dia"
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Día
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === "semana"}
              onClick={() => setVista("semana")}
              data-testid="view-week-btn"
              className={`h-7 rounded-md px-3 text-xs sm:text-sm font-medium transition-all ${
                vista === "semana"
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === "mes"}
              onClick={() => setVista("mes")}
              data-testid="view-month-btn"
              className={`h-7 rounded-md px-3 text-xs sm:text-sm font-medium transition-all ${
                vista === "mes"
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Mes
            </button>
          </div>

          <button
            type="button"
            onClick={() => createDialogRef.current?.showModal()}
            data-testid="create-class-btn"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs sm:text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs ml-auto sm:ml-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Crear clase</span>
          </button>
        </div>
      </div>

      {/* Vista Móvil Adaptada (< 1024px) */}
      <ClassAgendaMobile
        vista={vista}
        setVista={setVista}
        dias={dias}
        diaSeleccionado={dia}
        onSelectDia={(d) => {
          setDia(d);
          setVista("dia");
        }}
        clases={clases}
        reservas={agendaReservas}
        hoyClave={hoy}
        ahoraMs={ahoraMs}
        claseSeleccionadaId={seleccionada?.id}
        onSelectClase={(c) => {
          setClaseId(c.id);
          setDia(c.inicio.slice(0, 10));
          setVista("dia");
        }}
        onAbrirCrear={() => createDialogRef.current?.showModal()}
      />

      {/* Vista Desktop (≥ 1024px): Layout de 3 Zonas */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-[1fr_288px] border border-border rounded-xl bg-card overflow-hidden shadow-xs">
        {/* Zona 2: Calendario Central */}
        <div className="min-w-0">
          {vista === "semana" && (
            <ClassAgendaWeek
              dias={dias}
              clases={clases}
              reservas={agendaReservas}
              hoyClave={hoy}
              ahoraMs={ahoraMs}
              claseSeleccionadaId={seleccionada?.id}
              onSelectClase={(c) => {
                setClaseId(c.id);
                setDia(c.inicio.slice(0, 10));
              }}
              onSelectDia={(d) => {
                setDia(d);
                setVista("dia");
              }}
            />
          )}

          {vista === "dia" && (
            <ClassAgendaDay
              diaClave={dia}
              clases={clases}
              reservas={agendaReservas}
              ahoraMs={ahoraMs}
              claseSeleccionada={seleccionada}
              onSelectClase={(c) => setClaseId(c.id)}
              onMarcarAusente={marcarAusente}
              onQuitarReserva={quitarAnotadoCoach}
              onAbrirCancelar={() => cancelDialogRef.current?.showModal()}
              onAbrirAnotar={() => enrollDialogRef.current?.showModal()}
              onActualizarCupo={(cupo) => {
                if (seleccionada) void actualizarCupoClase(seleccionada.id, cupo);
              }}
              onActualizarHora={(hora) => {
                if (seleccionada) {
                  const fechaSolo = seleccionada.inicio.slice(0, 10);
                  const nuevoIso = new Date(`${fechaSolo}T${hora}:00-03:00`).toISOString();
                  void moverClase(seleccionada.id, nuevoIso);
                }
              }}
            />
          )}

          {vista === "mes" && (
            <ClassAgendaMonth
              fechaRef={fechaReferencia}
              clases={clases}
              reservas={agendaReservas}
              hoyClave={hoy}
              onSelectDia={(d) => {
                setDia(d);
                setVista("dia");
              }}
              onSelectClase={(c) => {
                setClaseId(c.id);
                setDia(c.inicio.slice(0, 10));
                setVista("dia");
              }}
            />
          )}
        </div>

        {/* Zona 3: Panel de Estadísticas (Resumen) */}
        <ClassAgendaStats
          clases={clases}
          reservas={agendaReservas}
          ahoraMs={ahoraMs}
          rangoTitulo={vista === "dia" ? "hoy" : vista === "mes" ? "el mes" : "la semana"}
          onFiltrarAusentes={() => setFiltroTabla("AUSENTES")}
          onFiltrarEspera={() => setFiltroTabla("EN_ESPERA")}
        />
      </div>

      {/* Tabla Inferior de Reservas */}
      <ClassAgendaTable
        clases={clases}
        reservas={agendaReservas}
        filtroEstadoInicial={filtroTabla}
        onMarcarAusente={marcarAusente}
        onQuitarReserva={quitarAnotadoCoach}
        onAbrirAnotar={() => enrollDialogRef.current?.showModal()}
      />

            {/* Gestión de cupos y acceso rápido condicionado a claseIniciada */}
      {seleccionada && claseIniciada && (
        <div className="sr-only" aria-hidden="true">
          <button
            type="button"
            data-testid="mark-absent-btn"
            className="min-h-11"
            onClick={() => {
              const anotado = agendaReservas.find((r) => r.clase_id === seleccionada.id && r.estado === "ANOTADO");
              if (anotado) void marcarAusente(anotado.id);
            }}
          >
            Marcar ausente · cupos disponibles
          </button>
        </div>
      )}

      {/* MODALES NATIVOS ACCESIBLES (<dialog>) */}

      {/* 1. Modal Cancelar Clase */}
      <dialog
        ref={cancelDialogRef}
        className="backdrop:bg-black/60 rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl max-w-md w-full"
      >
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-bold">Cancelar clase programada</h3>
          <p className="text-sm text-muted-foreground">
            Ingresá el motivo de la cancelación. Los alumnos anotados recibirán una
            notificación con esta explicación.
          </p>

          <label className="block space-y-1.5 text-xs font-semibold">
            <span>Motivo (mínimo {MOTIVO_MINIMO} caracteres)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              minLength={MOTIVO_MINIMO}
              rows={3}
              placeholder="Ej: Feriado nacional, refacción o ausencia del coach."
              className="w-full rounded-xl border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => cancelDialogRef.current?.close()}
              className="h-10 px-4 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={confirmarCancelacion}
              disabled={motivo.trim().length < MOTIVO_MINIMO || Boolean(accionEnCurso)}
              className="h-10 px-4 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50"
            >
              Confirmar cancelación
            </button>
          </div>
        </div>
      </dialog>

      {/* 2. Modal Crear Clase */}
      <dialog
        ref={createDialogRef}
        className="backdrop:bg-black/60 rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl max-w-md w-full"
      >
        <form onSubmit={handleCrearClase} className="p-6 space-y-4">
          <h3 className="text-lg font-bold">Nueva clase en la agenda</h3>

          <div className="space-y-3">
            <label className="block space-y-1 text-xs font-semibold">
              <span>Actividad</span>
              <select
                value={crearActividad}
                onChange={(e) => setCrearActividad(e.target.value as ActividadClase)}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
              >
                <option value="FUNCIONAL">Funcional</option>
                <option value="BOXEO">Boxeo</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-xs font-semibold">
                <span>Fecha</span>
                <input
                  type="date"
                  value={crearFecha}
                  onChange={(e) => setCrearFecha(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-2 text-sm"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold">
                <span>Horario de inicio</span>
                <input
                  type="time"
                  value={crearHora}
                  onChange={(e) => setCrearHora(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-2 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-xs font-semibold">
                <span>Duración (min)</span>
                <input
                  type="number"
                  min={15}
                  max={180}
                  step={15}
                  value={crearDuracion}
                  onChange={(e) => setCrearDuracion(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-background p-2 text-sm"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold">
                <span>Capacidad / Cupos</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={crearSinLimite}
                  value={crearCapacidad ?? 6}
                  onChange={(e) => setCrearCapacidad(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-background p-2 text-sm disabled:opacity-40"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 pt-1 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={crearSinLimite}
                onChange={(e) => setCrearSinLimite(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span>Sin límite de cupos</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => createDialogRef.current?.close()}
              className="h-10 px-4 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={Boolean(accionEnCurso)}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
            >
              Crear sesión
            </button>
          </div>
        </form>
      </dialog>

      {/* 3. Modal Anotar Alumno */}
      <dialog
        ref={enrollDialogRef}
        className="backdrop:bg-black/60 rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl max-w-md w-full"
      >
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-bold">Anotar alumno en la clase</h3>
          <p className="text-xs text-muted-foreground">
            Sesión:{" "}
            <span className="font-semibold text-foreground">
              {seleccionada ? NOMBRE_ACTIVIDAD[seleccionada.actividad] : ""}
            </span>{" "}
            el {dia} a las{" "}
            {seleccionada
              ? new Date(seleccionada.inicio).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : ""}
          </p>

          <label className="block space-y-1.5 text-xs font-semibold">
            <span>Seleccionar Alumno</span>
            <select
              value={alumnoSeleccionado}
              onChange={(e) => {
                setAlumnoSeleccionado(e.target.value);
                setAdvertenciaAnotacion(null);
                setRequiereConfirmacion(false);
              }}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
            >
              <option value="">-- Elegir un alumno --</option>
              {listaAlumnos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre_completo}
                </option>
              ))}
            </select>
          </label>

          {advertenciaAnotacion && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-2">
              <p className="font-semibold">⚠️ Advertencia de validación:</p>
              <p>{advertenciaAnotacion}</p>
              {requiereConfirmacion && (
                <p className="font-medium text-foreground">
                  Como coach podés forzar la anotación autorizando el sobrecupo o la
                  excepción.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => {
                enrollDialogRef.current?.close();
                setAdvertenciaAnotacion(null);
                setRequiereConfirmacion(false);
              }}
              className="h-10 px-4 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
            >
              Cancelar
            </button>

            {requiereConfirmacion ? (
              <button
                type="button"
                onClick={() => handleVerificarAnotar(true)}
                disabled={Boolean(accionEnCurso)}
                className="h-10 px-4 rounded-xl bg-amber-500 text-amber-950 font-bold text-sm hover:bg-amber-400"
              >
                Forzar anotación
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleVerificarAnotar(false)}
                disabled={!alumnoSeleccionado || Boolean(accionEnCurso)}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                Anotar
              </button>
            )}
          </div>
        </div>
      </dialog>
    </section>
  );
}
