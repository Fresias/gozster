import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaseBlock, ClassAgenda } from "@/components/coach/class-agenda";
import { useClasesStore } from "@/store/use-clases-store";
import type { Clase } from "@/types/database.types";
import { supabase } from "@/lib/supabase/client";

describe("GOZS-419: Agenda: Diálogo unificado 'Editar Clase' (actividad, fecha, horario, cupo)", () => {
  const FECHA_DEMO = new Date("2026-11-05T12:00:00-03:00");

  beforeEach(() => {
    useClasesStore.getState().resetDemoDataset(FECHA_DEMO);
  });

  describe("Criterio Gherkin 1: Acceso a 'Editar clase' desde la grilla semanal y desde el Sheet lateral", () => {
    it("GIVEN cualquier clase en la grilla semanal WHEN se renderiza ClaseBlock THEN exhibe la acción accesible 'Editar clase'", () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;
      const onSelect = vi.fn();
      const onEdit = vi.fn();

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
          onEdit={onEdit}
        />
      );

      expect(html).toContain('data-testid="class-block-card"');
      expect(html).toContain('data-testid="edit-class-grid-btn"');
      expect(html).toContain("Editar clase");
    });

    it("GIVEN una clase abierta en el Sheet lateral de class-agenda.tsx THEN exhibe el botón 'Editar clase' en las acciones y en ajustes", () => {
      const store = useClasesStore.getState();
      const clase = store.clases.find((c) => c.estado === "PROGRAMADA")!;
      expect(clase).toBeDefined();

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={clase.id}
          testAhora={FECHA_DEMO}
        />
      );

      // Botón principal de edición en la barra de acciones de la clase
      expect(html).toContain('data-testid="edit-class-dialog-btn"');
      expect(html).toContain(">Editar clase<");

      // Botón de edición completa en los ajustes de la clase
      expect(html).toContain('data-testid="edit-class-btn"');
      expect(html).toContain("Edición completa");
    });
  });

  describe("Criterio Gherkin 2: Diálogo accesible 'Editar clase' con campos precargados", () => {
    it("GIVEN una clase seleccionada WHEN se abre el diálogo de edición THEN contiene todos los campos precargados: actividad, fecha, horario, duración y cupo", () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;
      expect(clase).toBeDefined();

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={clase.id}
          initialEditDialogOpen={true}
          testAhora={FECHA_DEMO}
        />
      );

      // Diálogo modal accesible abierto
      expect(html).toContain('data-testid="edit-class-dialog"');
      expect(html).toContain('id="editar-clase-titulo"');
      expect(html).toContain("Editar clase");
      expect(html).toContain('id="editar-clase-descripcion"');

      // Campos precargados
      expect(html).toContain('data-testid="edit-class-activity"');
      expect(html).toContain(`value="${clase.actividad}"`);

      expect(html).toContain('data-testid="edit-class-date"');
      expect(html).toContain('data-testid="edit-class-time"');
      expect(html).toContain('data-testid="edit-class-duration"');
      expect(html).toContain(`value="${clase.duracion_minutos}"`);

      // Cupo flexible y checkbox sin límite
      expect(html).toContain('data-testid="edit-class-unlimited-checkbox"');
      if (clase.capacidad === null) {
        expect(html).toContain("checked");
      } else {
        expect(html).toContain('data-testid="edit-class-capacity"');
        expect(html).toContain(`value="${clase.capacidad}"`);
      }

      // Botón de confirmación con texto exacto 'Guardar cambios'
      expect(html).toContain('data-testid="edit-class-submit"');
      expect(html).toContain("Guardar cambios");
      expect(html).toContain('data-testid="edit-class-cancel-btn"');
      expect(html).toContain("Cancelar");
    });

    it("GIVEN una clase con cupo explícito WHEN se abre el diálogo de edición THEN precarga el input numérico con dicho cupo", () => {
      const store = useClasesStore.getState();
      const claseConCupo: Clase = {
        ...store.clases[0]!,
        id: "clase-cupo-test-10",
        capacidad: 10,
      };

      const html = renderToStaticMarkup(
        <ClassAgenda
          clases={[claseConCupo]}
          initialSheetOpen={true}
          initialClaseId={claseConCupo.id}
          initialEditDialogOpen={true}
          testAhora={FECHA_DEMO}
        />
      );

      expect(html).toContain('data-testid="edit-class-capacity"');
      expect(html).toContain('value="10"');
    });
  });

  describe("Criterio Gherkin 3: Modificación y persistencia en store y Supabase", () => {
    it("WHEN el entrenador modifica los valores y guarda cambios THEN se actualiza la clase en use-clases-store y se sincroniza reactivamente", async () => {
      const store = useClasesStore.getState();
      const claseOriginal = store.clases.find((c) => c.estado === "PROGRAMADA")!;
      expect(claseOriginal).toBeDefined();

      const nuevaFechaHora = "2026-11-06T19:30:00-03:00";
      const nuevoIso = new Date(nuevaFechaHora).toISOString();

      const ok = await store.actualizarClase(claseOriginal.id, {
        actividad: "BOXEO",
        inicio: nuevoIso,
        duracion_minutos: 90,
        capacidad: 15,
      });

      expect(ok).toBe(true);

      const claseActualizada = useClasesStore
        .getState()
        .clases.find((c) => c.id === claseOriginal.id);

      expect(claseActualizada).toBeDefined();
      expect(claseActualizada?.actividad).toBe("BOXEO");
      expect(claseActualizada?.inicio).toBe(nuevoIso);
      expect(claseActualizada?.duracion_minutos).toBe(90);
      expect(claseActualizada?.capacidad).toBe(15);
    });

    it("WHEN se modifica una clase a sin límite de cupo THEN capacidad pasa a null y se remueve de sinCupo", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      // Forzar saturación
      useClasesStore.setState({ sinCupo: [clase.id] });
      expect(useClasesStore.getState().sinCupo).toContain(clase.id);

      const ok = await store.actualizarClase(clase.id, {
        capacidad: null,
      });

      expect(ok).toBe(true);
      const actualizada = useClasesStore.getState().clases.find((c) => c.id === clase.id);
      expect(actualizada?.capacidad).toBeNull();
      expect(useClasesStore.getState().sinCupo).not.toContain(clase.id);
    });

    it("GIVEN el método alias editarClase WHEN se invoca THEN produce el mismo resultado que actualizarClase", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[1]!;

      const ok = await store.editarClase(clase.id, {
        duracion_minutos: 45,
      });

      expect(ok).toBe(true);
      const editada = useClasesStore.getState().clases.find((c) => c.id === clase.id);
      expect(editada?.duracion_minutos).toBe(45);
    });
  });

  describe("Criterio Gherkin 4: Cumplimiento de tokens visuales y estética vigente", () => {
    it("cumple tokens de diseño: rounded-lg en botones, rounded-2xl en modal card, border-border y sin shadow-m3-*", () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={clase.id}
          initialEditDialogOpen={true}
          testAhora={FECHA_DEMO}
        />
      );

      // Clases y tokens Shadcn / Tailwind
      expect(html).toContain("rounded-2xl");
      expect(html).toContain("border-border");
      expect(html).toContain("bg-card");
      expect(html).not.toContain("shadow-m3-");
    });
  });
});
