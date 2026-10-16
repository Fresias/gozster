import { describe, expect, it } from 'vitest';
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  type VolumeBlock,
} from '@/lib/strength-metrics';

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

  describe('Suite de Integración Vitest - Consistencia Submáxima', () => {
    it('verifica consistencia de 1RM Epley y Brzycki en rango submáximo (1-10 reps)', () => {
      expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);
      expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 4);
      expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 5);
    });

    it('verifica cálculo de volumen y tonelaje con protección ante valores límite (0 y negativos)', () => {
      const blocks: VolumeBlock[] = [
        { series: 4, reps: 10, peso: 80 },
        { series: 0, reps: 10, peso: 100 },
        { series: 3, reps: 0, peso: 100 },
        { series: 3, reps: 8, peso: 0 },
        { series: -2, reps: 5, peso: 100 },
        { series: 3, reps: -5, peso: 100 },
        { series: 3, reps: 5, peso: -100 },
      ];
      expect(calculateBlockVolume(4, 10, 80)).toBe(3200);
      expect(calculateTotalTonnage(blocks)).toBe(3200);
    });
  });
});
