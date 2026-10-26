import { describe, it, expect, beforeEach } from "vitest";
import { useAthleteStore } from "@/store/use-athlete-store";
import {
  calcularUltimoDiaRealizado,
  formatearFechaUltimoEntrenamiento,
  type DiaRutinaItem,
  type RegistroSesionSimple,
} from "@/lib/athlete-dias";

describe("Feedback del Profe: 3 Mejoras Críticas", () => {
  beforeEach(() => {
    useAthleteStore.getState().stopTimer();
  });

  describe("Item 1 & 2: Timer de descanso y finalización de entrenamiento (GH #173, #174 / GOZS-169, #170)", () => {
    it("al completar series intermedias, si quedan series pendientes, el temporizador de descanso inicia normalmente", () => {
      const store = useAthleteStore.getState();
      const mockSession = {
        id: "test-session-timer-1",
        dia_id: "test-dia-1",
        studentName: "Fernando Rosales",
        studentId: "66b92b9a-1ce7-4e2e-a47c-7c5600000000",
        fecha: "2026-10-26T10:00:00.000Z",
        ejercicios: [
          {
            id: "ej-1",
            nombre: "Press Plano con Barra",
            musculos_principales: ["Pecho"],
            descanso_segundos: 90,
            series: [
              { numero_serie: 1, peso_kg: 80, reps_hechas: 8, completada: false },
              { numero_serie: 2, peso_kg: 80, reps_hechas: 8, completada: false },
            ],
          },
        ],
      };

      store.setSession(mockSession as any);
      store.completeSet("ej-1", 1);

      const stateAfterSet1 = useAthleteStore.getState();
      expect(stateAfterSet1.restTimer.isActive).toBe(true);
      expect(stateAfterSet1.restTimer.secondsRemaining).toBe(90);
    });

    it("al completar la ÚLTIMA serie de la sesión, el temporizador de descanso NO se inicia y se detiene automáticamente", () => {
      const store = useAthleteStore.getState();
      const mockSession = {
        id: "test-session-timer-final",
        dia_id: "test-dia-1",
        studentName: "Fernando Rosales",
        studentId: "66b92b9a-1ce7-4e2e-a47c-7c5600000000",
        fecha: "2026-10-26T10:00:00.000Z",
        ejercicios: [
          {
            id: "ej-single",
            nombre: "Sentadilla con Barra",
            musculos_principales: ["Piernas"],
            descanso_segundos: 120,
            series: [
              { numero_serie: 1, peso_kg: 100, reps_hechas: 5, completada: false },
            ],
          },
        ],
      };

      store.setSession(mockSession as any);
      // Forzar timer activo previo simulando una serie anterior
      store.startRestTimer(60, "Sentadilla", 1);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);

      // Completar la última serie
      store.completeSet("ej-single", 1);

      const finalState = useAthleteStore.getState();
      // El timer debe estar detenido porque ya terminó todo el entrenamiento
      expect(finalState.restTimer.isActive).toBe(false);
      expect(finalState.restTimer.secondsRemaining).toBe(0);
    });
  });

  describe("Item 3: Indicador de 'Último entrenamiento realizado' (GH #175 / GOZS-171)", () => {
    const mockDias: DiaRutinaItem[] = [
      { id: "dia-1", orden: 1, nombre: "Tren Superior", ejerciciosCount: 6, duracionMinutos: 50 },
      { id: "dia-2", orden: 2, nombre: "Tren Inferior", ejerciciosCount: 5, duracionMinutos: 45 },
      { id: "dia-3", orden: 3, nombre: "Fullbody", ejerciciosCount: 6, duracionMinutos: 55 },
    ];

    it("devuelve null cuando no hay sesiones previas registradas", () => {
      const resultado = calcularUltimoDiaRealizado(mockDias, []);
      expect(resultado).toBeNull();
    });

    it("identifica correctamente el último día realizado y formatea fecha y tiempo relativo", () => {
      const refDate = new Date("2026-10-26T12:00:00.000Z");
      const mockSesiones: RegistroSesionSimple[] = [
        { id: "s1", dia_id: "dia-1", fecha: "2026-10-20T18:00:00.000Z" },
        { id: "s2", dia_id: "dia-2", fecha: "2026-10-24T18:00:00.000Z" }, // Hace 2 días
      ];

      const resultado = calcularUltimoDiaRealizado(mockDias, mockSesiones, refDate);
      expect(resultado).not.toBeNull();
      expect(resultado?.dia.id).toBe("dia-2");
      expect(resultado?.dia.nombre).toBe("Tren Inferior");
      expect(resultado?.tiempoRelativo).toBe("Hace 2 días");
    });

    it("formatea 'Hoy' cuando la sesión fue completada en la fecha actual", () => {
      const refDate = new Date("2026-10-26T12:00:00.000Z");
      const mockSesiones: RegistroSesionSimple[] = [
        { id: "s-hoy", dia_id: "dia-1", fecha: "2026-10-26T09:30:00.000Z" },
      ];

      const resultado = calcularUltimoDiaRealizado(mockDias, mockSesiones, refDate);
      expect(resultado?.tiempoRelativo).toBe("Hoy");
    });

    it("formatea 'Ayer' cuando la sesión fue completada 1 día antes", () => {
      const refDate = new Date("2026-10-26T12:00:00.000Z");
      const mockSesiones: RegistroSesionSimple[] = [
        { id: "s-ayer", dia_id: "dia-3", fecha: "2026-10-25T19:00:00.000Z" },
      ];

      const resultado = calcularUltimoDiaRealizado(mockDias, mockSesiones, refDate);
      expect(resultado?.tiempoRelativo).toBe("Ayer");
      expect(resultado?.dia.nombre).toBe("Fullbody");
    });

    it("ignora sesiones con dia_id que no pertenecen a los días del plan actual", () => {
      const mockSesiones: RegistroSesionSimple[] = [
        { id: "s-otro-plan", dia_id: "dia-inexistente", fecha: "2026-10-25T18:00:00.000Z" },
      ];

      const resultado = calcularUltimoDiaRealizado(mockDias, mockSesiones);
      expect(resultado).toBeNull();
    });
  });
});
