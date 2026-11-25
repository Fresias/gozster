/**
 * Fondo: Deformed Grid Mesh II. Rejilla vectorial deformada con ruido 2D (`fbm2D`),
 * determinista por semilla, JS puro sin dependencias. SVG inline con máscara de desvanecido.
 */

export const FONDO_SEMILLA_KEY = "gozster-fondo-semilla";

export const DEFORMED_GRID_CONFIG = {
  cols: 30,
  rows: 34,
  warp: 70,
  freq: 0.6,
  fill: 1.0,
  angle: 195,
  strokeWidth: 1,
  opacity: 0.14,
  curves: true,
} as const;

export const FONDO_BASE = { claro: "#FAFAFA", oscuro: "#09090B" } as const;
const TRAZO = { claro: "#09090B", oscuro: "#FAFAFA" } as const;
const W = 390;
const H = 820;

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

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Hash entero 2D -> [0,1), determinista por semilla. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Ruido fractal de 2 octavas, rango [0,1]. */
export function fbm2D(x: number, y: number, seed: number): number {
  return (valueNoise(x, y, seed) + 0.5 * valueNoise(x * 2, y * 2, seed + 101)) / 1.5;
}

type Pt = readonly [number, number];

/** Curva cuadrática suave (Q por puntos medios) o polilínea si `curves` es false. */
function trazo(pts: Pt[], curves: boolean): string {
  const f = (n: number) => n.toFixed(1);
  if (!curves) return pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("");
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
  }
  const u = pts[pts.length - 1];
  return `${d}L${f(u[0])} ${f(u[1])}`;
}

/** SVG completo (viewBox 390x820) de la malla. `id` debe ser único por capa en el DOM. */
export function deformedGridSvg(
  dark: boolean,
  seed: number,
  id: string,
  cfg: typeof DEFORMED_GRID_CONFIG = DEFORMED_GRID_CONFIG,
): string {
  const { cols, rows, warp, freq, fill, angle, strokeWidth, opacity, curves } = cfg;
  const grid: Pt[][] = [];
  for (let j = 0; j <= rows; j++) {
    const fila: Pt[] = [];
    for (let i = 0; i <= cols; i++) {
      const nx = i * freq * 0.5;
      const ny = j * freq * 0.5;
      const dx = (fbm2D(nx, ny, seed) - 0.5) * 2 * warp;
      const dy = (fbm2D(nx + 57.3, ny + 91.7, seed + 7) - 0.5) * 2 * warp;
      fila.push([(i / cols) * W + dx, (j / rows) * H + dy]);
    }
    grid.push(fila);
  }
  const horizontales = grid.map((fila) => trazo(fila, curves));
  const verticales: string[] = [];
  for (let i = 0; i <= cols; i++) verticales.push(trazo(grid.map((fila) => fila[i]), curves));
  const paths = [...horizontales, ...verticales]
    .map((d) => `<path d="${d}"/>`)
    .join("");

  // Ángulo CSS: 0° = hacia arriba, sentido horario. Gradiente centrado en el bbox.
  const rad = (angle * Math.PI) / 180;
  const vx = (Math.sin(rad) * fill) / 2;
  const vy = (-Math.cos(rad) * fill) / 2;
  const g = (n: number) => (0.5 + n).toFixed(4);
  const x1 = g(-vx);
  const y1 = g(-vy);
  const x2 = g(vx);
  const y2 = g(vy);
  const trazoColor = dark ? TRAZO.oscuro : TRAZO.claro;
  const base = dark ? FONDO_BASE.oscuro : FONDO_BASE.claro;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">` +
    `<defs><linearGradient id="${id}-g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${id}-g)"/></mask></defs>` +
    `<rect width="${W}" height="${H}" fill="${base}"/>` +
    `<g mask="url(#${id}-m)" fill="none" stroke="${trazoColor}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}" stroke-linecap="round">${paths}</g></svg>`
  );
}

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
