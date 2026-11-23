import type {
  Database as GeneratedDatabase,
  Enums as GeneratedEnums,
  Json,
  Tables as GeneratedTables,
  TablesInsert as GeneratedTablesInsert,
  TablesUpdate as GeneratedTablesUpdate,
} from "./database.types";

export type {
  CompositeTypes,
  Constants,
  Json,
} from "./database.types";

export type RolUsuario = "ENTRENADOR" | "ALUMNO" | "ADMIN";
export type EstadoMembresia =
  | "ACTIVA"
  | "INACTIVA"
  | "PENDIENTE"
  | "BAJA"
  | "VENCIDA";
export type EstadoPlan = "ACTIVO" | "INACTIVO" | "BORRADOR";
export type EstadoCuenta = "ACTIVO" | "BAJA_ADMINISTRATIVA" | "SUSPENDIDO";
export type TipoServicio = "ASESORIA_ONLINE" | "PRESENCIAL";
export type EstadoContratacion =
  | "VIGENTE"
  | "POR_VENCER"
  | "VENCIDA"
  | "EN_PAUSA"
  | "PENDIENTE_RENOVACION";
export type MedioPago = "TRANSFERENCIA" | "EFECTIVO" | "PASARELA_ONLINE" | "OTRO";
export type EstadoPago = "PENDIENTE" | "CONFIRMADO" | "RECHAZADO";
export type NivelVistaAlumno = "SIMPLE" | "TECNICA";
export type ActividadClase = "FUNCIONAL" | "BOXEO";
export type ActividadAlumno = ActividadClase | "RUTINAS";
export type EstadoClase = "PROGRAMADA" | "CANCELADA";
export type EstadoReserva = "ANOTADO" | "CANCELADO" | "AUSENTE" | "ANULADO" | "EN_ESPERA";
export type SensacionClase = 1 | 2 | 3 | 4;
export type MotivoCambioDia = "CANSANCIO_DEPORTE" | "MOLESTIA" | "POCO_TIEMPO" | "EQUIPO_OCUPADO";
export type TipoLogroRacha = "diamante";
export type EstadoCobro = "PENDIENTE" | "PAGADO" | "VENCIDO";
export type EstadoConversacion = "ABIERTA" | "PENDIENTE" | "ATENDIDA";
export type TagPlanEntrenamiento =
  | "Fuerza"
  | "Hipertrofia"
  | "Rehabilitación"
  | "Potencia"
  | "Peso Corporal";
export type TipoMedicionEjercicio = "REPS" | "TIEMPO";

type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];
type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

type OverrideRow<TBase, TOverride> = Omit<TBase, keyof TOverride> & TOverride;

type OverrideInsert<TBase, TOverride> = Omit<TBase, keyof TOverride> & {
  [K in RequiredKeys<TBase> & keyof TOverride as undefined extends TOverride[K]
    ? never
    : K]: TOverride[K];
} & {
  [K in OptionalKeys<TBase> & keyof TOverride]?: TOverride[K];
} & {
  [K in RequiredKeys<TBase> & keyof TOverride as undefined extends TOverride[K]
    ? K
    : never]?: TOverride[K];
};

type RefineTable<
  TTable extends {
    Row: Record<string, unknown>;
    Insert: Record<string, unknown>;
    Update: Record<string, unknown>;
    Relationships: unknown[];
  },
  TRowOverride extends Partial<Record<keyof TTable["Row"], unknown>>,
> = {
  Row: OverrideRow<TTable["Row"], TRowOverride>;
  Insert: OverrideInsert<TTable["Insert"], TRowOverride>;
  Update: OverrideRow<TTable["Update"], Partial<TRowOverride>>;
  Relationships: TTable["Relationships"];
};

type RawTables = GeneratedDatabase["public"]["Tables"];

