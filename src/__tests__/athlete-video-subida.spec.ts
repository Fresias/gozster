import { describe, it, expect, vi } from "vitest";
import {
  AlmacenVideosMemoria,
  claveVideoPendiente,
  encolarVideo,
  reintentarVideoPendiente,
  subirPendientes,
  type SupabaseVideoClient,
} from "@/lib/athlete/video-subida";

const ALUMNO_A = "11111111-1111-4111-8111-111111111111";
const ALUMNO_B = "22222222-2222-4222-8222-222222222222";
const SESION_ID = "33333333-3333-4333-8333-333333333333";
const EJERCICIO_ID = "44444444-4444-4444-8444-444444444444";

describe("GOZS-577 (BE-03 CP3): video-subida y AlmacenVideos", () => {
  it("sin señal guarda en AlmacenVideos en estado telefono y reemplaza el pendiente de la misma serie", async () => {
    const almacen = new AlmacenVideosMemoria();
    const estados: string[] = [];

    const r1 = await encolarVideo(
      {
        alumnoId: ALUMNO_A,
        sesionId: SESION_ID,
        ejercicioId: EJERCICIO_ID,
        numeroSerie: 1,
        blob: new Blob(["v1"], { type: "video/mp4" }),
        ext: "mp4",
      },
      {
        almacen,
        estaOnline: () => false,
        onEstadoSerie: (_item, estado) => estados.push(estado),
      },
    );

    const r2 = await encolarVideo(
      {
        alumnoId: ALUMNO_A,
        sesionId: SESION_ID,
        ejercicioId: EJERCICIO_ID,
        numeroSerie: 1,
        blob: new Blob(["v2-reemplazo"], { type: "video/mp4" }),
        ext: "mp4",
      },
      {
        almacen,
        estaOnline: () => false,
        onEstadoSerie: (_item, estado) => estados.push(estado),
      },
    );

    expect(r1.estado).toBe("telefono");
    expect(r2.estado).toBe("telefono");
    expect(estados).toEqual(["telefono", "telefono"]);
    expect(almacen.tamanio()).toBe(1);
    const guardado = await almacen.obtener(
      claveVideoPendiente({ alumnoId: ALUMNO_A, sesionId: SESION_ID, ejercicioId: EJERCICIO_ID, numeroSerie: 1 }),
    );
    expect(guardado?.blob.size).toBe(12);
  });

  it("subirPendientes sube solo las entradas del alumno autenticado y borra de AlmacenVideos al tener éxito", async () => {
    const almacen = new AlmacenVideosMemoria();
    await encolarVideo(
      {
        alumnoId: ALUMNO_A,
        sesionId: SESION_ID,
        ejercicioId: EJERCICIO_ID,
        numeroSerie: 1,
        blob: new Blob(["video-a"], { type: "video/mp4" }),
        ext: "mp4",
      },
      { almacen, estaOnline: () => false },
    );
    await encolarVideo(
      {
        alumnoId: ALUMNO_B,
        sesionId: SESION_ID,
        ejercicioId: EJERCICIO_ID,
        numeroSerie: 1,
        blob: new Blob(["video-b"], { type: "video/mp4" }),
        ext: "mp4",
      },
      { almacen, estaOnline: () => false },
    );

    const upload = vi.fn().mockResolvedValue({ data: { path: "ok" }, error: null });
    const supabaseMock: SupabaseVideoClient = {
      storage: { from: () => ({ upload }) },
    };
    const exitos: string[] = [];

    const res = await subirPendientes(ALUMNO_A, {
      almacen,
      supabaseClient: supabaseMock,
      estaOnline: () => true,
      onSubidaExitosa: (_item, url) => exitos.push(url),
    });

    expect(res).toEqual({ subidos: 1, erroresRed: 0, erroresPermanentes: 0 });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toMatch(new RegExp(`^${ALUMNO_A}/`));
    expect(upload.mock.calls[0]?.[2]).toEqual({ contentType: "video/mp4", upsert: false });
    expect(exitos[0]).toMatch(new RegExp(`^storage:videos-series/${ALUMNO_A}/`));

    expect(await almacen.listarPorAlumno(ALUMNO_A)).toHaveLength(0);
    expect(await almacen.listarPorAlumno(ALUMNO_B)).toHaveLength(1);
  });

  it("error de red incrementa intentos y deja en telefono", async () => {
    const almacen = new AlmacenVideosMemoria();
    const clave = claveVideoPendiente({
      alumnoId: ALUMNO_A,
      sesionId: SESION_ID,
      ejercicioId: EJERCICIO_ID,
      numeroSerie: 2,
    });
    await encolarVideo(
      {
        alumnoId: ALUMNO_A,
        sesionId: SESION_ID,
        ejercicioId: EJERCICIO_ID,
        numeroSerie: 2,
        blob: new Blob(["video"], { type: "video/mp4" }),
        ext: "mp4",
      },
      { almacen, estaOnline: () => false },
    );

    const supabaseMock: SupabaseVideoClient = {
      storage: { from: () => ({ upload: async () => { throw new Error("Failed to fetch"); } }) },
    };

    const res = await subirPendientes(ALUMNO_A, {
      almacen,
      supabaseClient: supabaseMock,
      estaOnline: () => true,
    });

    expect(res).toEqual({ subidos: 0, erroresRed: 1, erroresPermanentes: 0 });
    const pendiente = await almacen.obtener(clave);
    expect(pendiente?.intentos).toBe(1);
    expect(pendiente?.estado).toBe("pendiente");
  });

  it("error 413 marca estado error, registra en errores_app (video_serie) y reintentar vuelve a subir", async () => {
    const almacen = new AlmacenVideosMemoria();
    const estados: string[] = [];
    const insert = vi.fn().mockResolvedValue({ error: null });
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { statusCode: "413", message: "Payload too large" } })
      .mockResolvedValueOnce({ data: { path: "ok" }, error: null });

    const supabaseMock: SupabaseVideoClient = {
      storage: { from: () => ({ upload }) },
      from: () => ({ insert }),
    };

    const res1 = await encolarVideo(
      {
        alumnoId: ALUMNO_A,
        sesionId: SESION_ID,
        ejercicioId: EJERCICIO_ID,
        numeroSerie: 1,
        blob: new Blob(["video"], { type: "video/mp4" }),
        ext: "mp4",
      },
      {
        almacen,
        supabaseClient: supabaseMock,
        estaOnline: () => true,
        onEstadoSerie: (_item, estado) => estados.push(estado),
      },
    );

    expect(res1.estado).toBe("error");
    expect(estados).toEqual(["subiendo", "error"]);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: ALUMNO_A,
        contexto: "video_serie",
      }),
    );

    // Un nuevo barrido automático no reintenta el 4xx hasta que el alumno pida reintentar
    const resAuto = await subirPendientes(ALUMNO_A, {
      almacen,
      supabaseClient: supabaseMock,
      estaOnline: () => true,
    });
    expect(resAuto).toEqual({ subidos: 0, erroresRed: 0, erroresPermanentes: 0 });
    expect(upload).toHaveBeenCalledTimes(1);

    // Reintento explícito del alumno → subiendo → listo
    estados.length = 0;
    await reintentarVideoPendiente(
      { alumnoId: ALUMNO_A, sesionId: SESION_ID, ejercicioId: EJERCICIO_ID, numeroSerie: 1 },
      {
        almacen,
        supabaseClient: supabaseMock,
        estaOnline: () => true,
        onEstadoSerie: (_item, estado) => estados.push(estado),
      },
    );
    expect(estados).toEqual(["subiendo", "listo"]);
    expect(await almacen.listarPorAlumno(ALUMNO_A)).toHaveLength(0);
  });
});
