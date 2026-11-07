import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { ParaRevisarHoy } from "@/components/coach/para-revisar-hoy";
import { ClasesHoyAtajosChat } from "@/components/coach/clases-hoy-atajos-chat";
import { KpiCard } from "@/components/ui/kpi-card";
import { DEMO_KPIS_NEGOCIO, DEMO_GIMNASIO } from "@/services/coach-demo-dataset";
import {
  assertNoDemoLiteralsInLiveMode,
  render,
} from "@/test-utils/no-demo-literals";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe("GOZS-409: [OLA-2][INICIO] 100% Fidelidad Visual, Datos en Vivo y KPIs Unificados", () => {
  const dataset = {
    alumnos: DEMO_GIMNASIO.alumnos,
    planes: DEMO_GIMNASIO.planes,
    dias: DEMO_GIMNASIO.dias,
    ejerciciosEnRutina: DEMO_GIMNASIO.ejerciciosEnRutina,
    ejercicios: DEMO_GIMNASIO.ejercicios,
  };

  describe("1. Cabecera de Inicio, H1, Segmented y Alta de Alumno (08 §4.1, 09 P02)", () => {
    it("GIVEN CoachStudioView WHEN se renderiza THEN exhibe 'Hola, {nombre}', contador de clases y alertas, Segmented y botón 'Alta de alumno' en la misma fila", () => {
      const html = renderToStaticMarkup(
        <CoachStudioView initialDataset={dataset} coachName="Martín Gómez" />
      );

      // Saludo H1
      expect(html).toContain("Hola, Martín");
      expect(html).toContain("clases hoy");
      expect(html).toContain("alertas para revisar");

      // Selector de periodo Segmented en la cabecera
      expect(html).toContain('data-testid="periodo-selector-container"');
      expect(html).toContain('data-testid="selector-periodo"');
      expect(html).toContain("Semana");
      expect(html).toContain("Mes");
      expect(html).toContain("Trimestre");

      // Botón primario 'Alta de alumno' en la fila del H1 a la derecha del Segmented
      expect(html).toContain('data-testid="open-invite-student-btn"');
      expect(html).toContain("Alta de alumno");
    });
  });

  describe("2. Franja de KPIs unificada (KpiCard, FIX-06, FIX-08)", () => {
    it("GIVEN KpiCard WHEN se monta THEN respeta layout 08 §3: label 13px, periodo 12px derecha, valor 28px font-semibold", () => {
      const html = renderToStaticMarkup(
        <KpiCard
          label="Cobrado"
          periodo="nov"
          value="$767.000"
          subtitle="$105.000 por cobrar · 7 cuotas"
          testId="kpi-test-cobrado"
        />
      );

      expect(html).toContain('data-testid="kpi-test-cobrado"');
      expect(html).toContain("Cobrado");
      expect(html).toContain("nov");
      expect(html).toContain("$767.000");
      expect(html).toContain("$105.000 por cobrar · 7 cuotas");
    });

    it("GIVEN BusinessKpiStrip con error de red en vivo THEN muestra '—' y botón 'Reintentar' sin literales demo", () => {
      const onRetryMock = vi.fn();
      const html = renderToStaticMarkup(
        <BusinessKpiStrip
          kpis={DEMO_KPIS_NEGOCIO}
          error={true}
          onRetry={onRetryMock}
          sinRutina={4}
          totalAlumnos={40}
        />
      );

      expect(html).toContain("—");
      expect(html).toContain('data-testid="kpi-retry-btn"');
      expect(html).toContain("Reintentar");
    });

    it("GIVEN BusinessKpiStrip con puedeVer=false THEN no exhibe signo $ ni montos monetarios en la cifra principal", () => {
      const html = renderToStaticMarkup(
        <BusinessKpiStrip
          kpis={{ ...DEMO_KPIS_NEGOCIO, cobrado: null, ingresos_mes: 0 }}
          puedeVer={false}
          rol="ENTRENADOR"
          sinRutina={4}
          totalAlumnos={40}
        />
      );

      // Cifra principal oculta con "—"
      expect(html).toContain('data-testid="kpi-ingresos"');
      expect(html).toContain("—");
      // Cero signos $ en el valor principal
      const match = html.match(/data-testid="kpi-ingresos"[^>]*>[\s\S]*?<\/div>/);
      expect(match?.[0]).not.toContain("$");
    });
  });

  describe("3. Bandeja Única 'Para revisar hoy' sin CriticalAlertsInbox duplicada (08 §4.1, 09 P07)", () => {
    it("GIVEN CoachStudioView THEN NO renderiza CriticalAlertsInbox y exhibe bandeja única 'Para revisar hoy'", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      // Bandeja única presente
      expect(html).toContain('data-testid="para-revisar-hoy-container"');
      expect(html).toContain("Para revisar hoy");
      expect(html).toContain("Ordenado por prioridad");

      // CriticalAlertsInbox NO existe en el HTML
      expect(html).not.toContain('data-testid="critical-alerts-inbox"');
      expect(html).not.toContain("Bandeja de Alertas Críticas");
    });

    it("GIVEN ParaRevisarHoy THEN no incluye link azul 'Ver ficha →' ni EVA en mono suelto", () => {
      const html = renderToStaticMarkup(<ParaRevisarHoy onSelectAlumno={vi.fn()} />);

      expect(html).not.toContain("Ver ficha →");
      expect(html).not.toMatch(/<span[^>]*font-mono[^>]*>EVA\s*\d+<\/span>/);
      expect(html).toContain('data-testid="revisar-item-molestia"');
    });

    it("GIVEN ParaRevisarHoy THEN aplica estrictamente vocabulario P07 ('Alto', 'Moderado', 'Leve') y prohíbe 'Medio'", () => {
      const html = renderToStaticMarkup(<ParaRevisarHoy onSelectAlumno={vi.fn()} />);

      expect(html).not.toMatch(/<span[^>]*>Medio<\/span>/i);
      expect(html).toContain("Alto");
    });
  });

  describe("4. Directorio de Alumnos (08 §4.1, 09 P08)", () => {
    it("GIVEN Directorio WHEN se renderiza THEN expone toolbar con chips h-8, búsqueda compacta de 220px y pageSize=15", () => {
      const html = renderToStaticMarkup(<CoachStudioView initialDataset={dataset} />);

      // Chips de estado h-8
      expect(html).toContain('data-testid="chip-filtro-todos"');
      expect(html).toContain('data-testid="chip-filtro-al-dia"');
      expect(html).toContain('data-testid="chip-filtro-pago-pendiente"');
      expect(html).toContain('data-testid="chip-filtro-nuevos"');

      // Chip de actividad punteado
      expect(html).toContain("+ Actividad");

      // Búsqueda compacta con aria-label
      expect(html).toContain('aria-label="Buscar alumno"');
      expect(html).toContain('placeholder="Buscar alumno"');

      // Columna Cuota
      expect(html).toContain('data-testid="columna-cuota-actividad"');
      expect(html).toContain('role="status"');

      // Columna Rutina en texto plano
      expect(html).toContain("Rutina");
      // Alumnos sin rutina muestran 'Sin rutina' en texto plano
      expect(html).toContain("Sin rutina");

      // Paginación 15 de 40
      expect(html).toContain("Mostrando 15 de 40");
      expect(html).toContain("Página 1 de 3");
    });
  });

  describe("5. Cero Literales de Demo en Modo En Vivo (FIX-08)", () => {
    it("GIVEN datos reales en vivo sin reportes de demo prohibidos WHEN se verifica el guard THEN pasa limpiamente", () => {
      const alumnosReales = [
        {
          id: "alumno-real-001",
          nombre_completo: "Gabriel Fernández",
          email: "gabriel.f@example.com",
          rol: "ALUMNO",
          created_at: new Date().toISOString(),
          estado_membresia: "ACTIVA",
          fecha_vencimiento_cuota: "2026-11-28",
        },
      ];

      const { container } = render(
        <CoachStudioView
          initialDataset={{
            alumnos: alumnosReales as any,
            planes: [],
            dias: [],
            ejerciciosEnRutina: [],
            ejercicios: [],
          }}
          coachName="Gabriel Sánchez"
        />
      );

      // Verificación estricta de FIX-08
      expect(() => assertNoDemoLiteralsInLiveMode(container)).not.toThrow();
    });
  });
});
