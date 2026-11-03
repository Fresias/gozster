import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import StudioLoading from "@/app/(coach)/studio/loading";

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-342: Instant Loading Studio, Remoción de Botón Analítica y Renombrado a Métricas & Retención", () => {
  const loadingFile = read("../app/(coach)/studio/loading.tsx");
  const studioView = read("../components/coach/coach-studio-view.tsx");
  const studioShell = read("../components/coach/studio-shell.tsx");
  const dashboardView = read("../components/coach/coach-dashboard-view.tsx");

  describe("1. Instant Loading Skeleton (loading.tsx)", () => {
    it("existe loading.tsx en src/app/(coach)/studio/ con skeleton reactivo nativo Tailwind", () => {
      expect(loadingFile).toBeDefined();
      expect(loadingFile).toContain("data-testid=\"studio-loading-skeleton\"");
      expect(loadingFile).toContain("animate-pulse");
      expect(loadingFile).toContain("aria-busy=\"true\"");
    });

    it("renderiza el skeleton de Studio con tarjetas de KPIs y filas de atletas", () => {
      const html = renderToString(React.createElement(StudioLoading));
      expect(html).toContain("data-testid=\"studio-loading-skeleton\"");
      expect(html).toContain("animate-pulse");
      expect(html).toContain("aria-busy=\"true\"");
      expect(html).toContain("aria-label=\"Cargando Coach Studio\"");
    });
  });

  describe("2. Eliminación de Botón Innecesario en CoachStudioView", () => {
    it("no contiene el botón ni el texto 'Vista Analíticas Completa →'", () => {
      expect(studioView).not.toContain("Vista Analíticas Completa");
      expect(studioView).not.toContain("Vista Analíticas Completa →");
    });

    it("la cabecera de Coach Studio no desvía con enlace a /studio/dashboard", () => {
      // El único Link a /studio/dashboard que existía en coach-studio-view fue removido
      expect(studioView).not.toContain('href="/studio/dashboard"');
      expect(studioView).not.toContain("import Link from \"next/link\"");
    });
  });

  describe("3. Renombrado de Métricas & Retención", () => {
    it("studio-shell.tsx nombra la sección como 'Métricas & Retención' en la barra lateral", () => {
      expect(studioShell).toContain("Métricas &amp; Retención");
      expect(studioShell).toContain("sidebar-metricas-link");
      expect(studioShell).not.toContain("Dashboard &amp; Analíticas");
      expect(studioShell).not.toContain("Dashboard & Analíticas");
    });

    it("coach-dashboard-view.tsx nombra el encabezado H1 como 'Métricas & Retención'", () => {
      expect(dashboardView).toContain("Métricas &amp; Retención");
      expect(dashboardView).not.toContain("Dashboard de Analíticas &amp; Retención");
      expect(dashboardView).not.toContain("Dashboard de Analíticas");
    });
  });
});
