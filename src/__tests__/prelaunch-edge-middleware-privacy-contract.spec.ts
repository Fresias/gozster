import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

import { createServerClient } from "@supabase/ssr";
import { middleware } from "@/middleware";
import { GET as callbackGET } from "@/app/auth/callback/route";
import {
  crearHandler as crearAlta,
  type AltaAlumnoDeps,
} from "../../supabase/functions/alta-alumno-directa/handler";
import {
  crearHandler as crearReset,
  type ResetearPasswordDeps,
  type PerfilResumen,
} from "../../supabase/functions/resetear-password-alumno/handler";
import { escanearTexto, escanearDirectorio, TOKENS_BLOQUEADOS } from "../../scripts/privacy-guard.mjs";

const ORIGIN = "https://app.example.test";
const COACH = "11111111-1111-4111-8111-111111111111";
const ALUMNO = "22222222-2222-4222-8222-222222222222";
const OTRO = "33333333-3333-4333-8333-333333333333";

function expectSeguro(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  expect(res.headers.get("Content-Type")).toContain("application/json");
}

async function expectSinFiltrar(res: Response) {
  const txt = await res.text();
  expect(txt).not.toMatch(/boom|stack|at .*\(/i);
}

// ---------------------------------------------------------------------------
// alta-alumno-directa
// ---------------------------------------------------------------------------
describe("alta-alumno-directa: excepciones de dependencias", () => {
  const req = () =>
    new Request("http://x/", {
      method: "POST",
      headers: { Authorization: "Bearer tok" },
      body: JSON.stringify({ email: "nuevo@example.test", nombre_completo: "Nuevo" }),
    });
  const base = (): AltaAlumnoDeps => ({
    usuarioDesdeToken: vi.fn(async () => COACH),
    rolDePerfil: vi.fn(async () => "ENTRENADOR"),
    crearUsuario: vi.fn(async () => ({ id: ALUMNO })),
    upsertPerfil: vi.fn(async () => true),
    eliminarUsuario: vi.fn(async () => undefined),
    enviarCredenciales: vi.fn(async () => true),
  });

  it("usuarioDesdeToken lanza → 502 seguro", async () => {
    const deps = { ...base(), usuarioDesdeToken: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await crearAlta(deps, ORIGIN)(req());
    expectSeguro(res, 502);
    await expectSinFiltrar(res);
  });

  it("crearUsuario lanza → 502 seguro y no crea perfil", async () => {
    const deps = { ...base(), crearUsuario: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await crearAlta(deps, ORIGIN)(req());
    expectSeguro(res, 502);
    await expectSinFiltrar(res);
    expect(deps.upsertPerfil).not.toHaveBeenCalled();
  });

  it("upsertPerfil lanza → 500 seguro y rollback del usuario", async () => {
    const deps = { ...base(), upsertPerfil: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await crearAlta(deps, ORIGIN)(req());
    expectSeguro(res, 500);
    await expectSinFiltrar(res);
    expect(deps.eliminarUsuario).toHaveBeenCalledWith(ALUMNO);
  });

  it("upsertPerfil falla y el rollback también lanza → igual 500 seguro", async () => {
    const deps = {
      ...base(),
      upsertPerfil: vi.fn(async () => false),
      eliminarUsuario: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const res = await crearAlta(deps, ORIGIN)(req());
    expectSeguro(res, 500);
    await expectSinFiltrar(res);
    expect(deps.eliminarUsuario).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// resetear-password-alumno
// ---------------------------------------------------------------------------
describe("resetear-password-alumno: excepciones y autorización", () => {
  const perfiles: Record<string, PerfilResumen> = {
    [COACH]: { rol: "ENTRENADOR", profesor_asignado_id: null },
    [OTRO]: { rol: "ENTRENADOR", profesor_asignado_id: null },
    [ALUMNO]: { rol: "ALUMNO", profesor_asignado_id: COACH },
  };
  const base = (llamante = COACH): ResetearPasswordDeps => ({
    generarPassword: () => "Temporal-123!",
    usuarioDesdeToken: vi.fn(async () => llamante),
    perfil: vi.fn(async (id: string) => perfiles[id] ?? null),
    cambiarPassword: vi.fn(async () => true),
    marcarCambioObligatorio: vi.fn(async () => true),
  });
  const req = (alumnoId = ALUMNO) =>
    new Request("http://x/", {
      method: "POST",
      headers: { Authorization: "Bearer tok" },
      body: JSON.stringify({ alumno_id: alumnoId }),
    });

  it("camino feliz del coach asignado → 200 seguro", async () => {
    expectSeguro(await crearReset(base(), ORIGIN)(req()), 200);
  });

  it("usuarioDesdeToken lanza → 502 seguro", async () => {
    const deps = { ...base(), usuarioDesdeToken: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await crearReset(deps, ORIGIN)(req());
    expectSeguro(res, 502);
    await expectSinFiltrar(res);
  });

  it("cambiarPassword lanza → 502 seguro y no marca", async () => {
    const deps = { ...base(), cambiarPassword: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await crearReset(deps, ORIGIN)(req());
    expectSeguro(res, 502);
    await expectSinFiltrar(res);
    expect(deps.marcarCambioObligatorio).not.toHaveBeenCalled();
  });

  it("marcarCambioObligatorio lanza → 500 seguro sin exponer la clave", async () => {
    const deps = { ...base(), marcarCambioObligatorio: vi.fn().mockRejectedValue(new Error("boom")) };
    const res = await crearReset(deps, ORIGIN)(req());
    expectSeguro(res, 500);
    const txt = await res.text();
    expect(txt).not.toContain("Temporal-123!");
    expect(txt).not.toMatch(/boom/);
  });

  it("perfil lanza → 500 seguro", async () => {
    const deps = { ...base(), perfil: vi.fn().mockRejectedValue(new Error("boom")) };
    expectSeguro(await crearReset(deps, ORIGIN)(req()), 500);
  });

  it("ENTRENADOR no asignado → 403 seguro y sin cambiar clave", async () => {
    const deps = base(OTRO);
    expectSeguro(await crearReset(deps, ORIGIN)(req()), 403);
    expect(deps.cambiarPassword).not.toHaveBeenCalled();
  });

  it("ALUMNO como llamante → 403", async () => {
    const deps = base(ALUMNO);
    expectSeguro(await crearReset(deps, ORIGIN)(req()), 403);
    expect(deps.cambiarPassword).not.toHaveBeenCalled();
  });

  it("ADMIN sobre otro ADMIN o ENTRENADOR → 404", async () => {
    const admin = "44444444-4444-4444-8444-444444444444";
    const otroAdmin = "55555555-5555-4555-8555-555555555555";
    perfiles[admin] = { rol: "ADMIN", profesor_asignado_id: null };
    perfiles[otroAdmin] = { rol: "ADMIN", profesor_asignado_id: null };
    for (const objetivo of [otroAdmin, COACH]) {
      const deps = base(admin);
      expectSeguro(await crearReset(deps, ORIGIN)(req(objetivo)), 404);
      expect(deps.cambiarPassword).not.toHaveBeenCalled();
    }
    // y puede resetear a un ALUMNO
    expectSeguro(await crearReset(base(admin), ORIGIN)(req()), 200);
  });
});

// ---------------------------------------------------------------------------
// middleware RBAC
// ---------------------------------------------------------------------------
describe("middleware RBAC fail-closed (G1/G2)", () => {
  type U = { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };
  function montar(user: U | null, perfil: { rol?: string } | null, perfilError = false) {
    const maybeSingle = vi.fn(async () =>
      perfilError ? { data: null, error: { message: "db" } } : { data: perfil, error: null },
    );
    const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
    } as never);
    return { from };
  }
  const run = (p: string) => middleware(new NextRequest(`http://localhost:3000${p}`));
  const loc = (r: Response) => {
    const l = r.headers.get("location");
    return l ? new URL(l).pathname + new URL(l).search : null;
  };

  beforeEach(() => vi.mocked(createServerClient).mockReset());

  it("sin sesión → /login?redirectTo=…", async () => {
    montar(null, null);
    expect(loc(await run("/studio/alumnos"))).toBe("/login?redirectTo=%2Fstudio");
    expect(loc(await run("/athlete"))).toBe("/login?redirectTo=%2Fathlete");
  });

  it("app_metadata.must_change_password → /login?forceChange=1 en ambas áreas", async () => {
    montar({ id: ALUMNO, app_metadata: { must_change_password: true } }, { rol: "ENTRENADOR" });
    expect(loc(await run("/studio"))).toBe("/login?forceChange=1");
    expect(loc(await run("/athlete"))).toBe("/login?forceChange=1");
  });

  it("user_metadata.must_change_password NO bloquea ni eleva privilegios", async () => {
    montar({ id: COACH, user_metadata: { must_change_password: true, rol: "ADMIN" } }, { rol: "ENTRENADOR" });
    expect((await run("/athlete")).headers.get("location")).toBeNull();
    // un ALUMNO con user_metadata.rol=ADMIN sigue siendo rechazado en /studio
    montar({ id: ALUMNO, user_metadata: { rol: "ADMIN" } }, { rol: "ALUMNO" });
    expect(loc(await run("/studio"))).toBe("/login?roleMismatch=1");
  });

  it("perfil ausente o error de consulta en /studio → fail-closed", async () => {
    montar({ id: COACH }, null);
    expect(loc(await run("/studio"))).toBe("/login?redirectTo=%2Fstudio");
    montar({ id: COACH }, null, true);
    expect(loc(await run("/studio"))).toBe("/login?redirectTo=%2Fstudio");
  });

  it("ENTRENADOR y ADMIN pasan en /studio", async () => {
    for (const rol of ["ENTRENADOR", "ADMIN"]) {
      montar({ id: COACH }, { rol });
      expect((await run("/studio")).headers.get("location")).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// auth callback
// ---------------------------------------------------------------------------
describe("auth/callback", () => {
  const call = (qs: string) => callbackGET(new NextRequest(`http://localhost:3000/auth/callback${qs}`));
  beforeEach(() => exchangeCodeForSession.mockReset());

  it("code válido → recovery=1", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    expect((await call("?code=ok")).headers.get("location")).toBe("http://localhost:3000/login?recovery=1");
  });

  it("sin code o canje fallido → recoveryError=1", async () => {
    expect((await call("")).headers.get("location")).toBe("http://localhost:3000/login?recoveryError=1");
    exchangeCodeForSession.mockResolvedValue({ error: new Error("x") });
    expect((await call("?code=bad")).headers.get("location")).toBe(
      "http://localhost:3000/login?recoveryError=1",
    );
  });
});

// ---------------------------------------------------------------------------
// privacy guard (G4)
// ---------------------------------------------------------------------------
describe("privacy-guard (G4)", () => {
  it("texto limpio → sin motivos", () => {
    expect(escanearTexto("const x = 'hola mundo'; // sin datos personales")).toEqual([]);
  });

  it("detecta emails personales", () => {
    expect(escanearTexto("contacto: alguien@gmail.com")).toContain("email-personal");
    expect(escanearTexto("contacto: alguien@hotmail.com")).toContain("email-personal");
    expect(escanearTexto("contacto: alguien@example.test")).toEqual([]);
  });

  it("los bloqueos son hashes SHA-256 (no texto plano)", () => {
    for (const h of TOKENS_BLOQUEADOS as Set<string>) expect(h).toMatch(/^[0-9a-f]{64}$/);
    // el contrato hash→detección se verifica con un token sintético inyectado
    const sintetico = "tokensintetico";
    (TOKENS_BLOQUEADOS as Set<string>).add(createHash("sha256").update(sintetico).digest("hex"));
    try {
      expect(escanearTexto(`x ${sintetico.toUpperCase()} y`)).toContain("token-bloqueado");
    } finally {
      (TOKENS_BLOQUEADOS as Set<string>).delete(createHash("sha256").update(sintetico).digest("hex"));
    }
  });

  it("escanearDirectorio revisa js/json/css e ignora png/svg", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-contract-"));
    try {
      fs.mkdirSync(path.join(dir, "sub"));
      const sucio = "x@gmail.com";
      fs.writeFileSync(path.join(dir, "a.js"), sucio);
      fs.writeFileSync(path.join(dir, "b.json"), sucio);
      fs.writeFileSync(path.join(dir, "sub", "c.css"), sucio);
      fs.writeFileSync(path.join(dir, "d.png"), sucio);
      fs.writeFileSync(path.join(dir, "e.svg"), sucio);
      fs.writeFileSync(path.join(dir, "ok.js"), "console.log(1)");
      const hits = escanearDirectorio(dir) as { file: string; motivos: string[] }[];
      const nombres = hits.map((h) => path.basename(h.file)).sort();
      expect(nombres).toEqual(["a.js", "b.json", "c.css"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
