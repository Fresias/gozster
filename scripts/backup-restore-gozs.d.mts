// Tipos de scripts/backup-restore-gozs.mjs (allowJs está desactivado).

export type Fila = { id: string; [columna: string]: unknown };

export interface TablaRespaldo {
  nombre: string;
  fks: Record<string, string>;
  opcional?: boolean;
}

export interface TablaSnapshot {
  total: number;
  sha256: string;
  filas: Fila[];
}

export interface Snapshot {
  formato: "gozs-backup";
  version: 1;
  generado_at: string;
  tablas: Record<string, TablaSnapshot>;
  omitidas: string[];
}

export interface FuenteRespaldo {
  leerTabla(nombre: string): Promise<Fila[] | null>;
}

export interface DestinoRespaldo {
  restaurarFilas(nombre: string, filas: Fila[]): Promise<number>;
}

export interface Verificacion {
  ok: boolean;
  errores: string[];
}

export const FORMATO_SNAPSHOT: "gozs-backup";
export const VERSION_SNAPSHOT: 1;
export const TABLAS: TablaRespaldo[];
export function canonico(valor: unknown): string;
export function hashFilas(filas: Fila[]): string;
export function exportarSnapshot(fuente: FuenteRespaldo): Promise<Snapshot>;
export function verificarSnapshot(snapshot: Snapshot): Verificacion;
export function ordenarAutoReferencias(filas: Fila[], columnas: string[]): Fila[];
export function restaurarSnapshot(
  destino: DestinoRespaldo,
  snapshot: Snapshot,
  opciones?: { tamanoLote?: number }
): Promise<Record<string, number>>;
export function verificarRestauracion(fuente: FuenteRespaldo, snapshot: Snapshot): Promise<Verificacion>;
export function crearAdaptadorSupabase(
  supabase: unknown,
  opciones?: { tamanoPagina?: number }
): FuenteRespaldo & DestinoRespaldo;
