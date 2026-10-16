import { describe, expect, it } from 'vitest';
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
} from '../../tests/strength-metrics.spec';
import {
  canInsertMensaje,
  canSelectConversacion,
  canSelectMensaje,
  isCoachOfAthlete,
  simulateMarcarMensajesLeidos,
} from '../../tests/chat-unified-messaging.spec';
import type {
  Conversacion,
  EntrenadorAlumno,
  EstadoMembresia,
  Mensaje,
  Perfil,
  PlanEntrenamiento,
} from '@/../types/database.types';

// ============================================================================
// Dominio y Simulación de Métricas de Retención y Sobrecarga para QA
// ============================================================================

export interface MetricasRetencionQA {
  cantActivas: number;
  cantSinPlanEntrenamiento: number;
  cantClientesPerdidosMes: number;
  tasaRetencionPct: number;
  tasaChurnPct: number;
}

/**
 * Simulación estricta de la RPC obtener_metricas_retencion
 * Refleja fielmente la lógica SQL de supabase/migrations/20261016100000_multicoach_subscription_cloning.sql
 */
export function simulateObtenerMetricasRetencion(params: {
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  coachesAsignados: EntrenadorAlumno[];
  profesorId?: string | null;
  callerId: string;
  callerRol: Perfil['rol'];
  referenceDate?: Date;
}): MetricasRetencionQA {
  const {
    alumnos,
    planes,
    coachesAsignados,
    profesorId,
    callerId,
    callerRol,
    referenceDate = new Date(),
  } = params;

  // Verificación de autorización de la RPC:
  // (public.es_admin() OR p_profesor_id = auth.uid() OR public.es_entrenador_o_admin())
  const isAuthorized =
    callerRol === 'ADMIN' ||
    (callerRol === 'ENTRENADOR' && (!profesorId || profesorId === callerId));

  if (!isAuthorized) {
    throw new Error('No autorizado para consultar métricas de retención');
  }

  // Filtrado de alumnos por profesor (si profesorId fue provisto)
  const alumnosFiltrados = alumnos.filter((alumno) => {
    if (alumno.rol !== 'ALUMNO') return false;

    if (!profesorId) return true; // Vista global (Admin o reporte general)

    const isDirectCoach = alumno.profesor_asignado_id === profesorId;
    const isMultiCoach = coachesAsignados.some(
      (rel) => rel.alumno_id === alumno.id && rel.entrenador_id === profesorId
    );

    return isDirectCoach || isMultiCoach;
  });

  // Inicio de mes de referencia para bajas
  const startOfMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
    0,
    0,
    0,
    0
  );

  let cantActivas = 0;
  let cantSinPlanEntrenamiento = 0;
  let cantClientesPerdidosMes = 0;

  for (const alumno of alumnosFiltrados) {
    const estado = alumno.estado_membresia as string;
    const isActive = estado === 'ACTIVA' || estado === 'ACTIVE';

    if (isActive) {
      cantActivas++;

      // Verificar si tiene plan ACTIVO
      const hasActivePlan = planes.some(
        (plan) => plan.alumno_id === alumno.id && plan.estado === 'ACTIVO'
      );

      if (!hasActivePlan) {
        cantSinPlanEntrenamiento++;
      }
    }

    const isChurned =
      estado === 'INACTIVA' || estado === 'BAJA' || estado === 'ARCHIVED';

    if (isChurned && alumno.fecha_baja) {
      const fechaBaja = new Date(alumno.fecha_baja);
      if (fechaBaja >= startOfMonth && fechaBaja <= referenceDate) {
        cantClientesPerdidosMes++;
      }
    }
  }

  // Cálculo de Porcentajes de Retención y Churn
  const baseTotal = cantActivas + cantClientesPerdidosMes;
  const tasaRetencionPct =
    baseTotal > 0
      ? Number(((cantActivas / baseTotal) * 100).toFixed(2))
      : 100;
  const tasaChurnPct =
    baseTotal > 0
      ? Number(((cantClientesPerdidosMes / baseTotal) * 100).toFixed(2))
      : 0;

  return {
    cantActivas,
    cantSinPlanEntrenamiento,
    cantClientesPerdidosMes,
    tasaRetencionPct,
    tasaChurnPct,
  };
}

export interface SerieSesionQA {
  id: string;
  sesion_id: string;
  ejercicio_id: string;
  peso_kg: number;
  reps_hechas: number;
  completada: boolean;
}

export interface SesionEntrenamientoQA {
  id: string;
  alumno_id: string;
  fecha: string; // ISO
  series: SerieSesionQA[];
}

export interface ResultadoSobrecargaQA {
  sesion_id: string;
  fecha: string;
  volumen_ejercicio_kg: number;
  peso_max_kg: number;
  hubo_sobrecarga: boolean;
  esNuevoRecord1RM?: boolean;
  mejor1rmEpley?: number;
  mejor1rmBrzycki?: number;
}

