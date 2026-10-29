import { describe, it, expect } from "vitest";
import {
  evaluateRutinaVigenciaSemaphore,
  getRutinaVigenciaInfo,
} from "@/lib/rutina-vigencia";

describe("GOZS-242: Semáforo de vigencia de rutina (verde 0-15, amarillo 16-21, rojo 22+)", () => {
  // Fecha de referencia fija para aislamiento determinista en tests
  const baseNow = new Date("2026-10-28T12:00:00Z");

  const diasAFecha = (diasAtras: number): Date => {
    const msPorDia = 24 * 60 * 60 * 1000;
    return new Date(baseNow.getTime() - diasAtras * msPorDia);
  };

  describe("Criterios de Aceptación Gherkin principales (Issue GOZS-242)", () => {
    it("GIVEN una rutina asignada hace 16, 22 y 10 días, WHEN se muestra el semáforo, THEN amarillo, rojo y verde respectivamente", () => {
      const hace16Dias = diasAFecha(16);
      const hace22Dias = diasAFecha(22);
      const hace10Dias = diasAFecha(10);

      // THEN amarillo, rojo y verde respectivamente
      expect(evaluateRutinaVigenciaSemaphore(hace16Dias, baseNow)).toBe("YELLOW");
      expect(evaluateRutinaVigenciaSemaphore(hace22Dias, baseNow)).toBe("RED");
      expect(evaluateRutinaVigenciaSemaphore(hace10Dias, baseNow)).toBe("GREEN");
    });
  });

  describe("Tests exhaustivos de bordes exactos: 15 / 16 / 21 / 22", () => {
    it("Borde 15 días: debe ser VERDE (GREEN) inclusive", () => {
      const hace15Dias = diasAFecha(15);
      expect(evaluateRutinaVigenciaSemaphore(hace15Dias, baseNow)).toBe("GREEN");

      const info = getRutinaVigenciaInfo(hace15Dias, baseNow);
      expect(info.color).toBe("GREEN");
      expect(info.pillColorClass).toBe("bg-emerald-500");
      expect(info.tooltip).toContain("Rutina vigente (0-15 días: 15d)");
    });

    it("Borde 16 días: debe ser AMARILLO (YELLOW) inclusive", () => {
      const hace16Dias = diasAFecha(16);
      expect(evaluateRutinaVigenciaSemaphore(hace16Dias, baseNow)).toBe("YELLOW");

      const info = getRutinaVigenciaInfo(hace16Dias, baseNow);
      expect(info.color).toBe("YELLOW");
      expect(info.pillColorClass).toBe("bg-amber-500");
      expect(info.tooltip).toContain("Rutina por renovar (16-21 días: 16d)");
    });

    it("Borde 21 días: debe ser AMARILLO (YELLOW) inclusive", () => {
      const hace21Dias = diasAFecha(21);
      expect(evaluateRutinaVigenciaSemaphore(hace21Dias, baseNow)).toBe("YELLOW");

      const info = getRutinaVigenciaInfo(hace21Dias, baseNow);
      expect(info.color).toBe("YELLOW");
      expect(info.pillColorClass).toBe("bg-amber-500");
      expect(info.tooltip).toContain("Rutina por renovar (16-21 días: 21d)");
    });

    it("Borde 22 días: debe ser ROJO (RED) inclusive", () => {
      const hace22Dias = diasAFecha(22);
      expect(evaluateRutinaVigenciaSemaphore(hace22Dias, baseNow)).toBe("RED");

      const info = getRutinaVigenciaInfo(hace22Dias, baseNow);
      expect(info.color).toBe("RED");
      expect(info.pillColorClass).toBe("bg-rose-500");
      expect(info.tooltip).toContain("Rutina vencida (22+ días: 22d)");
    });
  });

  describe("Rangos completos y casos de borde adicionales", () => {
    it("Verde: asignada hoy (0 días) o días intermedios (5 días, 10 días)", () => {
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(0), baseNow)).toBe("GREEN");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(5), baseNow)).toBe("GREEN");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(10), baseNow)).toBe("GREEN");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(14), baseNow)).toBe("GREEN");
    });

    it("Verde: fecha futura o timezone edge (días negativos)", () => {
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(-2), baseNow)).toBe("GREEN");
      const info = getRutinaVigenciaInfo(diasAFecha(-1), baseNow);
      expect(info.color).toBe("GREEN");
      expect(info.diffDays).toBe(0);
    });

    it("Amarillo: días intermedios (17, 18, 19, 20 días)", () => {
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(17), baseNow)).toBe("YELLOW");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(18), baseNow)).toBe("YELLOW");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(19), baseNow)).toBe("YELLOW");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(20), baseNow)).toBe("YELLOW");
    });

    it("Rojo: días superiores (23, 30, 45, 60, 90 días)", () => {
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(23), baseNow)).toBe("RED");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(30), baseNow)).toBe("RED");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(60), baseNow)).toBe("RED");
      expect(evaluateRutinaVigenciaSemaphore(diasAFecha(90), baseNow)).toBe("RED");
    });

    it("Rojo: valores nulos, indefinidos o fechas inválidas (sin plan activo)", () => {
      expect(evaluateRutinaVigenciaSemaphore(null, baseNow)).toBe("RED");
      expect(evaluateRutinaVigenciaSemaphore(undefined, baseNow)).toBe("RED");
      expect(evaluateRutinaVigenciaSemaphore("fecha-invalida", baseNow)).toBe("RED");

      const infoNull = getRutinaVigenciaInfo(null, baseNow);
      expect(infoNull.color).toBe("RED");
      expect(infoNull.pillColorClass).toBe("bg-rose-500");
      expect(infoNull.tooltip).toBe("Sin rutina asignada (vencida)");

      const infoInvalida = getRutinaVigenciaInfo("fecha-invalida", baseNow);
      expect(infoInvalida.color).toBe("RED");
      expect(infoInvalida.tooltip).toBe("Fecha de rutina inválida (vencida)");
    });

    it("Soporta objetos tipo PlanEntrenamiento con fecha_inicio o created_at", () => {
      const planVerde = {
        fecha_inicio: diasAFecha(10).toISOString(),
      };
      expect(evaluateRutinaVigenciaSemaphore(planVerde, baseNow)).toBe("GREEN");

      const planAmarillo = {
        fecha_inicio: null,
        created_at: diasAFecha(18).toISOString(),
      };
      expect(evaluateRutinaVigenciaSemaphore(planAmarillo, baseNow)).toBe("YELLOW");

      const planRojo = {
        fecha_inicio: diasAFecha(35).toISOString(),
      };
      expect(evaluateRutinaVigenciaSemaphore(planRojo, baseNow)).toBe("RED");

      const planVacio = {};
      expect(evaluateRutinaVigenciaSemaphore(planVacio, baseNow)).toBe("RED");
    });
  });
});
