import { describe, expect, it } from "vitest";
import {
  calcularMediana,
  esGrupoMuscularPequeno,
  evaluarPlausibilidadSerie,
  normalizarEntradaSerie,
} from "@/lib/plausibilidad-series";

describe("Guardas de plausibilidad de series (GOZS-200)", () => {
  describe("normalizarEntradaSerie - Normalización y rechazo de basura", () => {
    it.each([
      // [peso, reps, rpe, esperadoValido, esperadoPeso, esperadoReps, esperadoRpe]
      ["20", "10", "8", true, 20, 10, 8],
      ["12,5", "8", "7.5", true, 12.5, 8, 7.5],
      ["0", "15", null, true, 0, 15, null],
      [50.5, 12, undefined, true, 50.5, 12, null],
      ["  45.0  ", "  6  ", "  9  ", true, 45, 6, 9],
      // Casos inválidos de peso
      ["-5", "10", "8", false, undefined, undefined, undefined],
      [-10, 10, 8, false, undefined, undefined, undefined],
      ["1e3", "10", "8", false, undefined, undefined, undefined],
      ["1E2", "10", "8", false, undefined, undefined, undefined],
      ["", "10", "8", false, undefined, undefined, undefined],
      ["abc", "10", "8", false, undefined, undefined, undefined],
      [NaN, 10, 8, false, undefined, undefined, undefined],
      // Casos inválidos de reps
      ["20", "-1", "8", false, undefined, undefined, undefined],
      ["20", "101", "8", false, undefined, undefined, undefined],
      ["20", "10.5", "8", false, undefined, undefined, undefined],
      ["20", "1e2", "8", false, undefined, undefined, undefined],
      ["20", "", "8", false, undefined, undefined, undefined],
      // Casos inválidos de RPE
      ["20", "10", "0", false, undefined, undefined, undefined],
      ["20", "10", "10.5", false, undefined, undefined, undefined],
      ["20", "10", "1e1", false, undefined, undefined, undefined],
      ["20", "10", "rpe8", false, undefined, undefined, undefined],
    ])(
      "normalizarEntradaSerie(%s, %s, %s) => valido: %s",
      (peso, reps, rpe, esperadoValido, esperadoPeso, esperadoReps, esperadoRpe) => {
        const res = normalizarEntradaSerie(peso, reps, rpe);
        expect(res.valido).toBe(esperadoValido);
        if (esperadoValido) {
          expect(res.peso).toBe(esperadoPeso);
          expect(res.reps).toBe(esperadoReps);
          expect(res.rpe).toBe(esperadoRpe);
        } else {
          expect(res.error).toBeDefined();
        }
      },
    );
  });

  describe("calcularMediana", () => {
    it("devuelve 0 si el arreglo está vacío", () => {
      expect(calcularMediana([])).toBe(0);
    });

    it("calcula mediana en arreglo impar", () => {
      expect(calcularMediana([10, 30, 20])).toBe(20);
    });

    it("calcula mediana en arreglo par", () => {
      expect(calcularMediana([10, 20, 30, 40])).toBe(25);
    });
  });

  describe("esGrupoMuscularPequeno", () => {
    it.each([
      [["Bíceps"], undefined, true],
      [["deltoides anterior"], undefined, true],
      [["Hombros"], undefined, true],
      [["antebrazo"], undefined, true],
      [[], "Curl de Bíceps en Banco Scott", true],
      [[], "Vuelos laterales con mancuerna", false], // sin hombro en nombre
      [["Hombro lateral"], "Vuelos laterales", true],
      [["Cuádriceps", "Glúteos"], "Sentadilla con Barra", false],
      [["Pectoral mayor"], "Press de Banca Plano", false],
    ])("reconoce músculos chicos: musculos=%s, nombre=%s => %s", (musc, nombre, esperado) => {
      expect(esGrupoMuscularPequeno(musc, nombre)).toBe(esperado);
    });
  });

  describe("evaluarPlausibilidadSerie - Topes duros sin historial", () => {
    it("bloquea cualquier ejercicio que supere 500 kg", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 501,
        reps: 5,
        historialPesos: [],
      });
      expect(res.estado).toBe("bloqueado");
      if (res.estado === "bloqueado") {
        expect(res.error).toContain("500 kg");
      }
    });

    it("bloquea bíceps > 60 kg sin historial", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 70,
        reps: 10,
        musculos: ["Bíceps"],
        historialPesos: [],
      });
      expect(res.estado).toBe("bloqueado");
      if (res.estado === "bloqueado") {
        expect(res.error).toContain("tope de 60 kg");
      }
    });

    it("permite bíceps <= 60 kg sin historial", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 25,
        reps: 10,
        musculos: ["Bíceps"],
        historialPesos: [],
      });
      expect(res.estado).toBe("valido");
    });

    it("permite ejercicios de piernas/pecho > 60 kg sin historial (hasta 500 kg)", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 100,
        reps: 8,
        musculos: ["Cuádriceps"],
        historialPesos: [],
      });
      expect(res.estado).toBe("valido");
    });
  });

  describe("evaluarPlausibilidadSerie - Detección de atipicidad con historial", () => {
    const historial20 = [20, 20, 20];

    it("detecta typo de cero hacia arriba (ej. 200 kg cuando el último/mediana fue 20 kg)", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 200,
        reps: 10,
        historialPesos: historial20,
        ultimoPeso: 20,
      });
      expect(res.estado).toBe("requiere_confirmacion");
      if (res.estado === "requiere_confirmacion") {
        expect(res.mensaje).toBe("¿Seguro? Tu último fue 20 kg");
        expect(res.peso).toBe(200);
      }
    });

    it("detecta typo de cero hacia abajo (ej. 2 kg cuando el último/mediana fue 20 kg, ratio ÷10)", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 2,
        reps: 10,
        historialPesos: historial20,
        ultimoPeso: 20,
      });
      expect(res.estado).toBe("requiere_confirmacion");
      if (res.estado === "requiere_confirmacion") {
        expect(res.mensaje).toBe("¿Seguro? Tu último fue 20 kg");
        expect(res.peso).toBe(2);
      }
    });

    it("detecta incremento > 2.5x la mediana (ej. 55 kg sobre mediana de 20 kg)", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 55,
        reps: 10,
        historialPesos: historial20,
        ultimoPeso: 20,
      });
      expect(res.estado).toBe("requiere_confirmacion");
      if (res.estado === "requiere_confirmacion") {
        expect(res.mensaje).toBe("¿Seguro? Tu último fue 20 kg");
      }
    });

    it("permite pesos plausibles (ej. 22.5 kg sobre mediana de 20 kg)", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 22.5,
        reps: 10,
        historialPesos: historial20,
        ultimoPeso: 20,
      });
      expect(res.estado).toBe("valido");
    });

    it("permite pesos de peso corporal (0 kg)", () => {
      const res = evaluarPlausibilidadSerie({
        peso: 0,
        reps: 12,
        historialPesos: [0, 0, 0],
      });
      expect(res.estado).toBe("valido");
    });
  });
});
