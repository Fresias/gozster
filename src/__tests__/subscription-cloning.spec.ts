import { describe, expect, it } from 'vitest';
import {
  canReadEjerciciosEnRutina,
  mutateAlumnoSubscriptionStatus,
  simulateClonarPlan,
  simulateExtenderVigenciaPlan,
} from '../../tests/subscription-cloning.spec';
import type { DiaRutina, EjercicioEnRutina, EntrenadorAlumno, PlanEntrenamiento } from '@/../types/database.types';

describe('Suite de Integración Vitest - Multi-Coach, Paywall y Clonación (src/__tests__)', () => {
  it('valida que el paywall bloquee alumnos en EXPIRED_PAYMENT_PENDING y habilite a entrenadores multi-coach', () => {
    const multiCoach: EntrenadorAlumno[] = [
      {
        id: '1',
        entrenador_id: 'coach-1',
        alumno_id: 'alumno-1',
        rol_entrenador: 'PRINCIPAL',
        es_principal: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        entrenador_id: 'coach-2',
        alumno_id: 'alumno-1',
        rol_entrenador: 'COACH',
        es_principal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    expect(
      canReadEjerciciosEnRutina({
        currentUserId: 'alumno-1',
        currentUserRol: 'ALUMNO',
        currentUserMembresia: 'EXPIRED_PAYMENT_PENDING',
        planAlumnoId: 'alumno-1',
        planProfesorId: 'coach-1',
        coachesAsignados: multiCoach,
      })
    ).toBe(false);

    expect(
      canReadEjerciciosEnRutina({
        currentUserId: 'alumno-1',
        currentUserRol: 'ALUMNO',
        currentUserMembresia: 'ACTIVE',
        planAlumnoId: 'alumno-1',
        planProfesorId: 'coach-1',
        coachesAsignados: multiCoach,
      })
    ).toBe(true);

    expect(
      canReadEjerciciosEnRutina({
        currentUserId: 'coach-2',
        currentUserRol: 'ENTRENADOR',
        planAlumnoId: 'alumno-1',
        planProfesorId: 'coach-1',
        coachesAsignados: multiCoach,
      })
    ).toBe(true);
  });

  it('valida clonación íntegra de plan a estado BORRADOR con superseries intactas', () => {
    const plan: PlanEntrenamiento = {
      id: 'p-orig',
      profesor_id: 'coach-1',
      alumno_id: 'alumno-1',
      nombre: 'Fuerza Mes 1',
      estado: 'ACTIVO',
      comentarios: 'Notas',
      fecha_inicio: new Date().toISOString(),
      fecha_fin: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const dias: DiaRutina[] = [
      {
        id: 'd-1',
        plan_id: 'p-orig',
        nombre: 'Día A',
        orden: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const ejercicios: EjercicioEnRutina[] = [
      {
        id: 'e-1',
        dia_id: 'd-1',
        ejercicio_id: 'ej-sentadilla',
        orden: 1,
        series: 5,
        repeticiones: '5',
        descanso_segundos: 180,
        rpe_objetivo: 8,
        notas: null,
        es_superserie: true,
        grupo_superserie: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const res = simulateClonarPlan({
      planOrigen: plan,
      diasOrigen: dias,
      ejerciciosOrigen: ejercicios,
      nuevoNombre: 'Fuerza Mes 2',
      callerId: 'coach-2',
    });

    expect(res.nuevoPlan.estado).toBe('BORRADOR');
    expect(res.nuevoPlan.nombre).toBe('Fuerza Mes 2');
    expect(res.nuevosDias[0]?.plan_id).toBe(res.nuevoPlan.id);
    expect(res.nuevosEjercicios[0]?.dia_id).toBe(res.nuevosDias[0]?.id);
    expect(res.nuevosEjercicios[0]?.es_superserie).toBe(true);
    expect(res.nuevosEjercicios[0]?.grupo_superserie).toBe(1);
  });
});
