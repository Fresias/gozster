export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RolUsuario = 'ENTRENADOR' | 'ALUMNO' | 'ADMIN';
export type EstadoMembresia =
  | 'ACTIVA'
  | 'INACTIVA'
  | 'PENDIENTE'
  | 'BAJA'
  | 'ACTIVE'
  | 'EXPIRED_PAYMENT_PENDING'
  | 'ARCHIVED';
export type EstadoPlan = 'ACTIVO' | 'INACTIVO' | 'BORRADOR';
export type EstadoCuenta = 'ACTIVO' | 'BAJA_ADMINISTRATIVA' | 'SUSPENDIDO';
export type TipoServicio = 'ASESORIA_ONLINE' | 'PRESENCIAL';
export type EstadoContratacion =
  | 'VIGENTE'
  | 'POR_VENCER'
  | 'VENCIDA'
  | 'EN_PAUSA'
  | 'PENDIENTE_RENOVACION';
export type MedioPago = 'TRANSFERENCIA' | 'EFECTIVO' | 'PASARELA_ONLINE' | 'OTRO';
export type EstadoPago = 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';
export type NivelVistaAlumno = 'SIMPLE' | 'TECNICA';
export type ActividadClase = 'FUNCIONAL' | 'BOXEO';
export type EstadoClase = 'PROGRAMADA' | 'CANCELADA';
export type EstadoReserva = 'ANOTADO' | 'CANCELADO' | 'AUSENTE' | 'ANULADO' | 'EN_ESPERA';
export type MotivoCambioDia = 'CANSANCIO_DEPORTE' | 'MOLESTIA' | 'POCO_TIEMPO' | 'EQUIPO_OCUPADO';

