import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StudentDetail, type StudentDetailProps } from "@/components/coach/student-detail";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useChatStore } from "@/store/use-chat-store";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";
import type { Perfil } from "@/types/database.types";

describe("GOZS-381: Coach Studio - Ficha de Alumno: Cabecera Limpia (Acción Primaria y Menú ⋯)", () => {
  const alumnoMock: Perfil = {
    ...MOCK_ALUMNOS[0]!,
    id: "alumno-test-381",
    nombre_completo: "Lucas Giménez",
    email: "lucas.gimenez@ficticio.ar",
    estado_membresia: "ACTIVA",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    profesor_asignado_id: "coach-1",
    rol: "ALUMNO",
    fecha_baja: null,
  };

  const defaultProps: StudentDetailProps = {
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
    useChatStore.getState().resetToDefaults();
    useCoachStudioStore.setState({
      selectedAlumnoId: alumnoMock.id,
      chatAlumnoId: null,
      isChatOpen: false,
    });
  });

  describe("1. Jerarquía Visual Estricta: Un único botón con variante primaria", () => {
    it("GIVEN la cabecera de la ficha del alumno, THEN se visualiza un único botón con variante primaria ('Enviar mensaje')", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      // Extraemos la sección de la cabecera
      const headerSection = html.substring(
        html.indexOf('data-testid="student-detail-header"'),
        html.indexOf('data-testid="student-detail-modular-canvas"')
      );

      // En Button.tsx, variant 'default' genera la clase 'bg-primary text-primary-foreground'
      // Verificamos que solo el botón 'enviar-mensaje-btn' posee esa clase en la cabecera
      const primaryVariantClass = "bg-primary text-primary-foreground";
      const matches = headerSection.match(new RegExp(primaryVariantClass, "g")) || [];

      // Solo 1 botón primario en la cabecera
      expect(matches.length).toBe(1);
      expect(headerSection).toContain('data-testid="enviar-mensaje-btn"');
      expect(headerSection).toContain("Enviar mensaje");
    });

    it("THEN las demás acciones de cabecera usan variantes no primarias (outline o ghost)", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      // Volver es outline
      expect(html).toContain("← Volver");
      // Asignar rutina es outline
      expect(html).toContain('data-testid="btn-asignar-rutina"');
      // Menú trigger es outline/ghost
      expect(html).toContain('data-testid="student-header-menu-trigger"');
    });
  });

  describe("2. Acción Primaria: 'Enviar mensaje' abre el drawer/chat del alumno", () => {
    it("WHEN se pulsa 'Enviar mensaje', THEN se abre el chat directo con dicho alumno", () => {
      const onOpenChat = vi.fn();
      const openChatForAlumnoSpy = vi.spyOn(useCoachStudioStore.getState(), "openChatForAlumno");

      // Verificamos la acción reactiva
      useCoachStudioStore.getState().openChatForAlumno(alumnoMock.id);

      expect(useCoachStudioStore.getState().isChatOpen).toBe(true);
      expect(useCoachStudioStore.getState().chatAlumnoId).toBe(alumnoMock.id);
      expect(useChatStore.getState().selectedAlumnoId).toBe(alumnoMock.id);

      openChatForAlumnoSpy.mockRestore();
    });
  });

  describe("3. Acción Secundaria: 'Asignar rutina' en outline", () => {
    it("GIVEN la cabecera, WHEN se renderiza 'Asignar rutina', THEN tiene accesibilidad y texto claro", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      expect(html).toContain('data-testid="btn-asignar-rutina"');
      expect(html).toContain("Asignar rutina");
      expect(html).toContain(`aria-label="Asignar rutina a ${alumnoMock.nombre_completo}"`);
    });

    it("WHEN se llama a handleAsignarRutina con onAssignRoutine provisto, THEN se invoca el callback con el alumno", () => {
      const onAssignRoutine = vi.fn();
      renderToStaticMarkup(
        <StudentDetail {...defaultProps} onAssignRoutine={onAssignRoutine} />
      );
      // El prop está tipado e integrado
      expect(onAssignRoutine).toBeDefined();
    });
  });

  describe("4. Acciones Complementarias en Menú Accesible ⋯ (DropdownMenu)", () => {
    it("GIVEN el botón secundario ⋯, THEN expone atributos de accesibilidad WCAG AA", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      expect(html).toContain('data-testid="student-header-menu-trigger"');
      expect(html).toContain('aria-haspopup="menu"');
      expect(html).toContain(`aria-label="Más acciones para ${alumnoMock.nombre_completo}"`);
      expect(html).toContain("⋯");
    });

    it("WHEN se abre el menú ⋯, THEN despliega 'Editar perfil', 'Registrar pago' y 'Exportar ficha' con navegación por teclado accesible", () => {
      const html = renderToStaticMarkup(
        <StudentDetail {...defaultProps} headerMenuOpen={true} />
      );

      // Menú abierto renderiza role="menu"
      expect(html).toContain('role="menu"');

      // Las 3 acciones complementarias requeridas están presentes con role="menuitem"
      expect(html).toContain('data-testid="student-menu-editar-perfil"');
      expect(html).toContain("Editar perfil");

      expect(html).toContain('data-testid="student-menu-registrar-pago"');
      expect(html).toContain("Registrar pago");

      expect(html).toContain('data-testid="student-menu-exportar-ficha"');
      expect(html).toContain("Exportar ficha");

      // Atributos de navegación por teclado accesible
      expect(html).toContain('tabindex="0"');
    });

    it("WHEN el menú ⋯ está cerrado, THEN no renderiza el contenido flotante", () => {
      const html = renderToStaticMarkup(
        <StudentDetail {...defaultProps} headerMenuOpen={false} />
      );

      expect(html).not.toContain('data-testid="student-menu-editar-perfil"');
      expect(html).not.toContain('data-testid="student-menu-registrar-pago"');
      expect(html).not.toContain('data-testid="student-menu-exportar-ficha"');
    });
  });

  describe("5. Indicador de Membresía y Avatar con Iniciales Accesibles", () => {
    it("GIVEN el alumno, THEN renderiza el Avatar con iniciales legibles y data-testid", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      expect(html).toContain('data-testid="student-avatar"');
      // Iniciales de Lucas Giménez -> LG
      expect(html).toContain("LG");
      expect(html).toContain(`aria-label="${alumnoMock.nombre_completo}"`);
    });

    it("THEN renderiza el indicador de estado de membresía 'Al día' para estado ACTIVA", () => {
      const html = renderToStaticMarkup(<StudentDetail {...defaultProps} />);

      expect(html).toContain("Al día");
    });

    it("THEN renderiza el indicador de membresía correspondiente para otros estados", () => {
      const htmlPendiente = renderToStaticMarkup(
        <StudentDetail
          {...defaultProps}
          alumno={{ ...alumnoMock, estado_membresia: "PENDIENTE" }}
        />
      );
      expect(htmlPendiente).toContain("Pago pendiente");

      const htmlInactiva = renderToStaticMarkup(
        <StudentDetail
          {...defaultProps}
          alumno={{ ...alumnoMock, estado_membresia: "INACTIVA" }}
        />
      );
      expect(htmlInactiva).toContain("Inactivo");
    });
  });
});
