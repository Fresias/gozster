// Marcas de cambio de plan en Cargas y RPE Históricos (GOZS-164, spec docs/specs/historial-progreso.md §6).
// Toda la lógica de decisión vive en funciones puras con specs de Vitest (ADR-005, Ponytail).

import type { PlanEntrenamiento, RegistroSerie } from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";

const ZONA_BUENOS_AIRES = "America/Argentina/Buenos_Aires";
const MESES_CORTO = [
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

/**
 * Formatea una fecha ISO al formato Dashboard (spec §0.2 y §6.5):
 * ej. "1 sep 2026", "3 mar 2025" en zona horaria America/Argentina/Buenos_Aires.
 */
export function formatearFechaDashboard(fechaIso: string): string {
  let str = fechaIso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    str = `${str}T12:00:00Z`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return fechaIso;

  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_BUENOS_AIRES,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);

  const day = parts.find((p) => p.type === "day")?.value ?? String(d.getDate());
  const monthStr = parts.find((p) => p.type === "month")?.value;
  const monthNum = monthStr ? Number(monthStr) : d.getMonth() + 1;
  const year = parts.find((p) => p.type === "year")?.value ?? String(d.getFullYear());

  const mesTexto = MESES_CORTO[monthNum - 1] ?? "mes";
  return `${day} ${mesTexto} ${year}`;
}

/**
 * §0.1: Una serie cuenta como marca histórica válida sólo si:
 * - completada === true
 * - set_type !== "WARMUP" y !== "W"
 * - reps_hechas >= 1
 */
export function esSerieValida(
  serie: Pick<RegistroSerie, "completada" | "reps_hechas"> & {
    set_type?: string | null;
  },
): boolean {
  if (!serie.completada) return false;
  if (serie.set_type === "WARMUP" || serie.set_type === "W") return false;
  return (serie.reps_hechas ?? 0) >= 1;
}

export function obtenerNombrePlan(
  plan?: { id?: string | null; nombre?: string | null } | null,
): string {
  const nombre = plan?.nombre?.trim();
  return nombre && nombre.length > 0 ? nombre : "Sin plan";
}

export function obtenerIdPlan(
  plan?: { id?: string | null; nombre?: string | null } | null,
): string {
  const id = plan?.id?.trim();
  return id && id.length > 0 ? id : "__sin_plan__";
}

export interface PlanVigencia {
  planId: string | null;
  nombre: string;
  fechaInicio: string;
  fechaInicioFormateada: string;
  sesionId: string;
  indiceSesion: number;
}

/**
 * Determina las fechas de inicio (vigencia) de cada plan del alumno recorriendo
 * el historial de sesiones en orden cronológico (spec §6.3 y Checkpoint 1).
 */
export function obtenerVigenciaPlanes(
  historial: HistoricalLoadEntry[],
): PlanVigencia[] {
  if (!historial || historial.length === 0) return [];

  // Orden cronológico (más vieja primero)
  const cronologico = [...historial].sort(
    (a, b) =>
      new Date(a.sesion.fecha).getTime() - new Date(b.sesion.fecha).getTime(),
  );

  const vigencias: PlanVigencia[] = [];
  let ultimoPlanId: string | null = null;

  cronologico.forEach((entry, idx) => {
    const planIdActual = obtenerIdPlan(entry.plan);
    if (idx === 0 || planIdActual !== ultimoPlanId) {
      vigencias.push({
        planId: entry.plan?.id ?? null,
        nombre: obtenerNombrePlan(entry.plan),
        fechaInicio: entry.sesion.fecha,
        fechaInicioFormateada: formatearFechaDashboard(entry.sesion.fecha),
        sesionId: entry.sesion.id,
        indiceSesion: idx,
      });
      ultimoPlanId = planIdActual;
    }
  });

  return vigencias;
}

// Alias semántico para el Checkpoint 1
export const obtenerFechasInicioPlanes = obtenerVigenciaPlanes;

/**
 * Calcula vigencia directa sobre la lista de planes de un alumno.
 */
