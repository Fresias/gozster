import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatearMedioPago, MEDIO_PAGO_LABEL, normalizarMedioPago } from '@/lib/cobros';
import { formatearMedioPago as formatearDesdeFormat } from '@/lib/format-medio-pago';
import { nivelDesdeEva, derivarSeveridadDesdeEva } from '@/lib/dolor';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const MIGRACION_OLA1 = '20261107000000_ola1_dolor_nivel_permisos_registrar_pago.sql';

const ADMIN = '00000000-0000-0000-0000-0000000000ad';
const COACH = '00000000-0000-0000-0000-00000000c0ac';
const COACH_OTRO = '00000000-0000-0000-0000-00000000c0b2';
const ALUMNO = '00000000-0000-0000-0000-00000000000a';
const ALUMNO_OTRO = '00000000-0000-0000-0000-00000000000b';

const EJERCICIO_1 = '00000000-0000-0000-0000-0000000000e1';
const CONTRATACION_1 = '30000000-0000-0000-0000-000000000001';

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

  INSERT INTO public.contrataciones (
    id, alumno_id, tipo_servicio, estado, dia_vencimiento, fecha_inicio, fecha_fin, precio_pactado
  ) VALUES (
    '${CONTRATACION_1}', '${ALUMNO}', 'PRESENCIAL', 'VIGENTE', 5, '2026-10-01', '2026-12-31', 40000
  );
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

