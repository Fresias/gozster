import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { RetentionKpiCards } from "@/components/coach/retention-kpi-cards";
import { StudioShell } from "@/components/coach/studio-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/studio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id", email: "coach@gozster.com" } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

describe("GOZS-496: Coach Studio - Directorio mobile + barra inferior + indicador alumnos activos", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");

  describe("1. Directorio de alumnos: DataTable adaptativo (Desktop tabla vs Mobile tarjetas)", () => {
    interface TestItem {
      id: string;
      nombre: string;
      cuota: string;
      rutina: string;
    }

    const testColumns: ColumnDef<TestItem>[] = [
      { id: "atleta", header: "Alumno", accessorKey: "nombre", mobile: "title" },
      { id: "cuota", header: "Cuota", accessorKey: "cuota", mobile: "meta" },
      { id: "rutina", header: "Rutina", accessorKey: "rutina", mobile: "meta" },
      {
        id: "acciones",
        header: "Acciones",
        mobile: "action",
        cell: () => <button type="button" aria-label="Acciones">⋯</button>,
      },
    ];

    const testData: TestItem[] = [
      { id: "1", nombre: "Lucía Morales", cuota: "Al día", rutina: "Fuerza 3x" },
      { id: "2", nombre: "Santiago Rossi", cuota: "Pendiente", rutina: "Sin rutina" },
    ];

    it("GIVEN jsdom/SSR (sin matchMedia activo) THEN renderiza la tabla estándar <Table> con data-testid sin duplicar", () => {
      const html = renderToStaticMarkup(
        <DataTable columns={testColumns} data={testData} tableTestId="test-table" />,
      );

      expect(html).toContain('data-testid="test-table"');
      expect(html).not.toContain('data-testid="test-table-mobile"');
      expect(html).toContain("<table");
      expect(html).toContain("Lucía Morales");
    });

    it("GIVEN viewport móvil (< 768px con isMobile=true) THEN renderiza lista de tarjetas <ul data-testid=*-mobile>", () => {
      const html = renderToStaticMarkup(
        <DataTable columns={testColumns} data={testData} tableTestId="test-table" isMobile={true} />,
      );

      expect(html).toContain('data-testid="test-table-mobile"');
      expect(html).toContain("<ul");
      expect(html).not.toContain("<table");

      // Slots de tarjeta
      expect(html).toContain("Lucía Morales");
      expect(html).toContain("Cuota");
      expect(html).toContain("Al día");
      expect(html).toContain("Rutina");
      expect(html).toContain("Fuerza 3x");
      expect(html).toContain("⋯");
    });

    it("GIVEN paginación en DataTable THEN botones anterior/siguiente usan size=icon y texto responsive", () => {
      const html = renderToStaticMarkup(
        <DataTable columns={testColumns} data={testData} pageSize={1} />,
      );

      expect(html).toContain('aria-label="Página anterior"');
      expect(html).toContain('aria-label="Página siguiente"');
      expect(html).toContain("hidden md:inline");
      expect(html).toContain("md:w-auto md:gap-1 md:px-3");
    });
  });

  describe("2. ColumnsAlumnos en coach-studio-view.tsx", () => {
    const viewSource = fs.readFileSync(
      path.join(repoRoot, "src/components/coach/coach-studio-view.tsx"),
      "utf-8",
    );

    it("GIVEN columnsAlumnos THEN declara slots mobile (title, meta, action)", () => {
      expect(viewSource).toContain('id: "atleta"');
      expect(viewSource).toContain('mobile: "title"');
      expect(viewSource).toContain('id: "cuota"');
      expect(viewSource).toContain('mobile: "meta"');
      expect(viewSource).toContain('id: "vigencia_rutina"');
      expect(viewSource).toContain('id: "actividad"');
      expect(viewSource).toContain('id: "alertas"');
      expect(viewSource).toContain('id: "acciones"');
      expect(viewSource).toContain('mobile: "action"');
    });

    it("GIVEN columna atleta THEN botón de alumno incluye clase min-h-target", () => {
      expect(viewSource).toContain("min-h-target rounded-md cursor-pointer");
    });

    it("GIVEN columna alertas THEN contenedor usa md:min-w-[130px] md:max-w-[190px]", () => {
      expect(viewSource).toContain("md:min-w-[130px] md:max-w-[190px]");
    });

    it("GIVEN columna acciones THEN DropdownMenuTrigger usa size-target (36px desktop / 48px touch)", () => {
      expect(viewSource).toContain("inline-flex size-target items-center justify-center");
    });
  });

  describe("3. Barra inferior mobile en studio-shell.tsx", () => {
    it("GIVEN studio-shell THEN barra inferior ocupa h-16 con 5 ítems que llenan la celda (h-full)", () => {
      const shellSource = fs.readFileSync(
        path.join(repoRoot, "src/components/coach/studio-shell.tsx"),
        "utf-8",
      );

      expect(shellSource).toContain('data-testid="studio-mobile-bottom-nav"');
      expect(shellSource).toContain('<div className="grid h-16 grid-cols-5">');
      expect(shellSource).toContain("relative flex h-full flex-col items-center justify-center");
      expect(shellSource).toContain("size-5");
      expect(shellSource).toContain("before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:bg-foreground");
    });

    it("GIVEN renderToStaticMarkup de StudioShell THEN ítems tienen aria-label y navegación accesible", () => {
      const html = renderToStaticMarkup(
        <StudioShell>
          <div>Contenido</div>
        </StudioShell>,
      );

      expect(html).toContain('data-testid="studio-mobile-bottom-nav"');
      expect(html).toContain('aria-label="Inicio"');
      expect(html).toContain('aria-label="Alumnos"');
      expect(html).toContain('aria-label="Agenda"');
      expect(html).toContain('aria-label="Mensajes"');
      expect(html).toContain('aria-label="Más"');
      expect(html).toContain('aria-current="page"');
    });
  });

  describe("4. Indicador de alumnos activos: retention-kpi-cards.tsx", () => {
    const retentionSource = fs.readFileSync(
      path.join(repoRoot, "src/components/coach/retention-kpi-cards.tsx"),
      "utf-8",
    );

    it("GIVEN retention-kpi-cards.tsx THEN no contiene colores hardcodeados de paleta ni hex", () => {
      expect(retentionSource).not.toMatch(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
      expect(retentionSource).not.toContain("emerald-");
      expect(retentionSource).not.toContain("amber-");
      expect(retentionSource).not.toContain("slate-");
      expect(retentionSource).not.toContain("zinc-");
      expect(retentionSource).not.toContain("animate-ping");
      expect(retentionSource).not.toContain("Al día");
    });

    it("GIVEN renderToStaticMarkup THEN renderiza número en color de texto y botón con ChevronRight", () => {
      const html = renderToStaticMarkup(
        <RetentionKpiCards
          metricas={{ cantActivas: 25, cantSinPlanEntrenamiento: 3, cantClientesPerdidosMes: 0 }}
          onAssignPlanClick={() => {}}
        />,
      );

      expect(html).toContain('data-testid="retention-executive-banner"');
      expect(html).toContain('data-testid="kpi-cant-activas"');
      expect(html).toContain(">25<");
      expect(html).toContain("Alumnos activos");
      expect(html).toContain("con membresía vigente");
      expect(html).toContain("3</span> sin rutina");
      expect(html).toContain("Asignar rutina");
      expect(html).toContain("border-warning-soft-border bg-warning-soft");
      expect(html).toContain("text-warning-soft-foreground");
    });
  });
});
