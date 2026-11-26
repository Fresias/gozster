import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-storage";
import { supabase } from "@/lib/supabase/client";
import {
  toRegistroSerieRow,
  toRegistroSeriePartialUpdateRow,
  type RegistroSerieRow,
  type RegistroSeriePartialUpdateRow,
} from "@/lib/athlete/registro-series-mapper";
import { crearBackoff } from "@/lib/sync-backoff";

export interface OfflineSyncEvent {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface OfflineQueueState {
  isOnline: boolean;
  pendingEvents: OfflineSyncEvent[];
  /**
   * Aviso de fallo DEFINITIVO de sincronización (p. ej. 401 por sesión
   * vencida). Es la única excepción que la app del alumno muestra: un aviso
   * discreto y no bloqueante. Nunca exponemos el contador de la cola.
   */
  syncError: string | null;
  /** Efímero (no se persiste): hay una corrida de la cola en curso. */
  isFlushing: boolean;
  /** Efímero: series que viajan en la corrida actual (indicador "Enviando N series…"). */
  syncingSeriesCount: number;
  setOnlineStatus: (isOnline: boolean) => void;
  enqueueEvent: (event: Omit<OfflineSyncEvent, "createdAt">) => void;
  removeEvent: (id: string) => void;
  /** Quita varios eventos en un único `set()` (0 escrituras si ninguno existe). */
  removeEvents: (ids: string[]) => void;
  clearQueue: () => void;
  /**
   * Envía la cola a Supabase de forma silenciosa al recuperar la señal. Solo
   * quita los eventos confirmados por el servidor; ante un fallo (red/RLS) el
   * resto queda en cola para reintentar. El alumno nunca ve el proceso.
   */
  flushQueue: () => Promise<void>;
  setSyncError: (message: string) => void;
  clearSyncError: () => void;
}

export const SET_ACTIONS = ["WORKOUT_SET_COMPLETED", "WORKOUT_SET_UPDATED"];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SendResult = "ok" | "retry" | "rejected";

// Errores permanentes de Postgres: CHECK (23514), FK (23503) y RLS (42501).
// Reintentarlos no sirve y bloquearía la cola; los de red no traen código.
const PERMANENT_CODES = ["23514", "23503", "42501"];
const toResult = (error: { code?: string } | null): SendResult =>
  !error ? "ok" : PERMANENT_CODES.includes(error.code ?? "") ? "rejected" : "retry";

/** Acciones de entrenamiento que se agrupan por `sessionId` en un único envío. */
export const SESSION_COMPLETED_ACTION = "WORKOUT_SESSION_COMPLETED";
export const CAMBIO_DIA_ACTION = "CAMBIO_DIA_REGISTRADO";
export const HISTORIAL_SERIE_ACTION = "HISTORIAL_SERIE_UPDATED";
export const SESSION_ACTIONS = [...SET_ACTIONS, SESSION_COMPLETED_ACTION, CAMBIO_DIA_ACTION];

const ON_CONFLICT_SERIE = "sesion_id,ejercicio_id,numero_serie";
const SERIE_RECHAZADA_MSG = "No pudimos guardar una serie. Avisá a tu coach.";

function sessionIdDe(ev: OfflineSyncEvent): string | undefined {
  const p = ev.payload as { sessionId?: unknown; sesionId?: unknown } | undefined;
  const sid = p?.sessionId ?? p?.sesionId;
  return typeof sid === "string" && sid.length > 0 ? sid : undefined;
}

/** Ids de sesión con algún evento todavía en la cola (no se deben pisar ni podar). */
export function sesionesConPendientes(
  events: readonly OfflineSyncEvent[] | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const ev of events ?? []) {
    const sid = sessionIdDe(ev);
    if (sid) ids.add(sid);
  }
  return ids;
}