describe('GOZS-406: Ola 1 Base Backend — v_dolor_activo.nivel, permisos, actualizar_estado_dolor y registrar_pago (4 medios)', () => {
  describe('1. Verificación Estática y Unit Tests TypeScript (formatearMedioPago y dolor)', () => {
    it('existe la migración append-only 20261107000000_ola1_dolor_nivel_permisos_registrar_pago.sql', () => {
      const ruta = path.join(MIGRATIONS_DIR, MIGRACION_OLA1);
      expect(fs.existsSync(ruta)).toBe(true);
      const sql = fs.readFileSync(ruta, 'utf-8');
      expect(sql).toContain('CREATE OR REPLACE VIEW public.v_dolor_activo');
      expect(sql).toContain('REVOKE ALL ON public.v_dolor_activo FROM PUBLIC, anon;');
      expect(sql).toContain('GRANT SELECT ON public.v_dolor_activo TO authenticated, service_role;');
      expect(sql).toContain('COMMENT ON FUNCTION public.fn_derivar_severidad_dolor() IS');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.registrar_pago');
      expect(sql).not.toContain('USING (true)');
    });

    it('GIVEN formatearMedioPago WHEN recibe TRANSFERENCIA, EFECTIVO, PASARELA_ONLINE y OTRO THEN devuelve Transferencia, Efectivo, Mercado Pago y Otro respectivamente', () => {
      expect(formatearMedioPago('TRANSFERENCIA')).toBe('Transferencia');
      expect(formatearMedioPago('EFECTIVO')).toBe('Efectivo');
      expect(formatearMedioPago('PASARELA_ONLINE')).toBe('Mercado Pago');
      expect(formatearMedioPago('OTRO')).toBe('Otro');

      // También soporta MERCADO_PAGO y re-export desde format-medio-pago
      expect(formatearMedioPago('MERCADO_PAGO')).toBe('Mercado Pago');
      expect(formatearMedioPago(null)).toBe('—');
      expect(formatearMedioPago(undefined)).toBe('—');
      expect(formatearDesdeFormat('PASARELA_ONLINE')).toBe('Mercado Pago');
      expect(MEDIO_PAGO_LABEL.PASARELA_ONLINE).toBe('Mercado Pago');
      expect(normalizarMedioPago('MERCADO_PAGO')).toBe('PASARELA_ONLINE');
    });

    it('nivelDesdeEva y derivarSeveridadDesdeEva contemplan síntoma de alarma con eva < 7', () => {
      expect(nivelDesdeEva(2, true)).toBe('alto');
      expect(derivarSeveridadDesdeEva(2, true)).toBe('CRITICA');
    });
  });

  describe('2. Criterios Gherkin en Base de Datos PGlite', () => {
    beforeAll(async () => {
      db = new PGlite({ extensions: { pgcrypto } });
      await db.exec(SUPABASE_STUBS);

      const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
      for (const archivo of archivos) {
        await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf-8'));
      }

      // Verificar idempotencia de la migración de Ola 1
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACION_OLA1), 'utf-8'));

      await db.exec(SEED);
    }, 60_000);

    it('GIVEN un reporte en alumno_historial_dolor con eva = 2 y es_sintoma_alarma = true WHEN se consulta public.v_dolor_activo THEN severidad = CRITICA y nivel = alto', async () => {
      const casoAlarmaId = '40000000-0000-0000-0000-000000000001';

      await db.exec(`
        INSERT INTO public.alumno_historial_dolor (
          id, alumno_id, ejercicio_id, zona_articular, eva, es_sintoma_alarma, sintomas_alarma, estado
        ) VALUES (
          '${casoAlarmaId}', '${ALUMNO}', '${EJERCICIO_1}', 'HOMBRO', 2, true, ARRAY['Dolor punzante o súbito'], 'PENDIENTE'
        );
      `);

      const vistaRes = await como<{ id: string; eva: number; severidad: string; nivel: string; es_sintoma_alarma: boolean }>(
        'authenticated',
        COACH,
        `SELECT id, eva, severidad, nivel, es_sintoma_alarma FROM public.v_dolor_activo WHERE id = '${casoAlarmaId}'`
      );

      expect(vistaRes.rows).toHaveLength(1);
      expect(vistaRes.rows[0]!.eva).toBe(2);
      expect(vistaRes.rows[0]!.es_sintoma_alarma).toBe(true);
      expect(vistaRes.rows[0]!.severidad).toBe('CRITICA');
      expect(vistaRes.rows[0]!.nivel).toBe('alto');
    });

    it('GIVEN el rol anon WHEN se verifican los privilegios sobre public.v_dolor_activo THEN anon no tiene permiso SELECT', async () => {
      const privRes = await db.query<{ tiene_select: boolean }>(
        `SELECT has_table_privilege('anon', 'public.v_dolor_activo', 'SELECT') AS tiene_select`
      );
      expect(privRes.rows[0]!.tiene_select).toBe(false);

      await expect(
        como('anon', null, 'SELECT * FROM public.v_dolor_activo')
      ).rejects.toThrow(/permission denied/i);
    });

    it('GIVEN un usuario autenticado cuyo auth.uid() es alumno_id (y no es entrenador ni admin) WHEN invoca public.actualizar_estado_dolor THEN la función rechaza la operación con excepción de permisos', async () => {
      const casoId = '40000000-0000-0000-0000-000000000001';

      // El propio alumno intenta cambiar el estado de su reporte de dolor
      await expect(
        como(
          'authenticated',
          ALUMNO,
          `SELECT * FROM public.actualizar_estado_dolor('${casoId}'::uuid, 'ATENDIDO', 'Intento de auto-atención por alumno')`
        )
      ).rejects.toMatchObject({ code: '42501' });

      // Verificar que el estado sigue siendo PENDIENTE y notas_profesor sigue NULL
      const checkRes = await db.query<{ estado: string; notas_profesor: string | null }>(
        `SELECT estado, notas_profesor FROM public.alumno_historial_dolor WHERE id = '${casoId}'`
      );
      expect(checkRes.rows[0]!.estado).toBe('PENDIENTE');
      expect(checkRes.rows[0]!.notas_profesor).toBeNull();

      // En cambio, su entrenador asignado sí puede actualizarlo
      const okCoach = await como<{ estado: string; notas_profesor: string | null }>(
        'authenticated',
        COACH,
        `SELECT estado, notas_profesor FROM public.actualizar_estado_dolor('${casoId}'::uuid, 'ATENDIDO', 'Evaluación clínica por entrenador')`
      );
      expect(okCoach.rows[0]!.estado).toBe('ATENDIDO');
      expect(okCoach.rows[0]!.notas_profesor).toContain('Evaluación clínica por entrenador');
    });

    it('fn_derivar_severidad_dolor cuenta con su COMMENT ON FUNCTION documentado en catálogo', async () => {
      const commentRes = await db.query<{ comentario: string | null }>(
        `SELECT obj_description('public.fn_derivar_severidad_dolor()'::regprocedure, 'pg_proc') AS comentario`
      );
      expect(commentRes.rows[0]!.comentario).toContain('alumno_historial_dolor');
      expect(commentRes.rows[0]!.comentario).toContain('es_sintoma_alarma');
    });

    it('GIVEN public.registrar_pago WHEN se invoca con p_metodo = PASARELA_ONLINE, OTRO, TRANSFERENCIA, EFECTIVO o MERCADO_PAGO THEN registra el pago exitosamente en public.pagos y marca el cobro como PAGADO', async () => {
      const casos: Array<{ periodo: string; metodoInput: string; medioEsperado: string }> = [
        { periodo: '2026-08-01', metodoInput: 'PASARELA_ONLINE', medioEsperado: 'PASARELA_ONLINE' },
        { periodo: '2026-09-01', metodoInput: 'OTRO', medioEsperado: 'OTRO' },
        { periodo: '2026-10-01', metodoInput: 'MERCADO_PAGO', medioEsperado: 'PASARELA_ONLINE' },
        { periodo: '2026-11-01', metodoInput: 'TRANSFERENCIA', medioEsperado: 'TRANSFERENCIA' },
        { periodo: '2026-12-01', metodoInput: 'EFECTIVO', medioEsperado: 'EFECTIVO' },
      ];

      for (const c of casos) {
        const cobroIns = await db.query<{ id: string }>(
          `INSERT INTO public.cobros (contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
           VALUES ('${CONTRATACION_1}', '${ALUMNO}', '${c.periodo}', 40000, '${c.periodo}')
           RETURNING id`
        );
        const cobroId = cobroIns.rows[0]!.id;

        const rpcRes = await como<{ id: string; estado: string }>(
          'authenticated',
          COACH,
          `SELECT id, estado FROM public.registrar_pago('${cobroId}'::uuid, 40000, '${c.metodoInput}')`
        );
        expect(rpcRes.rows[0]!.estado).toBe('PAGADO');

        const pagoRes = await db.query<{ medio_pago: string; estado: string; monto: string }>(
          `SELECT medio_pago, estado, monto::text FROM public.pagos WHERE cobro_id = '${cobroId}'`
        );
        expect(pagoRes.rows).toHaveLength(1);
        expect(pagoRes.rows[0]!.medio_pago).toBe(c.medioEsperado);
        expect(pagoRes.rows[0]!.estado).toBe('CONFIRMADO');
        expect(Number(pagoRes.rows[0]!.monto)).toBe(40000);
      }
    });
  });
});
