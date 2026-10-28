import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  validarInputSerie,
  evaluarPlausibilidadSerie,
  sanearTexto,
  escaparHtml,
  FACTOR_PLAUSIBILIDAD_PESO,
  MAX_PESO_ABSOLUTO_PLAUSIBLE,
  MAX_REPS_PLAUSIBLES,
  MAX_REPS_BLOQUEO,
} from "@/lib/plausibilidad";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

/**
 * ============================================================================
 * Athlete App: Validación de Plausibilidad y Saneo de Inputs (GOZS-203)
 *
 * Criterios de Aceptación Gherkin:
 * 1. GIVEN historial de 20 kg en un ejercicio WHEN el atleta ingresa 200 kg
 *    (o >~3x del máximo histórico / reps absurdas) THEN se muestra un <dialog>
 *    de confirmación explícita antes de guardar.
 * 2. GIVEN peso negativo, NaN, reps 0 o >100, RPE fuera de 1-10 WHEN intenta
 *    completar la serie THEN el input lo bloquea con mensaje claro (min/max/step nativos).
 * 3. GIVEN notas/chat/nombres con <script>, <img onerror> o ' OR 1=1-- WHEN se guardan
 *    y renderizan THEN se muestran como texto literal (sin dangerouslySetInnerHTML).
 * 4. GIVEN la lógica de plausibilidad WHEN se testea THEN existe función pura con spec Vitest.
 * ============================================================================
 */

