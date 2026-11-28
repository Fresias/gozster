import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada, listarMigraciones } from "./helpers/pglite-migrada";

// GOZS-928: prueba de humo del ciclo completo (G1/G4/G6/G8/G9/G11/G12) sobre PGlite real:
// todas las migraciones + supabase/seed_produccion.sql + roles reales (anon/authenticated/service_role).
// Los bloques son secuenciales: cada uno usa el estado que dejó el anterior.

const SEED_PRODUCCION = path.resolve(__dirname, "../../supabase/seed_produccion.sql");

const ADMIN = "00000000-0000-0000-0000-000000000928";
const COACH = "00000000-0000-0000-0000-0000000009c1";
const APOYO = "00000000-0000-0000-0000-0000000009c2";
const ALUMNO = "00000000-0000-0000-0000-0000000009a1";
const COACH2 = "00000000-0000-0000-0000-0000000009c3";
const INTRUSO = "00000000-0000-0000-0000-0000000009a2";

type Rol = "anon" | "authenticated" | "service_role";

let db: PGlite;

function como<T = Record<string, unknown>>(sub: string | null, sql: string, params: unknown[] = [], rol: Rol = "authenticated") {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

async function fallo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("se esperaba un error y la operación tuvo éxito");
}

const uno = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

// Estado compartido entre bloques.
const ctx: {
  ejA: string;
  ejB: string;
  ejC: string;
  ejD: string;
  plantilla: string;
  planAlumno: string;
  contratacion: string;
  sesion: string;
  eerSwap: string;
  alerta: string;
  reporte: string;
  conversacion: string;
} = {} as never;

beforeAll(async () => {
  db = await crearDbMigrada();
}, 120_000);