export interface Database {
  public: {
    Tables: {
      perfiles: {
        Row: {
          id: string;
          email: string | null;
          nombre_completo: string;
          rol: Database['public']['Enums']['rol_usuario'];
          estado_membresia: Database['public']['Enums']['estado_membresia'];
          estado_cuenta?: EstadoCuenta;
          nivel_vista_alumno?: NivelVistaAlumno;
          profesor_asignado_id: string | null;
          fecha_baja: string | null;
          debe_cambiar_password?: boolean;
          telefono?: string | null;
          fecha_vencimiento_cuota?: string | null;
          ultimo_entreno_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          nombre_completo: string;
          rol?: Database['public']['Enums']['rol_usuario'];
          estado_membresia?: Database['public']['Enums']['estado_membresia'];
          estado_cuenta?: EstadoCuenta;
          nivel_vista_alumno?: NivelVistaAlumno;
          profesor_asignado_id?: string | null;
          fecha_baja?: string | null;
          debe_cambiar_password?: boolean;
          telefono?: string | null;
          fecha_vencimiento_cuota?: string | null;
          ultimo_entreno_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          nombre_completo?: string;
          rol?: Database['public']['Enums']['rol_usuario'];
          estado_membresia?: Database['public']['Enums']['estado_membresia'];
          estado_cuenta?: EstadoCuenta;
          nivel_vista_alumno?: NivelVistaAlumno;
          profesor_asignado_id?: string | null;
          fecha_baja?: string | null;
          debe_cambiar_password?: boolean;
          telefono?: string | null;
          fecha_vencimiento_cuota?: string | null;
          ultimo_entreno_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'perfiles_profesor_asignado_id_fkey';
            columns: ['profesor_asignado_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ejercicios: {
        Row: {
          id: string;
          nombre: string;
          comentario: string | null;
          url_video: string | null;
          musculos_principales: string[];
          musculos_secundarios: string[];
          creado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          comentario?: string | null;
          url_video?: string | null;
          musculos_principales?: string[];
          musculos_secundarios?: string[];
          creado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          comentario?: string | null;
          url_video?: string | null;
          musculos_principales?: string[];
          musculos_secundarios?: string[];
          creado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ejercicios_creado_por_fkey';
            columns: ['creado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      planes_entrenamiento: {
        Row: {
          id: string;
          profesor_id: string | null;
          alumno_id: string | null;
          nombre: string;
          estado: Database['public']['Enums']['estado_plan'];
          comentarios: string | null;
          fecha_inicio: string;
          fecha_fin: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profesor_id?: string | null;
          alumno_id?: string | null;
          nombre: string;
          estado?: Database['public']['Enums']['estado_plan'];
          comentarios?: string | null;
          fecha_inicio?: string;
          fecha_fin?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profesor_id?: string | null;
          alumno_id?: string | null;
          nombre?: string;
          estado?: Database['public']['Enums']['estado_plan'];
          comentarios?: string | null;
          fecha_inicio?: string;
          fecha_fin?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'planes_entrenamiento_profesor_id_fkey';
            columns: ['profesor_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'planes_entrenamiento_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      dias_rutina: {
        Row: {
          id: string;
          plan_id: string;
          nombre: string;
          orden: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          nombre: string;
          orden: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          nombre?: string;
          orden?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dias_rutina_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'planes_entrenamiento';
            referencedColumns: ['id'];
          },
        ];
      };
      ejercicios_en_rutina: {
        Row: {
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
          tempo?: string | null;
          force_rpe_required?: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dia_id: string;
          ejercicio_id: string;
          orden: number;
          series: number;
          repeticiones: string;
          descanso_segundos?: number;
          rpe_objetivo?: number | null;
          notas?: string | null;
          es_superserie?: boolean;
          grupo_superserie?: number | null;
          tempo?: string;
          force_rpe_required?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dia_id?: string;
          ejercicio_id?: string;
          orden?: number;
          series?: number;
          repeticiones?: string;
          descanso_segundos?: number;
          rpe_objetivo?: number | null;
          notas?: string | null;
          es_superserie?: boolean;
          grupo_superserie?: number | null;
          tempo?: string;
          force_rpe_required?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ejercicios_en_rutina_dia_id_fkey';
            columns: ['dia_id'];
            isOneToOne: false;
            referencedRelation: 'dias_rutina';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ejercicios_en_rutina_ejercicio_id_fkey';
            columns: ['ejercicio_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
        ];
      };
      registro_sesiones: {
        Row: {
          id: string;
          alumno_id: string;
          dia_id: string | null;
          fecha: string;
          duracion_minutos: number | null;
          volumen_total_kg: number;
          effective_volume_kg?: number;
          athlete_feedback?: string | null;
          motivo_cambio_dia?: MotivoCambioDia | null;
          dia_sugerido_id?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          dia_id?: string | null;
          fecha?: string;
          duracion_minutos?: number | null;
          volumen_total_kg?: number;
          effective_volume_kg?: number;
          athlete_feedback?: string | null;
          motivo_cambio_dia?: MotivoCambioDia | null;
          dia_sugerido_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          dia_id?: string | null;
          fecha?: string;
          duracion_minutos?: number | null;
          volumen_total_kg?: number;
          effective_volume_kg?: number;
          athlete_feedback?: string | null;
          motivo_cambio_dia?: MotivoCambioDia | null;
          dia_sugerido_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registro_sesiones_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registro_sesiones_dia_id_fkey';
            columns: ['dia_id'];
            isOneToOne: false;
            referencedRelation: 'dias_rutina';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registro_sesiones_dia_sugerido_id_fkey';
            columns: ['dia_sugerido_id'];
            isOneToOne: false;
            referencedRelation: 'dias_rutina';
            referencedColumns: ['id'];
          },
        ];
      };
      registro_series: {
        Row: {
          id: string;
          sesion_id: string;
          ejercicio_id: string;
          numero_serie: number;
          peso_kg: number;
          reps_hechas: number;
          rpe_real: number | null;
          completada: boolean;
          set_type?: 'WARMUP' | 'NORMAL' | 'FAILURE' | 'DROPSET';
          pain_reported?: boolean;
          pain_notes?: string | null;
          video_url?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sesion_id: string;
          ejercicio_id: string;
          numero_serie: number;
          peso_kg?: number;
          reps_hechas?: number;
          rpe_real?: number | null;
          completada?: boolean;
          set_type?: 'WARMUP' | 'NORMAL' | 'FAILURE' | 'DROPSET';
          pain_reported?: boolean;
          pain_notes?: string | null;
          video_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sesion_id?: string;
          ejercicio_id?: string;
          numero_serie?: number;
          peso_kg?: number;
          reps_hechas?: number;
          rpe_real?: number | null;
          completada?: boolean;
          set_type?: 'WARMUP' | 'NORMAL' | 'FAILURE' | 'DROPSET';
          pain_reported?: boolean;
          pain_notes?: string | null;
          video_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registro_series_sesion_id_fkey';
            columns: ['sesion_id'];
            isOneToOne: false;
            referencedRelation: 'registro_sesiones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'registro_series_ejercicio_id_fkey';
            columns: ['ejercicio_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
        ];
      };
      entrenador_alumnos: {
        Row: {
          id: string;
          entrenador_id: string;
          alumno_id: string;
          rol_entrenador: string;
          es_principal: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entrenador_id: string;
          alumno_id: string;
          rol_entrenador?: string;
          es_principal?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          entrenador_id?: string;
          alumno_id?: string;
          rol_entrenador?: string;
          es_principal?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entrenador_alumnos_entrenador_id_fkey';
            columns: ['entrenador_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'entrenador_alumnos_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversaciones: {
        Row: {
          id: string;
          alumno_id: string;
          responsable_id: string | null;
          estado: 'ABIERTA' | 'PENDIENTE' | 'ATENDIDA';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          responsable_id?: string | null;
          estado?: 'ABIERTA' | 'PENDIENTE' | 'ATENDIDA';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          responsable_id?: string | null;
          estado?: 'ABIERTA' | 'PENDIENTE' | 'ATENDIDA';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversaciones_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: true;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversaciones_responsable_id_fkey';
            columns: ['responsable_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      mensajes: {
        Row: {
          id: string;
          conversacion_id: string;
          remitente_id: string;
          contenido: string;
          leido: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversacion_id: string;
          remitente_id: string;
          contenido: string;
          leido?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          conversacion_id?: string;
          remitente_id?: string;
          contenido?: string;
          leido?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mensajes_conversacion_id_fkey';
            columns: ['conversacion_id'];
            isOneToOne: false;
            referencedRelation: 'conversaciones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mensajes_remitente_id_fkey';
            columns: ['remitente_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      habitos_registros: {
        Row: {
          id: string;
          alumno_id: string;
          fecha: string;
          agua_ml: number;
          pasos: number;
          sueno_horas: number;
          habitos_completados: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          fecha?: string;
          agua_ml?: number;
          pasos?: number;
          sueno_horas?: number;
          habitos_completados?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          fecha?: string;
          agua_ml?: number;
          pasos?: number;
          sueno_horas?: number;
          habitos_completados?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habitos_registros_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      nutricion_registros: {
        Row: {
          id: string;
          alumno_id: string;
          fecha: string;
          calorias_consumidas: number;
          calorias_meta: number;
          proteinas_g: number;
          proteinas_meta_g: number;
          carbos_g: number;
          carbos_meta_g: number;
          grasas_g: number;
          grasas_meta_g: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          fecha?: string;
          calorias_consumidas?: number;
          calorias_meta?: number;
          proteinas_g?: number;
          proteinas_meta_g?: number;
          carbos_g?: number;
          carbos_meta_g?: number;
          grasas_g?: number;
          grasas_meta_g?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          fecha?: string;
          calorias_consumidas?: number;
          calorias_meta?: number;
          proteinas_g?: number;
          proteinas_meta_g?: number;
          carbos_g?: number;
          carbos_meta_g?: number;
          grasas_g?: number;
          grasas_meta_g?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nutricion_registros_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      alertas_entrenador: {
        Row: {
          id: string;
          alumno_id: string;
          profesor_id: string;
          ejercicio_id: string | null;
          serie_id: string | null;
          tipo_alerta: 'DOLOR_ARTICULAR' | 'RECORD_1RM' | 'DESERCION_RIESGO' | 'CUOTA_VENCIDA' | 'INACTIVIDAD';
          severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
          titulo: string;
          detalle: string | null;
          estado: 'PENDIENTE' | 'RESUELTO' | 'IGNORADO' | 'ATENDIDO' | 'CERRADO';
          accion_tomada: string | null;
          resuelto_por: string | null;
          resuelto_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          profesor_id: string;
          ejercicio_id?: string | null;
          serie_id?: string | null;
          tipo_alerta: 'DOLOR_ARTICULAR' | 'RECORD_1RM' | 'DESERCION_RIESGO' | 'CUOTA_VENCIDA' | 'INACTIVIDAD';
          severidad?: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
          titulo: string;
          detalle?: string | null;
          estado?: 'PENDIENTE' | 'RESUELTO' | 'IGNORADO' | 'ATENDIDO' | 'CERRADO';
          accion_tomada?: string | null;
          resuelto_por?: string | null;
          resuelto_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          profesor_id?: string;
          ejercicio_id?: string | null;
          serie_id?: string | null;
          tipo_alerta?: 'DOLOR_ARTICULAR' | 'RECORD_1RM' | 'DESERCION_RIESGO' | 'CUOTA_VENCIDA' | 'INACTIVIDAD';
          severidad?: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
          titulo?: string;
          detalle?: string | null;
          estado?: 'PENDIENTE' | 'RESUELTO' | 'IGNORADO' | 'ATENDIDO' | 'CERRADO';
          accion_tomada?: string | null;
          resuelto_por?: string | null;
          resuelto_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alertas_entrenador_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alertas_entrenador_profesor_id_fkey';
            columns: ['profesor_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alertas_entrenador_ejercicio_id_fkey';
            columns: ['ejercicio_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alertas_entrenador_serie_id_fkey';
            columns: ['serie_id'];
            isOneToOne: false;
            referencedRelation: 'registro_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alertas_entrenador_resuelto_por_fkey';
            columns: ['resuelto_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      alumno_historial_dolor: {
        Row: {
          id: string;
          alumno_id: string;
          ejercicio_id: string;
          zona_articular: 'HOMBRO' | 'RODILLA' | 'LUMBAR' | 'CODO' | 'CUELLO' | 'CADERA' | 'TOBILLO' | 'OTRO';
          severidad: 'LEVE' | 'MODERADO' | 'AGUDO';
          notas_alumno: string | null;
          notas_profesor: string | null;
          estado_recuperacion: 'ACTIVO' | 'EN_RECUPERACION' | 'RESUELTO';
          fecha_reporte: string;
          momento_aparicion: 'CALENTAMIENTO' | 'EN_SERIE' | 'POST_EJERCICIO' | null;
          es_sintoma_alarma: boolean;
          sintomas_alarma: string[];
          estado: 'PENDIENTE' | 'ATENDIDO' | 'CERRADO';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          ejercicio_id: string;
          zona_articular: 'HOMBRO' | 'RODILLA' | 'LUMBAR' | 'CODO' | 'CUELLO' | 'CADERA' | 'TOBILLO' | 'OTRO';
          severidad?: 'LEVE' | 'MODERADO' | 'AGUDO';
          notas_alumno?: string | null;
          notas_profesor?: string | null;
          estado_recuperacion?: 'ACTIVO' | 'EN_RECUPERACION' | 'RESUELTO';
          fecha_reporte?: string;
          momento_aparicion?: 'CALENTAMIENTO' | 'EN_SERIE' | 'POST_EJERCICIO' | null;
          es_sintoma_alarma?: boolean;
          sintomas_alarma?: string[];
          estado?: 'PENDIENTE' | 'ATENDIDO' | 'CERRADO';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          ejercicio_id?: string;
          zona_articular?: 'HOMBRO' | 'RODILLA' | 'LUMBAR' | 'CODO' | 'CUELLO' | 'CADERA' | 'TOBILLO' | 'OTRO';
          severidad?: 'LEVE' | 'MODERADO' | 'AGUDO';
          notas_alumno?: string | null;
          notas_profesor?: string | null;
          estado_recuperacion?: 'ACTIVO' | 'EN_RECUPERACION' | 'RESUELTO';
          fecha_reporte?: string;
          momento_aparicion?: 'CALENTAMIENTO' | 'EN_SERIE' | 'POST_EJERCICIO' | null;
          es_sintoma_alarma?: boolean;
          sintomas_alarma?: string[];
          estado?: 'PENDIENTE' | 'ATENDIDO' | 'CERRADO';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alumno_historial_dolor_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alumno_historial_dolor_ejercicio_id_fkey';
            columns: ['ejercicio_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
        ];
      };
      contrataciones: {
        Row: {
          id: string;
          alumno_id: string;
          tipo_servicio: TipoServicio;
          estado: EstadoContratacion;
          dia_vencimiento: number;
          fecha_inicio: string;
          fecha_fin: string;
          dias_aviso_previo: number;
          created_at: string;
          updated_at: string;
          plan_membresia_id: string | null;
          actividad: ActividadClase | null;
          precio_pactado: number | null;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          tipo_servicio?: TipoServicio;
          estado?: EstadoContratacion;
          dia_vencimiento: number;
          fecha_inicio: string;
          fecha_fin: string;
          dias_aviso_previo?: number;
          created_at?: string;
          updated_at?: string;
          plan_membresia_id?: string | null;
          actividad?: ActividadClase | null;
          precio_pactado?: number | null;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          tipo_servicio?: TipoServicio;
          estado?: EstadoContratacion;
          dia_vencimiento?: number;
          fecha_inicio?: string;
          fecha_fin?: string;
          dias_aviso_previo?: number;
          created_at?: string;
          updated_at?: string;
          plan_membresia_id?: string | null;
          actividad?: ActividadClase | null;
          precio_pactado?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contrataciones_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contrataciones_plan_membresia_id_fkey';
            columns: ['plan_membresia_id'];
            isOneToOne: false;
            referencedRelation: 'planes_membresia';
            referencedColumns: ['id'];
          },
        ];
      };
      pagos: {
        Row: {
          id: string;
          contratacion_id: string;
          alumno_id: string;
          cobro_id: string | null;
          monto: number;
          medio_pago: MedioPago;
          estado: EstadoPago;
          idempotency_key: string;
          confirmado_por: string | null;
          confirmado_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          contratacion_id: string;
          alumno_id: string;
          cobro_id?: string | null;
          monto: number;
          medio_pago: MedioPago;
          estado?: EstadoPago;
          idempotency_key: string;
          confirmado_por?: string | null;
          confirmado_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          contratacion_id?: string;
          alumno_id?: string;
          cobro_id?: string | null;
          monto?: number;
          medio_pago?: MedioPago;
          estado?: EstadoPago;
          idempotency_key?: string;
          confirmado_por?: string | null;
          confirmado_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pagos_contratacion_id_fkey';
            columns: ['contratacion_id'];
            isOneToOne: false;
            referencedRelation: 'contrataciones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pagos_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pagos_confirmado_por_fkey';
            columns: ['confirmado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      feriados: {
        Row: {
          id: string;
          fecha: string;
          nombre: string;
          tipo: 'INAMOVIBLE' | 'TRASLADABLE' | 'PUENTE';
          hay_clases: boolean;
          fuente: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          fecha: string;
          nombre: string;
          tipo: 'INAMOVIBLE' | 'TRASLADABLE' | 'PUENTE';
          hay_clases?: boolean;
          fuente?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          fecha?: string;
          nombre?: string;
          tipo?: 'INAMOVIBLE' | 'TRASLADABLE' | 'PUENTE';
          hay_clases?: boolean;
          fuente?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cobros: {
        Row: {
          id: string;
          contratacion_id: string;
          alumno_id: string;
          periodo: string;
          monto: number;
          fecha_vencimiento: string;
          estado: EstadoCobro;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          contratacion_id: string;
          alumno_id: string;
          periodo: string;
          monto: number;
          fecha_vencimiento: string;
          estado?: EstadoCobro;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          contratacion_id?: string;
          alumno_id?: string;
          periodo?: string;
          monto?: number;
          fecha_vencimiento?: string;
          estado?: EstadoCobro;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cobros_contratacion_id_fkey';
            columns: ['contratacion_id'];
            isOneToOne: false;
            referencedRelation: 'contrataciones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cobros_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      auditoria_cambios: {
        Row: {
          id: string;
          entidad: string;
          entidad_id: string;
          accion: string;
          motivo: string | null;
          autorizado_por: string | null;
          usuario_id: string | null;
          valores_anteriores: Json | null;
          valores_nuevos: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entidad: string;
          entidad_id: string;
          accion: string;
          motivo?: string | null;
          autorizado_por?: string | null;
          usuario_id?: string | null;
          valores_anteriores?: Json | null;
          valores_nuevos?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entidad?: string;
          entidad_id?: string;
          accion?: string;
          motivo?: string | null;
          autorizado_por?: string | null;
          usuario_id?: string | null;
          valores_anteriores?: Json | null;
          valores_nuevos?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'auditoria_cambios_autorizado_por_fkey';
            columns: ['autorizado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'auditoria_cambios_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      alumno_cuestionario_inicial: {
        Row: {
          id: string;
          alumno_id: string;
          objetivo_principal: string | null;
          experiencia_previa: string | null;
          dias_disponibles_semana: number | null;
          molestias_o_lesiones_previas: string | null;
          equipamiento_disponible: string | null;
          respuestas_extra: Json;
          completado_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          objetivo_principal?: string | null;
          experiencia_previa?: string | null;
          dias_disponibles_semana?: number | null;
          molestias_o_lesiones_previas?: string | null;
          equipamiento_disponible?: string | null;
          respuestas_extra?: Json;
          completado_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          alumno_id?: string;
          objetivo_principal?: string | null;
          experiencia_previa?: string | null;
          dias_disponibles_semana?: number | null;
          molestias_o_lesiones_previas?: string | null;
          equipamiento_disponible?: string | null;
          respuestas_extra?: Json;
          completado_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alumno_cuestionario_inicial_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: true;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ejercicios_alternativas: {
        Row: {
          id: string;
          ejercicio_origen_id: string;
          ejercicio_alternativo_id: string;
          patron_movimiento: string;
          equipamiento: string | null;
          nivel_exigencia: string | null;
          restricciones_articulares: string[];
          explicacion_tecnica: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ejercicio_origen_id: string;
          ejercicio_alternativo_id: string;
          patron_movimiento: string;
          equipamiento?: string | null;
          nivel_exigencia?: string | null;
          restricciones_articulares?: string[];
          explicacion_tecnica?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ejercicio_origen_id?: string;
          ejercicio_alternativo_id?: string;
          patron_movimiento?: string;
          equipamiento?: string | null;
          nivel_exigencia?: string | null;
          restricciones_articulares?: string[];
          explicacion_tecnica?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ejercicios_alternativas_ejercicio_origen_id_fkey';
            columns: ['ejercicio_origen_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ejercicios_alternativas_ejercicio_alternativo_id_fkey';
            columns: ['ejercicio_alternativo_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
        ];
      };
      sustituciones_ejercicios: {
        Row: {
          id: string;
          plan_id: string;
          ejercicio_en_rutina_id: string | null;
          ejercicio_original_id: string;
          ejercicio_sustituto_id: string;
          reporte_dolor_id: string | null;
          motivo: string | null;
          responsable_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          ejercicio_en_rutina_id?: string | null;
          ejercicio_original_id: string;
          ejercicio_sustituto_id: string;
          reporte_dolor_id?: string | null;
          motivo?: string | null;
          responsable_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plan_id?: string;
          ejercicio_en_rutina_id?: string | null;
          ejercicio_original_id?: string;
          ejercicio_sustituto_id?: string;
          reporte_dolor_id?: string | null;
          motivo?: string | null;
          responsable_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sustituciones_ejercicios_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'planes_entrenamiento';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sustituciones_ejercicios_ejercicio_en_rutina_id_fkey';
            columns: ['ejercicio_en_rutina_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios_en_rutina';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sustituciones_ejercicios_ejercicio_original_id_fkey';
            columns: ['ejercicio_original_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sustituciones_ejercicios_ejercicio_sustituto_id_fkey';
            columns: ['ejercicio_sustituto_id'];
            isOneToOne: false;
            referencedRelation: 'ejercicios';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sustituciones_ejercicios_reporte_dolor_id_fkey';
            columns: ['reporte_dolor_id'];
            isOneToOne: false;
            referencedRelation: 'alumno_historial_dolor';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sustituciones_ejercicios_responsable_id_fkey';
            columns: ['responsable_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      planes_membresia: {
        Row: {
          id: string;
          nombre: string;
          limite_semanal: number | null;
          cantidad_actividades: number;
          duracion_meses: number;
          precio: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          limite_semanal?: number | null;
          cantidad_actividades: number;
          duracion_meses: number;
          precio: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          limite_semanal?: number | null;
          cantidad_actividades?: number;
          duracion_meses?: number;
          precio?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      planes_membresia_precios: {
        Row: {
          id: string;
          plan_membresia_id: string;
          precio: number;
          vigente_desde: string;
          creado_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_membresia_id: string;
          precio: number;
          vigente_desde: string;
          creado_por?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'planes_membresia_precios_plan_membresia_id_fkey';
            columns: ['plan_membresia_id'];
            isOneToOne: false;
            referencedRelation: 'planes_membresia';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'planes_membresia_precios_creado_por_fkey';
            columns: ['creado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      clases_horario: {
        Row: {
          id: string;
          actividad: ActividadClase;
          dia_semana: number;
          hora_inicio: string;
          duracion_minutos: number;
          capacidad: number | null;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          actividad: ActividadClase;
          dia_semana: number;
          hora_inicio: string;
          duracion_minutos: number;
          capacidad?: number | null;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          actividad?: ActividadClase;
          dia_semana?: number;
          hora_inicio?: string;
          duracion_minutos?: number;
          capacidad?: number | null;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      clases: {
        Row: {
          id: string;
          horario_id: string | null;
          actividad: ActividadClase;
          inicio: string;
          duracion_minutos: number;
          capacidad: number | null;
          estado: EstadoClase;
          motivo_cancelacion: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          horario_id?: string | null;
          actividad: ActividadClase;
          inicio: string;
          duracion_minutos: number;
          capacidad?: number | null;
          estado?: EstadoClase;
          motivo_cancelacion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          horario_id?: string | null;
          actividad?: ActividadClase;
          inicio?: string;
          duracion_minutos?: number;
          capacidad?: number | null;
          estado?: EstadoClase;
          motivo_cancelacion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clases_horario_id_fkey';
            columns: ['horario_id'];
            isOneToOne: false;
            referencedRelation: 'clases_horario';
            referencedColumns: ['id'];
          },
        ];
      };
      clases_profesores: {
        Row: {
          id: string;
          clase_id: string;
          profesor_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clase_id: string;
          profesor_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          clase_id?: string;
          profesor_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clases_profesores_clase_id_fkey';
            columns: ['clase_id'];
            isOneToOne: false;
            referencedRelation: 'clases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clases_profesores_profesor_id_fkey';
            columns: ['profesor_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reservas: {
        Row: {
          id: string;
          clase_id: string;
          alumno_id: string;
          estado: EstadoReserva;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clase_id: string;
          alumno_id: string;
          estado?: EstadoReserva;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clase_id?: string;
          alumno_id?: string;
          estado?: EstadoReserva;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reservas_clase_id_fkey';
            columns: ['clase_id'];
            isOneToOne: false;
            referencedRelation: 'clases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reservas_alumno_id_fkey';
            columns: ['alumno_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      v_morosos: {
        Row: {
          cobro_id: string;
          alumno_id: string;
          contratacion_id: string;
          periodo: string;
          monto: number;
          fecha_vencimiento: string;
          dias_atraso: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      feriados_en_rango: {
        Args: { p_desde: string; p_hasta: string };
        Returns: Database['public']['Tables']['feriados']['Row'][];
      };
      fecha_habilita_clases: {
        Args: { p_fecha: string };
        Returns: boolean;
      };
      es_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      es_entrenador_o_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      es_entrenador_de: {
        Args: {
          p_alumno_id: string;
        };
        Returns: boolean;
      };
      precio_vigente: {
        Args: {
          p_plan_id: string;
          p_fecha: string;
        };
        Returns: number | null;
      };
      obtener_kpis_negocio: {
        Args: {
          p_desde: string;
          p_hasta: string;
        };
        Returns: {
          ingresos: number;
          ingresos_6m: number[];
          ingresos_periodo_anterior: number;
          cobranza_esperada: number;
          cobranza_pendiente_monto: number;
          cobranza_vencidas_cant: number;
          sin_entrenar_7d_ids: string[];
          activos_fin: number;
          altas: number;
          bajas: number;
        }[];
      };
      obtener_metricas_retencion: {
        Args: {
          p_profesor_id?: string | null;
        };
        Returns: {
          cantActivas: number;
          cantSinPlanEntrenamiento: number;
          cantClientesPerdidosMes: number;
        }[];
      };
      calcular_volumen_semanal: {
        Args: {
          p_alumno_id: string;
          p_fecha_inicio?: string;
        };
        Returns: number;
      };
      obtener_records_historicos: {
        Args: {
          p_alumno_id: string;
          p_ejercicio_id?: string | null;
        };
        Returns: {
          ejercicio_id: string;
          peso_max_kg: number;
          mejor_1rm_epley: number;
          mejor_1rm_brzycki: number;
        }[];
      };
      detectar_sobrecarga_progresiva: {
        Args: {
          p_alumno_id: string;
          p_ejercicio_id: string;
        };
        Returns: {
          sesion_id: string;
          fecha: string;
          volumen_ejercicio_kg: number;
          peso_max_kg: number;
          hubo_sobrecarga: boolean;
        }[];
      };
      clonar_plan_entrenamiento: {
        Args: {
          p_plan_id: string;
          p_nuevo_nombre: string;
        };
        Returns: string;
      };
      extender_vigencia_plan: {
        Args: {
          p_plan_id: string;
          p_dias_adicionales: number;
        };
        Returns: Database['public']['Tables']['planes_entrenamiento']['Row'];
      };
      obtener_o_crear_conversacion: {
        Args: {
          p_alumno_id: string;
        };
        Returns: string;
      };
      marcar_mensajes_leidos: {
        Args: {
          p_conversacion_id: string;
        };
        Returns: number;
      };
      quick_swap_ejercicio: {
        Args: {
          p_ejercicio_en_rutina_id: string;
          p_nuevo_ejercicio_id: string;
          p_alerta_id?: string | null;
          p_motivo?: string | null;
        };
        Returns: Database['public']['Tables']['ejercicios_en_rutina']['Row'];
      };
      evaluar_vencimientos_contrataciones: {
        Args: Record<PropertyKey, never>;
        Returns: {
          por_vencer: number;
          vencidas: number;
        }[];
      };
      registrar_y_confirmar_renovacion: {
        Args: {
          p_contratacion_id: string;
          p_monto: number;
          p_medio_pago: MedioPago;
          p_idempotency_key: string;
        };
        Returns: Database['public']['Tables']['contrataciones']['Row'];
      };
      extender_contratacion_excepcional: {
        Args: {
          p_contratacion_id: string;
          p_nueva_fecha_fin: string;
          p_motivo: string;
        };
        Returns: Database['public']['Tables']['contrataciones']['Row'];
      };
      restaurar_filas_respaldo: {
        Args: {
          p_tabla: string;
          p_filas: Json;
        };
        Returns: number;
      };
      transferir_conversacion_gozs: {
        Args: {
          p_conversacion_id: string;
          p_nuevo_responsable_id: string;
          p_motivo?: string | null;
        };
        Returns: Database['public']['Tables']['conversaciones']['Row'];
      };
      es_profesor_de_clase: {
        Args: {
          p_clase_id: string;
        };
        Returns: boolean;
      };
      registrar_pago: {
        Args: {
          p_cobro_id: string;
          p_monto: number;
          p_metodo: 'TRANSFERENCIA' | 'EFECTIVO';
        };
        Returns: Database['public']['Tables']['cobros']['Row'];
      };
      anotar_alumno: {
        Args: {
          p_clase_id: string;
          p_alumno_id: string;
        };
        Returns: {
          reserva_id: string;
          sobrecupo: boolean;
          aviso: string | null;
        }[];
      };
      ingresos_mes: {
        Args: {
          p_mes?: string;
        };
        Returns: number;
      };
      reservar_clase: {
        Args: {
          p_clase_id: string;
        };
        Returns: {
          reserva_id: string;
          aviso: string | null;
        }[];
      };
      cancelar_reserva: {
        Args: {
          p_reserva_id: string;
        };
        Returns: Database['public']['Tables']['reservas']['Row'];
      };
      marcar_ausente: {
        Args: {
          p_reserva_id: string;
        };
        Returns: Database['public']['Tables']['reservas']['Row'];
      };
      cancelar_clase: {
        Args: {
          p_clase_id: string;
          p_motivo?: string | null;
        };
        Returns: Database['public']['Tables']['clases']['Row'];
      };
    };
    Enums: {
      rol_usuario: RolUsuario;
      estado_membresia: EstadoMembresia;
      estado_plan: EstadoPlan;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

type PublicSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] &
        PublicSchema['Views'])
    ? (PublicSchema['Tables'] &
        PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema['Tables']
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema['Enums']
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never;

export type Perfil = Tables<'perfiles'>;
export type Ejercicio = Tables<'ejercicios'>;
export type PlanEntrenamiento = Tables<'planes_entrenamiento'>;
export type DiaRutina = Tables<'dias_rutina'>;
export type EjercicioEnRutina = Tables<'ejercicios_en_rutina'>;
export type RegistroSesion = Tables<'registro_sesiones'>;
export type RegistroSerie = Tables<'registro_series'>;
export type EntrenadorAlumno = Tables<'entrenador_alumnos'>;
export type Conversacion = Tables<'conversaciones'>;
export type Mensaje = Tables<'mensajes'>;
export type ConversacionInsert = TablesInsert<'conversaciones'>;
export type ConversacionUpdate = TablesUpdate<'conversaciones'>;
export type MensajeInsert = TablesInsert<'mensajes'>;
export type MensajeUpdate = TablesUpdate<'mensajes'>;
export type HabitoRegistro = Tables<'habitos_registros'>;
export type HabitoRegistroInsert = TablesInsert<'habitos_registros'>;
export type HabitoRegistroUpdate = TablesUpdate<'habitos_registros'>;
export type NutricionRegistro = Tables<'nutricion_registros'>;
export type NutricionRegistroInsert = TablesInsert<'nutricion_registros'>;
export type NutricionRegistroUpdate = TablesUpdate<'nutricion_registros'>;
export type AlertaEntrenador = Tables<'alertas_entrenador'>;
export type AlertaEntrenadorInsert = TablesInsert<'alertas_entrenador'>;
export type AlertaEntrenadorUpdate = TablesUpdate<'alertas_entrenador'>;
export type AlumnoHistorialDolor = Tables<'alumno_historial_dolor'>;
export type AlumnoHistorialDolorInsert = TablesInsert<'alumno_historial_dolor'>;
export type AlumnoHistorialDolorUpdate = TablesUpdate<'alumno_historial_dolor'>;


export type Contratacion = Tables<'contrataciones'>;
export type ContratacionInsert = TablesInsert<'contrataciones'>;
export type ContratacionUpdate = TablesUpdate<'contrataciones'>;
export type EstadoCobro = 'PENDIENTE' | 'PAGADO' | 'VENCIDO';
export type Cobro = Tables<'cobros'>;
export type CobroInsert = TablesInsert<'cobros'>;
export type Pago = Tables<'pagos'>;
export type AuditoriaCambio = Tables<'auditoria_cambios'>;
export type AuditoriaCambioInsert = TablesInsert<'auditoria_cambios'>;
export type AuditoriaCambioUpdate = TablesUpdate<'auditoria_cambios'>;
export type EstadoConversacion = 'ABIERTA' | 'PENDIENTE' | 'ATENDIDA';

export type EjercicioAlternativa = Tables<'ejercicios_alternativas'>;
export type EjercicioAlternativaInsert = TablesInsert<'ejercicios_alternativas'>;
export type EjercicioAlternativaUpdate = TablesUpdate<'ejercicios_alternativas'>;
export type SustitucionEjercicio = Tables<'sustituciones_ejercicios'>;
export type SustitucionEjercicioInsert = TablesInsert<'sustituciones_ejercicios'>;
export type SustitucionEjercicioUpdate = TablesUpdate<'sustituciones_ejercicios'>;
export type AlumnoCuestionarioInicial = Tables<'alumno_cuestionario_inicial'>;
export type AlumnoCuestionarioInicialInsert = TablesInsert<'alumno_cuestionario_inicial'>;
export type AlumnoCuestionarioInicialUpdate = TablesUpdate<'alumno_cuestionario_inicial'>;
export type PlanMembresia = Tables<'planes_membresia'>;
export type ClaseHorario = Tables<'clases_horario'>;
export type Clase = Tables<'clases'>;
export type Feriado = Tables<'feriados'>;
export type ClaseProfesor = Tables<'clases_profesores'>;
export type Reserva = Tables<'reservas'>;
