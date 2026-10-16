/**
 * Web Audio API nativo y vibración háptica para alertas de temporizador.
 * Cumple estrictamente con la regla Ponytail y Karpathy:
 * Cero dependencias externas de audio (sin Howler, Tone.js, etc.).
 */

let cachedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtxClass) {
      return null;
    }

    if (!cachedAudioCtx || cachedAudioCtx.state === "closed") {
      cachedAudioCtx = new AudioCtxClass();
    }

    if (cachedAudioCtx.state === "suspended") {
      cachedAudioCtx.resume().catch(() => {
        // Silencioso si el navegador requiere un gesto previo del usuario
      });
    }

    return cachedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Reproduce una secuencia de tonos sonoros de finalización de descanso mediante Web Audio API.
 */
export function playRestTimerAlert(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const startTime = ctx.currentTime + 0.05;
    // Acorde ascendente suave de 3 beeps: F#5 (739.99 Hz), G#5 (830.61 Hz), B5 (987.77 Hz)
    const tones = [
      { freq: 739.99, start: startTime, duration: 0.12 },
      { freq: 830.61, start: startTime + 0.15, duration: 0.12 },
      { freq: 987.77, start: startTime + 0.3, duration: 0.28 },
    ];

    tones.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration + 0.05);
    });
  } catch {
    // Falla graciosamente en caso de bloqueo de autoplay en el navegador
  }
}

/**
 * Dispara una alerta de vibración táctil nativa en dispositivos móviles.
 */
export function triggerHapticVibration(
  pattern: number | number[] = [200, 100, 200, 100, 300],
): void {
  if (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignorar si el navegador o dispositivo no soporta vibración
    }
  }
}
