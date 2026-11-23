import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditoriaCambio, Database, Json } from "@/types/database.types";

/**
 * Lectura de `public.auditoria_cambios` (GOZS-723 / PL-11).
 * La tabla la escriben solo triggers/RPC; acá se lee en modo solo lectura y
 * acotado. La política RLS `auditoria_cambios_select_staff` decide qué filas
 * ve cada miembro del staff: este servicio no filtra por rol.
 */

export const LIMITE_AUDITORIA = 100;

export type RegistroAuditoria = Pick<
  AuditoriaCambio,
  "id" | "entidad" | "entidad_id" | "accion" | "motivo" | "valores_anteriores" | "valores_nuevos" | "created_at"
> & { autor_nombre: string | null };

export interface FiltroAuditoria {
  entidad?: string;
  accion?: string;
}

export interface CampoCambiado {
  campo: string;
  antes: string;
  despues: string;
}

const COLUMNAS =
  "id, entidad, entidad_id, accion, motivo, valores_anteriores, valores_nuevos, created_at, autor:perfiles!auditoria_cambios_autorizado_por_fkey(nombre_completo)";

export async function listarAuditoriaCambios(
  client: SupabaseClient<Database>,
  filtro: FiltroAuditoria = {},
  limite: number = LIMITE_AUDITORIA,
): Promise<RegistroAuditoria[]> {
  let query = client.from("auditoria_cambios").select(COLUMNAS);
  if (filtro.entidad) query = query.eq("entidad", filtro.entidad);
  if (filtro.accion) query = query.eq("accion", filtro.accion);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limite);
  if (error) throw new Error("No pudimos cargar el historial de cambios.");

  return ((data ?? []) as unknown as Array<Omit<RegistroAuditoria, "autor_nombre"> & { autor: unknown }>).map(
    ({ autor, ...fila }) => {
      const perfil = (Array.isArray(autor) ? autor[0] : autor) as { nombre_completo?: string | null } | null;
      return { ...fila, autor_nombre: perfil?.nombre_completo ?? null };
    },
  );
}

export const ENTIDADES_AUDITADAS: Record<string, string> = {
  contrataciones: "Contratación",
  conversaciones: "Conversación",
  planes_entrenamiento: "Plan de entrenamiento",
  dias_rutina: "Día de rutina",
  ejercicios_en_rutina: "Ejercicio en rutina",
};

export const ACCIONES_AUDITADAS: Record<string, string> = {
  INSERT: "Alta",
  UPDATE: "Modificación",
  DELETE: "Baja",
  EXTENSION_EXCEPCIONAL: "Extensión excepcional",
  TRANSFERENCIA_RESPONSABLE: "Transferencia de responsable",
};

/** Normaliza query params: solo acepta entidades/acciones conocidas; el resto se ignora. */
export function normalizarFiltroAuditoria(params: { entidad?: string; accion?: string } = {}): FiltroAuditoria {
  return {
    entidad: params.entidad && Object.hasOwn(ENTIDADES_AUDITADAS, params.entidad) ? params.entidad : undefined,
    accion: params.accion && Object.hasOwn(ACCIONES_AUDITADAS, params.accion) ? params.accion : undefined,
  };
}

const MAX_CAMPOS = 6;
const MAX_LARGO_VALOR = 60;

function comoTexto(valor: Json | undefined): string {
  if (valor === undefined || valor === null) return "—";
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return texto.length > MAX_LARGO_VALOR ? `${texto.slice(0, MAX_LARGO_VALOR - 1)}…` : texto;
}

function comoObjeto(valor: Json | null): Record<string, Json | undefined> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

/** Resumen acotado de los campos que cambiaron entre `valores_anteriores` y `valores_nuevos`. */
export function resumirCambio(anteriores: Json | null, nuevos: Json | null): CampoCambiado[] {
  const antes = comoObjeto(anteriores);
  const despues = comoObjeto(nuevos);
  const campos = Array.from(new Set([...Object.keys(antes), ...Object.keys(despues)]));
  return campos
    .filter((campo) => JSON.stringify(antes[campo] ?? null) !== JSON.stringify(despues[campo] ?? null))
    .slice(0, MAX_CAMPOS)
    .map((campo) => ({ campo, antes: comoTexto(antes[campo]), despues: comoTexto(despues[campo]) }));
}
