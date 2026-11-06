import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  IslaTimelineRibbon,
  IslaActivityFeed,
  IslaAdministrativa,
} from "@/components/coach/student-detail/islas";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import type { KpisNegocio } from "@/lib/kpis-negocio";

describe("[GOZS-397]: Coach Studio: Ficha de Alumno - Islas de Sesiones, Actividad y Membresía", () => {
  // =========================================================================
  // CRITERIO 1: Isla de Sesiones y Detección de Nuevo PR
  // =========================================================================
  describe("Criterio 1: Isla de Sesiones (isla-timeline-ribbon.tsx)", () => {
    const mockSesionesConPR = [
      {
        sesion: {
          id: "ses-1",
          alumno_id: "al-1",
          dia_id: "d-1",
          fecha: "2026-10-10T10:00:00Z",
          duracion_minutos: 45,
          volumen_total_kg: 3200,
        },
        series: [
          {
            id: "s-1",
            sesion_id: "ses-1",
            ejercicio_id: "ej-1",
            ejercicioNombre: "Sentadilla Trasera",
            peso_kg: 95,
            reps_hechas: 6,
          },
        ],
      },
      {
        sesion: {
          id: "ses-2",
          alumno_id: "al-1",
          dia_id: "d-2",
          fecha: "2026-10-15T10:00:00Z",
          duracion_minutos: 50,
          volumen_total_kg: 4100,
        },
        series: [
          {
            id: "s-2",
            sesion_id: "ses-2",
            ejercicio_id: "ej-1",
            ejercicioNombre: "Sentadilla Trasera",
            peso_kg: 105,
            reps_hechas: 6,
          },
        ],
      },
    ];

    it("GIVEN la tira de sesiones WHEN se completa un entrenamiento con nuevo récord de carga THEN exhibe un badge visual de 'Nuevo PR' con el ejercicio correspondiente", () => {
      const html = renderToStaticMarkup(
        <IslaTimelineRibbon
          historialCargas={mockSesionesConPR as any}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      // Verificación de contenedor de sesiones y nodos
      expect(html).toContain('data-testid="isla-timeline-ribbon"');
      expect(html).toContain('data-testid="ribbon-node"');

      // Verificación de badge 'Nuevo PR'
      expect(html).toContain('data-testid="ribbon-node-pr"');
      expect(html).toContain("Nuevo PR");

      // Verificación de accesibilidad del badge y ejercicio correspondiente
      expect(html).toContain('aria-label="Nuevo PR: Sentadilla Trasera"');
      expect(html).toContain("Sentadilla");
      expect(html).toContain("105kg");
    });

    it("exhibe tira horizontal compacta con fecha, duración y volumen relativo en toneladas", () => {
      const html = renderToStaticMarkup(
        <IslaTimelineRibbon
          historialCargas={mockSesionesConPR as any}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      // Duración y volumen relativo (4.1t)
      expect(html).toContain("50m");
      expect(html).toContain("4.1t");
      expect(html).toContain("2 sesiones");
    });
  });

  // =========================================================================
  // CRITERIO 2: Isla de Actividad y Accesibilidad Semántica
  // =========================================================================
  describe("Criterio 2: Isla de Actividad (isla-activity-feed.tsx)", () => {
    it("GIVEN el feed de actividad THEN lista los eventos cronológicos recientes con iconos semánticos accesibles", () => {
      const html = renderToStaticMarkup(
        <IslaActivityFeed
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isRailCollapsed={false}
          onToggleRail={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="isla-activity-feed"');
      expect(html).toContain('data-testid="activity-feed-date-group"');
      expect(html).toContain('data-testid="activity-feed-event-item"');

      // Verificación de iconos semánticos con roles y etiquetas accesibles
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Sesión completada"');
      expect(html).toContain('aria-label="Mensaje enviado"');
      expect(html).toContain('aria-label="Pago confirmado"');
      expect(html).toContain('aria-label="Cambio de rutina"');
      expect(html).toContain('aria-label="Alerta de dolor"');

      // Título limpio shadcn sin jerga
      expect(html).toContain("Actividad");
      expect(html).not.toContain("Bitácora Omnicanal (Feed)");
    });

    it("soporta repliegue a riel lateral de 56px con persistencia visual", () => {
      const htmlRail = renderToStaticMarkup(
        <IslaActivityFeed
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          isRailCollapsed={true}
          onToggleRail={vi.fn()}
        />
      );

      expect(htmlRail).toContain('data-testid="activity-feed-rail"');
      expect(htmlRail).toContain("w-14");
      expect(htmlRail).toContain('data-testid="toggle-collapse-feed"');
    });
  });

  // =========================================================================
  // CRITERIO 3: Isla de Membresía / Administrativa alineada con KpisNegocio
  // =========================================================================
  describe("Criterio 3: Isla Administrativa y de Membresía (isla-administrativa.tsx)", () => {
    const mockKpis: KpisNegocio = {
      cobrado: 767000,
      porCobrar: 105000,
      vencido: 235000,
      facturado: 1107000,
      tasaCobroPct: 69,
      ingresos_presencial: 500000,
      ingresos_online: 267000,
      alumnos_activos: 32,
      alumnos_al_dia: 29,
      alumnosAlDia: 29,
      alumnos_morosos: 3,
      alumnosMorosos: 3,
      sin_entrenar_7d_ids: [],
      altas_mes: 4,
      bajas_mes: 2,
      ingresos_mes: 767000,
      ingresos_variacion_pct: 12,
      ingresos_mes_anterior_label: "octubre",
      ingresos_ultimos_6_meses: [600000, 650000, 700000, 720000, 750000, 767000],
      a_cobrar: 105000,
      cobranza_pct: 69,
      cobranza_faltante: 105000,
      cobranza_vencidas: 3,
    };

    it("GIVEN la isla de membresía THEN exhibe el plan activo, vencimiento y estado de cobro alineado con KpisNegocio", () => {
      const html = renderToStaticMarkup(
        <IslaAdministrativa
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          planActivo="Pase libre · Funcional + Boxeo"
          monto="$40.000"
          fechaVencimiento="26 nov"
          estadoCobro="PAGADO"
          detalleCobro="Pagado el 1 nov por transferencia · vence 26 nov"
          kpisNegocio={mockKpis}
          onRegistrarPago={vi.fn()}
        />
      );

      // Verificación de contenedor y título
      expect(html).toContain('data-testid="isla-administrativa"');
      expect(html).toContain("Membresía");

      // Plan activo, vencimiento y monto
      expect(html).toContain('data-testid="membresia-plan-activo"');
      expect(html).toContain("Pase libre · Funcional + Boxeo");
      expect(html).toContain('data-testid="membresia-vencimiento-estado"');
      expect(html).toContain("vence 26 nov");
      expect(html).toContain('data-testid="membresia-monto"');
      expect(html).toContain("$40.000");

      // Estado de cobro alineado a KpisNegocio (Al día)
      expect(html).toContain('data-testid="badge-estado-cobro"');
      expect(html).toContain("Al día");

      // Accesos directos a 'Registrar pago' e 'Historial de pagos'
      expect(html).toContain('data-testid="btn-registrar-pago"');
      expect(html).toContain("Registrar pago");
      expect(html).toContain('data-testid="btn-historial-pagos"');
      expect(html).toContain("Historial de pagos");
    });

    it("refleja estado 'Vencido' coherentemente cuando la cuota está en mora", () => {
      const html = renderToStaticMarkup(
        <IslaAdministrativa
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          planActivo="Rutina online"
          monto="$20.000"
          fechaVencimiento="18 oct"
          estadoCobro="VENCIDO"
          detalleCobro="Cuota vencida · venció hace 18 días"
          kpisNegocio={mockKpis}
        />
      );

      expect(html).toContain("Vencido");
      expect(html).toContain("Cuota vencida");
      expect(html).toContain("$20.000");
    });

    it("preserva navegación por pestañas de gestión comercial (Cuota, Contratación, Staff, Anamnesis)", () => {
      const html = renderToStaticMarkup(
        <IslaAdministrativa
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          suscripcionNode={<div data-testid="sub-suscripcion">Detalle Cuota</div>}
          historialPagosNode={<div data-testid="sub-historial">Tabla de Pagos</div>}
        />
      );

      expect(html).toContain("Cuota &amp; Historial");
      expect(html).toContain("Contratación &amp; Renovación");
      expect(html).toContain("Staff &amp; Chat");
      expect(html).toContain("Nivel de Vista &amp; Anamnesis");
      expect(html).toContain("Detalle Cuota");
    });
  });
});
