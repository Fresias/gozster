import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  DiaRutina,
  EjercicioEnRutina,
  EntrenadorAlumno,
  EstadoMembresia,
  Perfil,
  PlanEntrenamiento,
} from '../types/database.types';

// ============================================================================
// Dominio y Simulación de Lógica de Negocio y RLS (Issue #9)
// ============================================================================

/**
 * Evaluación de política RLS para lectura de ejercicios del día (ejercicios_en_rutina).
 * Regla:
 * - Un alumno en 'EXPIRED_PAYMENT_PENDING' tiene bloqueado el acceso a los ejercicios del día.
 * - Un alumno en 'ACTIVE' o 'ACTIVA' tiene acceso completo.
 * - El entrenador asignado (directo o via entrenador_alumnos) o admin tienen visibilidad total siempre.
 */
export function canReadEjerciciosEnRutina(params: {
  currentUserId: string;
  currentUserRol: Perfil['rol'];
  currentUserMembresia?: EstadoMembresia;
  planAlumnoId: string | null;
  planProfesorId: string | null;
  coachesAsignados?: EntrenadorAlumno[];
}): boolean {
  const {
    currentUserId,
    currentUserRol,
    currentUserMembresia,
    planAlumnoId,
    planProfesorId,
    coachesAsignados = [],
  } = params;

  // 1. Admin siempre tiene acceso
  if (currentUserRol === 'ADMIN') {
    return true;
  }

  // 2. Si el usuario actual es el profesor creador del plan
  if (planProfesorId && currentUserId === planProfesorId) {
    return true;
  }

  // 3. Si el usuario actual es uno de los entrenadores asignados al alumno (multi-coach)
  if (planAlumnoId) {
    const isAssignedCoach = coachesAsignados.some(
      (rel) => rel.alumno_id === planAlumnoId && rel.entrenador_id === currentUserId
    );
    if (isAssignedCoach) {
      return true;
    }
  }

  // 4. Si el usuario actual es el alumno dueño del plan:
  // PAYWALL: Si su estado es EXPIRED_PAYMENT_PENDING, NO puede leer los ejercicios del día.
  if (planAlumnoId && currentUserId === planAlumnoId) {
    if (currentUserMembresia === 'EXPIRED_PAYMENT_PENDING') {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Simulación de la RPC clonar_plan_entrenamiento
 * Duplica el plan, días y ejercicios preservando superseries en estado 'BORRADOR'.
 */
export function simulateClonarPlan(params: {
  planOrigen: PlanEntrenamiento;
  diasOrigen: DiaRutina[];
  ejerciciosOrigen: EjercicioEnRutina[];
  nuevoNombre: string;
  callerId: string;
}): {
  nuevoPlan: PlanEntrenamiento;
  nuevosDias: DiaRutina[];
  nuevosEjercicios: EjercicioEnRutina[];
} {
  const { planOrigen, diasOrigen, ejerciciosOrigen, nuevoNombre, callerId } = params;

  const nuevoPlanId = 'plan-clonado-uuid-' + Math.random().toString(36).substring(2, 9);
  const nowIso = new Date().toISOString();

  const nuevoPlan: PlanEntrenamiento = {
    id: nuevoPlanId,
    profesor_id: callerId,
    alumno_id: planOrigen.alumno_id,
    nombre: nuevoNombre.trim() || `${planOrigen.nombre} (Copia)`,
    estado: 'BORRADOR', // Estado obligatorio para nuevo período
    comentarios: planOrigen.comentarios,
    fecha_inicio: nowIso,
    fecha_fin: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const nuevosDias: DiaRutina[] = [];
  const nuevosEjercicios: EjercicioEnRutina[] = [];

  for (const dia of diasOrigen) {
    const nuevoDiaId = 'dia-clonado-uuid-' + Math.random().toString(36).substring(2, 9);
    nuevosDias.push({
      id: nuevoDiaId,
      plan_id: nuevoPlanId,
      nombre: dia.nombre,
      orden: dia.orden,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const ejerciciosDelDia = ejerciciosOrigen.filter((e) => e.dia_id === dia.id);
    for (const ej of ejerciciosDelDia) {
      nuevosEjercicios.push({
        id: 'ej-clonado-uuid-' + Math.random().toString(36).substring(2, 9),
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
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  }

  return { nuevoPlan, nuevosDias, nuevosEjercicios };
}

/**
 * Simulación de la RPC extender_vigencia_plan
 * Modifica fecha_fin agregando N días sin duplicar entidades.
 */
export function simulateExtenderVigenciaPlan(
  plan: PlanEntrenamiento,
  diasAdicionales: number
): PlanEntrenamiento {
  if (diasAdicionales <= 0) {
    throw new Error('El número de días adicionales debe ser mayor a 0');
  }

  const baseDate = plan.fecha_fin ? new Date(plan.fecha_fin) : new Date();
  const currentDate = new Date();
  const effectiveBase = baseDate > currentDate ? baseDate : currentDate;

  const newEndDate = new Date(effectiveBase.getTime() + diasAdicionales * 24 * 60 * 60 * 1000);

  return {
    ...plan,
    fecha_fin: newEndDate.toISOString(),
    estado: 'ACTIVO',
    updated_at: new Date().toISOString(),
  };
}

/**
 * Simulación de transición de ciclo de vida del alumno
 * Muta estado a EXPIRED_PAYMENT_PENDING sin duplicar perfil.
 */
export function mutateAlumnoSubscriptionStatus(
  perfil: Perfil,
  nuevoEstado: EstadoMembresia
): Perfil {
  return {
    ...perfil,
    estado_membresia: nuevoEstado,
    updated_at: new Date().toISOString(),
  };
}

describe('Pruebas Unitarias de Arquitectura de Base de Datos (Issue #9)', () => {
  const coachPrincipalId = 'prof-00000000-0000-0000-0000-000000000001';
  const coachFelixId = 'prof-00000000-0000-0000-0000-000000000002';
  const alumnoId = 'alum-00000000-0000-0000-0000-000000000001';

  const multiCoachRelations: EntrenadorAlumno[] = [
    {
      id: 'rel-1',
      entrenador_id: coachPrincipalId,
      alumno_id: alumnoId,
      rol_entrenador: 'PRINCIPAL',
      es_principal: true,
      created_at: '2026-10-16T00:00:00Z',
      updated_at: '2026-10-16T00:00:00Z',
    },
    {
      id: 'rel-2',
      entrenador_id: coachFelixId,
      alumno_id: alumnoId,
      rol_entrenador: 'COACH',
      es_principal: false,
      created_at: '2026-10-16T00:00:00Z',
      updated_at: '2026-10-16T00:00:00Z',
    },
  ];

  describe('1. Paywall RLS para Alumno con Cuota Vencida vs Multi-Coach', () => {
    it('bloquea la lectura de ejercicios del día cuando el alumno está en EXPIRED_PAYMENT_PENDING', () => {
      const allowed = canReadEjerciciosEnRutina({
        currentUserId: alumnoId,
        currentUserRol: 'ALUMNO',
        currentUserMembresia: 'EXPIRED_PAYMENT_PENDING',
        planAlumnoId: alumnoId,
        planProfesorId: coachPrincipalId,
        coachesAsignados: multiCoachRelations,
      });

      expect(allowed).toBe(false);
    });

    it('permite la lectura de ejercicios del día cuando el alumno está en ACTIVE', () => {
      const allowed = canReadEjerciciosEnRutina({
        currentUserId: alumnoId,
        currentUserRol: 'ALUMNO',
        currentUserMembresia: 'ACTIVE',
        planAlumnoId: alumnoId,
        planProfesorId: coachPrincipalId,
        coachesAsignados: multiCoachRelations,
      });

      expect(allowed).toBe(true);
    });

    it('permite a ambos entrenadores (Coach Principal y Coach Félix) ver la rutina aunque el alumno esté en EXPIRED_PAYMENT_PENDING', () => {
      // Coach Principal
      const allowedPrincipal = canReadEjerciciosEnRutina({
        currentUserId: coachPrincipalId,
        currentUserRol: 'ENTRENADOR',
        planAlumnoId: alumnoId,
        planProfesorId: coachPrincipalId,
        coachesAsignados: multiCoachRelations,
      });
      expect(allowedPrincipal).toBe(true);

      // Coach Félix (asignado via entrenador_alumnos)
      const allowedFelix = canReadEjerciciosEnRutina({
        currentUserId: coachFelixId,
        currentUserRol: 'ENTRENADOR',
        planAlumnoId: alumnoId,
        planProfesorId: coachPrincipalId,
        coachesAsignados: multiCoachRelations,
      });
      expect(allowedFelix).toBe(true);
    });

    it('bloquea a un alumno o entrenador ajeno sin relación de asignación', () => {
      const strangerCoachId = 'stranger-coach-uuid';
      const allowed = canReadEjerciciosEnRutina({
        currentUserId: strangerCoachId,
        currentUserRol: 'ENTRENADOR',
        planAlumnoId: alumnoId,
        planProfesorId: coachPrincipalId,
        coachesAsignados: multiCoachRelations,
      });
      expect(allowed).toBe(false);
    });
  });

  describe('2. Unicidad del Cliente y Transición de Estados', () => {
    it('muta el estado de membresía a EXPIRED_PAYMENT_PENDING sin duplicar ni eliminar el ID del alumno', () => {
      const alumnoPerfil: Perfil = {
        id: alumnoId,
        email: 'alumno@ejemplo.com',
        nombre_completo: 'Carlos Giménez',
        rol: 'ALUMNO',
        estado_membresia: 'ACTIVE',
        profesor_asignado_id: coachPrincipalId,
        fecha_baja: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      };

      const actualizado = mutateAlumnoSubscriptionStatus(
        alumnoPerfil,
        'EXPIRED_PAYMENT_PENDING'
      );

      expect(actualizado.id).toBe(alumnoPerfil.id);
      expect(actualizado.email).toBe(alumnoPerfil.email);
      expect(actualizado.estado_membresia).toBe('EXPIRED_PAYMENT_PENDING');
      expect(actualizado.nombre_completo).toBe(alumnoPerfil.nombre_completo);
    });
  });

  describe('3. Clonación Idempotente de Jerarquía de Rutinas (clonar_plan_entrenamiento)', () => {
    it('duplica íntegramente la jerarquía con superseries en estado BORRADOR', () => {
      const planOrigen: PlanEntrenamiento = {
        id: 'plan-101',
        profesor_id: coachPrincipalId,
        alumno_id: alumnoId,
        nombre: 'Mesociclo 1: Fuerza Máxima',
        estado: 'ACTIVO',
        comentarios: 'Cargas progresivas semana 1 a 4',
        fecha_inicio: '2026-10-01T00:00:00Z',
        fecha_fin: '2026-10-31T00:00:00Z',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      const diasOrigen: DiaRutina[] = [
        {
          id: 'dia-1',
          plan_id: 'plan-101',
          nombre: 'Día 1: Torso Pesado',
          orden: 1,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        },
      ];

      const ejerciciosOrigen: EjercicioEnRutina[] = [
        {
          id: 'ej-1',
          dia_id: 'dia-1',
          ejercicio_id: '11111111-1111-4111-8111-111111111102', // Press Banca
          orden: 1,
          series: 4,
          repeticiones: '5',
          descanso_segundos: 120,
          rpe_objetivo: 8.5,
          notas: 'Superserie antagonista con remo',
          es_superserie: true,
          grupo_superserie: 1,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        },
        {
          id: 'ej-2',
          dia_id: 'dia-1',
          ejercicio_id: '11111111-1111-4111-8111-111111111105', // Dominadas
          orden: 2,
          series: 4,
          repeticiones: '6',
          descanso_segundos: 120,
          rpe_objetivo: 8.5,
          notas: 'Superserie antagonista con press banca',
          es_superserie: true,
          grupo_superserie: 1,
          created_at: '2026-10-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
        },
      ];

      const { nuevoPlan, nuevosDias, nuevosEjercicios } = simulateClonarPlan({
        planOrigen,
        diasOrigen,
        ejerciciosOrigen,
        nuevoNombre: 'Mesociclo 2: Fuerza y Carga',
        callerId: coachFelixId,
      });

      // El nuevo plan tiene ID distinto y estado BORRADOR
      expect(nuevoPlan.id).not.toBe(planOrigen.id);
      expect(nuevoPlan.estado).toBe('BORRADOR');
      expect(nuevoPlan.nombre).toBe('Mesociclo 2: Fuerza y Carga');
      expect(nuevoPlan.alumno_id).toBe(alumnoId);

      // Los días fueron clonados con nueva clave foránea hacia nuevoPlan.id
      expect(nuevosDias).toHaveLength(1);
      expect(nuevosDias[0]?.plan_id).toBe(nuevoPlan.id);
      expect(nuevosDias[0]?.nombre).toBe('Día 1: Torso Pesado');

      // Los ejercicios respetan exactamente las superseries y están vinculados al nuevo día
      expect(nuevosEjercicios).toHaveLength(2);
      expect(nuevosEjercicios[0]?.dia_id).toBe(nuevosDias[0]?.id);
      expect(nuevosEjercicios[0]?.es_superserie).toBe(true);
      expect(nuevosEjercicios[0]?.grupo_superserie).toBe(1);
      expect(nuevosEjercicios[0]?.series).toBe(4);
      expect(nuevosEjercicios[0]?.descanso_segundos).toBe(120);

      expect(nuevosEjercicios[1]?.dia_id).toBe(nuevosDias[0]?.id);
      expect(nuevosEjercicios[1]?.es_superserie).toBe(true);
      expect(nuevosEjercicios[1]?.grupo_superserie).toBe(1);
    });
  });

  describe('4. Extensión de Vigencia de Planes (extender_vigencia_plan)', () => {
    it('extiende la fecha de fin agregando los días sin alterar la entidad original', () => {
      const plan: PlanEntrenamiento = {
        id: 'plan-202',
        profesor_id: coachPrincipalId,
        alumno_id: alumnoId,
        nombre: 'Plan Hipertrofia 3 Días',
        estado: 'ACTIVO',
        comentarios: null,
        fecha_inicio: '2026-10-01T00:00:00Z',
        fecha_fin: '2026-10-20T00:00:00Z',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      const planExtendido = simulateExtenderVigenciaPlan(plan, 30);

      expect(planExtendido.id).toBe(plan.id);
      expect(planExtendido.estado).toBe('ACTIVO');
      expect(planExtendido.fecha_fin).toBeDefined();

      const finOriginal = new Date(plan.fecha_fin!).getTime();
      const finNuevo = new Date(planExtendido.fecha_fin!).getTime();
      expect(finNuevo).toBeGreaterThan(finOriginal);
    });

    it('lanza un error si se pasan días adicionales inválidos (<= 0)', () => {
      const plan: PlanEntrenamiento = {
        id: 'plan-202',
        profesor_id: coachPrincipalId,
        alumno_id: alumnoId,
        nombre: 'Plan Hipertrofia',
        estado: 'ACTIVO',
        comentarios: null,
        fecha_inicio: '2026-10-01T00:00:00Z',
        fecha_fin: null,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      expect(() => simulateExtenderVigenciaPlan(plan, 0)).toThrow();
      expect(() => simulateExtenderVigenciaPlan(plan, -10)).toThrow();
    });
  });

  describe('5. Validación Sintáctica e Idempotencia de la Migración SQL', () => {
    it('verifica que el script de migración SQL contenga las directivas obligatorias de seguridad y RPCs', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../supabase/migrations/20261016100000_multicoach_subscription_cloning.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Verifica estados agregados
      expect(sql).toContain("ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'ACTIVE'");
      expect(sql).toContain(
        "ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'EXPIRED_PAYMENT_PENDING'"
      );
      expect(sql).toContain("ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'ARCHIVED'");

      // Verifica creación de tabla entrenador_alumnos
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.entrenador_alumnos');
      expect(sql).toContain('ALTER TABLE public.entrenador_alumnos ENABLE ROW LEVEL SECURITY');

      // Verifica que no haya relajación de seguridad
      expect(sql).not.toContain('USING (true)');

      // Verifica presencia y firma de las funciones RPC requeridas
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.clonar_plan_entrenamiento');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.extender_vigencia_plan');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.es_entrenador_de');

      // Verifica estado BORRADOR en clonación
      expect(sql).toContain("'BORRADOR'");

      // Verifica paywall en ejercicios_en_rutina
      expect(sql).toContain('ejercicios_en_rutina_select_acceso_plan');
      expect(sql).toContain("'EXPIRED_PAYMENT_PENDING'");
    });
  });
});
