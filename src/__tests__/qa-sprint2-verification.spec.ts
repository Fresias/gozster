import { describe, expect, it, vi } from 'vitest';
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  type VolumeBlock,
} from '../../tests/strength-metrics.spec';

// ============================================================================
// Tipos e Interfaces de Dominio para Validación QA de Sprint 2
// ============================================================================

export type EstadoMembresiaQA =
  | 'ACTIVA'
  | 'INACTIVA'
  | 'PENDIENTE'
  | 'BAJA'
  | 'ACTIVE'
  | 'EXPIRED_PAYMENT_PENDING'
  | 'ARCHIVED';

export interface PerfilQA {
  id: string;
  email: string | null;
  nombre_completo: string;
  rol: 'ENTRENADOR' | 'ALUMNO' | 'ADMIN';
  estado_membresia: EstadoMembresiaQA;
  profesor_asignado_id: string | null;
  fecha_baja: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanEntrenamientoQA {
  id: string;
  profesor_id: string | null;
  alumno_id: string | null;
  nombre: string;
  estado: 'ACTIVO' | 'INACTIVO' | 'BORRADOR';
  comentarios: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiaRutinaQA {
  id: string;
  plan_id: string;
  nombre: string;
  orden: number;
  created_at: string;
  updated_at: string;
}

export interface EjercicioEnRutinaQA {
  id: string;
  dia_id: string;
  ejercicio_id: string;
  orden: number;
  series: number;
  repeticiones: string;
  descanso_segundos: number;
  rpe_objetivo: number | null;
  notas: string | null;
  es_superserie: boolean;
  grupo_superserie: number | null;
  created_at: string;
  updated_at: string;
}

export interface EntrenadorAlumnoQA {
  id: string;
  entrenador_id: string;
  alumno_id: string;
  rol_entrenador: string;
  es_principal: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Funciones de Lógica de Negocio y Simulación Matemática para QA
// ============================================================================

/**
 * Validador de política RLS para visualización de ejercicios de rutina:
 * Alumno en 'EXPIRED_PAYMENT_PENDING' tiene bloqueado el acceso.
 * Entrenadores y Admins mantienen visibilidad total.
 */
export function evaluateRutinaAccess(params: {
  userId: string;
  userRol: 'ENTRENADOR' | 'ALUMNO' | 'ADMIN';
  userMembresia?: EstadoMembresiaQA;
  alumnoId: string;
  profesorId: string | null;
  coachesAsignados?: EntrenadorAlumnoQA[];
}): { canViewExercises: boolean; reason: string } {
  const { userId, userRol, userMembresia, alumnoId, profesorId, coachesAsignados = [] } = params;

  if (userRol === 'ADMIN') {
    return { canViewExercises: true, reason: 'ADMIN_FULL_ACCESS' };
  }

  // Si es un entrenador asignado (directo o multi-coach)
  const isDirectCoach = profesorId === userId;
  const isMultiCoach = coachesAsignados.some(
    (c) => c.alumno_id === alumnoId && c.entrenador_id === userId
  );

  if (userRol === 'ENTRENADOR' && (isDirectCoach || isMultiCoach)) {
    return { canViewExercises: true, reason: 'COACH_MANAGEMENT_ACCESS' };
  }

  // Si es el alumno dueño de la rutina
  if (userRol === 'ALUMNO' && userId === alumnoId) {
    if (userMembresia === 'EXPIRED_PAYMENT_PENDING') {
      return { canViewExercises: false, reason: 'PAYWALL_EXPIRED_PAYMENT_PENDING' };
    }
    if (userMembresia === 'ACTIVE' || userMembresia === 'ACTIVA') {
      return { canViewExercises: true, reason: 'ACTIVE_SUBSCRIPTION_GRANTED' };
    }
    return { canViewExercises: false, reason: 'MEMBERSHIP_NOT_ACTIVE' };
  }

  return { canViewExercises: false, reason: 'UNAUTHORIZED' };
}

/**
 * Motor de clonación de rutinas que replica la especificación de la RPC clonar_plan_entrenamiento
 */
export function executeRoutineCloning(params: {
  planOrigen: PlanEntrenamientoQA;
  diasOrigen: DiaRutinaQA[];
  ejerciciosOrigen: EjercicioEnRutinaQA[];
  nuevoNombre?: string;
  profesorClonadorId: string;
}): {
  planClonado: PlanEntrenamientoQA;
  diasClonados: DiaRutinaQA[];
  ejerciciosClonados: EjercicioEnRutinaQA[];
} {
  const { planOrigen, diasOrigen, ejerciciosOrigen, nuevoNombre, profesorClonadorId } = params;
  const now = new Date().toISOString();
  const nuevoPlanId = `plan-clone-${Math.random().toString(36).slice(2, 9)}`;

  const planClonado: PlanEntrenamientoQA = {
    id: nuevoPlanId,
    profesor_id: profesorClonadorId,
    alumno_id: planOrigen.alumno_id,
    nombre: nuevoNombre?.trim() || `${planOrigen.nombre} (Copia)`,
    estado: 'BORRADOR', // Estado obligatorio para nuevo período
    comentarios: planOrigen.comentarios,
    fecha_inicio: now,
    fecha_fin: null,
    created_at: now,
    updated_at: now,
  };

  const diasClonados: DiaRutinaQA[] = [];
  const ejerciciosClonados: EjercicioEnRutinaQA[] = [];

  // Ordenar días estrictamente por su índice orden
  const diasOrdenados = [...diasOrigen].sort((a, b) => a.orden - b.orden);

  for (const dia of diasOrdenados) {
    const nuevoDiaId = `dia-clone-${Math.random().toString(36).slice(2, 9)}`;
    diasClonados.push({
      id: nuevoDiaId,
      plan_id: nuevoPlanId,
      nombre: dia.nombre,
      orden: dia.orden,
      created_at: now,
      updated_at: now,
    });

    const ejerciciosDelDia = ejerciciosOrigen
      .filter((e) => e.dia_id === dia.id)
      .sort((a, b) => a.orden - b.orden);

    for (const ej of ejerciciosDelDia) {
      ejerciciosClonados.push({
        id: `ej-clone-${Math.random().toString(36).slice(2, 9)}`,
        dia_id: nuevoDiaId,
        ejercicio_id: ej.ejercicio_id,
        orden: ej.orden,
        series: ej.series,
        repeticiones: ej.repeticiones,
        descanso_segundos: ej.descanso_segundos,
        rpe_objetivo: ej.rpe_objetivo,
        notas: ej.notas,
        es_superserie: ej.es_superserie,
        grupo_superserie: ej.grupo_superserie,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return { planClonado, diasClonados, ejerciciosClonados };
}

/**
 * Modelo de Temporizador con Delta de Timestamps Absolutos
 * Garantiza inmunidad ante suspensión de pestañas y throttling del navegador.
 */
export class BackgroundResilientTimer {
  private targetEndTime: number | null = null;
  private totalDurationMs: number = 0;
  private pausedRemainingMs: number | null = null;
  private isPaused: boolean = false;
  private isActive: boolean = false;
  private onCompleteCallback?: () => void;

  constructor(durationSeconds: number, onComplete?: () => void) {
    this.totalDurationMs = durationSeconds * 1000;
    this.onCompleteCallback = onComplete;
  }

  public start(currentTimeMs: number = Date.now()): void {
    this.targetEndTime = currentTimeMs + this.totalDurationMs;
    this.isActive = true;
    this.isPaused = false;
    this.pausedRemainingMs = null;
  }

  public pause(currentTimeMs: number = Date.now()): void {
    if (!this.isActive || this.isPaused || !this.targetEndTime) return;
    this.pausedRemainingMs = Math.max(0, this.targetEndTime - currentTimeMs);
    this.isPaused = true;
  }

  public resume(currentTimeMs: number = Date.now()): void {
    if (!this.isActive || !this.isPaused || this.pausedRemainingMs === null) return;
    this.targetEndTime = currentTimeMs + this.pausedRemainingMs;
    this.isPaused = false;
    this.pausedRemainingMs = null;
  }

  public addSeconds(seconds: number): void {
    if (!this.isActive || !this.targetEndTime) return;
    const addedMs = seconds * 1000;
    this.totalDurationMs += addedMs;
    if (this.isPaused && this.pausedRemainingMs !== null) {
      this.pausedRemainingMs += addedMs;
    } else {
      this.targetEndTime += addedMs;
    }
  }

  public getRemainingSeconds(currentTimeMs: number = Date.now()): number {
    if (!this.isActive) return 0;
    if (this.isPaused && this.pausedRemainingMs !== null) {
      return Math.ceil(this.pausedRemainingMs / 1000);
    }
    if (!this.targetEndTime) return 0;
    const diffMs = this.targetEndTime - currentTimeMs;
    if (diffMs <= 0) {
      if (this.isActive) {
        this.isActive = false;
        this.onCompleteCallback?.();
      }
      return 0;
    }
    return Math.ceil(diffMs / 1000);
  }

  public checkExpiration(currentTimeMs: number = Date.now()): boolean {
    return this.getRemainingSeconds(currentTimeMs) === 0;
  }
}

// ============================================================================
// SUITE QA OFICIAL: Sprint 2 (GOZSter Verification)
// ============================================================================

describe('GOZSter Sprint 2 QA Suite - Paywall, Clonación, Timers y Métricas (#12)', () => {
  // --------------------------------------------------------------------------
  // 1. Criterio Gherkin: Paywall de Suscripción y Ciclo de Vida del Alumno
  // --------------------------------------------------------------------------
  describe('Criterio 1: Lógica de Paywall (EXPIRED_PAYMENT_PENDING vs ACTIVE) y Multi-Coach', () => {
    const alumnoId = 'alumno-uuid-001';
    const coachPrincipalId = 'coach-uuid-principal';
    const coachFelixId = 'coach-uuid-felix';
    const ajenoId = 'usuario-ajeno-uuid';

    const coachesAsignados: EntrenadorAlumnoQA[] = [
      {
        id: 'rel-1',
        entrenador_id: coachPrincipalId,
        alumno_id: alumnoId,
        rol_entrenador: 'PRINCIPAL',
        es_principal: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'rel-2',
        entrenador_id: coachFelixId,
        alumno_id: alumnoId,
        rol_entrenador: 'COACH',
        es_principal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('GIVEN alumno en EXPIRED_PAYMENT_PENDING, WHEN intenta ver ejercicios, THEN acceso denegado por paywall', () => {
      const evaluation = evaluateRutinaAccess({
        userId: alumnoId,
        userRol: 'ALUMNO',
        userMembresia: 'EXPIRED_PAYMENT_PENDING',
        alumnoId,
        profesorId: coachPrincipalId,
        coachesAsignados,
      });

      expect(evaluation.canViewExercises).toBe(false);
      expect(evaluation.reason).toBe('PAYWALL_EXPIRED_PAYMENT_PENDING');
    });

    it('GIVEN alumno en ACTIVE, WHEN intenta ver ejercicios, THEN acceso total concedido', () => {
      const evaluation = evaluateRutinaAccess({
        userId: alumnoId,
        userRol: 'ALUMNO',
        userMembresia: 'ACTIVE',
        alumnoId,
        profesorId: coachPrincipalId,
        coachesAsignados,
      });

      expect(evaluation.canViewExercises).toBe(true);
      expect(evaluation.reason).toBe('ACTIVE_SUBSCRIPTION_GRANTED');
    });

    it('GIVEN alumno en EXPIRED_PAYMENT_PENDING, THEN los entrenadores asignados (Principal y Félix) mantienen visibilidad completa', () => {
      // Coach Principal
      const principalAccess = evaluateRutinaAccess({
        userId: coachPrincipalId,
        userRol: 'ENTRENADOR',
        userMembresia: 'ACTIVE',
        alumnoId,
        profesorId: coachPrincipalId,
        coachesAsignados,
      });
      expect(principalAccess.canViewExercises).toBe(true);
      expect(principalAccess.reason).toBe('COACH_MANAGEMENT_ACCESS');

      // Coach Félix (asignado como co-entrenador)
      const felixAccess = evaluateRutinaAccess({
        userId: coachFelixId,
        userRol: 'ENTRENADOR',
        userMembresia: 'ACTIVE',
        alumnoId,
        profesorId: coachPrincipalId,
        coachesAsignados,
      });
      expect(felixAccess.canViewExercises).toBe(true);
      expect(felixAccess.reason).toBe('COACH_MANAGEMENT_ACCESS');
    });

    it('bloquea a usuarios ajenos sin relación de tutoría con el alumno', () => {
      const ajenoAccess = evaluateRutinaAccess({
        userId: ajenoId,
        userRol: 'ENTRENADOR',
        userMembresia: 'ACTIVE',
        alumnoId,
        profesorId: coachPrincipalId,
        coachesAsignados,
      });
      expect(ajenoAccess.canViewExercises).toBe(false);
      expect(ajenoAccess.reason).toBe('UNAUTHORIZED');
    });

    it('garantiza la unicidad del cliente: mutar a EXPIRED_PAYMENT_PENDING preserva el ID del perfil', () => {
      const perfilInicial: PerfilQA = {
        id: alumnoId,
        email: 'atleta@gozster.fit',
        nombre_completo: 'Marcos Benítez',
        rol: 'ALUMNO',
        estado_membresia: 'ACTIVE',
        profesor_asignado_id: coachPrincipalId,
        fecha_baja: null,
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
      };

      // Vencimiento sin clonar registro en tabla de clientes
      const perfilVencido: PerfilQA = {
        ...perfilInicial,
        estado_membresia: 'EXPIRED_PAYMENT_PENDING',
        updated_at: new Date().toISOString(),
      };

      expect(perfilVencido.id).toBe(perfilInicial.id);
      expect(perfilVencido.email).toBe(perfilInicial.email);
      expect(perfilVencido.estado_membresia).toBe('EXPIRED_PAYMENT_PENDING');
      expect(perfilVencido.profesor_asignado_id).toBe(coachPrincipalId);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Criterio Gherkin: Integridad Estructural y Jerárquica de la Clonación
  // --------------------------------------------------------------------------
  describe('Criterio 2: Integridad de Clonación de Rutinas y Preservación de Superseries', () => {
    const planBase: PlanEntrenamientoQA = {
      id: 'plan-fuerza-001',
      profesor_id: 'coach-1',
      alumno_id: 'alumno-1',
      nombre: 'Bloque 1: Fuerza & Hipertrofia',
      estado: 'ACTIVO',
      comentarios: 'RPE 8-9 progresivo',
      fecha_inicio: '2026-09-01T00:00:00Z',
      fecha_fin: '2026-09-30T00:00:00Z',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    };

    const diasBase: DiaRutinaQA[] = [
      {
        id: 'dia-101',
        plan_id: 'plan-fuerza-001',
        nombre: 'Día 1: Empuje & Core',
        orden: 1,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'dia-102',
        plan_id: 'plan-fuerza-001',
        nombre: 'Día 2: Tracción & Pierna',
        orden: 2,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ];

    const ejerciciosBase: EjercicioEnRutinaQA[] = [
      // Día 1: Superserie A (Press Banca + Remo con Mancuernas)
      {
        id: 'ej-1',
        dia_id: 'dia-101',
        ejercicio_id: 'cat-press-banca',
        orden: 1,
        series: 4,
        repeticiones: '6-8',
        descanso_segundos: 90,
        rpe_objetivo: 8,
        notas: 'Tempo 3-0-1',
        es_superserie: true,
        grupo_superserie: 1,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'ej-2',
        dia_id: 'dia-101',
        ejercicio_id: 'cat-remo-mancuerna',
        orden: 2,
        series: 4,
        repeticiones: '8-10',
        descanso_segundos: 90,
        rpe_objetivo: 8,
        notas: 'Apoyo en banco inclinado',
        es_superserie: true,
        grupo_superserie: 1,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      // Día 1: Ejercicio Individual
      {
        id: 'ej-3',
        dia_id: 'dia-101',
        ejercicio_id: 'cat-press-militar',
        orden: 3,
        series: 3,
        repeticiones: '10',
        descanso_segundos: 60,
        rpe_objetivo: 7.5,
        notas: 'De pie con barra',
        es_superserie: false,
        grupo_superserie: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      // Día 2: Sentadilla
      {
        id: 'ej-4',
        dia_id: 'dia-102',
        ejercicio_id: 'cat-sentadilla',
        orden: 1,
        series: 5,
        repeticiones: '5',
        descanso_segundos: 180,
        rpe_objetivo: 8.5,
        notas: 'Fuerza máxima pura',
        es_superserie: false,
        grupo_superserie: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ];

    it('clona íntegramente la estructura: el nuevo plan inicia en estado BORRADOR', () => {
      const { planClonado, diasClonados, ejerciciosClonados } = executeRoutineCloning({
        planOrigen: planBase,
        diasOrigen: diasBase,
        ejerciciosOrigen: ejerciciosBase,
        nuevoNombre: 'Bloque 2: Progresión Cargas',
        profesorClonadorId: 'coach-felix',
      });

      expect(planClonado.id).not.toBe(planBase.id);
      expect(planClonado.estado).toBe('BORRADOR');
      expect(planClonado.nombre).toBe('Bloque 2: Progresión Cargas');
      expect(planClonado.profesor_id).toBe('coach-felix');
      expect(planClonado.alumno_id).toBe('alumno-1');

      expect(diasClonados).toHaveLength(2);
      expect(ejerciciosClonados).toHaveLength(4);
    });

    it('preserva con exactitud la asignación y agrupación de superseries en el nuevo plan', () => {
      const { diasClonados, ejerciciosClonados } = executeRoutineCloning({
        planOrigen: planBase,
        diasOrigen: diasBase,
        ejerciciosOrigen: ejerciciosBase,
        profesorClonadorId: 'coach-1',
      });

      const dia1Clonado = diasClonados.find((d) => d.orden === 1);
      expect(dia1Clonado).toBeDefined();

      const ejsDia1 = ejerciciosClonados.filter((e) => e.dia_id === dia1Clonado?.id);
      expect(ejsDia1).toHaveLength(3);

      // Ejercicios 1 y 2 deben formar exactamente la superserie del grupo 1
      const superserie = ejsDia1.filter((e) => e.es_superserie);
      expect(superserie).toHaveLength(2);
      expect(superserie[0]?.grupo_superserie).toBe(1);
      expect(superserie[1]?.grupo_superserie).toBe(1);
      expect(superserie[0]?.descanso_segundos).toBe(90);
      expect(superserie[1]?.descanso_segundos).toBe(90);

      // Ejercicio 3 no es superserie
      const individual = ejsDia1.find((e) => e.orden === 3);
      expect(individual?.es_superserie).toBe(false);
      expect(individual?.grupo_superserie).toBeNull();
    });

    it('asegura que las claves foráneas apunten a los nuevos IDs clonados (sin colisiones)', () => {
      const { planClonado, diasClonados, ejerciciosClonados } = executeRoutineCloning({
        planOrigen: planBase,
        diasOrigen: diasBase,
        ejerciciosOrigen: ejerciciosBase,
        profesorClonadorId: 'coach-1',
      });

      // Todos los días deben apuntar al nuevo plan
      for (const d of diasClonados) {
        expect(d.plan_id).toBe(planClonado.id);
        expect(d.id).not.toBe(diasBase[0]?.id);
        expect(d.id).not.toBe(diasBase[1]?.id);
      }

      // Todos los ejercicios deben apuntar a uno de los nuevos días clonados
      const idsDiasNuevos = new Set(diasClonados.map((d) => d.id));
      for (const ej of ejerciciosClonados) {
        expect(idsDiasNuevos.has(ej.dia_id)).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Criterio Gherkin: Precisión del Cronómetro ante Suspensión y Background
  // --------------------------------------------------------------------------
  describe('Criterio 3: Precisión Temporal del Cronómetro (Delta de Timestamps vs Throttling)', () => {
    it('demuestra la falla del modelo ingenuo (tick -= 1) ante suspensión de pestaña', () => {
      // Simulación de modelo ingenuo: cada tick resta 1s
      let naiveSecondsRemaining = 90;
      const ticksExecutedDuringSuspension = 2; // El navegador durmió la pestaña por 60s y solo ejecutó 2 ticks

      for (let i = 0; i < ticksExecutedDuringSuspension; i++) {
        naiveSecondsRemaining -= 1;
      }

      // Falla crítica: después de 60s reales, el timer ingenuo cree que aún faltan 88s (perdió 58s)
      expect(naiveSecondsRemaining).toBe(88);
      expect(90 - 60).toBe(30); // El valor matemáticamente correcto debería ser 30s
    });

    it('valida que el modelo de Delta de Timestamps mantenga precisión matemática exacta tras suspensión de 60s', () => {
      const onComplete = vi.fn();
      const timer = new BackgroundResilientTimer(90, onComplete);

      const startTime = 1_000_000;
      timer.start(startTime);

      // Verificación en t = 0
      expect(timer.getRemainingSeconds(startTime)).toBe(90);

      // Simulación de suspensión de pantalla / pestaña en background durante 60 segundos
      const wakeUpTime = startTime + 60_000; // Avanzan 60.000 ms reales

      // Sin importar cuántos ticks intermedios se perdieron, al despertar calcula exactamente 30s
      const remaining = timer.getRemainingSeconds(wakeUpTime);
      expect(remaining).toBe(30);
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('activa el callback de alerta sonora y háptica inmediatamente al expirar en background', () => {
      const onComplete = vi.fn();
      const timer = new BackgroundResilientTimer(90, onComplete);

      const startTime = 1_000_000;
      timer.start(startTime);

      // El usuario bloquea el móvil por 95 segundos
      const wakeUpAfterExpiry = startTime + 95_000;

      expect(timer.getRemainingSeconds(wakeUpAfterExpiry)).toBe(0);
      expect(timer.checkExpiration(wakeUpAfterExpiry)).toBe(true);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('maneja pausas y reanudaciones preservando los milisegundos restantes exactos', () => {
      const timer = new BackgroundResilientTimer(60);
      const t0 = 1_000_000;
      timer.start(t0);

      // Corre por 20 segundos
      const tPause = t0 + 20_000;
      expect(timer.getRemainingSeconds(tPause)).toBe(40);
      timer.pause(tPause);

      // Pasa en pausa durante 100 segundos
      const tResume = tPause + 100_000;
      expect(timer.getRemainingSeconds(tResume)).toBe(40); // Sigue en 40s
      timer.resume(tResume);

      // Corre 15 segundos más tras reanudar
      const tFinal = tResume + 15_000;
      expect(timer.getRemainingSeconds(tFinal)).toBe(25);
    });

    it('soporta adición de tiempo (+15s) extendiendo dinámicamente el timestamp objetivo', () => {
      const timer = new BackgroundResilientTimer(30);
      const t0 = 1_000_000;
      timer.start(t0);

      // Pasan 10 segundos -> quedan 20s
      expect(timer.getRemainingSeconds(t0 + 10_000)).toBe(20);

      // Atleta presiona +15s -> deben quedar 35s
      timer.addSeconds(15);
      expect(timer.getRemainingSeconds(t0 + 10_000)).toBe(35);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Criterio: Verificación Matemática Estricta de Fórmulas de Fuerza
  // --------------------------------------------------------------------------
  describe('Criterio 4: Verificación Matemática Estricta de 1RM y Tonelaje Semanal', () => {
    describe('Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)', () => {
      it('calcula 1RM para combinaciones de competición y fuerza estándar', () => {
        // 140 kg x 1 rep: 140 * (1 + 1/30) = 144.6667
        expect(calculateEpley1RM(140, 1)).toBeCloseTo(144.6667, 4);

        // 100 kg x 5 reps: 100 * (1 + 5/30) = 116.6667
        expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);

        // 80 kg x 10 reps: 80 * (1 + 10/30) = 106.6667
        expect(calculateEpley1RM(80, 10)).toBeCloseTo(106.6667, 4);

        // 60 kg x 15 reps: 60 * (1 + 15/30) = 90
        expect(calculateEpley1RM(60, 15)).toBe(90);
      });

      it('soporta cargas fraccionarias decimales (ej. discos de 1.25kg o 2.5kg)', () => {
        // 102.5 kg x 6 reps: 102.5 * (1 + 6/30) = 102.5 * 1.2 = 123
        expect(calculateEpley1RM(102.5, 6)).toBeCloseTo(123.0, 5);
      });

      it('protección estricta ante valores límite (0, negativos, NaN, Infinity)', () => {
        expect(calculateEpley1RM(0, 5)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(-100, 5)).toBe(0);
        expect(calculateEpley1RM(100, -5)).toBe(0);
        expect(calculateEpley1RM(Number.NaN, 5)).toBe(0);
        expect(calculateEpley1RM(100, Number.POSITIVE_INFINITY)).toBe(0);
      });
    });

    describe('Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)', () => {
      it('para 1 repetición pura devuelve exactamente el peso levantado (1RM = Peso / 1.0)', () => {
        // 100 / (1.0278 - 0.0278 * 1) = 100 / 1.0 = 100
        expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 5);
        expect(calculateBrzycki1RM(220, 1)).toBeCloseTo(220, 5);
      });

      it('calcula 1RM para 5 y 10 repeticiones estándar', () => {
        // 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.5113
        expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 4);

        // 80 / (1.0278 - 0.0278 * 10) = 80 / 0.7498 = 106.6951
        expect(calculateBrzycki1RM(80, 10)).toBeCloseTo(106.6951, 4);
      });

      it('previene asíntota y denominador no positivo en repeticiones elevadas (>= 37)', () => {
        // 1.0278 - 0.0278 * 37 = -0.0008 <= 0
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);
      });

      it('protección estricta ante valores límite (0, negativos, NaN, Infinity)', () => {
        expect(calculateBrzycki1RM(0, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, 0)).toBe(0);
        expect(calculateBrzycki1RM(-100, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, -5)).toBe(0);
        expect(calculateBrzycki1RM(Number.NaN, 5)).toBe(0);
      });
    });

    describe('Tonelaje Total Semanal: Σ (Series * Reps * Peso)', () => {
      it('calcula el tonelaje de un mesociclo completo con superseries', () => {
        const rutinaSemanal: VolumeBlock[] = [
          { series: 4, reps: 6, peso: 120 }, // 2880 kg (Sentadilla)
          { series: 4, reps: 8, peso: 90 },  // 2880 kg (Press Banca - Superserie)
          { series: 4, reps: 8, peso: 80 },  // 2560 kg (Remo - Superserie)
          { series: 3, reps: 10, peso: 50 }, // 1500 kg (Press Militar)
        ];
        // Total esperado: 2880 + 2880 + 2560 + 1500 = 9820 kg
        expect(calculateTotalTonnage(rutinaSemanal)).toBe(9820);
      });

      it('descarta de forma segura bloques nulos, negativos o con series/reps en 0', () => {
        const bloquesMixtos: VolumeBlock[] = [
          { series: 3, reps: 10, peso: 100 }, // 3000 kg válido
          { series: 0, reps: 10, peso: 100 }, // 0
          { series: 3, reps: 0, peso: 100 },  // 0
          { series: 3, reps: 10, peso: 0 },   // 0
          { series: -3, reps: 10, peso: 100 },// 0
          { series: 3, reps: -10, peso: 100 },// 0
          { series: 3, reps: 10, peso: -100 },// 0
        ];
        expect(calculateTotalTonnage(bloquesMixtos)).toBe(3000);
      });
    });
  });
});
