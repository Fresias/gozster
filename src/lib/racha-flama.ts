export type CategoriaRacha = "hierro" | "bronce" | "oro" | "diamante";
export type NivelRachaFlama = 1 | 2 | 3 | 4;

export interface PaletaCategoria {
  ic: string;
  bg: string;
  fg: string;
  bd: string;
  core?: string;
  tongue?: string;
}

export const PALETAS_RACHA: Record<
  CategoriaRacha,
  { claro: PaletaCategoria; oscuro: PaletaCategoria }
> = {
  hierro: {
    claro: { ic: "#18181B", bg: "#FFFFFF", fg: "#09090B", bd: "#D4D4D8" },
    oscuro: { ic: "#FAFAFA", bg: "#18181B", fg: "#FAFAFA", bd: "#3F3F46" },
  },
  bronce: {
    claro: { ic: "#7A6338", bg: "#F5F3EC", fg: "#45371B", bd: "#A38B5D" },
    oscuro: { ic: "#C4A66B", bg: "#1C1A13", fg: "#EAE0C8", bd: "#7A6338" },
  },
  oro: {
    claro: {
      ic: "#BE8700",
      bg: "#FFFDF5",
      fg: "#5C3F00",
      bd: "#C99714",
      core: "#FFF7D6",
    },
    oscuro: {
      ic: "#FACC15",
      bg: "#211C06",
      fg: "#FEF08A",
      bd: "#EAB308",
      core: "#FEF9C3",
    },
  },
  diamante: {
    claro: {
      ic: "#0369A1",
      tongue: "#0284C7",
      core: "#FFFFFF",
      bg: "#F0F9FF",
      fg: "#0C4A6E",
      bd: "#0284C7",
    },
    oscuro: {
      ic: "#38BDF8",
      tongue: "#0284C7",
      core: "#F0F9FF",
      bg: "#0B2239",
      fg: "#BAE6FD",
      bd: "#38BDF8",
    },
  },
};

export const ETIQUETAS_CATEGORIA_RACHA: Record<CategoriaRacha, string> = {
  hierro: "Hierro",
  bronce: "Bronce",
  oro: "Oro",
  diamante: "Diamante",
};

export const BARRAS_POR_POSICION = [
  { pos: 1 as const, amp: 0, dur: null, latido: false },
  { pos: 2 as const, amp: 0.32, dur: 2.93, latido: true },
  { pos: 3 as const, amp: 0.54, dur: 1.87, latido: true },
  { pos: 4 as const, amp: 0.75, dur: 0.8, latido: true },
] as const;

export const MOVIMIENTO_DIAMANTE_B = {
  principal: { amp: 0.8, speed: 0.6, phaseDeg: 105, lag: 0.65 },
  izquierda: { amp: 0.45, speed: 0.9, phaseDeg: 225, lag: 0.4 },
  derecha: { amp: 0.35, speed: 0.7, phaseDeg: 30, lag: 0.75 },
} as const;

export const SVG_PATHS_FLAMA = {
  OUTER:
    "M12 2.5C12.8 5.5 15 7.2 16.6 9.4C18 11.3 18.8 13.2 18.8 15.2C18.8 19 15.8 21.5 12 21.5C8.2 21.5 5.2 19 5.2 15.2C5.2 12.6 6.5 10.6 8 9.2C8.2 10.8 9 12 10.2 12.6C10 9.2 10.8 5.4 12 2.5Z",
  CORE:
    "M12 11.6C13.2 13.3 14.5 14.7 14.5 16.7C14.5 18.3 13.4 19.5 12 19.5C10.6 19.5 9.5 18.3 9.5 16.7C9.5 14.7 10.8 13.3 12 11.6Z",
  D2_TONGUE_L:
    "M10.2 20.9C6.2 20.8 3.1 18.6 2.8 15.4C2.6 12.8 3.6 10.6 4.7 9.1C5.2 10.8 6.4 12.0 8.8 13.4L10.2 20.9Z",
  D2_TONGUE_R:
    "M13.8 20.9C17.8 20.8 20.9 18.6 21.2 15.4C21.4 12.9 20.4 10.9 19.3 9.5C18.8 11.1 17.6 12.2 15.2 13.5L13.8 20.9Z",
  WAVE: "M-12 3q1.5-1.6 3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0t3 0V30H-12Z",
} as const;

