export interface VolumeBlock {
  series: number;
  reps: number;
  peso: number;
}

export type SetType = 'WARMUP' | 'NORMAL' | 'FAILURE' | 'DROPSET' | 'W' | 'N' | 'F' | 'D';

/**
 * Estimación de 1RM con fórmula de Epley:
 * 1RM = Peso * (1 + Reps / 30)
 */
export function calculateEpley1RM(peso: number, reps: number): number {
  if (!Number.isFinite(peso) || !Number.isFinite(reps) || peso <= 0 || reps <= 0) {
    return 0;
  }
  return peso * (1 + reps / 30);
}

/**
 * Estimación de 1RM con fórmula de Brzycki:
 * 1RM = Peso / (1.0278 - 0.0278 * Reps)
 */
export function calculateBrzycki1RM(peso: number, reps: number): number {
  if (!Number.isFinite(peso) || !Number.isFinite(reps) || peso <= 0 || reps <= 0) {
    return 0;
  }
  const denominator = 1.0278 - 0.0278 * reps;
  if (denominator <= 0) {
    return 0;
  }
  return peso / denominator;
}

/**
 * Cálculo de volumen total de un bloque:
 * Volumen = Series * Reps * Peso
 */
export function calculateBlockVolume(
  series: number,
  reps: number,
  peso: number,
): number {
  if (
    !Number.isFinite(series) ||
    !Number.isFinite(reps) ||
    !Number.isFinite(peso) ||
    series <= 0 ||
    reps <= 0 ||
    peso <= 0
  ) {
    return 0;
  }
  return series * reps * peso;
}

/**
 * Cálculo de tonelaje total semanal / por sesión:
 * Tonelaje = Σ (Series * Reps * Peso)
 */
export function calculateTotalTonnage(blocks: readonly VolumeBlock[]): number {
  return blocks.reduce(
    (sum, block) =>
      sum + calculateBlockVolume(block.series, block.reps, block.peso),
    0,
  );
}

/**
 * Hevy Double Volume (Volumen Efectivo):
 * Suma estrictamente peso * reps excluyendo series de calentamiento ('WARMUP' o 'W').
 */
export function calculateEffectiveVolume(
  sets: readonly {
    peso_kg: number;
    reps_hechas: number;
    set_type?: string;
    completada?: boolean;
  }[],
): number {
  return sets.reduce((acc, s) => {
    // Si completada está definida y es false, ignorar
    if (s.completada === false) return acc;
    // Excluir series de calentamiento
    const type = (s.set_type || 'NORMAL').toUpperCase();
    if (type === 'WARMUP' || type === 'W') return acc;
    if (s.peso_kg <= 0 || s.reps_hechas <= 0) return acc;
    return acc + s.peso_kg * s.reps_hechas;
  }, 0);
}

export interface WarmupSetProgression {
  setNumber: number;
  peso_kg: number;
  reps: number;
  percentage: number;
  descripcion: string;
  set_type: 'WARMUP';
}

/**
 * Hevy WarmupCalculator:
 * A partir del peso de trabajo programado (ej. 100 kg), calcula automáticamente 4 series progresivas:
 * - Serie 1: Barra sola (20 kg) × 10 reps
 * - Serie 2: 50% × 5 reps
 * - Serie 3: 75% × 3 reps
 * - Serie 4: 90% × 1 rep (activación del SNC)
 */
export function calculateWarmupSets(
  targetWeightKg: number,
  barWeightKg: number = 20,
): WarmupSetProgression[] {
  if (targetWeightKg <= barWeightKg) {
    return [
      {
        setNumber: 1,
        peso_kg: barWeightKg,
        reps: 10,
        percentage: 0,
        descripcion: 'Barra sola (movilidad y técnica)',
        set_type: 'WARMUP',
      },
    ];
  }

  const roundToQuarter = (val: number) => Math.max(barWeightKg, Math.round(val / 2.5) * 2.5);

  return [
    {
      setNumber: 1,
      peso_kg: barWeightKg,
      reps: 10,
      percentage: 0,
      descripcion: 'Barra sola (activación articular)',
      set_type: 'WARMUP',
    },
    {
      setNumber: 2,
      peso_kg: roundToQuarter(targetWeightKg * 0.5),
      reps: 5,
      percentage: 50,
      descripcion: '50% (aproximación inicial)',
      set_type: 'WARMUP',
    },
    {
      setNumber: 3,
      peso_kg: roundToQuarter(targetWeightKg * 0.75),
      reps: 3,
      percentage: 75,
      descripcion: '75% (activación motora)',
      set_type: 'WARMUP',
    },
    {
      setNumber: 4,
      peso_kg: roundToQuarter(targetWeightKg * 0.9),
      reps: 1,
      percentage: 90,
      descripcion: '90% (potenciación SNC previa a series efectivas)',
      set_type: 'WARMUP',
    },
  ];
}

export interface PlateCount {
  weight: number;
  count: number;
}

export interface PlateCalculatorResult {
  barWeightKg: number;
  totalWeightKg: number;
  perSideWeightKg: number;
  platesPerSide: PlateCount[];
  remainderKg: number;
}

/**
 * Hevy PlateCalculator:
 * Desglosa visualmente qué discos exactos colocar por lado en la barra olímpica de 20 kg
 * Opciones estándar de discos: 25, 20, 15, 10, 5, 2.5, 1.25 kg.
 */
