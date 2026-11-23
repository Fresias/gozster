import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { supabase } from "@/lib/supabase/client";
import { avisoMolestiaPara, ejercicioBloqueado } from "@/lib/athlete/molestias";
import { AvisoMolestia } from "@/components/athlete/aviso-molestia";

const NEW_MIGRATION = "20261119030000_molestias_sesion.sql";

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const ALUMNO_A = "00000000-0000-0000-0000-00000000000a";
const ALUMNO_B = "00000000-0000-0000-0000-00000000000b";
const PLAN_A = "00000000-0000-0000-0000-000000000101";
const DIA_1 = "00000000-0000-0000-0000-000000000201";
const EJ_PRESS = "00000000-0000-0000-0000-000000000e01";
const EJ_RUTINA_PRESS = "00000000-0000-0000-0000-000000000f01";
const SESION_B = "00000000-0000-0000-0000-00000000b001";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH}', 'coach@test.local'),
    ('${ALUMNO_A}', 'alumno-a@test.local'),
    ('${ALUMNO_B}', 'alumno-b@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}', 'coach@test.local', 'Coach Principal', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALUMNO_A}', 'alumno-a@test.local', 'Alumno A', 'ALUMNO', '${COACH}', 'ACTIVA'),
    ('${ALUMNO_B}', 'alumno-b@test.local', 'Alumno B', 'ALUMNO', '${COACH}', 'ACTIVA')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;


  INSERT INTO public.ejercicios (id, nombre, musculos_principales) VALUES
    ('${EJ_PRESS}', 'Press Plano con Barra', ARRAY['Pecho'])
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.planes_entrenamiento (id, nombre, alumno_id, profesor_id)
  VALUES ('${PLAN_A}', 'Plan A', '${ALUMNO_A}', '${COACH}');

  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
  VALUES ('${DIA_1}', '${PLAN_A}', 'Día 1', 1);

  INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos)
  VALUES ('${EJ_RUTINA_PRESS}', '${DIA_1}', '${EJ_PRESS}', 1, 3, '8-10', 90);

  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id)
  VALUES ('${SESION_B}', '${ALUMNO_B}', '${DIA_1}');
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