/** `auth.getUser()` una sola vez por corrida de la cola, y solo si hace falta. */
function crearAuthPerezoso(): () => Promise<string | null> {
  let pendiente: Promise<string | null> | null = null;
  return () =>
    (pendiente ??= supabase
      ? supabase.auth.getUser().then(
          (r) => r.data.user?.id ?? null,
          () => null,
        )
      : Promise.resolve(null));
}

type SetPayload = {
  alumnoId?: string;
  diaId?: string;
  ejercicioId?: string;
  setNumber: number;
  pesoKg?: number;
  reps?: number;
  rpe?: number | null;
  setType?: string;
  painReported?: boolean;
  painNotes?: string | null;
  videoUrl?: string | null;
};

type FilaConEventos<Row> = { row: Row; ids: string[] };
type ResultadoGrupo = { removeIds: string[]; retry: boolean; rejected: boolean };

/**
 * Upsert en lote de filas de serie. Si el lote choca con un error permanente se
 * reintenta fila a fila para guardar las válidas y descartar solo las inválidas.
 */
async function upsertSeries<Row extends object>(
  filas: FilaConEventos<Row>[],
): Promise<{ okIds: string[]; rechazadasIds: string[]; retry: boolean }> {
  const res = { okIds: [] as string[], rechazadasIds: [] as string[], retry: false };
  if (filas.length === 0 || !supabase) return res;
  const lote = await supabase
    .from("registro_series")
    .upsert(filas.map((f) => f.row) as any, { onConflict: ON_CONFLICT_SERIE });
  const resultadoLote = toResult(lote.error);
  if (resultadoLote === "ok") {
    res.okIds = filas.flatMap((f) => f.ids);
    return res;
  }
  if (resultadoLote === "retry") {
    res.retry = true;
    return res;
  }
  if (filas.length === 1) {
    res.rechazadasIds = filas[0]!.ids;
    return res;
  }
  for (const fila of filas) {
    let r: SendResult;
    try {
      const una = await supabase
        .from("registro_series")
        .upsert(fila.row as any, { onConflict: ON_CONFLICT_SERIE });
      r = toResult(una.error);
    } catch {
      r = "retry";
    }
    if (r === "ok") res.okIds.push(...fila.ids);
    else if (r === "rejected") res.rechazadasIds.push(...fila.ids);
    else res.retry = true;
  }
  return res;
}

/**
 * Envía todos los eventos de una sesión de entrenamiento en 2 RTTs: 1 upsert de
 * `registro_sesiones` (cabecera fusionada) + 1 upsert en lote de `registro_series`
 * (con merge semántico de ediciones). Idempotente: sesión por id y serie por
 * (sesion_id, ejercicio_id, numero_serie), así un reintento no duplica.
 */