export function calcularVigenciaPlanesAlumno(
  planes: PlanEntrenamiento[],
): { planId: string; nombre: string; fechaInicio: string; fechaInicioFormateada: string }[] {
  if (!planes || planes.length === 0) return [];

  return [...planes]
    .sort(
      (a, b) =>
        new Date(a.fecha_inicio || a.created_at).getTime() -
        new Date(b.fecha_inicio || b.created_at).getTime(),
    )
    .map((p) => {
      const fecha = p.fecha_inicio || p.created_at;
      return {
        planId: p.id,
        nombre: p.nombre,
        fechaInicio: fecha,
        fechaInicioFormateada: formatearFechaDashboard(fecha),
      };
    });
}

export interface CambioDePlan {
  sesionId: string;
  fecha: string;
  fechaFormateada: string;
  planAnterior: { id: string | null; nombre: string };
  planNuevo: { id: string | null; nombre: string };
  indiceSesion: number;
}

/**
 * Recorriendo las sesiones en orden cronológico, hay una marca cada vez que
 * plan.id difiere del de la sesión anterior (incluye pasar de/hacia null).
 * La primera sesión no genera marca (spec §6.3).
 */
export function obtenerCambiosDePlan(
  historial: HistoricalLoadEntry[],
): CambioDePlan[] {
  if (!historial || historial.length < 2) return [];

  const cronologico = [...historial].sort(
    (a, b) =>
      new Date(a.sesion.fecha).getTime() - new Date(b.sesion.fecha).getTime(),
  );

  const cambios: CambioDePlan[] = [];

  for (let i = 1; i < cronologico.length; i++) {
    const prev = cronologico[i - 1]!;
    const curr = cronologico[i]!;

    const prevPlanId = obtenerIdPlan(prev.plan);
    const currPlanId = obtenerIdPlan(curr.plan);

    if (prevPlanId !== currPlanId) {
      cambios.push({
        sesionId: curr.sesion.id,
        fecha: curr.sesion.fecha,
        fechaFormateada: formatearFechaDashboard(curr.sesion.fecha),
        planAnterior: {
          id: prev.plan?.id ?? null,
          nombre: obtenerNombrePlan(prev.plan),
        },
        planNuevo: {
          id: curr.plan?.id ?? null,
          nombre: obtenerNombrePlan(curr.plan),
        },
        indiceSesion: i,
      });
    }
  }

  return cambios;
}

export interface EjercicioDisponible {
  id: string;
  nombre: string;
  frecuencia: number;
}

/**
 * Lista todos los ejercicios con al menos 1 serie válida, ordenados por frecuencia
 * (cantidad de sesiones distintas en las que aparecen) descendente (spec §6.3).
 */
export function obtenerEjerciciosDisponibles(
  historial: HistoricalLoadEntry[],
): EjercicioDisponible[] {
  if (!historial || historial.length === 0) return [];

  const sesionesPorEjercicio = new Map<string, { nombre: string; sesiones: Set<string> }>();

  historial.forEach((entry) => {
    entry.series.forEach((s) => {
      if (esSerieValida(s)) {
        let registro = sesionesPorEjercicio.get(s.ejercicio_id);
        if (!registro) {
          registro = {
            nombre: s.ejercicioNombre || "Ejercicio",
            sesiones: new Set<string>(),
          };
          sesionesPorEjercicio.set(s.ejercicio_id, registro);
        }
        registro.sesiones.add(entry.sesion.id);
      }
    });
  });

  const disponibles: EjercicioDisponible[] = [];
  sesionesPorEjercicio.forEach((val, id) => {
    if (val.sesiones.size > 0) {
      disponibles.push({
        id,
        nombre: val.nombre,
        frecuencia: val.sesiones.size,
      });
    }
  });

  // Ordenar por frecuencia descendente, desempate alfabético
  disponibles.sort((a, b) => b.frecuencia - a.frecuencia || a.nombre.localeCompare(b.nombre));

  return disponibles;
}

export interface PuntoGrafico {
  sesionId: string;
  fecha: string;
  fechaFormateada: string;
  valor: number;
  plan: { id: string; nombre: string } | null;
  indice: number;
  x: number;
  y: number;
}

