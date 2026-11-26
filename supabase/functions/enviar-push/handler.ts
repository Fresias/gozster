// ============================================================================
// GOZSter: lógica de la Edge Function enviar-push (GOZS-714, PL-1)
// Vacía push_cola: un push por destinatario con sus suscripciones. Sin imports:
// la usan index.ts (Deno) y Vitest (Node) con dependencias inyectadas.
// ============================================================================

export type PushTipo = "MENSAJE_CHAT" | "SESION_COMPLETADA" | "ALERTA_DOLOR" | "RECORD_1RM";

export interface PushPendiente {
  id: string;
  destinatario_id: string;
  tipo?: PushTipo;
}

export interface SuscripcionPush {
  id: string;
  usuario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface ProcesarPushDeps {
  /** Marca como enviadas y devuelve hasta `limite` filas de la cola (atómico). */
  reclamarPendientes(limite: number): Promise<PushPendiente[]>;
  suscripciones(usuarioIds: string[]): Promise<SuscripcionPush[]>;
  /** Devuelve el status HTTP del servicio push (201 = ok). Lanza solo si no hay red. */
  enviar(sub: SuscripcionPush, payload: PushPayload): Promise<number>;
  eliminarSuscripcion(id: string): Promise<void>;
}

export interface ResultadoPush {
  procesados: number;
  enviados: number;
  sinSuscripcion: number;
  expiradas: number;
  fallidos: number;
}

export const LIMITE_LOTE = 100;

/** El texto no incluye datos sensibles ni PII: la pantalla de bloqueo no debe filtrar contenido. */
export function payloadPara(cantidad: number, tipo: PushTipo = "MENSAJE_CHAT"): PushPayload {
  if (tipo === "SESION_COMPLETADA") {
    return {
      title: "GOZSter",
      body: cantidad > 1 ? `${cantidad} alumnos finalizaron su entrenamiento.` : "Un alumno finalizó su entrenamiento.",
      url: "/studio",
      tag: "gozs-workout-completed",
    };
  }
  return {
    title: "GOZSter",
    body: cantidad > 1 ? `Tenés ${cantidad} mensajes nuevos.` : "Tenés un mensaje nuevo.",
    url: "/",
    tag: "gozs-chat-notification",
  };
}

export async function procesarCola(deps: ProcesarPushDeps, limite = LIMITE_LOTE): Promise<ResultadoPush> {
  const pendientes = await deps.reclamarPendientes(limite);
  const res: ResultadoPush = { procesados: pendientes.length, enviados: 0, sinSuscripcion: 0, expiradas: 0, fallidos: 0 };
  if (pendientes.length === 0) return res;

  const grupos = new Map<string, { destinatario_id: string; tipo: PushTipo; cantidad: number }>();
  const destinatarios = new Set<string>();
  for (const p of pendientes) {
    const tipo: PushTipo = p.tipo ?? "MENSAJE_CHAT";
    const clave = `${p.destinatario_id}\0${tipo}`;
    destinatarios.add(p.destinatario_id);
    const actual = grupos.get(clave);
    if (actual) actual.cantidad++;
    else grupos.set(clave, { destinatario_id: p.destinatario_id, tipo, cantidad: 1 });
  }

  const subs = await deps.suscripciones([...destinatarios]);
  const subsPorUsuario = new Map<string, SuscripcionPush[]>();
  for (const s of subs) subsPorUsuario.set(s.usuario_id, [...(subsPorUsuario.get(s.usuario_id) ?? []), s]);

  for (const { destinatario_id: usuarioId, tipo, cantidad } of grupos.values()) {
    const suscripciones = subsPorUsuario.get(usuarioId) ?? [];
    if (suscripciones.length === 0) {
      res.sinSuscripcion++;
      continue;
    }
    const payload = payloadPara(cantidad, tipo);
    for (const sub of suscripciones) {
      try {
        const status = await deps.enviar(sub, payload);
        if (status === 404 || status === 410) {
          await deps.eliminarSuscripcion(sub.id);
          res.expiradas++;
        } else if (status >= 200 && status < 300) res.enviados++;
        else res.fallidos++;
      } catch {
        res.fallidos++;
      }
    }
  }
  return res;
}

/** Igualdad en tiempo constante del bearer con la service_role key. */
export function autorizado(authorization: string | null, serviceKey: string | undefined): boolean {
  if (!serviceKey || !authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  if (token.length !== serviceKey.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ serviceKey.charCodeAt(i);
  return diff === 0;
}
