/**
 * Reintento con backoff exponencial para las colas offline (GOZS-695).
 * Un fallo transitorio (red, PGRST202, etc.) reprograma el envío: 2s, 4s, 8s,
 * 16s y 32s. Al agotar los intentos se avisa (onAgotado) y el ciclo se reinicia
 * con el próximo disparo externo (reconexión, abrir la app). Nunca se descarta
 * el evento: eso lo decide quien llama.
 */
export const SYNC_MAX_REINTENTOS = 5;
const BASE_MS = 2000;
const MAX_MS = 60_000;

export const delayBackoff = (intento: number): number =>
  Math.min(BASE_MS * 2 ** intento, MAX_MS);

export function crearBackoff(ejecutar: () => void, onAgotado: () => void) {
  let intento = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancelar = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    /** El envío salió bien: se olvida el contador y cualquier reintento pendiente. */
    reset() {
      intento = 0;
      cancelar();
    },
    /** El envío falló de forma transitoria: programa el próximo intento o avisa. */
    programar() {
      if (timer) return;
      if (intento >= SYNC_MAX_REINTENTOS) {
        intento = 0;
        onAgotado();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        ejecutar();
      }, delayBackoff(intento++));
    },
  };
}