export interface MarcaGrafico {
  sesionId: string;
  indice: number;
  x: number;
  planNuevo: string;
  planAnterior: string;
  fecha: string;
  fechaFormateada: string;
  ocultarEtiqueta: boolean;
}

export interface DatosGraficoCargas {
  ejercicioId: string | null;
  ejercicioNombre: string;
  aPesoCorporal: boolean;
  unidad: "kg" | "reps";
  puntos: PuntoGrafico[];
  marcas: MarcaGrafico[];
  etiquetaPrimerPlan: string;
  primerPlanOculto: boolean;
  minValor: number;
  maxValor: number;
  polylinePoints: string;
  ariaLabel: string;
}

/**
 * Calcula los puntos del gráfico SVG y las marcas de cambio de plan (spec §6.3 y §6.4).
 * Para que el gráfico se lea, se dibujan como máximo las últimas 60 sesiones con ese ejercicio.
 */
export function calcularPuntosGrafico(
  historial: HistoricalLoadEntry[],
  ejercicioIdSeleccionado?: string | null,
  maxSesiones = 60,
): DatosGraficoCargas {
  const disponibles = obtenerEjerciciosDisponibles(historial);
  const ejercicioElegido =
    disponibles.find((e) => e.id === ejercicioIdSeleccionado) ?? disponibles[0] ?? null;

  if (!ejercicioElegido) {
    return {
      ejercicioId: null,
      ejercicioNombre: "",
      aPesoCorporal: false,
      unidad: "kg",
      puntos: [],
      marcas: [],
      etiquetaPrimerPlan: "Sin plan",
      primerPlanOculto: false,
      minValor: 0,
      maxValor: 0,
      polylinePoints: "",
      ariaLabel: "Sin datos de cargas históricas",
    };
  }

  // Filtrar sesiones con al menos 1 serie válida del ejercicio elegido
  const sesionesConEjercicio: {
    entry: HistoricalLoadEntry;
    seriesValidas: HistoricalLoadEntry["series"];
  }[] = [];

  historial.forEach((entry) => {
    const seriesValidas = entry.series.filter(
      (s) => s.ejercicio_id === ejercicioElegido.id && esSerieValida(s),
    );
    if (seriesValidas.length > 0) {
      sesionesConEjercicio.push({ entry, seriesValidas });
    }
  });

  // Orden cronológico (más vieja a más nueva)
  sesionesConEjercicio.sort(
    (a, b) =>
      new Date(a.entry.sesion.fecha).getTime() -
      new Date(b.entry.sesion.fecha).getTime(),
  );

  // Máximo últimas 60 sesiones
  const ultimasSesiones =
    sesionesConEjercicio.length > maxSesiones
      ? sesionesConEjercicio.slice(-maxSesiones)
      : sesionesConEjercicio;

  // Verificar si es a peso corporal (todas las series válidas con peso_kg === 0)
  const todasLasSeries = ultimasSesiones.flatMap((s) => s.seriesValidas);
  const aPesoCorporal =
    todasLasSeries.length > 0 && todasLasSeries.every((s) => (s.peso_kg ?? 0) === 0);

  const N = ultimasSesiones.length;

  if (N === 0) {
    return {
      ejercicioId: ejercicioElegido.id,
      ejercicioNombre: ejercicioElegido.nombre,
      aPesoCorporal,
      unidad: aPesoCorporal ? "reps" : "kg",
      puntos: [],
      marcas: [],
      etiquetaPrimerPlan: "Sin plan",
      primerPlanOculto: false,
      minValor: 0,
      maxValor: 0,
      polylinePoints: "",
      ariaLabel: `${ejercicioElegido.nombre}: 0 sesiones`,
    };
  }

  // Obtener valor de cada sesión
  const valoresSesion: number[] = ultimasSesiones.map(({ seriesValidas }) => {
    if (aPesoCorporal) {
      return Math.max(...seriesValidas.map((s) => s.reps_hechas ?? 0));
    }
    return Math.max(...seriesValidas.map((s) => s.peso_kg ?? 0));
  });

  const minValor = Math.min(...valoresSesion);
  const maxValor = Math.max(...valoresSesion);

  // viewBox 0 0 100 40
  const span = maxValor - minValor;
  const lo = span === 0 ? minValor - 1 : minValor - span * 0.05;
  const rango = span === 0 ? 2 : span * 1.1;
  const calcularY = (v: number) => 40 - ((v - lo) / rango) * 40;

  const puntos: PuntoGrafico[] = ultimasSesiones.map(({ entry }, idx) => {
    const x = N === 1 ? 0 : (idx / (N - 1)) * 100;
    const v = valoresSesion[idx]!;
    const y = calcularY(v);
    return {
      sesionId: entry.sesion.id,
      fecha: entry.sesion.fecha,
      fechaFormateada: formatearFechaDashboard(entry.sesion.fecha),
      valor: v,
      plan: entry.plan ?? null,
      indice: idx,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
  });

  const polylinePoints =
    N > 1 ? puntos.map((p) => `${p.x},${p.y}`).join(" ") : "";

  // Marcas de cambio de plan sobre el gráfico
  const marcas: MarcaGrafico[] = [];
  const etiquetaPrimerPlan = obtenerNombrePlan(ultimasSesiones[0]!.entry.plan);
  let primerPlanOculto = false;

  for (let i = 1; i < N; i++) {
    const prevPlanId = obtenerIdPlan(ultimasSesiones[i - 1]!.entry.plan);
    const currPlanId = obtenerIdPlan(ultimasSesiones[i]!.entry.plan);

    if (prevPlanId !== currPlanId) {
      const x = Number(((i / (N - 1)) * 100).toFixed(2));
      marcas.push({
        sesionId: ultimasSesiones[i]!.entry.sesion.id,
        indice: i,
        x,
        planNuevo: obtenerNombrePlan(ultimasSesiones[i]!.entry.plan),
        planAnterior: obtenerNombrePlan(ultimasSesiones[i - 1]!.entry.plan),
        fecha: ultimasSesiones[i]!.entry.sesion.fecha,
        fechaFormateada: formatearFechaDashboard(ultimasSesiones[i]!.entry.sesion.fecha),
        ocultarEtiqueta: false,
      });
    }
  }

  // Si dos marcas quedan a menos de 8% de distancia, la etiqueta de la anterior se oculta (queda el title)
  for (let m = 0; m < marcas.length; m++) {
    if (m === 0) {
      if (marcas[0]!.x < 8) {
        primerPlanOculto = true;
      }
    } else {
      if (marcas[m]!.x - marcas[m - 1]!.x < 8) {
        marcas[m - 1]!.ocultarEtiqueta = true;
      }
    }
  }

  const ariaLabel = ariaGraficoCargas(
    ejercicioElegido.nombre,
    minValor,
    maxValor,
    N,
    marcas.length,
    aPesoCorporal,
  );

  return {
    ejercicioId: ejercicioElegido.id,
    ejercicioNombre: ejercicioElegido.nombre,
    aPesoCorporal,
    unidad: aPesoCorporal ? "reps" : "kg",
    puntos,
    marcas,
    etiquetaPrimerPlan,
    primerPlanOculto,
    minValor,
    maxValor,
    polylinePoints,
    ariaLabel,
  };
}

/**
 * Accesibilidad (spec §6.4 y §6.7):
 * ej. "Sentadilla: carga máxima de 60 a 85 kilos en 24 sesiones, 2 cambios de plan"
 */
export function ariaGraficoCargas(
  ejercicioNombre: string,
  minVal: number,
  maxVal: number,
  numSesiones: number,
  cambiosCount: number,
  aPesoCorporal: boolean,
): string {
  const unidad = aPesoCorporal ? "reps" : "kilos";
  const sesionesTexto = `${numSesiones} ${numSesiones === 1 ? "sesión" : "sesiones"}`;
  const cambiosTexto = `${cambiosCount} ${cambiosCount === 1 ? "cambio de plan" : "cambios de plan"}`;
  return `${ejercicioNombre}: carga máxima de ${minVal} a ${maxVal} ${unidad} en ${sesionesTexto}, ${cambiosTexto}`;
}
