import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { MarcasEjercicio } from "@/lib/record-ejercicio";
import {
  evaluarDatosAproximacion,
  calcularSeriesAproximacion,
  calcularEpleyGOZS236,
  esEjercicioAislamiento,
  esRepsTrabajoLigero,
  redondearA2_5,
  MENSAJE_SIN_DATOS,
  MENSAJE_UNA_SESION,
  MENSAJE_ANTIGUEDAD_8_SEMANAS,
} from "@/lib/aproximacion-pr";

describe("Cálculo de series de aproximación según último PR (GOZS-236, GOZS-276)", () => {
  const FECHA_HOY = new Date("2026-10-29T10:00:00Z");

  describe("1. Fórmulas matemáticas y redondeos", () => {
    it("redondearA2_5 redondea al múltiplo de 2.5 kg más cercano con mínimo de barra vacía (20 kg)", () => {
      expect(redondearA2_5(15)).toBe(20);
      expect(redondearA2_5(21.2)).toBe(20);
      expect(redondearA2_5(21.3)).toBe(22.5);
      expect(redondearA2_5(51)).toBe(50);
      expect(redondearA2_5(52)).toBe(52.5);
      expect(redondearA2_5(85)).toBe(85);
    });

    it("calcularEpleyGOZS236 aplica peso × (1 + reps/30) solo para reps entre 2 y 10", () => {
      // 100 kg × 5 reps = 100 × (1 + 5/30) = 116.67
      expect(calcularEpleyGOZS236(100, 5)).toBeCloseTo(116.666, 2);

      // Fuera de rango 2-10 reps devuelve 0
      expect(calcularEpleyGOZS236(100, 1)).toBe(0);
      expect(calcularEpleyGOZS236(100, 11)).toBe(0);
      expect(calcularEpleyGOZS236(100, 15)).toBe(0);
      expect(calcularEpleyGOZS236(0, 5)).toBe(0);
    });

    it("esRepsTrabajoLigero identifica repeticiones objetivo mayores a 12", () => {
      expect(esRepsTrabajoLigero("15")).toBe(true);
      expect(esRepsTrabajoLigero("12-15")).toBe(true);
      expect(esRepsTrabajoLigero("8-10")).toBe(false);
      expect(esRepsTrabajoLigero("5")).toBe(false);
      expect(esRepsTrabajoLigero(null)).toBe(false);
    });

    it("esEjercicioAislamiento detecta ejercicios de aislamiento por nombre", () => {
      expect(esEjercicioAislamiento("Curl de bíceps en banco Scott")).toBe(true);
      expect(esEjercicioAislamiento("Extensiones de tríceps en polea")).toBe(true);
      expect(esEjercicioAislamiento("Vuelos laterales con mancuerna")).toBe(true);
      expect(esEjercicioAislamiento("Sentadilla trasera con barra")).toBe(false);
      expect(esEjercicioAislamiento("Press banca plano")).toBe(false);
    });
  });

  describe("2. Evaluación del estado de datos (Mínimo de datos para recomendar)", () => {
    it("GIVEN alumno con 0 sesiones (sin marcas o marcas vacías) THEN estado sin_datos y mensaje oficial", () => {
      const resNull = evaluarDatosAproximacion(null);
      expect(resNull.estado).toBe("sin_datos");
      expect(resNull.pesoSugerido).toBeNull();
      expect(resNull.mensajeAviso).toBe(MENSAJE_SIN_DATOS);

      const marcasVacias: MarcasEjercicio = {
        ejercicio_id: "ej-bench",
        frontera: [],
        max_peso_kg: 0,
        max_epley_kg: 0,
      };
      const resVacias = evaluarDatosAproximacion(marcasVacias);
      expect(resVacias.estado).toBe("sin_datos");
      expect(resVacias.pesoSugerido).toBeNull();
      expect(resVacias.mensajeAviso).toBe(MENSAJE_SIN_DATOS);
    });

    it("GIVEN alumno con 1 sesión previa con serie efectiva 2-10 reps THEN recomendación marcada como 'estimada'", () => {
      const marcasUnaSesion: MarcasEjercicio = {
        ejercicio_id: "ej-bench",
        frontera: [{ peso_kg: 80, reps_hechas: 5, fecha: "2026-10-25T10:00:00Z" }],
        max_peso_kg: 80,
        max_epley_kg: 93.3,
      };

      const res = evaluarDatosAproximacion(marcasUnaSesion, { fechaReferencia: FECHA_HOY });
      expect(res.estado).toBe("estimada");
      expect(res.motivoEstimada).toBe("una_sesion");
      expect(res.mensajeAviso).toBe(MENSAJE_UNA_SESION);
      // W = max(80, 80*(1+5/30)=93.33) = 93.33 -> redondeado a 2.5 = 92.5
      expect(res.pesoSugerido).toBe(92.5);
      expect(res.ultimoPRKg).toBe(80);
      expect(res.mejorE1RMKg).toBe(93.3);
    });

    it("GIVEN alumno con 2 o más sesiones recientes (< 8 semanas) THEN recomendación normal", () => {
      const marcasDosSesiones: MarcasEjercicio = {
        ejercicio_id: "ej-squat",
        frontera: [
          { peso_kg: 90, reps_hechas: 6, fecha: "2026-10-15T10:00:00Z" },
          { peso_kg: 100, reps_hechas: 3, fecha: "2026-10-22T10:00:00Z" },
        ],
        max_peso_kg: 100,
        max_epley_kg: 110,
      };

      const res = evaluarDatosAproximacion(marcasDosSesiones, { fechaReferencia: FECHA_HOY });
      expect(res.estado).toBe("normal");
      expect(res.motivoEstimada).toBeUndefined();
      expect(res.pesoSugerido).toBe(110);
      expect(res.ultimoPRKg).toBe(100);
      expect(res.mejorE1RMKg).toBe(110);
    });

    it("GIVEN último dato con más de 8 semanas de antigüedad THEN se marca como 'estimada' y sugiere confirmar", () => {
      const marcasViejas: MarcasEjercicio = {
        ejercicio_id: "ej-deadlift",
        frontera: [
          { peso_kg: 120, reps_hechas: 5, fecha: "2026-06-01T10:00:00Z" },
          { peso_kg: 130, reps_hechas: 3, fecha: "2026-06-15T10:00:00Z" },
        ],
        max_peso_kg: 130,
        max_epley_kg: 143,
      };

      const res = evaluarDatosAproximacion(marcasViejas, { fechaReferencia: FECHA_HOY });
      expect(res.estado).toBe("estimada");
      expect(res.motivoEstimada).toBe("antiguedad_8_semanas");
      expect(res.mensajeAviso).toBe(MENSAJE_ANTIGUEDAD_8_SEMANAS);
      expect(res.pesoSugerido).toBe(142.5);
    });
  });

  describe("3. Cálculo de series y reglas de recorte (GOZS-236)", () => {
    it("para W = 100 kg en ejercicio compuesto genera 4 series progresivas escalonadas", () => {
      const series = calcularSeriesAproximacion(100);
      expect(series).toHaveLength(4);

      // Serie 1: barra vacía (20 kg) × 8 reps
      expect(series[0]).toMatchObject({
        setNumber: 1,
        peso_kg: 20,
        reps: 8,
        percentage: 0,
        set_type: "WARMUP",
      });

      // Serie 2: 50% (50 kg) × 5 reps
      expect(series[1]).toMatchObject({
        setNumber: 2,
        peso_kg: 50,
        reps: 5,
        percentage: 50,
        set_type: "WARMUP",
      });

      // Serie 3: 70% (70 kg) × 3 reps
      expect(series[2]).toMatchObject({
        setNumber: 3,
        peso_kg: 70,
        reps: 3,
        percentage: 70,
        set_type: "WARMUP",
      });

      // Serie 4: 85% (85 kg) × 2 reps
      expect(series[3]).toMatchObject({
        setNumber: 4,
        peso_kg: 85,
        reps: 2,
        percentage: 85,
        set_type: "WARMUP",
      });
    });

    it("recorte de aislamiento o W < 40 kg: solo genera series 2 y 3 (50% y 70%)", () => {
      // Caso W < 40 kg (ej. 35 kg)
      const seriesLivianas = calcularSeriesAproximacion(35);
      expect(seriesLivianas.length).toBeLessThanOrEqual(2);
      expect(seriesLivianas[0]!.setNumber).toBe(1);
      expect(seriesLivianas[0]!.percentage).toBe(50);
      expect(seriesLivianas[1]!.setNumber).toBe(2);
      expect(seriesLivianas[1]!.percentage).toBe(70);

      // Caso aislamiento explícito con W = 50 kg
      const seriesAislamiento = calcularSeriesAproximacion(50, { esAislamiento: true });
      expect(seriesAislamiento).toHaveLength(2);
      expect(seriesAislamiento[0]!.percentage).toBe(50);
      expect(seriesAislamiento[1]!.percentage).toBe(70);
    });

    it("recorte de trabajo ligero (RPE <= 6 o > 12 reps objetivo): solo series 1 y 2", () => {
      // Caso RPE 6
      const seriesRpeBajo = calcularSeriesAproximacion(100, { rpeObjetivo: 6 });
      expect(seriesRpeBajo).toHaveLength(2);
      expect(seriesRpeBajo[0]!.percentage).toBe(0); // Barra vacía
      expect(seriesRpeBajo[1]!.percentage).toBe(50);

      // Caso reps objetivo > 12 (ej. 15 reps)
      const seriesRepsAltas = calcularSeriesAproximacion(100, { repeticionesObjetivo: "15" });
      expect(seriesRepsAltas).toHaveLength(2);
      expect(seriesRepsAltas[0]!.percentage).toBe(0);
      expect(seriesRepsAltas[1]!.percentage).toBe(50);
    });

    it("omisión de series duplicadas con mismo peso redondeado", () => {
      // Si dos series consecutivas redondean al mismo peso (ej. barra de 20 kg), se descarta la repetida
      const series = calcularSeriesAproximacion(30, { esAislamiento: true });
      // 50% de 30 = 15 -> min 20 kg
      // 70% de 30 = 21 -> redondeo 20 kg
      // Ambas quedarían en 20 kg -> se descarta la duplicada y queda 1 sola
      expect(series).toHaveLength(1);
      expect(series[0]!.peso_kg).toBe(20);
      expect(series[0]!.setNumber).toBe(1);
    });
  });

  describe("4. Criterios de Aceptación Gherkin en WarmupModal y LiveWorkout", () => {
    const warmupModalPath = path.resolve(__dirname, "../components/athlete/warmup-modal.tsx");
    const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
    const warmupModalCode = fs.readFileSync(warmupModalPath, "utf-8");
    const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");

    it("el botón en LiveWorkout se titula 'Aproximación' y mantiene data-testid para backward compatibility", () => {
      expect(liveWorkoutCode).toContain("Aproximación");
      expect(liveWorkoutCode).toContain('data-testid={`warmup-btn-${currentExercise.id}`}');
      expect(liveWorkoutCode).toContain('data-testid={`aproximacion-btn-${currentExercise.id}`}');
    });

    it("WarmupModal recibe marcas, rpeObjetivo y repsObjetivo desde el ejercicio activo", () => {
      expect(liveWorkoutCode).toContain("marcas[warmupModalExercise.ejercicio_id || warmupModalExercise.id]");
      expect(liveWorkoutCode).toContain("rpeObjetivo={warmupModalExercise.rpe_objetivo}");
      expect(liveWorkoutCode).toContain("repsObjetivo={warmupModalExercise.repeticiones_objetivo}");
    });

    it("GIVEN alumno con PR previo THEN WarmupModal expone badge de cálculo PR y tabla de series sugeridas", () => {
      expect(warmupModalCode).toContain('data-testid="pr-summary-badge"');
      expect(warmupModalCode).toContain("Cálculo desde último PR:");
      expect(warmupModalCode).toContain('data-testid="progression-table"');
      expect(warmupModalCode).toContain('data-testid="apply-warmup-sets-btn"');
    });

    it("GIVEN alumno sin PR previo THEN WarmupModal expone aviso de registrar más sesiones y opción de cargar peso", () => {
      expect(warmupModalCode).toContain('data-testid="sin-datos-aviso"');
      expect(warmupModalCode).toContain("MENSAJE_SIN_DATOS");
      expect(warmupModalCode).toContain('data-testid="cargar-peso-manual-section"');
      expect(warmupModalCode).toContain('data-testid="target-weight-input"');
    });

    it("GIVEN recomendación estimada THEN WarmupModal expone alerta visual dedicada", () => {
      expect(warmupModalCode).toContain('data-testid="estimada-aviso"');
      expect(warmupModalCode).toContain("Recomendación Estimada");
    });
  });
});