export interface BarrasRachaSpec {
  /** Cantidad de barritas activas (1..4, o 0 en Diamante). */
  activas: number;
  /** Posición dentro del bloque de 4 (1..4, o 0 en Diamante). */
  posicion: number;
  /** Si la barrita actual debe latir (false en sem 5–8, pos 1 y Diamante). */
  animada: boolean;
  /** Si el bloque actual habilita latido (true en Hierro/Oro y Bronce >= 9). */
  bloqueConLatido: boolean;
  /** Amplitud de la barrita actual (0 | 0.32 | 0.54 | 0.75). */
  amplitud: number;
  /** Duración en segundos del latido (null si no late, o 2.93 / 1.87 / 0.8). */
  duracionSeg: number | null;
}

export interface EscalonOroSpec {
  escalon: 1 | 2 | 3 | 4 | 5 | 6;
  duracionFlickSeg: number;
  amplitudFlick: number;
}

export interface ChispasDiamanteSpec {
  cantidad: number;
  intensidad: number;
  frecuencia: number;
}

export interface EspecificacionRacha {
  semanasTotales: number;
  semanaCiclo: number;
  cicloActual: number;
  categoria: CategoriaRacha;
  etiquetaCategoria: string;
  nivel: NivelRachaFlama;
  porcentajeLlenado: number;
  fillY: number;
  barras: BarrasRachaSpec;
  escalonOro: EscalonOroSpec | null;
  chispas: ChispasDiamanteSpec | null;
  waveDurSeg: number;
  flick: { duracionSeg: number; amplitud: number } | null;
  esChipDual: boolean;
  diamantes: number;
  paleta: { claro: PaletaCategoria; oscuro: PaletaCategoria };
}

function calcLinearPct(w: number, startW: number, endW: number, endPct: number): number {
  return Math.round(((w - startW) / Math.max(1, endW - startW)) * endPct);
}

export function fillPctToY(pct: number): number {
  if (pct >= 100) return -2.0;
  if (pct <= 0) return 19.0;
  return Number((21.5 - (pct / 100) * 19.0 - 3).toFixed(2));
}

export function nivelPorCategoria(categoria: CategoriaRacha): NivelRachaFlama {
  switch (categoria) {
    case "hierro":
      return 1;
    case "bronce":
      return 2;
    case "oro":
      return 3;
    case "diamante":
      return 4;
  }
}

/**
 * Especificación pura y determinista de la racha por categorías (racha-config-final-v3.json).
 * Desde la semana 53, `semanaCiclo = ((semanas - 1) % 52) + 1` y se activa el chip dual.
 */
