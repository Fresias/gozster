import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// URL y clave anon publicable: compartidas por el cliente de navegador, el de servidor y el middleware.
// No se permite fallback por defecto para evitar conectar producción a otro entorno por error.
const envSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const envSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!envSupabaseUrl) {
  throw new Error(
    "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL. Configurala antes de compilar o ejecutar la aplicación.",
  );
}

if (!envSupabaseAnonKey) {
  throw new Error(
    "Falta la variable de entorno NEXT_PUBLIC_SUPABASE_ANON_KEY. Configurala antes de compilar o ejecutar la aplicación.",
  );
}

export const SUPABASE_URL: string = envSupabaseUrl;
export const SUPABASE_ANON_KEY: string = envSupabaseAnonKey;

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Cliente de Supabase para Componentes Cliente ("use client").
 * La sesión se persiste en cookies (no en localStorage) para que el middleware
 * y los Server Components puedan leer el mismo JWT y aplicar RLS en SSR.
 * Se memoiza para no instanciar múltiples GoTrueClient en el navegador.
 */
export function createClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}
