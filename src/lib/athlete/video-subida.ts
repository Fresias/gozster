import { supabase as defaultSupabase } from "@/lib/supabase/client";
import {
  STORAGE_VIDEO_PREFIX,
  VIDEO_BUCKET,
  mimeDeExtensionVideo,
  rutaVideoSerie,
} from "@/lib/athlete/video-serie";

export const VIDEO_IDB_NAME = "gozster-athlete";
export const VIDEO_IDB_STORE = "videos-pendientes";
export const VIDEO_IDB_VERSION = 1;

export interface SetVideoSnapshot {
  diaId?: string;
  exerciseId?: string;
  exerciseName?: string;
  pesoKg: number;
  reps: number;
  rpe: number | null;
  setType: string;
  painReported: boolean;
  painNotes: string | null;
  estimated1RM: number;
  completedAt?: string;
  atipica?: boolean;
}

export interface VideoPendiente {
  clave: string;
  alumnoId: string;
  sesionId: string;
  ejercicioId: string;
  ejercicioEnRutinaId?: string;
  numeroSerie: number;
  blob: Blob;
  ext: string;
  intentos: number;
  creadoAt: string;
  estado?: "pendiente" | "error";
  setSnapshot?: SetVideoSnapshot;
}

export interface AlmacenVideos {
  guardar(item: VideoPendiente): Promise<void>;
  obtener(clave: string): Promise<VideoPendiente | null>;
  eliminar(clave: string): Promise<void>;
  listarPorAlumno(alumnoId: string): Promise<VideoPendiente[]>;
  actualizarIntentos(clave: string, intentos: number): Promise<void>;
}

export function claveVideoPendiente(a: {
  alumnoId: string;
  sesionId: string;
  ejercicioId: string;
  numeroSerie: number;
}): string {
  return `${a.alumnoId}|${a.sesionId}|${a.ejercicioId}|${a.numeroSerie}`;
}

export class AlmacenVideosMemoria implements AlmacenVideos {
  private readonly items = new Map<string, VideoPendiente>();

  async guardar(item: VideoPendiente): Promise<void> {
    this.items.set(item.clave, { ...item });
  }

  async obtener(clave: string): Promise<VideoPendiente | null> {
    const found = this.items.get(clave);
    return found ? { ...found } : null;
  }

  async eliminar(clave: string): Promise<void> {
    this.items.delete(clave);
  }

  async listarPorAlumno(alumnoId: string): Promise<VideoPendiente[]> {
    return Array.from(this.items.values())
      .filter((item) => item.alumnoId === alumnoId)
      .map((item) => ({ ...item }));
  }

  async actualizarIntentos(clave: string, intentos: number): Promise<void> {
    const found = this.items.get(clave);
    if (!found) return;
    this.items.set(clave, { ...found, intentos });
  }

  tamanio(): number {
    return this.items.size;
  }
}

export class AlmacenVideosIndexedDB implements AlmacenVideos {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB no disponible"));
        return;
      }
      const req = indexedDB.open(VIDEO_IDB_NAME, VIDEO_IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VIDEO_IDB_STORE)) {
          const store = db.createObjectStore(VIDEO_IDB_STORE, { keyPath: "clave" });
          store.createIndex("por_alumno", "alumnoId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Error abriendo IndexedDB"));
    });
    return this.dbPromise;
  }

  async guardar(item: VideoPendiente): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VIDEO_IDB_STORE, "readwrite");
      tx.objectStore(VIDEO_IDB_STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Error guardando video en IndexedDB"));
    });
  }

  async obtener(clave: string): Promise<VideoPendiente | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_IDB_STORE, "readonly");
      const req = tx.objectStore(VIDEO_IDB_STORE).get(clave);
      req.onsuccess = () => resolve((req.result as VideoPendiente | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("Error leyendo video de IndexedDB"));
    });
  }

  async eliminar(clave: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VIDEO_IDB_STORE, "readwrite");
      tx.objectStore(VIDEO_IDB_STORE).delete(clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Error borrando video de IndexedDB"));
    });
  }

  async listarPorAlumno(alumnoId: string): Promise<VideoPendiente[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_IDB_STORE, "readonly");
      const store = tx.objectStore(VIDEO_IDB_STORE);
      const req = store.indexNames.contains("por_alumno")
        ? store.index("por_alumno").getAll(alumnoId)
        : store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as VideoPendiente[] | undefined) ?? [];
        resolve(rows.filter((r) => r.alumnoId === alumnoId));
      };
      req.onerror = () => reject(req.error ?? new Error("Error listando videos de IndexedDB"));
    });
  }

  async actualizarIntentos(clave: string, intentos: number): Promise<void> {
    const item = await this.obtener(clave);
    if (!item) return;
    await this.guardar({ ...item, intentos });
  }
}

