import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import {
  asignarSuscripcionYCobro,
  fetchCobrosDatasetFromSupabase,
  registrarPagoReal,
} from "@/services/cobros-service";

const NEW_MIGRATION = "20261120210000_cobros_reales_asignar_suscripcion_y_registrar_pago.sql";

const ADMIN = "00000000-0000-0000-0000-000000000001";
const COACH_A = "00000000-0000-0000-0000-0000000000a1";
const COACH_B = "00000000-0000-0000-0000-0000000000b1";
const ALU_A1 = "00000000-0000-0000-0000-0000000000a2";
const ALU_A2 = "00000000-0000-0000-0000-0000000000a3";
const ALU_A3 = "00000000-0000-0000-0000-0000000000a4";
const ALU_B = "00000000-0000-0000-0000-0000000000b2";

const PLAN_FUNCIONAL_2X = "20000000-0000-0000-0000-000000000001";
const PLAN_BOXEO_2X = "20000000-0000-0000-0000-000000000002";
const PLAN_PASE_LIBRE = "20000000-0000-0000-0000-000000000003";
const PLAN_RUTINAS = "20000000-0000-0000-0000-000000000004";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'admin@test.local'),
    ('${COACH_A}', 'coacha@test.local'),
    ('${COACH_B}', 'coachb@test.local'),
    ('${ALU_A1}', 'alu1@test.local'),
    ('${ALU_A2}', 'alu2@test.local'),
    ('${ALU_A3}', 'alu3@test.local'),
    ('${ALU_B}', 'alub@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}', 'admin@test.local', 'Admin Principal', 'ADMIN', NULL, 'ACTIVA'),
    ('${COACH_A}', 'coacha@test.local', 'Coach Alpha', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${COACH_B}', 'coachb@test.local', 'Coach Beta', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALU_A1}', 'alu1@test.local', 'Alumno Multi', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${ALU_A2}', 'alu2@test.local', 'Alumno Pago Inmediato', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${ALU_A3}', 'alu3@test.local', 'Alumno Rutinas', 'ALUMNO', '${COACH_A}', 'ACTIVA'),
    ('${ALU_B}', 'alub@test.local', 'Alumno Ajeno', 'ALUMNO', '${COACH_B}', 'ACTIVA');

  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id) VALUES
    ('${COACH_A}', '${ALU_A1}'),
    ('${COACH_A}', '${ALU_A2}'),
    ('${COACH_A}', '${ALU_A3}'),
    ('${COACH_B}', '${ALU_B}');

  INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio) VALUES
    ('${PLAN_FUNCIONAL_2X}', 'Funcional 2x', 2, 1, 1, 25000),
    ('${PLAN_BOXEO_2X}', 'Boxeo 2x', 2, 1, 1, 22000),
    ('${PLAN_PASE_LIBRE}', 'Pase Libre', NULL, 2, 1, 40000),
    ('${PLAN_RUTINAS}', 'Rutina Online', NULL, 1, 1, 18000);