async function sendSessionGroup(
  sessionId: string,
  eventos: OfflineSyncEvent[],
  authUid: () => Promise<string | null>,
): Promise<ResultadoGrupo> {
  const out: ResultadoGrupo = { removeIds: [], retry: false, rejected: false };
  if (!supabase) return { ...out, retry: true };

  // Sin ejercicio no se puede atribuir la serie: reintentar no lo arregla.
  const validos: OfflineSyncEvent[] = [];
  for (const ev of eventos) {
    if (SET_ACTIONS.includes(ev.action) && !(ev.payload as SetPayload).ejercicioId) {
      out.removeIds.push(ev.id);
      out.rejected = true;
    } else {
      validos.push(ev);
    }
  }
  if (validos.length === 0) return out;

  // La serie es del alumno del evento; si no viene, del usuario autenticado (RLS exige
  // lo mismo). Sin ninguno se conserva en cola: es dato del alumno, no se descarta.
  const alumnoDe = (ev: OfflineSyncEvent) => {
    const a = (ev.payload as { alumnoId?: unknown }).alumnoId;
    return typeof a === "string" && a.length > 0 ? a : undefined;
  };
  const alumnoId =
    alumnoDe(validos[0]!) ?? (await authUid()) ?? validos.map(alumnoDe).find(Boolean);
  if (!alumnoId) return { ...out, retry: true };

  // Cabecera fusionada en orden cronológico, sin enviar `undefined`.
  const sesionRow: Record<string, unknown> = { id: sessionId, alumno_id: alumnoId };
  const asignar = (col: string, valor: unknown) => {
    if (valor !== undefined) sesionRow[col] = valor;
  };
  const full = new Map<string, FilaConEventos<RegistroSerieRow>>();
  const partial = new Map<string, FilaConEventos<RegistroSeriePartialUpdateRow>>();
  const cabeceraIds: string[] = [];

  for (const ev of validos) {
    const p = ev.payload as Record<string, unknown>;
    if (ev.action === CAMBIO_DIA_ACTION) {
      asignar("dia_id", p.diaElegidoId);
      asignar("dia_sugerido_id", p.diaSugeridoId);
      asignar("motivo_cambio_dia", p.motivoCambioDia);
      cabeceraIds.push(ev.id);
      continue;
    }
    if (ev.action === SESSION_COMPLETED_ACTION) {
      asignar("dia_id", p.diaId);
      asignar("dia_sugerido_id", p.diaSugeridoId);
      asignar("motivo_cambio_dia", p.motivoCambioDia);
      asignar("duracion_minutos", p.duracionMinutos);
      asignar("estado", p.estado);
      asignar("finalizada_at", p.finalizadaAt);
      cabeceraIds.push(ev.id);
      continue;
    }
    const s = p as unknown as SetPayload;
    asignar("dia_id", s.diaId);
    const clave = `${s.ejercicioId}:${s.setNumber}`;
    if (ev.action === "WORKOUT_SET_COMPLETED") {
      const previos = [...(full.get(clave)?.ids ?? []), ...(partial.get(clave)?.ids ?? [])];
      partial.delete(clave);
      full.set(clave, {
        row: toRegistroSerieRow({
          sesionId: sessionId,
          ejercicioId: s.ejercicioId!,
          numeroSerie: s.setNumber,
          pesoKg: s.pesoKg,
          reps: s.reps,
          rpe: s.rpe,
          setType: s.setType,
          painReported: s.painReported,
          painNotes: s.painNotes,
          videoUrl: s.videoUrl,
        }),
        ids: [...previos, ev.id],
      });
      continue;
    }
    // WORKOUT_SET_UPDATED: peso/reps nuevos, preservando rpe/tipo/dolor/video del registro.
    const registrada = full.get(clave);
    if (registrada) {
      if (s.pesoKg !== undefined) registrada.row.peso_kg = s.pesoKg;
      if (s.reps !== undefined) registrada.row.reps_hechas = s.reps;
      registrada.ids.push(ev.id);
      continue;
    }
    const previa = partial.get(clave);
    partial.set(clave, {
      row: toRegistroSeriePartialUpdateRow({
        sesionId: sessionId,
        ejercicioId: s.ejercicioId!,
        numeroSerie: s.setNumber,
        pesoKg: s.pesoKg ?? previa?.row.peso_kg,
        reps: s.reps ?? previa?.row.reps_hechas,
      }),
      ids: [...(previa?.ids ?? []), ev.id],
    });
  }

  const sesion = await supabase
    .from("registro_sesiones")
    .upsert(sesionRow as any, { onConflict: "id" });
  const resultadoSesion = toResult(sesion.error);
  if (resultadoSesion === "retry") return { ...out, retry: true };
  if (resultadoSesion === "rejected") {
    out.removeIds.push(...validos.map((ev) => ev.id));
    out.rejected = true;
    return out;
  }
  out.removeIds.push(...cabeceraIds);

  const lotes: FilaConEventos<object>[][] = [[...full.values()], [...partial.values()]];
  for (const filas of lotes) {
    const r = await upsertSeries(filas);
    out.removeIds.push(...r.okIds, ...r.rechazadasIds);
    if (r.rechazadasIds.length > 0) out.rejected = true;
    if (r.retry) {
      out.retry = true;
      break;
    }
  }
  return out;
}

const SERIE_SINTETICA_REGEX =
  /^ser-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)-(\d+)$/i;

