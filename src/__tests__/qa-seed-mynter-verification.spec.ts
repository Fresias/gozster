import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  extractSeedData,
  generateMynterSeedSQL,
  parseDescanso,
  parseExecution,
  parseRpe,
  resolveBackupFilePath,
  seedFromMynterBackup,
  toUUID,
  type MynterStudentEntry,
} from '../../scripts/seed_from_mynter_backup';
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
} from '../../tests/strength-metrics.spec';

describe('QA Verification Suite: Migración y Seeding Seguro desde Mynter (Issue #26 / PR #27)', () => {
  const backupPath = resolveBackupFilePath();
  const rawData: MynterStudentEntry[] = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  const seedData = extractSeedData(rawData);

  // ==========================================================================
  // 1. Verificación Matemática e Integridad Numérica de Rutinas
  // ==========================================================================
  describe('1. Verificación Numérica e Integridad de Rutinas Semilla', () => {
    it('todas las series deben ser enteros estrictamente positivos (>= 1)', () => {
      for (const er of seedData.ejerciciosEnRutina) {
        expect(Number.isInteger(er.series)).toBe(true);
        expect(er.series).toBeGreaterThanOrEqual(1);
      }
    });

    it('todos los descansos deben ser enteros en segundos >= 0', () => {
      for (const er of seedData.ejerciciosEnRutina) {
        expect(Number.isInteger(er.descanso_segundos)).toBe(true);
        expect(er.descanso_segundos).toBeGreaterThanOrEqual(0);
      }
    });

    it('los RPEs presentes deben estar acotados en el rango fisiológico [1.0, 10.0]', () => {
      for (const er of seedData.ejerciciosEnRutina) {
        if (er.rpe_objetivo !== null) {
          expect(er.rpe_objetivo).toBeGreaterThanOrEqual(1.0);
          expect(er.rpe_objetivo).toBeLessThanOrEqual(10.0);
          // Máximo 1 decimal de precisión
          const decimalPart = (er.rpe_objetivo.toString().split('.')[1] || '').length;
          expect(decimalPart).toBeLessThanOrEqual(1);
        }
      }
    });

    it('los órdenes de días dentro de cada plan son estrictamente correlativos empezando en 1', () => {
      for (const plan of seedData.planes) {
        const diasDelPlan = seedData.dias.filter((d) => d.plan_id === plan.id);
        expect(diasDelPlan.length).toBeGreaterThanOrEqual(1);
        const ordenes = diasDelPlan.map((d) => d.orden);
        const expectedOrdenes = Array.from({ length: diasDelPlan.length }, (_, i) => i + 1);
        expect(ordenes).toEqual(expectedOrdenes);
      }
    });

    it('los órdenes de ejercicios dentro de cada día son estrictamente correlativos empezando en 1', () => {
      for (const dia of seedData.dias) {
        const ejsDelDia = seedData.ejerciciosEnRutina.filter((er) => er.dia_id === dia.id);
        expect(ejsDelDia.length).toBeGreaterThanOrEqual(1);
        const ordenes = ejsDelDia.map((er) => er.orden);
        const expectedOrdenes = Array.from({ length: ejsDelDia.length }, (_, i) => i + 1);
        expect(ordenes).toEqual(expectedOrdenes);
      }
    });

    it('cálculo de tonelaje teórico sobre series y repeticiones de la rutina', () => {
      // Simulación de carga teórica para ejercicios con reps numéricas (e.g. 10 reps a 50kg)
      const repsPuras = seedData.ejerciciosEnRutina
        .map((er) => {
          const numMatch = er.repeticiones.match(/^(\d+)$/);
          return numMatch && numMatch[1] ? { series: er.series, reps: parseInt(numMatch[1], 10) } : null;
        })
        .filter((x): x is { series: number; reps: number } => x !== null);

      expect(repsPuras.length).toBeGreaterThan(0);
      for (const item of repsPuras) {
        const peso = 60; // 60 kg
        const tonnage = calculateTotalTonnage([{ series: item.series, reps: item.reps, peso }]);
        expect(tonnage).toBe(item.series * item.reps * peso);

        const epley1RM = calculateEpley1RM(peso, item.reps);
        const brzycki1RM = calculateBrzycki1RM(peso, item.reps);
        expect(epley1RM).toBeGreaterThanOrEqual(peso);
        expect(brzycki1RM).toBeGreaterThanOrEqual(peso);
      }
    });
  });

  // ==========================================================================
  // 2. Restricción chk_superserie_grupo y Agrupación
  // ==========================================================================
  describe('2. Verificación Estricta de Restricción chk_superserie_grupo', () => {
    it('cumplimiento 100% de la regla relacional: es_superserie <=> grupo_superserie >= 1', () => {
      for (const er of seedData.ejerciciosEnRutina) {
        if (er.es_superserie) {
          expect(er.grupo_superserie).not.toBeNull();
          expect(er.grupo_superserie).toBeGreaterThanOrEqual(1);
        } else {
          expect(er.grupo_superserie).toBeNull();
        }
      }
    });

    it('cada grupo de superserie en un día debe contener al menos 2 ejercicios (biserie / superserie)', () => {
      for (const dia of seedData.dias) {
        const ejsDelDia = seedData.ejerciciosEnRutina.filter((er) => er.dia_id === dia.id && er.es_superserie);
        const grupos = new Map<number, number>();
        for (const ej of ejsDelDia) {
          if (ej.grupo_superserie !== null) {
            grupos.set(ej.grupo_superserie, (grupos.get(ej.grupo_superserie) || 0) + 1);
          }
        }

        for (const [grupo, count] of grupos.entries()) {
          expect(count, `El grupo de superserie ${grupo} en día ${dia.nombre} tiene solo ${count} ejercicio`).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  // ==========================================================================
  // 3. Casos Límite (Edge Cases) y Robustez de Funciones de Parseo
  // ==========================================================================
  describe('3. Casos Límite (Edge Cases) de Parseo y Sanitización', () => {
    describe('parseRpe - Edge Cases', () => {
      it('maneja valores extremos, nulos y strings inválidos sin arrojar excepción', () => {
        expect(parseRpe(null)).toBeNull();
        expect(parseRpe(undefined)).toBeNull();
        expect(parseRpe('')).toBeNull();
        expect(parseRpe('   ')).toBeNull();
        expect(parseRpe('RPE 0')).toBeNull(); // Fisiológicamente inválido
        expect(parseRpe('RPE -2.5')).toBeNull(); // Negativo
        expect(parseRpe('RPE 10.5')).toBeNull(); // Por encima del máximo
        expect(parseRpe('RPE 100')).toBeNull();
        expect(parseRpe('Esfuerzo submáximo')).toBeNull();
        expect(parseRpe('NaN')).toBeNull();
      });

      it('soporta variantes de formato comunes en entrenamientos', () => {
        expect(parseRpe('rpe: 8')).toBe(8.0);
        expect(parseRpe('RPE9')).toBe(9.0);
        expect(parseRpe('RPE 7.5')).toBe(7.5);
        expect(parseRpe('10')).toBe(10.0);
        expect(parseRpe('1.0')).toBe(1.0);
        expect(parseRpe(8.25)).toBe(8.3); // Redondeo a 1 decimal
      });
    });

    describe('parseDescanso - Edge Cases', () => {
      it('maneja valores nulos, negativos o ausentes asignando default seguro de 90s', () => {
        expect(parseDescanso(null)).toBe(90);
        expect(parseDescanso(undefined)).toBe(90);
        expect(parseDescanso('')).toBe(90);
        expect(parseDescanso(-30)).toBe(90);
        expect(parseDescanso('descanso standard')).toBe(90);
      });

      it('parsea correctamente unidades con minutos y segundos', () => {
        expect(parseDescanso('0s')).toBe(0);
        expect(parseDescanso('45s')).toBe(45);
        expect(parseDescanso("45''")).toBe(45);
        expect(parseDescanso('45"')).toBe(45);
        expect(parseDescanso("3'")).toBe(180);
        expect(parseDescanso('2 min')).toBe(120);
        expect(parseDescanso('1.5 min')).toBe(90);
      });
    });

    describe('parseExecution - Edge Cases', () => {
      it('cuando ejecucionEjercicio está vacío o ausente, aplica valores por defecto seguros', () => {
        const result = parseExecution(undefined, 'Nota suplementaria');
        expect(result.series).toBe(3);
        expect(result.repeticiones).toBe('10');
        expect(result.descanso_segundos).toBe(90);
        expect(result.rpe_objetivo).toBeNull();
        expect(result.notas).toBe('Nota suplementaria');
      });

      it('cuando ejecucionEjercicio contiene filas vacías o celdas corruptas, no colapsa', () => {
        const corruptGrid: any = [[null, {}], [{ key: 'series', value: '0' }, { key: 'reps', value: null }]];
        const result = parseExecution(corruptGrid, null);
        expect(result.series).toBeGreaterThanOrEqual(1);
        expect(result.repeticiones).toBe('10');
        expect(result.descanso_segundos).toBe(90);
      });
    });

    describe('toUUID - Idempotencia y Formato RFC 4122', () => {
      it('mismo string produce exactamente el mismo UUID determinista', () => {
        const u1 = toUUID('66b8a2401ce75e2e247c5ff6');
        const u2 = toUUID('66b8a2401ce75e2e247c5ff6');
        expect(u1).toBe(u2);
      });

      it('cadenas diferentes producen UUIDs distintos', () => {
        const u1 = toUUID('alumno-1');
        const u2 = toUUID('alumno-2');
        expect(u1).not.toBe(u2);
      });

      it('si la entrada ya es un UUID válido, la normaliza a minúsculas', () => {
        const input = '56B9B557-4154-4D5C-8857-455ECA64AC8A';
        expect(toUUID(input)).toBe(input.toLowerCase());
      });

      it('lanza error explícito ante cadenas vacías o nulas', () => {
        expect(() => toUUID('')).toThrow('toUUID requiere una cadena no vacía.');
        expect(() => toUUID(null as any)).toThrow();
        expect(() => toUUID(undefined as any)).toThrow();
      });
    });
  });

  // ==========================================================================
  // 4. Verificación de Seguridad: Modo Silencioso y Cero Exfiltración
  // ==========================================================================
  describe('4. Auditoría de Seguridad Estricta y Modo Silencioso', () => {
    it('garantiza que auth.admin.inviteUserByEmail NUNCA existe en las llamadas de seed', async () => {
      const mockInvite = vi.fn();
      const mockCreate = vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      });

      const mockClient = {
        auth: {
          admin: {
            createUser: mockCreate,
            inviteUserByEmail: mockInvite,
          },
        },
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;

      await seedFromMynterBackup({ client: mockClient, filePath: backupPath });

      expect(mockInvite).toHaveBeenCalledTimes(0);
      expect(mockCreate).toHaveBeenCalled();
      for (const call of mockCreate.mock.calls) {
        expect(call[0].email_confirm).toBe(true);
      }
    });

    it('el archivo SQL generado no contiene disparadores de invitaciones ni correos externos', () => {
      const sql = generateMynterSeedSQL(seedData);
      expect(sql.toLowerCase()).not.toContain('inviteuserbyemail');
      expect(sql.toLowerCase()).not.toContain('send_mail');
      expect(sql.toLowerCase()).not.toContain('smtp');
      expect(sql.toLowerCase()).not.toContain('webhook');
    });

    it('los usuarios en SQL tienen email_confirmed_at activo inmediatamente para evitar emails de confirmación', () => {
      const sql = generateMynterSeedSQL(seedData);
      expect(sql).toContain('email_confirmed_at, raw_app_meta_data');
      expect(sql).toContain("now(),\n  '{\"provider\":\"email\"");
    });
  });

  // ==========================================================================
  // 5. Verificación de Idempotencia y Transaccionalidad de SQL
  // ==========================================================================
  describe('5. Auditoría de Idempotencia y Transaccionalidad SQL', () => {
    it('el script SQL debe estar envuelto exactamente en una transacción atómica BEGIN / COMMIT', () => {
      const sql = generateMynterSeedSQL(seedData);
      expect(sql.startsWith('--')).toBe(true);
      expect(sql).toContain('\nBEGIN;\n');
      expect(sql).toContain('\nCOMMIT;\n');
    });

    it('todas las tablas maestras y relacionales cuentan con ON CONFLICT exhaustivo', () => {
      const sql = generateMynterSeedSQL(seedData);

      // auth.users y perfiles
      expect(sql).toContain('INSERT INTO auth.users');
      expect(sql).toContain('ON CONFLICT (id) DO NOTHING;');
      expect(sql).toContain('INSERT INTO public.perfiles');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');

      // ejercicios
      expect(sql).toContain('INSERT INTO public.ejercicios');
      expect(sql).toContain('ON CONFLICT (nombre) DO UPDATE SET');

      // planes_entrenamiento
      expect(sql).toContain('INSERT INTO public.planes_entrenamiento');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');

      // dias_rutina
      expect(sql).toContain('INSERT INTO public.dias_rutina');
      expect(sql).toContain('ON CONFLICT (plan_id, orden) DO UPDATE SET');

      // ejercicios_en_rutina
      expect(sql).toContain('INSERT INTO public.ejercicios_en_rutina');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    });

    it('ejecutar extractSeedData múltiples veces devuelve estructuras idénticas e inmutables', () => {
      const run1 = extractSeedData(rawData);
      const run2 = extractSeedData(rawData);

      expect(run1.totalAlumnos).toBe(run2.totalAlumnos);
      expect(run1.totalPlanes).toBe(run2.totalPlanes);
      expect(run1.totalDias).toBe(run2.totalDias);
      expect(run1.totalEjerciciosUnicos).toBe(run2.totalEjerciciosUnicos);
      expect(run1.totalEjerciciosEnRutina).toBe(run2.totalEjerciciosEnRutina);
      expect(run1.alumnos.map((a) => a.id)).toEqual(run2.alumnos.map((a) => a.id));
      expect(run1.ejercicios.map((e) => e.id)).toEqual(run2.ejercicios.map((e) => e.id));
    });
  });
});
