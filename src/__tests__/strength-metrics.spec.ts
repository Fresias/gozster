import { describe, expect, it } from 'vitest';
import {
  BARBELL_OPTIONS,
  calculateBarbellPlates,
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEffectiveTotalWeight,
  calculateEpley1RM,
  calculateTotalTonnage,
  parsePyramidRpeSteps,
  parseTargetRpe,
  validarRpeObjetivo,
  type VolumeBlock,
} from '@/lib/strength-metrics';
import { esNuevoRecord, type MarcasEjercicio, type SerieCandidata } from '@/lib/record-ejercicio';

describe('Métricas Matemáticas de Fuerza (GOZSter QA Suite - src/__tests__)', () => {
  describe('1RM Epley: Peso * (1 + Reps / 30)', () => {
    it('calcula exactamente el 1RM estimado para cargas estándar', () => {
      // 100 kg x 5 reps -> 100 * (1 + 5/30) = 116.6666...
      expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);
      // 120 kg x 10 reps -> 120 * (1 + 10/30) = 160
      expect(calculateEpley1RM(120, 10)).toBeCloseTo(160, 5);
      // 60 kg x 15 reps -> 60 * (1 + 15/30) = 90
      expect(calculateEpley1RM(60, 15)).toBe(90);
    });

    it('maneja casos límite: peso 0, reps 0 y valores negativos', () => {
      expect(calculateEpley1RM(0, 10)).toBe(0);
      expect(calculateEpley1RM(100, 0)).toBe(0);
      expect(calculateEpley1RM(0, 0)).toBe(0);
      expect(calculateEpley1RM(-100, 5)).toBe(0);
      expect(calculateEpley1RM(100, -5)).toBe(0);
      expect(calculateEpley1RM(-50, -10)).toBe(0);
    });

    it('maneja valores no finitos (NaN, Infinity)', () => {
      expect(calculateEpley1RM(Number.NaN, 5)).toBe(0);
      expect(calculateEpley1RM(100, Number.NaN)).toBe(0);
      expect(calculateEpley1RM(Number.POSITIVE_INFINITY, 5)).toBe(0);
    });
  });

  describe('1RM Brzycki: Peso / (1.0278 - 0.0278 * Reps)', () => {
    it('calcula exactamente el 1RM estimado para cargas estándar', () => {
      // 100 kg x 1 rep -> 100 / (1.0278 - 0.0278) = 100 / 1 = 100
      expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 5);
      // 100 kg x 5 reps -> 100 / (1.0278 - 0.139) = 100 / 0.8888 = 112.51125...
      expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 4);
      // 80 kg x 10 reps -> 80 / (1.0278 - 0.278) = 80 / 0.7498 = 106.6951...
      expect(calculateBrzycki1RM(80, 10)).toBeCloseTo(106.6951, 4);
    });

    it('maneja casos límite: peso 0, reps 0 y valores negativos', () => {
      expect(calculateBrzycki1RM(0, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, 0)).toBe(0);
      expect(calculateBrzycki1RM(0, 0)).toBe(0);
      expect(calculateBrzycki1RM(-100, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, -5)).toBe(0);
      expect(calculateBrzycki1RM(-80, -8)).toBe(0);
    });

    it('previene división por cero o denominador negativo en repeticiones extremas (>= 37)', () => {
      expect(calculateBrzycki1RM(100, 37)).toBe(0);
      expect(calculateBrzycki1RM(100, 50)).toBe(0);
    });

    it('maneja valores no finitos (NaN, Infinity)', () => {
      expect(calculateBrzycki1RM(Number.NaN, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, Number.NaN)).toBe(0);
      expect(calculateBrzycki1RM(Number.POSITIVE_INFINITY, 5)).toBe(0);
    });
  });

  describe('Cálculo de Volumen Total (Series * Reps * Peso) y Tonelaje Semanal', () => {
    it('calcula correctamente el volumen de un bloque individual', () => {
      expect(calculateBlockVolume(4, 10, 80)).toBe(3200);
      expect(calculateBlockVolume(5, 5, 140)).toBe(3500);
      expect(calculateBlockVolume(3, 8, 62.5)).toBe(1500);
    });

    it('maneja casos límite en volumen individual: peso 0, reps 0, series 0 y negativos', () => {
      expect(calculateBlockVolume(0, 10, 80)).toBe(0);
      expect(calculateBlockVolume(4, 0, 80)).toBe(0);
      expect(calculateBlockVolume(4, 10, 0)).toBe(0);
      expect(calculateBlockVolume(-4, 10, 80)).toBe(0);
      expect(calculateBlockVolume(4, -10, 80)).toBe(0);
      expect(calculateBlockVolume(4, 10, -80)).toBe(0);
      expect(calculateBlockVolume(-3, -8, -60)).toBe(0);
    });

    it('calcula el tonelaje total semanal sumando múltiples ejercicios y filtrando bloques inválidos', () => {
      const weeklyBlocks: VolumeBlock[] = [
        { series: 4, reps: 8, peso: 100 }, // 3200
        { series: 3, reps: 10, peso: 80 }, // 2400
        { series: 5, reps: 5, peso: 140 }, // 3500
      ];
      expect(calculateTotalTonnage(weeklyBlocks)).toBe(9100);

      const blocksWithEdgeCases: VolumeBlock[] = [
        { series: 4, reps: 8, peso: 100 }, // 3200
        { series: 3, reps: 0, peso: 80 },  // 0 (reps 0)
        { series: 3, reps: 10, peso: 0 },  // 0 (peso 0)
        { series: 3, reps: 10, peso: -50 }, // 0 (peso negativo)
      ];
      expect(calculateTotalTonnage(blocksWithEdgeCases)).toBe(3200);
      expect(calculateTotalTonnage([])).toBe(0);
    });
  });

  describe('Calculadora de Discos con Barras Alternativas y Normalización de PR (GH #184 / GOZS-178)', () => {
    it('dispone de las 3 opciones oficiales de barras (20 kg, 15 kg y 10 kg)', () => {
      expect(BARBELL_OPTIONS).toHaveLength(3);
      expect(BARBELL_OPTIONS.map((b) => b.weightKg)).toEqual([20, 15, 10]);
    });

    it('calcula discos exactos para barra olímpica de 20 kg', () => {
      // 70 kg total -> (70 - 20) / 2 = 25 kg por lado (1 disco de 25 kg)
      const res20 = calculateBarbellPlates(70, 20);
      expect(res20.barWeightKg).toBe(20);
      expect(res20.perSideWeightKg).toBe(25);
      expect(res20.totalWeightKg).toBe(70);
      expect(res20.platesPerSide).toEqual([{ weight: 25, count: 1 }]);
      expect(res20.remainderKg).toBe(0);
    });

    it('calcula discos exactos para barra semi-olímpica de 15 kg', () => {
      // 70 kg total -> (70 - 15) / 2 = 27.5 kg por lado (25 kg + 2.5 kg)
      const res15 = calculateBarbellPlates(70, 15);
      expect(res15.barWeightKg).toBe(15);
      expect(res15.perSideWeightKg).toBe(27.5);
      expect(res15.totalWeightKg).toBe(70);
      expect(res15.platesPerSide).toEqual([
        { weight: 25, count: 1 },
        { weight: 2.5, count: 1 },
      ]);
      expect(res15.remainderKg).toBe(0);
    });

    it('calcula discos exactos para barra corta de 10 kg', () => {
      // 70 kg total -> (70 - 10) / 2 = 30 kg por lado (25 kg + 5 kg)
      const res10 = calculateBarbellPlates(70, 10);
      expect(res10.barWeightKg).toBe(10);
      expect(res10.perSideWeightKg).toBe(30);
      expect(res10.totalWeightKg).toBe(70);
      expect(res10.platesPerSide).toEqual([
        { weight: 25, count: 1 },
        { weight: 5, count: 1 },
      ]);
      expect(res10.remainderKg).toBe(0);
    });

    it('normaliza y asienta el peso real total: calculateEffectiveTotalWeight(bar, perSide)', () => {
      // 30 kg por lado en barra de 10 kg = 70 kg reales (NO 80 kg)
      expect(calculateEffectiveTotalWeight(10, 30)).toBe(70);
      // 30 kg por lado en barra de 20 kg = 80 kg reales
      expect(calculateEffectiveTotalWeight(20, 30)).toBe(80);
      // 27.5 kg por lado en barra de 15 kg = 70 kg reales
      expect(calculateEffectiveTotalWeight(15, 27.5)).toBe(70);
      // Casos límite
      expect(calculateEffectiveTotalWeight(20, 0)).toBe(20);
      expect(calculateEffectiveTotalWeight(-10, 20)).toBe(0);
      expect(calculateEffectiveTotalWeight(20, -5)).toBe(0);
    });

    it('evita falsos PRs cuando un atleta levanta con barra liviana de 10 kg vs récord previo de 75 kg', () => {
      // Historial: Atleta tiene récord de 75 kg (en barra de 20 kg)
      const historial75: MarcasEjercicio = {
        ejercicio_id: 'press-banca',
        max_peso_kg: 75,
        max_epley_kg: calculateEpley1RM(75, 5),
        frontera: [{ peso_kg: 75, reps_hechas: 5, fecha: '2026-10-01' }],
      };

      // Si el atleta pone 30 kg por lado en barra de 10 kg, su peso real normalizado es 70 kg.
      const pesoNormalizado70 = calculateEffectiveTotalWeight(10, 30);
      expect(pesoNormalizado70).toBe(70);

      const serieConBarraLiviana: SerieCandidata = {
        peso_kg: pesoNormalizado70,
        reps_hechas: 5,
        set_type: 'NORMAL',
      };

      // 70 kg < 75 kg previo: NO debe considerarse récord (evita falso PR)
      const resultado = esNuevoRecord(serieConBarraLiviana, historial75);
      expect(resultado.esRecord).toBe(false);

      // En cambio, si pusiera 35 kg por lado en la barra de 10 kg = 80 kg reales (> 75 kg récord)
      const pesoNormalizado80 = calculateEffectiveTotalWeight(10, 35);
      expect(pesoNormalizado80).toBe(80);

      const serieRecordReal: SerieCandidata = {
        peso_kg: pesoNormalizado80,
        reps_hechas: 5,
        set_type: 'NORMAL',
      };
      const resultadoSuperado = esNuevoRecord(serieRecordReal, historial75);
      expect(resultadoSuperado.esRecord).toBe(true);
      expect(resultadoSuperado.tipo).toBe('peso');
    });

    it('calcula tonelaje verídico con peso normalizado evitando sobreestimaciones', () => {
      // 3 series de 10 reps con 30 kg por lado en barra corta (10 kg)
      const pesoReal = calculateEffectiveTotalWeight(10, 30); // 70 kg
      const pesoErroneoSinNormalizar = calculateEffectiveTotalWeight(20, 30); // 80 kg asumido erróneamente

      const tonelajeReal = calculateBlockVolume(3, 10, pesoReal);
      const tonelajeErroneo = calculateBlockVolume(3, 10, pesoErroneoSinNormalizar);

      expect(tonelajeReal).toBe(2100); // 3 * 10 * 70
      expect(tonelajeErroneo).toBe(2400); // 3 * 10 * 80 (distorsión de +300 kg evitada)
    });
  });

  describe('Soporte de RPE piramidal escalonado con guiones sincronizado con repeticiones (GOZS-418)', () => {
    it('parsePyramidRpeSteps parsea secuencias ascendentes 6-7-8-9', () => {
      expect(parsePyramidRpeSteps('6-7-8-9')).toEqual([6, 7, 8, 9]);
      expect(parsePyramidRpeSteps('7-7.5-8-8.5-9')).toEqual([7, 7.5, 8, 8.5, 9]);
    });

    it('parsePyramidRpeSteps rechaza cadenas con espacios o vacías', () => {
      expect(parsePyramidRpeSteps('6 7 8 9')).toBeNull();
      expect(parsePyramidRpeSteps('6 - 7 - 8')).toBeNull();
      expect(parsePyramidRpeSteps('')).toBeNull();
      expect(parsePyramidRpeSteps(null)).toBeNull();
      expect(parsePyramidRpeSteps(undefined)).toBeNull();
    });

    it('parsePyramidRpeSteps rechaza valores fuera de la escala 1 a 10', () => {
      expect(parsePyramidRpeSteps('0-7-8-9')).toBeNull();
      expect(parsePyramidRpeSteps('6-7-8-11')).toBeNull();
      expect(parsePyramidRpeSteps('6-15')).toBeNull();
    });

    it('parseTargetRpe devuelve el RPE correspondiente a cada serie en una pirámide 6-7-8-9', () => {
      const rpePiramidal = '6-7-8-9';
      // Serie 1 -> RPE Objetivo 6
      expect(parseTargetRpe(rpePiramidal, 1)).toBe(6);
      // Serie 2 -> RPE Objetivo 7
      expect(parseTargetRpe(rpePiramidal, 2)).toBe(7);
      // Serie 3 -> RPE Objetivo 8
      expect(parseTargetRpe(rpePiramidal, 3)).toBe(8);
      // Serie 4 -> RPE Objetivo 9
      expect(parseTargetRpe(rpePiramidal, 4)).toBe(9);
    });

    it('parseTargetRpe limita al último escalón si la serie excede la longitud prescrita', () => {
      expect(parseTargetRpe('6-7-8-9', 5)).toBe(9);
      expect(parseTargetRpe('6-7-8-9', 10)).toBe(9);
    });

    it('parseTargetRpe soporta valores fijos tanto numéricos como strings para compatibilidad', () => {
      expect(parseTargetRpe(8, 1)).toBe(8);
      expect(parseTargetRpe(8.5, 3)).toBe(8.5);
      expect(parseTargetRpe('8', 1)).toBe(8);
      expect(parseTargetRpe('8.5', 2)).toBe(8.5);
      expect(parseTargetRpe(null, 1)).toBeNull();
      expect(parseTargetRpe(undefined, 1)).toBeNull();
    });

    it('validarRpeObjetivo valida sincronización exacta con cantidad de series', () => {
      // 4 series con 4 escalones RPE -> Válido
      expect(validarRpeObjetivo('6-7-8-9', 4)).toEqual({ valido: true });
      // 4 series con 3 escalones RPE -> Inválido (discrepancia)
      const res = validarRpeObjetivo('6-7-8', 4);
      expect(res.valido).toBe(false);
      expect(res.error).toContain('la cantidad de escalones (3) debe coincidir con las series (4)');
    });

    it('validarRpeObjetivo rechaza espacios y formato corrupto', () => {
      const conEspacios = validarRpeObjetivo('6 7 8 9', 4);
      expect(conEspacios.valido).toBe(false);
      expect(conEspacios.error).toBe('RPE no debe contener espacios (ej. 6-7-8-9)');

      const fueraDeRango = validarRpeObjetivo('6-7-8-12', 4);
      expect(fueraDeRango.valido).toBe(false);
      expect(fueraDeRango.error).toBe('RPE: cada valor debe estar entre 1 y 10');
    });
  });
});
