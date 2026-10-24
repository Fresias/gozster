// "Mi progreso" (GOZS-162, spec docs/specs/historial-progreso.md §0 y §4).
// Agregación pura: a partir de las series válidas y las sesiones del alumno arma el
// modelo que consume la pantalla. Sin React y sin red: testeable y usable offline.
// Reutiliza esSerieValida (§0.1) y la fórmula de Epley que ya existen; no se duplican.

import { calculateEpley1RM } from "@/lib/strength-metrics";
import { esSerieValida, type SerieHistorica } from "@/lib/historial-ejercicio";

const ZONA = "America/Argentina/Buenos_Aires";
const DIAS_RECIENTES = 90;
const MAX_EJERCICIOS = 4; // §4.3: hasta 4 ejercicios principales.
const MAX_PUNTOS = 12; // §4.3: últimas 12 sesiones por ejercicio.
const EPLEY_MAX_REPS = 12; // §4.3: 1RM Epley solo sobre series con reps <= 12.

// Una sesión del alumno (registro_sesiones). El volumen solo se usa en TECNICA.
export interface SesionHistorica {
  id: string;
  fecha: string; // ISO
  effective_volume_kg?: number | null;
}

// Un punto del gráfico: resumen de una sesión del ejercicio.
export interface PuntoProgreso {
  fecha: string;
  peso_max_kg: number; // 0 si la sesión fue a peso corporal
  reps_max: number;
  epley_max_kg: number; // 0 si ninguna serie tuvo reps <= 12
}

export interface EjercicioProgreso {
  ejercicio_id: string;
  nombre: string;
  a_peso_corporal: boolean; // todas las series a peso corporal (peso_kg = 0)
  puntos: PuntoProgreso[]; // orden cronológico (viejo → nuevo)
}

export interface MiProgresoData {
  sesiones_mes: number;
  sesiones_mes_anterior: number;
  volumen_mes_kg: number; // solo se muestra en TECNICA
  ejercicios: EjercicioProgreso[];
}

// Año y mes (1-12) de una fecha, en hora de Buenos Aires (§0.2).
function anioMes(fecha: string | Date): { anio: number; mes: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit" }).formatToParts(
    typeof fecha === "string" ? new Date(fecha) : fecha,
  );
  const o = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { anio: Number(o.year), mes: Number(o.month) };
}

// §4.3: sesiones del mes calendario en curso y del mes anterior completo.
export function sesionesDelMes(
  sesiones: SesionHistorica[],
  hoy: Date = new Date(),
): { esteMes: number; mesAnterior: number } {
  const actual = anioMes(hoy);
  const anterior = actual.mes === 1 ? { anio: actual.anio - 1, mes: 12 } : { anio: actual.anio, mes: actual.mes - 1 };
  let esteMes = 0;
  let mesAnterior = 0;
  for (const s of sesiones) {
    const am = anioMes(s.fecha);
    if (am.anio === actual.anio && am.mes === actual.mes) esteMes++;
    else if (am.anio === anterior.anio && am.mes === anterior.mes) mesAnterior++;
  }
  return { esteMes, mesAnterior };
}

// §4.3 (TECNICA): suma de effective_volume_kg del mes en curso.
export function volumenDelMes(sesiones: SesionHistorica[], hoy: Date = new Date()): number {
  const actual = anioMes(hoy);
  return sesiones.reduce((acc, s) => {
    const am = anioMes(s.fecha);
    return am.anio === actual.anio && am.mes === actual.mes ? acc + (s.effective_volume_kg ?? 0) : acc;
  }, 0);
}

// Ranking por sesiones distintas; desempate por mayor peso máximo, luego id (determinismo).
function rankearEjercicios(series: SerieHistorica[]): string[] {
  const porEj = new Map<string, { sesiones: Set<string>; maxPeso: number }>();
  for (const s of series) {
    const e = porEj.get(s.ejercicio_id) ?? { sesiones: new Set<string>(), maxPeso: 0 };
    e.sesiones.add(s.sesion_id);
    e.maxPeso = Math.max(e.maxPeso, s.peso_kg);
    porEj.set(s.ejercicio_id, e);
  }
  return [...porEj.entries()]
    .sort(
      (a, b) =>
        b[1].sesiones.size - a[1].sesiones.size || b[1].maxPeso - a[1].maxPeso || a[0].localeCompare(b[0]),
    )
    .slice(0, MAX_EJERCICIOS)
    .map(([id]) => id);
}

// §4.3: los 4 ejercicio_id en más sesiones distintas de los últimos 90 días.
// Si no hay ninguno en 90 días, se usan los 4 más frecuentes de todo el historial.
export function ejerciciosPrincipales(series: SerieHistorica[], hoy: Date = new Date()): string[] {
  const validas = series.filter(esSerieValida);
  const corte = hoy.getTime() - DIAS_RECIENTES * 24 * 60 * 60 * 1000;
  const recientes = validas.filter((s) => Date.parse(s.fecha) >= corte);
  return rankearEjercicios(recientes.length > 0 ? recientes : validas);
}