describe("BE-02 CP1 · Migración y RPC registrar_molestia (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
    // Idempotencia de la migración
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
  }, 60_000);

  it("molestia antes de la primera serie crea registro_sesiones y guarda sesion_id, ejercicio_en_rutina_id y numero_serie", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const sesionId = "22222222-2222-4222-8222-222222222222";

    const res = await como<{ registrar_molestia: string }>(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 5, $4, $5, NULL, 'CALENTAMIENTO', '{}', '  Molestia en el deltoides  ')`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );
    expect(res.rows[0]?.registrar_molestia).toBe(id);

    const ses = await db.query<{ alumno_id: string; dia_id: string }>(
      `SELECT alumno_id, dia_id FROM public.registro_sesiones WHERE id = $1`,
      [sesionId],
    );
    expect(ses.rows[0]).toEqual({ alumno_id: ALUMNO_A, dia_id: DIA_1 });

    const dolor = await como<{
      id: string;
      sesion_id: string;
      ejercicio_en_rutina_id: string;
      numero_serie: number | null;
      eva: number;
      severidad: string;
      notas_alumno: string | null;
      es_sintoma_alarma: boolean;
    }>(
      "authenticated",
      ALUMNO_A,
      `SELECT id, sesion_id, ejercicio_en_rutina_id, numero_serie, eva, severidad, notas_alumno, es_sintoma_alarma
       FROM public.alumno_historial_dolor WHERE id = $1`,
      [id],
    );
    expect(dolor.rows[0]).toEqual({
      id,
      sesion_id: sesionId,
      ejercicio_en_rutina_id: EJ_RUTINA_PRESS,
      numero_serie: null,
      eva: 5,
      severidad: "MODERADO",
      notas_alumno: "Molestia en el deltoides",
      es_sintoma_alarma: false,
    });
  });

  it("es idempotente por p_id: reintentar no duplica la fila", async () => {
    const id = "11111111-1111-4111-8111-111111111112";
    const sesionId = "22222222-2222-4222-8222-222222222223";

    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'RODILLA', 4, $4, $5, NULL, 'EN_SERIE', '{}', NULL)`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );
    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'RODILLA', 4, $4, $5, NULL, 'EN_SERIE', '{}', NULL)`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );

    const cnt = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.alumno_historial_dolor WHERE id = $1`,
      [id],
    );
    expect(Number(cnt.rows[0]?.count)).toBe(1);
  });

  it("rechaza con 42501 si p_sesion_id pertenece a otro alumno o no está autenticado", async () => {
    const id = "11111111-1111-4111-8111-111111111113";
    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 5)`,
        [id, SESION_B, EJ_PRESS],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como(
        "anon",
        null,
        `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 5)`,
        [id, SESION_B, EJ_PRESS],
      ),
    ).rejects.toThrow();
  });

  it("con numero_serie existente marca pain_reported = true en registro_series sin duplicar historial", async () => {
    const id = "11111111-1111-4111-8111-111111111114";
    const sesionId = "22222222-2222-4222-8222-222222222224";

    await db.query(
      `INSERT INTO public.registro_sesiones (id, alumno_id, dia_id) VALUES ($1, $2, $3)`,
      [sesionId, ALUMNO_A, DIA_1],
    );
    await db.query(
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada)
       VALUES ($1, $2, 2, 80, 8, true)`,
      [sesionId, EJ_PRESS],
    );

    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'CODO', 3, $4, $5, 2, 'EN_SERIE', '{}', 'Tensión leve')`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );

    const serie = await db.query<{ pain_reported: boolean; pain_notes: string }>(
      `SELECT pain_reported, pain_notes FROM public.registro_series
       WHERE sesion_id = $1 AND ejercicio_id = $2 AND numero_serie = 2`,
      [sesionId, EJ_PRESS],
    );
    expect(serie.rows[0]?.pain_reported).toBe(true);
    expect(serie.rows[0]?.pain_notes).toBe("CODO · 3/10 · Tensión leve");

    const historial = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.alumno_historial_dolor WHERE sesion_id = $1`,
      [sesionId],
    );
    expect(Number(historial.rows[0]?.count)).toBe(1);
  });

  it("EVA 8 genera alertas_entrenador con reporte_dolor_id (trigger existente)", async () => {
    const id = "11111111-1111-4111-8111-111111111115";
    const sesionId = "22222222-2222-4222-8222-222222222225";

    await como(
      "authenticated",
      ALUMNO_A,
      `SELECT public.registrar_molestia($1, $2, $3, 'LUMBAR', 8, $4, $5, NULL, 'EN_SERIE', '{}', 'Pinchazo fuerte')`,
      [id, sesionId, EJ_PRESS, DIA_1, EJ_RUTINA_PRESS],
    );

    const alerta = await db.query<{
      reporte_dolor_id: string;
      severidad: string;
      alumno_id: string;
    }>(
      `SELECT reporte_dolor_id, severidad, alumno_id
       FROM public.alertas_entrenador WHERE reporte_dolor_id = $1`,
      [id],
    );
    expect(alerta.rows).toHaveLength(1);
    expect(alerta.rows[0]).toEqual({
      reporte_dolor_id: id,
      severidad: "ALTA",
      alumno_id: ALUMNO_A,
    });
  });

  it("valida EVA 1..10 y zona permitida (23514) y respeta RLS de lectura por sesion_id", async () => {
    const idBad = "11111111-1111-4111-8111-111111111116";
    const sesionId = "22222222-2222-4222-8222-222222222226";

    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `SELECT public.registrar_molestia($1, $2, $3, 'HOMBRO', 0)`,
        [idBad, sesionId, EJ_PRESS],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `SELECT public.registrar_molestia($1, $2, $3, 'MUÑECA', 5)`,
        [idBad, sesionId, EJ_PRESS],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    // Alumno B no ve las molestias de Alumno A
    const lecturaAjena = await como<{ id: string }>(
      "authenticated",
      ALUMNO_B,
      `SELECT id FROM public.alumno_historial_dolor WHERE sesion_id = '22222222-2222-4222-8222-222222222225'`,
    );
    expect(lecturaAjena.rows).toHaveLength(0);
  });
});

