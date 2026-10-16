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

describe('Seed from Mynter Backup - Migración Segura e Idempotente (Issue #26)', () => {
  const backupPath = resolveBackupFilePath();
  const rawData: MynterStudentEntry[] = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

  describe('1. Mapeo y Extracción de Perfiles de Alumnos (perfiles)', () => {
    it('GIVEN el archivo de backup JSON WHEN se procesa THEN extrae exactamente 13 alumnos activos', () => {
      const seedData = extractSeedData(rawData);
      expect(seedData.totalAlumnos).toBe(13);
      expect(seedData.alumnos).toHaveLength(13);
    });

    it('GIVEN los alumnos del backup WHEN se extraen perfiles THEN rol es ALUMNO y estado es ACTIVA', () => {
      const seedData = extractSeedData(rawData);
      for (const alumno of seedData.alumnos) {
        expect(alumno.rol).toBe('ALUMNO');
        expect(alumno.estado_membresia).toBe('ACTIVA');
        expect(alumno.email).toBeTruthy();
        expect(alumno.email).toContain('@');
        expect(alumno.fecha_baja).toBeNull();
      }
    });

    it('GIVEN los alumnos del backup WHEN se mapea su nombre THEN combina nombre y apellido limpiamente', () => {
      const seedData = extractSeedData(rawData);
      const celeste = seedData.alumnos.find((a) => a.email === 'alumno1@gozster.local');
      expect(celeste).toBeDefined();
      expect(celeste?.nombre_completo).toBe('Celeste Gerardi');

      const gabi = seedData.alumnos.find((a) => a.email === 'alumno3@gozster.local');
      expect(gabi).toBeDefined();
      expect(gabi?.nombre_completo).toBe('Gabriel Sanchez');
    });

    it('GIVEN los alumnos del backup WHEN se asigna el profesor THEN todos quedan vinculados a profesor_asignado_id', () => {
      const seedData = extractSeedData(rawData);
      expect(seedData.coach.rol).toBe('ENTRENADOR');
      expect(seedData.coach.id).toBeTruthy();

      for (const alumno of seedData.alumnos) {
        expect(alumno.profesor_asignado_id).toBe(seedData.coach.id);
      }
    });
  });

  describe('2. Planes de Entrenamiento (planes_entrenamiento)', () => {
    it('GIVEN los 13 alumnos WHEN se extraen los planes THEN se crean exactamente 13 planes activos vinculados al alumno y profesor', () => {
      const seedData = extractSeedData(rawData);
      expect(seedData.totalPlanes).toBe(13);
      expect(seedData.planes).toHaveLength(13);

      for (const plan of seedData.planes) {
        expect(plan.profesor_id).toBe(seedData.coach.id);
        expect(plan.alumno_id).toBeTruthy();
        expect(plan.estado).toBe('ACTIVO');
        expect(plan.nombre).toBeTruthy();
        expect(plan.fecha_inicio).toBeTruthy();
      }
    });

    it('GIVEN planes con vigencia y comentarios WHEN se extraen THEN preserva comentarios y fechas de asesoria', () => {
      const seedData = extractSeedData(rawData);
      const planCeleste = seedData.planes.find((p) => p.alumno_id === seedData.alumnos[0]?.id);
      expect(planCeleste).toBeDefined();
      expect(planCeleste?.nombre).toBe('CELES AGOSTO V.2');
      expect(planCeleste?.comentarios).toContain('RECOMENDACIONES:');
      expect(planCeleste?.fecha_inicio).toBe('2026-09-19T03:01:00+0000');
      expect(planCeleste?.fecha_fin).toBe('2026-10-19T02:59:00+0000');
    });
  });

  describe('3. Días de Entrenamiento (dias_rutina)', () => {
    it('GIVEN los bloques de rutina WHEN se estructuran en dias_rutina THEN orden es correlativo >= 1 y tiene nombre de bloque', () => {
      const seedData = extractSeedData(rawData);
      expect(seedData.totalDias).toBe(29);

      for (const plan of seedData.planes) {
        const diasDelPlan = seedData.dias.filter((d) => d.plan_id === plan.id);
        expect(diasDelPlan.length).toBeGreaterThanOrEqual(1);

        const ordenes = diasDelPlan.map((d) => d.orden);
        expect(ordenes).toEqual([...Array(diasDelPlan.length)].map((_, i) => i + 1));

        for (const dia of diasDelPlan) {
          expect(dia.nombre).toBeTruthy();
          expect(['WARM UP', 'PRINCIPAL', 'CORE', 'ABS', 'ZONA MEDIA']).toContain(dia.nombre);
        }
      }
    });
  });

  describe('4. Catálogo Maestro de Ejercicios (ejercicios)', () => {
    it('GIVEN los ejercicios presentes en el backup WHEN se extraen THEN identifica los 86 ejercicios únicos', () => {
      const seedData = extractSeedData(rawData);
      expect(seedData.totalEjerciciosUnicos).toBe(86);
      expect(seedData.ejercicios).toHaveLength(86);

      // Verificación de nombres únicos
      const nombres = new Set(seedData.ejercicios.map((e) => e.nombre));
      expect(nombres.size).toBe(86);
    });

    it('GIVEN ejercicios con url_video y comentarios WHEN se extraen THEN preserva youtube IDs y notas técnicas', () => {
      const seedData = extractSeedData(rawData);
      const sentadilla = seedData.ejercicios.find((e) => e.nombre === '90/90');
      expect(sentadilla).toBeDefined();
      expect(sentadilla?.url_video).toBe('noTGHlQVKfA');
      expect(sentadilla?.comentario).toBe('Movilidad de cadera');
    });
  });

  describe('5. Ejercicios en Rutina (ejercicios_en_rutina) y Superseries', () => {
    it('GIVEN la jerarquía de ejercicios WHEN se mapean en la rutina THEN totaliza 108 ejercicios (80 principales + 28 superseries)', () => {
      const seedData = extractSeedData(rawData);
      expect(seedData.totalEjerciciosEnRutina).toBe(108);
      expect(seedData.ejerciciosEnRutina).toHaveLength(108);
    });

    it('GIVEN ejercicios con superseries (children) WHEN se procesan THEN es_superserie es true y grupo_superserie >= 1', () => {
      const seedData = extractSeedData(rawData);
      const superseries = seedData.ejerciciosEnRutina.filter((er) => er.es_superserie);
      expect(superseries.length).toBeGreaterThan(0);

      for (const ss of superseries) {
        expect(ss.es_superserie).toBe(true);
        expect(ss.grupo_superserie).toBeTypeOf('number');
        expect(ss.grupo_superserie).toBeGreaterThanOrEqual(1);
      }
    });

    it('GIVEN ejercicios individuales sin children WHEN se procesan THEN es_superserie es false y grupo_superserie es null', () => {
      const seedData = extractSeedData(rawData);
      const individuales = seedData.ejerciciosEnRutina.filter((er) => !er.es_superserie);
      expect(individuales.length).toBeGreaterThan(0);

      for (const ind of individuales) {
        expect(ind.es_superserie).toBe(false);
        expect(ind.grupo_superserie).toBeNull();
      }
    });

    it('GIVEN todos los ejercicios en rutina WHEN se evalúa chk_superserie_grupo THEN el 100% cumple la restricción', () => {
      const seedData = extractSeedData(rawData);
      for (const er of seedData.ejerciciosEnRutina) {
        const satisfiesConstraint =
          (!er.es_superserie && er.grupo_superserie === null) ||
          (er.es_superserie && er.grupo_superserie !== null && er.grupo_superserie >= 1);
        expect(satisfiesConstraint).toBe(true);
      }
    });

    it('GIVEN las configuraciones de series, reps y descanso WHEN se extraen THEN cumplen las restricciones de BD', () => {
      const seedData = extractSeedData(rawData);
      for (const er of seedData.ejerciciosEnRutina) {
        expect(er.series).toBeGreaterThanOrEqual(1);
        expect(er.orden).toBeGreaterThanOrEqual(1);
        expect(er.descanso_segundos).toBeGreaterThanOrEqual(0);
        expect(er.repeticiones).toBeTruthy();

        if (er.rpe_objetivo !== null) {
          expect(er.rpe_objetivo).toBeGreaterThanOrEqual(1.0);
          expect(er.rpe_objetivo).toBeLessThanOrEqual(10.0);
        }
      }
    });
  });

  describe('6. Utilidades de Parseo (RPE, Descanso, UUID)', () => {
    it('parseRpe debe convertir formatos variados y rechazar valores fuera de rango', () => {
      expect(parseRpe('RPE 8')).toBe(8.0);
      expect(parseRpe('RPE 5.5')).toBe(5.5);
      expect(parseRpe('RPE: 10')).toBe(10.0);
      expect(parseRpe(7)).toBe(7.0);
      expect(parseRpe('RPE 0')).toBeNull(); // < 1.0
      expect(parseRpe('RPE 11')).toBeNull(); // > 10.0
      expect(parseRpe(null)).toBeNull();
      expect(parseRpe('Sin esfuerzo')).toBeNull();
    });

    it('parseDescanso debe parsear minutos, segundos o default a 90', () => {
      expect(parseDescanso('90s')).toBe(90);
      expect(parseDescanso("90''")).toBe(90);
      expect(parseDescanso("2'")).toBe(120);
      expect(parseDescanso('1 min')).toBe(60);
      expect(parseDescanso(180)).toBe(180);
      expect(parseDescanso(null)).toBe(90);
    });

    it('toUUID debe ser determinista e idempotente', () => {
      const uuid1 = toUUID('6a35a077eb67a73bd733a185');
      const uuid2 = toUUID('6a35a077eb67a73bd733a185');
      expect(uuid1).toBe(uuid2);
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('7. Seguridad Estricta y Modo Silencioso Obligatorio', () => {
    it('GIVEN la ejecución del seed WHEN se invocan métodos de auth THEN NUNCA llama inviteUserByEmail y usa createUser silencioso', async () => {
      const mockCreateUser = vi.fn().mockResolvedValue({
        data: { user: { id: 'mock-user-id' } },
        error: null,
      });
      const mockInviteUser = vi.fn();
      const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });

      const mockClient = {
        auth: {
          admin: {
            createUser: mockCreateUser,
            inviteUserByEmail: mockInviteUser,
          },
        },
        from: vi.fn().mockReturnValue({
          upsert: mockUpsert,
          select: mockSelect,
        }),
      } as any;

      const result = await seedFromMynterBackup({
        client: mockClient,
        filePath: backupPath,
      });

      expect(result.success).toBe(true);

      // Verificación estricta: inviteUserByEmail JAMÁS es llamado
      expect(mockInviteUser).not.toHaveBeenCalled();

      // Verificación: createUser fue llamado con email_confirm: true (modo silencioso)
      expect(mockCreateUser).toHaveBeenCalled();
      for (const call of mockCreateUser.mock.calls) {
        expect(call[0].email_confirm).toBe(true);
      }
    });
  });

  describe('8. Generación de SQL Idempotente', () => {
    it('GIVEN datos de semilla WHEN se genera SQL THEN produce script transaccional con ON CONFLICT', () => {
      const seedData = extractSeedData(rawData);
      const sql = generateMynterSeedSQL(seedData);

      expect(sql).toContain('BEGIN;');
      expect(sql).toContain('COMMIT;');
      expect(sql).toContain('INSERT INTO auth.users');
      expect(sql).toContain('INSERT INTO public.perfiles');
      expect(sql).toContain('INSERT INTO public.ejercicios');
      expect(sql).toContain('INSERT INTO public.planes_entrenamiento');
      expect(sql).toContain('INSERT INTO public.dias_rutina');
      expect(sql).toContain('INSERT INTO public.ejercicios_en_rutina');

      // Cláusulas ON CONFLICT indispensables para idempotencia
      expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
      expect(sql).toContain('ON CONFLICT (nombre) DO UPDATE SET');
      expect(sql).toContain('ON CONFLICT (plan_id, orden) DO UPDATE SET');
    });
  });
});