/** Clave compuesta de una serie con id sintético local `ser-<sesion>-<ejercicio>-<n>`. */
export function claveSerieSintetica(
  serieId: string,
): { sesionId: string; ejercicioId: string; numeroSerie: number } | null {
  const m = SERIE_SINTETICA_REGEX.exec(serieId);
  if (!m || !UUID_REGEX.test(m[2]!)) return null;
  return { sesionId: m[1]!, ejercicioId: m[2]!, numeroSerie: Number(m[3]) };
}

/**
 * Envía la edición de una serie del historial. Soporta id real (UUID) y el id
 * sintético local (`ser-...`) resolviendo la fila por su clave compuesta.
 */
export async function enviarEdicionSerieHistorial(p: Record<string, unknown>): Promise<SendResult> {
  if (!supabase) return "retry";
  const serieId = p.serieId;
  if (typeof serieId !== "string") return "rejected";
  const cambios = {
    peso_kg: p.pesoKg,
    reps_hechas: p.repsHechas,
    updated_at: new Date().toISOString(),
  } as any;
  if (UUID_REGEX.test(serieId)) {
    const { error } = await supabase.from("registro_series").update(cambios).eq("id", serieId);
    return toResult(error);
  }
  const clave = claveSerieSintetica(serieId);
  if (!clave) return "rejected";
  const { error } = await supabase
    .from("registro_series")
    .update(cambios)
    .eq("sesion_id", clave.sesionId)
    .eq("ejercicio_id", clave.ejercicioId)
    .eq("numero_serie", clave.numeroSerie);
  return toResult(error);
}

async function sendChatEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  const p = ev.payload as {
    alumno_id?: string;
    conversacion_id?: string;
    remitente_id?: string;
    contenido?: string;
    requiere_lectura_inicio?: boolean;
  };
  if (!supabase) return "retry";
  const contenido = typeof p.contenido === "string" ? p.contenido.trim() : "";
  if (!contenido) return "rejected";

  const authUserId = (await supabase.auth.getUser()).data.user?.id;
  const remitenteId =
    authUserId && UUID_REGEX.test(authUserId)
      ? authUserId
      : p.remitente_id && UUID_REGEX.test(p.remitente_id)
        ? p.remitente_id
        : null;
  if (!remitenteId) return "retry";

  let convId = p.conversacion_id && UUID_REGEX.test(p.conversacion_id) ? p.conversacion_id : null;
  if (!convId && p.alumno_id && UUID_REGEX.test(p.alumno_id)) {
    const { data, error } = await supabase.rpc("obtener_o_crear_conversacion", {
      p_alumno_id: p.alumno_id,
    });
    if (error) return toResult(error);
    if (typeof data === "string" && UUID_REGEX.test(data)) {
      convId = data;
    }
  }
  if (!convId) return "rejected";

  const res = await supabase.from("mensajes").insert({
    conversacion_id: convId,
    remitente_id: remitenteId,
    contenido,
    leido: false,
    requiere_lectura_inicio: Boolean(p.requiere_lectura_inicio),
  });
  return toResult(res.error);
}

async function sendFeedbackClaseEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  const p = ev.payload as {
    reservaId?: string;
    sensacion?: 1 | 2 | 3 | 4;
  };
  if (!supabase) return "retry";
  if (!p.reservaId || !UUID_REGEX.test(p.reservaId) || !p.sensacion) return "rejected";
  const res = await supabase
    .from("feedback_clase")
    .upsert(
      { reserva_id: p.reservaId, sensacion: p.sensacion },
      { onConflict: "reserva_id" },
    );
  return toResult(res.error);
}