export function especificacionRacha(
  semanas: number,
  diamantes = 0,
): EspecificacionRacha {
  const semanasSan = Number.isFinite(semanas) ? Math.max(0, Math.floor(semanas)) : 0;
  const diamantesInput = Number.isFinite(diamantes)
    ? Math.max(0, Math.floor(diamantes))
    : 0;

  if (semanasSan < 1) {
    return {
      semanasTotales: 0,
      semanaCiclo: 0,
      cicloActual: 1,
      categoria: "hierro",
      etiquetaCategoria: ETIQUETAS_CATEGORIA_RACHA.hierro,
      nivel: 1,
      porcentajeLlenado: 0,
      fillY: fillPctToY(0),
      barras: {
        activas: 0,
        posicion: 0,
        animada: false,
        bloqueConLatido: false,
        amplitud: 0,
        duracionSeg: null,
      },
      escalonOro: null,
      chispas: null,
      waveDurSeg: 2.5,
      flick: { duracionSeg: 2.6, amplitud: 1 },
      esChipDual: false,
      diamantes: diamantesInput,
      paleta: PALETAS_RACHA.hierro,
    };
  }

  const semanaCiclo = ((semanasSan - 1) % 52) + 1;
  const ciclosCompletados = Math.floor((semanasSan - 1) / 52);
  const cicloActual = ciclosCompletados + 1;
  const esChipDual = semanasSan >= 53;
  const diamantesEfectivos = Math.max(diamantesInput, ciclosCompletados);

  if (semanaCiclo <= 4) {
    const porcentajeLlenado = calcLinearPct(semanaCiclo, 1, 4, 80);
    const pos = semanaCiclo;
    const barMeta = BARRAS_POR_POSICION[pos - 1]!;
    return {
      semanasTotales: semanasSan,
      semanaCiclo,
      cicloActual,
      categoria: "hierro",
      etiquetaCategoria: ETIQUETAS_CATEGORIA_RACHA.hierro,
      nivel: 1,
      porcentajeLlenado,
      fillY: fillPctToY(porcentajeLlenado),
      barras: {
        activas: pos,
        posicion: pos,
        animada: pos > 1,
        bloqueConLatido: true,
        amplitud: barMeta.amp,
        duracionSeg: barMeta.dur,
      },
      escalonOro: null,
      chispas: null,
      waveDurSeg: 2.5,
      flick: { duracionSeg: 2.6, amplitud: 1 },
      esChipDual,
      diamantes: diamantesEfectivos,
      paleta: PALETAS_RACHA.hierro,
    };
  }

  if (semanaCiclo <= 24) {
    const porcentajeLlenado = calcLinearPct(semanaCiclo, 5, 24, 80);
    const pos = ((semanaCiclo - 5) % 4) + 1;
    const barMeta = BARRAS_POR_POSICION[pos - 1]!;
    const bloqueConLatido = semanaCiclo >= 9;
    return {
      semanasTotales: semanasSan,
      semanaCiclo,
      cicloActual,
      categoria: "bronce",
      etiquetaCategoria: ETIQUETAS_CATEGORIA_RACHA.bronce,
      nivel: 2,
      porcentajeLlenado,
      fillY: fillPctToY(porcentajeLlenado),
      barras: {
        activas: pos,
        posicion: pos,
        animada: bloqueConLatido && pos > 1,
        bloqueConLatido,
        amplitud: bloqueConLatido ? barMeta.amp : 0,
        duracionSeg: bloqueConLatido ? barMeta.dur : null,
      },
      escalonOro: null,
      chispas: null,
      waveDurSeg: Number((2.3 - ((semanaCiclo - 5) / 19) * 0.6).toFixed(2)),
      flick: null,
      esChipDual,
      diamantes: diamantesEfectivos,
      paleta: PALETAS_RACHA.bronce,
    };
  }

  if (semanaCiclo <= 48) {
    const porcentajeLlenado = calcLinearPct(semanaCiclo, 25, 48, 80);
    const step = (Math.floor((semanaCiclo - 25) / 4) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const pos = ((semanaCiclo - 25) % 4) + 1;
    const barMeta = BARRAS_POR_POSICION[pos - 1]!;
    const duracionFlickSeg = Number((2.3 - ((step - 1) / 5) * 0.85).toFixed(2));
    const amplitudFlick = Number((1.0 + ((step - 1) / 5) * 1.0).toFixed(2));
    return {
      semanasTotales: semanasSan,
      semanaCiclo,
      cicloActual,
      categoria: "oro",
      etiquetaCategoria: ETIQUETAS_CATEGORIA_RACHA.oro,
      nivel: 3,
      porcentajeLlenado,
      fillY: fillPctToY(porcentajeLlenado),
      barras: {
        activas: pos,
        posicion: pos,
        animada: pos > 1,
        bloqueConLatido: true,
        amplitud: barMeta.amp,
        duracionSeg: barMeta.dur,
      },
      escalonOro: {
        escalon: step,
        duracionFlickSeg,
        amplitudFlick,
      },
      chispas: null,
      waveDurSeg: 1.6,
      flick: { duracionSeg: duracionFlickSeg, amplitud: amplitudFlick },
      esChipDual,
      diamantes: diamantesEfectivos,
      paleta: PALETAS_RACHA.oro,
    };
  }

  const porcentajeLlenado = calcLinearPct(semanaCiclo, 49, 52, 100);
  const t = Math.max(0, Math.min(1, (semanaCiclo - 49) / 3));
  return {
    semanasTotales: semanasSan,
    semanaCiclo,
    cicloActual,
    categoria: "diamante",
    etiquetaCategoria: ETIQUETAS_CATEGORIA_RACHA.diamante,
    nivel: 4,
    porcentajeLlenado,
    fillY: fillPctToY(porcentajeLlenado),
    barras: {
      activas: 0,
      posicion: 0,
      animada: false,
      bloqueConLatido: false,
      amplitud: 0,
      duracionSeg: null,
    },
    escalonOro: null,
    chispas: {
      cantidad: Math.round(2 + 10 * t),
      intensidad: Number((0.5 + 2.0 * t).toFixed(2)),
      frecuencia: Number((0.4 + 1.6 * t).toFixed(2)),
    },
    waveDurSeg: 1.4,
    flick: null,
    esChipDual,
    diamantes: diamantesEfectivos,
    paleta: PALETAS_RACHA.diamante,
  };
}

// ===== Pre-cómputo determinista de keyframes SVG para Diamante (Movimiento B) =====

interface ParsedSegment {
  cmd: string;
  pts: Array<[number, number]>;
}

function parseSvgPath(d: string): ParsedSegment[] {
  const tokens = d.match(/[MCLZ]|-?\d*\.?\d+/g) ?? [];
  const parsed: ParsedSegment[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    if (cmd === "Z") {
      parsed.push({ cmd: "Z", pts: [] });
      continue;
    }
    const count = cmd === "C" ? 3 : 1;
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < count; k++) {
      pts.push([parseFloat(tokens[i++]!), parseFloat(tokens[i++]!)]);
    }
    parsed.push({ cmd, pts });
  }
  return parsed;
}

