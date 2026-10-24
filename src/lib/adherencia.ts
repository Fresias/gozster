// Calendario de adherencia del Coach Studio (GOZS-163, spec docs/specs/historial-progreso.md §5).
// Agregación pura: a partir de las sesiones del alumno arma la grilla estilo contribuciones
// (52 semanas, lunes→domingo), los conteos por semana, el promedio, las semanas con objetivo
// cumplido y los días sin entrenar. Sin React y sin red: testeable con Vitest y usable offline.
// Reutiliza DIAS_SIN_ENTRENAR (§5.3) para el umbral rojo del badge.

import { DIAS_SIN_ENTRENAR } from "@/lib/sin-entrenar";

const ZONA = "America/Argentina/Buenos_Aires";
const SEMANAS = 52; // §5.4: 52 columnas, la más reciente a la derecha.
const SEMANAS_PROMEDIO = 12; // §5.5: promedio de las últimas 12 semanas completas.
const MS_DIA = 86_400_000;

// Una sesión del alumno (registro_sesiones). Solo se necesita la fecha: un día cuenta como
// entrenado si tiene ≥ 1 sesión y las sesiones por semana son el conteo de filas.
export interface SesionAdherencia {
  fecha: string; // ISO
}

export type EstadoCelda = "entreno" | "no-entreno" | "antes-primera" | "futuro";

export interface CeldaDia {
  fecha: string; // yyyy-mm-dd en hora de Buenos Aires
  estado: EstadoCelda;
  sesiones: number; // sesiones de ese día (para el title)
  esHoy: boolean;
  title: string; // "mar 14 oct 2025 · 1 sesión" / "· sin entrenar"
}

export interface SemanaAdherencia {
  lunes: string; // yyyy-mm-dd del lunes de la semana
  dias: CeldaDia[]; // 7, lunes arriba → domingo
  sesiones: number; // conteo de sesiones de la semana
  completa: boolean; // semana cerrada (anterior a la semana actual)
  esActual: boolean; // contiene a hoy
  antesPrimera: boolean; // toda la semana es anterior a la primera sesión
  cumplido: boolean; // con objetivo y sesiones >= objetivo
  evaluable: boolean; // completa, posterior a la primera sesión y con objetivo
  numeroTexto: string; // "2" | "—" (magnitud cero) | "…" (dato no disponible)
}

export interface EtiquetaMes {
  col: number; // índice de columna (0 = más antigua)
  label: string; // "ene", "feb"…
}

export interface Adherencia {
  semanas: SemanaAdherencia[]; // 52, la más reciente al final
  meses: EtiquetaMes[];
  objetivo: number | null; // días del plan activo; null → sin objetivo
  diasSinEntrenar: number | null; // null si no hay sesiones en la ventana
  nuncaEntreno: boolean; // el alumno no tiene ninguna sesión (primeraSesion null)
  promedio12: number | null; // promedio de sesiones/sem de las últimas 12 semanas completas
  semanasCumplidas: number | null; // semanas completas con objetivo cumplido
  semanasEvaluadas: number; // denominador de "X de Y"
  ariaLabel: string;
}

// ---- Helpers de fecha (civil, hora de Buenos Aires, semana lunes–domingo) ----

const fmtCivil = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Fecha civil "yyyy-mm-dd" en Buenos Aires de un instante ISO.
function civil(fecha: string | Date): string {
  return fmtCivil.format(typeof fecha === "string" ? new Date(fecha) : fecha);
}

// "yyyy-mm-dd" → número de día (días desde epoch), para aritmética sin TZ.
function diaNum(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / MS_DIA);
}

// Número de día → "yyyy-mm-dd".
function numYmd(n: number): string {
  return new Date(n * MS_DIA).toISOString().slice(0, 10);
}

// Lunes (yyyy-mm-dd) de la semana que contiene a ymd.
function lunesDe(ymd: string): string {
  const n = diaNum(ymd);
  const dow = new Date(n * MS_DIA).getUTCDay(); // 0=domingo … 6=sábado
  return numYmd(n - ((dow + 6) % 7));
}