async function sendLogroRachaEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  const p = ev.payload as {
    alumnoId?: string;
    numeroCiclo?: number;
    tipo?: string;
  };
  if (!supabase) return "retry";
  const numeroCiclo = Number(p.numeroCiclo);
  if (!Number.isInteger(numeroCiclo) || numeroCiclo < 1) return "rejected";
  const authUserId = (await supabase.auth.getUser()).data.user?.id;
  const alumnoId =
    p.alumnoId && UUID_REGEX.test(p.alumnoId)
      ? p.alumnoId
      : authUserId && UUID_REGEX.test(authUserId)
        ? authUserId
        : null;
  if (!alumnoId) return "retry";
  const res = await (supabase as any).from("logros_racha").upsert(
    {
      alumno_id: alumnoId,
      numero_ciclo: numeroCiclo,
      tipo: p.tipo === "diamante" ? "diamante" : "diamante",
    },
    { onConflict: "alumno_id,numero_ciclo,tipo", ignoreDuplicates: true },
  );
  // Si el backend aún no desplegó logros_racha (42P01 / PGRST205), no bloqueamos la cola.
  if (res.error && (res.error.code === "42P01" || res.error.code === "PGRST205")) {
    return "retry";
  }
  return toResult(res.error);
}

const esUuidTxt = (v: unknown): v is string => typeof v === "string" && UUID_REGEX.test(v);

async function sendCuestionarioInicialEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  if (!supabase) return "retry";
  const p = ev.payload as Record<string, unknown>;
  if (!esUuidTxt(p.alumno_id)) return "rejected";
  const res = await supabase.from("alumno_cuestionario_inicial").upsert(
    {
      alumno_id: p.alumno_id,
      objetivo_principal: p.objetivo_principal ?? null,
      experiencia_previa: p.experiencia_previa ?? null,
      dias_disponibles_semana: p.dias_disponibles_semana ?? null,
      molestias_o_lesiones_previas: p.molestias_o_lesiones_previas ?? null,
      equipamiento_disponible: p.equipamiento_disponible ?? null,
      respuestas_extra: p.respuestas_extra ?? {},
      completado_at: p.completado_at ?? null,
      updated_at: p.updated_at ?? new Date().toISOString(),
    } as never,
    { onConflict: "alumno_id" },
  );
  return toResult(res.error);
}

async function sendTransferirConversacionEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  if (!supabase) return "retry";
  const p = ev.payload as { conversacion_id?: unknown; nuevo_responsable_id?: unknown; motivo?: unknown };
  if (!esUuidTxt(p.conversacion_id) || !esUuidTxt(p.nuevo_responsable_id)) return "rejected";
  const res = await supabase.rpc("transferir_conversacion_gozs", {
    p_conversacion_id: p.conversacion_id,
    p_nuevo_responsable_id: p.nuevo_responsable_id,
    p_motivo: typeof p.motivo === "string" && p.motivo ? p.motivo : null,
  } as never);
  return toResult(res.error);
}

async function sendCambiarEstadoConversacionEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  if (!supabase) return "retry";
  const p = ev.payload as { conversacion_id?: unknown; estado?: unknown };
  if (!esUuidTxt(p.conversacion_id) || typeof p.estado !== "string" || !p.estado) return "rejected";
  const res = await supabase
    .from("conversaciones")
    .update({ estado: p.estado, updated_at: new Date().toISOString() } as never)
    .eq("id", p.conversacion_id);
  return toResult(res.error);
}

async function sendUpdateNivelVistaEvent(ev: OfflineSyncEvent): Promise<SendResult> {
  if (!supabase) return "retry";
  const p = ev.payload as { alumnoId?: unknown; nivel?: unknown };
  if (!esUuidTxt(p.alumnoId) || (p.nivel !== "SIMPLE" && p.nivel !== "TECNICA")) return "rejected";
  const res = await supabase
    .from("perfiles")
    .update({ nivel_vista_alumno: p.nivel } as never)
    .eq("id", p.alumnoId);
  return toResult(res.error);
}