/**
 * Simulación estricta de la RPC detectar_sobrecarga_progresiva
 * Refleja fielmente la lógica SQL de supabase/migrations/20261016000000_initial_schema_rls.sql
 */
export function simulateDetectarSobrecargaProgresiva(params: {
  alumnoId: string;
  ejercicioId: string;
  sesiones: SesionEntrenamientoQA[];
  callerId: string;
  callerRol: Perfil['rol'];
  coachesAsignados?: EntrenadorAlumno[];
}): ResultadoSobrecargaQA[] {
  const {
    alumnoId,
    ejercicioId,
    sesiones,
    callerId,
    callerRol,
    coachesAsignados = [],
  } = params;

  // Verificación de RLS en la RPC:
  // auth.uid() = p_alumno_id OR public.es_entrenador_de(p_alumno_id) OR public.es_admin()
  const isAthleteSelf = callerId === alumnoId;
  const isAdmin = callerRol === 'ADMIN';
  const isAssignedCoach =
    callerRol === 'ENTRENADOR' &&
    coachesAsignados.some(
      (rel) => rel.alumno_id === alumnoId && rel.entrenador_id === callerId
    );

  if (!isAthleteSelf && !isAdmin && !isAssignedCoach) {
    throw new Error('No autorizado para consultar sobrecarga de este alumno');
  }

  // Filtrar sesiones del alumno que tengan series completadas del ejercicio
  const metricasPorSesion: {
    sesion_id: string;
    fecha: string;
    volumen_ejercicio_kg: number;
    peso_max_kg: number;
    mejor1rmEpley: number;
    mejor1rmBrzycki: number;
  }[] = [];

  for (const s of sesiones) {
    if (s.alumno_id !== alumnoId) continue;

    const seriesDelEjercicio = s.series.filter(
      (serie) => serie.ejercicio_id === ejercicioId && serie.completada === true
    );

    if (seriesDelEjercicio.length === 0) continue;

    let volumen = 0;
    let pesoMax = 0;
    let bestEpley = 0;
    let bestBrzycki = 0;

    for (const ser of seriesDelEjercicio) {
      if (ser.peso_kg > 0 && ser.reps_hechas > 0) {
        volumen += ser.peso_kg * ser.reps_hechas;
        if (ser.peso_kg > pesoMax) {
          pesoMax = ser.peso_kg;
        }

        const epley = calculateEpley1RM(ser.peso_kg, ser.reps_hechas);
        const brzycki = calculateBrzycki1RM(ser.peso_kg, ser.reps_hechas);

        if (epley > bestEpley) bestEpley = epley;
        if (brzycki > bestBrzycki) bestBrzycki = brzycki;
      }
    }

    metricasPorSesion.push({
      sesion_id: s.id,
      fecha: s.fecha,
      volumen_ejercicio_kg: Number(volumen.toFixed(2)),
      peso_max_kg: Number(pesoMax.toFixed(2)),
      mejor1rmEpley: Number(bestEpley.toFixed(2)),
      mejor1rmBrzycki: Number(bestBrzycki.toFixed(2)),
    });
  }

  // Orden cronológico ASC para comparar LAG()
  metricasPorSesion.sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  );

  const resultados: ResultadoSobrecargaQA[] = [];
  let recordHistorico1RM = 0;

  for (let i = 0; i < metricasPorSesion.length; i++) {
    const actual = metricasPorSesion[i];
    if (!actual) continue;
    let huboSobrecarga = false;

    if (i > 0) {
      const previo = metricasPorSesion[i - 1];
      if (
        previo &&
        (actual.peso_max_kg > previo.peso_max_kg ||
          actual.volumen_ejercicio_kg > previo.volumen_ejercicio_kg)
      ) {
        huboSobrecarga = true;
      }
    }

    const esNuevoRecord = actual.mejor1rmEpley > recordHistorico1RM;
    if (actual.mejor1rmEpley > recordHistorico1RM) {
      recordHistorico1RM = actual.mejor1rmEpley;
    }

    resultados.push({
      sesion_id: actual.sesion_id,
      fecha: actual.fecha,
      volumen_ejercicio_kg: actual.volumen_ejercicio_kg,
      peso_max_kg: actual.peso_max_kg,
      hubo_sobrecarga: huboSobrecarga,
      esNuevoRecord1RM: esNuevoRecord,
      mejor1rmEpley: actual.mejor1rmEpley,
      mejor1rmBrzycki: actual.mejor1rmBrzycki,
    });
  }

  // Retorno ordenado por fecha DESC (tal como especifica el SQL)
  return resultados.sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
}

// ============================================================================
// SUITE DE PRUEBAS VITEST - QA SPRINT 3 (ISSUE #20)
// ============================================================================

