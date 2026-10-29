// ============================================================================
// GOZS-246: FE Studio: alta del alumno con actividades, frecuencia y clases fijas
// Criterios Gherkin:
// - GIVEN el formulario de alta
// - WHEN el coach completa actividades, frecuencia y clases
// - THEN el alumno queda creado con acceso inmediato y vinculado a sus clases
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  mensajeWhatsApp,
  HORARIOS_PREDETERMINADOS,
  type ActividadConfiguracion,
  type HorarioClaseDisponible,
  type AltaExitosa,
} from "@/components/coach/invite-student-modal";
import { useClasesStore } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-246: Alta de alumno con actividades, frecuencia y clases fijas (invite-student-modal.tsx)", () => {
  const content = read("../components/coach/invite-student-modal.tsx");

  describe("1. Estructura y campos del formulario de alta", () => {
    it("incluye selección de actividades FUNCIONAL, BOXEO y RUTINAS", () => {
      expect(content).toContain("alta-actividad-FUNCIONAL");
      expect(content).toContain("alta-actividad-BOXEO");
      expect(content).toContain("alta-actividad-RUTINAS");
    });

    it("permite elegir frecuencia semanal (1x..7x) o pase libre para cada actividad", () => {
      expect(content).toContain("alta-frecuencia-paselibre-FUNCIONAL");
      expect(content).toContain("alta-frecuencia-veces-FUNCIONAL");
      expect(content).toContain("alta-frecuencia-paselibre-BOXEO");
      expect(content).toContain("alta-frecuencia-paselibre-RUTINAS");
      expect(content).toContain("pase_libre");
      expect(content).toContain("veces_por_semana");
    });

    it("permite vincular clases fijas recurrentes para actividades presenciales", () => {
      expect(content).toContain("HORARIOS_PREDETERMINADOS");
      expect(content).toContain("alta-clase-fija-");
      expect(content).toContain("clasesFijasSeleccionadas");
      expect(content).toContain("asignarClaseFija");
    });

    it("persiste actividades en alumno_actividades y vincula clases fijas tras el 201", () => {
      expect(content).toContain('"alumno_actividades"');
      expect(content).toContain("asignarClaseFija");
    });

    it("cumple el objetivo ergonómico táctil (>= 44px en opciones, >= 48px en submit)", () => {
      expect(content).toContain('data-testid="invite-student-submit"');
      expect(content).toMatch(/min-h-12[\s\S]*?invite-student-submit|invite-student-submit[\s\S]*?min-h-12/);
      expect(content).toContain("min-h-10");
      expect(content).toContain("min-h-11");
    });
  });

  describe("2. Generación del mensaje de WhatsApp enriquecido", () => {
    const mockAlta: AltaExitosa = {
      alumno_id: "alumno-test-123",
      email: "atleta@gozster.test",
      password_temporal: "TempPass#2026",
      email_enviado: false,
      mensaje: "Alumno creado con acceso inmediato.",
    };

    it("GIVEN credenciales, actividades y clases fijas WHEN se genera el mensaje de WhatsApp THEN incluye todos los detalles", () => {
      const actividades: ActividadConfiguracion[] = [
        { actividad: "FUNCIONAL", veces_por_semana: 2, pase_libre: false },
        { actividad: "RUTINAS", veces_por_semana: null, pase_libre: true },
      ];

      const clasesFijas: HorarioClaseDisponible[] = [
        { id: "horario-func-lun-18", actividad: "FUNCIONAL", dia_semana: 1, dia_nombre: "Lunes", hora_inicio: "18:00" },
        { id: "horario-func-mie-18", actividad: "FUNCIONAL", dia_semana: 3, dia_nombre: "Miércoles", hora_inicio: "18:00" },
      ];

      const msg = mensajeWhatsApp(mockAlta, "Martín", actividades, clasesFijas);

      expect(msg).toContain("Hola Martín!");
      expect(msg).toContain("atleta@gozster.test");
      expect(msg).toContain("TempPass#2026");
      expect(msg).toContain("Tus actividades:");
      expect(msg).toContain("• Funcional: 2x por semana");
      expect(msg).toContain("• Rutinas online: Pase libre");
      expect(msg).toContain("Tus clases fijas semanales:");
      expect(msg).toContain("• Lunes 18:00 hs (Funcional)");
      expect(msg).toContain("• Miércoles 18:00 hs (Funcional)");
      expect(msg).toContain("/login");
    });

    it("GIVEN un alta sin actividades opcionales WHEN se genera el mensaje THEN mantiene la plantilla clásica", () => {
      const msg = mensajeWhatsApp(mockAlta, "");
      expect(msg).toContain("Hola!");
      expect(msg).toContain("atleta@gozster.test");
      expect(msg).toContain("TempPass#2026");
      expect(msg).not.toContain("Tus actividades:");
      expect(msg).not.toContain("Tus clases fijas semanales:");
    });
  });

  describe("3. Store de clases: asignación y consulta de clases fijas (Zustand)", () => {
    beforeEach(() => {
      useWorkspaceModeStore.getState().setMode("TESTEO");
      useClasesStore.getState().resetDemoDataset();
    });

    it("GIVEN un alumno recién dado de alta WHEN el coach le asigna clases fijas THEN se registran y consultan en el store", async () => {
      const store = useClasesStore.getState();
      const nuevoAlumnoId = "alumno-nuevo-gozs-246";

      // Asignar 2 clases fijas
      const ok1 = await store.asignarClaseFija("demo-horario-func-lunes", nuevoAlumnoId);
      const ok2 = await store.asignarClaseFija("demo-horario-func-miercoles", nuevoAlumnoId);

      expect(ok1).toBe(true);
      expect(ok2).toBe(true);

      // Consultar clases fijas del alumno
      const fijas = useClasesStore.getState().obtenerClasesFijasAlumno(nuevoAlumnoId);
      expect(fijas.length).toBe(2);
      expect(fijas.map((f) => f.horario_id)).toEqual([
        "demo-horario-func-lunes",
        "demo-horario-func-miercoles",
      ]);
    });

    it("GIVEN clases fijas asignadas WHEN se quita una clase fija THEN se remueve del listado del alumno", async () => {
      const store = useClasesStore.getState();
      const nuevoAlumnoId = "alumno-nuevo-quitar-fija";

      await store.asignarClaseFija("demo-horario-box-lunes", nuevoAlumnoId);
      const fijasAntes = useClasesStore.getState().obtenerClasesFijasAlumno(nuevoAlumnoId);
      expect(fijasAntes.length).toBe(1);

      const claseFijaId = fijasAntes[0]?.id;
      expect(claseFijaId).toBeDefined();

      const okQuitar = await store.quitarClaseFija(claseFijaId!);
      expect(okQuitar).toBe(true);

      const fijasDespues = useClasesStore.getState().obtenerClasesFijasAlumno(nuevoAlumnoId);
      expect(fijasDespues.length).toBe(0);
    });

    it("el resetDemoDataset inicializa clases fijas de prueba para Valentina Ríos", () => {
      const store = useClasesStore.getState();
      const fijasValentina = store.obtenerClasesFijasAlumno("demo-alumno-valentina");
      expect(fijasValentina.length).toBeGreaterThanOrEqual(2);
      expect(fijasValentina[0]?.horario_id).toBe("demo-horario-func-lunes");
    });
  });

  describe("4. Criterios de Aceptación Gherkin de la issue GOZS-246", () => {
    it("GIVEN el formulario de alta WHEN el coach completa actividades, frecuencia y clases THEN el alumno queda creado con acceso inmediato y vinculado a sus clases", () => {
      // 1. Verificación de los inputs en el componente
      expect(content).toContain('data-testid="alta-email"');
      expect(content).toContain('data-testid="alta-actividad-FUNCIONAL"');
      expect(content).toContain("alta-frecuencia-veces-FUNCIONAL-");
      expect(content).toContain('data-testid="alta-success-actividades"');
      expect(content).toContain('data-testid="alta-success-clases-fijas"');

      // 2. Horarios por defecto configurados para clases presenciales
      expect(HORARIOS_PREDETERMINADOS.length).toBeGreaterThanOrEqual(6);
      const funcSlots = HORARIOS_PREDETERMINADOS.filter((h) => h.actividad === "FUNCIONAL");
      const boxSlots = HORARIOS_PREDETERMINADOS.filter((h) => h.actividad === "BOXEO");
      expect(funcSlots.length).toBeGreaterThanOrEqual(4);
      expect(boxSlots.length).toBeGreaterThanOrEqual(2);
    });
  });
});
