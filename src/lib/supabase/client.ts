import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cutvhrxgrwwfntetdsdo.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
  },
});
