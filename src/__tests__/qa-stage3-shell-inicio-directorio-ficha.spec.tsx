import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

let mockPathname = "/studio";
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "coach-test-id", email: "coach@gozster.test" } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

import { StudioShell } from "@/components/coach/studio-shell";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { ParaRevisarHoy } from "@/components/coach/para-revisar-hoy";
import { ClasesHoyAtajosChat } from "@/components/coach/clases-hoy-atajos-chat";
import { StudentDetail, type StudentDetailProps } from "@/components/coach/student-detail";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  rangoPeriodo,
  mapearRpcAKpis,
  puedeVerMontos,
  type KpisNegocio,
} from "@/lib/kpis-negocio";
import {
  DEMO_GIMNASIO,
  DEMO_KPIS_NEGOCIO,
} from "@/services/coach-demo-dataset";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useChatStore } from "@/store/use-chat-store";
import { useCobrosStore } from "@/store/use-cobros-store";
import type { Perfil } from "@/types/database.types";

/**
 * GOZS-390: Auditoría E2E de Shell, Inicio, Directorio Abierto y Layout Ficha (UX-S, UX-I, UX-D)
 * Referencia: 02-vistas.md §1, §2, §3, §4, 05-qa.md §3
 */
describe("GOZS-390: Auditoría Integral de Stage 3 (Shell, Inicio, Directorio y Ficha Base)", () => {
  const shellSource = fs.readFileSync(
    path.resolve(__dirname, "../components/coach/studio-shell.tsx"),
    "utf-8"
  );
  const chatFabSource = fs.readFileSync(
    path.resolve(__dirname, "../components/coach/chat-fab.tsx"),
    "utf-8"
  );
  const studentDetailSource = fs.readFileSync(
    path.resolve(__dirname, "../components/coach/student-detail.tsx"),
    "utf-8"
  );

  const alumnoMock: Perfil = {
    ...MOCK_ALUMNOS[0]!,
    id: "alumno-test-390",
    nombre_completo: "Lucas Giménez",
    email: "lucas.gimenez@ficticio.ar",
    estado_membresia: "ACTIVA",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    profesor_asignado_id: "coach-test-id",
    rol: "ALUMNO",
    fecha_baja: null,
  };

  const defaultDetailProps: StudentDetailProps = {
    alumno: alumnoMock,
    activeTab: "rutina_actual",
    onTabChange: vi.fn(),
    onBack: vi.fn(),
    rutinaActiva: null,
    historialPlanes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejerciciosCatalogo: [],
    onOpenHistoricalLoads: vi.fn(),
    onClonarUltimaRutina: vi.fn().mockResolvedValue(null),
    onExtenderVigencia: vi.fn().mockResolvedValue(null),
    isOffline: false,
    onOpenChat: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/studio";
    useChatStore.getState().resetToDefaults();
    useCobrosStore.getState().resetDemoDataset();
    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      chatAlumnoId: null,
      isChatOpen: false,
      alumnos: DEMO_GIMNASIO.alumnos as any,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SHELL (UX-S)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("1. Shell de Navegación (UX-S)", () => {
    it("GIVEN cualquier ruta de Coach Studio THEN existe un único control accesible 'Cerrar sesión' en el menú de cuenta", () => {
      const routes = [
        "/studio",
        "/studio/rutinas",
        "/studio/agenda",
        "/studio/ranking-funcional",
        "/studio/cobros",
        "/studio/dashboard",
      ];

      for (const route of routes) {
        mockPathname = route;
        const html = renderToStaticMarkup(
          <StudioShell>
            <div>Vista {route}</div>
          </StudioShell>
        );

        const matches = html.match(/aria-label="Cerrar sesión"/g) || [];
        expect(matches.length).toBe(1);
        expect(html).toContain('data-testid="studio-account-menu"');
        expect(html).toContain('aria-label="Menú de cuenta"');
        expect(html).toMatch(/Cerrar\s+Sesión/i);
      }

      // No existen botones sueltos de cerrar sesión en topbar o header
      expect(shellSource).not.toMatch(/<header[^>]*>[\s\S]*?aria-label="Cerrar sesión"[\s\S]*?<\/header>/);
    });

    it("GIVEN desktop (1440px) THEN el sidebar agrupa la navegación en Alumnos, Operación y Negocio con Tooltips", () => {
      expect(shellSource).toContain("Alumnos");
      expect(shellSource).toContain("Operación");
      expect(shellSource).toContain("Negocio");

      // Rutas requeridas por sección
      expect(shellSource).toContain('href="/studio"');
      expect(shellSource).toContain('href="/studio/rutinas"');
      expect(shellSource).toContain('data-testid="sidebar-routine-builder-btn"');
      expect(shellSource).toContain('href="/studio/agenda"');
      expect(shellSource).toContain('href="/studio/ranking-funcional"');
      expect(shellSource).toContain('href="/studio/cobros"');
      expect(shellSource).toContain('href="/studio/dashboard"');

      // Tooltips presentes para estado colapsado
      expect(shellSource).toContain("Tooltip");
      expect(shellSource).toContain("TooltipTrigger");
      expect(shellSource).toContain("TooltipContent");
      expect(shellSource).toContain('side="right"');
    });

    it("GIVEN el buscador rápido ⌘K THEN dispone de atajo de teclado, campo de búsqueda y selector de alumno", () => {
      expect(shellSource).toContain('data-testid="studio-quick-search-input"');
      expect(shellSource).toContain("⌘K");
      expect(shellSource).toContain('key.toLowerCase() === "k"');
      expect(shellSource).toContain("e.metaKey || e.ctrlKey");
      expect(shellSource).toContain("searchInputRef.current?.focus()");
      expect(shellSource).toContain("selectAlumno");
      expect(shellSource).toContain('e.key === "Enter"');
    });

    it("GIVEN viewport móvil 390px THEN se renderiza la barra inferior de 5 accesos y se oculta el FAB", () => {
      const html = renderToStaticMarkup(
        <StudioShell>
          <div>Contenido móvil</div>
        </StudioShell>
      );

      expect(html).toContain('data-testid="studio-mobile-bottom-nav"');
      expect(html).toContain('aria-label="Navegación inferior móvil"');
      expect(html).toContain("grid-cols-5");

      // 5 Accesos obligatorios
      expect(html).toContain('aria-label="Inicio"');
      expect(html).toContain('aria-label="Alumnos"');
      expect(html).toContain('aria-label="Agenda"');
      expect(html).toContain('aria-label="Mensajes"');
      expect(html).toContain('aria-label="Más"');

      // FAB flotante eliminado y convertido en Sheet derecho de 400px
      expect(chatFabSource).toContain("max-w-[400px]");
      expect(chatFabSource).not.toContain("Acceso flotante a mensajería");
      // Sidebar oculto en móvil (<768px)
      expect(shellSource).toContain("hidden md:flex flex-col");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. INICIO (UX-I)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("2. Vista Inicio (UX-I)", () => {
    it("GIVEN la franja de KPIs THEN renderiza exactamente las 4 tarjetas canónicas", () => {
      const html = renderToStaticMarkup(
        <BusinessKpiStrip
          kpis={DEMO_KPIS_NEGOCIO}
          sinRutina={4}
          totalAlumnos={40}
          sinEntrenarNombres={["Lucas Giménez", "Celeste Gerardi"]}
        />
      );

      expect(html).toContain('data-testid="kpi-ingresos"');
      expect(html).toContain('data-testid="kpi-cobrado"');
      expect(html).toContain('data-testid="kpi-activos"');
      expect(html).toContain('data-testid="kpi-alumnos-al-dia"');
      expect(html).toContain('data-testid="kpi-sin-rutina"');
      expect(html).toContain('data-testid="kpi-sin-entrenar"');

      expect(html).toContain("$800.000");
      expect(html).toContain("32 de 40");
      expect(html).toContain("4");
      expect(html).toContain("Sin entrenar");
      expect(html).toContain("+7 días");
    });

    it("GIVEN el selector de período THEN rangoPeriodo calcula semana, mes y trimestre exactos en hora AR", () => {
      const fecha = new Date("2026-11-05T15:00:00Z");

      const mes = rangoPeriodo("mes", fecha);
      expect(mes.desde).toBe("2026-11-01");
      expect(mes.hasta).toBe("2026-11-30");

      const semana = rangoPeriodo("semana", fecha);
      expect(semana.desde).toBe("2026-11-02");
      expect(semana.hasta).toBe("2026-11-08");

      const trimestre = rangoPeriodo("trimestre", fecha);
      expect(trimestre.desde).toBe("2026-10-01");
      expect(trimestre.hasta).toBe("2026-12-31");
    });

    it("GIVEN el bloque 'Para revisar hoy' THEN prioriza molestias articulares sobre cuotas vencidas", () => {
      const html = renderToStaticMarkup(<ParaRevisarHoy onSelectAlumno={vi.fn()} />);

      expect(html).toContain('data-testid="para-revisar-hoy-container"');
      // Contiene items de molestia y items de cuota
      expect(html).toContain('data-testid="revisar-item-molestia"');
      expect(html).toContain('data-testid="revisar-item-cuota"');

      // Las molestias aparecen antes que las cuotas en el DOM
      const indexMolestia = html.indexOf('data-testid="revisar-item-molestia"');
      const indexCuota = html.indexOf('data-testid="revisar-item-cuota"');
      expect(indexMolestia).toBeLessThan(indexCuota);
    });

    it("GIVEN el bloque 'Clases de hoy' THEN visualiza cupos de clases y atajos de contacto para atletas en riesgo", () => {
      const html = renderToStaticMarkup(
        <ClasesHoyAtajosChat
          fechaReferencia="2026-11-02T12:00:00-03:00"
          alumnosSinEntrenar={[{ id: "a-1", nombreCompleto: "Juan Pérez" }]}
          onOpenChat={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="clases-hoy-container"');
      expect(html).toContain('data-testid="clase-hoy-card"');
      expect(html).toContain('data-testid="seccion-sin-entrenar"');
      expect(html).toContain('data-testid="quick-contact-btn"');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. DIRECTORIO DE ALUMNOS (UX-D)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("3. Directorio de Alumnos (UX-D)", () => {
    const dataset = {
      alumnos: DEMO_GIMNASIO.alumnos,
      planes: DEMO_GIMNASIO.planes,
      dias: DEMO_GIMNASIO.dias,
      ejerciciosEnRutina: DEMO_GIMNASIO.ejerciciosEnRutina,
      ejercicios: DEMO_GIMNASIO.ejercicios,
    };

    it("GIVEN primer ingreso THEN el directorio se abre por defecto con 15 filas y paginación DataTable", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      expect(html).toContain('data-testid="alumnos-directory"');
      expect(html).toContain('aria-expanded="true"');

      // Exactamente 15 filas en la primera página
      const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
      expect(tbodyMatch).toBeTruthy();
      const trMatches = tbodyMatch && tbodyMatch[1] ? tbodyMatch[1].match(/<tr/g) || [] : [];
      expect(trMatches.length).toBe(15);

      // Leyenda accesible
      expect(html).toContain("Mostrando 15 de 40");
      expect(html).toContain("Página 1 de 3");
    });

    it("GIVEN la toolbar unificada THEN expone búsqueda, filtros de estado, chips de actividad y botón constructor", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      // Búsqueda por texto
      expect(html).toContain('placeholder="Buscar alumno"');
      // Filtros de estado de cuota
      // Chips "Etiqueta {n}" con el número en gris (objetivo Inicio.html)
      expect(html).toMatch(/Al día <span[^>]*>32<\/span>/);
      expect(html).toMatch(/Pago pendiente <span[^>]*>3<\/span>/);
      expect(html).toContain("Nuevos");
      // Chips de actividad
      expect(html).toContain('data-testid="filtro-actividad-chips"');
      expect(html).toContain('data-testid="filtro-actividad-funcional"');
      expect(html).toContain('data-testid="filtro-actividad-boxeo"');
      expect(html).toContain('data-testid="filtro-actividad-rutinas"');
      // Botón constructor
      expect(html).toContain('data-testid="open-routine-builder-btn"');
    });

    it("GIVEN badges semánticos con texto THEN no existen indicadores ambiguos sin etiqueta legible", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      // Badges semánticos con texto
      expect(html).toContain("Funcional");
      expect(html).toContain("Al día");
      expect(html).toContain("Nuevo");
      // Columna cuota tiene atributos de estado accesibles
      expect(html).toContain('data-testid="columna-cuota-actividad"');
      expect(html).toContain('role="status"');
    });

    it("GIVEN persistencia en localStorage THEN guarda 'gozster_directorio_alumnos_expanded'", () => {
      const viewSource = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
        "utf-8"
      );
      expect(viewSource).toContain('localStorage.setItem("gozster_directorio_alumnos_expanded"');
      expect(viewSource).toContain('localStorage.getItem("gozster_directorio_alumnos_expanded")');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. FICHA DE ALUMNO Y LAYOUT (UX-FICHA BASE)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("4. Ficha de Alumno y Layout Base (UX-Ficha Base)", () => {
    it("GIVEN la cabecera de la ficha THEN existe exactamente 1 botón con variante primaria ('Enviar mensaje')", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultDetailProps} />);

      const headerSection = html.substring(
        html.indexOf('data-testid="student-detail-header"'),
        html.indexOf('data-testid="student-detail-modular-canvas"')
      );

      const primaryClass = "bg-primary text-primary-foreground";
      const matches = headerSection.match(new RegExp(primaryClass, "g")) || [];
      expect(matches.length).toBe(1);

      expect(headerSection).toContain('data-testid="enviar-mensaje-btn"');
      expect(headerSection).toContain("Enviar mensaje");
    });

    it("GIVEN las acciones secundarias THEN usan variantes outline/ghost y el menú ⋯ despliega las 3 acciones requeridas", () => {
      const htmlClosed = renderToStaticMarkup(<StudentDetail {...defaultDetailProps} />);
      expect(htmlClosed).toContain("← Volver");
      expect(htmlClosed).toContain('data-testid="btn-asignar-rutina"');
      expect(htmlClosed).toContain('data-testid="student-header-menu-trigger"');

      const htmlOpen = renderToStaticMarkup(
        <StudentDetail {...defaultDetailProps} headerMenuOpen={true} />
      );
      expect(htmlOpen).toContain('data-testid="student-menu-editar-perfil"');
      expect(htmlOpen).toContain("Editar perfil");
      expect(htmlOpen).toContain('data-testid="student-menu-registrar-pago"');
      expect(htmlOpen).toContain("Registrar pago");
      expect(htmlOpen).toContain('data-testid="student-menu-exportar-ficha"');
      expect(htmlOpen).toContain("Exportar ficha");
    });

    it("GIVEN el canvas modular THEN el layout predeterminado opera en 2 columnas y persiste en localStorage", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultDetailProps} />);

      expect(html).toContain('data-testid="student-detail-modular-canvas"');
      expect(studentDetailSource).toContain("gozster_canvas_layout_");
      expect(studentDetailSource).toContain("lg:grid-cols-2");
      expect(studentDetailSource).toContain("localStorage.setItem");
      expect(studentDetailSource).toContain("localStorage.getItem");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. HIGIENE Y AUSENCIA DE ETIQUETAS TÉCNICAS DE DESARROLLO
  // ─────────────────────────────────────────────────────────────────────────────
  describe("5. Higiene de Copia y Cero Ruido Técnico", () => {
    it("GIVEN las vistas renderizadas de Shell, Inicio y Ficha THEN no contienen jerga técnica de desarrollo ni errores de render", () => {
      const htmlShell = renderToStaticMarkup(
        <StudioShell>
          <div>Contenido</div>
        </StudioShell>
      );
      const htmlInicio = renderToStaticMarkup(
        <CoachStudioView
          initialDataset={{
            alumnos: DEMO_GIMNASIO.alumnos,
            planes: DEMO_GIMNASIO.planes,
            dias: DEMO_GIMNASIO.dias,
            ejerciciosEnRutina: DEMO_GIMNASIO.ejerciciosEnRutina,
            ejercicios: DEMO_GIMNASIO.ejercicios,
          }}
        />
      );
      const htmlFicha = renderToStaticMarkup(<StudentDetail {...defaultDetailProps} />);

      const combinedText = `${htmlShell} ${htmlInicio} ${htmlFicha}`;

      // Jerga prohibida de desarrollo según especificación
      expect(combinedText).not.toContain("ADR-002");
      expect(combinedText).not.toContain("Columna Matriz");
      expect(combinedText).not.toContain("Touch targets");
      expect(combinedText).not.toContain("Cuadro 1.1");

      // Valores inválidos de JavaScript
      expect(combinedText).not.toMatch(/\bNaN\b/);
      expect(combinedText).not.toMatch(/\bundefined\b/);
      expect(combinedText).not.toContain("[object Object]");
    });
  });
});
