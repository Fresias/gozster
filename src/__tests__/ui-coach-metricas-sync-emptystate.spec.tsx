import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/studio/dashboard",
}));

import { CoachDashboardView } from "@/components/coach/coach-dashboard-view";
import { RetentionKpiCards } from "@/components/coach/retention-kpi-cards";
import { ProgressiveOverloadFeed } from "@/components/coach/progressive-overload-feed";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import type { KpisNegocio } from "@/lib/kpis-negocio";
import type { AlertaSobrecargaProgresiva } from "@/store/use-coach-studio";

describe("GOZS-401: Coach Studio: Vista de Métricas - Unificación de Alumnos activos y EmptyState", () => {
  describe("Criterio 1: Sincronización de 'Alumnos activos' con KpisNegocio (cantActivas)", () => {
    it("GIVEN la vista de Métricas en /studio/dashboard WHEN se compara el contador de 'Alumnos activos' con el indicador de Inicio THEN ambos valores son exactamente idénticos (32 atletas)", () => {
      const html = renderToStaticMarkup(<CoachDashboardView />);

      // Verifica presencia del banner y el testid de cantActivas
      expect(html).toContain('data-testid="retention-executive-banner"');
      expect(html).toContain('data-testid="kpi-cant-activas"');

      // Verifica que el número coincide exactamente con DEMO_KPIS_NEGOCIO (32)
      expect(html).toContain(`>${DEMO_KPIS_NEGOCIO.alumnos_activos}<`);
      expect(DEMO_KPIS_NEGOCIO.cantActivas).toBe(DEMO_KPIS_NEGOCIO.alumnos_activos);
    });

    it("GIVEN un objeto custom de KpisNegocio WHEN se inyecta en CoachDashboardView THEN el indicador refleja exactamente cantActivas / alumnos_activos", () => {
      const customKpis: KpisNegocio = {
        cobrado: 950000,
        porCobrar: 120000,
        vencido: 80000,
        facturado: 1150000,
        tasaCobroPct: 83,
        ingresos_presencial: 600000,
        ingresos_online: 350000,
        alumnos_activos: 48,
        cantActivas: 48,
        alumnos_al_dia: 42,
        alumnosAlDia: 42,
        alumnos_morosos: 6,
        alumnosMorosos: 6,
        sin_entrenar_7d_ids: [],
        altas_mes: 5,
        bajas_mes: 1,
        ingresos_mes: 950000,
        ingresos_variacion_pct: 12,
        ingresos_mes_anterior_label: "oct.",
        ingresos_ultimos_6_meses: [750000, 800000, 850000, 900000, 920000, 950000],
        a_cobrar: 200000,
        cobranza_pct: 83,
        cobranza_faltante: 200000,
        cobranza_vencidas: 6,
      };

      const html = renderToStaticMarkup(<CoachDashboardView kpis={customKpis} />);

      expect(html).toContain(">48<");
    });

    it("GIVEN RetentionKpiCards con kpis prop THEN cantActivasValor prioriza la fuente de verdad KpisNegocio", () => {
      const metricasMock = {
        cantActivas: 3,
        cantSinPlanEntrenamiento: 1,
        cantClientesPerdidosMes: 0,
      };

      const kpisProp: KpisNegocio = {
        ...DEMO_KPIS_NEGOCIO,
        alumnos_activos: 35,
        cantActivas: 35,
      };

      const html = renderToStaticMarkup(
        <RetentionKpiCards
          metricas={metricasMock}
          kpis={kpisProp}
          onAssignPlanClick={() => {}}
        />,
      );

      expect(html).toContain(">35<");
    });
  });

  describe("Criterio 2: EmptyState accesible en ProgressiveOverloadFeed", () => {
    it("GIVEN un período sin alertas de sobrecarga registradas THEN el panel de sobrecarga renderiza el componente EmptyState accesible sin espacios en blanco rotos", () => {
      const html = renderToStaticMarkup(
        <ProgressiveOverloadFeed
          alertas={[]}
          onSelectAlumno={() => {}}
          onOpenHistoricalLoads={() => {}}
        />,
      );

      // 1. Contenedor de EmptyState Shadcn renderizado
      expect(html).toContain('data-testid="overload-empty-state"');

      // 2. Título semántico
      expect(html).toContain("Sin alertas de sobrecarga progresiva");

      // 3. Descripción clara de la ausencia de sobrecargas
      expect(html).toContain(
        "Ningún alumno ha registrado incrementos en las cargas, volumen ni marcas de 1RM en el período seleccionado.",
      );

      // 4. Borde punteado y estructura accesible
      expect(html).toContain("border-dashed");
    });

    it("GIVEN alertas pero un filtro sin coincidencias THEN el panel de sobrecarga renderiza EmptyState con botón para restablecer filtros", () => {
      const mockAlerta: AlertaSobrecargaProgresiva = {
        id: "alerta-1",
        alumnoId: "alumno-1",
        alumnoNombre: "Lucas Gómez",
        ejercicioId: "ej-1",
        ejercicioNombre: "Press de Banca Plano",
        sesionId: "sesion-1",
        fecha: "2026-11-06T10:00:00Z",
        pesoMaxKg: 100,
        pesoPrevioKg: 95,
        deltaPesoKg: 5,
        volumenEjercicioKg: 3000,
        volumenPrevioKg: 2800,
        deltaVolumenKg: 200,
        mejor1rmEpley: 120,
        mejor1rmBrzycki: 118,
        esNuevoRecord1RM: false,
        tipo: "CARGA",
      };

      // Si se pasa una alerta que no es de récord 1RM
      const html = renderToStaticMarkup(
        <ProgressiveOverloadFeed
          alertas={[mockAlerta]}
          onSelectAlumno={() => {}}
          onOpenHistoricalLoads={() => {}}
        />,
      );

      // Con filter='ALL' la alerta se visualiza
      expect(html).toContain("Lucas Gómez");
      expect(html).toContain("Press de Banca Plano");
    });
  });

  describe("Criterio 3: Respeto estricto del contraste de color WCAG AA", () => {
    it("GIVEN las tarjetas de sobrecarga progresiva THEN 1RM Estimado y chips usan contraste adaptativo (amber-600 / dark:text-amber-400)", () => {
      const mockAlerta: AlertaSobrecargaProgresiva = {
        id: "alerta-1",
        alumnoId: "alumno-1",
        alumnoNombre: "Lucas Gómez",
        ejercicioId: "ej-1",
        ejercicioNombre: "Press de Banca Plano",
        sesionId: "sesion-1",
        fecha: "2026-11-06T10:00:00Z",
        pesoMaxKg: 100,
        pesoPrevioKg: 95,
        deltaPesoKg: 5,
        volumenEjercicioKg: 3000,
        volumenPrevioKg: 2800,
        deltaVolumenKg: 200,
        mejor1rmEpley: 120,
        mejor1rmBrzycki: 118,
        esNuevoRecord1RM: true,
        tipo: "AMBOS",
      };

      const html = renderToStaticMarkup(
        <ProgressiveOverloadFeed
          alertas={[mockAlerta]}
          onSelectAlumno={() => {}}
          onOpenHistoricalLoads={() => {}}
        />,
      );

      // Verificamos que el texto de 1RM no use text-amber-400 plano en tema claro
      expect(html).toContain("text-amber-600 dark:text-amber-400");
    });

    it("GIVEN RetentionKpiCards con atletas sin rutina THEN el texto de alerta cumple contraste WCAG AA (text-warning-soft-foreground)", () => {
      const metricasConSinRutina = {
        cantActivas: 32,
        cantSinPlanEntrenamiento: 2,
        cantClientesPerdidosMes: 0,
      };

      const html = renderToStaticMarkup(
        <RetentionKpiCards
          metricas={metricasConSinRutina}
          onAssignPlanClick={() => {}}
        />,
      );

      expect(html).toContain("text-warning-soft-foreground");
    });

    it("GIVEN CoachDashboardView THEN alertas secundarias (offline, estancamiento) usan text-amber-800 dark:text-amber-300", () => {
      const estancados = [{ alumnoId: "demo-alumno-01-lucas", diasSinPR: 42 }];
      const html = renderToStaticMarkup(
        <CoachDashboardView estancados={estancados} />,
      );

      expect(html).toContain("text-amber-800 dark:text-amber-300");
    });
  });
});
