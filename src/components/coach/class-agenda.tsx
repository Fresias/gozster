"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { COLOR_ACTIVIDAD, DaysStrip, NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";
import {
  claveDia,
  detectarSolapes,
  diasDeLaSemana,
  diasDelMes,
  horaLocal,
  ocupaCupo,
} from "@/lib/clases";
import { DEMO_ALUMNOS, DEMO_ALUMNOS_CLASES } from "@/services/coach-demo-dataset";
import { useClasesStore, type VistaAgenda } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import type { ActividadClase, Clase } from "@/types/database.types";

const MOTIVO_MINIMO = 5;

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function numeroSemanaIso(fecha: Date): number {
  const target = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function parseHoraMinutoLocal(fechaIso: string): { hora: number; minuto: number } {
  const [hStr, mStr] = horaLocal(fechaIso).split(":");
  return { hora: Number(hStr) || 0, minuto: Number(mStr) || 0 };
}

interface GapInfo {
  inicio: number;
  fin: number;
  count: number;
}

interface ClaseBlockProps {
  clase: Clase;
  ocupados: number;
  activa: boolean;
  ahoraMs: number;
  solape?: { columna: number; totalColumnas: number };
  vista: VistaAgenda;
  top: number;
  height: number;
  onSelect: (id: string) => void;
}

export function ClaseBlock({
  clase,
  ocupados,
  activa,
  ahoraMs,
  solape,
  vista,
  top,
  height,
  onSelect,
}: ClaseBlockProps) {
  const cancelada = clase.estado === "CANCELADA";
  const finClaseMs = new Date(clase.inicio).getTime() + (clase.duracion_minutos || 60) * 60_000;
  const finalizada = !cancelada && finClaseMs < ahoraMs;
  const capacidad = clase.capacidad;
  const llena = !cancelada && !finalizada && capacidad !== null && ocupados === capacidad;
  const sobrecupo = !cancelada && !finalizada && capacidad !== null && ocupados > capacidad;

  let colorClasses = "";
  let barClasses = "";

  if (cancelada) {
    colorClasses = "bg-card border-dashed border-slate-400 text-muted-foreground";
    barClasses = "";
  } else if (finalizada) {
    colorClasses = "bg-muted text-slate-600 border-border dark:text-slate-400 dark:border-border";
    barClasses = "bg-slate-300 dark:bg-slate-600";
  } else if (clase.actividad === "FUNCIONAL") {
    colorClasses = "bg-act-funcional-bg text-act-funcional-fg border-act-funcional-bar/30";
    barClasses = "bg-act-funcional-bar";
  } else {
    colorClasses = "bg-act-boxeo-bg text-act-boxeo-fg border-act-boxeo-bar/30";
    barClasses = "bg-act-boxeo-bar";
  }

  let leftStyle = "4px";
  let widthStyle = "calc(100% - 8px)";
  if (solape && solape.totalColumnas > 1) {
    const colAncho = 100 / solape.totalColumnas;
    leftStyle = `calc(${solape.columna * colAncho}% + 2px)`;
    widthStyle = `calc(${colAncho}% - 4px)`;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(clase.id)}
      aria-label={`${NOMBRE_ACTIVIDAD[clase.actividad]}, ${horaLocal(clase.inicio)}, ${ocupados} de ${capacidad ?? "sin límite"} cupos${cancelada ? ", Cancelada" : ""}`}
      className={`absolute rounded-md border overflow-hidden pl-2.5 pr-1.5 py-1.5 text-left transition-all z-10 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring ${
        activa ? "ring-2 ring-primary ring-offset-1 z-20" : ""
      } ${colorClasses}`}
      style={{
        top: `${top}px`,
        height: `${Math.max(44, height)}px`,
        left: leftStyle,
        width: widthStyle,
      }}
      data-testid="class-block-card"
    >
      {!cancelada && barClasses && (
        <span className={`absolute inset-y-0 left-0 w-[3px] ${barClasses}`} aria-hidden="true" />
      )}

      {/* Línea 1 */}
      <div className="flex items-center justify-between gap-1">
        <span
          className={`text-[13px] font-semibold truncate ${
            cancelada ? "line-through text-muted-foreground" : ""
          }`}
        >
          {NOMBRE_ACTIVIDAD[clase.actividad]}
        </span>
        {llena && (
          <span className="ml-auto shrink-0 rounded bg-foreground px-1 text-[10px] font-semibold text-background">
            Llena
          </span>
        )}
        {sobrecupo && (
          <span className="ml-auto shrink-0 rounded bg-amber-400 px-1 font-mono text-[10px] font-semibold text-amber-950">
            +{ocupados - capacidad!}
          </span>
        )}
      </div>

      {/* Línea 2 */}
      <div className="font-mono text-[11px] font-medium leading-tight">
        {cancelada ? (
          <span className="text-muted-foreground">Cancelada</span>
        ) : (
          <span className="opacity-90">
            {horaLocal(clase.inicio)} ·{" "}
            {capacidad !== null ? `${ocupados}/${capacidad}` : `${ocupados} anot.`}
          </span>
        )}
      </div>

      {/* Línea 3 (Solo en Vista Día) */}
      {vista === "dia" && capacidad !== null && !cancelada && (
        <div
          className="mt-1 h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden"
          aria-hidden="true"
        >
          <div
            className={`h-full rounded-full transition-all ${
              ocupados > capacidad ? "bg-amber-500" : "bg-primary"
            }`}
            style={{
              width: `${Math.min(100, (ocupados / capacidad) * 100)}%`,
            }}
          />
        </div>
      )}
    </button>
  );
}

