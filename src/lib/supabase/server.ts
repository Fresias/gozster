import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/browser";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Lee la sesión desde las cookies de la request, de modo que PostgREST recibe el
 * JWT del usuario autenticado y aplica Row Level Security sobre sus propios datos.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Invocado desde un Server Component (cookies de solo lectura):
          // el refresco de sesión lo resuelve el middleware en cada request.
        }
      },
    },
  });
}
