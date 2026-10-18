// ============================================================================
// GOZS-35 / Issue #55 (Frontend): alta directa de alumno con tarjeta de
// contingencia (copia + WhatsApp) y forzado de cambio de clave en primer login.
// Entorno node (sin DOM): verificación estructural del código + unit del middleware.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { middleware } from "@/middleware";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-35: Alta de alumno directa (invite-student-modal.tsx)", () => {
  const content = read("../components/coach/invite-student-modal.tsx");

  it("invoca la Edge Function alta-alumno-directa (no el obsoleto invitar-alumno)", () => {
    expect(content).toContain('"alta-alumno-directa"');
    expect(content).not.toContain('"invitar-alumno"');
  });

  it("muestra la tarjeta de contingencia con email y contraseña temporal del 201", () => {
    expect(content).toContain("password_temporal");
    expect(content).toContain("alta-alumno-success");
  });

  it("ofrece copiar credenciales al portapapeles y enviar por WhatsApp (wa.me)", () => {
    expect(content).toContain("navigator.clipboard");
    expect(content).toContain("writeText");
    expect(content).toContain("https://wa.me/");
    expect(content).toContain("alta-alumno-copiar");
    expect(content).toContain("alta-alumno-whatsapp");
  });

  it("el email es obligatorio y el nombre completo opcional", () => {
    expect(content).toContain("EMAIL_RE.test(emailLimpio)");
    expect(content).toContain("nombre_completo: nombreLimpio || undefined");
  });

  it("mapea los estados de error 400/401/403/409/500/502 y recarga la lista (onInvited)", () => {
    for (const code of ["400", "401", "403", "409", "500", "502"]) {
      expect(content).toContain(`case ${code}:`);
    }
    expect(content).toContain("onInvited");
    expect(content).toContain("FunctionsHttpError");
  });

  it("el botón de dar de alta cumple el objetivo táctil (>= 48px)", () => {
    expect(content).toMatch(/data-testid="invite-student-submit"[\s\S]*?min-h-12|min-h-12[\s\S]*?data-testid="invite-student-submit"/);
  });
});

describe("GOZS-35: Primer login y cambio obligatorio (force-password-change.tsx)", () => {
  const content = read("../components/auth/force-password-change.tsx");

  it("actualiza la contraseña con updateUser y baja la bandera must_change_password", () => {
    expect(content).toContain("auth.updateUser");
    expect(content).toContain("must_change_password: false");
  });

  it("actualiza perfiles.debe_cambiar_password = false", () => {
    expect(content).toContain("debe_cambiar_password: false");
    expect(content).toContain('.from("perfiles")');
  });

  it("exige mínimo 8 caracteres, confirmación y permite mostrar/ocultar", () => {
    expect(content).toContain("MIN_LEN = 8");
    expect(content).toContain("password === confirm");
    expect(content).toContain("showPassword");
  });
});

describe("GOZS-35: Login enruta primer login y poda el enlace muerto (login/page.tsx)", () => {
  const content = read("../app/login/page.tsx");

  it("consulta debe_cambiar_password y despliega la pantalla bloqueante", () => {
    expect(content).toContain("debe_cambiar_password");
    expect(content).toContain("ForcePasswordChange");
    expect(content).toContain("setCambioObligatorio");
  });

  it("conserva el enrutamiento por rol y soporta el flujo forceChange del middleware", () => {
    expect(content).toContain('perfil?.rol === "ALUMNO" ? "/athlete" : redirectTo');
    expect(content).toContain("forceChange");
  });

  it("retira el enlace muerto de invitación (Activá tu cuenta -> /invitacion)", () => {
    expect(content).not.toContain("Activá tu cuenta");
    expect(content).not.toContain('href="/invitacion"');
    expect(content).not.toContain('/invitacion"');
  });
});

describe("GOZS-35: Middleware bloquea contraseña temporal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirige a /login?forceChange=1 cuando el JWT tiene must_change_password", async () => {
    const user = {
      id: "alumno-temp",
      email: "temp@gozster.com",
      user_metadata: { must_change_password: true, rol: "ALUMNO" },
    };
    (createServerClient as any).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from: vi.fn(), // no debe consultarse la DB en este camino
    });

    const response = await middleware(new NextRequest("https://gozster.com/athlete"));

    expect(response.status).toBe(307);
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("forceChange")).toBe("1");
  });

  it("deja pasar a un alumno sin la bandera temporal en /athlete", async () => {
    const user = { id: "alumno-ok", email: "ok@gozster.com", user_metadata: { rol: "ALUMNO" } };
    (createServerClient as any).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from: vi.fn(),
    });

    const response = await middleware(new NextRequest("https://gozster.com/athlete"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
