import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentacionPagina, DocumentacionView } from "@/components/coach/documentacion/documentacion-view";
import { SECCIONES } from "@/components/coach/documentacion/documentacion-contenido";
import { calcularEjemplosDocumentacion } from "@/lib/documentacion-ejemplos";
import { calculateBrzycki1RM, calculateEpley1RM } from "@/lib/strength-metrics";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";

const shell = fs.readFileSync(path.resolve(__dirname, "../components/coach/studio-shell.tsx"), "utf-8");
const html = () => renderToStaticMarkup(createElement(DocumentacionPagina));
const gate = () => renderToStaticMarkup(createElement(DocumentacionView));

describe("GOZS-142: Documentación en Modo Testeo", () => {
  beforeEach(() => useWorkspaceModeStore.getState().setMode("PRODUCCION"));

  it("el ítem de menú solo se renderiza en TESTEO y apunta a /studio/documentacion", () => {
    expect(shell).toContain('mode === "TESTEO" && (');
    expect(shell).toContain('href="/studio/documentacion"');
    expect(fs.existsSync(path.resolve(__dirname, "../app/(coach)/studio/documentacion/page.tsx"))).toBe(true);
  });

  it("Producción: la ruta muestra el aviso para activar Modo Testeo", () => {
    const out = gate();
    expect(out).toContain("documentacion-aviso-produccion");
    expect(out).toContain("Modo Testeo");
    expect(out).not.toContain("documentacion-pagina");
  });

  it("Testeo: la guía tiene las 8 secciones con su índice y cada métrica tiene ejemplo", () => {
    const out = html();
    expect(SECCIONES).toHaveLength(8);
    for (const s of SECCIONES) {
      expect(out).toContain(`id="${s.id}"`);
      expect(out).toContain(`href="#${s.id}"`);
    }
    const metricas = out.split('data-testid="documentacion-metrica"').slice(1);
    expect(metricas.length).toBeGreaterThanOrEqual(10);
    for (const m of metricas) expect(m).toMatch(/Ejemplo: <\/span>.*\d/);
  });

  it("sin jerga técnica en el texto visible", () => {
    const visible = html().replace(/<[^>]+>/g, " ");
    for (const w of [/\btabla\b/i, /\bFK\b/, /\bRLS\b/, /\bRPC\b/, /\btrigger\b/i, /\buuid\b/i, /mynter/i]) {
      expect(visible).not.toMatch(w);
    }
  });

  it("los ejemplos salen de las funciones reales (1RM)", () => {
    const e = calcularEjemplosDocumentacion();
    expect(e.fuerza.epley).toBe((Math.round(calculateEpley1RM(80, 5) * 10) / 10).toString().replace(".", ","));
    expect(e.fuerza.brzycki).toBe((Math.round(calculateBrzycki1RM(80, 5) * 10) / 10).toString().replace(".", ","));
    expect(html()).toContain(`Epley ${e.fuerza.epley} kg`);
  });

  it("ejemplos de ciclo fijo y estados de cuota", () => {
    const e = calcularEjemplosDocumentacion();
    expect(e.ciclo.proximoVencimiento).toBe("2026-11-10");
    expect(e.estados).toEqual({ vigente: "VIGENTE", porVencer: "POR_VENCER", vencida: "VENCIDA" });
    expect(e.actividad).toMatchObject({ celesteSinEntrenar: false, facundoSinEntrenar: true, nuevo: true, noNuevo: false });
  });
});