const fmtPartes = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// "mar 14 oct 2025" (sin comas ni puntos abreviativos, como en la spec §5.4).
function fechaLarga(ymd: string): string {
  const partes = fmtPartes.formatToParts(new Date(ymd + "T00:00:00Z"));
  const o: Record<string, string> = {};
  for (const p of partes) o[p.type] = p.value;
  const limpia = (s: string) => s.replace(/\.$/, "");
  return `${limpia(o.weekday!)} ${o.day} ${limpia(o.month!)} ${o.year}`;
}

const fmtMes = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "short" });

// "ene", "feb"… (sin punto abreviativo).
function mesCorto(ymd: string): string {
  return fmtMes.format(new Date(ymd + "T00:00:00Z")).replace(/\.$/, "");
}

const fmtPromedio = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// §5.5: promedio con 1 decimal y coma ("2,4"). null → "—".
export function formatearPromedio(n: number | null): string {
  return n === null ? "—" : fmtPromedio.format(n);
}

// §5.5: texto y variante del badge "días sin entrenar".
export interface BadgeAdherencia {
  texto: string;
  variante: "outline" | "destructive" | "secondary";
  entrenoHoy: boolean; // outline + color de éxito
}

export function badgeAdherencia(diasSinEntrenar: number | null, nuncaEntreno: boolean): BadgeAdherencia {
  if (nuncaEntreno || diasSinEntrenar === null) {
    return { texto: "Nunca entrenó", variante: "secondary", entrenoHoy: false };
  }
  if (diasSinEntrenar === 0) return { texto: "Entrenó hoy", variante: "outline", entrenoHoy: true };
  const plural = diasSinEntrenar === 1 ? "día" : "días";
  const texto = `${diasSinEntrenar} ${plural} sin entrenar`;
  return { texto, variante: diasSinEntrenar > DIAS_SIN_ENTRENAR ? "destructive" : "outline", entrenoHoy: false };
}

// ---- Agregación principal ----

