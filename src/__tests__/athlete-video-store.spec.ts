import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ALUMNO_ID = "11111111-1111-4111-8111-111111111111";
const OTRO_ALUMNO_ID = "99999999-9999-4999-8999-999999999999";
const SESION_ID = "22222222-2222-4222-8222-222222222222";
const EJ_RUTINA_ID = "33333333-3333-4333-8333-333333333333";
const EJ_CANONICO_ID = "44444444-4444-4444-8444-444444444444";

const { mockUpload, mockInsertError, mockGetUser } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockInsertError: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    storage: {
      from: () => ({
        upload: mockUpload,
      }),
    },
    from: (table: string) => ({
      insert: (payload: unknown) => {
        if (table === "errores_app") return mockInsertError(payload);
        return Promise.resolve({ error: null });
      },
      upsert: async () => ({ error: null }),
    }),
  },
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: mockGetUser,
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/athlete",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  AlmacenVideosMemoria,
  configurarAlmacenVideos,
  encolarVideo,
} from "@/lib/athlete/video-subida";
import {
  activarYSincronizarAlAbrir,
  manejarReconexionOnline,
} from "@/components/athlete/athlete-shell";
import { setStorageUser } from "@/lib/user-storage";

describe("GOZS-577 (BE-03 CP4-CP5): store, estados y disparo online/apertura", () => {
  let almacen: AlmacenVideosMemoria;

  beforeEach(() => {
    almacen = new AlmacenVideosMemoria();
    configurarAlmacenVideos(almacen);
    setStorageUser(null);

    mockUpload.mockReset().mockResolvedValue({ data: { path: "ok" }, error: null });
    mockInsertError.mockReset().mockResolvedValue({ error: null });
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: ALUMNO_ID } } });

    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });

    useAthleteStore.setState({
      currentSession: {
        id: SESION_ID,
        nombre_rutina: "Día 1",
        fecha: "2026-11-18",
        studentId: ALUMNO_ID,
        studentName: "Alumno Prueba",
        dia_id: "55555555-5555-4555-8555-555555555555",
        ejercicios: [
          {
            id: EJ_RUTINA_ID,
            ejercicio_id: EJ_CANONICO_ID,
            nombre: "Sentadilla",
            musculos_principales: ["Cuádriceps"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "5",
            series: [
              {
                numero_serie: 1,
                peso_kg: 100,
                reps_hechas: 5,
                rpe_real: 8,
                completada: true,
                estimated1RM: 117,
                completedAt: "2026-11-18T12:00:00.000Z",
                set_type: "N",
              },
            ],
          },
        ],
      },
    });
  });

  afterEach(() => {
    configurarAlmacenVideos(null);
    setStorageUser(null);
  });

  it("enlace válido normaliza a https, marca listo y reencola WORKOUT_SET_COMPLETED; enlace inválido devuelve invalido", async () => {
    const resInv = await useAthleteStore
      .getState()
      .adjuntarVideoASerie(EJ_RUTINA_ID, 1, { tipo: "enlace", url: "javascript:alert(1)" });
    expect(resInv).toBe("invalido");
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);

    const resOk = await useAthleteStore
      .getState()
      .adjuntarVideoASerie(EJ_RUTINA_ID, 1, { tipo: "enlace", url: "http://youtu.be/abc123" });
    expect(resOk).toBe("ok");

    const serie = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
    expect(serie.video_url).toBe("https://youtu.be/abc123");
    expect(serie.videoEstado).toBe("listo");

    const eventos = useOfflineQueueStore.getState().pendingEvents;
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.action).toBe("WORKOUT_SET_COMPLETED");
    expect(eventos[0]?.payload.videoUrl).toBe("https://youtu.be/abc123");
  });

  it("attachVideoForSet funciona como alias sincrónico", () => {
    useAthleteStore
      .getState()
      .attachVideoForSet(EJ_RUTINA_ID, 1, "https://youtu.be/alias");

    const serie = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
    expect(serie.video_url).toBe("https://youtu.be/alias");
    expect(serie.videoEstado).toBe("listo");
  });

  it("sin señal deja videoEstado telefono; al volver online pasa por subiendo → listo y reencola con storage:", async () => {
    useOfflineQueueStore.getState().setOnlineStatus(false);

    const file = new File(["video-bytes"], "sentadilla.mp4", { type: "video/mp4" });
    const res = await useAthleteStore
      .getState()
      .adjuntarVideoASerie(EJ_RUTINA_ID, 1, { tipo: "archivo", file });
    expect(res).toBe("ok");

    expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.videoEstado).toBe(
      "telefono",
    );
    expect(await almacen.listarPorAlumno(ALUMNO_ID)).toHaveLength(1);

    // Capturar transición intermedia a "subiendo" mientras upload está pendiente
    let resolverUpload!: (v: { data: { path: string }; error: null }) => void;
    mockUpload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverUpload = resolve;
        }),
    );

    useOfflineQueueStore.getState().setOnlineStatus(true);
    const flushMock = vi.fn().mockResolvedValue(undefined);
    const promesaSync = manejarReconexionOnline(flushMock);

    // Esperar un tick para que arranque el upload y marque "subiendo"
    await vi.waitFor(() => {
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.videoEstado).toBe(
        "subiendo",
      );
    });

    resolverUpload({ data: { path: "ok" }, error: null });
    await promesaSync;

    expect(flushMock).toHaveBeenCalledTimes(1);
    const serieFinal = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
    expect(serieFinal.videoEstado).toBe("listo");
    expect(serieFinal.video_url).toMatch(
      new RegExp(`^storage:videos-series/${ALUMNO_ID}/${SESION_ID}/${EJ_CANONICO_ID}/1-[0-9a-f-]{36}\\.mp4$`),
    );

    const eventos = useOfflineQueueStore.getState().pendingEvents;
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.action).toBe("WORKOUT_SET_COMPLETED");
    expect(eventos[0]?.payload.videoUrl).toBe(serieFinal.video_url);
    expect(await almacen.listarPorAlumno(ALUMNO_ID)).toHaveLength(0);
  });

  it("error 413 deja videoEstado error y registra en errores_app; reintentarVideoDeSerie pasa a subiendo → listo", async () => {
    mockUpload
      .mockResolvedValueOnce({ data: null, error: { statusCode: "413", message: "Too large" } })
      .mockResolvedValueOnce({ data: { path: "ok" }, error: null });

    const file = new File(["video-bytes"], "grande.mp4", { type: "video/mp4" });
    await useAthleteStore
      .getState()
      .adjuntarVideoASerie(EJ_RUTINA_ID, 1, { tipo: "archivo", file });

    expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.videoEstado).toBe(
      "error",
    );
    expect(mockInsertError).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: ALUMNO_ID,
        contexto: "video_serie",
      }),
    );

    await useAthleteStore.getState().reintentarVideoDeSerie(EJ_RUTINA_ID, 1);

    const serie = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
    expect(serie.videoEstado).toBe("listo");
    expect(serie.video_url).toMatch(/^storage:videos-series\//);
  });

  it("quitarVideoDeSerie borra el pendiente, limpia video_url/videoEstado y reencola con videoUrl: null", async () => {
    useOfflineQueueStore.getState().setOnlineStatus(false);
    const file = new File(["video-bytes"], "s1.mp4", { type: "video/mp4" });
    await useAthleteStore
      .getState()
      .adjuntarVideoASerie(EJ_RUTINA_ID, 1, { tipo: "archivo", file });
    expect(await almacen.listarPorAlumno(ALUMNO_ID)).toHaveLength(1);

    useAthleteStore.getState().quitarVideoDeSerie(EJ_RUTINA_ID, 1);

    await vi.waitFor(async () => {
      expect(await almacen.listarPorAlumno(ALUMNO_ID)).toHaveLength(0);
    });

    const serie = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
    expect(serie.video_url).toBeNull();
    expect(serie.videoEstado).toBe("ninguno");

    const eventos = useOfflineQueueStore.getState().pendingEvents;
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.action).toBe("WORKOUT_SET_COMPLETED");
    expect(eventos[0]?.payload.videoUrl).toBeNull();
  });

  it("al abrir la app solo sube los pendientes del usuario autenticado (aislamiento entre usuarios)", async () => {
    await encolarVideo(
      {
        alumnoId: ALUMNO_ID,
        sesionId: SESION_ID,
        ejercicioId: EJ_CANONICO_ID,
        ejercicioEnRutinaId: EJ_RUTINA_ID,
        numeroSerie: 1,
        blob: new Blob(["a"], { type: "video/mp4" }),
        ext: "mp4",
      },
      { almacen, estaOnline: () => false },
    );
    await encolarVideo(
      {
        alumnoId: OTRO_ALUMNO_ID,
        sesionId: SESION_ID,
        ejercicioId: EJ_CANONICO_ID,
        numeroSerie: 1,
        blob: new Blob(["b"], { type: "video/mp4" }),
        ext: "mp4",
      },
      { almacen, estaOnline: () => false },
    );

    mockGetUser.mockResolvedValue({ data: { user: { id: ALUMNO_ID } } });
    await activarYSincronizarAlAbrir();

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(await almacen.listarPorAlumno(ALUMNO_ID)).toHaveLength(0);
    expect(await almacen.listarPorAlumno(OTRO_ALUMNO_ID)).toHaveLength(1);
  });
});
