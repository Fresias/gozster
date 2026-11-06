import { describe, expect, it } from 'vitest';
import {
  calcularProgresion,
  esSerieCalentamiento,
  esSerieEfectiva,
  estimar1RM,
} from '@/lib/progresion';
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calcularProgresion as calcularProgresionExport,
  estimar1RM as estimar1RMExport,
} from '@/lib/strength-metrics';
import type { HistoricalLoadEntry } from '@/services/coach-mock-data';

describe('Progresión de Cargas Derivada y Detección de Tendencias (GOZS-371)', () => {
  describe('1. Estimación Matemática de 1RM (estimar1RM)', () => {
    it('calcula 1RM con fórmula de Epley por defecto', () => {
      // 100 kg x 5 reps -> 100 * (1 + 5/30) = 116.6667
      expect(estimar1RM(100, 5)).toBeCloseTo(116.6667, 4);
      expect(estimar1RM(100, 5, 'epley')).toBeCloseTo(calculateEpley1RM(100, 5), 5);
      expect(estimar1RMExport(100, 5)).toBeCloseTo(116.6667, 4);
    });

    it('calcula 1RM con fórmula de Brzycki cuando se especifica', () => {
      // 100 kg x 5 reps -> 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.5113
      expect(estimar1RM(100, 5, 'brzycki')).toBeCloseTo(112.5113, 4);
      expect(estimar1RM(100, 5, 'brzycki')).toBeCloseTo(calculateBrzycki1RM(100, 5), 5);
    });

    it('maneja valores no finitos, 0 o negativos devolviendo 0', () => {
      expect(estimar1RM(0, 10)).toBe(0);
      expect(estimar1RM(100, 0)).toBe(0);
      expect(estimar1RM(-50, 5)).toBe(0);
      expect(estimar1RM(100, -5)).toBe(0);
      expect(estimar1RM(Number.NaN, 5)).toBe(0);
      expect(estimar1RM(100, Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('2. Filtro Quirúrgico de Series Efectivas vs Calentamiento', () => {
    it('detecta correctamente series de calentamiento por tipo_serie, set_type o flag', () => {
      expect(esSerieCalentamiento({ tipo_serie: 'WARMUP' })).toBe(true);
      expect(esSerieCalentamiento({ set_type: 'WARMUP' })).toBe(true);
      expect(esSerieCalentamiento({ set_type: 'W' })).toBe(true);
      expect(esSerieCalentamiento({ tipo_serie: 'CALENTAMIENTO' })).toBe(true);
      expect(esSerieCalentamiento({ tipo: 'calentamiento' })).toBe(true);
      expect(esSerieCalentamiento({ es_calentamiento: true })).toBe(true);

      expect(esSerieCalentamiento({ tipo_serie: 'NORMAL' })).toBe(false);
      expect(esSerieCalentamiento({ set_type: 'N' })).toBe(false);
      expect(esSerieCalentamiento({ tipo_serie: 'DROPSET' })).toBe(false);
    });

    it('valida series efectivas excluyendo no completadas, atípicas y calentamientos', () => {
      expect(esSerieEfectiva({ peso_kg: 100, reps_hechas: 5, completada: true })).toBe(true);
      expect(esSerieEfectiva({ peso_kg: 100, reps_hechas: 5, completada: false })).toBe(false);
      expect(esSerieEfectiva({ peso_kg: 100, reps_hechas: 5, atipica: true })).toBe(false);
      expect(esSerieEfectiva({ peso_kg: 100, reps_hechas: 5, set_type: 'WARMUP' })).toBe(false);
      expect(esSerieEfectiva({ peso_kg: 0, reps_hechas: 10 })).toBe(false);
      expect(esSerieEfectiva({ peso_kg: 100, reps_hechas: 0 })).toBe(false);
    });
  });

  describe('3. Criterios de Aceptación Gherkin (GOZS-371)', () => {
    // Helper para simular fechas en días relativos
    const fechaRelativa = (haceDias: number): string => {
      const base = new Date('2026-11-06T12:00:00Z').getTime();
      return new Date(base - haceDias * 86_400_000).toISOString();
    };

    it('GHERKIN 1: GIVEN 4 ejercicios donde 2 aumentan carga > 2.5% y 2 disminuyen > 2.5% -> THEN enProgresion = 2 y total = 4 con tendencias sube y baja', () => {
      // Ventana de 60 días:
      // Primeras 2 semanas: hace ~55 días (semana 1)
      // Últimas 2 semanas: hace ~5 días (semana 8)
      const fechaSemana1 = fechaRelativa(55);
      const fechaSemana8 = fechaRelativa(5);

      const registros = [
        // Semana 1 (Semana inicial)
        {
          fecha: fechaSemana1,
          ejercicioNombre: 'Press de Banca',
          peso_kg: 100,
          reps_hechas: 5, // e1RM: 116.67
        },
        {
          fecha: fechaSemana1,
          ejercicioNombre: 'Sentadilla Trasera',
          peso_kg: 120,
          reps_hechas: 5, // e1RM: 140.00
        },
        {
          fecha: fechaSemana1,
          ejercicioNombre: 'Peso Muerto',
          peso_kg: 150,
          reps_hechas: 5, // e1RM: 175.00
        },
        {
          fecha: fechaSemana1,
          ejercicioNombre: 'Press Militar',
          peso_kg: 60,
          reps_hechas: 5, // e1RM: 70.00
        },

        // Semana 8 (Semana final)
        // 1. Press de Banca: 100kg -> 106kg (+6.0% > 2.5%) -> sube
        {
          fecha: fechaSemana8,
          ejercicioNombre: 'Press de Banca',
          peso_kg: 106,
          reps_hechas: 5,
        },
        // 2. Sentadilla Trasera: 120kg -> 126kg (+5.0% > 2.5%) -> sube
        {
          fecha: fechaSemana8,
          ejercicioNombre: 'Sentadilla Trasera',
          peso_kg: 126,
          reps_hechas: 5,
        },
        // 3. Peso Muerto: 150kg -> 140kg (-6.67% < -2.5%) -> baja
        {
          fecha: fechaSemana8,
          ejercicioNombre: 'Peso Muerto',
          peso_kg: 140,
          reps_hechas: 5,
        },
        // 4. Press Militar: 60kg -> 56kg (-6.67% < -2.5%) -> baja
        {
          fecha: fechaSemana8,
          ejercicioNombre: 'Press Militar',
          peso_kg: 56,
          reps_hechas: 5,
        },
      ];

      const resultado = calcularProgresion(registros, 60);

      expect(resultado.total).toBe(4);
      expect(resultado.enProgresion).toBe(2);
      expect(resultado.porcentajeEnProgresion).toBe(50);
      expect(resultado.verificada).toBe(true);

      expect(resultado.tendencias['Press de Banca']).toBe('sube');
      expect(resultado.tendencias['Sentadilla Trasera']).toBe('sube');
      expect(resultado.tendencias['Peso Muerto']).toBe('baja');
      expect(resultado.tendencias['Press Militar']).toBe('baja');

      const banca = resultado.ejercicios.find((e) => e.nombre === 'Press de Banca');
      expect(banca?.tendencia).toBe('sube');
      expect(banca?.enProgresion).toBe(true);
      expect(banca?.cambioPct).toBeGreaterThan(2.5);

      const muerto = resultado.ejercicios.find((e) => e.nombre === 'Peso Muerto');
      expect(muerto?.tendencia).toBe('baja');
      expect(muerto?.enProgresion).toBe(false);
      expect(muerto?.cambioPct).toBeLessThan(-2.5);
    });

    it('GHERKIN 2: GIVEN series marcadas como WARMUP o CALENTAMIENTO con cargas altas -> THEN se ignoran y solo se toman en cuenta series efectivas', () => {
      const fechaSemana1 = fechaRelativa(55);
      const fechaSemana8 = fechaRelativa(5);

      const registros = [
        // Semana 1: Serie efectiva 100 kg, pero una de calentamiento con 180 kg por error o test
        {
          fecha: fechaSemana1,
          ejercicioNombre: 'Press de Banca',
          peso_kg: 100,
          reps_hechas: 5,
          tipo_serie: 'NORMAL',
        },
        {
          fecha: fechaSemana1,
          ejercicioNombre: 'Press de Banca',
          peso_kg: 180,
          reps_hechas: 5,
          tipo_serie: 'WARMUP', // Debe ignorarse
        },
        {
          fecha: fechaSemana1,
          ejercicioNombre: 'Press de Banca',
          peso_kg: 200,
          reps_hechas: 5,
          tipo_serie: 'CALENTAMIENTO', // Debe ignorarse
        },

        // Semana 8: Serie efectiva 105 kg (+5% sobre 100 kg)
        {
          fecha: fechaSemana8,
          ejercicioNombre: 'Press de Banca',
          peso_kg: 105,
          reps_hechas: 5,
          tipo_serie: 'NORMAL',
        },
        {
          fecha: fechaSemana8,
          ejercicioNombre: 'Press de Banca',
          peso_kg: 220,
          reps_hechas: 5,
          set_type: 'W', // Debe ignorarse
        },
      ];

      const resultado = calcularProgresion(registros, 60);

      expect(resultado.total).toBe(1);
      expect(resultado.enProgresion).toBe(1);
      expect(resultado.tendencias['Press de Banca']).toBe('sube');

      const banca = resultado.ejercicios[0]!;
      expect(banca.inicioKg).toBe(100);
      expect(banca.actualKg).toBe(105);
      expect(banca.cambioPct).toBeCloseTo(5.0, 1);
    });

    it('GHERKIN 3: GIVEN un ejercicio con datos de una sola semana -> THEN se excluye del total analizado', () => {
      const fechaSemana1 = fechaRelativa(55);
      const fechaSemana8 = fechaRelativa(5);

      // 4 ejercicios válidos de 2 semanas extremas
      const registrosValidos = [
        { fecha: fechaSemana1, ejercicioNombre: 'Banca', peso_kg: 100, reps_hechas: 5 },
        { fecha: fechaSemana8, ejercicioNombre: 'Banca', peso_kg: 105, reps_hechas: 5 }, // sube
        { fecha: fechaSemana1, ejercicioNombre: 'Sentadilla', peso_kg: 100, reps_hechas: 5 },
        { fecha: fechaSemana8, ejercicioNombre: 'Sentadilla', peso_kg: 105, reps_hechas: 5 }, // sube
        { fecha: fechaSemana1, ejercicioNombre: 'Muerto', peso_kg: 100, reps_hechas: 5 },
        { fecha: fechaSemana8, ejercicioNombre: 'Muerto', peso_kg: 95, reps_hechas: 5 }, // baja
        { fecha: fechaSemana1, ejercicioNombre: 'Militar', peso_kg: 100, reps_hechas: 5 },
        { fecha: fechaSemana8, ejercicioNombre: 'Militar', peso_kg: 95, reps_hechas: 5 }, // baja
      ];

      // Ejercicio adicional con registros en un único día o rango de 3 días (sola semana)
      const registrosConEjercicioMonoSemana = [
        ...registrosValidos,
        {
          fecha: fechaRelativa(55),
          ejercicioNombre: 'Curl Biceps',
          peso_kg: 20,
          reps_hechas: 10,
        },
        {
          fecha: fechaRelativa(52), // 3 días de diferencia (dentro de la misma semana)
          ejercicioNombre: 'Curl Biceps',
          peso_kg: 22.5,
          reps_hechas: 10,
        },
      ];

      const resultado = calcularProgresion(registrosConEjercicioMonoSemana, 60);

      // El total analizado debe ser estrictamente 4 (Curl Biceps queda excluido)
      expect(resultado.total).toBe(4);
      expect(resultado.enProgresion).toBe(2);

      const excluido = resultado.ejerciciosExcluidos.find((e) => e.ejercicioNombre === 'Curl Biceps');
      expect(excluido).toBeDefined();
      expect(excluido?.motivo).toBe('una_sola_semana');
    });
  });

  describe('4. Compatibilidad con Formato HistoricalLoadEntry[]', () => {
    it('procesa correctamente entradas estructuradas de sesiones y series anidadas', () => {
      const fecha1 = new Date('2026-09-10T15:00:00Z').toISOString();
      const fecha2 = new Date('2026-11-01T15:00:00Z').toISOString();

      const historial: HistoricalLoadEntry[] = [
        {
          sesion: {
            id: 'ses-1',
            alumno_id: 'alumno-1',
            fecha: fecha1,
            dia_id: 'd1',
            created_at: fecha1,
            updated_at: fecha1,
          } as any,
          series: [
            {
              id: 's-1',
              sesion_id: 'ses-1',
              ejercicio_id: 'ej-banca',
              ejercicioNombre: 'Press de Banca Plano',
              numero_serie: 1,
              peso_kg: 80,
              reps_hechas: 8,
              completada: true,
              set_type: 'NORMAL',
              created_at: fecha1,
              updated_at: fecha1,
            } as any,
          ],
        },
        {
          sesion: {
            id: 'ses-2',
            alumno_id: 'alumno-1',
            fecha: fecha2,
            dia_id: 'd1',
            created_at: fecha2,
            updated_at: fecha2,
          } as any,
          series: [
            {
              id: 's-2',
              sesion_id: 'ses-2',
              ejercicio_id: 'ej-banca',
              ejercicioNombre: 'Press de Banca Plano',
              numero_serie: 1,
              peso_kg: 90,
              reps_hechas: 8,
              completada: true,
              set_type: 'NORMAL',
              created_at: fecha2,
              updated_at: fecha2,
            } as any,
          ],
        },
      ];

      const resultado = calcularProgresionExport(historial, 60, ['Press de Banca']);

      expect(resultado.total).toBe(1);
      expect(resultado.enProgresion).toBe(1);
      const banca = resultado.ejercicios[0]!;
      expect(banca.inicioKg).toBe(80);
      expect(banca.actualKg).toBe(90);
      expect(banca.gananciaKg).toBe(10);
      expect(banca.tendencia).toBe('sube');
    });
  });

  describe('5. Casos Límite y Filtro por Claves', () => {
    it('maneja registros vacíos o nulos sin lanzar errores', () => {
      const resVacio = calcularProgresion([]);
      expect(resVacio.total).toBe(0);
      expect(resVacio.enProgresion).toBe(0);
      expect(resVacio.verificada).toBe(false);

      const resNull = calcularProgresion(null as any);
      expect(resNull.total).toBe(0);
    });

    it('clasifica como "mantiene" variaciones dentro del umbral de ±2.5%', () => {
      const f1 = new Date('2026-09-10T10:00:00Z').toISOString();
      const f2 = new Date('2026-11-01T10:00:00Z').toISOString();

      const registros = [
        { fecha: f1, ejercicioNombre: 'Sentadilla', peso_kg: 100, reps_hechas: 5 },
        { fecha: f2, ejercicioNombre: 'Sentadilla', peso_kg: 101, reps_hechas: 5 }, // +1.0% (<= 2.5%)
      ];

      const res = calcularProgresion(registros, 60);
      expect(res.total).toBe(1);
      expect(res.enProgresion).toBe(0);
      expect(res.tendencias['Sentadilla']).toBe('mantiene');
      expect(res.ejercicios[0]?.enProgresion).toBe(false);
    });

    it('respeta las claves proporcionadas excluyendo ejercicios que no coincidan', () => {
      const f1 = new Date('2026-09-10T10:00:00Z').toISOString();
      const f2 = new Date('2026-11-01T10:00:00Z').toISOString();

      const registros = [
        { fecha: f1, ejercicioNombre: 'Sentadilla Trasera', peso_kg: 100, reps_hechas: 5 },
        { fecha: f2, ejercicioNombre: 'Sentadilla Trasera', peso_kg: 110, reps_hechas: 5 },
        { fecha: f1, ejercicioNombre: 'Remo con Barra', peso_kg: 60, reps_hechas: 8 },
        { fecha: f2, ejercicioNombre: 'Remo con Barra', peso_kg: 70, reps_hechas: 8 },
      ];

      // Pedir solo Sentadilla
      const res = calcularProgresion(registros, 60, ['Sentadilla']);
      expect(res.total).toBe(1);
      expect(res.ejercicios[0]?.nombre).toBe('Sentadilla');
      expect(res.tendencias['Sentadilla']).toBe('sube');
    });
  });
});
