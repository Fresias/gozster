import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  Conversacion,
  EntrenadorAlumno,
  Mensaje,
  Perfil,
} from '../types/database.types';

// ============================================================================
// Dominio y Simulación de Lógica de Negocio y RLS para Mensajería Unificada (1:N)
// GitHub Issue: #17 (GOZS-11)
// ============================================================================

/**
 * Evaluación de la función public.es_entrenador_de(p_alumno_id)
 * Verifica si el usuario actual es coach asignado directo, coach en un plan, o asistente/coach en entrenador_alumnos.
 */
export function isCoachOfAthlete(params: {
  coachId: string;
  athleteId: string;
  athleteProfesorAsignadoId?: string | null;
  coachesAsignados?: EntrenadorAlumno[];
}): boolean {
  const { coachId, athleteId, athleteProfesorAsignadoId, coachesAsignados = [] } = params;

  // 1. Profesor directo asignado en perfil
  if (athleteProfesorAsignadoId && athleteProfesorAsignadoId === coachId) {
    return true;
  }

  // 2. Multi-coach asignado en tabla entrenador_alumnos (Head coach o asistente)
  return coachesAsignados.some(
    (rel) => rel.alumno_id === athleteId && rel.entrenador_id === coachId
  );
}

/**
 * Simulación de RLS en tabla conversaciones (SELECT)
 * Regla: Alumno dueño, cualquier coach asignado o admin.
 */
export function canSelectConversacion(params: {
  currentUserId: string;
  currentUserRol: Perfil['rol'];
  conversacion: Conversacion;
  athleteProfesorAsignadoId?: string | null;
  coachesAsignados?: EntrenadorAlumno[];
}): boolean {
  const { currentUserId, currentUserRol, conversacion, athleteProfesorAsignadoId, coachesAsignados } = params;

  if (currentUserRol === 'ADMIN') return true;
  if (conversacion.alumno_id === currentUserId) return true;

  return isCoachOfAthlete({
    coachId: currentUserId,
    athleteId: conversacion.alumno_id,
    athleteProfesorAsignadoId,
    coachesAsignados,
  });
}

/**
 * Simulación de RLS en tabla mensajes (SELECT)
 * Regla: El usuario puede leer mensajes de la conversación si es el alumno dueño,
 * coach asignado al alumno o admin.
 */
export function canSelectMensaje(params: {
  currentUserId: string;
  currentUserRol: Perfil['rol'];
  conversacion: Conversacion;
  mensaje: Mensaje;
  athleteProfesorAsignadoId?: string | null;
  coachesAsignados?: EntrenadorAlumno[];
}): boolean {
  const { currentUserId, currentUserRol, conversacion, mensaje, athleteProfesorAsignadoId, coachesAsignados } = params;

  if (mensaje.conversacion_id !== conversacion.id) {
    return false;
  }

  if (currentUserRol === 'ADMIN') return true;
  if (conversacion.alumno_id === currentUserId) return true;

  return isCoachOfAthlete({
    coachId: currentUserId,
    athleteId: conversacion.alumno_id,
    athleteProfesorAsignadoId,
    coachesAsignados,
  });
}

/**
 * Simulación de RLS en tabla mensajes (INSERT)
 * Regla:
 * 1. remitente_id debe coincidir con currentUserId (sin suplantación)
 * 2. Debe pertenecer a la conversación autorizada:
 *    - El alumno dueño
 *    - O un coach asignado al alumno
 *    - O un admin
 */