interface FlameMotionParam {
  amp: number;
  speed: number;
  phaseDeg: number;
  lag: number;
}

function bendMainFlame(
  parsed: ParsedSegment[],
  theta: number,
  p: FlameMotionParam,
  coreBoost = 1,
): string {
  return parsed
    .map((seg) => {
      if (seg.cmd === "Z") return "Z";
      const coords = seg.pts
        .map(([x, y]) => {
          const h = Math.max(0, Math.min(1, (21.5 - y) / 19.0));
          const dx =
            1.65 *
            p.amp *
            coreBoost *
            Math.pow(h, 1.3) *
            Math.sin(theta - h * (1.8 + 1.4 * p.lag));
          const dy = -0.65 * p.amp * coreBoost * h * Math.cos(theta - h * 0.9);
          return `${(x + dx).toFixed(2)} ${(y + dy).toFixed(2)}`;
        })
        .join(" ");
      return `${seg.cmd}${coords}`;
    })
    .join("");
}

function bendLateralTongue(
  parsed: ParsedSegment[],
  theta: number,
  p: FlameMotionParam,
  isLeft: boolean,
): string {
  const dir = isLeft ? -1 : 1;
  return parsed
    .map((seg) => {
      if (seg.cmd === "Z") return "Z";
      const coords = seg.pts
        .map(([x, y]) => {
          const outward = isLeft
            ? Math.max(0, Math.min(1, (8.8 - x) / 6.0))
            : Math.max(0, Math.min(1, (x - 15.2) / 6.0));
          const tipUp = Math.max(0, Math.min(1, (20.9 - y) / 11.8));
          const weight = outward * (0.35 + 0.65 * tipUp);
          const wave = Math.sin(theta - tipUp * (1.6 + 1.3 * p.lag));
          const stretch = Math.cos(theta - tipUp * 0.8);
          const dx = dir * 1.45 * p.amp * weight * wave;
          const dy = -1.25 * p.amp * weight * (0.4 + 0.6 * stretch);
          return `${(x + dx).toFixed(2)} ${(y + dy).toFixed(2)}`;
        })
        .join(" ");
      return `${seg.cmd}${coords}`;
    })
    .join("");
}

function buildKeyframes(
  fn: (parsed: ParsedSegment[], theta: number, p: FlameMotionParam, extra: any) => string,
  parsed: ParsedSegment[],
  p: FlameMotionParam,
  extra: number | boolean,
): string {
  const frames: string[] = [];
  const N = 8;
  const phaseRad = (p.phaseDeg * Math.PI) / 180;
  for (let i = 0; i < N; i++) {
    frames.push(fn(parsed, phaseRad + (i / N) * Math.PI * 2, p, extra));
  }
  frames.push(frames[0]!);
  return frames.join(";");
}

const PARSED_OUTER = parseSvgPath(SVG_PATHS_FLAMA.OUTER);
const PARSED_CORE = parseSvgPath(SVG_PATHS_FLAMA.CORE);
const PARSED_TL = parseSvgPath(SVG_PATHS_FLAMA.D2_TONGUE_L);
const PARSED_TR = parseSvgPath(SVG_PATHS_FLAMA.D2_TONGUE_R);