describe("G6/G8: migraciones + seed_produccion", () => {
  it("aplica la cadena completa de migraciones (>= 91, ordenadas por versión)", () => {
    const versiones = listarMigraciones().map((f) => f.split("_")[0]!);
    expect(versiones.length).toBeGreaterThanOrEqual(91);
    expect([...versiones].sort()).toEqual(versiones);
    expect(new Set(versiones).size).toBe(versiones.length);
  });

  it("carga el seed dos veces (idempotente) con conteos de referencia reales y sin personas", async () => {
    const sql = fs.readFileSync(SEED_PRODUCCION, "utf-8");
    const personasAntes = await uno<{ u: number; p: number }>(
      `SELECT (SELECT count(*)::int FROM auth.users) AS u, (SELECT count(*)::int FROM public.perfiles) AS p`,
    );
    await db.exec(sql);
    const conteos = async () =>
      uno<Record<string, number>>(`
        SELECT
          (SELECT count(*)::int FROM public.ejercicios) AS ejercicios,
          (SELECT count(*)::int FROM public.planes_entrenamiento) AS planes,
          (SELECT count(*)::int FROM public.dias_rutina) AS dias,
          (SELECT count(*)::int FROM public.ejercicios_en_rutina) AS eer,
          (SELECT count(*)::int FROM public.feriados) AS feriados,
          (SELECT count(*)::int FROM auth.users) AS usuarios,
          (SELECT count(*)::int FROM public.perfiles) AS perfiles`);
    const primera = await conteos();
    await db.exec(sql);
    const segunda = await conteos();
    expect(segunda).toEqual(primera);
    // El seed no agrega personas (los perfiles que existan vienen de migraciones históricas, no del seed).
    expect(primera).toEqual({
      ejercicios: 89,
      planes: 3,
      dias: 7,
      eer: 37,
      feriados: 35,
      usuarios: personasAntes.u,
      perfiles: personasAntes.p,
    });
  });

  it("G4: el catálogo seeded no trae emails ni teléfonos", async () => {
    const r = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.ejercicios WHERE nombre ~ '@' OR coalesce(comentario,'') ~ '[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\\.[a-z]{2,}'`,
    );
    expect(r.n).toBe(0);
  });
});

describe("1. Alta de staff y alumno (G1)", () => {
  it("handle_new_user toma el rol solo de app_metadata; user_metadata.rol=ADMIN no escala", async () => {
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
        ('${ADMIN}', 'admin@humo.test', '{"rol":"ADMIN"}', '{"nombre_completo":"Admin Humo"}'),
        ('${COACH}', 'coach@humo.test', '{"rol":"ENTRENADOR"}', '{"nombre_completo":"Coach Humo"}'),
        ('${APOYO}', 'apoyo@humo.test', '{}', '{"nombre_completo":"Apoyo Humo"}'),
        ('${COACH2}', 'coach2@humo.test', '{"rol":"ENTRENADOR"}', '{"nombre_completo":"Coach Dos Humo"}'),
        ('${ALUMNO}', 'alumno@humo.test', '{"rol":"ALUMNO"}', '{"nombre_completo":"Alumno Humo"}'),
        ('${INTRUSO}', 'intruso@humo.test', '{}', '{"rol":"ADMIN","nombre_completo":"Intruso Humo"}');
    `);
    const filas = await db.query<{ id: string; rol: string }>(`SELECT id, rol::text FROM public.perfiles ORDER BY email`);
    const rol = Object.fromEntries(filas.rows.map((f) => [f.id, f.rol]));
    expect(rol[ADMIN]).toBe("ADMIN");
    expect(rol[COACH]).toBe("ENTRENADOR");
    expect(rol[ALUMNO]).toBe("ALUMNO");
    expect(rol[APOYO]).toBe("ALUMNO");
    expect(rol[INTRUSO]).toBe("ALUMNO");
  });

  it("fn_sync_rol_from_app_metadata promueve a ENTRENADOR al cambiar app_metadata", async () => {
    await db.exec(`UPDATE auth.users SET raw_app_meta_data = '{"rol":"ENTRENADOR"}' WHERE id = '${APOYO}'`);
    expect((await uno<{ rol: string }>(`SELECT rol::text FROM public.perfiles WHERE id = '${APOYO}'`)).rol).toBe("ENTRENADOR");
    // cambiar solo user_metadata no toca el rol
    await db.exec(`UPDATE auth.users SET raw_user_meta_data = '{"rol":"ADMIN"}' WHERE id = '${INTRUSO}'`);
    expect((await uno<{ rol: string }>(`SELECT rol::text FROM public.perfiles WHERE id = '${INTRUSO}'`)).rol).toBe("ALUMNO");
  });

  it("un alumno autenticado no puede autoasignarse rol ni tocar el perfil ajeno", async () => {
    await como(INTRUSO, `UPDATE public.perfiles SET rol = 'ADMIN' WHERE id = $1`, [INTRUSO]).catch(() => undefined);
    await como(INTRUSO, `UPDATE public.perfiles SET nombre_completo = 'hackeado' WHERE id = $1`, [ALUMNO]).catch(() => undefined);
    const r = await db.query<{ id: string; rol: string; nombre_completo: string }>(
      `SELECT id, rol::text, nombre_completo FROM public.perfiles WHERE id IN ($1, $2)`,
      [INTRUSO, ALUMNO],
    );
    expect(r.rows.find((x) => x.id === INTRUSO)!.rol).toBe("ALUMNO");
    expect(r.rows.find((x) => x.id === ALUMNO)!.nombre_completo).toBe("Alumno Humo");
  });

  it("vincula al alumno con su titular y su apoyo (alta del coach)", async () => {
    await db.exec(`
      UPDATE public.perfiles SET profesor_asignado_id = '${COACH}', profesor_apoyo_id = '${APOYO}' WHERE id = '${ALUMNO}';
      INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana) VALUES ('${ALUMNO}', 'FUNCIONAL', 2);
    `);
    const r = await uno<{ ok: boolean }>(`SELECT profesor_asignado_id = '${COACH}' AS ok FROM public.perfiles WHERE id = '${ALUMNO}'`);
    expect(r.ok).toBe(true);
  });
});

