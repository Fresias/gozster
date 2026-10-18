import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SUPABASE_URL, SUPABASE_ANON_KEY, createClient as createBrowser } from "@/lib/supabase/browser";

// Asegurar compatibilidad en Node.js < 22 o entornos sin WebSocket nativo global (SSR / tests)
if (typeof window === "undefined" && typeof globalThis !== "undefined" && !(globalThis as any).WebSocket) {
  (globalThis as any).WebSocket = class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 3;
    onopen: any = null;
    onclose: any = null;
    onerror: any = null;
    onmessage: any = null;
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  };
}

// Compatibilidad: todos los Componentes Cliente siguen importando `supabase` desde aquí.
// En el navegador usamos el cliente con sesión por cookies (SSR-ready, visible para middleware y
// Server Components). En Node/SSR/tests devolvemos un cliente plano anónimo para no romper el
// prerender ni los specs (no hay `document` donde persistir cookies).
export const supabase: SupabaseClient<Database> =
  typeof document !== "undefined"
    ? createBrowser()
    : createPlainClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
