// ============================================================================
// GOZSter: lógica de la Edge Function enviar-push (GOZS-714, PL-1)
// Vacía push_cola: un push por destinatario con sus suscripciones. Sin imports:
// la usan index.ts (Deno) y Vitest (Node) con dependencias inyectadas.
// ============================================================================

export interface PushPendiente {
  id: string;
  destinatario_id: string;
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

/** El texto no incluye el mensaje: la pantalla de bloqueo no debe filtrar contenido. */
export function payloadPara(cantidad: number): PushPayload {
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

  const porDestinatario = new Map<string, number>();
  for (const p of pendientes) porDestinatario.set(p.destinatario_id, (porDestinatario.get(p.destinatario_id) ?? 0) + 1);

  const subs = await deps.suscripciones([...porDestinatario.keys()]);
  const subsPorUsuario = new Map<string, SuscripcionPush[]>();
  for (const s of subs) subsPorUsuario.set(s.usuario_id, [...(subsPorUsuario.get(s.usuario_id) ?? []), s]);

  for (const [usuarioId, cantidad] of porDestinatario) {
    const suscripciones = subsPorUsuario.get(usuarioId) ?? [];
    if (suscripciones.length === 0) {
      res.sinSuscripcion++;
      continue;
    }
    const payload = payloadPara(cantidad);
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
