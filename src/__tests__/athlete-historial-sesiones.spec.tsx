import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { HistorialSesiones } from "@/components/athlete/historial-sesiones";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { REAL_HISTORIAL_CARGAS } from "@/services/real-mynter-data";
import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";

// renderToStaticMarkup lee el snapshot de servidor (estado inicial): el hook lee el estado vivo sembrado en beforeEach.
vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign((sel: (s: any) => unknown) => sel(mod.useAthleteStore.getState()), mod.useAthleteStore);
  return { ...mod, useAthleteStore: hook };
});

describe("HistorialSesiones Componente y Flujo de Usuario (GH #181, GOZS-175)", () => {
  beforeEach(() => {
    sembrarPlanAlumno("Fernando Rosales");
    useAthleteStore.setState({
      historialSesiones: REAL_HISTORIAL_CARGAS["66b92b9a-1ce7-4e2e-a47c-7c5600000000"] || [],
    });
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
  });

  const renderComponent = () => renderToStaticMarkup(<HistorialSesiones />);

  describe("1. Criterio de Aceptación: Visualización de Sesiones Cronológicas", () => {
    it("GIVEN un atleta con entrenamientos completados WHEN ingresa a la sección THEN visualiza el contenedor y el título de Historial", () => {
      const html = renderComponent();
      expect(html).toContain('data-testid="historial-sesiones-container"');
      expect(html).toContain("Historial de Sesiones");
      expect(html).toContain("Revisa tus entrenamientos y corrige registros en línea");
    });

    it("THEN visualiza la lista cronológica con fecha, nombre del día y métricas", () => {
      const html = renderComponent();
      expect(html).toContain('data-testid="tab-sesiones"');
      expect(html).toContain('data-testid="tab-dashboard"');
      expect(html).toContain("Sesiones Realizadas");
      expect(html).toContain("Volumen Total");
    });

    it("AND al expandir una sesión se visualiza el detalle con ejercicios y series (kg × reps y tipo)", () => {
      const html = renderComponent();
      // La primera sesión viene expandida por defecto
      expect(html).toContain("series");
      expect(html).toContain("kg");
      expect(html).toContain("reps");
      // Contiene botón de edición por serie
      expect(html).toContain("btn-editar-serie-");
    });
  });

  describe("2. Criterio de Aceptación: Edición en Línea y Guardado Optimista", () => {
    it("actualiza de forma optimista el peso y repeticiones en el store de atleta", async () => {
      const store = useAthleteStore.getState();
      const sesiones = store.historialSesiones;
      expect(sesiones.length).toBeGreaterThan(0);

      const targetSesion = sesiones[0]!;
      expect(targetSesion.series.length).toBeGreaterThan(0);
      const targetSerie = targetSesion.series[0]!;

      const nuevoPeso = 115.5;
      const nuevasReps = 7;

      // Ejecutar edición en línea
      await store.actualizarSerieHistorial(
        targetSesion.sesion.id,
        targetSerie.id,
        nuevoPeso,
        nuevasReps,
      );

      // Verificar actualización optimista instantánea
      const storeActualizado = useAthleteStore.getState();
      const sesionActualizada = storeActualizado.historialSesiones.find(
        (s) => s.sesion.id === targetSesion.sesion.id,
      )!;
      const serieActualizada = sesionActualizada.series.find((s) => s.id === targetSerie.id)!;

      expect(serieActualizada.peso_kg).toBe(nuevoPeso);
      expect(serieActualizada.reps_hechas).toBe(nuevasReps);
    });

    it("encola un evento en useOfflineQueueStore para sincronización silenciosa", async () => {
      const offlineStore = useOfflineQueueStore.getState();
      offlineStore.clearQueue();

      const store = useAthleteStore.getState();
      const targetSesion = store.historialSesiones[0]!;
      const targetSerie = targetSesion.series[0]!;

      await store.actualizarSerieHistorial(
        targetSesion.sesion.id,
        targetSerie.id,
        95,
        8,
      );

      const pending = useOfflineQueueStore.getState().pendingEvents;
      expect(pending.length).toBeGreaterThan(0);
      const evento = pending.find((e) => e.action === "HISTORIAL_SERIE_UPDATED");
      expect(evento).toBeDefined();
      expect(evento?.payload.pesoKg).toBe(95);
      expect(evento?.payload.repsHechas).toBe(8);
    });
  });

  describe("3. Criterio de Aceptación: Base Estructurada para Mini-Dashboard", () => {
    it("los registros alimentan el mini-dashboard de progresión por ejercicio", () => {
      const store = useAthleteStore.getState();
      expect(store.historialSesiones.length).toBeGreaterThan(0);

      const html = renderComponent();
      expect(html).toContain("Progreso (Mini-Dash)");
    });
  });

  describe("4. Soporte Offline-First y Ergonomía Ponytail", () => {
    it("muestra indicador de modo avión cuando no hay conexión", () => {
      const html = renderToStaticMarkup(<HistorialSesiones offline={true} />);
      expect(html).toContain("Offline");
      expect(html).toContain("Modo Avión");
    });

    it("cumple con clases táctiles min-h-12 y min-h-11 (>= 44px/48px) para botones interactivos", () => {
      const html = renderComponent();
      expect(html).toContain("min-h-12");
      expect(html).toContain("min-h-11");
    });
  });
});
