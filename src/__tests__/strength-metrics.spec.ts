import { describe, expect, it } from 'vitest';
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  type VolumeBlock,
} from '../../tests/strength-metrics.spec';

describe('Suite de Integración Vitest - Métricas de Fuerza (src/__tests__)', () => {
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
