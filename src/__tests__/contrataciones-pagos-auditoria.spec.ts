import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Issue #64 (ADR-001): estado de cuenta, contrataciones, pagos idempotentes con
// anclaje de fecha, extensión excepcional auditada y evaluación de vencimientos.
// Migración probada sobre Postgres real (PGlite) con roles de Supabase simulados.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261019000000_contrataciones_pagos_auditoria_backup.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";
const OTRO_ALUMNO = "00000000-0000-0000-0000-00000000000b";

const C_ALUMNO = "10000000-0000-0000-0000-000000000001";
const C_OTRO_ALUMNO = "10000000-0000-0000-0000-000000000002";
const C_FIN_DE_MES = "10000000-0000-0000-0000-000000000003";
const C_VENCIDA = "10000000-0000-0000-0000-000000000004";
const C_POR_VENCER = "10000000-0000-0000-0000-000000000005";
const C_VIGENTE = "10000000-0000-0000-0000-000000000006";
const C_EN_PAUSA = "10000000-0000-0000-0000-000000000007";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SEED_PERFILES = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),
    ('${ALUMNO}','a@t'),('${OTRO_ALUMNO}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a@t','Alumno','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','b@t','Otro alumno','ALUMNO','${OTRO_COACH}','BAJA');
`;

const SEED_CONTRATACIONES = `
  INSERT INTO public.contrataciones (id, alumno_id, dia_vencimiento, fecha_inicio, fecha_fin, estado) VALUES
    ('${C_ALUMNO}','${ALUMNO}',10,'2026-09-10','2026-10-10','VENCIDA'),
    ('${C_OTRO_ALUMNO}','${OTRO_ALUMNO}',10,'2026-09-10','2026-10-10','VIGENTE'),
    ('${C_FIN_DE_MES}','${ALUMNO}',31,'2026-12-31','2027-01-31','VIGENTE'),
    ('${C_VENCIDA}','${ALUMNO}',5,CURRENT_DATE - 40,CURRENT_DATE - 1,'VIGENTE'),
    ('${C_POR_VENCER}','${ALUMNO}',5,CURRENT_DATE - 27,CURRENT_DATE + 3,'VIGENTE'),
    ('${C_VIGENTE}','${ALUMNO}',5,CURRENT_DATE,CURRENT_DATE + 30,'VIGENTE'),
    ('${C_EN_PAUSA}','${ALUMNO}',5,CURRENT_DATE - 40,CURRENT_DATE - 10,'EN_PAUSA');
`;

let db: PGlite;

async function aplicarMigracion(sql: string) {
  // Statements previos a BEGIN (ALTER TYPE ... ADD VALUE) requieren su propia transacción
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

type Contratacion = { id: string; estado: string; fecha_fin: string; dia_vencimiento: number };

async function contratacion(id: string): Promise<Contratacion> {
  const r = await db.query<Contratacion>(
    `SELECT id, estado, fecha_fin::text AS fecha_fin, dia_vencimiento FROM public.contrataciones WHERE id = '${id}'`
  );
  return r.rows[0]!;
}

async function contar(sql: string): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`);
  return r.rows[0]!.n;
}

function renovar(sub: string, id: string, clave: string, monto = 15000, rol: Rol = "authenticated") {
  return como<Contratacion>(
    rol,
    sub,
    `SELECT id, estado, fecha_fin::text AS fecha_fin, dia_vencimiento
     FROM public.registrar_y_confirmar_renovacion('${id}', ${monto}, 'TRANSFERENCIA', '${clave}')`
  );
}

function extender(sub: string, id: string, fecha: string, motivo: string) {
  return como<Contratacion>(
    "authenticated",
    sub,
    `SELECT id, estado, fecha_fin::text AS fecha_fin, dia_vencimiento
     FROM public.extender_contratacion_excepcional('${id}', '${fecha}', ${motivo === "" ? "''" : `'${motivo}'`})`
  );
}

const DENEGADO = /row-level security|permission denied|Solo|No autorizado|período/;

