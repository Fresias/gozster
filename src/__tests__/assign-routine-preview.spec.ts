import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PLANTILLA_ADAPTACION_ID,
  DIA_ADAPTACION_ID,
  PLANTILLAS_GENERICAS,
  obtenerPlantillasGenericas,
  obtenerPlantillaGenericaPorId,
} from "@/services/plantillas-genericas";
import {
  AssignRoutinePreviewModal,
  type AssignRoutinePreviewModalProps,
} from "@/components/coach/assign-routine-preview-modal";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { asignarRutinaAAlumno } from "@/services/rutinas-service";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import type { Perfil } from "@/types/database.types";

vi.mock("@/services/rutinas-service", () => ({ asignarRutinaAAlumno: vi.fn() }));
vi.mock("@/services/alumnos-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/alumnos-service")>()),
  fetchLiveDatasetFromSupabase: vi.fn(),
}));

const mockAlumnoSinRutina: Perfil = {
  id: "alumno-sin-rutina-01",
  email: "alumno.prueba@gozster.com",
  nombre_completo: "Camila Velázquez",
  rol: "ALUMNO",
  estado_membresia: "ACTIVA",
  profesor_asignado_id: "profesor-01",
  fecha_baja: null,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const renderModalHtml = (props: AssignRoutinePreviewModalProps) =>
  renderToStaticMarkup(createElement(AssignRoutinePreviewModal, props));

describe("GOZS-245: 'Asignar rutina' abre preview de rutinas genéricas con confirmación", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ pendingEvents: [], isOnline: true });
  });

  // --------------------------------------------------------------------------
  // 1. CATÁLOGO DE PLANTILLAS GENÉRICAS
  // --------------------------------------------------------------------------
  describe("1. Catálogo de Plantillas Genéricas (PR 231 / GOZS-228 sync)", () => {
    it("incluye la plantilla global de adaptación con su ID canónico y metadatos", () => {
      const plantillas = obtenerPlantillasGenericas();
      expect(plantillas.length).toBeGreaterThanOrEqual(1);

      const adaptacion = plantillas.find((p) => p.id === PLANTILLA_ADAPTACION_ID);
      expect(adaptacion).toBeDefined();
      expect(adaptacion?.nombre).toBe("Adaptación - Primer día de gimnasio");
      expect(adaptacion?.categoria).toBe("Adaptación Full Body");
      expect(adaptacion?.comentarios).toContain("cargas livianas");
    });

    it("la plantilla de adaptación contiene 1 día con los 5 ejercicios prescritos", () => {
      const adaptacion = obtenerPlantillaGenericaPorId(PLANTILLA_ADAPTACION_ID);
      expect(adaptacion).toBeDefined();
      expect(adaptacion?.dias).toHaveLength(1);

      const dia1 = adaptacion?.dias[0];
      expect(dia1?.id).toBe(DIA_ADAPTACION_ID);
      expect(dia1?.nombre).toBe("Día 1: Adaptación Full Body");
      expect(dia1?.ejercicios).toHaveLength(5);

      const nombres = dia1?.ejercicios.map((e) => e.nombre);
      expect(nombres).toEqual([
        "Prensa de Piernas",
        "Jalón al Pecho",
        "Press de Pecho en Máquina",
        "Remo en Máquina",
        "Plancha",
      ]);

      // Verificar series y repeticiones de aclimatación
      expect(dia1?.ejercicios[0]?.series).toBe(2);
      expect(dia1?.ejercicios[0]?.repeticiones).toBe("12");
      expect(dia1?.ejercicios[0]?.descanso_segundos).toBe(90);
      expect(dia1?.ejercicios[0]?.rpe_objetivo).toBe(5.0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. STORE ACTION: asignarPlanDesdePlantilla
  // --------------------------------------------------------------------------
  describe("2. useCoachStudioStore.asignarPlanDesdePlantilla (RPC asignar_rutina_a_alumno)", () => {
    it("asigna vía RPC, refresca planes y devuelve el clon ACTIVO del alumno", async () => {
      const store = useCoachStudioStore.getState();
      const alumnoId = mockAlumnoSinRutina.id;
      const plan = {
        id: "plan-clon-01",
        profesor_id: "profesor-01",
        alumno_id: alumnoId,
        nombre: "Adaptación - Primer día de gimnasio",
        estado: "ACTIVO",
        comentarios: null,
        fecha_inicio: "2026-10-29T10:00:00Z",
        fecha_fin: null,
        tipo: "DE_ALUMNO",
        etiqueta: null,
        plan_origen_id: PLANTILLA_ADAPTACION_ID,
        created_at: "2026-10-29T10:00:00Z",
        updated_at: "2026-10-29T10:00:00Z",
      } as const;
      vi.mocked(asignarRutinaAAlumno).mockResolvedValue(plan.id);
      vi.mocked(fetchLiveDatasetFromSupabase).mockResolvedValue({
        alumnos: [mockAlumnoSinRutina],
        planes: [plan],
        dias: [],
        ejerciciosEnRutina: [],
        ejercicios: [],
      });
      useCoachStudioStore.setState({ alumnos: [mockAlumnoSinRutina, ...store.alumnos] });

      const nuevoPlan = await store.asignarPlanDesdePlantilla(alumnoId, PLANTILLA_ADAPTACION_ID);

      expect(asignarRutinaAAlumno).toHaveBeenCalledWith(PLANTILLA_ADAPTACION_ID, alumnoId);
      expect(nuevoPlan.id).toBe(plan.id);
      expect(nuevoPlan.estado).toBe("ACTIVO");
      expect(nuevoPlan.plan_origen_id).toBe(PLANTILLA_ADAPTACION_ID);

      const statePost = useCoachStudioStore.getState();
      expect(statePost.planes.some((p) => p.id === plan.id)).toBe(true);
      expect(statePost.toast?.type).toBe("success");
      expect(statePost.toast?.message).toContain(mockAlumnoSinRutina.nombre_completo);
    });

    it("propaga el error humano de la RPC sin tocar el estado", async () => {
      vi.mocked(asignarRutinaAAlumno).mockRejectedValue(new Error("La rutina ya no existe"));
      await expect(
        useCoachStudioStore.getState().asignarPlanDesdePlantilla(mockAlumnoSinRutina.id, "x"),
      ).rejects.toThrow("La rutina ya no existe");
    });
  });

  // --------------------------------------------------------------------------
  // 3. COMPONENTE AssignRoutinePreviewModal: GHERKIN FLOW & RENDER
  // --------------------------------------------------------------------------
  describe("3. AssignRoutinePreviewModal (Gherkin: Preview -> Confirmación -> Asignación)", () => {
    it("GIVEN un alumno sin rutina WHEN se abre el modal THEN renderiza el preview de la plantilla genérica y sus 5 ejercicios", () => {
      const onConfirmAssign = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      const html = renderModalHtml({
        isOpen: true,
        onClose,
        alumno: mockAlumnoSinRutina,
        onConfirmAssign,
      });

      // Header con nombre de alumno
      expect(html).toContain("Asignar Rutina a Camila Velázquez");

      // Selector con plantilla de adaptación
      expect(html).toContain(`data-testid="opcion-plantilla-${PLANTILLA_ADAPTACION_ID}"`);
      expect(html).toContain("Adaptación Full Body");

      // Previsualización y ejercicios
      expect(html).toContain('data-testid="preview-rutina-generica"');
      expect(html).toContain("Prensa de Piernas");
      expect(html).toContain("Jalón al Pecho");
      expect(html).toContain("Press de Pecho en Máquina");
      expect(html).toContain("Remo en Máquina");
      expect(html).toContain("Plancha");

      // Botones de acción del paso 1
      expect(html).toContain('data-testid="btn-continuar-confirmacion"');
      expect(html).toContain('data-testid="btn-cancelar-preview"');

      // No se ejecuta la asignación al renderizar el preview
      expect(onConfirmAssign).not.toHaveBeenCalled();
    });

    it("no renderiza nada si isOpen es false o alumno es null", () => {
      const htmlClosed = renderModalHtml({
        isOpen: false,
        onClose: vi.fn(),
        alumno: mockAlumnoSinRutina,
        onConfirmAssign: vi.fn(),
      });
      expect(htmlClosed).toBe("");

      const htmlNoAlumno = renderModalHtml({
        isOpen: true,
        onClose: vi.fn(),
        alumno: null,
        onConfirmAssign: vi.fn(),
      });
      expect(htmlNoAlumno).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // 4. ERGONOMÍA TÁCTIL Y ACCESIBILIDAD (Ponytail & Shadcn UI)
  // --------------------------------------------------------------------------
  describe("4. Accesibilidad y Ergonomía Táctil", () => {
    it("cumple con aria-modal, role dialog y dimensiones táctiles fat-finger friendly (>= 44px)", () => {
      const html = renderModalHtml({
        isOpen: true,
        onClose: vi.fn(),
        alumno: mockAlumnoSinRutina,
        onConfirmAssign: vi.fn(),
      });

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="assign-routine-preview-title"');

      // Botón Continuar con min-h-11 (44px)
      expect(html).toContain("min-h-11");
    });
  });

  // --------------------------------------------------------------------------
  // 5. WIRING EN COACH STUDIO VIEW
  // --------------------------------------------------------------------------
  describe("5. Wiring y Ergonomía en CoachStudioView", () => {
    it("CoachStudioView monta AssignRoutinePreviewModal y conecta el rayito a la previsualización", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const studioViewCode = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
        "utf-8",
      );

      // Importa y monta AssignRoutinePreviewModal
      expect(studioViewCode).toContain("AssignRoutinePreviewModal");
      expect(studioViewCode).toContain("<AssignRoutinePreviewModal");

      // Botón de rayito en la tabla de alumnos
      expect(studioViewCode).toContain('data-testid={`btn-asignar-plan-${alumno.id}`}');
      expect(studioViewCode).toContain('title="Asignar rutina"');
      expect(studioViewCode).toContain('aria-label={`Asignar rutina a ${alumno.nombre_completo}`}');

      // Abre el preview del alumno en vez de asignar inmediatamente
      expect(studioViewCode).toContain("setAssignRoutineTarget(alumno)");
      expect(studioViewCode).toContain("asignarPlanDesdePlantilla");

      // AssignPlanModal delega a la previsualización
      expect(studioViewCode).toContain("onOpenAssignRoutine");
    });
  });
});
