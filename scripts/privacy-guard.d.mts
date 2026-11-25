export const TOKENS_BLOQUEADOS: Set<string>;
export const UUIDS_BLOQUEADOS: Set<string>;
export function escanearTexto(texto: string): string[];
export function escanearDirectorio(dir: string): { file: string; motivos: string[] }[];
