export const VIDEO_BUCKET = "videos-series";
export const STORAGE_VIDEO_PREFIX = "storage:videos-series/";
export const VIDEO_MAX_BYTES = 104_857_600; // 100 MB
export const VIDEO_MAX_SEGUNDOS = 120;
export const VIDEO_URL_MAX_LENGTH = 2_048;

export const VIDEO_ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
] as const;

export type VideoValidacionResultado = "ok" | "muy-pesado" | "muy-largo" | "formato";

const EXT_POR_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
};

const MIME_POR_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  "3gpp": "video/3gpp",
};

function generarUuidLocal(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function limpiarSegmentoRuta(valor: string): string {
  const limpio = valor.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return limpio || "sin-id";
}

function normalizarMime(mime: string | undefined): string {
  return (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function extraerExtensionNombre(nombre: string | undefined): string {
  if (!nombre) return "";
  const idx = nombre.lastIndexOf(".");
  if (idx < 0 || idx === nombre.length - 1) return "";
  return nombre.slice(idx + 1).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normaliza un enlace externo de video: acepta solo http/https, convierte http -> https
 * y rechaza esquemas inseguros, textos inválidos o URLs mayores a 2.048 caracteres.
 */
export function normalizarEnlaceVideo(texto: string): string | null {
  if (typeof texto !== "string") return null;
  const trimmed = texto.trim();
  if (!trimmed || trimmed.length > VIDEO_URL_MAX_LENGTH) return null;
  if (/[\s\u0000-\u001F\u007F]/.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (!parsed.hostname) return null;

  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }

  const normalized = parsed.toString();
  if (normalized.length > VIDEO_URL_MAX_LENGTH) return null;
  return normalized;
}

/**
 * Construye la ruta obligatoria en el bucket privado `videos-series`:
 * `<alumno_id>/<sesion_id>/<ejercicio_id>/<numero_serie>-<uuid>.<ext>`
 */
export function rutaVideoSerie(a: {
  alumnoId: string;
  sesionId: string;
  ejercicioId: string;
  numeroSerie: number;
  ext: string;
}): string {
  const alumno = limpiarSegmentoRuta(a.alumnoId);
  const sesion = limpiarSegmentoRuta(a.sesionId);
  const ejercicio = limpiarSegmentoRuta(a.ejercicioId);
  const numeroSerie = Math.max(1, Math.trunc(Number.isFinite(a.numeroSerie) ? a.numeroSerie : 1));
  const ext =
    a.ext
      .trim()
      .replace(/^\.+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "mp4";

  return `${alumno}/${sesion}/${ejercicio}/${numeroSerie}-${generarUuidLocal()}.${ext}`;
}

export function esVideoDeStorage(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith(STORAGE_VIDEO_PREFIX);
}

export function extensionDeArchivoVideo(f: Pick<File, "type" | "name">): string {
  const mime = normalizarMime(f.type);
  if (mime && EXT_POR_MIME[mime]) {
    return EXT_POR_MIME[mime]!;
  }
  const ext = extraerExtensionNombre(f.name);
  if (ext && MIME_POR_EXT[ext]) {
    return ext === "qt" ? "mov" : ext === "3gpp" ? "3gp" : ext;
  }
  return "mp4";
}

export function mimeDeExtensionVideo(ext: string): string {
  const limpia = ext.trim().replace(/^\.+/, "").toLowerCase();
  return MIME_POR_EXT[limpia] ?? "video/mp4";
}

function leerDuracionVideo(file: File): Promise<number | null> {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    let objectUrl = "";
    const video = document.createElement("video");

    const limpiar = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      if (objectUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
      video.removeAttribute("src");
    };

    const finalizar = (duracion: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      limpiar();
      resolve(duracion);
    };

    const onLoaded = () => {
      const dur = video.duration;
      finalizar(Number.isFinite(dur) && dur > 0 ? dur : null);
    };

    const onError = () => {
      finalizar(null);
    };

    const timer = setTimeout(() => finalizar(null), 3000);

    try {
      video.preload = "metadata";
      objectUrl = URL.createObjectURL(file);
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
      video.src = objectUrl;
    } catch {
      finalizar(null);
    }
  });
}

/**
 * Valida formato MIME/extensión, peso máximo (100 MB) y duración máxima (120 s)
 * mediante un `<video>` fuera del DOM. Si el navegador no informa duración, acepta por tamaño.
 */
export async function validarArchivoVideo(f: File): Promise<VideoValidacionResultado> {
  const mime = normalizarMime(f.type);
  const ext = extraerExtensionNombre(f.name);
  const mimePermitido = mime ? Boolean(EXT_POR_MIME[mime]) : Boolean(MIME_POR_EXT[ext]);

  if (!mimePermitido) {
    return "formato";
  }

  if (f.size > VIDEO_MAX_BYTES) {
    return "muy-pesado";
  }

  const duracion = await leerDuracionVideo(f);
  if (duracion !== null && duracion > VIDEO_MAX_SEGUNDOS) {
    return "muy-largo";
  }

  return "ok";
}