// §4.3: un punto por sesión, las últimas 12 sesiones del ejercicio (sin límite de fecha).
export function puntosDeEjercicio(series: SerieHistorica[], ejercicioId: string): PuntoProgreso[] {
  const porSesion = new Map<string, SerieHistorica[]>();
  for (const s of series) {
    if (s.ejercicio_id !== ejercicioId || !esSerieValida(s)) continue;
    const grupo = porSesion.get(s.sesion_id);
    if (grupo) grupo.push(s);
    else porSesion.set(s.sesion_id, [s]);
  }
  const puntos = [...porSesion.values()].map((ss) => {
    const conReps = ss.filter((s) => s.reps_hechas <= EPLEY_MAX_REPS).map((s) => calculateEpley1RM(s.peso_kg, s.reps_hechas));
    return {
      fecha: ss[0]!.fecha,
      peso_max_kg: Math.max(...ss.map((s) => s.peso_kg)),
      reps_max: Math.max(...ss.map((s) => s.reps_hechas)),
      epley_max_kg: conReps.length > 0 ? Math.max(...conReps) : 0,
    };
  });
  puntos.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));
  return puntos.slice(-MAX_PUNTOS);
}

// §4.3: arma el modelo completo. `nombres` mapea ejercicio_id → nombre del catálogo.
export function agregarMiProgreso(
  series: SerieHistorica[],
  sesiones: SesionHistorica[],
  nombres: Record<string, string>,
  hoy: Date = new Date(),
): MiProgresoData {
  const { esteMes, mesAnterior } = sesionesDelMes(sesiones, hoy);
  const ejercicios: EjercicioProgreso[] = ejerciciosPrincipales(series, hoy).map((id) => {
    const puntos = puntosDeEjercicio(series, id);
    return {
      ejercicio_id: id,
      nombre: nombres[id] ?? "Ejercicio",
      a_peso_corporal: puntos.length > 0 && puntos.every((p) => p.peso_max_kg === 0),
      puntos,
    };
  });
  return {
    sesiones_mes: esteMes,
    sesiones_mes_anterior: mesAnterior,
    volumen_mes_kg: volumenDelMes(sesiones, hoy),
    ejercicios,
  };
}

// ---- Helpers de presentación (puros, compartidos por la pantalla) ----

const kg = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const miles = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

// El valor que "pinta" la línea y el número grande: peso máx, o reps a peso corporal.
export function valorPunto(p: PuntoProgreso, aPesoCorporal: boolean): number {
  return aPesoCorporal ? p.reps_max : p.peso_max_kg;
}

// §4.3: nombre del mes en minúscula; con el año solo si difiere del año de `hoy`.
function mesDe(fecha: string, hoy: Date): string {
  const nombre = new Date(fecha).toLocaleDateString("es-AR", { timeZone: ZONA, month: "long" });
  const anio = anioMes(fecha).anio;
  return anio === anioMes(hoy).anio ? nombre : `${nombre} ${anio}`;
}

export type SignoDelta = "positivo" | "cero" | "negativo";
export interface Delta {
  texto: string;
  signo: SignoDelta;
}

// §4.3: delta entre el primer y el último punto. null si hay menos de 2 puntos.
// "+10 kg desde agosto" | "Igual que en agosto" | "−5 kg desde agosto" (sin rojo: es info).
export function formatearDelta(ej: EjercicioProgreso, hoy: Date = new Date()): Delta | null {
  if (ej.puntos.length < 2) return null;
  const primero = ej.puntos[0]!;
  const ultimo = ej.puntos[ej.puntos.length - 1]!;
  const diff = valorPunto(ultimo, ej.a_peso_corporal) - valorPunto(primero, ej.a_peso_corporal);
  const mes = mesDe(primero.fecha, hoy);
  if (diff === 0) return { texto: `Igual que en ${mes}`, signo: "cero" };
  const unidad = ej.a_peso_corporal ? "reps" : "kg";
  const prefijo = diff > 0 ? "+" : "−"; // U+2212 signo menos
  const magnitud = ej.a_peso_corporal ? String(Math.abs(diff)) : kg.format(Math.abs(diff));
  return { texto: `${prefijo}${magnitud} ${unidad} desde ${mes}`, signo: diff > 0 ? "positivo" : "negativo" };
}

// §4.4: aria-label del gráfico. "Sentadilla: de 75 a 85 kilos en las últimas 12 sesiones".
export function ariaProgreso(ej: EjercicioProgreso): string {
  if (ej.puntos.length === 0) return ej.nombre;
  const v0 = valorPunto(ej.puntos[0]!, ej.a_peso_corporal);
  const v1 = valorPunto(ej.puntos[ej.puntos.length - 1]!, ej.a_peso_corporal);
  const unidad = ej.a_peso_corporal ? "repeticiones" : "kilos";
  return `${ej.nombre}: de ${kg.format(v0)} a ${kg.format(v1)} ${unidad} en las últimas ${ej.puntos.length} sesiones`;
}

// §4.6: número grande de la tarjeta. "85 kg" | "14 reps".
export function etiquetaValor(p: PuntoProgreso, aPesoCorporal: boolean): string {
  return aPesoCorporal ? `${p.reps_max} reps` : `${kg.format(p.peso_max_kg)} kg`;
}

// §4.6 (TECNICA): "1RM est. 99 kg".
export function etiquetaEpley(p: PuntoProgreso): string {
  return `1RM est. ${kg.format(Math.round(p.epley_max_kg))} kg`;
}

// §4.6 (TECNICA): "Volumen del mes: 42.350 kg".
export function etiquetaVolumen(volumenKg: number): string {
  return `Volumen del mes: ${miles.format(Math.round(volumenKg))} kg`;
}
