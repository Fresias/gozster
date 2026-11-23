// ============================================================================
// GOZS-692 (Frontend): botón "Resetear contraseña" en la ficha del alumno y
// consistencia de /login con app_metadata. Entorno node (sin DOM): lógica del
// invoke con cliente mockeado + render estático de cada estado de la vista.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import {
  ResetPasswordPanel,
  resetearPasswordAlumno,
  type EstadoReset,
} from "@/components/coach/student-detail/reset-password-alumno";

const ALUMNO_ID = "11111111-2222-4333-8444-555555555555";
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

function clienteCon(result: { data: unknown; error: unknown } | Error) {
  const invoke = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { functions: { invoke } } as never, invoke };
}

const httpError = (status: number) =>
  new FunctionsHttpError(new Response(JSON.stringify({ error: "x" }), { status }));

const noop = () => {};
const render = (estado: EstadoReset) =>
  renderToStaticMarkup(
    <ResetPasswordPanel
      estado={estado}
      nombre="Ana Pérez"
      onPedir={noop}
      onConfirmar={noop}
      onCancelar={noop}
      onCopiar={noop}
      onOcultar={noop}
    />,
  );

describe("resetearPasswordAlumno (contrato de la Edge Function)", () => {
  it("invoca resetear-password-alumno con { alumno_id } y devuelve la clave temporal del 200", async () => {
    const { client, invoke } = clienteCon({
      data: { alumno_id: ALUMNO_ID, password_temporal: "Tmp-123abc", mensaje: "Contraseña reseteada" },
      error: null,
    });
    const r = await resetearPasswordAlumno(client, ALUMNO_ID);
    expect(invoke).toHaveBeenCalledWith("resetear-password-alumno", { body: { alumno_id: ALUMNO_ID } });
    expect(r).toEqual({ ok: true, passwordTemporal: "Tmp-123abc", mensaje: "Contraseña reseteada" });
  });

  it("403: explica que solo el entrenador asignado o un admin puede resetear", async () => {
    const { client } = clienteCon({ data: null, error: httpError(403) });
    const r = await resetearPasswordAlumno(client, ALUMNO_ID);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/No tenés permisos/);
  });

  it("404: avisa que el alumno no se encontró", async () => {
    const { client } = clienteCon({ data: null, error: httpError(404) });
    const r = await resetearPasswordAlumno(client, ALUMNO_ID);
    expect(!r.ok && r.error).toMatch(/No encontramos a este alumno/);
  });

  it("500/502: mensaje genérico de servidor", async () => {
    const { client } = clienteCon({ data: null, error: httpError(502) });
    const r = await resetearPasswordAlumno(client, ALUMNO_ID);
    expect(!r.ok && r.error).toMatch(/No se pudo resetear la contraseña/);
  });

  it("error de red (fetch fallido o excepción): mensaje de conexión", async () => {
    const { client } = clienteCon({ data: null, error: new FunctionsFetchError(new TypeError("offline")) });
    const r1 = await resetearPasswordAlumno(client, ALUMNO_ID);
    expect(!r1.ok && r1.error).toMatch(/No pudimos conectar/);

    const { client: c2 } = clienteCon(new TypeError("Failed to fetch"));
    const r2 = await resetearPasswordAlumno(c2, ALUMNO_ID);
    expect(!r2.ok && r2.error).toMatch(/No pudimos conectar/);
  });

  it("200 sin password_temporal: no inventa éxito", async () => {
    const { client } = clienteCon({ data: { alumno_id: ALUMNO_ID }, error: null });
    const r = await resetearPasswordAlumno(client, ALUMNO_ID);
    expect(r.ok).toBe(false);
  });
});

describe("ResetPasswordPanel (estados visuales)", () => {
  it("inicial: muestra el botón 'Resetear contraseña' y ninguna clave", () => {
    const html = render({ fase: "inicial" });
    expect(html).toContain('data-testid="btn-resetear-password"');
    expect(html).toContain("Resetear contraseña");
    expect(html).not.toContain('data-testid="reset-password-temporal"');
    expect(html).not.toContain('data-testid="reset-password-confirmacion"');
  });

  it("confirmando: pide confirmación explícita antes de ejecutar el reset", () => {
    const html = render({ fase: "confirmando" });
    expect(html).toContain('data-testid="reset-password-confirmacion"');
    expect(html).toContain("¿Resetear la contraseña de Ana Pérez?");
    expect(html).toContain('data-testid="reset-password-confirmar"');
    expect(html).toContain('data-testid="reset-password-cancelar"');
    expect(html).not.toContain('data-testid="btn-resetear-password"');
  });

  it("cargando: deshabilita confirmar/cancelar para evitar doble reset", () => {
    const html = render({ fase: "cargando" });
    expect(html).toContain("Reseteando...");
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });

  it("éxito: muestra la clave temporal una vez, botón copiar y aviso de cambio obligatorio", () => {
    const html = render({ fase: "exito", passwordTemporal: "Tmp-123abc", mensaje: "Contraseña reseteada" });
    expect(html).toContain('data-testid="reset-password-temporal"');
    expect(html).toContain("Tmp-123abc");
    expect(html).toContain('data-testid="reset-password-copiar"');
    expect(html).toContain("Se muestra una sola vez");
    expect(html).toContain("deberá elegir una contraseña nueva");
    expect(html).toContain('data-testid="reset-password-listo"');
  });

  it("error: muestra el mensaje como alerta y permite reintentar", () => {
    const html = render({ fase: "error", error: "No tenés permisos para resetear" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("No tenés permisos para resetear");
    expect(html).toContain('data-testid="btn-resetear-password"');
    expect(html).not.toContain("Tmp-");
  });
});

describe("Clave temporal: solo en memoria y cableado en la ficha", () => {
  const componente = read("../components/coach/student-detail/reset-password-alumno.tsx");

  it("no persiste ni loguea la clave (sin localStorage, sessionStorage, URL ni console)", () => {
    for (const prohibido of ["localStorage", "sessionStorage", "console.", "searchParams", "history."]) {
      expect(componente).not.toContain(prohibido);
    }
    expect(componente).toContain("navigator.clipboard.writeText(estado.passwordTemporal)");
  });

  it("la ficha del alumno renderiza el reset solo para alumnos reales", () => {
    const ficha = read("../components/coach/student-detail.tsx");
    expect(ficha).toContain("<ResetPasswordAlumno alumnoId={alumno.id}");
    expect(ficha).toMatch(/isLiveStudent \? \(\s*<ResetPasswordAlumno/);
    const isla = read("../components/coach/student-detail/islas/isla-administrativa.tsx");
    expect(isla).toContain("{accesoNode}");
  });
});

describe("/login considera app_metadata (fuente de verdad del middleware)", () => {
  const login = read("../app/login/page.tsx");

  it("debeCambiarPassword lee app_metadata además del perfil", () => {
    expect(login).toContain("user.app_metadata?.must_change_password === true");
    expect(login).toContain("debeCambiarPassword(perfil?.debe_cambiar_password, data.user)");
  });
});