export const DIAMOND_KEYFRAMES = {
  outer: buildKeyframes(bendMainFlame, PARSED_OUTER, MOVIMIENTO_DIAMANTE_B.principal, 1.0),
  core: buildKeyframes(bendMainFlame, PARSED_CORE, MOVIMIENTO_DIAMANTE_B.principal, 1.14),
  tongueL: buildKeyframes(bendLateralTongue, PARSED_TL, MOVIMIENTO_DIAMANTE_B.izquierda, true),
  tongueR: buildKeyframes(bendLateralTongue, PARSED_TR, MOVIMIENTO_DIAMANTE_B.derecha, false),
  durMain: `${(1.15 / MOVIMIENTO_DIAMANTE_B.principal.speed).toFixed(2)}s`,
  durLeft: `${(1.15 / MOVIMIENTO_DIAMANTE_B.izquierda.speed).toFixed(2)}s`,
  durRight: `${(1.15 / MOVIMIENTO_DIAMANTE_B.derecha.speed).toFixed(2)}s`,
} as const;

export interface DiamondSparkPreset {
  cx: number;
  cy: number;
  r: number;
  dx: number;
  dy: number;
  kinkX: number;
  kinkY: number;
  baseDur: number;
  delayFactor: number;
  bright: boolean;
}

/** 12 chispas pre-horneadas con duraciones primas para ráfagas orgánicas sin JS por frame. */
export const DIAMOND_SPARK_PRESETS: readonly DiamondSparkPreset[] = [
  { cx: 11.8, cy: 4.5, r: 1.05, dx: -1.8, dy: -6.2, kinkX: -0.9, kinkY: -3.4, baseDur: 1.13, delayFactor: 0.11, bright: true },
  { cx: 9.2, cy: 6.8, r: 0.85, dx: -3.2, dy: -5.4, kinkX: -2.1, kinkY: -2.9, baseDur: 1.37, delayFactor: 0.43, bright: false },
  { cx: 14.6, cy: 6.4, r: 0.9, dx: 2.9, dy: -5.8, kinkX: 1.7, kinkY: -3.1, baseDur: 1.73, delayFactor: 0.27, bright: true },
  { cx: 10.6, cy: 5.2, r: 0.75, dx: 1.2, dy: -6.5, kinkX: 0.4, kinkY: -3.5, baseDur: 1.97, delayFactor: 0.67, bright: false },
  { cx: 13.4, cy: 5.5, r: 0.95, dx: -1.1, dy: -6.0, kinkX: 0.6, kinkY: -3.2, baseDur: 2.11, delayFactor: 0.89, bright: true },
  { cx: 8.1, cy: 8.2, r: 0.8, dx: -3.6, dy: -4.9, kinkX: -2.4, kinkY: -2.5, baseDur: 2.29, delayFactor: 0.19, bright: false },
  { cx: 15.8, cy: 8.0, r: 0.85, dx: 3.4, dy: -5.1, kinkX: 2.2, kinkY: -2.6, baseDur: 2.51, delayFactor: 0.53, bright: true },
  { cx: 12.1, cy: 3.9, r: 1.0, dx: 0.8, dy: -6.8, kinkX: -0.5, kinkY: -3.8, baseDur: 2.71, delayFactor: 0.77, bright: true },
  { cx: 9.8, cy: 7.4, r: 0.7, dx: -2.5, dy: -5.6, kinkX: -1.4, kinkY: -3.0, baseDur: 2.93, delayFactor: 0.31, bright: false },
  { cx: 14.1, cy: 7.2, r: 0.8, dx: 2.3, dy: -5.5, kinkX: 1.5, kinkY: -2.8, baseDur: 3.07, delayFactor: 0.61, bright: false },
  { cx: 11.0, cy: 6.1, r: 0.9, dx: -2.0, dy: -6.1, kinkX: -0.8, kinkY: -3.3, baseDur: 3.31, delayFactor: 0.83, bright: true },
  { cx: 12.9, cy: 6.0, r: 0.75, dx: 2.1, dy: -6.3, kinkX: 1.1, kinkY: -3.4, baseDur: 3.53, delayFactor: 0.37, bright: false },
];
