import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";
import {
  calcularEstadosDias,
  calcularTeTocaHoy,
  calcularUltimoEntrenamiento,
  formatearEtiquetaDia,
  formatearTiempoTranscurrido,
  type DiaRutinaItem,
} from "@/lib/athlete-dias";

describe("Athlete App: Inicio Mis días + hacer otro día (GOZS-147)", () => {
  const inicioMisDiasPath = path.resolve(__dirname, "../components/athlete/inicio-mis-dias.tsx");
  const athletePagePath = path.resolve(__dirname, "../app/(athlete)/athlete/page.tsx");
  const athleteDiasLibPath = path.resolve(__dirname, "../lib/athlete-dias.ts");

  const inicioCode = fs.readFileSync(inicioMisDiasPath, "utf-8");
  const pageCode = fs.readFileSync(athletePagePath, "utf-8");
  const diasLibCode = fs.readFileSync(athleteDiasLibPath, "utf-8");

  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
    vi.restoreAllMocks();
  });

  describe("1. Pantalla Inicio 'Mis días' y montaje condicional", () => {
    it("la ruta /athlete monta InicioMisDias cuando no hay entrenamiento activo y LiveWorkout cuando sí", () => {
      expect(pageCode).toContain("<InicioMisDias />");
      expect(pageCode).toContain("<LiveWorkout />");
      expect(pageCode).toContain("diaActivoId ?");
    });

    it("el componente InicioMisDias lista N días según el plan y muestra el Hero con el día actual", () => {
      expect(inicioCode).toContain('data-testid="inicio-mis-dias-container"');
      expect(inicioCode).toContain('data-testid="hero-dia-hoy"');
      expect(inicioCode).toContain('data-testid="empezar-dia-btn"');
      expect(inicioCode).toContain('data-testid="hacer-otro-dia-btn"');
    });

    it("respeta las reglas de diseño: toques >= 48px, botón principal h-14, Lucide y sin emojis", () => {
      expect(inicioCode).toContain("h-14");
      expect(inicioCode).toContain("rounded-[14px]");
      expect(inicioCode).toContain("bg-[#38BDF8]");
      expect(inicioCode).toContain("text-[#0F172A]");
      expect(inicioCode).toContain("bg-[#0F172A]");
      // Sin emojis directos
      expect(inicioCode).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
    });
  });

  describe("2. Selección de 'Te toca hoy' y soporte de cambio de día", () => {
    const mockDias: DiaRutinaItem[] = [
      { id: "dia-a", orden: 1, nombre: "Día 1 · Full body", ejerciciosCount: 5 },
      { id: "dia-b", orden: 2, nombre: "Día 2 · Tren inferior", ejerciciosCount: 6 },
      { id: "dia-c", orden: 3, nombre: "Día 3 · Tren superior", ejerciciosCount: 6 },
      { id: "dia-d", orden: 4, nombre: "Día 4 · Movilidad", ejerciciosCount: 5 },
    ];

    it("identifica el primer día sin sesión como 'Te toca hoy'", () => {
      const teToca = calcularTeTocaHoy(mockDias, ["dia-a"]);
      expect(teToca?.id).toBe("dia-b");
    });

    it("si el alumno cambia a otro día (Día 3), el Día 2 queda marcado como 'Pendiente · te toca el próximo'", () => {
      const res = calcularEstadosDias({
        dias: mockDias,
        sesionesSemana: [{ dia_id: "dia-a" }],
        diaElegidoHoyId: "dia-c",
      });

      expect(res.cambioDeDia).toBe(true);
      expect(res.diaActivoHoy?.id).toBe("dia-c");
      expect(res.diaTeTocaHoy?.id).toBe("dia-b");

      const dia2 = res.diasConEstado.find((d) => d.id === "dia-b");
      expect(dia2?.estado).toBe("PENDING_SKIPPED");
      expect(dia2?.subtitulo).toBe("Pendiente · te toca el próximo");

      const dia3 = res.diasConEstado.find((d) => d.id === "dia-c");
      expect(dia3?.estado).toBe("TODAY");
      expect(dia3?.subtitulo).toBe("Hoy");
    });
  });

  describe("3. Sheet inferior y Toast con Deshacer", () => {
    it("el componente expone el sheet de cambio de día con las opciones requeridas", () => {
      expect(inicioCode).toContain('data-testid="sheet-cambiar-dia"');
      expect(inicioCode).toContain('data-testid="confirmar-cambio-dia-btn"');
      expect(inicioCode).toContain("¿Qué día querés hacer hoy?");
      expect(inicioCode).toContain("no se pierde: queda como el próximo");
    });

    it("el toast permite deshacer el cambio dentro de la ventana de 5 segundos", () => {
      expect(inicioCode).toContain('data-testid="toast-cambio-dia"');
      expect(inicioCode).toContain('data-testid="deshacer-cambio-dia-btn"');
      expect(inicioCode).toContain("Deshacer");
    });

    it("el store de Zustand implementa empezarDia, volverAlInicio, elegirOtroDia y deshacerCambioDia", () => {
      const store = useAthleteStore.getState();

      // Elegir otro día
      store.elegirOtroDia("dia-test-3");
      expect(useAthleteStore.getState().diaElegidoHoyId).toBe("dia-test-3");

      // Deshacer cambio
      store.deshacerCambioDia();
      expect(useAthleteStore.getState().diaElegidoHoyId).toBeNull();

      // Empezar día activa la sesión
      store.empezarDia("dia-test-1");
      expect(useAthleteStore.getState().diaActivoId).toBe("dia-test-1");

      // Volver a inicio
      store.volverAlInicio();
      expect(useAthleteStore.getState().diaActivoId).toBeNull();
    });
  });

  describe("4. Último entrenamiento realizado en pantalla de inicio (GH #175 / GOZS-171)", () => {
    const mockDias: DiaRutinaItem[] = [
      { id: "dia-1", orden: 1, nombre: "Torso", ejerciciosCount: 6 },
      { id: "dia-2", orden: 2, nombre: "Piernas", ejerciciosCount: 6 },
      { id: "dia-3", orden: 3, nombre: "Brazos & Hombros", ejerciciosCount: 5 },
    ];

    const refDate = new Date("2026-10-26T12:00:00-03:00");

    it("formatea el tiempo transcurrido en días respecto a la fecha de referencia", () => {
      // Mismo día (hace 0 días)
      expect(formatearTiempoTranscurrido("2026-10-26T09:00:00-03:00", refDate)).toBe("Hoy");
      // Ayer (hace 1 día)
      expect(formatearTiempoTranscurrido("2026-10-25T18:00:00-03:00", refDate)).toBe("Ayer");
      expect(formatearTiempoTranscurrido("2026-10-25T18:00:00-03:00", refDate, "dias")).toBe("Hace 1 día");
      // Hace 2 días
      expect(formatearTiempoTranscurrido("2026-10-24T18:00:00-03:00", refDate)).toBe("Hace 2 días");
      // Hace 5 días
      expect(formatearTiempoTranscurrido("2026-10-21T10:00:00-03:00", refDate)).toBe("Hace 5 días");
      // Fecha nula o inválida
      expect(formatearTiempoTranscurrido(null, refDate)).toBe("");
      expect(formatearTiempoTranscurrido("fecha-invalida", refDate)).toBe("");
    });

    it("formatea la etiqueta del día sin redundancias de 'Día N'", () => {
      expect(formatearEtiquetaDia(1, "Torso")).toBe("Día 1 · Torso");
      expect(formatearEtiquetaDia(1, "Día 1 · Torso")).toBe("Día 1 · Torso");
      expect(formatearEtiquetaDia(2, "Piernas")).toBe("Día 2 · Piernas");
      expect(formatearEtiquetaDia(3)).toBe("Día 3");
    });

    it("calcularUltimoEntrenamiento devuelve null si no hay sesiones previas", () => {
      const result = calcularUltimoEntrenamiento(mockDias, [], refDate);
      expect(result).toBeNull();
    });

    it("calcularUltimoEntrenamiento selecciona la sesión más reciente y genera el texto esperado", () => {
      const sesiones = [
        { id: "s-1", dia_id: "dia-1", fecha: "2026-10-20T10:00:00-03:00" }, // hace 6 días
        { id: "s-2", dia_id: "dia-2", fecha: "2026-10-24T15:30:00-03:00" }, // hace 2 días (más reciente)
      ];

      const result = calcularUltimoEntrenamiento(mockDias, sesiones, refDate);
      expect(result).not.toBeNull();
      expect(result?.diaId).toBe("dia-2");
      expect(result?.diaOrden).toBe(2);
      expect(result?.diaNombre).toBe("Piernas");
      expect(result?.tiempoRelativo).toBe("Hace 2 días");
      expect(result?.textoCompleto).toBe("Último entrenamiento: Día 2 · Piernas (Hace 2 días)");
    });

    it("calcularEstadosDias incluye ultimoEntrenamiento y marca esUltimoRealizado en el día correspondiente", () => {
      const resConSesiones = calcularEstadosDias({
        dias: mockDias,
        sesionesSemana: [
          { dia_id: "dia-1", fecha: "2026-10-24T10:00:00-03:00" }, // hace 2 días
        ],
        fechaReferencia: refDate,
      });

      expect(resConSesiones.ultimoEntrenamiento).not.toBeNull();
      expect(resConSesiones.ultimoEntrenamiento?.diaId).toBe("dia-1");
      expect(resConSesiones.ultimoEntrenamiento?.textoCompleto).toBe(
        "Último entrenamiento: Día 1 · Torso (Hace 2 días)",
      );

      const dia1 = resConSesiones.diasConEstado.find((d) => d.id === "dia-1");
      const dia2 = resConSesiones.diasConEstado.find((d) => d.id === "dia-2");

      expect(dia1?.esUltimoRealizado).toBe(true);
      expect(dia2?.esUltimoRealizado).toBe(false);
    });

    it("si no hay sesiones previas registradas, no se marca ningún día como último realizado", () => {
      const resVacio = calcularEstadosDias({
        dias: mockDias,
        sesionesSemana: [],
        fechaReferencia: refDate,
      });

      expect(resVacio.ultimoEntrenamiento).toBeNull();
      expect(resVacio.diasConEstado.every((d) => !d.esUltimoRealizado)).toBe(true);
    });

    it("el componente InicioMisDias implementa la Opción A: sub-header informativo sobre el Hero y badge en la lista", () => {
      // Sub-header informativo elegante sobre el hero
      expect(inicioCode).toContain('data-testid="ultimo-entrenamiento-sub-header"');
      expect(inicioCode).toContain('data-testid="ultimo-entrenamiento-texto"');
      expect(inicioCode).toContain("Último entrenamiento:");
      expect(inicioCode).toContain("<History");

      // Badge identificatorio en la lista de días
      expect(inicioCode).toContain('data-testid="badge-ultimo-realizado"');
      expect(inicioCode).toContain("Último realizado");

      // Condicionado para evitar estados rotos o vacíos cuando no hay sesiones
      expect(inicioCode).toContain("ultimoEntrenamiento && (");
      expect(inicioCode).toContain("dia.esUltimoRealizado && (");
    });
  });
});
