/** Tope de espera de la UI al terminar entrenamiento con señal: 1.200 ms (1,2 s). */
export const SOFT_TIMEOUT_CIERRE_MS = 1200;

/**
 * Espera `promesa` como máximo `ms`. Devuelve `true` si terminó a tiempo y `false`
 * si venció el tope; la promesa sigue corriendo en segundo plano y nunca rechaza acá.
 */
export async function esperarConTope(promesa: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promesa.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
