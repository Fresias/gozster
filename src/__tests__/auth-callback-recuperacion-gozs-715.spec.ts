import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "@/app/auth/callback/route";

const call = (qs: string) => GET(new NextRequest(`http://localhost:3000/auth/callback${qs}`));

describe("GET /auth/callback (recuperación de contraseña, GOZS-715)", () => {
  beforeEach(() => exchangeCodeForSession.mockReset());

  it("canjea el code y redirige a /login?recovery=1", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await call("?code=abc");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?recovery=1");
  });

  it("code inválido o vencido redirige a /login?recoveryError=1", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });
    const res = await call("?code=bad");
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?recoveryError=1");
  });

  it("sin code no consulta a Auth y redirige con error", async () => {
    const res = await call("");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?recoveryError=1");
  });
});
