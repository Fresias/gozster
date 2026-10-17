import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const DEFAULT_SUPABASE_URL = "https://cutvhrxgrwwfntetdsdo.supabase.co";
// Clave anon publicable por defecto: previene caídas durante SSG / prerendering en Vercel si aún no se configuró en el dashboard de CI
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_BdrxwuFPjcloqpXvWYAvHw_jw8TJAEH";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

// Asegurar compatibilidad en Node.js < 22 o entornos sin WebSocket nativo global
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

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
    },
  }
);

