import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { HistorialSesiones } from "@/components/athlete/historial-sesiones";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { SINT_HISTORIAL_CARGAS } from "@/__tests__/helpers/datos-sinteticos";
import { fireEvent, render, TestHTMLElement } from "@/test-utils/no-demo-literals";
import { sembrarPlanAlumno } from "./helpers/plan-alumno-seed";

// renderToStaticMarkup lee el snapshot de servidor (estado inicial): el hook lee el estado vivo sembrado en beforeEach.
vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign((sel: (s: any) => unknown) => sel(mod.useAthleteStore.getState()), mod.useAthleteStore);
  return { ...mod, useAthleteStore: hook };
});

describe("HistorialSesiones Componente y Flujo de Usuario (GH #181, GOZS-175)", () => {
  beforeEach(() => {
    sembrarPlanAlumno("Alumno Sintetico 1");
    useAthleteStore.setState({
      historialSesiones: SINT_HISTORIAL_CARGAS["00000000-0000-4000-8000-000000000001"] || [],
    });
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
  });

  const renderComponent = () => renderToStaticMarkup(<HistorialSesiones />);

  // GOZS-848: las sesiones arrancan colapsadas; se despliegan con un toque.
  const expandirPrimeraSesion = (ui: ReturnType<typeof render>) => {
    const btn = Array.from(ui.container.querySelectorAll<HTMLElement>("button")).find((b) =>
      b.getAttribute("data-testid")?.startsWith("btn-expand-sesion-"),
    )!;
    fireEvent.click(btn);
  };

  describe("1. Criterio de Aceptación: Visualización de Sesiones Cronológicas", () => {
    it("GIVEN un atleta con entrenamientos completados WHEN ingresa a la sección THEN visualiza el contenedor y el título de Historial", () => {
      const html = renderComponent();
      expect(html).toContain('data-testid="historial-sesiones-container"');
      // v7 (02-pantallas §5): cabecera invertida "Historial" con su bajada
      expect(html).toContain("a-hhero");
      expect(html).toContain(">Historial<");
      expect(html).toContain("Tus sesiones y series. Si cargaste algo mal, lo podés corregir.");
    });

    it("THEN visualiza la lista cronológica con fecha, nombre del día y métricas (Poda de Volumen Total según GOZS-359)", () => {
      const html = renderComponent();
      expect(html).toContain('data-testid="tab-sesiones"');
      expect(html).toContain('data-testid="tab-dashboard"');
      expect(html).toContain("Por sesión");
      expect(html).toContain("Por ejercicio");
      expect(html).toContain("Sesiones</small>");
      expect(html).toContain("Series</small>");
      expect(html).toContain("a-hcard");
      expect(html).toContain("Ver series y corregir");
      expect(html).not.toContain("Volumen Total");
    });

    it("GOZS-848: todas las sesiones arrancan colapsadas (sin detalle ni botones de edición)", () => {
      const html = renderComponent();
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain('aria-expanded="true"');
      expect(html).not.toContain("detalle-sesion-");
      expect(html).not.toContain("btn-editar-serie-");
    });

    it("AND al expandir una sesión (1 toque) se visualiza el detalle con ejercicios y series (kg × reps y tipo)", () => {
      const ui = render(<HistorialSesiones />);
      expandirPrimeraSesion(ui);
      const html = ui.container.innerHTML;
      expect(html).toContain("series");
      expect(html).toContain("kg");
      expect(html).toContain("reps");
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
      // v7: el segmentado se llama "Por ejercicio" (02-pantallas §5)
      expect(html).toContain("Por ejercicio");
    });
  });

  describe("4. Soporte Offline-First y Ergonomía Ponytail", () => {
    it("muestra indicador de modo avión cuando no hay conexión", () => {
      const html = renderToStaticMarkup(<HistorialSesiones offline={true} />);
      // v7: "Modo Avión" pasa a "Sin conexión · datos del …" (02-pantallas §5, brecha)
      expect(html).toContain("Sin conexión");
      expect(html).toContain("datos del");
      expect(html).not.toContain("Modo Avión");
    });

    it("usa los controles v7 con botón de corrección de 36 px y etiqueta accesible (a-ed)", () => {
      const ui = render(<HistorialSesiones />);
      expandirPrimeraSesion(ui);
      const html = ui.container.innerHTML;
      expect(html).toContain('class="a-ed"');
      expect(html).toMatch(/aria-label="Corregir serie \d+ de /);
    });
  });

  describe("5. Accesibilidad de la hoja \"Corregir serie\" (focus trap y Escape)", () => {
    const origWindow = globalThis.window;
    const origDocument = globalThis.document;

    afterEach(() => {
      vi.restoreAllMocks();
      if (origWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        globalThis.window = origWindow;
      }
      if (origDocument === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        globalThis.document = origDocument;
      }
    });

    function instalarDomTeclado() {
      const listeners = new Map<string, Set<(e: unknown) => void>>();
      const mockDoc = { activeElement: null as unknown };
      const mockWin = {
        addEventListener(type: string, fn: (e: unknown) => void) {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)!.add(fn);
        },
        removeEventListener(type: string, fn: (e: unknown) => void) {
          listeners.get(type)?.delete(fn);
        },
        dispatchKeyDown(key: string, shiftKey = false) {
          const ev = {
            key,
            shiftKey,
            defaultPrevented: false,
            preventDefault() {
              this.defaultPrevented = true;
            },
          };
          for (const fn of [...(listeners.get("keydown") ?? [])]) {
            fn(ev);
          }
          return ev;
        },
      };

      globalThis.document = mockDoc as unknown as Document;
      globalThis.window = mockWin as unknown as Window & typeof globalThis;

      const origFocus = TestHTMLElement.prototype.focus;
      vi.spyOn(TestHTMLElement.prototype, "focus").mockImplementation(function (this: TestHTMLElement) {
        mockDoc.activeElement = this;
        origFocus.call(this);
      });

      return { mockDoc, mockWin };
    }

    it("atrapa Tab y Shift+Tab dentro de .a-sheet y cierra con Escape en window devolviendo el foco", () => {
      const { mockDoc, mockWin } = instalarDomTeclado();
      const ui = render(<HistorialSesiones />);
      expandirPrimeraSesion(ui);

      const disparador =
        Array.from(ui.container.querySelectorAll<HTMLElement>(".a-ed")).find((b) =>
          b.getAttribute("data-testid")?.startsWith("btn-editar-serie-"),
        ) ?? null;
      expect(disparador).not.toBeNull();
      const serieId = disparador!.getAttribute("data-testid")!.replace("btn-editar-serie-", "");

      mockDoc.activeElement = disparador;
      fireEvent.click(disparador!);

      const dialog = ui.getByRole("dialog");
      expect(dialog.className).toContain("a-sheet");
      expect((mockDoc.activeElement as HTMLElement | null)?.id).toBe("hist-fix-titulo");

      const btnCerrar = ui.getByTestId(`btn-cancelar-serie-${serieId}`);
      const inputPeso = ui.getByTestId(`input-peso-${serieId}`);
      const btnGuardar = ui.getByTestId(`btn-guardar-serie-${serieId}`);

      // Shift+Tab al abrir (foco en #hist-fix-titulo) cicla al último enfocable ("Guardar corrección")
      const evShiftOpen = mockWin.dispatchKeyDown("Tab", true);
      expect(evShiftOpen.defaultPrevented).toBe(true);
      expect(mockDoc.activeElement).toBe(btnGuardar);

      // Tab desde el último enfocable ("Guardar corrección") cicla al primero ("Cerrar")
      const evTabLast = mockWin.dispatchKeyDown("Tab", false);
      expect(evTabLast.defaultPrevented).toBe(true);
      expect(mockDoc.activeElement).toBe(btnCerrar);

      // Shift+Tab desde el primero ("Cerrar") cicla al último ("Guardar corrección")
      const evShiftFirst = mockWin.dispatchKeyDown("Tab", true);
      expect(evShiftFirst.defaultPrevented).toBe(true);
      expect(mockDoc.activeElement).toBe(btnGuardar);

      // Tab desde un campo intermedio no queda bloqueado
      mockDoc.activeElement = inputPeso;
      const evTabMiddle = mockWin.dispatchKeyDown("Tab", false);
      expect(evTabMiddle.defaultPrevented).toBe(false);

      // Escape escuchado en window cierra la hoja y devuelve el foco al botón disparador
      const evEsc = mockWin.dispatchKeyDown("Escape", false);
      expect(evEsc.defaultPrevented).toBe(true);
      expect(ui.queryByTestId(`form-editar-serie-${serieId}`)).toBeNull();
      expect(mockDoc.activeElement).toBe(disparador);
    });

    it("no cierra la hoja con Escape en window mientras el diálogo de carga atípica está abierto", () => {
      const { mockWin } = instalarDomTeclado();
      const ui = render(<HistorialSesiones />);
      expandirPrimeraSesion(ui);

      const disparador = Array.from(ui.container.querySelectorAll<HTMLElement>(".a-ed")).find((b) =>
        b.getAttribute("data-testid")?.startsWith("btn-editar-serie-"),
      )!;
      const serieId = disparador.getAttribute("data-testid")!.replace("btn-editar-serie-", "");
      fireEvent.click(disparador);

      const inputPeso = ui.getByTestId(`input-peso-${serieId}`);
      fireEvent.change(inputPeso, { target: { value: "450" } });
      fireEvent.click(ui.getByTestId(`btn-guardar-serie-${serieId}`));

      const atypical = ui.getByTestId("historial-atypical-dialog");
      expect(atypical.textContent).toContain("Ingresaste 450 kg");

      const evEsc = mockWin.dispatchKeyDown("Escape", false);
      expect(evEsc.defaultPrevented).toBe(false);
      expect(ui.queryByTestId(`form-editar-serie-${serieId}`)).not.toBeNull();
    });
  });
});
