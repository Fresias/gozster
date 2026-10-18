import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// URL y clave anon publicable: compartidas por el cliente de navegador, el de servidor y el middleware.
// Los defaults evitan caídas durante SSG / prerendering en CI si aún no se configuraron en el dashboard.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cutvhrxgrwwfntetdsdo.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_BdrxwuFPjcloqpXvWYAvHw_jw8TJAEH";

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
