export type ZonaArticular =
  | "HOMBRO"
  | "RODILLA"
  | "LUMBAR"
  | "CODO"
  | "CUELLO"
  | "CADERA"
  | "TOBILLO"
  | "OTRO";

export type NivelMolestia = "leve" | "moderada" | "alta" | "alarma";

export type MomentoMolestia = "CALENTAMIENTO" | "EN_SERIE" | "POST_EJERCICIO";

export interface MolestiaSesion {
  id: string;
  sesionId: string;
  ejercicioEnRutinaId: string;
  ejercicioId: string;
  numeroSerie: number | null;
  zona: ZonaArticular;
  eva: number;
  sintomas: string[];
  momento: MomentoMolestia | null;
  notas: string | null;
  nivel: NivelMolestia;
  reportadaAt: string;
  envio: "pendiente" | "enviada" | "error";
}

export const TREN_SUPERIOR = ["Pecho", "Espalda", "Hombros", "Brazos"] as const;
export const TREN_INFERIOR = ["Piernas"] as const;

export const GRUPOS_POR_ZONA: Record<ZonaArticular, readonly string[]> = {
  HOMBRO: TREN_SUPERIOR,
  CODO: TREN_SUPERIOR,
  CUELLO: TREN_SUPERIOR,
  RODILLA: TREN_INFERIOR,
  CADERA: TREN_INFERIOR,
  TOBILLO: TREN_INFERIOR,
  LUMBAR: [...TREN_SUPERIOR, ...TREN_INFERIOR, "Core"],
  OTRO: [],
};

function normalizarGrupo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function masReciente(a: MolestiaSesion, b: MolestiaSesion): MolestiaSesion {
  const ta = Date.parse(a.reportadaAt);
  const tb = Date.parse(b.reportadaAt);
  if (Number.isFinite(ta) && Number.isFinite(tb)) {
    return tb >= ta ? b : a;
  }
  return b;
}

/**
 * Deriva el nivel de molestia desde EVA (1-10) y los síntomas de alarma.
 */
export function nivelMolestia(eva: number, sintomas: string[]): NivelMolestia {
  if (sintomas.length > 0 || eva >= 10) return "alarma";
  if (eva >= 7) return "alta";
  if (eva >= 4) return "moderada";
  return "leve";
}

export type AvisoMolestia =
  | { tipo: "propio"; molestia: MolestiaSesion }
  | { tipo: "heredado"; origen: MolestiaSesion }
  | null;

/**
 * Calcula el aviso de molestia aplicable a un ejercicio dentro de la sesión actual.
 * Gana la molestia propia; si no, hereda la más reciente de otro ejercicio cuya zona
 * incluya alguno de sus `musculos_principales` canónicos.
 */
export function avisoMolestiaPara(
  ejercicio: { id: string; musculos_principales?: string[] | null },
  molestias: MolestiaSesion[],
): AvisoMolestia {
  if (!molestias || molestias.length === 0) return null;

  let propia: MolestiaSesion | null = null;
  for (const m of molestias) {
    if (m.ejercicioEnRutinaId === ejercicio.id) {
      propia = propia ? masReciente(propia, m) : m;
    }
  }
  if (propia) {
    return { tipo: "propio", molestia: propia };
  }

  const musculosNorm = new Set(
    (ejercicio.musculos_principales ?? [])
      .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      .map(normalizarGrupo),
  );
  if (musculosNorm.size === 0) return null;

  let heredada: MolestiaSesion | null = null;
  for (const m of molestias) {
    if (m.ejercicioEnRutinaId === ejercicio.id) continue;
    const gruposZona = GRUPOS_POR_ZONA[m.zona];
    if (!gruposZona || gruposZona.length === 0) continue;

    const coincide = gruposZona.some((g) => musculosNorm.has(normalizarGrupo(g)));
    if (coincide) {
      heredada = heredada ? masReciente(heredada, m) : m;
    }
  }

  return heredada ? { tipo: "heredado", origen: heredada } : null;
}

/**
 * Devuelve true si el ejercicio tiene una molestia propia de nivel alta o alarma.
 * Las molestias heredadas nunca bloquean el registro.
 */
export function ejercicioBloqueado(
  ejercicioEnRutinaId: string,
  molestias: MolestiaSesion[],
): boolean {
  let propia: MolestiaSesion | null = null;
  for (const m of molestias) {
    if (m.ejercicioEnRutinaId === ejercicioEnRutinaId) {
      propia = propia ? masReciente(propia, m) : m;
    }
  }
  if (!propia) return false;
  return propia.nivel === "alta" || propia.nivel === "alarma";
}