describe("2. Rutina: guardar → compartir → clonar → asignar", () => {
  it("guardar_rutina crea plantilla con superserie válida usando ejercicios del catálogo seeded", async () => {
    const ejs = await db.query<{ id: string; usa_barra: boolean }>(
      `SELECT id, usa_barra FROM public.ejercicios ORDER BY usa_barra DESC, nombre LIMIT 4`,
    );
    expect(ejs.rows).toHaveLength(4);
    expect(ejs.rows[0]!.usa_barra).toBe(true);
    [ctx.ejA, ctx.ejB, ctx.ejC, ctx.ejD] = ejs.rows.map((e) => e.id) as [string, string, string, string];
    const payload = {
      nombre: "Humo Fuerza",
      estado: "ACTIVO",
      dias: [
        {
          nombre: "Día 1",
          ejercicios: [
            { ejercicio_id: ctx.ejA, series: 3, repeticiones: "8-10", descanso_segundos: 90, es_superserie: true, grupo_superserie: 1 },
            { ejercicio_id: ctx.ejB, series: 3, repeticiones: "10", descanso_segundos: 90, es_superserie: true, grupo_superserie: 1 },
            { ejercicio_id: ctx.ejC, series: 4, repeticiones: "5", descanso_segundos: 120 },
          ],
        },
      ],
    };
    const r = await como<{ id: string }>(COACH, `SELECT public.guardar_rutina($1::jsonb) AS id`, [JSON.stringify(payload)]);
    ctx.plantilla = r.rows[0]!.id;
    const plan = await uno<{ tipo: string; estado: string; alumno_id: string | null }>(
      `SELECT tipo::text, estado::text, alumno_id FROM public.planes_entrenamiento WHERE id = $1`,
      [ctx.plantilla],
    );
    expect(plan).toMatchObject({ tipo: "PLANTILLA", estado: "ACTIVO", alumno_id: null });
    const ss = await db.query<{ grupo_superserie: number }>(
      `SELECT e.grupo_superserie FROM public.ejercicios_en_rutina e JOIN public.dias_rutina d ON d.id = e.dia_id
       WHERE d.plan_id = $1 AND e.es_superserie`,
      [ctx.plantilla],
    );
    expect(ss.rows.map((x) => x.grupo_superserie)).toEqual([1, 1]);
  });

  it("un alumno no puede guardar rutinas", async () => {
    const msg = await fallo(
      como(ALUMNO, `SELECT public.guardar_rutina($1::jsonb)`, [
        JSON.stringify({ nombre: "x", dias: [{ nombre: "d", ejercicios: [] }] }),
      ]),
    );
    expect(msg).toMatch(/permiso/i);
  });

  it("comparte la plantilla con el apoyo (planes_compartidos) y el apoyo la clona", async () => {
    await como(COACH, `INSERT INTO public.planes_compartidos (plan_id, profesor_id, compartido_por) VALUES ($1, $2, $3)`, [
      ctx.plantilla,
      APOYO,
      COACH,
    ]);
    const visible = await como<{ n: number }>(APOYO, `SELECT count(*)::int AS n FROM public.planes_entrenamiento WHERE id = $1`, [
      ctx.plantilla,
    ]);
    expect(visible.rows[0]!.n).toBe(1);
    const clon = await como<{ id: string }>(APOYO, `SELECT public.clonar_plan_entrenamiento($1, 'Copia apoyo') AS id`, [ctx.plantilla]);
    const copia = await uno<{ profesor_id: string; n: number }>(
      `SELECT p.profesor_id, (SELECT count(*)::int FROM public.dias_rutina d JOIN public.ejercicios_en_rutina e ON e.dia_id = d.id WHERE d.plan_id = p.id) AS n
       FROM public.planes_entrenamiento p WHERE p.id = $1`,
      [clon.rows[0]!.id],
    );
    expect(copia).toEqual({ profesor_id: APOYO, n: 3 });
  });

  it("asignar_rutina_a_alumno deja una sola rutina ACTIVO y archiva la anterior", async () => {
    const a1 = await como<{ id: string }>(COACH, `SELECT public.asignar_rutina_a_alumno($1, $2, 'Humo 1') AS id`, [ctx.plantilla, ALUMNO]);
    const a2 = await como<{ id: string }>(COACH, `SELECT public.asignar_rutina_a_alumno($1, $2, 'Humo 2') AS id`, [ctx.plantilla, ALUMNO]);
    ctx.planAlumno = a2.rows[0]!.id;
    const planes = await db.query<{ id: string; estado: string }>(
      `SELECT id, estado::text FROM public.planes_entrenamiento WHERE alumno_id = $1`,
      [ALUMNO],
    );
    expect(planes.rows).toHaveLength(2);
    expect(planes.rows.filter((p) => p.estado === "ACTIVO").map((p) => p.id)).toEqual([a2.rows[0]!.id]);
    expect(planes.rows.find((p) => p.id === a1.rows[0]!.id)!.estado).toBe("INACTIVO");
  });

  it("un entrenador ajeno no puede asignar rutinas a un alumno que no es suyo", async () => {
    const msg = await fallo(como(INTRUSO, `SELECT public.asignar_rutina_a_alumno($1, $2)`, [ctx.plantilla, ALUMNO]));
    expect(msg).toMatch(/asignado|permiso/i);
  });
});