type RefinedTables = Omit<
  RawTables,
  | "perfiles"
  | "planes_entrenamiento"
  | "ejercicios_en_rutina"
  | "registro_sesiones"
  | "registro_series"
  | "conversaciones"
  | "alertas_entrenador"
  | "alumno_historial_dolor"
  | "contrataciones"
  | "pagos"
  | "feriados"
  | "cobros"
  | "alumno_actividades"
  | "planes_membresia"
  | "clases_horario"
  | "clases"
  | "reservas"
  | "feedback_clase"
  | "logros_racha"
> & {
  perfiles: RefineTable<
    RawTables["perfiles"],
    {
      estado_cuenta?: EstadoCuenta;
      nivel_vista_alumno?: NivelVistaAlumno;
      debe_cambiar_password?: boolean;
      telefono?: string | null;
      fecha_vencimiento_cuota?: string | null;
      ultimo_entreno_at?: string | null;
      peso_corporal_kg?: number | null;
      sexo?: "M" | "F" | null;
      nombre_preferido?: string | null;
      onboarding_completado?: boolean;
      profesor_apoyo_id?: string | null;
      apoyo_acceso_financiero?: boolean;
    }
  >;
  planes_entrenamiento: RefineTable<
    RawTables["planes_entrenamiento"],
    {
      tipo?: "PLANTILLA" | "DE_ALUMNO";
      etiqueta?: "STANDARD" | null;
      tags?: string[];
      plan_origen_id?: string | null;
    }
  >;
  ejercicios_en_rutina: RefineTable<
    RawTables["ejercicios_en_rutina"],
    {
      rpe_objetivo: string | number | null;
      tempo?: string | null;
      force_rpe_required?: boolean | null;
      tempo_activo?: boolean;
      tipo_serie?: "NORMAL" | "WARMUP" | "DROPSET";
      tipo_medicion?: "REPS" | "TIEMPO";
      tiempo_objetivo_segundos?: number | null;
      es_unilateral?: boolean;
    }
  >;
  registro_sesiones: RefineTable<
    RawTables["registro_sesiones"],
    {
      effective_volume_kg?: number;
      motivo_cambio_dia?: MotivoCambioDia | null;
      dia_sugerido_id?: string | null;
    }
  >;
  registro_series: RefineTable<
    RawTables["registro_series"],
    {
      notas?: string | null;
      set_type?: "WARMUP" | "NORMAL" | "FAILURE" | "DROPSET";
      pain_reported?: boolean;
      pain_notes?: string | null;
      video_url?: string | null;
    }
  >;
  conversaciones: RefineTable<
    RawTables["conversaciones"],
    {
      estado: EstadoConversacion;
    }
  >;
  alertas_entrenador: RefineTable<
    RawTables["alertas_entrenador"],
    {
      reporte_dolor_id?: string | null;
      tipo_alerta:
        | "DOLOR_ARTICULAR"
        | "RECORD_1RM"
        | "DESERCION_RIESGO"
        | "CUOTA_VENCIDA"
        | "INACTIVIDAD";
      severidad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
      estado: "PENDIENTE" | "RESUELTO" | "IGNORADO" | "ATENDIDO" | "CERRADO";
    }
  >;
  alumno_historial_dolor: RefineTable<
    RawTables["alumno_historial_dolor"],
    {
      numero_serie?: number | null;
      sesion_id?: string | null;
      ejercicio_en_rutina_id?: string | null;
      zona_articular:
        | "HOMBRO"
        | "RODILLA"
        | "LUMBAR"
        | "CODO"
        | "CUELLO"
        | "CADERA"
        | "TOBILLO"
        | "OTRO";
      eva?: number | null;
      severidad: "LEVE" | "MODERADO" | "AGUDO" | "CRITICA";
      momento_aparicion: "CALENTAMIENTO" | "EN_SERIE" | "POST_EJERCICIO" | null;
      estado: "PENDIENTE" | "ATENDIDO" | "RESUELTO" | "CERRADO";
    }
  >;
  contrataciones: RefineTable<
    RawTables["contrataciones"],
    {
      tipo_servicio: TipoServicio;
      estado: EstadoContratacion;
      actividad: ActividadAlumno | null;
    }
  >;
  pagos: RefineTable<
    RawTables["pagos"],
    {
      medio_pago: MedioPago;
      estado: EstadoPago;
    }
  >;
  feriados: RefineTable<
    RawTables["feriados"],
    {
      tipo: "INAMOVIBLE" | "TRASLADABLE" | "PUENTE";
    }
  >;
  cobros: RefineTable<
    RawTables["cobros"],
    {
      estado: EstadoCobro;
    }
  >;
  alumno_actividades: RefineTable<
    RawTables["alumno_actividades"],
    {
      actividad: ActividadAlumno;
    }
  >;
  planes_membresia: RefineTable<
    RawTables["planes_membresia"],
    {
      notas?: string | null;
    }
  >;
  clases_horario: RefineTable<
    RawTables["clases_horario"],
    {
      actividad: ActividadClase;
    }
  >;
  clases: RefineTable<
    RawTables["clases"],
    {
      actividad: ActividadClase;
      estado: EstadoClase;
      nota?: string | null;
    }
  >;
  reservas: RefineTable<
    RawTables["reservas"],
    {
      estado: EstadoReserva;
    }
  >;
  feedback_clase: RefineTable<
    RawTables["feedback_clase"],
    {
      sensacion: SensacionClase;
    }
  >;
  logros_racha: RefineTable<
    RawTables["logros_racha"],
    {
      tipo: TipoLogroRacha;
    }
  >;
};