describe("BE-02 CP5 · Store: outbox, recuperación y limpieza (03a §7)", () => {
  const SESION_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const EJ_RUTINA_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const EJ_CATALOGO_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const DIA_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  function prepararSesionUuid() {
    useAthleteStore.setState({ molestiasPendientesFueraDeSesion: [] });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState((prev) => ({
      molestiasPendientesFueraDeSesion: [],
      currentSession: {
        ...prev.currentSession,
        id: SESION_UUID,
        studentId: ALUMNO_A,
        dia_id: DIA_UUID,
        molestias: [],
        ejercicios: [
          {
            id: EJ_RUTINA_UUID,
            ejercicio_id: EJ_CATALOGO_UUID,
            nombre: "Press Plano con Barra",
            musculos_principales: ["Pecho"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8-10",
            series: [
              { numero_serie: 1, peso_kg: 80, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: 101 },
            ],
          },
        ],
      },
    }));
  }

  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [] });
    prepararSesionUuid();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin señal deja aviso visible y envio pendiente; al volver la señal llama una vez registrar_molestia con mismo p_id y nunca usa 30000000-...", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);

    const creada = await useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA_UUID,
      ejercicioId: EJ_CATALOGO_UUID,
      numeroSerie: 1,
      zona: "HOMBRO",
      eva: 5,
      momento: "EN_SERIE",
      notas: "Molestia leve al bajar",
    });

    expect(creada.envio).toBe("pendiente");
    expect(rpcSpy).not.toHaveBeenCalled();

    const enSesion = useAthleteStore.getState().currentSession.molestias ?? [];
    expect(enSesion).toHaveLength(1);
    expect(enSesion[0]?.id).toBe(creada.id);
    expect(
      avisoMolestiaPara({ id: EJ_RUTINA_UUID, musculos_principales: ["Pecho"] }, enSesion),
    ).toMatchObject({ tipo: "propio", molestia: { id: creada.id, envio: "pendiente" } });

    // Vuelve la señal
    useOfflineQueueStore.setState({ isOnline: true });
    await useAthleteStore.getState().flushMolestiasPendientes();

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [fnName, params] = rpcSpy.mock.calls[0]!;
    expect(fnName).toBe("registrar_molestia");
    expect(params).toMatchObject({
      p_id: creada.id,
      p_sesion_id: SESION_UUID,
      p_ejercicio_id: EJ_CATALOGO_UUID,
      p_ejercicio_en_rutina_id: EJ_RUTINA_UUID,
      p_dia_id: DIA_UUID,
      p_numero_serie: 1,
      p_zona: "HOMBRO",
      p_eva: 5,
    });
    expect(JSON.stringify(params)).not.toContain("30000000-");

    const postFlush = useAthleteStore.getState().currentSession.molestias ?? [];
    expect(postFlush[0]?.envio).toBe("enviada");

    // Reintento no vuelve a llamar si ya está enviada
    await useAthleteStore.getState().flushMolestiasPendientes();
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    // No usa la cola de series
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
  });

  it("error 42501/23514 marca envio error y registra en errores_app; error de red o 5xx deja pendiente", async () => {
    const erroresInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: ALUMNO_A } as any },
      error: null,
    });
    const fromSpy = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "errores_app") {
        return { insert: erroresInsertSpy } as any;
      }
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) } as any;
    });

    const rpcSpy = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValueOnce({ data: null, error: { message: "503 Service Unavailable", status: 503 } } as any)
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Sesión ajena" } } as any);

    const red5xx = await useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA_UUID,
      ejercicioId: EJ_CATALOGO_UUID,
      zona: "HOMBRO",
      eva: 4,
    });
    expect(red5xx.envio).toBe("pendiente");

    const rechazada = await useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA_UUID,
      ejercicioId: EJ_CATALOGO_UUID,
      zona: "HOMBRO",
      eva: 4,
    });
    expect(rechazada.envio).toBe("error");
    expect(rpcSpy).toHaveBeenCalledTimes(2);
    expect(fromSpy).toHaveBeenCalledWith("errores_app");
    expect(erroresInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: ALUMNO_A,
        contexto: "molestia",
      }),
    );
  });

  it("EVA 8 bloquea solo el ejercicio (sin stopProtocolActive); síntoma de alarma activa stopProtocolActive", async () => {
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);

    const alta = await useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA_UUID,
      ejercicioId: EJ_CATALOGO_UUID,
      zona: "HOMBRO",
      eva: 8,
    });
    expect(alta.nivel).toBe("alta");
    expect(useAthleteStore.getState().stopProtocolActive).toBe(false);
    expect(
      ejercicioBloqueado(EJ_RUTINA_UUID, useAthleteStore.getState().currentSession.molestias ?? []),
    ).toBe(true);

    const alarma = await useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA_UUID,
      ejercicioId: EJ_CATALOGO_UUID,
      zona: "HOMBRO",
      eva: 5,
      sintomas: ["Dolor punzante/súbito"],
    });
    expect(alarma.nivel).toBe("alarma");
    expect(useAthleteStore.getState().stopProtocolActive).toBe(true);
  });

  it("recargar sesión con señal recupera avisos con cargarMolestiasDeSesion y gana la local si está pendiente", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    const pendienteLocal = await useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA_UUID,
      ejercicioId: EJ_CATALOGO_UUID,
      zona: "CODO",
      eva: 6,
      notas: "Local pendiente",
    });

    const idRemotoNuevo = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const eqMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: pendienteLocal.id,
          sesion_id: SESION_UUID,
          ejercicio_en_rutina_id: EJ_RUTINA_UUID,
          ejercicio_id: EJ_CATALOGO_UUID,
          numero_serie: null,
          zona_articular: "CODO",
          eva: 2,
          sintomas_alarma: [],
          momento_aparicion: "EN_SERIE",
          notas_alumno: "Remota vieja",
          created_at: "2026-11-18T12:00:00.000Z",
        },
        {
          id: idRemotoNuevo,
          sesion_id: SESION_UUID,
          ejercicio_en_rutina_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          ejercicio_id: EJ_CATALOGO_UUID,
          numero_serie: 2,
          zona_articular: "RODILLA",
          eva: 4,
          sintomas_alarma: [],
          momento_aparicion: "POST_EJERCICIO",
          notas_alumno: "Desde otro dispositivo",
          created_at: "2026-11-18T12:05:00.000Z",
        },
      ],
      error: null,
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqMock }),
    } as any);

    useOfflineQueueStore.setState({ isOnline: true });
    await useAthleteStore.getState().cargarMolestiasDeSesion(SESION_UUID);

    const recuperadas = useAthleteStore.getState().currentSession.molestias ?? [];
    expect(recuperadas).toHaveLength(2);
    const localMantenida = recuperadas.find((m) => m.id === pendienteLocal.id);
    expect(localMantenida?.envio).toBe("pendiente");
    expect(localMantenida?.eva).toBe(6);

    const remota = recuperadas.find((m) => m.id === idRemotoNuevo);
    expect(remota?.envio).toBe("enviada");
    expect(remota?.zona).toBe("RODILLA");
    expect(remota?.numeroSerie).toBe(2);
  });

  it("cerrar la sesión con una pendiente la mueve a molestiasPendientesFueraDeSesion, limpia currentSession.molestias y la envía después", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    const pendiente = await useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA_UUID,
      ejercicioId: EJ_CATALOGO_UUID,
      zona: "LUMBAR",
      eva: 4,
    });

    // Cerrar la sesión completando el día
    useAthleteStore.getState().marcarDiaCompletado(DIA_UUID);

    expect(useAthleteStore.getState().currentSession.molestias).toEqual([]);
    expect(useAthleteStore.getState().molestiasPendientesFueraDeSesion).toHaveLength(1);
    expect(useAthleteStore.getState().molestiasPendientesFueraDeSesion[0]?.id).toBe(pendiente.id);

    // Vuelve la señal y se envía desde fuera de sesión
    const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);
    useOfflineQueueStore.setState({ isOnline: true });
    await useAthleteStore.getState().flushMolestiasPendientes();

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy.mock.calls[0]?.[1]).toMatchObject({ p_id: pendiente.id, p_sesion_id: SESION_UUID });
    expect(useAthleteStore.getState().molestiasPendientesFueraDeSesion).toEqual([]);
  });

  it("el partialize de Zustand persiste molestiasPendientesFueraDeSesion y athlete-shell dispara flush con online", () => {
    const persistOpts = (useAthleteStore as any).persist.getOptions();
    const partialized = persistOpts.partialize(useAthleteStore.getState());
    expect("molestiasPendientesFueraDeSesion" in partialized).toBe(true);

    const shellCode = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/athlete-shell.tsx"),
      "utf-8",
    );
    expect(shellCode).toContain("flushMolestiasPendientes");
    expect(shellCode).toContain("cargarMolestiasDeSesion");
  });

  it.each([
    ["PGRST202", "Could not find the function public.registrar_molestia"],
    ["42883", "function public.registrar_molestia does not exist"],
    ["42P01", 'relation "public.alumno_historial_dolor" does not exist'],
  ] as const)(
    "R4 · código de esquema faltante %s: registra en errores_app una sola vez, mantiene envio pendiente en cola, conserva aviso tras flushQueue de series y envía una vez al aplicarse la migración",
    async (code, message) => {
      useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
      const erroresInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: ALUMNO_A } as any },
        error: null,
      });
      const fromSpy = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "errores_app") {
          return { insert: erroresInsertSpy } as any;
        }
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });
      const rpcSpy = vi
        .spyOn(supabase, "rpc")
        .mockResolvedValueOnce({ data: null, error: { code, message } } as any)
        .mockResolvedValueOnce({ data: null, error: { code, message } } as any)
        .mockResolvedValueOnce({ data: null, error: null } as any);

      // 1. Primer intento al reportar: falla con código de función/tabla faltante
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: EJ_RUTINA_UUID,
        ejercicioId: EJ_CATALOGO_UUID,
        zona: "HOMBRO",
        eva: 5,
      });

      // Sigue en la cola con envio: "pendiente"
      expect(molestia.envio).toBe("pendiente");
      expect(useAthleteStore.getState().currentSession.molestias?.[0]?.envio).toBe("pendiente");
      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(fromSpy).toHaveBeenCalledWith("errores_app");
      expect(erroresInsertSpy).toHaveBeenCalledTimes(1);
      expect(erroresInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: ALUMNO_A,
          contexto: "molestia",
          mensaje_humano: "No se pudo guardar el reporte de molestia.",
          payload_resumen: expect.objectContaining({
            id: molestia.id,
            sesion_id: SESION_UUID,
            code,
          }),
        }),
      );

      // 2. Segundo reintento (sigue faltando la migración): se reintenta la RPC pero NO duplica en errores_app
      await useAthleteStore.getState().flushMolestiasPendientes();
      expect(rpcSpy).toHaveBeenCalledTimes(2);
      expect(erroresInsertSpy).toHaveBeenCalledTimes(1);
      expect(useAthleteStore.getState().currentSession.molestias?.[0]?.envio).toBe("pendiente");

      // 3. El aviso propio sigue visible incluso después de ejecutar un flushQueue() de la cola de series
      await useOfflineQueueStore.getState().flushQueue();
      expect(useAthleteStore.getState().molestiaEnvioError).toBe(
        "No pudimos avisarle a tu coach. Si la molestia es fuerte, escribile por el chat.",
      );

      const avisoConError = avisoMolestiaPara(
        { id: EJ_RUTINA_UUID, musculos_principales: ["Pecho"] },
        useAthleteStore.getState().currentSession.molestias ?? [],
      );
      const htmlConError = renderToStaticMarkup(
        React.createElement(AvisoMolestia, { aviso: avisoConError }),
      );
      expect(htmlConError).toContain('data-testid="molestia-envio-error"');
      expect(htmlConError).toContain(
        "No pudimos avisarle a tu coach. Si la molestia es fuerte, escribile por el chat.",
      );

      // 4. Tercer reintento (migración aplicada en producción): la RPC responde OK, pasa a "enviada" y sale de la cola
      await useAthleteStore.getState().flushMolestiasPendientes();
      expect(rpcSpy).toHaveBeenCalledTimes(3);
      expect(erroresInsertSpy).toHaveBeenCalledTimes(1);
      expect(useAthleteStore.getState().currentSession.molestias?.[0]?.envio).toBe("enviada");
      expect(useAthleteStore.getState().molestiasPendientesFueraDeSesion).toEqual([]);
      expect(useAthleteStore.getState().molestiaEnvioError).toBeNull();

      // Un flush posterior ya no vuelve a enviar la molestia
      await useAthleteStore.getState().flushMolestiasPendientes();
      expect(rpcSpy).toHaveBeenCalledTimes(3);
    },
  );
});
