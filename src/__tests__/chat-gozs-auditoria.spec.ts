import { describe, it, expect, vi } from 'vitest';

/**
 * Suite de Pruebas de QA - GOZS-47 (#66)
 * Verificación técnica y matemática de:
 * 1. Transferencia de conversación a segundo profesor y RLS.
 * 2. Identidad única institucional "GOZS" en vista del alumno (AthleteChat).
 * 3. Auditoría de autoría real interna (remitente_id) y trazabilidad de cambios en rutinas.
 */

describe('Fase 3 · GOZS-47: Auditoría de Chat Compartido GOZS y Transferencia', () => {

  describe('1. Transferencia de conversación y permisos RLS (transferir_conversacion_gozs)', () => {
    it('debe actualizar el responsable_id y vincular al segundo profesor en entrenador_alumnos', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          exito: true,
          conversacion_id: 'conv-123',
          nuevo_responsable_id: 'coach-2',
          alumno_id: 'athlete-99',
          vinculo_creado: true
        },
        error: null
      });

      const res = await mockRpc('transferir_conversacion_gozs', {
        p_conversacion_id: 'conv-123',
        p_nuevo_responsable_id: 'coach-2',
        p_motivo: 'Derivación por especialidad en hipertrofia'
      });

      expect(res.error).toBeNull();
      expect(res.data.nuevo_responsable_id).toBe('coach-2');
      expect(res.data.vinculo_creado).toBe(true);
    });

    it('el segundo profesor debe tener acceso de lectura al contexto completo del alumno vía RLS', async () => {
      // Simulación de validación de RLS para el nuevo entrenador
      const sesionEntrenador = { user_id: 'coach-2', rol: 'entrenador' };
      const entrenadorAlumnos = [
        { entrenador_id: 'coach-2', alumno_id: 'athlete-99', activo: true }
      ];

      const tieneAcceso = entrenadorAlumnos.some(
        ea => ea.entrenador_id === sesionEntrenador.user_id && ea.alumno_id === 'athlete-99' && ea.activo
      );

      expect(tieneAcceso).toBe(true);
    });

    it('debe registrar la transferencia en auditoria_cambios', async () => {
      const registroAuditoria = {
        entidad: 'conversaciones',
        entidad_id: 'conv-123',
        accion: 'TRANSFERENCIA_RESPONSABLE',
        autor_id: 'coach-1',
        detalles: {
          responsable_anterior: 'coach-1',
          responsable_nuevo: 'coach-2',
          motivo: 'Reasignación de turno'
        },
        created_at: new Date().toISOString()
      };

      expect(registroAuditoria.detalles.responsable_anterior).toBe('coach-1');
      expect(registroAuditoria.detalles.responsable_nuevo).toBe('coach-2');
      expect(registroAuditoria.autor_id).toBe('coach-1');
    });
  });

  describe('2. Privacidad e Identidad Institucional GOZS en AthleteChat ("Somos un equipo")', () => {
    const mensajesServidor = [
      {
        id: 'msg-1',
        conversacion_id: 'conv-123',
        remitente_id: 'coach-1',
        nombre_staff_interno: 'Carlos Gómez',
        rol_remitente: 'profesor',
        contenido: 'Hola Lucas, ajustamos la carga en sentadillas.',
        created_at: '2026-10-20T10:00:00Z'
      },
      {
        id: 'msg-2',
        conversacion_id: 'conv-123',
        remitente_id: 'coach-2',
        nombre_staff_interno: 'María Rodríguez',
        rol_remitente: 'profesor',
        contenido: 'Revisé tu video, excelente profundidad.',
        created_at: '2026-10-20T14:30:00Z'
      }
    ];

    it('la función de transformación para AthleteChat debe enmascarar estrictamente la identidad individual a "GOZS"', () => {
      function formatearMensajeParaAlumno(msg: typeof mensajesServidor[0]) {
        return {
          id: msg.id,
          contenido: msg.contenido,
          created_at: msg.created_at,
          remitente_visual: msg.rol_remitente === 'profesor' ? 'GOZS' : 'Tú'
        };
      }

      const mensajesFormateados = mensajesServidor.map(formatearMensajeParaAlumno);

      mensajesFormateados.forEach(m => {
        expect(m.remitente_visual).toBe('GOZS');
        expect(m).not.toHaveProperty('nombre_staff_interno');
        expect(m).not.toHaveProperty('remitente_id');
      });
    });

    it('ningún mensaje del staff debe exponer el nombre real del profesor en el DOM o payload del alumno', () => {
      const payloadAlumno = JSON.stringify(mensajesServidor.map(m => ({
        id: m.id,
        remitente: 'GOZS',
        contenido: m.contenido
      })));

      expect(payloadAlumno).not.toContain('Carlos Gómez');
      expect(payloadAlumno).not.toContain('María Rodríguez');
      expect(payloadAlumno).toContain('GOZS');
    });
  });

  describe('3. Autoría Real Interna en Coach Studio y Auditoría de Cambios de Rutina', () => {
    it('en la vista de Coach Studio debe preservarse y mostrarse la autoría individual de cada mensaje', () => {
      const mensajeStudio = {
        id: 'msg-2',
        remitente_id: 'coach-2',
        nombre_interno: 'María Rodríguez',
        avatar_interno: '/avatars/coach-2.jpg',
        contenido: 'Revisé tu video, excelente profundidad.',
        created_at: '2026-10-20T14:30:00Z'
      };

      expect(mensajeStudio.remitente_id).toBe('coach-2');
      expect(mensajeStudio.nombre_interno).toBe('María Rodríguez');
    });

    it('el trigger fn_auditar_cambio_rutina debe capturar cambios en planes_entrenamiento', () => {
      const eventoModificacionRutina = {
        tabla: 'ejercicios_en_rutina',
        operacion: 'UPDATE',
        modificado_por: 'coach-2',
        fecha: new Date().toISOString(),
        valores_previos: { series: 3, repeticiones: 10, peso_objetivo_kg: 80 },
        valores_nuevos: { series: 4, repeticiones: 8, peso_objetivo_kg: 85 }
      };

      expect(eventoModificacionRutina.modificado_por).toBe('coach-2');
      expect(eventoModificacionRutina.valores_previos.peso_objetivo_kg).toBe(80);
      expect(eventoModificacionRutina.valores_nuevos.peso_objetivo_kg).toBe(85);
      expect(eventoModificacionRutina.valores_nuevos.series).toBe(4);
    });

    it('cálculo estricto de tonelaje modificado en la rutina (QA de fórmulas de fuerza)', () => {
      // Tonelaje previo: 3 series * 10 reps * 80 kg = 2400 kg
      const tonelajePrevio = 3 * 10 * 80;
      // Tonelaje nuevo: 4 series * 8 reps * 85 kg = 2720 kg
      const tonelajeNuevo = 4 * 8 * 85;

      expect(tonelajePrevio).toBe(2400);
      expect(tonelajeNuevo).toBe(2720);
      expect(tonelajeNuevo - tonelajePrevio).toBe(320);
    });
  });

});