describe("3. Contratación + F-12 + G9", () => {
  it("renueva, extiende excepcionalmente y audita", async () => {
    await db.exec(`
      INSERT INTO public.planes_membresia (id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio)
        VALUES ('92800000-0000-4000-8000-000000000001', 'Plan humo', NULL, 2, 1, 35000);
      INSERT INTO public.contrataciones (id, alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, precio_pactado)
        VALUES ('92800000-0000-4000-8000-000000000011', '${ALUMNO}', 'PRESENCIAL', 5, CURRENT_DATE - 10, CURRENT_DATE + 20, 'VIGENTE',
                '92800000-0000-4000-8000-000000000001', 35000);
      INSERT INTO public.cobros (id, contratacion_id, alumno_id, periodo, monto, fecha_vencimiento)
        VALUES ('92800000-0000-4000-8000-000000000021', '92800000-0000-4000-8000-000000000011', '${ALUMNO}',
                date_trunc('month', CURRENT_DATE)::date, 35000, CURRENT_DATE + 5);
    `);
    ctx.contratacion = "92800000-0000-4000-8000-000000000011";

    await como(COACH, `SELECT public.registrar_pago($1, 35000, 'EFECTIVO', 'humo-pago-1')`, ["92800000-0000-4000-8000-000000000021"]);
    const pagos0 = await uno<{ n: number }>(`SELECT count(*)::int AS n FROM public.pagos WHERE contratacion_id = $1`, [ctx.contratacion]);
    expect(pagos0.n).toBe(1);

    const antes = await uno<{ fecha_fin: string }>(`SELECT fecha_fin::text FROM public.contrataciones WHERE id = $1`, [ctx.contratacion]);
    await como(COACH, `SELECT * FROM public.renovar_contratacion($1, 35000, 'EFECTIVO', 'humo-ren-1')`, [ctx.contratacion]);
    const tras = await uno<{ fecha_fin: string }>(`SELECT fecha_fin::text FROM public.contrataciones WHERE id = $1`, [ctx.contratacion]);
    expect(tras.fecha_fin > antes.fecha_fin).toBe(true);
    // idempotente por clave
    await como(COACH, `SELECT * FROM public.renovar_contratacion($1, 35000, 'EFECTIVO', 'humo-ren-1')`, [ctx.contratacion]);
    expect((await uno<{ fecha_fin: string }>(`SELECT fecha_fin::text FROM public.contrataciones WHERE id = $1`, [ctx.contratacion])).fecha_fin).toBe(
      tras.fecha_fin,
    );

    await como(COACH, `SELECT public.extender_contratacion_excepcional($1, CURRENT_DATE + 120, 'cobertura humo')`, [ctx.contratacion]);
    const aud = await db.query<{ accion: string; autorizado_por: string }>(
      `SELECT accion, autorizado_por FROM public.auditoria_cambios WHERE entidad = 'contrataciones' AND entidad_id = $1 AND accion = 'EXTENSION_EXCEPCIONAL'`,
      [ctx.contratacion],
    );
    expect(aud.rows).toEqual([{ accion: "EXTENSION_EXCEPCIONAL", autorizado_por: COACH }]);
  });

  it("un alumno no puede renovar ni extender contrataciones", async () => {
    expect(await fallo(como(ALUMNO, `SELECT * FROM public.renovar_contratacion($1, 100, 'EFECTIVO', 'humo-x')`, [ctx.contratacion]))).toMatch(
      /autorizado|No autorizado/i,
    );
    expect(await fallo(como(ALUMNO, `SELECT public.extender_contratacion_excepcional($1, CURRENT_DATE + 400, 'x')`, [ctx.contratacion]))).toMatch(
      /administrador|entrenador/i,
    );
  });

  it("job_diario_contrataciones marca VENCIDA y genera alerta al coach; solo service_role lo ejecuta", async () => {
    await db.exec(`
      INSERT INTO public.contrataciones (id, alumno_id, tipo_servicio, dia_vencimiento, fecha_inicio, fecha_fin, estado, precio_pactado)
        VALUES ('92800000-0000-4000-8000-000000000012', '${INTRUSO}', 'PRESENCIAL', 5, CURRENT_DATE - 40, CURRENT_DATE - 3, 'VIGENTE', 20000);
      UPDATE public.perfiles SET profesor_asignado_id = '${COACH}' WHERE id = '${INTRUSO}';
    `);
    // el job corre sin sesión de usuario (pg_cron / service_role): ni el coach ni el admin autenticado lo ejecutan
    expect(await fallo(como(COACH, `SELECT public.job_diario_contrataciones()`))).toMatch(/permission denied/i);
    expect(await fallo(como(ADMIN, `SELECT public.job_diario_contrataciones()`))).toMatch(/permission denied/i);

    const r = await como<{ r: { vencidas: number } }>(null, `SELECT public.job_diario_contrataciones() AS r`, [], "service_role");
    expect(r.rows[0]!.r.vencidas).toBeGreaterThanOrEqual(1);
    expect((await uno<{ estado: string }>(`SELECT estado FROM public.contrataciones WHERE id = '92800000-0000-4000-8000-000000000012'`)).estado).toBe(
      "VENCIDA",
    );
    const alerta = await uno<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.alertas_entrenador WHERE alumno_id = $1 AND profesor_id = $2 AND tipo_alerta = 'CUOTA_VENCIDA'`,
      [INTRUSO, COACH],
    );
    expect(alerta.n).toBe(1);
    // la contratación vigente del alumno principal no se tocó
    expect((await uno<{ estado: string }>(`SELECT estado FROM public.contrataciones WHERE id = $1`, [ctx.contratacion])).estado).not.toBe("VENCIDA");
    // segunda corrida: sin nuevas alertas
    await como(null, `SELECT public.job_diario_contrataciones()`, [], "service_role");
    expect(
      (await uno<{ n: number }>(`SELECT count(*)::int AS n FROM public.alertas_entrenador WHERE alumno_id = $1 AND tipo_alerta = 'CUOTA_VENCIDA'`, [INTRUSO])).n,
    ).toBe(1);
  });
});

describe("4. Entrenamiento del alumno + triggers Ola C", () => {
  it("calcula volumen en DB y actualiza último entreno al completar la sesión", async () => {
    const dia = await uno<{ id: string }>(`SELECT id FROM public.dias_rutina WHERE plan_id = $1`, [ctx.planAlumno]);
    const s = await como<{ id: string }>(
      ALUMNO,
      `INSERT INTO public.registro_sesiones (alumno_id, dia_id, duracion_minutos) VALUES ($1, $2, 45) RETURNING id`,
      [ALUMNO, dia.id],
    );
    ctx.sesion = s.rows[0]!.id;
    await como(
      ALUMNO,
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, rpe_real, completada, set_type) VALUES
        ($1, $2, 1, 100, 5, 8, true, 'NORMAL'),
        ($1, $2, 2, 100, 5, 8.5, true, 'NORMAL'),
        ($1, $2, 3, 40, 10, 5, true, 'WARMUP'),
        ($1, $2, 4, 200, 1, 9, false, 'NORMAL')`,
      [ctx.sesion, ctx.ejA],
    );
    await como(ALUMNO, `UPDATE public.registro_sesiones SET estado = 'COMPLETADA', finalizada_at = now() WHERE id = $1`, [ctx.sesion]);
    const r = await uno<{ volumen_total_kg: string; effective_volume_kg: string }>(
      `SELECT volumen_total_kg::text, effective_volume_kg::text FROM public.registro_sesiones WHERE id = $1`,
      [ctx.sesion],
    );
    expect(Number(r.volumen_total_kg)).toBe(100 * 5 * 2 + 40 * 10); // 1400: solo series completadas
    expect(Number(r.effective_volume_kg)).toBe(1000); // sin warmup
    const p = await uno<{ ok: boolean }>(`SELECT ultimo_entreno_at IS NOT NULL AS ok FROM public.perfiles WHERE id = $1`, [ALUMNO]);
    expect(p.ok).toBe(true);
  });

  it("un alumno no ve las sesiones de otro y no puede insertar en nombre ajeno", async () => {
    const ajenas = await como<{ n: number }>(INTRUSO, `SELECT count(*)::int AS n FROM public.registro_sesiones WHERE alumno_id = $1`, [ALUMNO]);
    expect(ajenas.rows[0]!.n).toBe(0);
    await fallo(como(INTRUSO, `INSERT INTO public.registro_sesiones (alumno_id) VALUES ($1)`, [ALUMNO]));
  });
});

