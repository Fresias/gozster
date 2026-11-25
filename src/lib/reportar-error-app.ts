import { createClient } from "@/lib/supabase/browser";
import type { Database } from "@/types/database.types";

type JsonValue = Exclude<
  Database["public"]["Tables"]["errores_app"]["Insert"]["payload_resumen"],
  undefined
>;

const MAX_DETALLE_TECNICO = 500;
const MAX_DIGEST_LEN = 128;
const MAX_SANITIZE_DEPTH = 3;

export interface ReportarErrorAppParams {
  contexto: string;
  mensajeHumano: string;
  error: unknown;
  payloadResumen?: Record<string, unknown>;
}

function extraerDigest(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return null;
  }
  const raw = (error as { digest?: unknown }).digest;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_DIGEST_LEN) : null;
}

function resumirDetalleTecnico(error: unknown, digest: string | null): string {
  let base = "Error desconocido";

  if (error instanceof Error) {
    const name = error.name?.trim() || "Error";
    const message = error.message?.trim() || "";
    base = message ? `${name}: ${message}` : name;
  } else if (typeof error === "string") {
    base = error.trim() || "Error desconocido";
  } else if (typeof error === "object" && error !== null) {
    const record = error as { name?: unknown; message?: unknown };
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (name && message) {
      base = `${name}: ${message}`;
    } else if (message) {
      base = message;
    } else if (name) {
      base = name;
    }
  }

  const suffix = digest ? ` [digest:${digest}]` : "";
  if (base.length + suffix.length <= MAX_DETALLE_TECNICO) {
    return `${base}${suffix}`;
  }

  const available = MAX_DETALLE_TECNICO - suffix.length;
  if (available <= 1) {
    return suffix.trim().slice(0, MAX_DETALLE_TECNICO);
  }

  return `${base.slice(0, available - 1)}…${suffix}`.slice(0, MAX_DETALLE_TECNICO);
}

function sanitizarValorJson(valor: unknown, depth = 0): JsonValue | undefined {
  if (valor === null) return null;
  if (typeof valor === "string" || typeof valor === "boolean") return valor;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (depth >= MAX_SANITIZE_DEPTH) return undefined;

  if (Array.isArray(valor)) {
    const items: JsonValue[] = [];
    for (const item of valor) {
      const sanitized = sanitizarValorJson(item, depth + 1);
      if (sanitized !== undefined) items.push(sanitized);
    }
    return items;
  }

  if (typeof valor === "object") {
    const obj: { [key: string]: JsonValue | undefined } = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const sanitized = sanitizarValorJson(v, depth + 1);
      if (sanitized !== undefined) {
        obj[k] = sanitized;
      }
    }
    return obj;
  }

  return undefined;
}

function construirPayloadResumen(
  digest: string | null,
  extra?: Record<string, unknown>,
): { [key: string]: JsonValue | undefined } {
  const ruta =
    typeof window !== "undefined" && typeof window.location?.pathname === "string"
      ? window.location.pathname
      : null;

  const resumen: { [key: string]: JsonValue | undefined } = {
    ruta,
    digest,
  };

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      const sanitized = sanitizarValorJson(value);
      if (sanitized !== undefined) {
        resumen[key] = sanitized;
      }
    }
  }

  return resumen;
}

/**
 * Registra de forma best-effort un error de aplicación en `public.errores_app`
 * para el usuario autenticado actual. Jamás lanza excepciones ni interrumpe la UI.
 */
export async function reportarErrorApp(params: ReportarErrorAppParams): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    if (authError || !userId) {
      return false;
    }

    const digest = extraerDigest(params.error);
    const detalleTecnico = resumirDetalleTecnico(params.error, digest);
    const payloadResumen = construirPayloadResumen(digest, params.payloadResumen);

    const { error: insertError } = await supabase.from("errores_app").insert({
      usuario_id: userId,
      contexto: params.contexto,
      mensaje_humano: params.mensajeHumano,
      detalle_tecnico: detalleTecnico,
      payload_resumen: payloadResumen,
    });

    return !insertError;
  } catch {
    return false;
  }
}
