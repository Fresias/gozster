export interface Indicaciones {
  libre: string[];
  pasos: string[];
  clave: string[];
  errores: string[];
  tempo: string | null;
  respiracion: string | null;
}

type SeccionKey = "pasos" | "clave" | "errores";
type KvKey = "tempo" | "respiracion";

const SECCIONES: ReadonlyArray<readonly [SeccionKey, RegExp]> = [
  ["pasos", /^pasos\s*:?\s*$/i],
  ["clave", /^puntos clave\s*:?\s*$/i],
  ["errores", /^errores comunes\s*:?\s*$/i],
];

const CLAVES_LINEA: ReadonlyArray<readonly [KvKey, RegExp]> = [
  ["tempo", /^tempo\s*:\s*(.+)$/i],
  ["respiracion", /^respiraci[oó]n\s*:\s*(.+)$/i],
];

const MARCADOR_ITEM = /^(\d+[.)]|[-•*])\s+/;

/**
 * Parsea texto plano de indicaciones del coach en secciones estructuradas.
 * Implementa el mismo algoritmo que `parseInd` de la referencia Athlete v7:
 * el texto previo al primer encabezado (o sin encabezados) queda intacto en `libre`.
 */
export function parseIndicaciones(texto: string | null | undefined): Indicaciones {
  const resultado: Indicaciones = {
    libre: [],
    pasos: [],
    clave: [],
    errores: [],
    tempo: null,
    respiracion: null,
  };

  if (!texto) {
    return resultado;
  }

  let seccionActual: SeccionKey | null = null;

  const lineas = String(texto)
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean);

  for (const linea of lineas) {
    const encabezado = SECCIONES.find(([, re]) => re.test(linea));
    if (encabezado) {
      seccionActual = encabezado[0];
      continue;
    }

    let matchedKv = false;
    for (const [clave, re] of CLAVES_LINEA) {
      const match = linea.match(re);
      if (match) {
        const valor = match[1]?.trim();
        if (valor) {
          resultado[clave] = valor;
        }
        seccionActual = null;
        matchedKv = true;
        break;
      }
    }
    if (matchedKv) {
      continue;
    }

    if (seccionActual) {
      resultado[seccionActual].push(linea.replace(MARCADOR_ITEM, ""));
    } else {
      resultado.libre.push(linea);
    }
  }

  return resultado;
}

/**
 * Indica si un objeto `Indicaciones` tiene al menos una sección o campo con datos.
 */
export function tieneIndicaciones(i: Indicaciones): boolean {
  return (
    i.libre.length > 0 ||
    i.pasos.length > 0 ||
    i.clave.length > 0 ||
    i.errores.length > 0 ||
    Boolean(i.tempo) ||
    Boolean(i.respiracion)
  );
}
