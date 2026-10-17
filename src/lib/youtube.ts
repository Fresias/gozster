/**
 * ============================================================================
 * GOZSter: Utilidades de Multimedia y Video de Técnica (YouTube)
 * Archivo: src/lib/youtube.ts
 * ============================================================================
 * Manejo minimalista (Ponytail) y estricto (Karpathy) para extracción de IDs
 * de YouTube y generación de URLs embebidas de alta privacidad (nocookie).
 * ============================================================================
 */

/**
 * Extrae de forma segura el ID de 11 caracteres de YouTube a partir de un ID
 * plano o de cualquier formato de URL (watch?v=, youtu.be, embed, shorts).
 */
export function extractYouTubeVideoId(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Si ya es un ID puro de 11 caracteres alfanuméricos con guión o guión bajo
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex para capturar el ID en diversas variantes de URL de YouTube
  const regExp = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);

  return match && match[1] ? match[1] : null;
}

/**
 * Retorna la URL oficial de YouTube embebida en modo privado (youtube-nocookie).
 */
export function getYouTubeEmbedUrl(input?: string | null): string | null {
  const videoId = extractYouTubeVideoId(input);
  if (!videoId) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`;
}

/**
 * Retorna la URL de búsqueda en YouTube en caso de que un ejercicio no tenga video cargado.
 */
export function getYouTubeSearchUrl(exerciseName: string): string {
  const query = encodeURIComponent(`tecnica ejercicio ${exerciseName.trim()}`);
  return `https://www.youtube.com/results?search_query=${query}`;
}