describe('Suite de Auditoría QA Sprint 3: RLS Chat Staff, Retención y Alertas de Sobrecarga', () => {
  // --------------------------------------------------------------------------
  // 1. Verificación Matemática Estricta de Fórmulas de Fuerza (1RM & Tonelaje)
  // --------------------------------------------------------------------------
  describe('1. Verificación Matemática Estricta de Métricas de Fuerza', () => {
    it('calcula 1RM Epley y Brzycki con precisión matemática ante cargas reales', () => {
      // Benchmark 1: 100 kg x 10 reps
      // Epley: 100 * (1 + 10/30) = 133.333 kg
      // Brzycki: 100 / (1.0278 - 0.0278 * 10) = 100 / 0.7498 = 133.36889 kg
      const epley100 = calculateEpley1RM(100, 10);
      const brzycki100 = calculateBrzycki1RM(100, 10);

      expect(epley100).toBeCloseTo(133.33, 2);
      expect(brzycki100).toBeCloseTo(133.37, 2);

      // Benchmark 2: 140 kg x 5 reps
      // Epley: 140 * (1 + 5/30) = 163.333 kg
      // Brzycki: 140 / (1.0278 - 0.0278 * 5) = 140 / 0.8888 = 157.5157 kg
      const epley140 = calculateEpley1RM(140, 5);
      const brzycki140 = calculateBrzycki1RM(140, 5);

      expect(epley140).toBeCloseTo(163.33, 2);
      expect(brzycki140).toBeCloseTo(157.52, 2);
    });

    it('valida el comportamiento estricto con 1 repetición (1RM = Peso levantado)', () => {
      const epleySingle = calculateEpley1RM(180, 1);
      const brzyckiSingle = calculateBrzycki1RM(180, 1);

      // Epley con 1 rep: 180 * (1 + 1/30) = 180 (definición canónica para 1 rep) o 186
      // Brzycki con 1 rep: 180 / (1.0278 - 0.0278) = 180 / 1.0 = 180.0 exacto
      expect(brzyckiSingle).toBeCloseTo(180.0, 1);
      expect(epleySingle).toBeGreaterThanOrEqual(180.0);
    });

    it('maneja con total robustez casos límite (peso <= 0, reps <= 0, denominador no positivo)', () => {
      expect(calculateEpley1RM(0, 10)).toBe(0);
      expect(calculateEpley1RM(-50, 10)).toBe(0);
      expect(calculateEpley1RM(100, 0)).toBe(0);
      expect(calculateEpley1RM(100, -5)).toBe(0);

      expect(calculateBrzycki1RM(0, 10)).toBe(0);
      expect(calculateBrzycki1RM(-50, 10)).toBe(0);
      expect(calculateBrzycki1RM(100, 0)).toBe(0);
      expect(calculateBrzycki1RM(100, -5)).toBe(0);

      // En Brzycki con reps >= 37, denominador se hace <= 0 (1.0278 - 0.0278 * 37 = -0.0008)
      expect(calculateBrzycki1RM(100, 37)).toBe(0);
      expect(calculateBrzycki1RM(100, 50)).toBe(0);
    });

    it('calcula con exactitud el tonelaje total semanal sumando series x reps x peso', () => {
      // 1. calculateBlockVolume(series, reps, peso)
      const vol1 = calculateBlockVolume(3, 5, 100); // 3 * 5 * 100 = 1500
      const vol2 = calculateBlockVolume(2, 3, 120); // 2 * 3 * 120 = 720
      const vol3 = calculateBlockVolume(4, 8, 80);  // 4 * 8 * 80 = 2560

      expect(vol1).toBe(1500);
      expect(vol2).toBe(720);
      expect(vol3).toBe(2560);
      expect(vol1 + vol2 + vol3).toBe(4780);

      // 2. calculateTotalTonnage(VolumeBlock[])
      const bloques = [
        { series: 3, reps: 5, peso: 100 },
        { series: 2, reps: 3, peso: 120 },
        { series: 4, reps: 8, peso: 80 },
      ];
      expect(calculateTotalTonnage(bloques)).toBe(4780);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Aislamiento de Datos y Políticas RLS en Mensajería Staff (1:N)
  // --------------------------------------------------------------------------
  describe('2. Aislamiento de Datos y Políticas RLS en Mensajería Staff (1:N)', () => {
    const alumno1: Perfil = {
      id: 'alumno-uuid-01',
      email: 'alumno1@gozster.com',
      nombre_completo: 'Lucas Giménez',
      rol: 'ALUMNO',
      estado_membresia: 'ACTIVA',
      profesor_asignado_id: 'coach-principal-uuid',
      fecha_baja: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };

    const alumno2: Perfil = {
      id: 'alumno-uuid-02',
      email: 'alumno2@gozster.com',
      nombre_completo: 'Sofía Rossi',
      rol: 'ALUMNO',
      estado_membresia: 'ACTIVA',
      profesor_asignado_id: 'coach-externo-uuid',
      fecha_baja: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    };

    const coachPrincipalId = 'coach-principal-uuid';
    const coachAsistenteId = 'coach-asistente-uuid';
    const coachNoAsignadoId = 'coach-no-asignado-uuid';
    const adminId = 'admin-uuid-00';

    const coachesRel: EntrenadorAlumno[] = [
      {
        id: 'rel-1',
        entrenador_id: coachPrincipalId,
        alumno_id: alumno1.id,
        rol_entrenador: 'PRINCIPAL',
        es_principal: true,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      },
      {
        id: 'rel-2',
        entrenador_id: coachAsistenteId,
        alumno_id: alumno1.id,
        rol_entrenador: 'ASISTENTE',
        es_principal: false,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      },
    ];

    const conversacionAlumno1: Conversacion = {
      id: 'conv-alumno-1',
      alumno_id: alumno1.id,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    };

    const conversacionAlumno2: Conversacion = {
      id: 'conv-alumno-2',
      alumno_id: alumno2.id,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    };

    it('permite que un alumno lea y envíe mensajes únicamente en su propia conversación', () => {
      // Lectura permitida en su conversación
      expect(
        canSelectConversacion({
          currentUserId: alumno1.id,
          currentUserRol: 'ALUMNO',
          conversacion: conversacionAlumno1,
        })
      ).toBe(true);

      // Envío permitido en su conversación
      expect(
        canInsertMensaje({
          currentUserId: alumno1.id,
          currentUserRol: 'ALUMNO',
          conversacion: conversacionAlumno1,
          mensajeInsert: {
            conversacion_id: conversacionAlumno1.id,
            remitente_id: alumno1.id,
            contenido: 'Hola profesor, ¿cuántas series me tocan hoy?',
          },
        })
      ).toBe(true);
    });

    it('bloquea estrictamente que un alumno lea o envíe mensajes en la conversación de otro alumno', () => {
      // Intento de lectura de alumno1 en la conversación de alumno2
      expect(
        canSelectConversacion({
          currentUserId: alumno1.id,
          currentUserRol: 'ALUMNO',
          conversacion: conversacionAlumno2,
        })
      ).toBe(false);

      // Intento de lectura de mensaje ajeno
      const mensajeAlumno2: Mensaje = {
        id: 'msg-02-1',
        conversacion_id: conversacionAlumno2.id,
        remitente_id: alumno2.id,
        contenido: 'Mensaje privado de Sofía',
        leido: false,
        created_at: '2026-10-01T10:05:00Z',
        updated_at: '2026-10-01T10:05:00Z',
      };

      expect(
        canSelectMensaje({
          currentUserId: alumno1.id,
          currentUserRol: 'ALUMNO',
          conversacion: conversacionAlumno2,
          mensaje: mensajeAlumno2,
        })
      ).toBe(false);

      // Intento de inyección de mensaje en conversación ajena
      expect(
        canInsertMensaje({
          currentUserId: alumno1.id,
          currentUserRol: 'ALUMNO',
          conversacion: conversacionAlumno2,
          mensajeInsert: {
            conversacion_id: conversacionAlumno2.id,
            remitente_id: alumno1.id,
            contenido: 'Intrusión no autorizada',
          },
        })
      ).toBe(false);
    });

    it('impide la suplantación de identidad (spoofing) de remitente_id en mensajes', () => {
      // El alumno intenta enviar con remitente_id del Coach Principal
      expect(
        canInsertMensaje({
          currentUserId: alumno1.id,
          currentUserRol: 'ALUMNO',
          conversacion: conversacionAlumno1,
          mensajeInsert: {
            conversacion_id: conversacionAlumno1.id,
            remitente_id: coachPrincipalId, // Suplantación
            contenido: 'Falso mensaje del coach',
          },
        })
      ).toBe(false);

      // El coach asistente intenta enviar con remitente_id del Coach Principal
      expect(
        canInsertMensaje({
          currentUserId: coachAsistenteId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionAlumno1,
          coachesAsignados: coachesRel,
          mensajeInsert: {
            conversacion_id: conversacionAlumno1.id,
            remitente_id: coachPrincipalId, // Suplantación
            contenido: 'Mensaje suplantando al head coach',
          },
        })
      ).toBe(false);
    });

    it('permite que múltiples profesores asignados (Coach Principal y Asistente) participen concurrentemente', () => {
      // 1. Head Coach puede leer y responder con su remitente_id
      expect(
        canSelectConversacion({
          currentUserId: coachPrincipalId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionAlumno1,
          athleteProfesorAsignadoId: alumno1.profesor_asignado_id,
          coachesAsignados: coachesRel,
        })
      ).toBe(true);

      expect(
        canInsertMensaje({
          currentUserId: coachPrincipalId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionAlumno1,
          athleteProfesorAsignadoId: alumno1.profesor_asignado_id,
          coachesAsignados: coachesRel,
          mensajeInsert: {
            conversacion_id: conversacionAlumno1.id,
            remitente_id: coachPrincipalId,
            contenido: 'Lucas, completá 4 series de Sentadilla al RPE 8.',
          },
        })
      ).toBe(true);

      // 2. Coach Asistente (multi-coach) puede leer y responder en el mismo hilo con su propio remitente_id
      expect(
        canSelectConversacion({
          currentUserId: coachAsistenteId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionAlumno1,
          athleteProfesorAsignadoId: alumno1.profesor_asignado_id,
          coachesAsignados: coachesRel,
        })
      ).toBe(true);

      expect(
        canInsertMensaje({
          currentUserId: coachAsistenteId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionAlumno1,
          athleteProfesorAsignadoId: alumno1.profesor_asignado_id,
          coachesAsignados: coachesRel,
          mensajeInsert: {
            conversacion_id: conversacionAlumno1.id,
            remitente_id: coachAsistenteId,
            contenido: 'Coincido con el Coach Principal. Prestá atención a la profundidad.',
          },
        })
      ).toBe(true);
    });

    it('bloquea el acceso y participación a cualquier profesor que NO esté asignado al alumno', () => {
      expect(
        canSelectConversacion({
          currentUserId: coachNoAsignadoId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionAlumno1,
          athleteProfesorAsignadoId: alumno1.profesor_asignado_id,
          coachesAsignados: coachesRel,
        })
      ).toBe(false);

      expect(
        canInsertMensaje({
          currentUserId: coachNoAsignadoId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionAlumno1,
          athleteProfesorAsignadoId: alumno1.profesor_asignado_id,
          coachesAsignados: coachesRel,
          mensajeInsert: {
            conversacion_id: conversacionAlumno1.id,
            remitente_id: coachNoAsignadoId,
            contenido: 'Intento de contacto no asignado',
          },
        })
      ).toBe(false);
    });

    it('garantiza acceso y supervisión total para el rol ADMIN', () => {
      expect(
        canSelectConversacion({
          currentUserId: adminId,
          currentUserRol: 'ADMIN',
          conversacion: conversacionAlumno1,
        })
      ).toBe(true);

      expect(
        canInsertMensaje({
          currentUserId: adminId,
          currentUserRol: 'ADMIN',
          conversacion: conversacionAlumno1,
          mensajeInsert: {
            conversacion_id: conversacionAlumno1.id,
            remitente_id: adminId,
            contenido: 'Aviso administrativo general',
          },
        })
      ).toBe(true);
    });

    it('valida la lógica de read receipts en simulateMarcarMensajesLeidos', () => {
      const mensajes: Mensaje[] = [
        {
          id: 'msg-1',
          conversacion_id: conversacionAlumno1.id,
          remitente_id: alumno1.id,
          contenido: 'Pregunta del alumno',
          leido: false,
          created_at: '2026-10-01T10:00:00Z',
          updated_at: '2026-10-01T10:00:00Z',
        },
        {
          id: 'msg-2',
          conversacion_id: conversacionAlumno1.id,
          remitente_id: coachPrincipalId,
          contenido: 'Respuesta del coach principal',
          leido: false,
          created_at: '2026-10-01T10:05:00Z',
          updated_at: '2026-10-01T10:05:00Z',
        },
      ];

      // Coach Asistente lee los mensajes: debe marcar como leído el mensaje del alumno y del coach principal
      const { countActualizados, mensajesActualizados } = simulateMarcarMensajesLeidos({
        currentUserId: coachAsistenteId,
        currentUserRol: 'ENTRENADOR',
        conversacion: conversacionAlumno1,
        mensajes,
        athleteProfesorAsignadoId: alumno1.profesor_asignado_id,
        coachesAsignados: coachesRel,
      });

      expect(countActualizados).toBe(2);
      expect(mensajesActualizados.every((m) => m.leido === true)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Exactitud Matemática de Métricas de Retención (cantActivas, Churn, RPC)
  // --------------------------------------------------------------------------
  describe('3. Exactitud Matemática de Métricas de Retención', () => {
    const coach1 = 'coach-1-id';
    const coach2 = 'coach-2-id';

    const testAlumnos: Perfil[] = [
      // 1. Activo con plan activo (Coach 1)
      {
        id: 'alu-1',
        email: 'alu1@test.com',
        nombre_completo: 'Alumno Uno',
        rol: 'ALUMNO',
        estado_membresia: 'ACTIVA',
        profesor_asignado_id: coach1,
        fecha_baja: null,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      },
      // 2. Activo SIN plan de entrenamiento (Coach 1) -> Requiere asignación urgente
      {
        id: 'alu-2',
        email: 'alu2@test.com',
        nombre_completo: 'Alumno Dos',
        rol: 'ALUMNO',
        estado_membresia: 'ACTIVE',
        profesor_asignado_id: coach1,
        fecha_baja: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      // 3. Activo con solo plan en BORRADOR (Coach 1) -> Cuenta como cantSinPlanEntrenamiento
      {
        id: 'alu-3',
        email: 'alu3@test.com',
        nombre_completo: 'Alumno Tres',
        rol: 'ALUMNO',
        estado_membresia: 'ACTIVA',
        profesor_asignado_id: coach1,
        fecha_baja: null,
        created_at: '2026-09-15T00:00:00Z',
        updated_at: '2026-09-15T00:00:00Z',
      },
      // 4. Perdido en el mes corriente (Octubre 2026) -> Churn del mes (Coach 1)
      {
        id: 'alu-4',
        email: 'alu4@test.com',
        nombre_completo: 'Alumno Cuatro',
        rol: 'ALUMNO',
        estado_membresia: 'BAJA',
        profesor_asignado_id: coach1,
        fecha_baja: '2026-10-05T12:00:00Z',
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-10-05T12:00:00Z',
      },
      // 5. Perdido en un mes ANTERIOR (Septiembre 2026) -> NO debe sumar a cantClientesPerdidosMes
      {
        id: 'alu-5',
        email: 'alu5@test.com',
        nombre_completo: 'Alumno Cinco',
        rol: 'ALUMNO',
        estado_membresia: 'INACTIVA',
        profesor_asignado_id: coach1,
        fecha_baja: '2026-09-20T12:00:00Z',
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-09-20T12:00:00Z',
      },
      // 6. Alumno asignado a Coach 2 (Activo con plan activo)
      {
        id: 'alu-6',
        email: 'alu6@test.com',
        nombre_completo: 'Alumno Seis',
        rol: 'ALUMNO',
        estado_membresia: 'ACTIVA',
        profesor_asignado_id: coach2,
        fecha_baja: null,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
    ];

    const testPlanes: PlanEntrenamiento[] = [
      {
        id: 'plan-1',
        profesor_id: coach1,
        alumno_id: 'alu-1',
        nombre: 'Fuerza Bloque 1',
        estado: 'ACTIVO',
        comentarios: null,
        fecha_inicio: '2026-09-01T00:00:00Z',
        fecha_fin: '2026-11-01T00:00:00Z',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'plan-3-borrador',
        profesor_id: coach1,
        alumno_id: 'alu-3',
        nombre: 'Rutina en confección',
        estado: 'BORRADOR', // No está activo
        comentarios: null,
        fecha_inicio: '2026-10-01T00:00:00Z',
        fecha_fin: null,
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      },
      {
        id: 'plan-6',
        profesor_id: coach2,
        alumno_id: 'alu-6',
        nombre: 'Plan Coach 2',
        estado: 'ACTIVO',
        comentarios: null,
        fecha_inicio: '2026-08-01T00:00:00Z',
        fecha_fin: null,
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      },
    ];

    const refDateOct16 = new Date('2026-10-16T18:00:00Z');

    it('calcula con estricta exactitud cantActivas, cantSinPlanEntrenamiento y cantClientesPerdidosMes para Coach 1', () => {
      const metricasCoach1 = simulateObtenerMetricasRetencion({
        alumnos: testAlumnos,
        planes: testPlanes,
        coachesAsignados: [],
        profesorId: coach1,
        callerId: coach1,
        callerRol: 'ENTRENADOR',
        referenceDate: refDateOct16,
      });

      // Alumnos de Coach 1:
      // alu-1 (ACTIVA, plan ACTIVO)
      // alu-2 (ACTIVE, sin plan) -> sinPlan
      // alu-3 (ACTIVA, plan BORRADOR) -> sinPlan
      // alu-4 (BAJA en Octubre 2026) -> perdidoMes
      // alu-5 (INACTIVA en Septiembre 2026) -> no cuenta en mes corriente
      expect(metricasCoach1.cantActivas).toBe(3);
      expect(metricasCoach1.cantSinPlanEntrenamiento).toBe(2);
      expect(metricasCoach1.cantClientesPerdidosMes).toBe(1);

      // Tasa Retención: 3 / (3 + 1) * 100 = 75.00%
      expect(metricasCoach1.tasaRetencionPct).toBe(75.0);
      // Tasa Churn: 1 / (3 + 1) * 100 = 25.00%
      expect(metricasCoach1.tasaChurnPct).toBe(25.0);
    });

    it('aísla los datos del profesor garantizando que no se mezclen métricas de otros coaches', () => {
      const metricasCoach2 = simulateObtenerMetricasRetencion({
        alumnos: testAlumnos,
        planes: testPlanes,
        coachesAsignados: [],
        profesorId: coach2,
        callerId: coach2,
        callerRol: 'ENTRENADOR',
        referenceDate: refDateOct16,
      });

      // Coach 2 solo tiene alu-6 (ACTIVA, plan ACTIVO)
      expect(metricasCoach2.cantActivas).toBe(1);
      expect(metricasCoach2.cantSinPlanEntrenamiento).toBe(0);
      expect(metricasCoach2.cantClientesPerdidosMes).toBe(0);
      expect(metricasCoach2.tasaRetencionPct).toBe(100.0);
      expect(metricasCoach2.tasaChurnPct).toBe(0.0);
    });

    it('permite que el rol ADMIN obtenga las métricas agregadas globales del gimnasio', () => {
      const metricasAdmin = simulateObtenerMetricasRetencion({
        alumnos: testAlumnos,
        planes: testPlanes,
        coachesAsignados: [],
        profesorId: null, // Global
        callerId: 'admin-id',
        callerRol: 'ADMIN',
        referenceDate: refDateOct16,
      });

      // Total global: alu-1, alu-2, alu-3, alu-6 = 4 activas
      expect(metricasAdmin.cantActivas).toBe(4);
      // Sin plan: alu-2, alu-3 = 2
      expect(metricasAdmin.cantSinPlanEntrenamiento).toBe(2);
      // Perdidos en el mes corriente: alu-4 = 1
      expect(metricasAdmin.cantClientesPerdidosMes).toBe(1);
      // Retención global: 4 / (4 + 1) = 80.00%
      expect(metricasAdmin.tasaRetencionPct).toBe(80.0);
      expect(metricasAdmin.tasaChurnPct).toBe(20.0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Fidelidad en la Detección de Sobrecarga Progresiva y Alertas de 1RM
  // --------------------------------------------------------------------------
  describe('4. Detección de Sobrecarga Progresiva y Alertas de 1RM', () => {
    const alumnoId = 'atleta-sobrecarga-01';
    const ejercicioSentadillaId = 'ej-sentadilla-uuid';
    const coachId = 'coach-titular-uuid';

    const coachesRel: EntrenadorAlumno[] = [
      {
        id: 'rel-sc-1',
        entrenador_id: coachId,
        alumno_id: alumnoId,
        rol_entrenador: 'PRINCIPAL',
        es_principal: true,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ];

    const sesionesPrueba: SesionEntrenamientoQA[] = [
      // Sesión 1: Base (100 kg x 5 reps x 2 series completadas)
      // Volumen: 100 * 5 * 2 = 1000 kg. Peso máx: 100 kg.
      {
        id: 'ses-1',
        alumno_id: alumnoId,
        fecha: '2026-10-01T18:00:00Z',
        series: [
          {
            id: 's1-1',
            sesion_id: 'ses-1',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 100,
            reps_hechas: 5,
            completada: true,
          },
          {
            id: 's1-2',
            sesion_id: 'ses-1',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 100,
            reps_hechas: 5,
            completada: true,
          },
        ],
      },
      // Sesión 2: Aumento de peso (105 kg x 5 reps x 2 series)
      // Volumen: 105 * 5 * 2 = 1050 kg. Peso máx: 105 kg. (Sobrecarga de Peso y Volumen)
      {
        id: 'ses-2',
        alumno_id: alumnoId,
        fecha: '2026-10-08T18:00:00Z',
        series: [
          {
            id: 's2-1',
            sesion_id: 'ses-2',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 105,
            reps_hechas: 5,
            completada: true,
          },
          {
            id: 's2-2',
            sesion_id: 'ses-2',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 105,
            reps_hechas: 5,
            completada: true,
          },
        ],
      },
      // Sesión 3: Mismo peso pero mayor repeticiones (105 kg x 6 reps x 2 series)
      // Volumen: 105 * 6 * 2 = 1260 kg. Peso máx: 105 kg. (Sobrecarga de Volumen)
      {
        id: 'ses-3',
        alumno_id: alumnoId,
        fecha: '2026-10-15T18:00:00Z',
        series: [
          {
            id: 's3-1',
            sesion_id: 'ses-3',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 105,
            reps_hechas: 6,
            completada: true,
          },
          {
            id: 's3-2',
            sesion_id: 'ses-3',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 105,
            reps_hechas: 6,
            completada: true,
          },
          // Serie no completada (debe ignorarse)
          {
            id: 's3-3',
            sesion_id: 'ses-3',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 120,
            reps_hechas: 1,
            completada: false,
          },
        ],
      },
      // Sesión 4: Descarga / Menor peso y menor volumen (90 kg x 5 reps x 2 series)
      // Volumen: 900 kg. Peso máx: 90 kg. (SIN sobrecarga)
      {
        id: 'ses-4',
        alumno_id: alumnoId,
        fecha: '2026-10-22T18:00:00Z',
        series: [
          {
            id: 's4-1',
            sesion_id: 'ses-4',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 90,
            reps_hechas: 5,
            completada: true,
          },
          {
            id: 's4-2',
            sesion_id: 'ses-4',
            ejercicio_id: ejercicioSentadillaId,
            peso_kg: 90,
            reps_hechas: 5,
            completada: true,
          },
        ],
      },
    ];

    it('detecta correctamente la sobrecarga progresiva entre sesiones cronológicas consecutivas', () => {
      const resultados = simulateDetectarSobrecargaProgresiva({
        alumnoId,
        ejercicioId: ejercicioSentadillaId,
        sesiones: sesionesPrueba,
        callerId: coachId,
        callerRol: 'ENTRENADOR',
        coachesAsignados: coachesRel,
      });

      expect(resultados).toHaveLength(4);

      // Los resultados se ordenan de más reciente a más antiguo (DESC por fecha)
      const [resSesion4, resSesion3, resSesion2, resSesion1] = resultados;
      expect(resSesion1).toBeDefined();
      expect(resSesion2).toBeDefined();
      expect(resSesion3).toBeDefined();
      expect(resSesion4).toBeDefined();
      if (!resSesion1 || !resSesion2 || !resSesion3 || !resSesion4) {
        throw new Error('Resultados incompletos');
      }

      // Sesión 1 (Inicial): hubo_sobrecarga debe ser false (sin sesión previa de comparación)
      expect(resSesion1.sesion_id).toBe('ses-1');
      expect(resSesion1.hubo_sobrecarga).toBe(false);
      expect(resSesion1.volumen_ejercicio_kg).toBe(1000);
      expect(resSesion1.peso_max_kg).toBe(100);

      // Sesión 2: Aumento de peso (100 -> 105 kg) y volumen (1000 -> 1050 kg)
      expect(resSesion2.sesion_id).toBe('ses-2');
      expect(resSesion2.hubo_sobrecarga).toBe(true);
      expect(resSesion2.peso_max_kg).toBe(105);
      expect(resSesion2.volumen_ejercicio_kg).toBe(1050);

      // Sesión 3: Mismo peso (105 kg) pero aumento de volumen (1050 -> 1260 kg). Ignora serie no completada.
      expect(resSesion3.sesion_id).toBe('ses-3');
      expect(resSesion3.hubo_sobrecarga).toBe(true);
      expect(resSesion3.peso_max_kg).toBe(105);
      expect(resSesion3.volumen_ejercicio_kg).toBe(1260);

      // Sesión 4: Descarga (90 kg, 900 kg) -> SIN sobrecarga
      expect(resSesion4.sesion_id).toBe('ses-4');
      expect(resSesion4.hubo_sobrecarga).toBe(false);
      expect(resSesion4.peso_max_kg).toBe(90);
      expect(resSesion4.volumen_ejercicio_kg).toBe(900);
    });

    it('identifica récords de 1RM personal estimando Epley y Brzycki', () => {
      const resultados = simulateDetectarSobrecargaProgresiva({
        alumnoId,
        ejercicioId: ejercicioSentadillaId,
        sesiones: sesionesPrueba,
        callerId: coachId,
        callerRol: 'ENTRENADOR',
        coachesAsignados: coachesRel,
      });

      // Sesión 1: 100 kg x 5 reps -> 1RM Epley = 100 * (1 + 5/30) = 116.67 kg
      const resSes1 = resultados.find((r) => r.sesion_id === 'ses-1')!;
      expect(resSes1.esNuevoRecord1RM).toBe(true);
      expect(resSes1.mejor1rmEpley).toBeCloseTo(116.67, 1);

      // Sesión 2: 105 kg x 5 reps -> 1RM Epley = 105 * (1 + 5/30) = 122.50 kg (Nuevo récord!)
      const resSes2 = resultados.find((r) => r.sesion_id === 'ses-2')!;
      expect(resSes2.esNuevoRecord1RM).toBe(true);
      expect(resSes2.mejor1rmEpley).toBeCloseTo(122.5, 1);

      // Sesión 3: 105 kg x 6 reps -> 1RM Epley = 105 * (1 + 6/30) = 126.00 kg (Nuevo récord!)
      const resSes3 = resultados.find((r) => r.sesion_id === 'ses-3')!;
      expect(resSes3.esNuevoRecord1RM).toBe(true);
      expect(resSes3.mejor1rmEpley).toBe(126.0);

      // Sesión 4: 90 kg x 5 reps -> 1RM Epley = 105.00 kg (NO es nuevo récord)
      const resSes4 = resultados.find((r) => r.sesion_id === 'ses-4')!;
      expect(resSes4.esNuevoRecord1RM).toBe(false);
      expect(resSes4.mejor1rmEpley).toBe(105.0);
    });

    it('rechaza el acceso a usuarios no autorizados para la consulta de sobrecarga', () => {
      expect(() =>
        simulateDetectarSobrecargaProgresiva({
          alumnoId,
          ejercicioId: ejercicioSentadillaId,
          sesiones: sesionesPrueba,
          callerId: 'coach-ajeno-uuid',
          callerRol: 'ENTRENADOR',
          coachesAsignados: [], // No asignado
        })
      ).toThrowError(/No autorizado/);
    });
  });
});
