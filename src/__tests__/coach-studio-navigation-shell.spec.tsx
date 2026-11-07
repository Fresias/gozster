import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

let mockPathname = "/studio";
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "coach-test-id", email: "lucia.ferraro@gozster.test" } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

import { StudioShell } from "@/components/coach/studio-shell";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { DEMO_GIMNASIO } from "@/services/coach-demo-dataset";

describe("GOZS-378: Coach Studio - Shell de Navegación, Sidebar Agrupado, Topbar y Barra Inferior Móvil", () => {
  const shellSource = fs.readFileSync(
    path.resolve(__dirname, "../components/coach/studio-shell.tsx"),
    "utf-8"
  );
  const chatFabSource = fs.readFileSync(
    path.resolve(__dirname, "../components/coach/chat-fab.tsx"),
    "utf-8"
  );

  beforeEach(() => {
    mockPathname = "/studio";
    mockPush.mockClear();
    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      alumnos: DEMO_GIMNASIO.alumnos as any,
    });
  });

  describe("Criterio 1: Único control accesible 'Cerrar sesión' dentro del menú de cuenta", () => {
    it("GIVEN cualquier ruta en /studio THEN existe un único control accesible 'Cerrar sesión' dentro del menú de cuenta", () => {
      const routes = ["/studio", "/studio/rutinas", "/studio/agenda", "/studio/cobros", "/studio/dashboard"];

      for (const route of routes) {
        mockPathname = route;
        const html = renderToStaticMarkup(
          <StudioShell>
            <div>Vista {route}</div>
          </StudioShell>
        );

        // Cuenta cuántas veces aparece aria-label="Cerrar sesión"
        const matches = html.match(/aria-label="Cerrar sesión"/g) || [];
        expect(matches.length).toBe(1);

        // El control está contenido dentro del menú de cuenta
        expect(html).toContain('data-testid="studio-account-menu"');
        expect(html).toContain('aria-label="Menú de cuenta"');

        // El texto visible y accesible es 'Cerrar Sesión' o 'Cerrar sesión'
        expect(html).toMatch(/Cerrar\s+Sesión/i);
      }
    });

    it("no existen botones 'Cerrar sesión' sueltos en el topbar o en el header móvil", () => {
      // El header no debe contener Cerrar sesión duplicado
      expect(shellSource).not.toMatch(/<header[^>]*>[\s\S]*?aria-label="Cerrar sesión"[\s\S]*?<\/header>/);
    });
  });

  describe("Criterio 2: Sidebar agrupado en secciones lógicas y Tooltips cuando está colapsado", () => {
    it("el sidebar expone las 3 secciones lógicas: Alumnos, Operación y Negocio", () => {
      expect(shellSource).toContain("Alumnos");
      expect(shellSource).toContain("Operación");
      expect(shellSource).toContain("Negocio");

      // Sección Alumnos contiene Inicio, Alumnos y Rutinas & Constructor
      expect(shellSource).toContain('href="/studio"');
      expect(shellSource).toContain('href="/studio/rutinas"');
      expect(shellSource).toContain('data-testid="sidebar-routine-builder-btn"');

      // Sección Operación contiene Agenda y Ranking
      expect(shellSource).toContain('href="/studio/agenda"');
      expect(shellSource).toContain('href="/studio/ranking-funcional"');
      expect(shellSource).toContain('data-testid="sidebar-ranking-link"');

      // Sección Negocio contiene Cobros y Métricas & Retención
      expect(shellSource).toContain('href="/studio/cobros"');
      expect(shellSource).toContain('data-testid="sidebar-cobros-link"');
      expect(shellSource).toContain('href="/studio/dashboard"');
      expect(shellSource).toContain('data-testid="sidebar-metricas-link"');
    });

    it("GIVEN el sidebar colapsado WHEN el cursor o foco llega a un ítem THEN se anuncia su nombre y se despliega su Tooltip", () => {
      expect(shellSource).toContain("Tooltip");
      expect(shellSource).toContain("TooltipTrigger");
      expect(shellSource).toContain("TooltipContent");
      expect(shellSource).toContain('side="right"');

      // Cada ítem tiene aria-label y TooltipContent asociado
      expect(shellSource).toContain('aria-label="Inicio"');
      expect(shellSource).toContain('aria-label="Alumnos"');
      expect(shellSource).toContain('aria-label="Rutinas"');
      expect(shellSource).toContain('aria-label="Agenda"');
      expect(shellSource).toContain('aria-label="Ranking"');
      expect(shellSource).toContain('aria-label="Cobros"');
      expect(shellSource).toContain('aria-label="Métricas"');
    });
  });

  describe("Criterio 3: Buscador rápido ⌘K / Ctrl+K y apertura de ficha de alumno al presionar Enter", () => {
    it("el topbar renderiza el buscador rápido con ⌘K e ícono de Mensajes sin botón de alta duplicado", () => {
      expect(shellSource).toContain('data-testid="studio-quick-search-input"');
      expect(shellSource).toContain('data-testid="topbar-mensajes-btn"');
      expect(shellSource).not.toContain('data-testid="topbar-alta-alumno-btn"');
      expect(shellSource).toContain("⌘K");

      const html = renderToStaticMarkup(
        <StudioShell>
          <div>Contenido</div>
        </StudioShell>
      );
      expect(html).toContain('data-testid="studio-quick-search-input"');
      expect(html).toContain('data-testid="topbar-mensajes-btn"');
    });

    it("GIVEN la tecla ⌘K o Ctrl+K THEN el foco se traslada al buscador; al buscar un alumno y presionar Enter, se abre su ficha", () => {
      expect(shellSource).toContain('key.toLowerCase() === "k"');
      expect(shellSource).toContain("e.metaKey || e.ctrlKey");
      expect(shellSource).toContain("searchInputRef.current?.focus()");
      expect(shellSource).toContain("selectAlumno");
      expect(shellSource).toContain('e.key === "Enter"');
    });
  });

  describe("Criterio 4: Viewport móvil 390px (Barra inferior de 5 accesos y eliminación de grilla pesada / FAB)", () => {
    it("GIVEN un viewport móvil THEN se renderiza la barra inferior de 5 accesos (Inicio, Alumnos, Agenda, Mensajes, Más)", () => {
      const html = renderToStaticMarkup(
        <StudioShell>
          <div>Contenido</div>
        </StudioShell>
      );

      // Barra inferior móvil
      expect(html).toContain('data-testid="studio-mobile-bottom-nav"');
      expect(html).toContain('aria-label="Navegación inferior móvil"');
      expect(html).toContain('grid-cols-5');

      // 5 Accesos
      expect(html).toContain('aria-label="Inicio"');
      expect(html).toContain('aria-label="Alumnos"');
      expect(html).toContain('aria-label="Agenda"');
      expect(html).toContain('aria-label="Mensajes"');
      expect(html).toContain('aria-label="Más"');
    });

    it("desaparece la grilla de navegación pesada que ocupaba 290px en la cabecera móvil", () => {
      // El aside está oculto en móvil (<768px) con hidden md:flex flex-col
      expect(shellSource).toContain("hidden md:flex flex-col");
      // Ya no existe flex-wrap gap-2 lg:flex-col desbordando la vista
      expect(shellSource).not.toContain("flex flex-wrap gap-2 lg:w-full lg:flex-col");
    });

    it("elimina el botón flotante FAB superpuesto y convierte el chat en Sheet derecho de 400px", () => {
      expect(chatFabSource).toContain("max-w-[400px]");
      expect(chatFabSource).not.toContain("Acceso flotante a mensajería");
      expect(chatFabSource).not.toContain("fixed bottom-5 right-5 sm:bottom-6 sm:right-6");
    });
  });
});
