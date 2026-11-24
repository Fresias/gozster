import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del enlace del email de recuperación de contraseña (flujo PKCE).
 * Canjea el `code` por una sesión y deriva a /login?recovery=1 para elegir la clave nueva.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/login?recovery=1`);
  }
  return NextResponse.redirect(`${origin}/login?recoveryError=1`);
}
