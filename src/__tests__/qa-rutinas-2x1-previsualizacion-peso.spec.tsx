import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) =>
      typeof sel === "function" ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState(),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});
import { StudioShell } from "@/components/coach/studio-shell";
import { RutinasLibrary } from "@/components/coach/rutinas-library";
import { AthletePreviewModal } from "@/components/coach/athlete-preview-modal";
import { InicioMisDias } from "@/components/athlete/inicio-mis-dias";
import { useAthleteStore } from "@/store/use-athlete-store";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_EJERCICIOS,
  REAL_EJERCICIOS_RUTINA,
} from "@/services/real-mynter-data";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { Perfil } from "@/types/database.types";

const mockDataset: LiveSupabaseDataset = {
  alumnos: REAL_ALUMNOS,
  planes: REAL_PLANES,
  dias: REAL_DIAS,
  ejerciciosEnRutina: REAL_EJERCICIOS_RUTINA,
  ejercicios: REAL_EJERCICIOS,
};

describe("GOZS-345: Rutinas 2x1 a Pantalla Completa, Simulador Atleta y Recordatorio de Peso", () => {
  describe("1. Rutinas 2x1 en Pantalla Completa & Sidebar Unificado", () => {
    it("elimina el botón modal flotante aislado del sidebar y deja una única sección 'Rutinas & Constructor'", () => {
      const shellSource = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/studio-shell.tsx"),
        "utf-8",
      );

      // No debe existir el botón aislado con setRoutineBuilderOpen(true)
      expect(shellSource).not.toContain("setRoutineBuilderOpen(true)");

      // Debe existir el enlace unificado a /studio/rutinas con Rutinas & Constructor
      expect(shellSource).toContain('href="/studio/rutinas"');
      expect(shellSource).toContain("Rutinas &amp; Constructor");
      expect(shellSource).toContain('data-testid="sidebar-routine-builder-btn"');
    });

    it("RutinasLibrary renderiza los tabs principales 2x1 (Tab 1 Biblioteca & Plantillas, Tab 2 Constructor Visual)", () => {
      const html = renderToStaticMarkup(
        createElement(RutinasLibrary, { initialDataset: mockDataset }),
      );

      // Tabs 2x1 principales
      expect(html).toContain('data-testid="rutinas-main-nav-tabs"');
      expect(html).toContain("Biblioteca &amp; Plantillas");
      expect(html).toContain("Constructor Visual");
      expect(html).toContain('data-testid="tab-biblioteca-plantillas"');
      expect(html).toContain('data-testid="tab-constructor-visual"');
      expect(html).toContain("Plantillas (");
    });
  });

  describe("2. Modo Previsualización / Impersonación de Atleta para Coach", () => {
    it("renderiza el simulador móvil con banner de modo entrenador para Miguel Sanchez", () => {
      const miguel = REAL_ALUMNOS.find((a) =>
        a.nombre_completo.toLowerCase().includes("miguel"),
      )!;

      const html = renderToStaticMarkup(
        createElement(AthletePreviewModal, {
          isOpen: true,
          alumnoId: miguel.id,
          alumnoNombre: miguel.nombre_completo,
          onClose: () => {},
          dataset: mockDataset,
        }),
      );

      // Banner superior con el texto exacto requerido
      expect(html).toContain('data-testid="banner-modo-entrenador"');
      expect(html).toContain("Modo Entrenador: Vista previa de");
      expect(html).toContain("Miguel Sanchez");
      expect(html).toContain("Volver a Studio");
      expect(html).toContain('data-testid="return-to-studio-btn"');

      // Marco de dispositivo móvil
      expect(html).toContain('data-testid="mobile-device-frame"');
      expect(html).toContain("GOZSter");
      expect(html).toContain("Athlete");

      // Rutina y días de Miguel
      expect(html).toContain("FUERZA MIGUE");
      expect(html).toContain('data-testid="preview-dias-list"');
      expect(html).toContain("descanso");
    });

    it("CoachStudioView incluye control de vista previa rápida de alumno", () => {
      const viewSource = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
        "utf-8",
      );

      expect(viewSource).toContain('data-testid="preview-athlete-control"');
      expect(viewSource).toContain('data-testid="preview-athlete-select"');
      expect(viewSource).toContain('data-testid="preview-athlete-btn"');
      expect(viewSource).toContain("AthletePreviewModal");
    });
  });

  describe("3. Recordatorio Mensual de Peso Corporal (kg puro)", () => {
    it("muestra tarjeta sutil cuando el alumno tiene más de 30 días sin actualizar peso o no tiene peso", () => {
      // Mock de alumno con fecha de actualización mayor a 30 días
      const hace40Dias = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const mockAlumno: Perfil = {
        id: "test-alumno-peso",
        nombre_completo: "Santiago Gómez",
        email: "santi@gozster.local",
        rol: "ALUMNO",
        estado_membresia: "ACTIVA",
        profesor_asignado_id: null,
        fecha_baja: null,
        created_at: hace40Dias,
        updated_at: hace40Dias,
        peso_corporal_kg: 72.0,
      };

      useAthleteStore.setState({
        planAlumno: {
          alumnos: [mockAlumno],
          planes: [
            {
              id: "plan-test",
              nombre: "Plan Fuerza Test",
              alumno_id: mockAlumno.id,
              profesor_id: "prof-1",
              estado: "ACTIVO",
              comentarios: null,
              fecha_inicio: hace40Dias,
              fecha_fin: null,
              created_at: hace40Dias,
              updated_at: hace40Dias,
            },
          ],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
        },
      });

      const html = renderToStaticMarkup(createElement(InicioMisDias));

      expect(html).toContain('data-testid="recordatorio-peso-card"');
      expect(html).toContain(
        "Actualizá tu peso corporal para calibrar tus marcas de fuerza (kg)",
      );
      expect(html).toContain('data-testid="input-peso-corporal"');
      expect(html).toContain('data-testid="btn-guardar-peso-corporal"');
      expect(html).toContain("kg");
    });

    it("no muestra el recordatorio si el peso fue actualizado recientemente (menos de 30 días)", () => {
      const hace5Dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const mockAlumnoAlDia: Perfil = {
        id: "test-alumno-aldia",
        nombre_completo: "Lucas Varela",
        email: "lucas@gozster.local",
        rol: "ALUMNO",
        estado_membresia: "ACTIVA",
        profesor_asignado_id: null,
        fecha_baja: null,
        created_at: hace5Dias,
        updated_at: hace5Dias,
        peso_corporal_kg: 80.5,
      };

      useAthleteStore.setState({
        planAlumno: {
          alumnos: [mockAlumnoAlDia],
          planes: [
            {
              id: "plan-test-2",
              nombre: "Plan Hipertrofia Test",
              alumno_id: mockAlumnoAlDia.id,
              profesor_id: "prof-1",
              estado: "ACTIVO",
              comentarios: null,
              fecha_inicio: hace5Dias,
              fecha_fin: null,
              created_at: hace5Dias,
              updated_at: hace5Dias,
            },
          ],
          dias: [],
          ejerciciosEnRutina: [],
          ejercicios: [],
        },
      });

      const html = renderToStaticMarkup(createElement(InicioMisDias));

      expect(html).not.toContain('data-testid="recordatorio-peso-card"');
      expect(html).not.toContain(
        "Actualizá tu peso corporal para calibrar tus marcas de fuerza (kg)",
      );
    });
  });
});