export function calculateBarbellPlates(
  totalWeightKg: number,
  barWeightKg: number = 20,
  availablePlates: number[] = [25, 20, 15, 10, 5, 2.5, 1.25],
): PlateCalculatorResult {
  const target = Math.max(barWeightKg, totalWeightKg);
  let perSideNeeded = (target - barWeightKg) / 2;
  const sortedPlates = [...availablePlates].sort((a, b) => b - a);

  const platesPerSide: PlateCount[] = [];
  let currentNeeded = perSideNeeded;

  for (const plate of sortedPlates) {
    if (currentNeeded >= plate) {
      const count = Math.floor(currentNeeded / plate);
      platesPerSide.push({ weight: plate, count });
      currentNeeded = Math.round((currentNeeded - count * plate) * 100) / 100;
    }
  }

  return {
    barWeightKg,
    totalWeightKg: target,
    perSideWeightKg: perSideNeeded,
    platesPerSide,
    remainderKg: currentNeeded,
  };
}

export interface HealthScoreResult {
  score: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
  colorClass: string;
  badgeLabel: string;
}

/**
 * GOZSter Semáforo de Salud del Alumno (SH in [0, 100]):
 * SH = 0.40 * AdherenciaEntreno + 0.30 * FrecuenciaSemanal + 0.20 * InteraccionChat + 0.10 * EstadoCuota
 * - Verde (SH >= 75): Alumno constante, rutinas registradas en los últimos 4 días.
 * - Amarillo (50 <= SH < 75): 5-7 días sin entrenar o cuota por vencer en menos de 5 días.
 * - Rojo (SH < 50): Más de 8 días de inactividad o cuota vencida.
 */
export function calculateStudentHealthScore(params: {
  adherencia: number; // 0 - 100
  frecuencia: number; // 0 - 100
  interaccionChat: number; // 0 - 100
  estadoCuota: number; // 0 - 100 (100 = al día, 50 = por vencer, 0 = vencida)
}): HealthScoreResult {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const adh = clamp(params.adherencia);
  const freq = clamp(params.frecuencia);
  const chat = clamp(params.interaccionChat);
  const cuota = clamp(params.estadoCuota);

  const rawScore = 0.4 * adh + 0.3 * freq + 0.2 * chat + 0.1 * cuota;
  const score = Math.round(rawScore * 10) / 10;

  if (score >= 75) {
    return {
      score,
      status: 'GREEN',
      colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      badgeLabel: 'Excelente Adherencia',
    };
  }

  if (score >= 50) {
    return {
      score,
      status: 'YELLOW',
      colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      badgeLabel: 'Atención Requerida',
    };
  }

  return {
    score,
    status: 'RED',
    colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    badgeLabel: 'Riesgo de Deserción',
  };
}

/**
 * Generador de enlace WhatsApp 1-Clic con copy predefinido dinámico para reactivación de alumnos:
 */
export function generateWhatsAppReactivationUrl(params: {
  phone?: string | null;
  studentName: string;
  daysInactive?: number;
  routineName?: string;
  coachName?: string;
}): string {
  const cleanPhone = (params.phone || '').replace(/\D/g, '');
  const coach = params.coachName || 'tu Coach';
  const routine = params.routineName ? ` de "${params.routineName}"` : '';
  const days = params.daysInactive || 7;

  const message = `Hola ${params.studentName}! Te escribe ${coach} de GOZSter. Vi que pasaron ${days} días desde tu última sesión${routine}. ¿Cómo viene esa semana? ¿Querés que adaptemos la carga o los días para retomarlo con todo hoy?`;

  const encodedMsg = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
  }
  return `https://wa.me/?text=${encodedMsg}`;
}

export type WhatsAppTemplateType = 'cuota' | 'inactividad' | 'record';

/**
 * Templates de WhatsApp en tono de profesor argentino (Fat-Finger Friendly):
 * - Cuota: "Hola [Nombre]! Che, cómo andás? Te aviso que se te vence la cuota estos días. Te paso el alias así quedás al día?"
 * - Inactividad: "Hola crack! Cómo va? Che, vi que hace unos días no te das una vuelta por el gym. Venís bien con los tiempos o querés que ajustemos la rutina?"
 * - Récord: "Hola [Nombre]! Tremendo el récord que clavaste en [Ejercicio], felicitaciones fiera! A seguir metiéndole 💪"
 */
export function generateWhatsAppArgentinoUrl(params: {
  phone?: string | null;
  studentName: string;
  type: WhatsAppTemplateType;
  exerciseName?: string;
}): { url: string; message: string } {
  const cleanPhone = (params.phone || '').replace(/\D/g, '');
  let message = '';

  switch (params.type) {
    case 'cuota':
      message = `Hola ${params.studentName}! Che, cómo andás? Te aviso que se te vence la cuota estos días. Te paso el alias así quedás al día?`;
      break;
    case 'inactividad':
      message = `Hola crack! Cómo va? Che, vi que hace unos días no te das una vuelta por el gym. Venís bien con los tiempos o querés que ajustemos la rutina?`;
      break;
    case 'record':
      message = `Hola ${params.studentName}! Tremendo el récord que clavaste en ${params.exerciseName || 'tu levantamiento'}, felicitaciones fiera! A seguir metiéndole 💪`;
      break;
  }

  const encodedMsg = encodeURIComponent(message);
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`;

  return { url, message };
}

