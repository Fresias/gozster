/**
 * Fondo: malla asimétrica (D-54). Port exacto de `meshSvg`, `bgMesh`, `bgNoise` y
 * `bgValue` de docs/athlete-v7/referencia/athlete-v7.html (clave 'malla').
 */

export const FONDO_SEMILLA_KEY = "gozster-fondo-semilla";
export const FONDO_INTENSIDAD_SUTIL = 0.42;

/** [x %, y %, radio x %, radio y %, rotación °, índice de tono] */
const ANCLAS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [86, 4, 70, 18, -16, 0],
  [6, 24, 52, 16, 24, 1],
  [62, 47, 60, 12, -30, 2],
  [14, 74, 64, 15, 12, 3],
  [96, 90, 46, 14, 26, 4],
];

const TONOS = {
  l: ["205,206,211", "226,226,230", "255,255,255", "190,191,197", "236,236,239"],
  d: ["58,58,64", "30,30,34", "76,76,84", "20,20,23", "44,44,49"],
} as const;

/** mulberry32 */
export function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function semillaAleatoria(): number {
  return 1 + Math.floor(Math.random() * 9999);
}

export function meshSvg(dark: boolean, k: number, seed: number, scale = 1): string {
  const r = rng(seed * 977);
  const W = 390;
  const H = 844;
  const t = TONOS[dark ? "d" : "l"];
  const j = (a: number) => (r() * 2 - 1) * a;
  const els = ANCLAS.map(([x, y, rx, ry, rot, ti]) => {
    const cx = (((x + j(10)) / 100) * W).toFixed(1);
    const cy = (((y + j(7)) / 100) * H).toFixed(1);
    const ex = (((rx * (1 + j(0.18)) * scale) / 100) * W).toFixed(1);
    const ey = (((ry * (1 + j(0.18)) * scale) / 100) * H).toFixed(1);
    const ro = (rot + j(15)).toFixed(1);
    return `<ellipse cx='${cx}' cy='${cy}' rx='${ex}' ry='${ey}' transform='rotate(${ro} ${cx} ${cy})' fill='rgb(${t[ti]})'/>`;
  }).join("");
  const op = Math.min(1, 0.4 + k).toFixed(2);
  const blur = Math.round(46 * scale);
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'><defs><filter id='b' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='${blur}'/></filter></defs><g filter='url(#b)' opacity='${op}'>${els}</g></svg>`;
}

function bgMesh(dark: boolean, k: number, seed: number, scale: number): string {
  const svg = meshSvg(dark, k, seed, scale);
  return `url("data:image/svg+xml,${svg
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")}") center/100% 100% no-repeat`;
}

function bgNoise(dark: boolean, k: number, seed: number, alpha: number): string {
  const v = dark ? "1" : "0";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.90' numOctaves='2' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} ${(alpha * k).toFixed(3)} 0 0 0 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml,${svg
    .replace(/"/g, "'")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\s+/g, " ")}")`;
}

/** Cadena `background` completa: desvanecido, grano, malla, color base. */
export function fondoValue(
  dark: boolean,
  seed: number,
  base: string,
  k: number = FONDO_INTENSIDAD_SUTIL,
  scale = 1,
): string {
  const fade = `linear-gradient(180deg, ${base}00 0%, ${base}00 55%, ${base}${dark ? "80" : "99"} 100%)`;
  return `${fade}, ${bgNoise(dark, 1, seed, dark ? 0.1 : 0.05)}, ${bgMesh(dark, k, seed, scale)}, ${base}`;
}

export const FONDO_BASE = { claro: "#FAFAFA", oscuro: "#09090B" } as const;

/** Semilla de la visita: al azar la primera vez, estable en sessionStorage. `?seed=N` la fuerza. */
export function leerSemilla(): number {
  try {
    const q = new URLSearchParams(window.location.search).get("seed");
    const forzada = q ? Number(q) : NaN;
    if (Number.isInteger(forzada) && forzada >= 1 && forzada <= 9999) {
      window.sessionStorage.setItem(FONDO_SEMILLA_KEY, String(forzada));
      return forzada;
    }
    const guardada = Number(window.sessionStorage.getItem(FONDO_SEMILLA_KEY));
    if (Number.isInteger(guardada) && guardada >= 1 && guardada <= 9999) return guardada;
    const nueva = semillaAleatoria();
    window.sessionStorage.setItem(FONDO_SEMILLA_KEY, String(nueva));
    return nueva;
  } catch {
    return semillaAleatoria();
  }
}