type RawFunctions = GeneratedDatabase["public"]["Functions"];

type NullableOptionalArgs<TArgs> = {
  [K in keyof TArgs]: undefined extends TArgs[K] ? TArgs[K] | null : TArgs[K];
};

type KpisNegocioReturnRow = {
  ingresos: number | null;
  ingresos_6m: number[] | null;
  ingresos_periodo_anterior: number | null;
  cobranza_esperada: number | null;
  cobranza_pendiente_monto: number | null;
  cobranza_vencidas_cant: number;
  sin_entrenar_7d_ids: string[];
  activos_fin: number;
  altas: number;
  bajas: number;
  ingresos_presencial?: number | null;
  ingresos_online?: number | null;
  cobranza_vencida_monto?: number | null;
  cobranza_por_vencer_monto?: number | null;
  alumnos_al_dia?: number;
  alumnos_morosos?: number;
};

type RefinedFunctions = {
  [F in keyof RawFunctions]: {
    Args: F extends "registrar_pago"
      ? Omit<RawFunctions[F]["Args"], "p_nota"> & { p_nota: string | null }
      : RawFunctions[F]["Args"] extends Record<string, unknown>
        ? NullableOptionalArgs<RawFunctions[F]["Args"]>
        : RawFunctions[F]["Args"];
    Returns: F extends "obtener_kpis_negocio"
      ? KpisNegocioReturnRow[]
      : RawFunctions[F]["Returns"];
  };
};

export interface Database {
  public: {
    Tables: RefinedTables;
    Views: GeneratedDatabase["public"]["Views"];
    Functions: RefinedFunctions;
    Enums: GeneratedDatabase["public"]["Enums"];
    CompositeTypes: GeneratedDatabase["public"]["CompositeTypes"];
  };
}

type PublicSchema = Database["public"];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never;

export type Perfil = Tables<"perfiles">;
export type Ejercicio = Tables<"ejercicios">;
export type PlanEntrenamiento = Tables<"planes_entrenamiento">;
export type DiaRutina = Tables<"dias_rutina">;
export type EjercicioEnRutina = Tables<"ejercicios_en_rutina">;
export type RegistroSesion = Tables<"registro_sesiones">;
export type RegistroSerie = Tables<"registro_series">;
/**
 * @deprecated GOZS-718: la tabla N:M se eliminó; el vínculo coach↔alumno es
 * perfiles.profesor_asignado_id. Se conserva la forma solo para mocks y
 * simulaciones en memoria.
 */
