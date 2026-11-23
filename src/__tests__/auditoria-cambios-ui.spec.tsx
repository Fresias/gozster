import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

import { AuditoriaCambiosPanel } from "@/components/coach/auditoria-cambios-panel";
import {
  LIMITE_AUDITORIA,
  listarAuditoriaCambios,
  normalizarFiltroAuditoria,
  resumirCambio,
  type RegistroAuditoria,
} from "@/services/auditoria-service";

const registro = (over: Partial<RegistroAuditoria> = {}): RegistroAuditoria => ({
  id: "a1",
  entidad: "contrataciones",
  entidad_id: "c1",
  accion: "EXTENSION_EXCEPCIONAL",
  motivo: "Lesión documentada",
  valores_anteriores: { fecha_fin: "2026-11-30", estado: "VIGENTE" },
  valores_nuevos: { fecha_fin: "2026-12-15", estado: "VIGENTE" },
  created_at: "2026-11-20T15:00:00Z",
  autor_nombre: "Profe Ana",
  ...over,
});

/** Cliente mínimo que registra la cadena de PostgREST y devuelve `resultado`. */
function clienteFalso(resultado: { data: unknown; error: unknown }) {
  const llamadas: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      llamadas.push([m, args]);
      return m === "limit" ? Promise.resolve(resultado) : builder;
    };
  }
  const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>;
  return { client, llamadas };
}

describe("Historial de cambios en Coach Studio (GOZS-723)", () => {
  it("GIVEN registros THEN muestra acción, entidad, autor, motivo y solo los campos que cambiaron", () => {
    const html = renderToStaticMarkup(<AuditoriaCambiosPanel registros={[registro()]} />);
    expect(html).toContain('data-testid="auditoria-lista"');
    expect(html).toContain("Extensión excepcional");
    expect(html).toContain("Contratación");
    expect(html).toContain("Por Profe Ana");
    expect(html).toContain("Motivo: Lesión documentada");
    expect(html).toContain("fecha_fin:");
    expect(html).toContain("2026-11-30 → 2026-12-15");
    expect(html).not.toContain("estado:");
  });

  it("GIVEN base vacía THEN muestra estado vacío sin datos demo", () => {
    const html = renderToStaticMarkup(<AuditoriaCambiosPanel registros={[]} />);
    expect(html).toContain('data-testid="auditoria-vacia"');
    expect(html).toContain("Todavía no hay cambios registrados");
    expect(html).not.toContain('data-testid="auditoria-registro"');
  });

  it("GIVEN un filtro activo THEN preselecciona las opciones y ofrece limpiar", () => {
    const html = renderToStaticMarkup(
      <AuditoriaCambiosPanel registros={[]} filtro={{ entidad: "dias_rutina", accion: "DELETE" }} />,
    );
    expect(html).toContain('<option value="dias_rutina" selected="">');
    expect(html).toContain('<option value="DELETE" selected="">');
    expect(html).toContain("Sin cambios para este filtro");
    expect(html).toContain("Limpiar");
  });

  it("GIVEN un error de carga THEN lo muestra como alerta y no como base vacía", () => {
    const html = renderToStaticMarkup(<AuditoriaCambiosPanel registros={[]} error="No pudimos cargar el historial de cambios." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("No pudimos cargar el historial de cambios.");
    expect(html).not.toContain('data-testid="auditoria-vacia"');
  });

  it("normalizarFiltroAuditoria ignora valores desconocidos", () => {
    expect(normalizarFiltroAuditoria({ entidad: "pagos", accion: "UPDATE" })).toEqual({ entidad: undefined, accion: "UPDATE" });
    expect(normalizarFiltroAuditoria({ entidad: "toString" })).toEqual({ entidad: undefined, accion: undefined });
    expect(normalizarFiltroAuditoria(undefined)).toEqual({ entidad: undefined, accion: undefined });
  });

  it("resumirCambio acota valores largos y tolera JSON no objeto", () => {
    const [campo] = resumirCambio({ nota: "x".repeat(200) }, null);
    expect(campo.campo).toBe("nota");
    expect(campo.antes.length).toBe(60);
    expect(campo.despues).toBe("—");
    expect(resumirCambio(null, ["a"])).toEqual([]);
  });

  it("listarAuditoriaCambios consulta ordenado, acotado y filtrado, y aplana el autor", async () => {
    const { client, llamadas } = clienteFalso({
      data: [{ ...registro(), autor_nombre: undefined, autor: { nombre_completo: "Profe Ana" } }],
      error: null,
    });
    const filas = await listarAuditoriaCambios(client, { entidad: "contrataciones", accion: "EXTENSION_EXCEPCIONAL" });
    expect(client.from).toHaveBeenCalledWith("auditoria_cambios");
    expect(llamadas).toContainEqual(["eq", ["entidad", "contrataciones"]]);
    expect(llamadas).toContainEqual(["eq", ["accion", "EXTENSION_EXCEPCIONAL"]]);
    expect(llamadas).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(llamadas).toContainEqual(["limit", [LIMITE_AUDITORIA]]);
    expect(filas[0].autor_nombre).toBe("Profe Ana");
    expect(filas[0]).not.toHaveProperty("autor");
  });

  it("listarAuditoriaCambios convierte el error de Supabase en un mensaje genérico", async () => {
    const { client } = clienteFalso({ data: null, error: { message: "permission denied for table" } });
    await expect(listarAuditoriaCambios(client)).rejects.toThrow("No pudimos cargar el historial de cambios.");
  });
});