describe("5. Ranking Funcional", () => {
  it("registra la marca y el ranking no expone peso corporal ajeno", async () => {
    await como(COACH, `SELECT public.registrar_marca_funcional($1, $2, 80, 5, CURRENT_DATE, NULL, 70, 'M')`, [ALUMNO, ctx.ejD]);
    const r = await como<Record<string, unknown>>(ALUMNO, `SELECT * FROM public.obtener_ranking_funcional_alumno($1)`, [ctx.ejD]);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    const propia = r.rows.find((x) => x.es_usuario_actual === true);
    expect(propia).toBeTruthy();
    expect(Number(propia!.peso_kg)).toBe(80);
    for (const fila of r.rows) {
      expect(Object.keys(fila)).not.toContain("peso_corporal_kg");
      expect(Object.keys(fila)).not.toContain("alumno_id");
      expect(Object.keys(fila)).not.toContain("email");
    }
    // un alumno sin Funcional no accede al ranking
    expect(await fallo(como(INTRUSO, `SELECT * FROM public.obtener_ranking_funcional_alumno($1)`, [ctx.ejD]))).toMatch(/Funcional/);
  });
});

describe("6. Dolor → alerta → quick swap → estado", () => {
  it("la molestia intensa genera alerta al coach titular, quick swap y cierre", async () => {
    const eer = await uno<{ id: string }>(
      `SELECT e.id FROM public.ejercicios_en_rutina e JOIN public.dias_rutina d ON d.id = e.dia_id WHERE d.plan_id = $1 AND e.ejercicio_id = $2`,
      [ctx.planAlumno, ctx.ejC],
    );
    ctx.eerSwap = eer.id;
    await como(
      ALUMNO,
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, pain_reported, pain_notes)
       VALUES ($1, $2, 1, 60, 5, true, true, 'dolor fuerte en la rodilla')`,
      [ctx.sesion, ctx.ejC],
    );
    const rep = await uno<{ id: string; zona_articular: string; estado: string }>(
      `SELECT id, zona_articular, estado FROM public.alumno_historial_dolor WHERE alumno_id = $1 AND ejercicio_id = $2`,
      [ALUMNO, ctx.ejC],
    );
    expect(rep.zona_articular).toBe("RODILLA");
    expect(rep.estado).toBe("PENDIENTE");
    ctx.reporte = rep.id;
    const al = await uno<{ id: string; profesor_id: string }>(
      `SELECT id, profesor_id FROM public.alertas_entrenador WHERE alumno_id = $1 AND tipo_alerta = 'DOLOR_ARTICULAR' AND ejercicio_id = $2`,
      [ALUMNO, ctx.ejC],
    );
    expect(al.profesor_id).toBe(COACH);
    ctx.alerta = al.id;

    // el alumno no puede ejecutar el swap ni cerrar el reporte
    expect(await fallo(como(ALUMNO, `SELECT public.quick_swap_ejercicio($1, $2, $3, 'x')`, [ctx.eerSwap, ctx.ejB, ctx.alerta]))).toBeTruthy();
    expect(await fallo(como(ALUMNO, `SELECT public.actualizar_estado_dolor($1, 'RESUELTO', 'x')`, [ctx.reporte]))).toBeTruthy();

    await como(COACH, `SELECT public.quick_swap_ejercicio($1, $2, $3, 'molestia de rodilla')`, [ctx.eerSwap, ctx.ejB, ctx.alerta]);
    expect((await uno<{ ejercicio_id: string }>(`SELECT ejercicio_id FROM public.ejercicios_en_rutina WHERE id = $1`, [ctx.eerSwap])).ejercicio_id).toBe(ctx.ejB);

    await como(COACH, `SELECT public.actualizar_estado_dolor($1, 'ATENDIDO', 'swap aplicado')`, [ctx.reporte]);
    await como(COACH, `SELECT public.actualizar_estado_dolor($1, 'RESUELTO', NULL)`, [ctx.reporte]);
    expect((await uno<{ estado: string }>(`SELECT estado FROM public.alumno_historial_dolor WHERE id = $1`, [ctx.reporte])).estado).toBe("RESUELTO");
  });
});

describe("7. Chat, transferencia y observabilidad (G4/G12)", () => {
  it("mensaje, transferencia al apoyo y staff sin datos de contacto", async () => {
    const c = await uno<{ id: string }>(
      `INSERT INTO public.conversaciones (alumno_id, responsable_id) VALUES ($1, $2) RETURNING id`,
      [ALUMNO, COACH],
    );
    ctx.conversacion = c.id;
    await como(ALUMNO, `INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido) VALUES ($1, $2, 'Hola coach')`, [c.id, ALUMNO]);

    expect(await fallo(como(ALUMNO, `SELECT public.transferir_conversacion_gozs($1, $2)`, [c.id, APOYO]))).toMatch(/autorizado/i);
    await como(COACH, `SELECT public.transferir_conversacion_gozs($1, $2, 'vacaciones')`, [c.id, COACH2]);
    const tras = await uno<{ responsable_id: string; titular: string }>(
      `SELECT c.responsable_id, p.profesor_asignado_id AS titular FROM public.conversaciones c JOIN public.perfiles p ON p.id = c.alumno_id WHERE c.id = $1`,
      [c.id],
    );
    expect(tras).toEqual({ responsable_id: COACH2, titular: COACH2 });
    // la transferencia mueve al titular: el coach anterior ya no ve al alumno hasta que se la devuelvan
    await como(COACH2, `SELECT public.transferir_conversacion_gozs($1, $2)`, [c.id, COACH]);
    expect((await uno<{ titular: string }>(`SELECT profesor_asignado_id AS titular FROM public.perfiles WHERE id = $1`, [ALUMNO])).titular).toBe(COACH);

    const staff = await como<Record<string, unknown>>(COACH, `SELECT * FROM public.listar_entrenadores_staff()`);
    const ids = staff.rows.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([ADMIN, COACH, APOYO]));
    expect(ids).not.toContain(ALUMNO);
    for (const s of staff.rows) expect(Object.keys(s).sort()).toEqual(["id", "nombre_completo"]);
    expect(await fallo(como(ALUMNO, `SELECT * FROM public.listar_entrenadores_staff()`))).toMatch(/autorizado/i);
  });

  it("errores_app: el alumno inserta lo propio, no lo ajeno ni lo lee; el staff lo ve", async () => {
    await como(ALUMNO, `INSERT INTO public.errores_app (usuario_id, contexto, mensaje_humano) VALUES ($1, 'athlete/error-boundary', 'Algo salió mal')`, [
      ALUMNO,
    ]);
    await fallo(como(ALUMNO, `INSERT INTO public.errores_app (usuario_id, contexto, mensaje_humano) VALUES ($1, 'x', 'y')`, [INTRUSO]));
    expect((await como<{ n: number }>(ALUMNO, `SELECT count(*)::int AS n FROM public.errores_app`)).rows[0]!.n).toBe(0);
    expect((await como<{ n: number }>(COACH, `SELECT count(*)::int AS n FROM public.errores_app`)).rows[0]!.n).toBe(1);
    expect((await como<{ n: number }>(ADMIN, `SELECT count(*)::int AS n FROM public.errores_app`)).rows[0]!.n).toBe(1);
  });
});

describe("8. Entrenador de apoyo y bloqueo financiero (G1)", () => {
  it("el apoyo ve rutina y sesiones del alumno asignado", async () => {
    const planes = await como<{ n: number }>(APOYO, `SELECT count(*)::int AS n FROM public.planes_entrenamiento WHERE alumno_id = $1`, [ALUMNO]);
    expect(planes.rows[0]!.n).toBe(2);
    const ses = await como<{ n: number }>(APOYO, `SELECT count(*)::int AS n FROM public.registro_sesiones WHERE alumno_id = $1`, [ALUMNO]);
    expect(ses.rows[0]!.n).toBeGreaterThanOrEqual(1);
  });

  it("el apoyo no lee cobros/pagos ni muta finanzas por defecto; el titular sí", async () => {
    expect((await como<{ n: number }>(APOYO, `SELECT count(*)::int AS n FROM public.cobros WHERE alumno_id = $1`, [ALUMNO])).rows[0]!.n).toBe(0);
    expect((await como<{ n: number }>(APOYO, `SELECT count(*)::int AS n FROM public.pagos WHERE alumno_id = $1`, [ALUMNO])).rows[0]!.n).toBe(0);
    expect((await como<{ n: number }>(COACH, `SELECT count(*)::int AS n FROM public.cobros WHERE alumno_id = $1`, [ALUMNO])).rows[0]!.n).toBeGreaterThan(0);

    expect(await fallo(como(APOYO, `SELECT * FROM public.renovar_contratacion($1, 1000, 'EFECTIVO', 'humo-apoyo')`, [ctx.contratacion]))).toBeTruthy();
    expect(await fallo(como(APOYO, `SELECT public.extender_contratacion_excepcional($1, CURRENT_DATE + 900, 'x')`, [ctx.contratacion]))).toBeTruthy();
  });

  it("obtener_kpis_negocio: los montos son solo del ADMIN; ni titular ni apoyo los reciben", async () => {
    const q = (sub: string) => como<Record<string, unknown>>(sub, `SELECT * FROM public.obtener_kpis_negocio(CURRENT_DATE - 30, CURRENT_DATE + 30)`);
    const admin = (await q(ADMIN)).rows[0]!;
    expect(Number(admin.ingresos)).toBeGreaterThan(0);
    for (const sub of [COACH, APOYO]) {
      const k = (await q(sub)).rows[0]!;
      expect(k.ingresos).toBeNull();
      expect(k.ingresos_6m).toBeNull();
      expect(k.cobranza_esperada).toBeNull();
      expect(k.cobranza_pendiente_monto).toBeNull();
      expect(k.ingresos_presencial).toBeNull();
    }
    expect(await fallo(como(ALUMNO, `SELECT * FROM public.obtener_kpis_negocio(CURRENT_DATE - 30, CURRENT_DATE)`))).toMatch(/administrador o entrenador/i);
  });
});
