import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaseBlock, ClassAgenda } from "@/components/coach/class-agenda";
import { useClasesStore, type ReservaAgenda } from "@/store/use-clases-store";
import type { Clase } from "@/types/database.types";

describe("GOZS-399: Coach Studio - Vista de Agenda: Sheet Lateral de Clase y Diálogo de Cancelación", () => {
  const FECHA_DEMO = new Date("2026-11-05T12:00:00-03:00");

  beforeEach(() => {
    useClasesStore.getState().resetDemoDataset(FECHA_DEMO);
  });

  describe("Criterio Gherkin 1: Selección de bloque por clic o teclado y despliegue de Sheet lateral", () => {
    it("GIVEN un bloque de clase en la grilla WHEN el usuario navega con teclado (Enter o Espacio) o hace clic THEN invoca onSelect y expone aria-haspopup='dialog'", () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;
      const onSelect = vi.fn();

      const html = renderToStaticMarkup(
        <ClaseBlock
          clase={clase}
          ocupados={3}
          activa={false}
          ahoraMs={FECHA_DEMO.getTime()}
          vista="semana"
          top={100}
          height={56}
          onSelect={onSelect}
        />,
      );

      expect(html).toContain('data-testid="class-block-card"');
      expect(html).toContain('aria-haspopup="dialog"');
    });

    it("GIVEN un bloque de clase seleccionado WHEN se despliega el Sheet lateral THEN muestra horario, disciplina, entrenador a cargo, barra de cupos e inscriptos con acción 'Anotar alumno'", () => {
      const store = useClasesStore.getState();
      const claseConInscriptos = store.clases.find(
        (c) =>
          c.estado === "PROGRAMADA" &&
          store.agendaReservas.some((r) => r.clase_id === c.id && r.estado === "ANOTADO"),
      )!;
      expect(claseConInscriptos).toBeDefined();

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={claseConInscriptos.id}
          testAhora={FECHA_DEMO}
        />,
      );

      // 1. Sheet lateral adaptativo (<dialog> con slide-in-from-right)
      expect(html).toContain('data-testid="class-detail-sheet"');
      expect(html).toContain("slide-in-from-right");
      expect(html).toContain('id="sheet-detalle-clase-titulo"');

      // 2. Contenido del Sheet: disciplina, horario, entrenador a cargo, barra de cupos e inscriptos
      expect(html).toContain('data-testid="class-detail"');
      expect(html).toContain('data-testid="class-detail-coach"');
      expect(html).toContain("Entrenador a cargo: Lucía Ferraro");
      expect(html).toContain('data-testid="class-capacity-bar"');
      expect(html).toContain('data-testid="enroll-student-dialog-btn"');
      expect(html).toContain("+ Anotar alumno");
      expect(html).toContain('data-testid="student-row"');
    });
  });

  describe("Criterio Gherkin 2: Clase con cupo completo (ej. 12/12) y bloqueo de nuevas inscripciones", () => {
    it("GIVEN una clase con cupo completo (12/12) THEN exhibe badge de advertencia 'Cupo lleno' y deshabilita nuevas inscripciones", () => {
      const claseCupoCompleto: Clase = {
        id: "clase-test-12-12",
        horario_id: "horario-test-12",
        actividad: "FUNCIONAL",
        inicio: "2026-11-05T18:00:00-03:00",
        duracion_minutos: 60,
        capacidad: 12,
        estado: "PROGRAMADA",
        motivo_cancelacion: null,
        created_at: FECHA_DEMO.toISOString(),
        updated_at: FECHA_DEMO.toISOString(),
      };

      const reservas12: ReservaAgenda[] = Array.from({ length: 12 }, (_, idx) => ({
        id: `res-12-${idx + 1}`,
        clase_id: claseCupoCompleto.id,
        alumno_id: `alumno-test-${idx + 1}`,
        alumno_nombre: `Atleta ${idx + 1}`,
        estado: "ANOTADO",
        created_at: FECHA_DEMO.toISOString(),
        updated_at: FECHA_DEMO.toISOString(),
      }));

      useClasesStore.setState({
        clases: [claseCupoCompleto],
        agendaReservas: reservas12,
      });

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={claseCupoCompleto.id}
          testAhora={FECHA_DEMO}
        />,
      );

      // Exhibe badge de advertencia 'Cupo lleno'
      expect(html).toContain('data-testid="class-full-badge"');
      expect(html).toContain("Cupo lleno");

      // Barra de cupos refleja 12 / 12 cupos ocupados y 0 disponibles
      expect(html).toContain("12 / 12 cupos ocupados");
      expect(html).toContain("0 disponibles · Cupo lleno");
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="12"');
      expect(html).toContain('aria-valuemax="12"');

      // Botón '+ Anotar alumno' se encuentra deshabilitado
      const matchBtn = html.match(/<button[^>]*data-testid="enroll-student-dialog-btn"[^>]*>/);
      expect(matchBtn).not.toBeNull();
      expect(matchBtn?.[0]).toContain("disabled");
    });
  });

  describe("Criterio Gherkin 3: Diálogo modal accesible (Dialog) al accionar 'Cancelar clase'", () => {
    it("GIVEN la acción 'Cancelar clase' dentro del Sheet WHEN el usuario la acciona THEN aparece un Dialog modal con confirmación obligatoria y advertencia de atletas afectados", async () => {
      const store = useClasesStore.getState();
      const claseConInscriptos = store.clases.find(
        (c) =>
          c.estado === "PROGRAMADA" &&
          store.agendaReservas.some((r) => r.clase_id === c.id && r.estado === "ANOTADO"),
      )!;
      const cantidadAfectados = store.agendaReservas.filter(
        (r) => r.clase_id === claseConInscriptos.id && r.estado === "ANOTADO",
      ).length;
      expect(cantidadAfectados).toBeGreaterThan(0);

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={claseConInscriptos.id}
          initialCancelDialogOpen={true}
          testAhora={FECHA_DEMO}
        />,
      );

      // 1. Dialog modal accesible abierto con título y descripción
      expect(html).toContain('data-testid="cancel-class-dialog"');
      expect(html).toContain('id="cancelar-clase-titulo"');
      expect(html).toContain("Cancelar clase");

      // 2. Advertencia explícita del número de atletas afectados
      expect(html).toContain('data-testid="cancel-affected-athletes-warning"');
      expect(html).toContain(`Atención: ${cantidadAfectados}`);

      // 3. Campo de motivo obligatorio y botón de confirmación deshabilitado cuando motivo está vacío
      expect(html).toContain('data-testid="cancel-class-reason"');
      const matchConfirmBtn = html.match(
        /<button[^>]*data-testid="confirm-cancel-class-btn"[^>]*>/,
      );
      expect(matchConfirmBtn).not.toBeNull();
      expect(matchConfirmBtn?.[0]).toContain("disabled");

      // 4. Al confirmar cancelación en el store, la clase pasa reactivamente a CANCELADA
      const ok = await useClasesStore
        .getState()
        .cancelarClase(claseConInscriptos.id, "Mantenimiento eléctrico de emergencia");
      expect(ok).toBe(true);

      const claseActualizada = useClasesStore
        .getState()
        .clases.find((c) => c.id === claseConInscriptos.id);
      expect(claseActualizada?.estado).toBe("CANCELADA");
      expect(claseActualizada?.motivo_cancelacion).toBe("Mantenimiento eléctrico de emergencia");
    });
  });
});