let almacenPorDefecto: AlmacenVideos | null = null;

export function obtenerAlmacenVideosPorDefecto(): AlmacenVideos {
  if (almacenPorDefecto) return almacenPorDefecto;
  if (typeof indexedDB !== "undefined") {
    almacenPorDefecto = new AlmacenVideosIndexedDB();
  } else {
    almacenPorDefecto = new AlmacenVideosMemoria();
  }
  return almacenPorDefecto;
}

export function configurarAlmacenVideos(almacen: AlmacenVideos | null): void {
  almacenPorDefecto = almacen;
}

export interface SupabaseVideoClient {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        fileBody: Blob,
        fileOptions?: { contentType?: string; upsert?: boolean },
      ) => Promise<{ data: { path?: string } | null; error: unknown }>;
    };
  };
  from?: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: unknown }> | Promise<{ error: unknown }>;
  };
}

export type VideoEstadoSubida = "telefono" | "subiendo" | "listo" | "error";

export interface SubirPendientesOpciones {
  almacen?: AlmacenVideos;
  supabaseClient?: SupabaseVideoClient;
  estaOnline?: () => boolean;
  onEstadoSerie?: (
    item: VideoPendiente,
    estado: VideoEstadoSubida,
    videoUrl?: string,
  ) => void;
  onSubidaExitosa?: (item: VideoPendiente, videoUrl: string) => void;
}

export interface SubirPendientesResultado {
  subidos: number;
  erroresRed: number;
  erroresPermanentes: number;
}

const clavesEnVuelo = new WeakMap<AlmacenVideos, Set<string>>();

function obtenerEnVuelo(almacen: AlmacenVideos): Set<string> {
  let set = clavesEnVuelo.get(almacen);
  if (!set) {
    set = new Set<string>();
    clavesEnVuelo.set(almacen, set);
  }
  return set;
}

function esNavegadorOnline(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return navigator.onLine;
  }
  return true;
}

function extraerCodigoHttp(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { statusCode?: unknown; status?: unknown; code?: unknown };
  for (const raw of [e.statusCode, e.status, e.code]) {
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isInteger(n) && n >= 400 && n <= 599) return n;
  }
  return null;
}

function esErrorClientePermanente(status: number | null): boolean {
  return status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function mensajeHumanoErrorVideo(status: number): string {
  if (status === 413) return "El video supera el tamaño máximo permitido (100 MB).";
  if (status === 415) return "El formato del video no está permitido.";
  if (status === 401 || status === 403) return "Sin permisos para subir el video de la serie.";
  return `No se pudo subir el video de la serie (error ${status}).`;
}

async function registrarErrorVideoApp(
  client: SupabaseVideoClient,
  item: VideoPendiente,
  status: number,
  error: unknown,
): Promise<void> {
  if (typeof client.from !== "function") return;
  try {
    const detalle =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? status)
        : String(status);
    await client.from("errores_app").insert({
      usuario_id: item.alumnoId,
      contexto: "video_serie",
      mensaje_humano: mensajeHumanoErrorVideo(status),
      detalle_tecnico: detalle,
      payload_resumen: {
        sesionId: item.sesionId,
        ejercicioId: item.ejercicioId,
        numeroSerie: item.numeroSerie,
        statusCode: status,
        ext: item.ext,
        bytes: item.blob.size,
      },
    });
  } catch {
    // Nunca romper el flujo de la app si falla el log remoto
  }
}

export async function encolarVideo(
  entrada: {
    alumnoId: string;
    sesionId: string;
    ejercicioId: string;
    ejercicioEnRutinaId?: string;
    numeroSerie: number;
    blob: Blob;
    ext: string;
    setSnapshot?: SetVideoSnapshot;
  },
  opciones?: SubirPendientesOpciones,
): Promise<{ clave: string; estado: VideoEstadoSubida }> {
  const almacen = opciones?.almacen ?? obtenerAlmacenVideosPorDefecto();
  const clave = claveVideoPendiente(entrada);
  const item: VideoPendiente = {
    clave,
    alumnoId: entrada.alumnoId,
    sesionId: entrada.sesionId,
    ejercicioId: entrada.ejercicioId,
    ejercicioEnRutinaId: entrada.ejercicioEnRutinaId,
    numeroSerie: entrada.numeroSerie,
    blob: entrada.blob,
    ext: entrada.ext,
    intentos: 0,
    creadoAt: new Date().toISOString(),
    estado: "pendiente",
    setSnapshot: entrada.setSnapshot,
  };

  await almacen.guardar(item);

  const online = opciones?.estaOnline ? opciones.estaOnline() : esNavegadorOnline();
  if (!online) {
    opciones?.onEstadoSerie?.(item, "telefono");
    return { clave, estado: "telefono" };
  }

  await subirPendientes(entrada.alumnoId, opciones);

  const restante = await almacen.obtener(clave);
  if (!restante) {
    return { clave, estado: "listo" };
  }
  return {
    clave,
    estado: restante.estado === "error" ? "error" : "telefono",
  };
}

