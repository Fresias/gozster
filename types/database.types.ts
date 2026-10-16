export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type RolUsuario = 'ENTRENADOR' | 'ALUMNO' | 'ADMIN';
export type EstadoMembresia = 'ACTIVA' | 'INACTIVA' | 'PENDIENTE' | 'BAJA';
export type EstadoPlan = 'ACTIVO' | 'INACTIVO' | 'BORRADOR';

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
          profesor_asignado_id: string | null;
          fecha_baja: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          nombre_completo: string;
          rol?: Database['public']['Enums']['rol_usuario'];
          estado_membresia?: Database['public']['Enums']['estado_membresia'];
          profesor_asignado_id?: string | null;
          fecha_baja?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          nombre_completo?: string;
          rol?: Database['public']['Enums']['rol_usuario'];
          estado_membresia?: Database['public']['Enums']['estado_membresia'];
          profesor_asignado_id?: string | null;
          fecha_baja?: string | null;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