export function canInsertMensaje(params: {
  currentUserId: string;
  currentUserRol: Perfil['rol'];
  conversacion: Conversacion;
  mensajeInsert: {
    conversacion_id: string;
    remitente_id: string;
    contenido: string;
  };
  athleteProfesorAsignadoId?: string | null;
  coachesAsignados?: EntrenadorAlumno[];
}): boolean {
  const { currentUserId, currentUserRol, conversacion, mensajeInsert, athleteProfesorAsignadoId, coachesAsignados } = params;

  // 1. Control de remitente estricto (remitente_id = auth.uid())
  if (mensajeInsert.remitente_id !== currentUserId) {
    return false;
  }

  // 2. Verificación de coincidencia de conversación
  if (mensajeInsert.conversacion_id !== conversacion.id) {
    return false;
  }

  // 3. Contenido no vacío
  if (!mensajeInsert.contenido || mensajeInsert.contenido.trim().length === 0) {
    return false;
  }

  // 4. Verificación de autorización de participante
  if (currentUserRol === 'ADMIN') return true;
  if (conversacion.alumno_id === currentUserId) return true;

  return isCoachOfAthlete({
    coachId: currentUserId,
    athleteId: conversacion.alumno_id,
    athleteProfesorAsignadoId,
    coachesAsignados,
  });
}

/**
 * Simulación de RPC marcar_mensajes_leidos
 * Marca como leídos los mensajes recibidos en una conversación que pertenezcan a otros participantes.
 */
export function simulateMarcarMensajesLeidos(params: {
  currentUserId: string;
  currentUserRol: Perfil['rol'];
  conversacion: Conversacion;
  mensajes: Mensaje[];
  athleteProfesorAsignadoId?: string | null;
  coachesAsignados?: EntrenadorAlumno[];
}): { countActualizados: number; mensajesActualizados: Mensaje[] } {
  const { currentUserId, currentUserRol, conversacion, mensajes, athleteProfesorAsignadoId, coachesAsignados } = params;

  const canAccess =
    currentUserRol === 'ADMIN' ||
    conversacion.alumno_id === currentUserId ||
    isCoachOfAthlete({
      coachId: currentUserId,
      athleteId: conversacion.alumno_id,
      athleteProfesorAsignadoId,
      coachesAsignados,
    });

  if (!canAccess) {
    throw new Error('No autorizado para actualizar mensajes en esta conversación');
  }

  let count = 0;
  const mensajesActualizados = mensajes.map((m) => {
    if (m.conversacion_id === conversacion.id && m.remitente_id !== currentUserId && !m.leido) {
      count++;
      return { ...m, leido: true, updated_at: new Date().toISOString() };
    }
    return m;
  });

  return { countActualizados: count, mensajesActualizados };
}

// ============================================================================
// Pruebas Unitarias y de Integración (Vitest)
// ============================================================================