// §5.3: arma el modelo completo del calendario de adherencia.
// - `sesiones`: filas de registro_sesiones de los últimos ~371 días (una por sesión).
// - `hoy`: instante actual.
// - `objetivo`: días del plan activo (`dias_rutina`); null → sin objetivo, nada en rojo.
// - `primeraSesion`: mínima fecha del alumno (se pide aparte); null → nunca entrenó.
export function armarAdherencia(
  sesiones: SesionAdherencia[],
  hoy: Date = new Date(),
  objetivo: number | null = null,
  primeraSesion: string | null = null,
): Adherencia {
  const hoyYmd = civil(hoy);
  const hoyNum = diaNum(hoyYmd);

  // Sesiones por día civil + última sesión de la ventana.
  const porDia = new Map<string, number>();
  let ultimaNum = -Infinity;
  for (const s of sesiones) {
    const d = civil(s.fecha);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
    ultimaNum = Math.max(ultimaNum, diaNum(d));
  }

  const nuncaEntreno = primeraSesion === null;
  const primeraNum = primeraSesion === null ? Infinity : diaNum(civil(primeraSesion));
  const lunesActualNum = diaNum(lunesDe(hoyYmd));
  const primerLunesNum = lunesActualNum - (SEMANAS - 1) * 7;

  const semanas: SemanaAdherencia[] = [];
  const meses: EtiquetaMes[] = [];
  let mesPrevio = "";

  for (let col = 0; col < SEMANAS; col++) {
    const lunesNum = primerLunesNum + col * 7;
    const lunesYmd = numYmd(lunesNum);
    const esActual = lunesNum === lunesActualNum;
    const completa = lunesNum < lunesActualNum;

    const dias: CeldaDia[] = [];
    let sesionesSemana = 0;
    for (let i = 0; i < 7; i++) {
      const diaN = lunesNum + i;
      const ymd = numYmd(diaN);
      const cuenta = porDia.get(ymd) ?? 0;
      sesionesSemana += cuenta;

      let estado: EstadoCelda;
      if (diaN > hoyNum) estado = "futuro";
      else if (diaN < primeraNum) estado = "antes-primera";
      else if (cuenta > 0) estado = "entreno";
      else estado = "no-entreno";

      let title = fechaLarga(ymd);
      if (estado === "entreno") title += ` · ${cuenta} ${cuenta === 1 ? "sesión" : "sesiones"}`;
      else if (estado === "no-entreno") title += " · sin entrenar";

      dias.push({ fecha: ymd, estado, sesiones: cuenta, esHoy: diaN === hoyNum, title });
    }

    const domingoNum = lunesNum + 6;
    const antesPrimera = domingoNum < primeraNum;
    const evaluable = completa && !antesPrimera && objetivo !== null;
    const cumplido = objetivo !== null && sesionesSemana >= objetivo;

    let numeroTexto: string;
    if (antesPrimera) numeroTexto = "…"; // dato no disponible (INDEC)
    else if (esActual) numeroTexto = String(sesionesSemana); // actual: nunca en rojo
    else if (sesionesSemana === 0) numeroTexto = "—"; // magnitud cero (INDEC)
    else numeroTexto = String(sesionesSemana);

    semanas.push({
      lunes: lunesYmd,
      dias,
      sesiones: sesionesSemana,
      completa,
      esActual,
      antesPrimera,
      cumplido,
      evaluable,
      numeroTexto,
    });

    const mes = mesCorto(lunesYmd);
    if (mes !== mesPrevio) {
      meses.push({ col, label: mes });
      mesPrevio = mes;
    }
  }

  // §5.5: días sin entrenar desde la última sesión de la ventana.
  const diasSinEntrenar = ultimaNum === -Infinity ? null : hoyNum - ultimaNum;

  // §5.5: promedio de las últimas 12 semanas completas posteriores a la primera sesión.
  const completasEval = semanas.filter((w) => w.completa && !w.antesPrimera);
  const ventana = completasEval.slice(-SEMANAS_PROMEDIO);
  const promedio12 =
    ventana.length > 0 ? ventana.reduce((a, w) => a + w.sesiones, 0) / ventana.length : null;

  // §5.5: semanas con objetivo cumplido / semanas evaluables (completas, posteriores, con objetivo).
  const evaluables = semanas.filter((w) => w.evaluable);
  const semanasEvaluadas = evaluables.length;
  const semanasCumplidas = objetivo === null ? null : evaluables.filter((w) => w.cumplido).length;

  return {
    semanas,
    meses,
    objetivo,
    diasSinEntrenar,
    nuncaEntreno,
    promedio12,
    semanasCumplidas,
    semanasEvaluadas,
    ariaLabel: construirAria(objetivo, semanasCumplidas, semanasEvaluadas, promedio12, diasSinEntrenar, nuncaEntreno),
  };
}

function construirAria(
  objetivo: number | null,
  cumplidas: number | null,
  evaluadas: number,
  promedio: number | null,
  dias: number | null,
  nunca: boolean,
): string {
  const partes: string[] = ["Adherencia de las últimas 52 semanas"];
  const detalle: string[] = [];
  if (objetivo !== null && cumplidas !== null) {
    detalle.push(`${cumplidas} de ${evaluadas} semanas con el objetivo cumplido`);
  }
  if (promedio !== null) detalle.push(`promedio ${formatearPromedio(promedio)} sesiones por semana`);
  if (nunca) detalle.push("todavía no entrenó");
  else if (dias !== null) detalle.push(dias === 0 ? "entrenó hoy" : `${dias} ${dias === 1 ? "día" : "días"} sin entrenar`);
  return detalle.length > 0 ? `${partes[0]}: ${detalle.join(", ")}` : partes[0]!;
}
