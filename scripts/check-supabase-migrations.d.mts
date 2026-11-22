export const DEFAULT_MIGRATIONS_DIR: string;
export const X1_MIGRATION_VERSION: string;

export interface MigracionLocal {
  version: string;
  file: string;
}

export interface RegistroMigrationList {
  local: string;
  remote: string;
}

export interface ResultadoParidadMigraciones {
  ok: boolean;
  pendientes: MigracionLocal[];
  soloRemotas: string[];
  aplicadas: number;
  totalLocales: number;
}

export function listarVersionesLocales(migrationsDir?: string): MigracionLocal[];
export function parsearSalidaMigrationList(rawOutput: string): RegistroMigrationList[];
export function evaluarParidadMigraciones(params: {
  locales: MigracionLocal[];
  registrosRemotos: RegistroMigrationList[];
}): ResultadoParidadMigraciones;
export function formatearReporteError(resultado: ResultadoParidadMigraciones): string;
export function ejecutarCheckMigraciones(
  argv?: string[],
  deps?: { obtenerSalida?: (opts: Record<string, string>) => string }
): { resultado: ResultadoParidadMigraciones; locales: MigracionLocal[] };
