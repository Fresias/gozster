import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  nivelDesdeEva,
  derivarSeveridadDesdeEva,
  derivarEvaDesdeSeveridad,
  derivarSeveridadAlerta,
  validarTransicionEstadoDolor,
  sincronizarAlertaConHistorial,
} from '@/lib/dolor';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const NUEVA_MIGRACION = '20261106110000_dolor_eva_estado_unico.sql';

const ADMIN = '00000000-0000-0000-0000-0000000000ad';
const COACH = '00000000-0000-0000-0000-00000000c0ac';
const COACH_OTRO = '00000000-0000-0000-0000-00000000c0b2';
const ALUMNO = '00000000-0000-0000-0000-00000000000a';
const ALUMNO_OTRO = '00000000-0000-0000-0000-00000000000b';

const EJERCICIO_1 = '00000000-0000-0000-0000-0000000000e1';

type Rol = 'anon' | 'authenticated' | 'service_role';

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    instance_id uuid,
    aud text,
    role text,
    email text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'admin@test.local'),
    ('${COACH}', 'coach@test.local'),
    ('${COACH_OTRO}', 'coach2@test.local'),
    ('${ALUMNO}', 'alumno@test.local'),
    ('${ALUMNO_OTRO}', 'alumno2@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}', 'admin@test.local', 'Admin General', 'ADMIN', NULL, 'ACTIVA'),
    ('${COACH}', 'coach@test.local', 'Coach Principal', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${COACH_OTRO}', 'coach2@test.local', 'Coach Secundario', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALUMNO}', 'alumno@test.local', 'Alumno Fernando', 'ALUMNO', '${COACH}', 'ACTIVA'),
    ('${ALUMNO_OTRO}', 'alumno2@test.local', 'Alumno Ajeno', 'ALUMNO', '${COACH_OTRO}', 'ACTIVA');

  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id) VALUES
    ('${COACH}', '${ALUMNO}'),
    ('${COACH_OTRO}', '${ALUMNO_OTRO}');

  INSERT INTO public.ejercicios (id, nombre, musculos_principales) VALUES
    ('${EJERCICIO_1}', 'Sentadilla Trasera con Barra', ARRAY['PIERNAS'])
  ON CONFLICT (id) DO NOTHING;
