import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/browser";

const COACH_ROLES = ["ENTRENADOR", "ADMIN"];

/**
 * Middleware de sesión + RBAC.
 * 1. Refresca la sesión de Supabase Auth en cada request protegida (cookies sincronizadas).
 * 2. Protege Coach Studio (/studio) y la Athlete App (/athlete) según rol de `perfiles`.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() valida el JWT contra el servidor de Auth (no confía en la cookie sin verificar).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isStudio = pathname === "/studio" || pathname.startsWith("/studio/");
  const isAthlete = pathname === "/athlete" || pathname.startsWith("/athlete/");

  // Sin sesión: redirigir a login conservando el destino original.
  if (isStudio && !user) {
    return redirectToLogin(request, "/studio");
  }
  if (isAthlete && !user) {
    return redirectToLogin(request, "/athlete");
  }

  // Coach Studio exige rol ENTRENADOR o ADMIN; un ALUMNO se desvía a su app.
  if (isStudio && user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", user.id)
      .maybeSingle();
    const rol = perfil?.rol;

    if (rol === "ALUMNO") {
      const url = request.nextUrl.clone();
      url.pathname = "/athlete";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (!rol || !COACH_ROLES.includes(rol)) {
      return redirectToLogin(request, "/studio");
    }
  }

  return response;
}

function redirectToLogin(request: NextRequest, redirectTo: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("redirectTo", redirectTo);
  return NextResponse.redirect(url);
}

export const config = {
  // Solo las áreas protegidas; evita ejecutar en assets estáticos y rutas públicas.
  matcher: ["/studio/:path*", "/athlete/:path*"],
};
