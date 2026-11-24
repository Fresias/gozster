import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/browser";
import type { Database } from "@/types/database.types";

export interface StaffCoachOption {
  id: string;
  nombre_completo: string;
  rol: "ENTRENADOR" | "ADMIN";
}

const STAFF_ROLES = new Set(["ENTRENADOR", "ADMIN"]);

/**
 * Lista entrenadores y administradores del staff para selectores de Coach Studio
 * (entrenador de apoyo y transferencia de conversación).
 * Valida sesión + rol ENTRENADOR/ADMIN en servidor y expone únicamente
 * `id`, `nombre_completo` y `rol` (sin emails, teléfonos ni PII).
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfilPropio, error: perfilError } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (perfilError || !perfilPropio?.rol || !STAFF_ROLES.has(perfilPropio.rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Cuando el entorno expone SUPABASE_SERVICE_ROLE_KEY en servidor, se lee la nómina
  // mínima de staff sin relajar RLS de perfiles para un ENTRENADOR no-ADMIN.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const queryClient = serviceRoleKey
    ? createSupabaseAdminClient<Database>(SUPABASE_URL, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : supabase;

  const { data, error } = await queryClient
    .from("perfiles")
    .select("id, nombre_completo, rol")
    .in("rol", ["ENTRENADOR", "ADMIN"])
    .order("nombre_completo", { ascending: true });

  if (error || !Array.isArray(data)) {
    return NextResponse.json(
      { error: "No se pudieron cargar los entrenadores" },
      { status: 500 },
    );
  }

  const entrenadores: StaffCoachOption[] = data
    .filter((row) => Boolean(row && typeof row.id === "string" && STAFF_ROLES.has(row.rol)))
    .map((row) => ({
      id: row.id,
      nombre_completo: row.nombre_completo || "Entrenador",
      rol: row.rol === "ADMIN" ? "ADMIN" : "ENTRENADOR",
    }));

  return NextResponse.json(
    { entrenadores },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
