import * as React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { ClasesHoyAtajosChat } from "@/components/coach/clases-hoy-atajos-chat";
import { useClasesStore } from "@/store/use-clases-store";
import { useChatStore } from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import type { Clase } from "@/types/database.types";

describe("GOZS-393: Coach Studio: Vista Inicio - Bloque 'Clases de hoy' y Atajos de Chat", () => {
  const mockClases: Clase[] = [
    {
      id: "clase-1",
      horario_id: "horario-1",
      actividad: "FUNCIONAL",
      inicio: "2026-11-06T09:00:00Z",
      duracion_minutos: 60,
      capacidad: 15,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    },
    {
      id: "clase-2",
      horario_id: "horario-2",
      actividad: "BOXEO",
      inicio: "2026-11-06T18:00:00Z",
      duracion_minutos: 60,
      capacidad: 12,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    },
  ];

  const mockReservas = [
    { clase_id: "clase-2", estado: "ANOTADO" },
    { clase_id: "clase-2", estado: "ANOTADO" },
    { clase_id: "clase-2", estado: "ANOTADO" },
    { clase_id: "clase-2", estado: "CANCELADO" }, // No debe sumar
  ];

  beforeEach(() => {
    useClasesStore.setState({
      clases: [],
      agendaReservas: [],
      testAhora: "2026-11-06T12:00:00Z",
    });
    useChatStore.setState({
      selectedAlumnoId: null,
    });
    useCoachStudioStore.setState({
      chatAlumnoId: null,
      isChatOpen: false,
    });
  });

  it("GIVEN clases programadas para el día actual WHEN se visualiza la sección 'Clases de hoy' en /studio THEN cada tarjeta muestra horario de inicio, disciplina y cupos ocupados/totales", () => {
    const html = renderToString(
      <ClasesHoyAtajosChat
        clases={mockClases}
        reservas={mockReservas}
        fechaReferencia="2026-11-06T12:00:00Z"
      />
    );

    // Contenedor principal y título
    expect(html).toContain('data-testid="clases-hoy-container"');
    expect(html).toContain("Clases de hoy");
    expect(html).toContain('data-testid="clases-hoy-badge-count"');
    expect(html).toContain(">2<");

    // Tarjetas y detalles
    expect(html).toContain('data-testid="clases-hoy-list"');
    expect(html).toContain("Funcional");
    expect(html).toContain("(0/15)");

    expect(html).toContain("Boxeo");
    expect(html).toContain("(3/12)");

    // Link hacia agenda completa
    expect(html).toContain("/studio/agenda");
    expect(html).toContain("Ver agenda completa →");
  });

  it("GIVEN 0 clases programadas para la jornada THEN muestra EmptyState específico 'Sin clases programadas para hoy.'", () => {
    const html = renderToString(
      <ClasesHoyAtajosChat
        clases={[]}
        fechaReferencia="2026-11-06T12:00:00Z"
      />
    );

    expect(html).toContain('data-testid="clases-hoy-empty"');
    expect(html).toContain("Sin clases programadas para hoy.");
    expect(html).toContain("No hay actividades pautadas en la agenda de la jornada.");
    expect(html).toContain(">0<");
  });

  it("GIVEN alumnos identificados como 'Sin entrenar +7 días' WHEN se renderiza la sección THEN lista atletas en riesgo con días y botón de contacto rápido", () => {
    const alumnosEnRiesgo = [
      { id: "alumno-martin", nombreCompleto: "Martín Fierro", diasSinEntrenar: 10 },
      { id: "alumno-lucia", nombreCompleto: "Lucía Méndez", diasSinEntrenar: 8 },
    ];

    const html = renderToString(
      <ClasesHoyAtajosChat
        clases={mockClases}
        fechaReferencia="2026-11-06T12:00:00Z"
        alumnosSinEntrenar={alumnosEnRiesgo}
      />
    );

    expect(html).toContain('data-testid="seccion-sin-entrenar"');
    expect(html).toContain("Sin entrenar (+7 días)");
    expect(html).toContain("2 en riesgo");

    expect(html).toContain("Martín Fierro");
    expect(html).toContain("+10d");
    expect(html).toContain("Lucía Méndez");
    expect(html).toContain("+8d");

    expect(html).toContain('data-testid="quick-contact-btn"');
    expect(html).toContain("Contactar rápido →");
    expect(html).toContain('aria-label="Contactar a Martín Fierro"');
    expect(html).toContain('aria-label="Contactar a Lucía Méndez"');
  });

  it("GIVEN la acción de contacto rápido en openChatForAlumno WHEN se dispara THEN actualiza los stores de chat y studio sin alterar la vista principal", () => {
    // Verificar que openChatForAlumno preselecciona el alumno en useChatStore y abre el chat en useCoachStudioStore
    const targetAlumnoId = "demo-alumno-07-bautista";

    useCoachStudioStore.getState().openChatForAlumno(targetAlumnoId);

    expect(useChatStore.getState().selectedAlumnoId).toBe(targetAlumnoId);
    expect(useCoachStudioStore.getState().chatAlumnoId).toBe(targetAlumnoId);
    expect(useCoachStudioStore.getState().isChatOpen).toBe(true);
  });
});
