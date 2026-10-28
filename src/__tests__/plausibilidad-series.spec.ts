import * as fs from "node:fs";
import * as path from "node:path";
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

  describe("Auditoría estricta de límites matemáticos y representación numérica (Infinity, -Infinity, 1e999)", () => {
    it.each([
      // [desc, peso, reps, rpe]
      ["peso Infinity numérico", Infinity, 10, 8],
      ["peso -Infinity numérico", -Infinity, 10, 8],
      ["peso 1e999 numérico (desborde a Infinity)", 1e999, 10, 8],
      ["peso 'Infinity' string", "Infinity", 10, 8],
      ["peso '-Infinity' string", "-Infinity", 10, 8],
      ["peso '1e999' string (notación científica)", "1e999", 10, 8],
      ["reps Infinity numérico", 20, Infinity, 8],
      ["reps -Infinity numérico", 20, -Infinity, 8],
      ["reps 1e999 numérico", 20, 1e999, 8],
      ["reps 'Infinity' string", 20, "Infinity", 8],
      ["reps '1e999' string", 20, "1e999", 8],
      ["rpe Infinity numérico", 20, 10, Infinity],
      ["rpe -Infinity numérico", 20, 10, -Infinity],
      ["rpe 1e999 numérico", 20, 10, 1e999],
      ["rpe 'Infinity' string", 20, 10, "Infinity"],
      ["rpe '1e999' string", 20, 10, "1e999"],
    ])("rechaza %s en normalizarEntradaSerie", (_desc, peso, reps, rpe) => {
      const res = normalizarEntradaSerie(peso, reps, rpe);
      expect(res.valido).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("evaluarPlausibilidadSerie bloquea inmediatamente entradas con Infinity o desborde", () => {
      expect(evaluarPlausibilidadSerie({ peso: Infinity, reps: 10 }).estado).toBe("bloqueado");
      expect(evaluarPlausibilidadSerie({ peso: 1e999, reps: 10 }).estado).toBe("bloqueado");
      expect(evaluarPlausibilidadSerie({ peso: 20, reps: Infinity }).estado).toBe("bloqueado");
      expect(evaluarPlausibilidadSerie({ peso: 20, reps: 10, rpe: Infinity }).estado).toBe("bloqueado");
    });
  });

  describe("Auditoría estricta de coma decimal y formatos locales", () => {
    it.each([
      ["12,5", 12.5],
      ["0,5", 0.5],
      ["100,25", 100.25],
      ["75,0", 75],
    ])("normaliza coma decimal '%s' a número flotante %s", (rawPeso, esperado) => {
      const res = normalizarEntradaSerie(rawPeso, 10);
      expect(res.valido).toBe(true);
      expect(res.peso).toBe(esperado);
    });

    it.each([
      ["12,5,3", "múltiples comas"],
      [",5", "sin cero antes de la coma"],
      ["12..5", "doble punto"],
    ])("rechaza formato de coma decimal corrupto (%s: %s)", (rawPeso) => {
      const res = normalizarEntradaSerie(rawPeso, 10);
      expect(res.valido).toBe(false);
    });
  });

  describe("Auditoría de rescate de GOZS-203: Renderizado literal de texto (cero dangerouslySetInnerHTML)", () => {
    const athleteFiles = [
      "live-workout.tsx",
      "historial-sesiones.tsx",
      "athlete-chat.tsx",
      "cuestionario-inicial.tsx",
      "pain-report-modal.tsx",
    ];

    it.each(athleteFiles)(
      "componente %s no utiliza dangerouslySetInnerHTML para renderizar entradas de usuario",
      (fileName) => {
        const filePath = path.resolve(__dirname, `../components/athlete/${fileName}`);
        const code = fs.readFileSync(filePath, "utf-8");
        expect(code).not.toContain("dangerouslySetInnerHTML");
      },
    );
  });
});