`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-641: Cobros reales Supabase, asignar_suscripcion_y_cobro y registrar_pago editable", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    // Idempotencia de la migración nueva
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
    await db.exec(SEED);
  }, 60_000);

  describe("1. PGlite: asignar_suscripcion_y_cobro (Gherkin & multiactividad)", () => {
    it("GIVEN alumno con Funcional pago del mes WHEN coach agrega Boxeo adicional con diferencia editable y Pendiente THEN mantiene Funcional activo, sincroniza alumno_actividades y crea cobro PENDIENTE", async () => {
      // Alta inicial: Funcional 2x ya pago ($25.000)
      const altaFuncional = await como<{
        contratacion_id: string;
        cobro_id: string;
        pago_id: string | null;
        estado_cobro: string;
        monto: string;
        concepto: string;
      }>(
        "authenticated",
        COACH_A,
        `SELECT * FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_A1}'::uuid,
          p_plan_id => '${PLAN_FUNCIONAL_2X}'::uuid,
          p_actividad => 'FUNCIONAL',
          p_monto => 25000,
          p_pagado => true,
          p_medio_pago => 'TRANSFERENCIA',
          p_es_adicional => false
        )`
      );

      expect(altaFuncional.rows[0]!.estado_cobro).toBe("PAGADO");
      expect(altaFuncional.rows[0]!.pago_id).toBeTruthy();

      // Coach agrega Boxeo adicional con diferencia de mitad de mes ($10.000) y pendiente
      const adicionalBoxeo = await como<{
        contratacion_id: string;
        cobro_id: string;
        pago_id: string | null;
        estado_cobro: string;
        monto: string;
        concepto: string;
      }>(
        "authenticated",
        COACH_A,
        `SELECT * FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_A1}'::uuid,
          p_plan_id => '${PLAN_BOXEO_2X}'::uuid,
          p_actividad => 'BOXEO',
          p_monto => 10000,
          p_pagado => false,
          p_es_adicional => true,
          p_concepto => 'Boxeo (adicional)',
          p_nota => 'Diferencia mitad de mes',
          p_veces_por_semana => 2
        )`
      );

      const row = adicionalBoxeo.rows[0]!;
      expect(row.estado_cobro).toBe("PENDIENTE");
      expect(row.pago_id).toBeNull();
      expect(Number(row.monto)).toBe(10000);
      expect(row.concepto).toBe("Boxeo (adicional)");

      // Ambas contrataciones siguen VIGENTE (multiactividad real)
      const contrataciones = await db.query<{ actividad: string; estado: string; precio_pactado: string }>(
        `SELECT actividad, estado, precio_pactado::text
         FROM public.contrataciones
         WHERE alumno_id = '${ALU_A1}'
         ORDER BY created_at ASC, actividad ASC`
      );
      expect(contrataciones.rows).toHaveLength(2);
      expect(contrataciones.rows.every((c) => c.estado === "VIGENTE")).toBe(true);
      expect(contrataciones.rows.map((c) => c.actividad)).toEqual(["FUNCIONAL", "BOXEO"]);
      expect(Number(contrataciones.rows[1]!.precio_pactado)).toBe(10000);

      // alumno_actividades tiene FUNCIONAL y BOXEO
      const acts = await db.query<{ actividad: string; veces_por_semana: number | null; pase_libre: boolean }>(
        `SELECT actividad, veces_por_semana, pase_libre
         FROM public.alumno_actividades
         WHERE alumno_id = '${ALU_A1}'
         ORDER BY actividad`
      );
      expect(acts.rows).toEqual([
        { actividad: "BOXEO", veces_por_semana: 2, pase_libre: false },
        { actividad: "FUNCIONAL", veces_por_semana: 2, pase_libre: false },
      ]);

      // cobros tiene 1 PAGADO ($25.000) y 1 PENDIENTE ($10.000) con concepto y notas
      const cobros = await db.query<{ estado: string; monto: string; concepto: string | null; notas: string | null }>(
        `SELECT estado, monto::text, concepto, notas
         FROM public.cobros
         WHERE alumno_id = '${ALU_A1}'
         ORDER BY monto DESC`
      );
      expect(cobros.rows).toEqual([
        { estado: "PAGADO", monto: "25000.00", concepto: "Funcional 2x", notas: null },
        {
          estado: "PENDIENTE",
          monto: "10000.00",
          concepto: "Boxeo (adicional)",
          notas: "Diferencia mitad de mes",
        },
      ]);
    });

    it("GIVEN coach marca 'Pagó' al asignar plan con monto modificado (mitad de mes) THEN el cobro nace PAGADO y se registra en pagos", async () => {
      const res = await como<{
        contratacion_id: string;
        cobro_id: string;
        pago_id: string | null;
        estado_cobro: string;
        monto: string;
      }>(
        "authenticated",
        COACH_A,
        `SELECT * FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_A2}'::uuid,
          p_plan_id => '${PLAN_PASE_LIBRE}'::uuid,
          p_monto => 20000,
          p_pagado => true,
          p_medio_pago => 'EFECTIVO',
          p_nota => 'Mitad de mes acordado'
        )`
      );

      const row = res.rows[0]!;
      expect(row.estado_cobro).toBe("PAGADO");
      expect(row.pago_id).toBeTruthy();
      expect(Number(row.monto)).toBe(20000);

      const pago = await db.query<{
        monto: string;
        medio_pago: string;
        estado: string;
        nota: string | null;
        confirmado_por: string;
      }>(
        `SELECT monto::text, medio_pago, estado, nota, confirmado_por
         FROM public.pagos WHERE id = '${row.pago_id}'`
      );
      expect(pago.rows).toEqual([
        {
          monto: "20000.00",
          medio_pago: "EFECTIVO",
          estado: "CONFIRMADO",
          nota: "Mitad de mes acordado",
          confirmado_por: COACH_A,
        },
      ]);

      // Pase libre (cantidad_actividades = 2) sincronizó FUNCIONAL y BOXEO como pase_libre = true
      const acts = await db.query<{ actividad: string; pase_libre: boolean; veces_por_semana: number | null }>(
        `SELECT actividad, pase_libre, veces_por_semana
         FROM public.alumno_actividades WHERE alumno_id = '${ALU_A2}' ORDER BY actividad`
      );
      expect(acts.rows).toEqual([
        { actividad: "BOXEO", pase_libre: true, veces_por_semana: null },
        { actividad: "FUNCIONAL", pase_libre: true, veces_por_semana: null },
      ]);
    });

    it("soporta RUTINAS (ASESORIA_ONLINE) y reemplazo (p_es_adicional = false) pausando contrataciones previas", async () => {
      const primera = await como<{ contratacion_id: string }>(
        "authenticated",
        COACH_A,
        `SELECT * FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_A3}'::uuid,
          p_plan_id => '${PLAN_FUNCIONAL_2X}'::uuid,
          p_actividad => 'FUNCIONAL',
          p_monto => 25000,
          p_pagado => false,
          p_es_adicional => true
        )`
      );

      const reemplazo = await como<{ contratacion_id: string; estado_cobro: string }>(
        "authenticated",
        COACH_A,
        `SELECT * FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_A3}'::uuid,
          p_plan_id => '${PLAN_RUTINAS}'::uuid,
          p_actividad => 'RUTINAS',
          p_monto => 18000,
          p_pagado => false,
          p_es_adicional => false
        )`
      );

      expect(reemplazo.rows[0]!.estado_cobro).toBe("PENDIENTE");

      const estados = await db.query<{ id: string; estado: string; tipo_servicio: string; actividad: string | null }>(
        `SELECT id, estado, tipo_servicio, actividad
         FROM public.contrataciones WHERE alumno_id = '${ALU_A3}'`
      );
      const cPrev = estados.rows.find((c) => c.id === primera.rows[0]!.contratacion_id);
      const cNew = estados.rows.find((c) => c.id === reemplazo.rows[0]!.contratacion_id);
      expect(cPrev?.estado).toBe("EN_PAUSA");
      expect(cNew?.estado).toBe("VIGENTE");
      expect(cNew?.tipo_servicio).toBe("ASESORIA_ONLINE");
      expect(cNew?.actividad).toBe("RUTINAS");

      const acts = await db.query<{ actividad: string }>(
        `SELECT actividad FROM public.alumno_actividades WHERE alumno_id = '${ALU_A3}'`
      );
      expect(acts.rows).toEqual([{ actividad: "RUTINAS" }]);
    });

    it("rechaza acceso de coach ajeno, alumno y anon (42501)", async () => {
      await expect(
        como(
          "authenticated",
          COACH_B,
          `SELECT * FROM public.asignar_suscripcion_y_cobro(
            p_alumno_id => '${ALU_A1}'::uuid,
            p_actividad => 'BOXEO',
            p_monto => 15000
          )`
        )
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como(
          "authenticated",
          ALU_A1,
          `SELECT * FROM public.asignar_suscripcion_y_cobro(
            p_alumno_id => '${ALU_A1}'::uuid,
            p_actividad => 'BOXEO',
            p_monto => 15000
          )`
        )
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        como(
          "anon",
          null,
          `SELECT * FROM public.asignar_suscripcion_y_cobro(
            p_alumno_id => '${ALU_A1}'::uuid,
            p_actividad => 'BOXEO',
            p_monto => 15000
          )`
        )
      ).rejects.toMatchObject({ code: "42501" });

      // Admin sí puede asignar a cualquier alumno
      const adminRes = await como<{ estado_cobro: string }>(
        "authenticated",
        ADMIN,
        `SELECT * FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_B}'::uuid,
          p_actividad => 'BOXEO',
          p_monto => 22000,
          p_pagado => false
        )`
      );
      expect(adminRes.rows[0]!.estado_cobro).toBe("PENDIENTE");
    });
  });

  describe("2. PGlite: registrar_pago editable con nota opcional", () => {
    it("permite cobrar un monto ajustado (menor o mayor al pactado) actualizando cobros.monto y registrando pagos + nota", async () => {
      const { rows } = await como<{ cobro_id: string }>(
        "authenticated",
        COACH_A,
        `SELECT cobro_id FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_A1}'::uuid,
          p_actividad => 'RUTINAS',
          p_monto => 18000,
          p_pagado => false
        )`
      );
      const cobroId = rows[0]!.cobro_id;

      // Coach modifica el importe al cobrar (ej. $12.000 por mitad de mes) con nota
      const pagado = await como<{ estado: string; monto: string; notas: string | null }>(
        "authenticated",
        COACH_A,
        `SELECT estado, monto::text, notas
         FROM public.registrar_pago('${cobroId}'::uuid, 12000, 'EFECTIVO', 'Acuerdo mitad de mes')`
      );

      expect(pagado.rows[0]).toEqual({
        estado: "PAGADO",
        monto: "12000.00",
        notas: "Acuerdo mitad de mes",
      });

      const pago = await db.query<{ monto: string; monto_lista: string; nota: string | null; medio_pago: string }>(
        `SELECT monto::text, monto_lista::text, nota, medio_pago
         FROM public.pagos WHERE cobro_id = '${cobroId}'`
      );
      expect(pago.rows).toEqual([
        {
          monto: "12000.00",
          monto_lista: "18000.00",
          nota: "Acuerdo mitad de mes",
          medio_pago: "EFECTIVO",
        },
      ]);
    });

    it("permite cobrar un monto ajustado sin nota (p_nota DEFAULT NULL)", async () => {
      const { rows } = await como<{ cobro_id: string }>(
        "authenticated",
        COACH_A,
        `SELECT cobro_id FROM public.asignar_suscripcion_y_cobro(
          p_alumno_id => '${ALU_A2}'::uuid,
          p_actividad => 'BOXEO',
          p_monto => 22000,
          p_pagado => false
        )`
      );
      const cobroId = rows[0]!.cobro_id;

      const pagado = await como<{ estado: string; monto: string }>(
        "authenticated",
        COACH_A,
        `SELECT estado, monto::text
         FROM public.registrar_pago('${cobroId}'::uuid, 15000, 'TRANSFERENCIA', NULL)`
      );
      expect(pagado.rows[0]!.estado).toBe("PAGADO");
      expect(Number(pagado.rows[0]!.monto)).toBe(15000);
    });
  });

  describe("3. Servicios TypeScript (alumnos-service y cobros-service)", () => {
    it("fetchLiveDatasetFromSupabase incluye alumnoActividades, contrataciones, planesMembresia y cobros reales", async () => {
      const datosPorTabla: Record<string, unknown[]> = {
        perfiles: [{ id: ALU_A1, nombre_completo: "Alumno Multi", rol: "ALUMNO" }],
        planes_entrenamiento: [],
        dias_rutina: [],
        ejercicios_en_rutina: [],
        ejercicios: [],
        alumno_actividades: [{ id: "aa-1", alumno_id: ALU_A1, actividad: "BOXEO", veces_por_semana: 2, pase_libre: false }],
        contrataciones: [{ id: "c-1", alumno_id: ALU_A1, estado: "VIGENTE", tipo_servicio: "PRESENCIAL" }],
        planes_membresia: [{ id: PLAN_BOXEO_2X, nombre: "Boxeo 2x", precio: 22000 }],
        cobros: [{ id: "cb-1", alumno_id: ALU_A1, monto: 10000, estado: "PENDIENTE", concepto: "Boxeo (adicional)" }],
      };

      const mockClient = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: datosPorTabla[table] ?? [], error: null }),
            }),
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: datosPorTabla[table] ?? [], error: null }),
            }),
            order: vi.fn().mockResolvedValue({ data: datosPorTabla[table] ?? [], error: null }),
          }),
        })),
      } as any;

      const dataset = await fetchLiveDatasetFromSupabase(mockClient);
      expect(dataset.alumnoActividades).toHaveLength(1);
      expect(dataset.contrataciones).toHaveLength(1);
      expect(dataset.planesMembresia).toHaveLength(1);
      expect(dataset.cobros).toHaveLength(1);
      expect(dataset.cobros![0]!.concepto).toBe("Boxeo (adicional)");
    });

    it("cobros-service carga dataset real e invoca RPCs asignar_suscripcion_y_cobro y registrar_pago", async () => {
      const rpcMock = vi.fn(async (fn: string) => {
        if (fn === "asignar_suscripcion_y_cobro") {
          return {
            data: [
              {
                contratacion_id: "c-new",
                cobro_id: "cb-new",
                pago_id: null,
                estado_cobro: "PENDIENTE",
                monto: 12000,
                concepto: "Boxeo (adicional)",
              },
            ],
            error: null,
          };
        }
        return {
          data: { id: "cb-new", estado: "PAGADO", monto: 12000 },
          error: null,
        };
      });

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        })),
        rpc: rpcMock,
      } as any;

      const ds = await fetchCobrosDatasetFromSupabase(mockClient);
      expect(ds).toEqual({
        cobros: [],
        contrataciones: [],
        planesMembresia: [],
        pagos: [],
        alumnoActividades: [],
      });

      const asignado = await asignarSuscripcionYCobro(
        {
          alumnoId: ALU_A1,
          actividad: "BOXEO",
          monto: 12000,
          pagado: false,
          esAdicional: true,
          concepto: "Boxeo (adicional)",
        },
        mockClient,
      );
      expect(asignado.estado_cobro).toBe("PENDIENTE");
      expect(rpcMock).toHaveBeenCalledWith(
        "asignar_suscripcion_y_cobro",
        expect.objectContaining({
          p_alumno_id: ALU_A1,
          p_actividad: "BOXEO",
          p_monto: 12000,
          p_pagado: false,
        }),
      );

      const pagado = await registrarPagoReal(
        { cobroId: "cb-new", monto: 12000, metodo: "EFECTIVO", nota: "Mitad de mes" },
        mockClient,
      );
      expect(pagado.estado).toBe("PAGADO");
      expect(rpcMock).toHaveBeenCalledWith("registrar_pago", {
        p_cobro_id: "cb-new",
        p_monto: 12000,
        p_metodo: "EFECTIVO",
        p_nota: "Mitad de mes",
      });
    });
  });
});