describe("GOZS-203: Validación de Plausibilidad y Saneo de Inputs en Athlete App", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const athleteChatPath = path.resolve(__dirname, "../components/athlete/athlete-chat.tsx");
  const painModalPath = path.resolve(__dirname, "../components/athlete/pain-report-modal.tsx");
  const historialPath = path.resolve(__dirname, "../components/athlete/historial-sesiones.tsx");
  const cuestionarioPath = path.resolve(__dirname, "../components/athlete/cuestionario-inicial.tsx");

  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
  const athleteChatCode = fs.readFileSync(athleteChatPath, "utf-8");
  const painModalCode = fs.readFileSync(painModalPath, "utf-8");
  const historialCode = fs.readFileSync(historialPath, "utf-8");
  const cuestionarioCode = fs.readFileSync(cuestionarioPath, "utf-8");

  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().clearSerieValidationError();
    useAthleteStore.getState().clearRpeValidationError();
  });

  describe("Criterio 4: Lógica de plausibilidad en función pura", () => {
    it("valida correctamente límites duros: peso no negativo ni NaN", () => {
      // Peso negativo
      const resNeg = validarInputSerie(-5, 10);
      expect(resNeg.esValido).toBe(false);
      expect(resNeg.error).toContain("negativo");
      expect(resNeg.campo).toBe("peso");

      // Peso NaN
      const resNaN = validarInputSerie(NaN, 10);
      expect(resNaN.esValido).toBe(false);
      expect(resNaN.error).toContain("NaN");

      // Peso válido (incluye 0 para ejercicios de peso corporal)
      const resCero = validarInputSerie(0, 10);
      expect(resCero.esValido).toBe(true);

      const resValido = validarInputSerie(85.5, 10);
      expect(resValido.esValido).toBe(true);
    });

    it("valida correctamente límites duros: reps entre 1 y 100, entero y no NaN", () => {
      // Reps 0
      const resCero = validarInputSerie(20, 0);
      expect(resCero.esValido).toBe(false);
      expect(resCero.error).toContain("entre 1 y 100");
      expect(resCero.campo).toBe("reps");

      // Reps negativas
      const resNeg = validarInputSerie(20, -1);
      expect(resNeg.esValido).toBe(false);

      // Reps > 100
      const resMax = validarInputSerie(20, 101);
      expect(resMax.esValido).toBe(false);
      expect(resMax.error).toContain("entre 1 y 100");

      const resAbsurdo = validarInputSerie(20, 250);
      expect(resAbsurdo.esValido).toBe(false);

      // Reps decimales (deben ser enteras)
      const resDecimal = validarInputSerie(20, 8.5);
      expect(resDecimal.esValido).toBe(false);
      expect(resDecimal.error).toContain("entero");

      // Reps válidas en límites
      expect(validarInputSerie(20, 1).esValido).toBe(true);
      expect(validarInputSerie(20, 100).esValido).toBe(true);
    });

    it("valida correctamente límites duros: RPE entre 1.0 y 10.0 cuando está definido", () => {
      // RPE menor a 1.0
      const resMenor = validarInputSerie(50, 8, 0.5);
      expect(resMenor.esValido).toBe(false);
      expect(resMenor.error).toContain("RPE");
      expect(resMenor.campo).toBe("rpe");

      // RPE mayor a 10.0
      const resMayor = validarInputSerie(50, 8, 10.5);
      expect(resMayor.esValido).toBe(false);
      expect(resMayor.error).toContain("RPE");

      // RPE NaN
      const resNaN = validarInputSerie(50, 8, NaN);
      expect(resNaN.esValido).toBe(false);

      // RPE válido o ausente
      expect(validarInputSerie(50, 8, null).esValido).toBe(true);
      expect(validarInputSerie(50, 8, undefined).esValido).toBe(true);
      expect(validarInputSerie(50, 8, 1.0).esValido).toBe(true);
      expect(validarInputSerie(50, 8, 8.5).esValido).toBe(true);
      expect(validarInputSerie(50, 8, 10.0).esValido).toBe(true);
    });
  });

  describe("Criterio 1: Confirmación de plausibilidad con diálogo explícito", () => {
    it("GIVEN historial de 20 kg WHEN el atleta ingresa 200 kg (>3x) THEN requiere confirmación explícita", () => {
      const historial = { max_peso_kg: 20, max_reps: 10 };
      const serie = { peso_kg: 200, reps_hechas: 10 };

      const res = evaluarPlausibilidadSerie(serie, historial);

      expect(res.requiereConfirmacion).toBe(true);
      expect(res.razon).toBe("PESO_EXCESIVO");
      expect(res.advertencia).toContain("200 kg");
      expect(res.advertencia).toContain("3 veces");
      expect(res.advertencia).toContain("20 kg");
    });

    it("GIVEN historial de 20 kg WHEN el atleta ingresa un incremento razonable (30 kg o 50 kg <= 3x) THEN no requiere confirmación", () => {
      const historial = { max_peso_kg: 20, max_reps: 10 };
      const res = evaluarPlausibilidadSerie({ peso_kg: 30, reps_hechas: 10 }, historial);

      expect(res.requiereConfirmacion).toBe(false);
      expect(res.advertencia).toBeNull();
    });

    it("GIVEN peso absoluto mayor a 500 kg sin historial THEN requiere confirmación explícita", () => {
      const res = evaluarPlausibilidadSerie({ peso_kg: 520, reps_hechas: 5 }, null);

      expect(res.requiereConfirmacion).toBe(true);
      expect(res.razon).toBe("PESO_EXCESIVO");
      expect(res.advertencia).toContain("520 kg");
    });

    it("GIVEN repeticiones absurdas (>50 reps o >3x historial) THEN requiere confirmación explícita", () => {
      // Caso 1: > 50 reps absolutas
      const resAbsoluto = evaluarPlausibilidadSerie({ peso_kg: 40, reps_hechas: 65 }, null);
      expect(resAbsoluto.requiereConfirmacion).toBe(true);
      expect(resAbsoluto.razon).toBe("REPS_EXCESIVAS");
      expect(resAbsoluto.advertencia).toContain("65 repeticiones");

      // Caso 2: > 3x historial previo
      const historial = { max_peso_kg: 40, max_reps: 12 };
      const resRelativo = evaluarPlausibilidadSerie({ peso_kg: 40, reps_hechas: 45 }, historial);
      expect(resRelativo.requiereConfirmacion).toBe(true);
      expect(resRelativo.razon).toBe("REPS_EXCESIVAS");
      expect(resRelativo.advertencia).toContain("45 repeticiones");
    });

    it("live-workout.tsx contiene el elemento <dialog> nativo HTML5 para confirmación explícita", () => {
      expect(liveWorkoutCode).toContain("<dialog");
      expect(liveWorkoutCode).toContain('data-testid="dialog-confirmacion-plausibilidad"');
      expect(liveWorkoutCode).toContain('data-testid="plausibility-warning-text"');
      expect(liveWorkoutCode).toContain('data-testid="btn-cancelar-plausibilidad"');
      expect(liveWorkoutCode).toContain('data-testid="btn-confirmar-plausibilidad"');
      expect(liveWorkoutCode).toContain("evaluarPlausibilidadSerie");
    });
  });

  describe("Criterio 2: Bloqueo duro con mensaje claro y atributos HTML5 nativos", () => {
    it("los inputs de live-workout cuentan con min, max, step nativos", () => {
      // Input de peso
      expect(liveWorkoutCode).toContain('type="number"');
      expect(liveWorkoutCode).toContain('step="any"');
      expect(liveWorkoutCode).toContain('min="0"');
      expect(liveWorkoutCode).toContain('max="1000"');

      // Input de reps
      expect(liveWorkoutCode).toContain('step="1"');
      expect(liveWorkoutCode).toContain('min="1"');
      expect(liveWorkoutCode).toContain('max="100"');

      // Banner de error de validación
      expect(liveWorkoutCode).toContain('data-testid="error-validacion-serie"');
    });

    it("el store useAthleteStore bloquea la compleción de serie si el peso es negativo o NaN", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // Intentar completar con peso negativo
      store.updateSetField(exerciseId, 1, "peso_kg", -20);
      store.completeSet(exerciseId, 1);

      const stateAfterNeg = useAthleteStore.getState();
      const set1 = stateAfterNeg.currentSession.ejercicios
        .find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      expect(set1?.completada).toBe(false);
      expect(stateAfterNeg.serieValidationError).toContain("negativo");

      // Intentar completar con NaN
      store.updateSetField(exerciseId, 1, "peso_kg", NaN);
      store.completeSet(exerciseId, 1);

      const stateAfterNaN = useAthleteStore.getState();
      expect(stateAfterNaN.serieValidationError).toContain("NaN");
    });

    it("el store useAthleteStore bloquea la compleción de serie si reps es 0 o >100", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // Reps 0
      store.updateSetField(exerciseId, 1, "peso_kg", 50);
      store.updateSetField(exerciseId, 1, "reps_hechas", 0);
      store.completeSet(exerciseId, 1);

      const stateAfterCero = useAthleteStore.getState();
      const set1 = stateAfterCero.currentSession.ejercicios
        .find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      expect(set1?.completada).toBe(false);
      expect(stateAfterCero.serieValidationError).toContain("entre 1 y 100");

      // Reps > 100
      store.updateSetField(exerciseId, 1, "reps_hechas", 120);
      store.completeSet(exerciseId, 1);

      const stateAfterMax = useAthleteStore.getState();
      expect(stateAfterMax.serieValidationError).toContain("entre 1 y 100");
    });

    it("el store useAthleteStore bloquea la compleción de serie si RPE está fuera de 1-10", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      store.updateSetField(exerciseId, 1, "peso_kg", 50);
      store.updateSetField(exerciseId, 1, "reps_hechas", 8);
      store.updateSetField(exerciseId, 1, "rpe_real", 15);
      store.completeSet(exerciseId, 1);

      const stateAfterRpe = useAthleteStore.getState();
      expect(stateAfterRpe.serieValidationError).toContain("RPE");
    });

    it("permite completar la serie cuando los datos están dentro de los rangos válidos", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      store.updateSetField(exerciseId, 1, "peso_kg", 60);
      store.updateSetField(exerciseId, 1, "reps_hechas", 8);
      store.updateSetField(exerciseId, 1, "rpe_real", 8);
      store.completeSet(exerciseId, 1);

      const stateAfter = useAthleteStore.getState();
      const set1 = stateAfter.currentSession.ejercicios
        .find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      expect(set1?.completada).toBe(true);
      expect(stateAfter.serieValidationError).toBeNull();
    });
  });

  describe("Criterio 3: Saneo y renderizado como texto literal (cero dangerouslySetInnerHTML)", () => {
    it("la función sanearTexto remueve caracteres nulos y de control invisibles", () => {
      const inputConNull = "Notas con null\u0000 y control\u0007";
      const limpio = sanearTexto(inputConNull);
      expect(limpio).toBe("Notas con null y control");
      expect(limpio).not.toContain("\u0000");
      expect(limpio).not.toContain("\u0007");
    });

    it("la función escaparHtml sanitiza secuencias HTML peligrosas", () => {
      const scriptPayload = "<script>alert('xss')</script>";
      const escapedScript = escaparHtml(scriptPayload);
      expect(escapedScript).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");

      const imgPayload = "<img src=x onerror=alert(1)>";
      const escapedImg = escaparHtml(imgPayload);
      expect(escapedImg).toBe("&lt;img src=x onerror=alert(1)&gt;");

      const sqlPayload = "' OR 1=1--";
      const escapedSql = escaparHtml(sqlPayload);
      expect(escapedSql).toBe("&#39; OR 1=1--");
    });

    it("el chat de atleta procesa y almacena mensajes con sanearTexto", () => {
      expect(athleteChatCode).toContain("sanearTexto");
      expect(athleteChatCode).toContain("{msg.contenido}");
      // Verifica que no se use dangerouslySetInnerHTML en el chat
      expect(athleteChatCode).not.toContain("dangerouslySetInnerHTML");
    });

    it("el modal de dolor sanea las notas del alumno antes de guardarlas", () => {
      expect(painModalCode).toContain("sanearTexto(notasAlumno)");
      expect(painModalCode).not.toContain("dangerouslySetInnerHTML");
    });

    it("el cuestionario inicial sanea molestias y comentarios del alumno", () => {
      expect(cuestionarioCode).toContain("sanearTexto(molestias)");
      expect(cuestionarioCode).toContain("sanearTexto(comentarios)");
      expect(cuestionarioCode).not.toContain("dangerouslySetInnerHTML");
    });

    it("ningún componente de atleta usa dangerouslySetInnerHTML sobre input de usuario", () => {
      expect(liveWorkoutCode).not.toContain("dangerouslySetInnerHTML");
      expect(historialCode).not.toContain("dangerouslySetInnerHTML");
    });
  });
});
