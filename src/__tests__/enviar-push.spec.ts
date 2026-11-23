import { describe, it, expect, beforeAll, vi, type Mock } from "vitest";
import { type PGlite } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";
import {
  autorizado,
  procesarCola,
  type ProcesarPushDeps,
  type SuscripcionPush,
} from "../../supabase/functions/enviar-push/handler";
import { urlBase64ToBytes } from "@/lib/push-notifications";

const sub = (id: string, usuario_id: string): SuscripcionPush => ({
  id,
  usuario_id,
  endpoint: `https://push.test/${id}`,
  p256dh: "k",
  auth: "a",
});

function deps(over: Partial<ProcesarPushDeps> & { pendientes?: string[]; subs?: SuscripcionPush[] }) {
  const { pendientes = [], subs = [], ...resto } = over;
  return {
    reclamarPendientes: vi.fn().mockResolvedValue(pendientes.map((d, i) => ({ id: `c${i}`, destinatario_id: d }))),
    suscripciones: vi.fn().mockResolvedValue(subs),
    enviar: vi.fn().mockResolvedValue(201),
    eliminarSuscripcion: vi.fn().mockResolvedValue(undefined),
    ...resto,
  } satisfies ProcesarPushDeps;
}

describe("enviar-push: procesarCola", () => {
  it("cola vacía no consulta suscripciones", async () => {
    const d = deps({});
    expect(await procesarCola(d)).toMatchObject({ procesados: 0, enviados: 0 });
    expect(d.suscripciones).not.toHaveBeenCalled();
  });

  it("agrupa los mensajes de un destinatario en un push por suscripción", async () => {
    const d = deps({ pendientes: ["u1", "u1", "u1"], subs: [sub("s1", "u1"), sub("s2", "u1")] });
    const r = await procesarCola(d);
    expect(r).toMatchObject({ procesados: 3, enviados: 2 });
    expect(d.enviar).toHaveBeenCalledTimes(2);
    expect((d.enviar as Mock).mock.calls[0]![1].body).toContain("3 mensajes");
  });

  it("no incluye contenido del mensaje y cuenta destinatarios sin suscripción", async () => {
    const d = deps({ pendientes: ["u1", "u2"], subs: [sub("s1", "u1")] });
    const r = await procesarCola(d);
    expect(r).toMatchObject({ enviados: 1, sinSuscripcion: 1 });
    expect((d.enviar as Mock).mock.calls[0]![1].body).toBe("Tenés un mensaje nuevo.");
  });

  it("elimina suscripciones expiradas (404/410) y cuenta fallos sin cortar el lote", async () => {
    const enviar = vi.fn().mockResolvedValueOnce(410).mockResolvedValueOnce(500).mockRejectedValueOnce(new Error("red"));
    const d = deps({ pendientes: ["u1"], subs: [sub("s1", "u1"), sub("s2", "u1"), sub("s3", "u1")], enviar });
    const r = await procesarCola(d);
    expect(r).toMatchObject({ expiradas: 1, fallidos: 2, enviados: 0 });
    expect(d.eliminarSuscripcion).toHaveBeenCalledWith("s1");
  });
});

describe("enviar-push: autorizado", () => {
  it("solo acepta el bearer exacto de service_role", () => {
    expect(autorizado("Bearer clave", "clave")).toBe(true);
    expect(autorizado("Bearer otra!", "clave")).toBe(false);
    expect(autorizado("Bearer clave", undefined)).toBe(false);
    expect(autorizado(null, "clave")).toBe(false);
    expect(autorizado("clave", "clave")).toBe(false);
  });
});

describe("urlBase64ToBytes", () => {
  it("decodifica base64url sin padding", () => {
    expect(Array.from(urlBase64ToBytes("-_8"))).toEqual([251, 255]);
  });
});

describe("migración push_procesador_cola (PGlite)", () => {
  let db: PGlite;
  const U1 = "00000000-0000-0000-0000-0000000000a1";
  const U2 = "00000000-0000-0000-0000-0000000000a2";

  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${U1}','a@t'),('${U2}','b@t');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
        ('${U1}','a@t','A','ENTRENADOR','ACTIVA'),('${U2}','b@t','B','ALUMNO','ACTIVA')
        ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, nombre_completo = EXCLUDED.nombre_completo;
    `);
  });

  it("reclamar marca como enviadas, respeta el límite y no repite filas", async () => {
    await db.exec(`
      INSERT INTO public.conversaciones (alumno_id, responsable_id) VALUES ('${U2}','${U1}');
    `);
    const conv = (await db.query<{ id: string }>(`SELECT id FROM public.conversaciones LIMIT 1`)).rows[0]!.id;
    for (let i = 0; i < 3; i++) {
      await db.query(`INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido) VALUES ($1,$2,'hola')`, [conv, U2]);
    }
    const pend = (await db.query(`SELECT count(*)::int AS n FROM public.push_cola WHERE enviado_at IS NULL`)).rows[0] as { n: number };
    expect(pend.n).toBeGreaterThanOrEqual(3);

    const a = await db.query(`SELECT * FROM public.reclamar_push_pendientes(2)`);
    expect(a.rows).toHaveLength(2);
    const b = await db.query(`SELECT * FROM public.reclamar_push_pendientes(100)`);
    expect(b.rows).toHaveLength(pend.n - 2);
    const c = await db.query(`SELECT * FROM public.reclamar_push_pendientes(100)`);
    expect(c.rows).toHaveLength(0);
  });

  it("purgar borra solo lo enviado hace más de 7 días", async () => {
    await db.exec(`UPDATE public.push_cola SET enviado_at = now() - interval '8 days'`);
    const conv = (await db.query<{ id: string }>(`SELECT id FROM public.conversaciones LIMIT 1`)).rows[0]!.id;
    await db.query(`INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido) VALUES ($1,$2,'nuevo')`, [conv, U2]);
    const borradas = (await db.query<{ n: number }>(`SELECT public.purgar_push_cola() AS n`)).rows[0]!.n;
    expect(borradas).toBeGreaterThan(0);
    const resto = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.push_cola`)).rows[0]!.n;
    expect(resto).toBeGreaterThan(0);
  });
});
