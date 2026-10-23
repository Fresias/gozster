import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";
import {
  calcularEstadosDias,
  calcularTeTocaHoy,
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
});
