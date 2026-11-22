export const DEFAULT_TYPES_PATH: string;
export const DEFAULT_SCHEMA: string;

export interface DiferenciaLineaTipos {
  linea: number;
  versionado: string;
  generado: string;
}

export interface ResultadoComparacionTipos {
  ok: boolean;
  diferencias: DiferenciaLineaTipos[];
  totalLineasVersionado: number;
  totalLineasGenerado: number;
}

export function normalizarContenidoTipos(contenido: string): string;
export function compararTiposGenerados(params: {
  versionado: string;
  generado: string;
}): ResultadoComparacionTipos;
export function formatearReporteErrorTipos(
  resultado: ResultadoComparacionTipos,
  typesPath?: string
): string;
export function ejecutarCheckTipos(
  argv?: string[],
  deps?: { obtenerSalida?: (opts: Record<string, string>) => string }
): { resultado: ResultadoComparacionTipos; opts: Record<string, string> };