export interface EntrenadorAlumno {
  id: string;
  entrenador_id: string;
  alumno_id: string;
  rol_entrenador: string;
  es_principal: boolean;
  created_at: string;
  updated_at: string;
}
export type Conversacion = Tables<"conversaciones">;
export type Mensaje = Tables<"mensajes">;
export type ConversacionInsert = TablesInsert<"conversaciones">;
export type ConversacionUpdate = TablesUpdate<"conversaciones">;
export type MensajeInsert = TablesInsert<"mensajes">;
export type MensajeUpdate = TablesUpdate<"mensajes">;
export type AlertaEntrenador = Tables<"alertas_entrenador">;
export type AlertaEntrenadorInsert = TablesInsert<"alertas_entrenador">;
export type AlertaEntrenadorUpdate = TablesUpdate<"alertas_entrenador">;
export type AlumnoHistorialDolor = Tables<"alumno_historial_dolor">;
export type AlumnoHistorialDolorInsert = TablesInsert<"alumno_historial_dolor">;
export type AlumnoHistorialDolorUpdate = TablesUpdate<"alumno_historial_dolor">;

export type Contratacion = Tables<"contrataciones">;
export type ContratacionInsert = TablesInsert<"contrataciones">;
export type ContratacionUpdate = TablesUpdate<"contrataciones">;
export type Cobro = Tables<"cobros">;
export type AlumnoActividad = Tables<"alumno_actividades">;
export type FichaAlumnoActividades = {
  alumno_id: string;
  actividades: Pick<AlumnoActividad, "actividad" | "veces_por_semana" | "pase_libre">[];
  ultima_suscripcion: {
    contratacion_id: string;
    estado: Contratacion["estado"];
    fecha_fin: string;
    monto: number | null;
    ultimo_cobro: { periodo: string; monto: number; estado: EstadoCobro } | null;
  } | null;
};
export type CobroInsert = TablesInsert<"cobros">;
export type Pago = Tables<"pagos">;
export type AuditoriaCambio = Tables<"auditoria_cambios">;
export type AuditoriaCambioInsert = TablesInsert<"auditoria_cambios">;
export type AuditoriaCambioUpdate = TablesUpdate<"auditoria_cambios">;

export type SustitucionEjercicio = Tables<"sustituciones_ejercicios">;
export type SustitucionEjercicioInsert = TablesInsert<"sustituciones_ejercicios">;
export type SustitucionEjercicioUpdate = TablesUpdate<"sustituciones_ejercicios">;
export type AlumnoCuestionarioInicial = Tables<"alumno_cuestionario_inicial">;
export type AlumnoCuestionarioInicialInsert = TablesInsert<"alumno_cuestionario_inicial">;
export type AlumnoCuestionarioInicialUpdate = TablesUpdate<"alumno_cuestionario_inicial">;
export type PlanMembresia = Tables<"planes_membresia">;
export type ClaseHorario = Tables<"clases_horario">;
export type Clase = Tables<"clases">;
export type Feriado = Tables<"feriados">;
export type ClaseProfesor = Tables<"clases_profesores">;
export type Reserva = Tables<"reservas">;
export type FeedbackClase = Tables<"feedback_clase">;
export type FeedbackClaseInsert = TablesInsert<"feedback_clase">;
export type FeedbackClaseUpdate = TablesUpdate<"feedback_clase">;
export type ClaseFija = Tables<"clases_fijas">;
/** PR por clase que arma el ranking a partir de `v_prs` (ver src/lib/ranking-prs.ts). */
export interface RankingPR {
  id: string;
  clase_id: string;
  alumno_id: string;
  ejercicio_id: string;
  peso_kg: number;
  reps: number;
  fecha: string;
  registrado_por: string;
  created_at: string;
  updated_at: string;
}
export type PrView = Database["public"]["Views"]["v_prs"]["Row"];
export type LogroRacha = Tables<"logros_racha">;
export type LogroRachaInsert = TablesInsert<"logros_racha">;
export type LogroRachaUpdate = TablesUpdate<"logros_racha">;

export type DolorActivoView = Database["public"]["Views"]["v_dolor_activo"]["Row"];

export type { GeneratedDatabase, GeneratedEnums, GeneratedTables, GeneratedTablesInsert, GeneratedTablesUpdate };