export async function eliminarVideoPendiente(
  a: {
    alumnoId: string;
    sesionId: string;
    ejercicioId: string;
    numeroSerie: number;
  },
  almacen?: AlmacenVideos,
): Promise<void> {
  const store = almacen ?? obtenerAlmacenVideosPorDefecto();
  await store.eliminar(claveVideoPendiente(a));
}

export async function reintentarVideoPendiente(
  a: {
    alumnoId: string;
    sesionId: string;
    ejercicioId: string;
    numeroSerie: number;
  },
  opciones?: SubirPendientesOpciones,
): Promise<boolean> {
  const almacen = opciones?.almacen ?? obtenerAlmacenVideosPorDefecto();
  const clave = claveVideoPendiente(a);
  const item = await almacen.obtener(clave);
  if (!item) return false;

  const reactivado: VideoPendiente = { ...item, estado: "pendiente" };
  await almacen.guardar(reactivado);

  const online = opciones?.estaOnline ? opciones.estaOnline() : esNavegadorOnline();
  if (!online) {
    opciones?.onEstadoSerie?.(reactivado, "telefono");
    return true;
  }

  await subirPendientes(a.alumnoId, opciones);
  return true;
}

/**
 * Sube únicamente los videos pendientes del `alumnoId` autenticado.
 * Nunca toca entradas de otros usuarios en IndexedDB.
 */
export async function subirPendientes(
  alumnoId: string,
  opciones?: SubirPendientesOpciones,
): Promise<SubirPendientesResultado> {
  const resultado: SubirPendientesResultado = {
    subidos: 0,
    erroresRed: 0,
    erroresPermanentes: 0,
  };
  if (!alumnoId) return resultado;

  const online = opciones?.estaOnline ? opciones.estaOnline() : esNavegadorOnline();
  if (!online) return resultado;

  const almacen = opciones?.almacen ?? obtenerAlmacenVideosPorDefecto();
  const client = (opciones?.supabaseClient ?? defaultSupabase) as SupabaseVideoClient | undefined;
  if (!client?.storage) return resultado;

  const pendientes = await almacen.listarPorAlumno(alumnoId);
  const enVuelo = obtenerEnVuelo(almacen);

  for (const item of pendientes) {
    // Aislamiento estricto por usuario + no reintentar automáticamente los 4xx
    if (item.alumnoId !== alumnoId) continue;
    if (item.estado === "error") continue;
    if (enVuelo.has(item.clave)) continue;

    enVuelo.add(item.clave);
    try {
      opciones?.onEstadoSerie?.(item, "subiendo");

      const ruta = rutaVideoSerie({
        alumnoId: item.alumnoId,
        sesionId: item.sesionId,
        ejercicioId: item.ejercicioId,
        numeroSerie: item.numeroSerie,
        ext: item.ext,
      });
      const contentType = item.blob.type || mimeDeExtensionVideo(item.ext);

      const { error } = await client.storage.from(VIDEO_BUCKET).upload(ruta, item.blob, {
        contentType,
        upsert: false,
      });

      if (!error) {
        const videoUrl = `${STORAGE_VIDEO_PREFIX}${ruta}`;
        await almacen.eliminar(item.clave);
        opciones?.onEstadoSerie?.(item, "listo", videoUrl);
        opciones?.onSubidaExitosa?.(item, videoUrl);
        resultado.subidos += 1;
        continue;
      }

      const status = extraerCodigoHttp(error);
      if (esErrorClientePermanente(status)) {
        const conError: VideoPendiente = { ...item, estado: "error" };
        await almacen.guardar(conError);
        opciones?.onEstadoSerie?.(conError, "error");
        await registrarErrorVideoApp(client, item, status!, error);
        resultado.erroresPermanentes += 1;
      } else {
        await almacen.actualizarIntentos(item.clave, item.intentos + 1);
        opciones?.onEstadoSerie?.({ ...item, intentos: item.intentos + 1 }, "telefono");
        resultado.erroresRed += 1;
      }
    } catch {
      await almacen.actualizarIntentos(item.clave, item.intentos + 1);
      opciones?.onEstadoSerie?.({ ...item, intentos: item.intentos + 1 }, "telefono");
      resultado.erroresRed += 1;
    } finally {
      enVuelo.delete(item.clave);
    }
  }

  return resultado;
}