describe('Suite de Pruebas: Mensajería Unificada Staff 1:N y RLS (Issue #17)', () => {
  const alumnoLucasId = 'alum-lucas-00000000-0000-0000-0000-000000000001';
  const alumnoPedroId = 'alum-pedro-00000000-0000-0000-0000-000000000002';
  const coachPrincipalId = 'coach-head-00000000-0000-0000-0000-000000000001';
  const coachAsistenteId = 'coach-asst-00000000-0000-0000-0000-000000000002';
  const coachAjenoId = 'coach-extr-00000000-0000-0000-0000-000000000003';
  const adminId = 'admin-user-00000000-0000-0000-0000-000000000001';

  const conversacionLucas: Conversacion = {
    id: 'conv-lucas-1111-1111-1111-111111111111',
    alumno_id: alumnoLucasId,
    created_at: '2026-10-16T12:00:00Z',
    updated_at: '2026-10-16T12:00:00Z',
  };

  const conversacionPedro: Conversacion = {
    id: 'conv-pedro-2222-2222-2222-222222222222',
    alumno_id: alumnoPedroId,
    created_at: '2026-10-16T12:00:00Z',
    updated_at: '2026-10-16T12:00:00Z',
  };

  const multiCoachStaffLucas: EntrenadorAlumno[] = [
    {
      id: 'rel-head-lucas',
      entrenador_id: coachPrincipalId,
      alumno_id: alumnoLucasId,
      rol_entrenador: 'PRINCIPAL',
      es_principal: true,
      created_at: '2026-10-16T10:00:00Z',
      updated_at: '2026-10-16T10:00:00Z',
    },
    {
      id: 'rel-asst-lucas',
      entrenador_id: coachAsistenteId,
      alumno_id: alumnoLucasId,
      rol_entrenador: 'ASISTENTE',
      es_principal: false,
      created_at: '2026-10-16T10:00:00Z',
      updated_at: '2026-10-16T10:00:00Z',
    },
  ];

  describe('1. Criterios de Aceptación Gherkin - Seguridad RLS en Mensajería (Issue #17)', () => {
    it('GIVEN un alumno WHEN consulta su conversación THEN RLS permite la lectura de su propio historial', () => {
      const mensajeLucas: Mensaje = {
        id: 'msg-1',
        conversacion_id: conversacionLucas.id,
        remitente_id: alumnoLucasId,
        contenido: '¿Mantengo 3 minutos en la serie de sentadilla?',
        leido: false,
        created_at: '2026-10-16T12:05:00Z',
        updated_at: '2026-10-16T12:05:00Z',
      };

      const canSelect = canSelectMensaje({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensaje: mensajeLucas,
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });

      expect(canSelect).toBe(true);
    });

    it('GIVEN un alumno WHEN intenta acceder a la conversación de otro alumno THEN RLS bloquea el acceso', () => {
      const mensajePedro: Mensaje = {
        id: 'msg-p1',
        conversacion_id: conversacionPedro.id,
        remitente_id: alumnoPedroId,
        contenido: 'Hola profesor, tengo dudas de la carga.',
        leido: false,
        created_at: '2026-10-16T12:10:00Z',
        updated_at: '2026-10-16T12:10:00Z',
      };

      const canSelect = canSelectMensaje({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionPedro,
        mensaje: mensajePedro,
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: [],
      });

      expect(canSelect).toBe(false);
    });

    it('GIVEN un alumno WHEN envía un mensaje a través de mensajes THEN registra conversacion_id, remitente_id, contenido, leido y created_at', () => {
      const canInsert = canInsertMensaje({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: alumnoLucasId,
          contenido: 'Terminé la serie 4 de Sentadilla a RPE 8.5.',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });

      expect(canInsert).toBe(true);
    });

    it('GIVEN un alumno WHEN intenta enviar con remitente_id falso THEN RLS rechaza el insert', () => {
      const canInsertSpoofed = canInsertMensaje({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: coachPrincipalId, // Intento de suplantar al coach
          contenido: 'Mensaje fraudulento haciéndose pasar por coach',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });

      expect(canInsertSpoofed).toBe(false);
    });

    it('GIVEN un mensaje con contenido vacío o sólo espacios en blanco WHEN se intenta insertar THEN la validación y CHECK constraint lo rechazan', () => {
      const emptyContent = canInsertMensaje({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: alumnoLucasId,
          contenido: '   ',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(emptyContent).toBe(false);

      const nullContent = canInsertMensaje({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: alumnoLucasId,
          contenido: '',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(nullContent).toBe(false);
    });

    it('GIVEN un mensaje con conversacion_id inconsistente WHEN se intenta insertar THEN la validación rechaza la inserción', () => {
      const mismatchedConv = canInsertMensaje({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionPedro.id,
          remitente_id: alumnoLucasId,
          contenido: 'Mensaje con id cruzado',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(mismatchedConv).toBe(false);
    });

    it('GIVEN el Coach Principal y asistentes asignados (1:N) WHEN consultan el historial THEN ambos pueden leer todos los mensajes', () => {
      const mensaje: Mensaje = {
        id: 'msg-2',
        conversacion_id: conversacionLucas.id,
        remitente_id: alumnoLucasId,
        contenido: '¿Cómo ven mi técnica de peso muerto?',
        leido: false,
        created_at: '2026-10-16T12:15:00Z',
        updated_at: '2026-10-16T12:15:00Z',
      };

      // Coach Principal
      const principalCanRead = canSelectMensaje({
        currentUserId: coachPrincipalId,
        currentUserRol: 'ENTRENADOR',
        conversacion: conversacionLucas,
        mensaje,
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(principalCanRead).toBe(true);

      // Coach Asistente
      const asstCanRead = canSelectMensaje({
        currentUserId: coachAsistenteId,
        currentUserRol: 'ENTRENADOR',
        conversacion: conversacionLucas,
        mensaje,
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(asstCanRead).toBe(true);
    });

    it('GIVEN los profesores asignados WHEN responden al alumno THEN cada mensaje registra su propio remitente_id preservando autoría', () => {
      // Respuesta del Coach Principal
      const insertPrincipal = canInsertMensaje({
        currentUserId: coachPrincipalId,
        currentUserRol: 'ENTRENADOR',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: coachPrincipalId,
          contenido: 'Excelente serie Lucas, respetá los 3 min de pausa.',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(insertPrincipal).toBe(true);

      // Respuesta del Coach Asistente en el mismo canal 1:N
      const insertAsistente = canInsertMensaje({
        currentUserId: coachAsistenteId,
        currentUserRol: 'ENTRENADOR',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: coachAsistenteId,
          contenido: 'Revisé tu video de Sentadilla: mantén la mirada al frente al descender.',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(insertAsistente).toBe(true);
    });

    it('GIVEN un profesor NO asignado al alumno WHEN intenta leer o responder THEN RLS deniega el acceso', () => {
      const mensaje: Mensaje = {
        id: 'msg-3',
        conversacion_id: conversacionLucas.id,
        remitente_id: alumnoLucasId,
        contenido: 'Consulta privada con mi staff',
        leido: false,
        created_at: '2026-10-16T12:20:00Z',
        updated_at: '2026-10-16T12:20:00Z',
      };

      const ajenoCanRead = canSelectMensaje({
        currentUserId: coachAjenoId,
        currentUserRol: 'ENTRENADOR',
        conversacion: conversacionLucas,
        mensaje,
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(ajenoCanRead).toBe(false);

      const ajenoCanInsert = canInsertMensaje({
        currentUserId: coachAjenoId,
        currentUserRol: 'ENTRENADOR',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: coachAjenoId,
          contenido: 'Intrusión no autorizada',
        },
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });
      expect(ajenoCanInsert).toBe(false);
    });

    it('GIVEN un administrador WHEN consulta o interactúa en el chat THEN tiene acceso total de supervisión', () => {
      const mensaje: Mensaje = {
        id: 'msg-4',
        conversacion_id: conversacionLucas.id,
        remitente_id: alumnoLucasId,
        contenido: 'Mensaje para supervisión',
        leido: false,
        created_at: '2026-10-16T12:25:00Z',
        updated_at: '2026-10-16T12:25:00Z',
      };

      const adminCanRead = canSelectMensaje({
        currentUserId: adminId,
        currentUserRol: 'ADMIN',
        conversacion: conversacionLucas,
        mensaje,
      });
      expect(adminCanRead).toBe(true);

      const adminCanInsert = canInsertMensaje({
        currentUserId: adminId,
        currentUserRol: 'ADMIN',
        conversacion: conversacionLucas,
        mensajeInsert: {
          conversacion_id: conversacionLucas.id,
          remitente_id: adminId,
          contenido: 'Notificación administrativa de soporte.',
        },
      });
      expect(adminCanInsert).toBe(true);
    });
  });

  describe('2. RPC y Funciones Auxiliares (marcar_mensajes_leidos)', () => {
    it('marca como leídos solo los mensajes de otros remitentes y retorna la cantidad actualizada', () => {
      const mensajes: Mensaje[] = [
        {
          id: 'msg-a1',
          conversacion_id: conversacionLucas.id,
          remitente_id: coachPrincipalId,
          contenido: '¡Buen trabajo hoy!',
          leido: false,
          created_at: '2026-10-16T12:30:00Z',
          updated_at: '2026-10-16T12:30:00Z',
        },
        {
          id: 'msg-a2',
          conversacion_id: conversacionLucas.id,
          remitente_id: coachAsistenteId,
          contenido: 'Descansá bien para el día de pierna.',
          leido: false,
          created_at: '2026-10-16T12:35:00Z',
          updated_at: '2026-10-16T12:35:00Z',
        },
        {
          id: 'msg-a3',
          conversacion_id: conversacionLucas.id,
          remitente_id: alumnoLucasId,
          contenido: '¡Gracias profes!',
          leido: false,
          created_at: '2026-10-16T12:40:00Z',
          updated_at: '2026-10-16T12:40:00Z',
        },
      ];

      // Lucas abre el chat: debe marcar como leídos los mensajes de los coaches, pero no el propio
      const result = simulateMarcarMensajesLeidos({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensajes,
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });

      expect(result.countActualizados).toBe(2);
      expect(result.mensajesActualizados[0]?.leido).toBe(true);
      expect(result.mensajesActualizados[1]?.leido).toBe(true);
      expect(result.mensajesActualizados[2]?.leido).toBe(false); // Propio
    });

    it('retorna 0 actualizados si todos los mensajes ya están leídos o si solo existen mensajes propios', () => {
      const result = simulateMarcarMensajesLeidos({
        currentUserId: alumnoLucasId,
        currentUserRol: 'ALUMNO',
        conversacion: conversacionLucas,
        mensajes: [
          {
            id: 'msg-already-read',
            conversacion_id: conversacionLucas.id,
            remitente_id: coachPrincipalId,
            contenido: 'Mensaje previo',
            leido: true,
            created_at: '2026-10-16T12:00:00Z',
            updated_at: '2026-10-16T12:00:00Z',
          },
          {
            id: 'msg-own',
            conversacion_id: conversacionLucas.id,
            remitente_id: alumnoLucasId,
            contenido: 'Mi propio mensaje no leído por otros',
            leido: false,
            created_at: '2026-10-16T12:01:00Z',
            updated_at: '2026-10-16T12:01:00Z',
          },
        ],
        athleteProfesorAsignadoId: coachPrincipalId,
        coachesAsignados: multiCoachStaffLucas,
      });

      expect(result.countActualizados).toBe(0);
      expect(result.mensajesActualizados[1]?.leido).toBe(false);
    });

    it('lanza excepción si un usuario no autorizado intenta marcar mensajes en una conversación ajena', () => {
      expect(() => {
        simulateMarcarMensajesLeidos({
          currentUserId: coachAjenoId,
          currentUserRol: 'ENTRENADOR',
          conversacion: conversacionLucas,
          mensajes: [],
          athleteProfesorAsignadoId: coachPrincipalId,
          coachesAsignados: multiCoachStaffLucas,
        });
      }).toThrow('No autorizado para actualizar mensajes en esta conversación');
    });
  });

  describe('3. Validación Sintáctica, Idempotencia y Seguridad del Script de Migración SQL', () => {
    it('verifica que el script de migración SQL contenga las directivas de seguridad, tablas y publicación Realtime', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../supabase/migrations/20261016200000_chat_unified_staff_messaging.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');

      // 1. Tablas principales e idempotencia
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.conversaciones');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.mensajes');
      expect(sql).toContain('CONSTRAINT uq_conversaciones_alumno UNIQUE (alumno_id)');

      // 2. Claves y campos del criterio Gherkin
      expect(sql).toContain('conversacion_id UUID NOT NULL REFERENCES public.conversaciones(id)');
      expect(sql).toContain('remitente_id UUID NOT NULL REFERENCES public.perfiles(id)');
      expect(sql).toContain('contenido TEXT NOT NULL');
      expect(sql).toContain('leido BOOLEAN NOT NULL DEFAULT false');
      expect(sql).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT now()');

      // 3. Activación de RLS estricto
      expect(sql).toContain('ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY');

      // 4. REGLA CRÍTICA DE GOBERNANZA: Jamás relajar seguridad con USING (true)
      expect(sql).not.toContain('USING (true)');

      // 5. Políticas RLS
      expect(sql).toContain('conversaciones_select_participantes');
      expect(sql).toContain('conversaciones_insert_participantes');
      expect(sql).toContain('mensajes_select_participantes');
      expect(sql).toContain('mensajes_insert_participantes');
      expect(sql).toContain('mensajes_update_participantes');
      expect(sql).toContain('mensajes_delete_autor_o_admin');

      // 6. Supabase Realtime
      expect(sql).toContain('ALTER TABLE public.mensajes REPLICA IDENTITY FULL');
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes');

      // 7. Funciones RPC auxiliares
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.obtener_o_crear_conversacion');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.marcar_mensajes_leidos');
    });
  });
});