/** Acciones secundarias con destino real en Supabase (GOZS-885). */
const SENDERS: Record<string, (ev: OfflineSyncEvent) => Promise<SendResult>> = {
  ENVIAR_MENSAJE_CHAT: sendChatEvent,
  FEEDBACK_CLASE: sendFeedbackClaseEvent,
  REGISTRAR_LOGRO_RACHA: sendLogroRachaEvent,
  UPSERT_CUESTIONARIO_INICIAL: sendCuestionarioInicialEvent,
  TRANSFERIR_CONVERSACION_GOZS: sendTransferirConversacionEvent,
  CAMBIAR_ESTADO_CONVERSACION: sendCambiarEstadoConversacionEvent,
  UPDATE_ALUMNO_NIVEL_VISTA: sendUpdateNivelVistaEvent,
};

const RECHAZO_MSG: Record<string, string | null> = {
  FEEDBACK_CLASE: "No pudimos guardar tu devolución de la clase.",
  REGISTRAR_LOGRO_RACHA: null,
  UPSERT_CUESTIONARIO_INICIAL: "No pudimos guardar tu cuestionario inicial.",
  TRANSFERIR_CONVERSACION_GOZS: "No pudimos transferir la conversación.",
  CAMBIAR_ESTADO_CONVERSACION: "No pudimos actualizar el estado de la conversación.",
  UPDATE_ALUMNO_NIVEL_VISTA: "No pudimos guardar el nivel de vista del alumno.",
};

export const SYNC_REINTENTOS_AGOTADOS_MSG =
  "No pudimos sincronizar tus datos. Quedan guardados en este teléfono y lo volvemos a intentar.";

export const haySenal = () =>
  useOfflineQueueStore.getState().isOnline &&
  (typeof navigator === "undefined" || navigator.onLine !== false);

// Fallo transitorio (red, PGRST202…): se reintenta con backoff sin descartar nada.
// Sin señal no se gastan reintentos: el ciclo vuelve a empezar al reconectar.
const backoffCola = crearBackoff(
  () => {
    if (haySenal()) void useOfflineQueueStore.getState().flushQueue();
    else backoffCola.reset();
  },
  () => useOfflineQueueStore.setState({ syncError: SYNC_REINTENTOS_AGOTADOS_MSG }),
);

/** Corta el reintento pendiente y el contador (cambio de usuario / logout). */
export const resetBackoffCola = () => backoffCola.reset();

// Una sola corrida de flushQueue a la vez: evita envíos duplicados y carreras con el backoff.
let activeFlushPromise: Promise<void> | null = null;

async function flushUnaVez(): Promise<void> {
  const { getState: get, setState: set } = useOfflineQueueStore;
  const snapshot = get().pendingEvents;
  set({
    syncError: null,
    isFlushing: true,
    syncingSeriesCount: snapshot.filter((ev) => SET_ACTIONS.includes(ev.action)).length,
  });
  try {
    await recorrerCola(snapshot);
  } finally {
    set({ isFlushing: false, syncingSeriesCount: 0 });
  }
}