// Coach Studio · Agenda de Clases (GOZS-190 / GOZS-191):
// Tokens de actividad, cabecera con navegación, atajos de teclado y grilla horaria semanal/diaria.
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

  const [fechaBase, setFechaBase] = React.useState<Date>(() => new Date(ahoraMs));
  const [dia, setDia] = React.useState(hoy);
  const [claseId, setClaseId] = React.useState<string | null>(null);

  // Gaps colapsados (tramos >= 3h sin clases)
  const [expandedGaps, setExpandedGaps] = React.useState<Set<number>>(new Set());

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

  // Días de la semana en curso
  const diasSemana = React.useMemo(() => diasDeLaSemana(fechaBase), [fechaBase]);
  const lunesDate = React.useMemo(
    () => new Date(diasSemana[0]?.clave + "T12:00:00-03:00"),
    [diasSemana]
  );
  const domingoDate = React.useMemo(
    () => new Date(diasSemana[6]?.clave + "T12:00:00-03:00"),
    [diasSemana]
  );
  const numSemana = React.useMemo(() => numeroSemanaIso(lunesDate), [lunesDate]);

  // Navegación de período (Hoy, Flechas unidas y atajos)
  const navegarFecha = React.useCallback(
    (delta: number) => {
      setFechaBase((prev) => {
        const d = new Date(prev);
        if (vista === "dia") {
          d.setDate(d.getDate() + delta);
          setDia(claveDia(d));
        } else if (vista === "semana") {
          d.setDate(d.getDate() + delta * 7);
          const diasNuevos = diasDeLaSemana(d);
          if (!diasNuevos.some((item) => item.clave === dia)) {
            setDia(diasNuevos[0]?.clave ?? claveDia(d));
          }
        } else if (vista === "mes") {
          d.setMonth(d.getMonth() + delta);
          setDia(claveDia(d));
        }
        return d;
      });
    },
    [vista, dia]
  );

  const irAHoy = React.useCallback(() => {
    setFechaBase(new Date(ahoraMs));
    setDia(hoy);
  }, [ahoraMs, hoy]);

  // Atajos de teclado (Sección 4)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        createDialogRef.current?.open ||
        enrollDialogRef.current?.open ||
        cancelDialogRef.current?.open
      ) {
        return;
      }

      const key = e.key.toUpperCase();
      if (key === "T") {
        e.preventDefault();
        irAHoy();
      } else if (key === "D") {
        e.preventDefault();
        setVista("dia");
      } else if (key === "S") {
        e.preventDefault();
        setVista("semana");
      } else if (key === "M") {
        e.preventDefault();
        setVista("mes");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navegarFecha(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navegarFecha(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [irAHoy, navegarFecha, setVista]);

  // Clases relevantes para la semana y para el día
  const setClavesSemana = React.useMemo(
    () => new Set(diasSemana.map((d) => d.clave)),
    [diasSemana]
  );
  const clasesSemana = React.useMemo(
    () => clases.filter((c) => setClavesSemana.has(claveDia(c.inicio))),
    [clases, setClavesSemana]
  );

  const delDia = React.useMemo(
    () => clases.filter((c) => claveDia(c.inicio) === dia),
    [clases, dia]
  );

  const seleccionada = React.useMemo(() => {
    if (claseId) {
      const encontrada = clases.find((c) => c.id === claseId);
      if (encontrada) return encontrada;
    }
    return delDia[0] ?? clasesSemana[0] ?? null;
  }, [claseId, clases, delDia, clasesSemana]);

  const anotados = seleccionada ? agendaReservas.filter((r) => r.clase_id === seleccionada.id) : [];

  const ocupacion = React.useCallback(
    (id: string) => agendaReservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length,
    [agendaReservas]
  );

  const solapesSemanaPorDia = React.useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof detectarSolapes>>();
    for (const d of diasSemana) {
      const clasesDelDia = clasesSemana.filter((c) => claveDia(c.inicio) === d.clave);
      mapa.set(d.clave, detectarSolapes(clasesDelDia));
    }
    return mapa;
  }, [diasSemana, clasesSemana]);

  const solapesDia = React.useMemo(() => detectarSolapes(delDia), [delDia]);

  const claseIniciada = seleccionada
    ? new Date(seleccionada.inicio).getTime() <= ahoraMs
    : false;

  const listaAlumnos = React.useMemo(() => {
    if (!isTestMode) return [];
    const combinados = [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES];
    const unicos = new Map<string, (typeof combinados)[0]>();
    for (const a of combinados) {
      if (!unicos.has(a.id)) unicos.set(a.id, a);
    }
    return [...unicos.values()].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));
  }, [isTestMode]);

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

  // Cálculo de rango horario para la grilla
  const { horaMin, horaMax } = React.useMemo(() => {
    let minH = 7;
    let maxH = 21;
    const lista = vista === "dia" ? delDia : clasesSemana;
    for (const c of lista) {
      const { hora, minuto } = parseHoraMinutoLocal(c.inicio);
      const durH = (c.duracion_minutos || 60) / 60;
      const finH = Math.ceil(hora + minuto / 60 + durH);
      minH = Math.min(minH, hora);
      maxH = Math.max(maxH, finH);
    }
    return { horaMin: Math.max(0, minH), horaMax: Math.min(24, maxH) };
  }, [vista, delDia, clasesSemana]);

  // Detección de tramos >= 3h sin clases para banda colapsada (Sección 5)
  const gaps = React.useMemo(() => {
    const lista = vista === "dia" ? delDia : clasesSemana;
    const result: GapInfo[] = [];
    let gapStart: number | null = null;
    let count = 0;

    for (let h = horaMin; h < horaMax; h++) {
      const ocupada = lista.some((c) => {
        const { hora, minuto } = parseHoraMinutoLocal(c.inicio);
        const ini = hora + minuto / 60;
        const fin = ini + (c.duracion_minutos || 60) / 60;
        return Math.max(ini, h) < Math.min(fin, h + 1);
      });

      if (!ocupada) {
        if (gapStart === null) gapStart = h;
        count++;
      } else {
        if (gapStart !== null && count >= 3) {
          result.push({ inicio: gapStart, fin: h, count });
        }
        gapStart = null;
        count = 0;
      }
    }

    if (gapStart !== null && count >= 3) {
      result.push({ inicio: gapStart, fin: horaMax, count });
    }

    return result;
  }, [vista, delDia, clasesSemana, horaMin, horaMax]);

  const toggleGap = (inicio: number) => {
    setExpandedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(inicio)) next.delete(inicio);
      else next.add(inicio);
      return next;
    });
  };

  type SlotItem = { tipo: "hora"; hora: number } | { tipo: "gap"; gap: GapInfo };

  const slots = React.useMemo(() => {
    const items: SlotItem[] = [];
    let h = horaMin;
    while (h < horaMax) {
      const gap = gaps.find((g) => g.inicio === h);
      if (gap && !expandedGaps.has(gap.inicio)) {
        items.push({ tipo: "gap", gap });
        h = gap.fin;
      } else {
        items.push({ tipo: "hora", hora: h });
        h++;
      }
    }
    return items;
  }, [horaMin, horaMax, gaps, expandedGaps]);

  const totalAlturaGrid = React.useMemo(() => {
    return slots.reduce((acc, slot) => acc + (slot.tipo === "gap" ? 36 : 56), 0);
  }, [slots]);

  const calcularTop = React.useCallback(
    (hora: number, minuto: number) => {
      let top = 0;
      for (let h = horaMin; h < hora; h++) {
        const gap = gaps.find((g) => h >= g.inicio && h < g.fin);
        if (gap && !expandedGaps.has(gap.inicio)) {
          if (h === gap.inicio) {
            top += 36;
          }
        } else {
          top += 56;
        }
      }
      top += (minuto / 60) * 56;
      return top;
    },
    [horaMin, gaps, expandedGaps]
  );

  const diasMes = React.useMemo(() => diasDelMes(fechaBase), [fechaBase]);

  // Formato cabecera del calendario
  const headerTitulo = React.useMemo(() => {
    if (vista === "mes") {
      return `${MESES[fechaBase.getMonth()]} ${fechaBase.getFullYear()}`;
    }
    return `${MESES[lunesDate.getMonth()]} ${lunesDate.getFullYear()}`;
  }, [vista, fechaBase, lunesDate]);

  const headerSubtitulo = React.useMemo(() => {
    if (vista === "mes") {
      return "Calendario mensual · Todas las clases del mes";
    }
    const mesL = lunesDate.getMonth();
    const mesD = domingoDate.getMonth();
    const rango =
      mesL === mesD
        ? `${diasSemana[0]?.numero} – ${diasSemana[6]?.numero} ${MESES_CORTOS[mesL]}`
        : `${diasSemana[0]?.numero} ${MESES_CORTOS[mesL]} – ${diasSemana[6]?.numero} ${MESES_CORTOS[mesD]}`;

    return (
      <>
        Semana {numSemana} · <span className="font-mono tabular-nums">{rango}</span>
      </>
    );
  }, [vista, diasSemana, lunesDate, domingoDate, numSemana]);

  // Posición de la línea de ahora (solo en columna de hoy)
  const ahoraLocal = parseHoraMinutoLocal(new Date(ahoraMs).toISOString());
  const mostrarLineaAhora =
    ahoraLocal.hora >= horaMin && ahoraLocal.hora < horaMax;
  const topAhora = mostrarLineaAhora
    ? calcularTop(ahoraLocal.hora, ahoraLocal.minuto)
    : 0;

  return (
    <section className="space-y-6" aria-labelledby="agenda-titulo" data-testid="class-agenda">
      {/* Cabecera del calendario (Sección 4) */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div className="space-y-0.5">
          <h1 id="agenda-titulo" className="text-lg font-semibold tracking-tight text-foreground capitalize">
            {headerTitulo}
          </h1>
          <p className="text-sm text-muted-foreground">{headerSubtitulo}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Hoy */}
          <button
            type="button"
            onClick={irAHoy}
            className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Hoy
          </button>

          {/* Flechas unidas */}
          <div className="inline-flex rounded-lg border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => navegarFecha(-1)}
              className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Período anterior"
              title="Anterior (←)"
            >
              <span className="text-sm font-bold">‹</span>
            </button>
            <button
              type="button"
              onClick={() => navegarFecha(1)}
              className="-ml-px flex h-9 w-9 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Período siguiente"
              title="Siguiente (→)"
            >
              <span className="text-sm font-bold">›</span>
            </button>
          </div>

          {/* Segmented Día/Semana/Mes */}
          <div
            className="inline-flex h-9 items-center rounded-lg bg-muted p-1 gap-1"
            role="group"
            aria-label="Vistas de agenda"
          >
            <button
              type="button"
              onClick={() => setVista("dia")}
              className={`h-7 rounded-md px-3 text-xs font-semibold transition-all ${
                vista === "dia"
                  ? "bg-card text-foreground ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="view-day-btn"
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setVista("semana")}
              className={`h-7 rounded-md px-3 text-xs font-semibold transition-all ${
                vista === "semana"
                  ? "bg-card text-foreground ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="view-week-btn"
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setVista("mes")}
              className={`h-7 rounded-md px-3 text-xs font-semibold transition-all ${
                vista === "mes"
                  ? "bg-card text-foreground ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="view-month-btn"
            >
              Mes
            </button>
          </div>

          {/* CTA Crear Clase */}
          <Button
            type="button"
            onClick={() => {
              setCrearFecha(dia);
              createDialogRef.current?.showModal();
            }}
            className="h-9 gap-1.5 font-bold"
            size="sm"
            data-testid="create-class-btn"
          >
            <span>+</span> Nueva clase
          </Button>

          {isTestMode && (
            <span
              className="rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300"
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
          <button type="button" onClick={limpiarMensajes} className="min-h-8 px-1 font-bold" aria-label="Cerrar aviso">
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

      {/* VISTA SEMANA (Sección 5: Grilla Horaria) */}
      {vista === "semana" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
            {/* Header de días: LUN 26 (hoy con pill bg-primary) */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border/80 bg-muted/20">
              <div className="h-14 border-r border-border/40" aria-hidden="true" />
              {diasSemana.map((d) => {
                const esHoy = d.clave === hoy;
                const esSeleccionado = d.clave === dia;
                return (
                  <button
                    key={d.clave}
                    type="button"
                    onClick={() => setDia(d.clave)}
                    className={`h-14 border-r last:border-r-0 border-border/40 p-2 text-center flex flex-col items-center justify-center gap-0.5 transition-colors hover:bg-muted/40 ${
                      esHoy ? "bg-primary/5" : esSeleccionado ? "bg-secondary/40" : ""
                    }`}
                  >
                    <span
                      className={`text-xs uppercase tracking-wider ${
                        esHoy ? "text-primary font-bold" : "text-muted-foreground font-semibold"
                      }`}
                    >
                      {d.etiqueta}
                    </span>
                    {esHoy ? (
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary px-1 font-mono text-xs font-bold text-primary-foreground shadow-xs">
                        {d.numero}
                      </span>
                    ) : (
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {d.numero}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Grilla horaria con slots y posicionamiento absoluto */}
            <div className="relative overflow-x-auto">
              <div className="grid grid-cols-[56px_repeat(7,1fr)] min-w-[700px] relative select-none">
                {slots.map((slot) => {
                  if (slot.tipo === "gap") {
                    return (
                      <React.Fragment key={`gap-${slot.gap.inicio}`}>
                        <div className="h-[36px] border-t border-border/40 pr-1 flex flex-col justify-center text-right">
                          <button
                            type="button"
                            onClick={() => toggleGap(slot.gap.inicio)}
                            className="text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground leading-tight"
                            title="Clic para expandir horario"
                          >
                            +{slot.gap.count}h
                            <span className="block text-[8px] font-sans font-normal opacity-75">
                              sin clases
                            </span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleGap(slot.gap.inicio)}
                          className="col-span-7 h-[36px] border-t border-b border-dashed border-border bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_6px,hsl(var(--card))_6px_12px)] flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
                          title="Clic para ver horario completo"
                        >
                          <span className="font-mono text-[11px] font-semibold tracking-tight text-muted-foreground/90">
                            + {slot.gap.count} h / sin clases (clic para expandir)
                          </span>
                        </button>
                      </React.Fragment>
                    );
                  }

                  return (
                    <React.Fragment key={`hora-${slot.hora}`}>
                      <div className="h-[56px] border-t border-border/40 pr-2 pt-0.5 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                        {String(slot.hora).padStart(2, "0")}:00
                      </div>
                      {diasSemana.map((d) => {
                        const esHoy = d.clave === hoy;
                        const esDomingo = d.etiqueta === "DOM";
                        const sinClases =
                          clasesSemana.filter((c) => claveDia(c.inicio) === d.clave).length === 0;

                        return (
                          <div
                            key={`${d.clave}-${slot.hora}`}
                            className={`h-[56px] border-t border-r last:border-r-0 border-border/40 ${
                              esHoy
                                ? "bg-primary/5"
                                : esDomingo || sinClases
                                  ? "bg-muted/30"
                                  : "bg-card"
                            }`}
                          />
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* Layer 2: Capa de clases absolutas y línea de ahora */}
                <div
                  className="absolute inset-y-0 left-[56px] right-0 pointer-events-none grid grid-cols-7"
                  style={{ height: `${totalAlturaGrid}px` }}
                >
                  {diasSemana.map((d) => {
                    const esHoy = d.clave === hoy;
                    const clasesDia = clasesSemana.filter((c) => claveDia(c.inicio) === d.clave);
                    const solapesMap = solapesSemanaPorDia.get(d.clave);

                    return (
                      <div key={`layer-${d.clave}`} className="relative h-full pointer-events-auto">
                        {/* Línea de "ahora": solo en columna de hoy */}
                        {esHoy && mostrarLineaAhora && (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: `${topAhora}px` }}
                          >
                            <div className="relative w-full h-0.5 bg-primary">
                              <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                            </div>
                          </div>
                        )}

                        {/* Bloques de clases del día */}
                        {clasesDia.map((c) => {
                          const { hora, minuto } = parseHoraMinutoLocal(c.inicio);
                          const topPx = calcularTop(hora, minuto);
                          const heightPx = ((c.duracion_minutos || 60) / 60) * 56;
                          const solape = solapesMap?.get(c.id);

                          return (
                            <ClaseBlock
                              key={c.id}
                              clase={c}
                              ocupados={ocupacion(c.id)}
                              activa={seleccionada?.id === c.id}
                              ahoraMs={ahoraMs}
                              solape={solape}
                              vista="semana"
                              top={topPx}
                              height={heightPx}
                              onSelect={(id) => {
                                setClaseId(id);
                                setDia(claveDia(c.inicio));
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Panel de detalle de la clase seleccionada en vista semanal */}
          {seleccionada && (
            <div className="max-w-2xl">
              {renderDetalleClase(
                seleccionada,
                anotados,
                claseIniciada,
                isOnline,
                isTestMode,
                abrirAnotarAlumno,
                cancelDialogRef,
                redimensionarClase,
                editandoHora,
                nuevaHora,
                setNuevaHora,
                guardarNuevaHora,
                setEditandoHora,
                editandoCupo,
                nuevoCupo,
                setNuevoCupo,
                guardarNuevoCupo,
                setEditandoCupo,
                marcarAusente,
                accionEnCurso,
                quitarAnotadoCoach
              )}
            </div>
          )}
        </div>
      )}

      {/* VISTA DÍA (Sección 7: Grilla en 1 columna + panel de detalle) */}
      {vista === "dia" && (
        <div className="space-y-6">
          <div className="max-w-xl">
            <DaysStrip
              dias={diasSemana}
              seleccionado={dia}
              hoy={hoy}
              onSeleccionar={(c) => {
                setDia(c);
                setClaseId(null);
              }}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)]">
            {/* Grilla horaria en 1 columna */}
            <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
              <div className="grid grid-cols-[56px_1fr] border-b border-border/80 bg-muted/20">
                <div className="h-12 border-r border-border/40" aria-hidden="true" />
                <div className="h-12 p-2 flex items-center justify-between px-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {diasSemana.find((d) => d.clave === dia)?.etiqueta} {dia}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">
                    {delDia.length} clases
                  </span>
                </div>
              </div>

              <div className="relative overflow-x-auto">
                <div className="grid grid-cols-[56px_1fr] relative select-none">
                  {slots.map((slot) => {
                    if (slot.tipo === "gap") {
                      return (
                        <React.Fragment key={`dia-gap-${slot.gap.inicio}`}>
                          <div className="h-[36px] border-t border-border/40 pr-1 flex flex-col justify-center text-right">
                            <button
                              type="button"
                              onClick={() => toggleGap(slot.gap.inicio)}
                              className="text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground leading-tight"
                              title="Clic para expandir horario"
                            >
                              +{slot.gap.count}h
                              <span className="block text-[8px] font-sans font-normal opacity-75">
                                sin clases
                              </span>
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleGap(slot.gap.inicio)}
                            className="h-[36px] border-t border-b border-dashed border-border bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_6px,hsl(var(--card))_6px_12px)] flex items-center justify-center text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
                            title="Clic para ver horario completo"
                          >
                            <span className="font-mono text-[11px] font-semibold tracking-tight text-muted-foreground/90">
                              + {slot.gap.count} h / sin clases (clic para expandir)
                            </span>
                          </button>
                        </React.Fragment>
                      );
                    }

                    return (
                      <React.Fragment key={`dia-hora-${slot.hora}`}>
                        <div className="h-[56px] border-t border-border/40 pr-2 pt-0.5 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                          {String(slot.hora).padStart(2, "0")}:00
                        </div>
                        <div
                          className={`h-[56px] border-t border-l border-border/40 ${
                            dia === hoy ? "bg-primary/5" : "bg-card"
                          }`}
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* Layer 2: Capa de clases absolutas en 1 columna */}
                  <div
                    className="absolute inset-y-0 left-[56px] right-0 pointer-events-none"
                    style={{ height: `${totalAlturaGrid}px` }}
                  >
                    <div className="relative h-full pointer-events-auto">
                      {dia === hoy && mostrarLineaAhora && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none"
                          style={{ top: `${topAhora}px` }}
                        >
                          <div className="relative w-full h-0.5 bg-primary">
                            <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                          </div>
                        </div>
                      )}

                      {delDia.map((c) => {
                        const { hora, minuto } = parseHoraMinutoLocal(c.inicio);
                        const topPx = calcularTop(hora, minuto);
                        const heightPx = ((c.duracion_minutos || 60) / 60) * 56;
                        const solape = solapesDia.get(c.id);

                        return (
                          <ClaseBlock
                            key={c.id}
                            clase={c}
                            ocupados={ocupacion(c.id)}
                            activa={seleccionada?.id === c.id}
                            ahoraMs={ahoraMs}
                            solape={solape}
                            vista="dia"
                            top={topPx}
                            height={heightPx}
                            onSelect={(id) => setClaseId(id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel de detalle/gestión existente a la derecha */}
            {seleccionada ? (
              renderDetalleClase(
                seleccionada,
                anotados,
                claseIniciada,
                isOnline,
                isTestMode,
                abrirAnotarAlumno,
                cancelDialogRef,
                redimensionarClase,
                editandoHora,
                nuevaHora,
                setNuevaHora,
                guardarNuevaHora,
                setEditandoHora,
                editandoCupo,
                nuevoCupo,
                setNuevoCupo,
                guardarNuevoCupo,
                setEditandoCupo,
                marcarAusente,
                accionEnCurso,
                quitarAnotadoCoach
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center space-y-3">
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
            )}
          </div>
        </div>
      )}

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

          <div className="space-y-1">
            <label htmlFor="crear-actividad" className="text-xs font-bold text-muted-foreground">
              Actividad
            </label>
            <select
              id="crear-actividad"
              value={crearActividad}
              onChange={(e) => setCrearActividad(e.target.value as ActividadClase)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
              data-testid="create-class-activity"
            >
              <option value="FUNCIONAL">Funcional</option>
              <option value="BOXEO">Boxeo</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="crear-fecha" className="text-xs font-bold text-muted-foreground">
                Fecha
              </label>
              <input
                id="crear-fecha"
                type="date"
                value={crearFecha}
                onChange={(e) => setCrearFecha(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
                data-testid="create-class-date"
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="crear-hora" className="text-xs font-bold text-muted-foreground">
                Hora de inicio
              </label>
              <input
                id="crear-hora"
                type="time"
                value={crearHora}
                onChange={(e) => setCrearHora(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
                data-testid="create-class-time"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="crear-duracion" className="text-xs font-bold text-muted-foreground">
              Duración
            </label>
            <select
              id="crear-duracion"
              value={crearDuracion}
              onChange={(e) => setCrearDuracion(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
              data-testid="create-class-duration"
            >
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos (estándar)</option>
              <option value={90}>90 minutos</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="crear-capacidad" className="text-xs font-bold text-muted-foreground">
                Cupo flexible
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={crearSinLimite}
                  onChange={(e) => setCrearSinLimite(e.target.checked)}
                  className="rounded"
                />
                Sin límite
              </label>
            </div>
            {!crearSinLimite && (
              <input
                id="crear-capacidad"
                type="number"
                min="1"
                max="50"
                value={crearCapacidad ?? 6}
                onChange={(e) => setCrearCapacidad(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
                data-testid="create-class-capacity"
                required
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => createDialogRef.current?.close()}
            >
              Cancelar
            </Button>
            <Button type="submit" data-testid="create-class-submit">
              Guardar clase
            </Button>
          </div>
        </form>
      </dialog>

      {/* DIÁLOGO: ANOTAR ALUMNO */}
      <dialog
        ref={enrollDialogRef}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        aria-labelledby="anotar-alumno-titulo"
        data-testid="enroll-student-dialog"
      >
        <div className="space-y-4">
          <h2 id="anotar-alumno-titulo" className="text-lg font-black">
            Anotar alumno en la clase
          </h2>

          <div className="space-y-1">
            <label htmlFor="seleccionar-alumno" className="text-xs font-bold text-muted-foreground">
              Seleccionar alumno
            </label>
            <select
              id="seleccionar-alumno"
              value={alumnoSeleccionado}
              onChange={(e) => {
                setAlumnoSeleccionado(e.target.value);
                setAdvertenciaAnotacion(null);
                setRequiereConfirmacion(false);
              }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
              data-testid="enroll-student-select"
            >
              {listaAlumnos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre_completo}
                </option>
              ))}
            </select>
          </div>

          {advertenciaAnotacion && (
            <div
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1"
              data-testid="enroll-warning-banner"
            >
              <p className="font-bold">Advertencia de suscripción / cupo:</p>
              <p>{advertenciaAnotacion}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => enrollDialogRef.current?.close()}
            >
              Cancelar
            </Button>
            {requiereConfirmacion ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleVerificarAnotar(true)}
                data-testid="confirm-enroll-student-btn"
              >
                Forzar anotación
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleVerificarAnotar(false)}
                data-testid="confirm-enroll-student-btn"
              >
                Confirmar
              </Button>
            )}
          </div>
        </div>
      </dialog>

      {/* DIÁLOGO: CANCELAR CLASE */}
      <dialog
        ref={cancelDialogRef}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        aria-labelledby="cancelar-clase-titulo"
      >
        <div className="space-y-4">
          <h2 id="cancelar-clase-titulo" className="text-lg font-black">
            Cancelar clase
          </h2>
          <p className="text-sm text-muted-foreground">
            Al cancelar, se anularán las reservas de todos los alumnos anotados y se les
            restituirá el crédito semanal.
          </p>

          <div className="space-y-1">
            <label htmlFor="motivo-cancelacion" className="text-xs font-bold text-muted-foreground">
              Motivo de la cancelación (mínimo {MOTIVO_MINIMO} caracteres)
            </label>
            <textarea
              id="motivo-cancelacion"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              minLength={MOTIVO_MINIMO}
              rows={3}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm focus:border-primary focus:outline-hidden"
              placeholder="Ej.: Feriado nacional, indisposición del coach..."
              data-testid="cancel-class-reason"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => cancelDialogRef.current?.close()}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={motivo.trim().length < MOTIVO_MINIMO}
              onClick={() => void confirmarCancelacion()}
              data-testid="confirm-cancel-class-btn"
            >
              Confirmar cancelación
            </Button>
          </div>
        </div>
      </dialog>
    </section>
  );
}

// Subcomponente: Panel de detalle y gestión de clase seleccionada
function renderDetalleClase(
  seleccionada: Clase,
  anotados: ReturnType<typeof useClasesStore.getState>["agendaReservas"],
  claseIniciada: boolean,
  isOnline: boolean,
  isTestMode: boolean,
  abrirAnotarAlumno: () => void,
  cancelDialogRef: React.RefObject<HTMLDialogElement | null>,
  redimensionarClase: (id: string, duracion: number) => Promise<boolean>,
  editandoHora: boolean,
  nuevaHora: string,
  setNuevaHora: (h: string) => void,
  guardarNuevaHora: () => Promise<void>,
  setEditandoHora: (b: boolean) => void,
  editandoCupo: boolean,
  nuevoCupo: number,
  setNuevoCupo: (n: number) => void,
  guardarNuevoCupo: () => Promise<void>,
  setEditandoCupo: (b: boolean) => void,
  marcarAusente: (reservaId: string) => Promise<void | boolean>,
  accionEnCurso: string | null,
  quitarAnotadoCoach: (reservaId: string) => Promise<void | boolean>
) {
  return (
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
            <h2 className="text-xl font-black">{horaLocal(seleccionada.inicio)}</h2>
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
          {seleccionada.motivo_cancelacion ? `: ${seleccionada.motivo_cancelacion}` : "."}
        </p>
      )}

      {/* Controles de Clase (Cupo flexible & Horario) */}
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
                  <span className="text-[11px] text-muted-foreground block">{r.estado}</span>
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
                      {r.estado === "AUSENTE" ? "Ausente · consume cupo" : "Anulada"}
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
  );
}
