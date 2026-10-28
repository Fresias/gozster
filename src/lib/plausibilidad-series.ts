// Guardas de plausibilidad en registro de series (peso/reps/RPE) en app móvil (GOZS-200).
// Previene que typos (200 en vez de 20, 1e3, comas, etc.) contaminen volumen, 1RM, récords y alertas.

export interface EntradaSerieRaw {
  peso: string | number;
  reps: string | number;
  rpe?: string | number | null;
}

export interface EntradaNormalizada {
  valido: boolean;
  peso?: number;
  reps?: number;
  rpe?: number | null;
  error?: string;
}

export type ResultadoPlausibilidad =
  | { estado: "valido"; peso: number; reps: number; rpe: number | null }
  | { estado: "bloqueado"; error: string }
  | {
      estado: "requiere_confirmacion";
      peso: number;
      reps: number;
      rpe: number | null;
      ultimoPeso: number;
      mensaje: string;
    };

export interface EvaluacionPlausibilidadParams extends EntradaSerieRaw {
  historialPesos?: number[];
  ultimoPeso?: number | null;
  musculos?: string[] | string | null;
  nombreEjercicio?: string;
}

// Normaliza y valida formato de peso, reps y RPE (rechaza notación científica, negativos, etc.)
export function normalizarEntradaSerie(
  peso: string | number,
  reps: string | number,
  rpe?: string | number | null,
): EntradaNormalizada {
  const parseNum = (val: string | number, permitirDecimal: boolean): number | null => {
    if (typeof val === "number") return isNaN(val) || !Number.isFinite(val) ? null : val;
    if (typeof val !== "string") return null;
    const s = val.trim();
    if (!s || /[eE]/.test(s)) return null;
    const norm = s.replace(",", ".");
    const re = permitirDecimal ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/;
    if (!re.test(norm)) return null;
    const n = Number(norm);
    return Number.isFinite(n) ? n : null;
  };

  const p = parseNum(peso, true);
  if (p === null || p < 0) return { valido: false, error: "Peso inválido (no se permite negativo, vacío ni notación científica)" };

  const r = parseNum(reps, false);
  if (r === null || r < 0 || r > 100) return { valido: false, error: "Las repeticiones deben ser un número entero entre 0 y 100" };

  let rp: number | null = null;
  if (rpe !== undefined && rpe !== null && String(rpe).trim() !== "") {
    rp = parseNum(rpe, true);
    if (rp === null || rp < 1 || rp > 10) return { valido: false, error: "El RPE debe estar entre 1 y 10" };
  }

  return { valido: true, peso: p, reps: r, rpe: rp };
}

export function calcularMediana(valores: number[]): number {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 !== 0 ? ordenados[mid]! : (ordenados[mid - 1]! + ordenados[mid]!) / 2;
}

export function esGrupoMuscularPequeno(musculos?: string[] | string | null, nombre?: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const texto = norm(`${Array.isArray(musculos) ? musculos.join(" ") : musculos ?? ""} ${nombre ?? ""}`);
  return ["bicep", "hombro", "deltoid", "antebrazo"].some((m) => texto.includes(m));
}

// Función pura principal (< 40 líneas): evalúa topes duros, historial y atipicidad.
export function evaluarPlausibilidadSerie(params: EvaluacionPlausibilidadParams): ResultadoPlausibilidad {
  const norm = normalizarEntradaSerie(params.peso, params.reps, params.rpe);
  if (!norm.valido) return { estado: "bloqueado", error: norm.error! };
  const { peso: p, reps: r, rpe: rp } = norm as { peso: number; reps: number; rpe: number | null };

  if (p > 500) return { estado: "bloqueado", error: `El peso (${p} kg) supera el tope máximo de 500 kg.` };

  const historial = (params.historialPesos ?? []).filter((w) => w >= 0);
  if (historial.length === 0) {
    if (esGrupoMuscularPequeno(params.musculos, params.nombreEjercicio) && p > 60) {
      return { estado: "bloqueado", error: `El peso (${p} kg) supera el tope de 60 kg para bíceps/hombro/antebrazo.` };
    }
    return { estado: "valido", peso: p, reps: r, rpe: rp };
  }

  const med = calcularMediana(historial.slice(-10));
  const ult = params.ultimoPeso ?? historial[historial.length - 1] ?? med;
  if (med > 0) {
    const ratio = p / med;
    const esTypo = ratio > 2.5 || (p > 0 && Math.abs(ratio - 0.1) <= 0.03) || (ratio >= 8.5 && ratio <= 11.5);
    if (esTypo) {
      return {
        estado: "requiere_confirmacion",
        peso: p,
        reps: r,
        rpe: rp,
        ultimoPeso: ult,
        mensaje: `¿Seguro? Tu último fue ${ult} kg`,
      };
    }
  }

  return { estado: "valido", peso: p, reps: r, rpe: rp };
}