async function recorrerCola(snapshot: OfflineSyncEvent[]): Promise<void> {
  const { getState: get, setState: set } = useOfflineQueueStore;
  const authUid = crearAuthPerezoso();
  const atendidos = new Set<string>();
  for (const ev of snapshot) {
    if (atendidos.has(ev.id)) continue;
    atendidos.add(ev.id);

    // Entrenamiento: los eventos de una sesión viajan juntos (2 RTTs, 1 removeEvents).
    if (SESSION_ACTIONS.includes(ev.action)) {
      const sid = sessionIdDe(ev);
      if (!sid) {
        // Sin sesión no se puede atribuir: reintentar no lo arregla.
        if (SET_ACTIONS.includes(ev.action)) set({ syncError: SERIE_RECHAZADA_MSG });
        get().removeEvent(ev.id);
        continue;
      }
      const grupo = snapshot.filter(
        (e) => SESSION_ACTIONS.includes(e.action) && sessionIdDe(e) === sid,
      );
      for (const e of grupo) atendidos.add(e.id);
      let r: ResultadoGrupo;
      try {
        r = await sendSessionGroup(sid, grupo, authUid);
      } catch {
        r = { removeIds: [], retry: true, rejected: false };
      }
      get().removeEvents(r.removeIds);
      if (r.rejected) set({ syncError: SERIE_RECHAZADA_MSG });
      if (r.retry) {
        backoffCola.programar();
        return;
      }
      continue;
    }

    // Ediciones del historial: se compactan por serie y viaja solo la última.
    if (ev.action === HISTORIAL_SERIE_ACTION) {
      const serieId = (ev.payload as { serieId?: unknown }).serieId;
      const grupo = snapshot.filter(
        (e) =>
          e.action === HISTORIAL_SERIE_ACTION &&
          (e.payload as { serieId?: unknown }).serieId === serieId,
      );
      for (const e of grupo) atendidos.add(e.id);
      let result: SendResult;
      try {
        result = await enviarEdicionSerieHistorial(grupo[grupo.length - 1]!.payload);
      } catch {
        result = "retry";
      }
      if (result === "retry") {
        backoffCola.programar();
        return;
      }
      if (result === "rejected") set({ syncError: SERIE_RECHAZADA_MSG });
      get().removeEvents(grupo.map((e) => e.id));
      continue;
    }

    // Acción sin destino en el servidor (desconocida o solo local): no bloquea la cola.
    const sender = SENDERS[ev.action];
    let result: SendResult = "ok";
    if (sender) {
      try {
        result = await sender(ev);
      } catch {
        result = "retry";
      }
    }
    // Orden preservado: ante un fallo transitorio se corta y se reintenta con backoff.
    if (result === "retry") {
      backoffCola.programar();
      return;
    }
    // Rechazo permanente: se descarta ese evento para no bloquear la cola.
    if (result === "rejected") {
      const msg = ev.action in RECHAZO_MSG ? RECHAZO_MSG[ev.action] : SERIE_RECHAZADA_MSG;
      if (msg) set({ syncError: msg });
    }
    get().removeEvent(ev.id);
  }
  backoffCola.reset();
}

const memoryFallback: Record<string, string> = {};

export const safeStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(name);
    }
    return memoryFallback[name] ?? null;
  },
  setItem: (name: string, value: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(name, value);
      return;
    }
    memoryFallback[name] = value;
  },
  removeItem: (name: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(name);
      return;
    }
    delete memoryFallback[name];
  },
};

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
      isFlushing: false,
      syncingSeriesCount: 0,
      setOnlineStatus: (isOnline) => {
        if (!isOnline) backoffCola.reset();
        set({ isOnline });
      },
      enqueueEvent: (event) =>
        set((state) => ({
          pendingEvents: [
            ...state.pendingEvents,
            { ...event, createdAt: new Date().toISOString() },
          ],
        })),
      removeEvent: (id) =>
        set((state) => ({
          pendingEvents: state.pendingEvents.filter((item) => item.id !== id),
        })),
      removeEvents: (ids) => {
        if (ids.length === 0) return;
        const quitar = new Set(ids);
        const actuales = get().pendingEvents;
        if (!actuales.some((ev) => quitar.has(ev.id))) return;
        set({ pendingEvents: actuales.filter((ev) => !quitar.has(ev.id)) });
      },
      clearQueue: () => {
        backoffCola.reset();
        set({ pendingEvents: [] });
      },
      flushQueue: async () => {
        // Sin cliente Supabase no hay servidor que confirme: nada se descarta.
        if (!supabase) return;
        while (activeFlushPromise) await activeFlushPromise;
        activeFlushPromise = flushUnaVez().finally(() => {
          activeFlushPromise = null;
        });
        await activeFlushPromise;
      },
      setSyncError: (message) => set({ syncError: message }),
      clearSyncError: () => set({ syncError: null }),
    }),
    {
      name: "gozster-offline-queue",
      storage: createJSONStorage(() => userScopedStorage),
      // Nunca persistimos el aviso de error: es efímero y no bloqueante.
      partialize: (state) => ({
        isOnline: state.isOnline,
        pendingEvents: state.pendingEvents,
      }),
    },
  ),
);