`;

let db: PGlite;

async function aplicarMigracion(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe('GOZS-370: Modelo Unificado de Dolor (EVA 0-10, Estado Único y Trigger de Espejo)', () => {
  describe('1. Verificación Estática de Archivos y Reglas de Seguridad', () => {
    it('existe el archivo de migración append-only con timestamp 20261106110000', () => {
      const ruta = path.join(MIGRATIONS_DIR, NUEVA_MIGRACION);
      expect(fs.existsSync(ruta)).toBe(true);
    });

    it('la migración incorpora columna eva con check de 0 a 10', () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), 'utf-8');
      expect(sql).toContain('eva SMALLINT');
      expect(sql).toContain('CHECK (eva BETWEEN 0 AND 10)');
    });

    it('la migración define la vista v_dolor_activo con security_invoker = true', () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), 'utf-8');
      expect(sql).toContain('CREATE VIEW public.v_dolor_activo');
      expect(sql).toContain('security_invoker = true');
    });

    it('la migración define el trigger de espejo hacia alertas_entrenador y la RPC actualizar_estado_dolor', () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), 'utf-8');
      expect(sql).toContain('fn_espejar_dolor_a_alertas');
      expect(sql).toContain('trg_alumno_historial_dolor_espejo_alertas');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.actualizar_estado_dolor');
    });

    it('respeta RLS estricto y no contiene USING (true) ni WITH CHECK (true)', () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), 'utf-8');
      expect(sql).not.toContain('USING (true)');
      expect(sql).not.toContain('WITH CHECK (true)');
    });
  });

  describe('2. Pruebas Unitarias en TypeScript (src/lib/dolor.ts)', () => {
    it('nivelDesdeEva categoriza adecuadamente 0-3 (bajo), 4-6 (medio) y 7-10 (alto)', () => {
      expect(nivelDesdeEva(0)).toBe('bajo');
      expect(nivelDesdeEva(2)).toBe('bajo');
      expect(nivelDesdeEva(3)).toBe('bajo');
      expect(nivelDesdeEva(4)).toBe('medio');
      expect(nivelDesdeEva(5)).toBe('medio');
      expect(nivelDesdeEva(6)).toBe('medio');
      expect(nivelDesdeEva(7)).toBe('alto');
      expect(nivelDesdeEva(8)).toBe('alto');
      expect(nivelDesdeEva(10)).toBe('alto');
    });

    it('derivarSeveridadDesdeEva mapea adecuadamente a LEVE, MODERADO y AGUDO', () => {
      expect(derivarSeveridadDesdeEva(1)).toBe('LEVE');
      expect(derivarSeveridadDesdeEva(3)).toBe('LEVE');
      expect(derivarSeveridadDesdeEva(4)).toBe('MODERADO');
      expect(derivarSeveridadDesdeEva(6)).toBe('MODERADO');
      expect(derivarSeveridadDesdeEva(7)).toBe('AGUDO');
      expect(derivarSeveridadDesdeEva(10)).toBe('AGUDO');
    });

    it('derivarEvaDesdeSeveridad mapea valores históricos a 3, 5 y 8', () => {
      expect(derivarEvaDesdeSeveridad('LEVE')).toBe(3);
      expect(derivarEvaDesdeSeveridad('MODERADO')).toBe(5);
      expect(derivarEvaDesdeSeveridad('AGUDO')).toBe(8);
    });

    it('derivarSeveridadAlerta genera BAJA, MEDIA, ALTA y preserva CRITICA para red flags', () => {
      expect(derivarSeveridadAlerta(2, false)).toBe('BAJA');
      expect(derivarSeveridadAlerta(5, false)).toBe('MEDIA');
      expect(derivarSeveridadAlerta(7, false)).toBe('ALTA');
      expect(derivarSeveridadAlerta(9, false)).toBe('ALTA');
      expect(derivarSeveridadAlerta(3, true)).toBe('CRITICA');
      expect(derivarSeveridadAlerta(7, true)).toBe('CRITICA');
    });

    it('validarTransicionEstadoDolor exige nota al reabrir un caso RESUELTO', () => {
      expect(() => {
        validarTransicionEstadoDolor('RESUELTO', 'PENDIENTE');
      }).toThrow(/Para reabrir un caso de dolor resuelto/);

      expect(() => {
        validarTransicionEstadoDolor('RESUELTO', 'ATENDIDO', '');
      }).toThrow(/Para reabrir un caso de dolor resuelto/);

      expect(() => {
        validarTransicionEstadoDolor('RESUELTO', 'ATENDIDO', '   ');
      }).toThrow(/Para reabrir un caso de dolor resuelto/);

      expect(() => {
        validarTransicionEstadoDolor('RESUELTO', 'ATENDIDO', 'Nota médica de seguimiento');
      }).not.toThrow();

      expect(() => {
        validarTransicionEstadoDolor('PENDIENTE', 'ATENDIDO');
      }).not.toThrow();
    });

    it('sincronizarAlertaConHistorial calcula coherentemente los campos para alertas_entrenador', () => {
      const sinc = sincronizarAlertaConHistorial({
        eva: 7,
        severidad: 'AGUDO',
        estado: 'PENDIENTE',
        es_sintoma_alarma: false,
      });
      expect(sinc.severidad).toBe('ALTA');
      expect(sinc.estado).toBe('PENDIENTE');

      const sincAlarma = sincronizarAlertaConHistorial({
        eva: 4,
        severidad: 'MODERADO',
        estado: 'ATENDIDO',
        es_sintoma_alarma: true,
      });
      expect(sincAlarma.severidad).toBe('CRITICA');
      expect(sincAlarma.estado).toBe('ATENDIDO');
    });
  });

  describe('3. Integración en Base de Datos PGlite (Migración, Backfill y Triggers)', () => {
    const idLeve = '10000000-0000-0000-0000-000000000001';
    const idMod = '10000000-0000-0000-0000-000000000002';
    const idAgudo = '10000000-0000-0000-0000-000000000003';

    beforeAll(async () => {
      db = new PGlite({ extensions: { pgcrypto } });
      await db.exec(SUPABASE_STUBS);

      // Aplicar todas las migraciones previas a la nueva
      const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
      for (const archivo of archivos) {
        if (archivo === NUEVA_MIGRACION) continue;
        await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf-8'));
      }

      await db.exec(SEED);

      // Insertar datos previos para probar el backfill (filas existentes con LEVE, MODERADO y AGUDO sin eva)
      await db.exec(`
        INSERT INTO public.alumno_historial_dolor (id, alumno_id, ejercicio_id, zona_articular, severidad, estado)
        VALUES
          ('${idLeve}', '${ALUMNO}', '${EJERCICIO_1}', 'HOMBRO', 'LEVE', 'PENDIENTE'),
          ('${idMod}', '${ALUMNO}', '${EJERCICIO_1}', 'RODILLA', 'MODERADO', 'ATENDIDO'),
          ('${idAgudo}', '${ALUMNO}', '${EJERCICIO_1}', 'LUMBAR', 'AGUDO', 'CERRADO');
      `);

      // Ahora aplicar la nueva migración
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), 'utf-8'));
    });

    it('GIVEN filas existentes de dolor con LEVE, MODERADO y AGUDO WHEN corre la migración THEN eva queda 3, 5 y 8 respectivamente', async () => {
      const res = await db.query<{ id: string; eva: number; severidad: string; estado: string }>(
        `SELECT id, eva, severidad, estado FROM public.alumno_historial_dolor WHERE id IN ('${idLeve}', '${idMod}', '${idAgudo}') ORDER BY id`
      );

      const filaLeve = res.rows.find((r) => r.id === idLeve);
      const filaMod = res.rows.find((r) => r.id === idMod);
      const filaAgudo = res.rows.find((r) => r.id === idAgudo);

      expect(filaLeve?.eva).toBe(3);
      expect(filaMod?.eva).toBe(5);
      expect(filaAgudo?.eva).toBe(8);

      // Y CERRADO migró a RESUELTO
      expect(filaAgudo?.estado).toBe('RESUELTO');
    });

    it('correr la migración una segunda vez es 100% idempotente y no produce cambios ni errores', async () => {
      await expect(
        aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), 'utf-8'))
      ).resolves.not.toThrow();

      const res = await db.query<{ id: string; eva: number }>(
        `SELECT id, eva FROM public.alumno_historial_dolor WHERE id = '${idAgudo}'`
      );
      expect(res.rows[0].eva).toBe(8);
    });

    it('GIVEN un caso con eva = 7 THEN severidad = "AGUDO", v_dolor_activo.nivel = "alto" y la alerta en alertas_entrenador tiene severidad = "ALTA"', async () => {
      const caso7Id = '20000000-0000-0000-0000-000000000007';

      await db.exec(`
        INSERT INTO public.alumno_historial_dolor (id, alumno_id, ejercicio_id, zona_articular, eva, estado)
        VALUES ('${caso7Id}', '${ALUMNO}', '${EJERCICIO_1}', 'CADERA', 7, 'PENDIENTE');
      `);

      // 1. Severidad derivada automáticamente a 'AGUDO'
      const casoRes = await db.query<{ severidad: string; eva: number; estado: string }>(
        `SELECT severidad, eva, estado FROM public.alumno_historial_dolor WHERE id = '${caso7Id}'`
      );
      expect(casoRes.rows[0].severidad).toBe('AGUDO');
      expect(casoRes.rows[0].eva).toBe(7);

      // 2. v_dolor_activo muestra nivel = 'alto'
      const vistaRes = await db.query<{ nivel: string; severidad: string }>(
        `SELECT nivel, severidad FROM public.v_dolor_activo WHERE id = '${caso7Id}'`
      );
      expect(vistaRes.rows.length).toBe(1);
      expect(vistaRes.rows[0].nivel).toBe('alto');
      expect(vistaRes.rows[0].severidad).toBe('AGUDO');

      // 3. Alerta en alertas_entrenador creada con severidad = 'ALTA' (no CRITICA al no haber sintoma de alarma)
      const alertaRes = await db.query<{ severidad: string; estado: string; tipo_alerta: string }>(
        `SELECT severidad, estado, tipo_alerta FROM public.alertas_entrenador WHERE reporte_dolor_id = '${caso7Id}'`
      );
      expect(alertaRes.rows.length).toBe(1);
      expect(alertaRes.rows[0].severidad).toBe('ALTA');
      expect(alertaRes.rows[0].estado).toBe('PENDIENTE');
      expect(alertaRes.rows[0].tipo_alerta).toBe('DOLOR_ARTICULAR');
    });

    it('GIVEN un caso PENDIENTE WHEN se invoca actualizar_estado_dolor(caso, "ATENDIDO") THEN tanto el caso como su alerta espejada pasan a ATENDIDO', async () => {
      const caso7Id = '20000000-0000-0000-0000-000000000007';

      // Invocamos la RPC
      await db.query(`SELECT public.actualizar_estado_dolor('${caso7Id}'::uuid, 'ATENDIDO')`);

      // 1. Caso en alumno_historial_dolor pasa a ATENDIDO
      const casoRes = await db.query<{ estado: string }>(
        `SELECT estado FROM public.alumno_historial_dolor WHERE id = '${caso7Id}'`
      );
      expect(casoRes.rows[0].estado).toBe('ATENDIDO');

      // 2. Alerta espejada pasa a ATENDIDO
      const alertaRes = await db.query<{ estado: string }>(
        `SELECT estado FROM public.alertas_entrenador WHERE reporte_dolor_id = '${caso7Id}'`
      );
      expect(alertaRes.rows[0].estado).toBe('ATENDIDO');

      // Sigue figurando en v_dolor_activo por ser caso activo (ATENDIDO)
      const vistaRes = await db.query<{ estado: string }>(
        `SELECT estado FROM public.v_dolor_activo WHERE id = '${caso7Id}'`
      );
      expect(vistaRes.rows.length).toBe(1);
      expect(vistaRes.rows[0].estado).toBe('ATENDIDO');
    });

    it('GIVEN un caso RESUELTO WHEN se intenta reabrir sin nota THEN la RPC rechaza con error de validación', async () => {
      const caso7Id = '20000000-0000-0000-0000-000000000007';

      // Primero pasamos el caso a RESUELTO
      await db.query(`SELECT public.actualizar_estado_dolor('${caso7Id}'::uuid, 'RESUELTO', 'Completó protocolo de rehabilitación')`);

      const resueltoCheck = await db.query<{ estado: string }>(
        `SELECT estado FROM public.alumno_historial_dolor WHERE id = '${caso7Id}'`
      );
      expect(resueltoCheck.rows[0].estado).toBe('RESUELTO');

      // En v_dolor_activo ya no aparece porque está RESUELTO
      const vistaRes = await db.query(`SELECT id FROM public.v_dolor_activo WHERE id = '${caso7Id}'`);
      expect(vistaRes.rows.length).toBe(0);

      // Ahora intentamos reabrir a ATENDIDO o PENDIENTE sin nota
      await expect(
        db.query(`SELECT public.actualizar_estado_dolor('${caso7Id}'::uuid, 'ATENDIDO')`)
      ).rejects.toThrow(/reabrir/i);

      await expect(
        db.query(`SELECT public.actualizar_estado_dolor('${caso7Id}'::uuid, 'PENDIENTE', '')`)
      ).rejects.toThrow(/reabrir/i);

      await expect(
        db.query(`SELECT public.actualizar_estado_dolor('${caso7Id}'::uuid, 'PENDIENTE', '   ')`)
      ).rejects.toThrow(/reabrir/i);

      // Comprobamos que el caso sigue RESUELTO
      const checkPost = await db.query<{ estado: string }>(
        `SELECT estado FROM public.alumno_historial_dolor WHERE id = '${caso7Id}'`
      );
      expect(checkPost.rows[0].estado).toBe('RESUELTO');

      // Pero si se incluye una nota explicativa, la reapertura tiene éxito
      await expect(
        db.query(`SELECT public.actualizar_estado_dolor('${caso7Id}'::uuid, 'ATENDIDO', 'Reapertura: alumno reportó molestia en calentamiento')`)
      ).resolves.not.toThrow();

      const reabierto = await db.query<{ estado: string; notas_profesor: string }>(
        `SELECT estado, notas_profesor FROM public.alumno_historial_dolor WHERE id = '${caso7Id}'`
      );
      expect(reabierto.rows[0].estado).toBe('ATENDIDO');
      expect(reabierto.rows[0].notas_profesor).toContain('Reapertura: alumno reportó molestia');

      // La alerta espejada también se reactiva a ATENDIDO
      const alertaReabierta = await db.query<{ estado: string }>(
        `SELECT estado FROM public.alertas_entrenador WHERE reporte_dolor_id = '${caso7Id}'`
      );
      expect(alertaReabierta.rows[0].estado).toBe('ATENDIDO');
    });

    it('RLS en v_dolor_activo: un alumno solo ve sus propios reportes de dolor', async () => {
      // El ALUMNO consulta la vista
      const resAlumno = await como<{ id: string }>(
        'authenticated',
        ALUMNO,
        'SELECT id FROM public.v_dolor_activo'
      );
      // Debe ver sus propios reportes
      expect(resAlumno.rows.length).toBeGreaterThan(0);

      // Otro alumno consulta la vista y no debe ver los del primer alumno
      const resOtro = await como<{ id: string }>(
        'authenticated',
        ALUMNO_OTRO,
        'SELECT id FROM public.v_dolor_activo'
      );
      expect(resOtro.rows.length).toBe(0);
    });

    it('RLS en v_dolor_activo: el entrenador ve los reportes de sus alumnos asignados', async () => {
      const resCoach = await como<{ id: string }>(
        'authenticated',
        COACH,
        'SELECT id FROM public.v_dolor_activo'
      );
      expect(resCoach.rows.length).toBeGreaterThan(0);
    });
  });
});