describe("Issue #64: contrataciones, pagos y auditoría (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === NEW_MIGRATION) await db.exec(SEED_PERFILES);
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED_CONTRATACIONES);
  }, 60_000);

  describe("estado de cuenta (perfiles.estado_cuenta)", () => {
    it("es NOT NULL DEFAULT 'ACTIVO' y el backfill marca las bajas legadas", async () => {
      const r = await db.query<{ id: string; estado_cuenta: string }>(
        `SELECT id, estado_cuenta FROM public.perfiles WHERE id IN ('${ALUMNO}','${OTRO_ALUMNO}') ORDER BY id`
      );
      expect(r.rows).toEqual([
        { id: ALUMNO, estado_cuenta: "ACTIVO" },
        { id: OTRO_ALUMNO, estado_cuenta: "BAJA_ADMINISTRATIVA" },
      ]);
      await expect(
        db.query(`UPDATE public.perfiles SET estado_cuenta = 'ELIMINADO' WHERE id = '${ALUMNO}'`)
      ).rejects.toThrow(/chk_perfiles_estado_cuenta/);
    });

    it("el alumno no puede cambiar su propio estado de cuenta", async () => {
      await expect(
        como("authenticated", ALUMNO, `UPDATE public.perfiles SET estado_cuenta = 'SUSPENDIDO' WHERE id = '${ALUMNO}'`)
      ).rejects.toThrow(DENEGADO);
    });

    it("la baja administrativa del entrenador sella fecha_baja y conserva sus contrataciones", async () => {
      await como("authenticated", COACH, `UPDATE public.perfiles SET estado_cuenta = 'BAJA_ADMINISTRATIVA' WHERE id = '${ALUMNO}'`);
      const r = await db.query<{ estado_cuenta: string; con_fecha: boolean }>(
        `SELECT estado_cuenta, fecha_baja IS NOT NULL AS con_fecha FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]).toEqual({ estado_cuenta: "BAJA_ADMINISTRATIVA", con_fecha: true });
      expect(await contar(`public.contrataciones WHERE alumno_id = '${ALUMNO}'`)).toBe(6);

      await como("authenticated", COACH, `UPDATE public.perfiles SET estado_cuenta = 'ACTIVO' WHERE id = '${ALUMNO}'`);
    });
  });

  describe("RLS de contrataciones y pagos", () => {
    it("el alumno solo ve sus contrataciones; el otro entrenador no ve las ajenas", async () => {
      const propias = await como<{ alumno_id: string }>("authenticated", ALUMNO, `SELECT alumno_id FROM public.contrataciones`);
      expect(propias.rows.length).toBe(6);
      expect(propias.rows.every((r) => r.alumno_id === ALUMNO)).toBe(true);

      const ajenas = await como("authenticated", OTRO_COACH, `SELECT 1 FROM public.contrataciones WHERE alumno_id = '${ALUMNO}'`);
      expect(ajenas.rows).toHaveLength(0);
      const anon = await como("anon", null, `SELECT 1 FROM public.contrataciones`);
      expect(anon.rows).toHaveLength(0);
    });

    it("solo el entrenador del alumno (o ADMIN) crea contrataciones", async () => {
      const alta = `INSERT INTO public.contrataciones (alumno_id, dia_vencimiento, fecha_inicio, fecha_fin)
                    VALUES ('${ALUMNO}', 1, '2027-01-01', '2027-02-01')`;
      await expect(como("authenticated", ALUMNO, alta)).rejects.toThrow(DENEGADO);
      await expect(como("authenticated", OTRO_COACH, alta)).rejects.toThrow(DENEGADO);
      await db.transaction(async (tx) => {
        await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: COACH, role: "authenticated" })]);
        await tx.query(`SET LOCAL ROLE authenticated`);
        const r = await tx.query(alta + " RETURNING id");
        expect(r.rows).toHaveLength(1);
        await tx.rollback();
      });
    });

    it("el entrenador cambia el estado pero no el período con un UPDATE directo", async () => {
      await como("authenticated", COACH, `UPDATE public.contrataciones SET estado = 'PENDIENTE_RENOVACION' WHERE id = '${C_VIGENTE}'`);
      expect((await contratacion(C_VIGENTE)).estado).toBe("PENDIENTE_RENOVACION");
      await como("authenticated", COACH, `UPDATE public.contrataciones SET estado = 'VIGENTE' WHERE id = '${C_VIGENTE}'`);

      await expect(
        como("authenticated", COACH, `UPDATE public.contrataciones SET fecha_fin = '2030-01-01' WHERE id = '${C_ALUMNO}'`)
      ).rejects.toThrow(/período/);
      await expect(
        como("authenticated", COACH, `UPDATE public.contrataciones SET dia_vencimiento = 18 WHERE id = '${C_ALUMNO}'`)
      ).rejects.toThrow(/período/);
    });

    it("nadie borra contrataciones ni pagos vía API, y nadie inserta pagos directamente", async () => {
      const borrado = await como("authenticated", COACH, `DELETE FROM public.contrataciones WHERE id = '${C_ALUMNO}' RETURNING id`);
      expect(borrado.rows).toHaveLength(0);
      for (const sub of [ALUMNO, COACH]) {
        await expect(
          como("authenticated", sub, `INSERT INTO public.pagos (contratacion_id, alumno_id, monto, medio_pago, estado, idempotency_key)
                                      VALUES ('${C_ALUMNO}', '${ALUMNO}', 1, 'EFECTIVO', 'CONFIRMADO', 'directo-${sub}')`)
        ).rejects.toThrow(DENEGADO);
      }
    });
  });

  describe("registrar_y_confirmar_renovacion", () => {
    it("ancla la fecha: vencía el 10/10, paga el 18 -> vence el 10/11 sin mover el día de corte", async () => {
      const r = await renovar(COACH, C_ALUMNO, "op-0001");
      expect(r.rows[0]).toMatchObject({ fecha_fin: "2026-11-10", dia_vencimiento: 10 });

      const pagos = await db.query<{ estado: string; confirmado_por: string; monto: string; con_fecha: boolean }>(
        `SELECT estado, confirmado_por, monto::text AS monto, confirmado_at IS NOT NULL AS con_fecha
         FROM public.pagos WHERE contratacion_id = '${C_ALUMNO}'`
      );
      expect(pagos.rows).toEqual([{ estado: "CONFIRMADO", confirmado_por: COACH, monto: "15000.00", con_fecha: true }]);
    });

    it("es idempotente: reintentar con la misma clave no duplica el cobro ni suma otro mes", async () => {
      const r = await renovar(COACH, C_ALUMNO, "op-0001");
      expect(r.rows[0]!.fecha_fin).toBe("2026-11-10");
      expect(await contar(`public.pagos WHERE idempotency_key = 'op-0001'`)).toBe(1);
      expect(await contar(`public.pagos WHERE contratacion_id = '${C_ALUMNO}'`)).toBe(1);

      const siguiente = await renovar(COACH, C_ALUMNO, "op-0002");
      expect(siguiente.rows[0]!.fecha_fin).toBe("2026-12-10");
      expect(await contar(`public.pagos WHERE contratacion_id = '${C_ALUMNO}'`)).toBe(2);
    });

    it("rechaza reutilizar una clave de otra contratación", async () => {
      await expect(renovar(ADMIN, C_OTRO_ALUMNO, "op-0001")).rejects.toThrow(/otra contratación/);
      expect((await contratacion(C_OTRO_ALUMNO)).fecha_fin).toBe("2026-10-10");
    });

    it("respeta el día de corte en meses cortos (31/01 -> 28/02 -> 31/03)", async () => {
      expect((await renovar(COACH, C_FIN_DE_MES, "fin-1")).rows[0]!.fecha_fin).toBe("2027-02-28");
      expect((await renovar(COACH, C_FIN_DE_MES, "fin-2")).rows[0]!.fecha_fin).toBe("2027-03-31");
    });

    it("solo el entrenador del alumno, ADMIN o service_role confirman pagos", async () => {
      await expect(renovar(ALUMNO, C_ALUMNO, "op-alumno")).rejects.toThrow(DENEGADO);
      await expect(renovar(OTRO_COACH, C_ALUMNO, "op-otro")).rejects.toThrow(DENEGADO);
      await expect(
        como("anon", null, `SELECT public.registrar_y_confirmar_renovacion('${C_ALUMNO}', 1, 'EFECTIVO', 'op-anon')`)
      ).rejects.toThrow(/permission denied/);

      const webhook = await renovar("", C_OTRO_ALUMNO, "pasarela-1", 15000, "service_role");
      expect(webhook.rows[0]!.fecha_fin).toBe("2026-11-10");
    });

    it("valida monto, medio de pago y clave", async () => {
      await expect(renovar(COACH, C_ALUMNO, "op-neg", -1)).rejects.toThrow(/monto/);
      await expect(renovar(COACH, C_ALUMNO, " ")).rejects.toThrow(/idempotencia/);
      await expect(
        como("authenticated", COACH, `SELECT public.registrar_y_confirmar_renovacion('${C_ALUMNO}', 1, 'CRIPTO', 'op-cripto')`)
      ).rejects.toThrow(/medio_pago/);
      expect((await contratacion(C_ALUMNO)).fecha_fin).toBe("2026-12-10");
    });
  });

  describe("extender_contratacion_excepcional", () => {
    it("exige motivo y rol de entrenador del alumno o ADMIN", async () => {
      await expect(extender(COACH, C_ALUMNO, "2026-12-20", "")).rejects.toThrow(/motivo/);
      await expect(extender(COACH, C_ALUMNO, "2026-12-20", "   ")).rejects.toThrow(/motivo/);
      await expect(extender(ALUMNO, C_ALUMNO, "2026-12-20", "quiero más días")).rejects.toThrow(DENEGADO);
      await expect(extender(OTRO_COACH, C_ALUMNO, "2026-12-20", "lesión")).rejects.toThrow(DENEGADO);
      await expect(extender(COACH, C_ALUMNO, "2026-12-01", "acortar")).rejects.toThrow(/posterior/);
      expect(await contar(`public.auditoria_cambios`)).toBe(0);
    });

    it("extiende y registra motivo, autorizado_por y fechas anterior/nueva en auditoría", async () => {
      const r = await extender(COACH, C_ALUMNO, "2026-12-20", "Lesión de rodilla: 10 días sin entrenar");
      expect(r.rows[0]!.fecha_fin).toBe("2026-12-20");

      const audit = await db.query<{
        entidad: string; accion: string; motivo: string; autorizado_por: string;
        valores_anteriores: { fecha_fin: string }; valores_nuevos: { fecha_fin: string };
      }>(`SELECT entidad, accion, motivo, autorizado_por, valores_anteriores, valores_nuevos
          FROM public.auditoria_cambios WHERE entidad_id = '${C_ALUMNO}'`);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        entidad: "contrataciones",
        accion: "EXTENSION_EXCEPCIONAL",
        motivo: "Lesión de rodilla: 10 días sin entrenar",
        autorizado_por: COACH,
      });
      expect(audit.rows[0]!.valores_anteriores.fecha_fin).toBe("2026-12-10");
      expect(audit.rows[0]!.valores_nuevos.fecha_fin).toBe("2026-12-20");
    });

    it("la renovación posterior vuelve al día de corte original (20/12 -> 10/01)", async () => {
      expect((await renovar(COACH, C_ALUMNO, "op-0003")).rows[0]!.fecha_fin).toBe("2027-01-10");
    });

    it("la auditoría la lee el entrenador del alumno, no el alumno ni otro entrenador, y no se edita", async () => {
      expect((await como("authenticated", COACH, `SELECT 1 FROM public.auditoria_cambios`)).rows).toHaveLength(1);
      expect((await como("authenticated", ALUMNO, `SELECT 1 FROM public.auditoria_cambios`)).rows).toHaveLength(0);
      expect((await como("authenticated", OTRO_COACH, `SELECT 1 FROM public.auditoria_cambios`)).rows).toHaveLength(0);
      const editada = await como("authenticated", ADMIN, `UPDATE public.auditoria_cambios SET motivo = 'x' RETURNING id`);
      expect(editada.rows).toHaveLength(0);
    });
  });

  describe("evaluar_vencimientos_contrataciones", () => {
    it("solo ADMIN, service_role o el job sin JWT pueden ejecutarla", async () => {
      await expect(
        como("authenticated", COACH, `SELECT * FROM public.evaluar_vencimientos_contrataciones()`)
      ).rejects.toThrow(/Solo un administrador/);
      await expect(
        como("anon", null, `SELECT * FROM public.evaluar_vencimientos_contrataciones()`)
      ).rejects.toThrow(/permission denied/);
    });

    it("marca VENCIDA al día siguiente de fecha_fin y POR_VENCER dentro del aviso, sin tocar EN_PAUSA", async () => {
      await como("authenticated", ADMIN, `SELECT * FROM public.evaluar_vencimientos_contrataciones()`);

      expect((await contratacion(C_VENCIDA)).estado).toBe("VENCIDA");
      expect((await contratacion(C_POR_VENCER)).estado).toBe("POR_VENCER");
      expect((await contratacion(C_VIGENTE)).estado).toBe("VIGENTE");
      expect((await contratacion(C_EN_PAUSA)).estado).toBe("EN_PAUSA");
    });

    it("avisa al entrenador con una alerta CUOTA_VENCIDA y es idempotente", async () => {
      const alertas = `public.alertas_entrenador WHERE tipo_alerta = 'CUOTA_VENCIDA' AND alumno_id = '${ALUMNO}' AND profesor_id = '${COACH}'`;
      expect(await contar(alertas)).toBe(1);

      const r = await db.query<{ por_vencer: number; vencidas: number }>(`SELECT * FROM public.evaluar_vencimientos_contrataciones()`);
      expect(r.rows[0]).toEqual({ por_vencer: 0, vencidas: 0 });
      expect(await contar(alertas)).toBe(1);
    });

    it("no borra datos del alumno vencido", async () => {
      expect(await contar(`public.contrataciones WHERE alumno_id = '${ALUMNO}'`)).toBe(6);
      expect(await contar(`public.perfiles WHERE id = '${ALUMNO}' AND estado_cuenta = 'ACTIVO'`)).toBe(1);
    });
  });
});
