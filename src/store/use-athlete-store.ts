import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-storage";
import { calculateEpley1RM, calculateEffectiveVolume } from "@/lib/strength-metrics";
import { isWarmup, isDropset, isWorkingSet, normalizeSerieTipo } from "@/lib/serie-tipo";
import { parseDefaultReps, sortExercisesWithWarmupFirst } from "@/lib/routine-helpers";
import { playRestTimerAlert, triggerHapticVibration } from "@/lib/sound";
import { useOfflineQueueStore } from "./use-offline-queue";
import { supabase } from "@/lib/supabase/client";
import { crearBackoff } from "@/lib/sync-backoff";
import {
  fetchPlanAlumno,
  fetchSesionesRecientesAlumno,
  type LiveSupabaseDataset,
  type SesionFechaResumen,
} from "@/services/alumnos-service";
import { esFechaEnSemanaActual } from "@/lib/athlete-dias";
import type {
  NivelVistaAlumno,
  AlumnoCuestionarioInicial,
  MotivoCambioDia,
  RegistroSerie,
  RegistroSesion,
} from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import type { RecordSesionItem } from "@/components/athlete/cierre-dia-modal";
import { ultimaVezDeEjercicio, type SerieHistorica, type UltimaVezEjercicio } from "@/lib/historial-ejercicio";
import {
  agregarSerieAMarcas,
  marcasDeEjercicio,
  type MarcasEjercicio,
  type SerieCandidata,
} from "@/lib/record-ejercicio";
import { agregarMiProgreso, type MiProgresoData, type SesionHistorica } from "@/lib/mi-progreso";
import {
  nivelMolestia,
  type MolestiaSesion,
  type MomentoMolestia,
  type ZonaArticular,
} from "@/lib/athlete/molestias";
import { getStorageUser } from "@/lib/user-storage";
import {
  extensionDeArchivoVideo,
  normalizarEnlaceVideo,
  validarArchivoVideo,
} from "@/lib/athlete/video-serie";
import {
  leerCantidadDiamantes,
  registrarLogroRachaIdempotente,
} from "@/lib/racha-logros";
import {
  eliminarVideoPendiente,
  encolarVideo,
  reintentarVideoPendiente,
  subirPendientes,
  type SetVideoSnapshot,
  type SubirPendientesOpciones,
  type VideoPendiente,
} from "@/lib/athlete/video-subida";

import {
  NOMBRE_PREFERIDO_MAX_LEN,
  normalizarNombrePreferido,
} from "@/lib/athlete/nombre";
import { esUuid, nuevoUuid } from "@/lib/athlete/uuid";


export interface ReportarMolestiaInput {
  ejercicioEnRutinaId: string;
  ejercicioId: string;
  numeroSerie?: number | null;
  zona: ZonaArticular;
  eva: number;
  sintomas?: string[];
  momento?: MomentoMolestia | null;
  notas?: string | null;
}

export type AthleteMembershipStatus = "ACTIVE" | "EXPIRED_PAYMENT_PENDING";
export type VideoEstadoSerie = "ninguno" | "telefono" | "subiendo" | "listo" | "error";

export interface LiveWorkoutSet {
  numero_serie: number;
  peso_kg: number;
  reps_hechas: number;
  rpe_real: number | null;
  completada: boolean;
  estimated1RM: number;
  completedAt?: string;
  set_type?: "W" | "N" | "F" | "D" | "WARMUP" | "NORMAL" | "FAILURE" | "DROPSET";
  pain_reported?: boolean;
  pain_notes?: string;
  video_url?: string | null;
  videoEstado?: VideoEstadoSerie;
  last_session_weight_kg?: number;
  last_session_reps?: number;
  atipica?: boolean;
}

export interface LiveWorkoutExercise {
  id: string;
  ejercicio_id?: string; // ejercicios_en_rutina.ejercicio_id: ejercicio canónico del catálogo
  nombre: string;
  musculos_principales: string[];
  descanso_segundos: number;
  rpe_objetivo: number | string;
  repeticiones_objetivo: string;
  series: LiveWorkoutSet[];
  url_video?: string | null;
  comentario?: string | null;
  notas?: string | null;
  tempo?: string;
  tempo_activo?: boolean;
  force_rpe_required?: boolean;
  es_superserie?: boolean;
  grupo_superserie?: number | null;
  tipo_serie?: "NORMAL" | "WARMUP" | "DROPSET";
  tipo_medicion?: "REPS" | "TIEMPO";
  tiempo_objetivo_segundos?: number | null;
  es_unilateral?: boolean;
  usa_barra?: boolean; // GOZS-873: public.ejercicios.usa_barra (barra libre cargable con discos)
}

export interface LiveWorkoutSession {
  id: string;
  nombre_rutina: string;
  fecha: string;
  ejercicios: LiveWorkoutExercise[];
  studentName?: string;
  studentId?: string;
  dia_id?: string;
  dia_sugerido_id?: string | null;
  motivo_cambio_dia?: MotivoCambioDia | null;
  molestias?: MolestiaSesion[];
}

export interface RestTimerState {
  isActive: boolean;
  isPaused: boolean;
  secondsRemaining: number;
  totalSeconds: number;
  exerciseName: string;
  setNumber: number;
  /** Vencimiento absoluto (Date.now()) mientras corre; null en pausa/detenido. */
  endsAt?: number | null;
}

interface AthleteStoreState {
  membershipStatus: AthleteMembershipStatus;
  currentSession: LiveWorkoutSession;
  restTimer: RestTimerState;
  rpeValidationError: string | null;
  rpeReminderNotification: string | null;
  stopProtocolActive: boolean;
  molestiasPendientesFueraDeSesion: MolestiaSesion[];
  molestiaEnvioError: string | null;
  molestiasErrorRegistradoIds: string[];
  nivelVistaAlumno: NivelVistaAlumno;
  vistaElegidaPorAlumno: NivelVistaAlumno | null;
  vistaRecomendadaCoach: NivelVistaAlumno;
  cuestionarioInicial: AlumnoCuestionarioInicial | null;
  // Preferencias del onboarding de primera vez (GOZS-145 / GH #548).
  onboardingCompletado: boolean;
  onboardingCompletadoPendiente: boolean;
  mostrarTimerDescanso: boolean;
  // Estado del Inicio Mis días (GOZS-147 + GOZS-149) y shell v7 (FE-02)
  diaActivoId: string | null;
  sessionStartedAt: number | null;
  ejercicioAbiertoId: string | null;
  cierreAbierto: boolean;
  cuestionarioAbierto: boolean;
  toastSesion: {
    mensaje: string;
    tipo: "ok" | "neutral" | "rec";
    irAHistorial?: boolean;
  } | null;
  diaElegidoHoyId: string | null;
  diaSugeridoId: string | null;
  motivoCambioDia: MotivoCambioDia | null;
  sesionesCompletadas: Array<{
    id: string;
    dia_id: string;
    fecha: string;
    dia_sugerido_id?: string | null;
    motivo_cambio_dia?: MotivoCambioDia | null;
  }>;
  /** Fechas reales de `registro_sesiones` hidratadas desde Supabase para racha multi-dispositivo. */
  fechasSesionesServidor: string[];
  /** Cantidad de logros permanentes Llama Diamante (`logros_racha`, fallback 0). */
  diamantesRacha: number;
  /** Ciclos ya registrados/encolados localmente para evitar reenvíos duplicados. */
  ciclosLogroRegistrados: number[];
  // "La última vez" por ejercicio_id (GOZS-159). null = sin historial; undefined = todavía no consultado.
  ultimaVez: Record<string, UltimaVezEjercicio | null>;
  cargandoUltimaVez: boolean;
  // Marcas históricas por ejercicio_id para decidir récords offline (GOZS-161). null = sin historial.
  marcas: Record<string, MarcasEjercicio | null>;
  // Récords registrados en la sesión activa (se conservan entre EjercicioActivo, RutinaDelDia y CierreDiaModal).
  seriesRecordIds: string[];
  sessionPRs: RecordSesionItem[];
  // "Mi progreso" (GOZS-162). null = todavía sin descargar; se persiste para verse offline.
  miProgreso: MiProgresoData | null;
  miProgresoFecha: string | null; // ISO de la última descarga
  cargandoMiProgreso: boolean;
  pasoIncrementoPeso: number;
  colapsarRutina: boolean;
  historialSesiones: HistoricalLoadEntry[];
  cargandoHistorial: boolean;
  // Nombre preferido (BE-01 / D-53). nombrePreferidoPendiente === undefined => sin pendiente.
  nombrePreferido: string | null;
  nombrePreferidoPendiente: string | null | undefined;

  // Actions
  guardarNombrePreferido: (
    nombre: string | null,
  ) => Promise<{ success: boolean; offline?: boolean; error?: string }>;
  sincronizarNombrePreferidoPendiente: () => Promise<boolean>;
  cargarUltimaVez: () => Promise<void>;
  // Descarga y agrega "Mi progreso" del alumno (§4.3); offline mantiene lo persistido.
  cargarMiProgreso: () => Promise<void>;
  cargarHistorialSesiones: () => Promise<void>;
  actualizarSerieHistorial: (
    sesionId: string,
    serieId: string,
    pesoKg: number,
    repsHechas: number,
    atipica?: boolean,
  ) => Promise<void>;
  // Suma una serie recién registrada a las marcas en memoria (§3.3), para no repetir el récord.
  registrarSerieEnMarcas: (ejercicioId: string, serie: SerieCandidata) => void;
  registrarRecordSesion: (serieKey: string, pr: RecordSesionItem) => void;
  empezarDia: (diaId: string) => void;
  volverAlInicio: () => void;
  setEjercicioAbiertoId: (ejercicioId: string | null) => void;
  setCierreAbierto: (abierto: boolean) => void;
  setCuestionarioAbierto: (abierto: boolean) => void;
  setToastSesion: (
    toast: { mensaje: string; tipo: "ok" | "neutral" | "rec"; irAHistorial?: boolean } | null,
  ) => void;
  consumirNavegacionHistorialToast: () => void;
  elegirOtroDia: (
    diaId: string,
    motivo?: MotivoCambioDia | null,
    diaSugeridoId?: string | null,
  ) => void;
  deshacerCambioDia: () => void;
  marcarDiaCompletado: (diaId: string) => void;
  setMembershipStatus: (status: AthleteMembershipStatus) => void;
  setPasoIncrementoPeso: (paso: number) => void;
  setColapsarRutina: (colapsar: boolean) => void;
  deleteCompletedSet: (exerciseId: string, setNumber: number) => void;
  setStopProtocolActive: (active: boolean) => void;
  setNivelVistaAlumno: (nivel: NivelVistaAlumno) => void;
  usarVistaRecomendada: () => void;
  setOnboardingCompletado: (completado: boolean) => void;
  completarOnboarding: () => Promise<{ success: boolean; offline?: boolean; error?: string }>;
  sincronizarOnboardingPendiente: () => Promise<boolean>;
  setMostrarTimerDescanso: (mostrar: boolean) => void;
  setCuestionarioInicial: (data: AlumnoCuestionarioInicial | null) => void;
  saveCuestionarioInicial: (
    data: Partial<AlumnoCuestionarioInicial>,
  ) => Promise<{ success: boolean; error?: string }>;
  clearRpeValidationError: () => void;
  clearRpeReminderNotification: () => void;
  updateSetField: (
    exerciseId: string,
    setNumber: number,
    field: "peso_kg" | "reps_hechas" | "rpe_real",
    value: number | null,
  ) => void;
  updateSetType: (
    exerciseId: string,
    setNumber: number,
    type: "W" | "N" | "F" | "D",
  ) => void;
  updateExerciseTipoSerie: (
    exerciseId: string,
    tipo_serie: "NORMAL" | "WARMUP" | "DROPSET",
  ) => void;
  reportPainForSet: (
    exerciseId: string,
    setNumber: number,
    notes: string,
  ) => void;
  reportarMolestia: (datos: ReportarMolestiaInput) => Promise<MolestiaSesion>;
  flushMolestiasPendientes: () => Promise<void>;
  cargarMolestiasDeSesion: (sesionId?: string) => Promise<void>;
  adjuntarVideoASerie: (
    ejercicioEnRutinaId: string,
    numeroSerie: number,
    origen: { tipo: "enlace"; url: string } | { tipo: "archivo"; file: File },
  ) => Promise<"ok" | "invalido" | "muy-pesado" | "muy-largo" | "formato">;
  quitarVideoDeSerie: (ejercicioEnRutinaId: string, numeroSerie: number) => void;
  reintentarVideoDeSerie: (ejercicioEnRutinaId: string, numeroSerie: number) => Promise<void>;
  sincronizarVideosPendientes: (alumnoId?: string) => Promise<void>;
  attachVideoForSet: (
    exerciseId: string,
    setNumber: number,
    videoUrl: string,
  ) => void;
  applyWarmupSetsToExercise: (
    exerciseId: string,
    warmupSets: Array<{ peso_kg: number; reps: number; setNumber: number }>,
  ) => void;
  registerWarmupSet: (
    exerciseId: string,
    warmup: { peso_kg: number; reps: number; rpe_real?: number },
  ) => void;
  completeSet: (exerciseId: string, setNumber: number, atipica?: boolean) => void;
  uncompleteSet: (exerciseId: string, setNumber: number) => void;
  editCompletedSet: (
    exerciseId: string,
    setNumber: number,
    pesoKg: number,
    reps: number,
    atipica?: boolean,
  ) => void;
  syncSessionToSupabase: () => Promise<{ success: boolean; error?: string }>;

  // Timer Actions
  startRestTimer: (seconds: number, exerciseName: string, setNumber: number) => void;
  tickTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  addTimerSeconds: (seconds: number) => void;

  // Session & Routine Loaders
  planAlumno: LiveSupabaseDataset | null;
  cargandoPlan: boolean;
  errorPlan: boolean;
  cargarPlanAlumno: () => Promise<void>;
  setSession: (session: LiveWorkoutSession) => void;
  loadStudentSession: (
    studentId?: string,
    diaId?: string,
    motivo?: MotivoCambioDia | null,
    diaSugeridoId?: string | null,
  ) => boolean;
  resetSessionToDefaults: () => void;
  repararSesionesNoUuid: () => void;
  cargarLogrosRacha: (alumnoId?: string) => Promise<void>;
  verificarYRegistrarLogroDiamante: (semanas: number, alumnoId?: string) => Promise<void>;
}

export const DEFAULT_ATHLETE_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_ATHLETE_NAME = "Alumno GOZSter";

const defaultSession: LiveWorkoutSession = {
  id: "session-today-001",
  nombre_rutina: "Rutina Base — Día 1",
  fecha: new Date().toISOString().split("T")[0] || "2026-10-16",
  studentName: DEFAULT_ATHLETE_NAME,
  studentId: DEFAULT_ATHLETE_ID,
  dia_id: "00000000-0000-4000-8000-000000000011",
  molestias: [],
  ejercicios: [
    {
      id: "ej-sentadilla-1",
      ejercicio_id: "ej-sentadilla-con-barra",
      nombre: "Sentadilla Trasera con Barra",
      musculos_principales: ["Cuádriceps", "Glúteos", "Core"],
      usa_barra: true,
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "4 a 6 (descendente)",
      url_video: "bEv6CCg2BC8",
      comentario: "Serie 1: 4 a 6 @ RPE 8. Serie 2-3: 2 a 4 @ RPE 9. Serie 4: 1 a 2 @ RPE 10. Mantener el pecho erguido y descenso controlado.",
      notas: "Serie 1: 4 a 6 @ RPE 8. Serie 2-3: 2 a 4 @ RPE 9. Serie 4: 1 a 2 @ RPE 10. Mantener el pecho erguido y descenso controlado.",
      series: [
        { numero_serie: 1, peso_kg: 120, reps_hechas: 5, rpe_real: 8, completada: false, estimated1RM: calculateEpley1RM(120, 5) },
        { numero_serie: 2, peso_kg: 130, reps_hechas: 4, rpe_real: 9, completada: false, estimated1RM: calculateEpley1RM(130, 4) },
        { numero_serie: 3, peso_kg: 135, reps_hechas: 3, rpe_real: 9, completada: false, estimated1RM: calculateEpley1RM(135, 3) },
        { numero_serie: 4, peso_kg: 140, reps_hechas: 2, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(140, 2) },
      ],
    },
    {
      id: "ej-press-plano-barra",
      ejercicio_id: "ej-press-plano-con-barra",
      nombre: "Press de Banca Plano",
      musculos_principales: ["Pectorales", "Tríceps", "Deltoides Frontal"],
      usa_barra: true,
      descanso_segundos: 120,
      rpe_objetivo: 8,
      repeticiones_objetivo: "4 a 6 (descendente)",
      url_video: "rT7DgCr-3pg",
      comentario: "Serie 1: 4 a 6 @ RPE 8. Serie 2-3: 2 a 4 @ RPE 9. Serie 4: 1 a 2 @ RPE 10. Retracción escapular activa.",
      notas: "Serie 1: 4 a 6 @ RPE 8. Serie 2-3: 2 a 4 @ RPE 9. Serie 4: 1 a 2 @ RPE 10. Retracción escapular activa.",
      series: [
        { numero_serie: 1, peso_kg: 90, reps_hechas: 6, rpe_real: 8, completada: false, estimated1RM: calculateEpley1RM(90, 6) },
        { numero_serie: 2, peso_kg: 95, reps_hechas: 4, rpe_real: 9, completada: false, estimated1RM: calculateEpley1RM(95, 4) },
        { numero_serie: 3, peso_kg: 100, reps_hechas: 3, rpe_real: 9, completada: false, estimated1RM: calculateEpley1RM(100, 3) },
        { numero_serie: 4, peso_kg: 105, reps_hechas: 2, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(105, 2) },
      ],
    },
    {
      id: "ej-sentadilla-isom",
      ejercicio_id: "ej-sentadilla-isometrica-unilateral",
      nombre: "Sentadilla isométrica unilateral (Warm up)",
      musculos_principales: ["Cuádriceps", "Glúteos"],
      descanso_segundos: 60,
      rpe_objetivo: 6,
      repeticiones_objetivo: "15'' x lado",
      url_video: "Sz2LLBq_Krs",
      comentario: "Calentamiento específico: 3 series de 15 segundos por pierna.",
      tipo_serie: "WARMUP",
      notas: "Calentamiento específico: 3 series de 15 segundos por pierna.",
      series: [
        { numero_serie: 1, peso_kg: 0, reps_hechas: 15, rpe_real: 6, completada: false, estimated1RM: 0, set_type: "W" },
        { numero_serie: 2, peso_kg: 0, reps_hechas: 15, rpe_real: 6, completada: false, estimated1RM: 0, set_type: "W" },
        { numero_serie: 3, peso_kg: 0, reps_hechas: 15, rpe_real: 6, completada: false, estimated1RM: 0, set_type: "W" },
      ],
    },
    {
      id: "ej-press-inclinado-smith",
      ejercicio_id: "ej-press-inclinado-en-smith-con-agarre-cerrado",
      nombre: "Press Inclinado en Smith con Agarre Cerrado",
      musculos_principales: ["Pectoral Superior", "Tríceps"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "6 a 10",
      url_video: "8urE8Z8AMQ4",
      comentario: "3 series de 6 a 10 repeticiones a RPE 8.",
      force_rpe_required: true,
      es_superserie: true,
      grupo_superserie: 1,
      tipo_serie: "DROPSET",
      notas: "3 series de 6 a 10 repeticiones a RPE 8.",
      series: [
        { numero_serie: 1, peso_kg: 60, reps_hechas: 10, rpe_real: 0, completada: false, estimated1RM: calculateEpley1RM(60, 10), set_type: "DROPSET" },
        { numero_serie: 2, peso_kg: 65, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: calculateEpley1RM(65, 8), set_type: "DROPSET" },
        { numero_serie: 3, peso_kg: 70, reps_hechas: 7, rpe_real: 8, completada: false, estimated1RM: calculateEpley1RM(70, 7), set_type: "DROPSET" },
      ],
    },
    {
      id: "ej-estocadas-caminando",
      ejercicio_id: "ej-estocadas-caminando-con-mancuernas",
      nombre: "Estocadas Caminando con Mancuernas",
      musculos_principales: ["Glúteos", "Cuádriceps"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "8 x lado",
      url_video: "eFWCn5iEbTU",
      comentario: "3 series de 8 pasos por pierna a RPE 8.",
      es_superserie: true,
      grupo_superserie: 1,
      notas: "3 series de 8 pasos por pierna a RPE 8.",
      series: [
        { numero_serie: 1, peso_kg: 20, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: calculateEpley1RM(20, 8) },
        { numero_serie: 2, peso_kg: 22, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: calculateEpley1RM(22, 8) },
        { numero_serie: 3, peso_kg: 24, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: calculateEpley1RM(24, 8) },
      ],
    },
    {
      id: "ej-fondos-paralelas",
      ejercicio_id: "ej-fondos-en-barra-paralelas",
      nombre: "Fondos en Barra Paralelas",
      musculos_principales: ["Pectorales", "Tríceps"],
      descanso_segundos: 90,
      rpe_objetivo: 10,
      repeticiones_objetivo: "6 a 12",
      url_video: "eERwCQHZqfA",
      comentario: "3 series de 6 a 12 al fallo técnico (RPE 10).",
      notas: "3 series de 6 a 12 al fallo técnico (RPE 10).",
      series: [
        { numero_serie: 1, peso_kg: 0, reps_hechas: 12, rpe_real: 9.5, completada: false, estimated1RM: 0 },
        { numero_serie: 2, peso_kg: 10, reps_hechas: 10, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(10, 10) },
        { numero_serie: 3, peso_kg: 15, reps_hechas: 8, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(15, 8) },
      ],
    },
    {
      id: "ej-sillon-cuadriceps",
      ejercicio_id: "ej-sillon-de-cuadriceps",
      nombre: "Sillón de Cuádriceps",
      musculos_principales: ["Cuádriceps"],
      descanso_segundos: 75,
      rpe_objetivo: 10,
      repeticiones_objetivo: "8 a 12",
      url_video: "MpEydcQ1oDw",
      comentario: "3 series de 8 a 12 al fallo (RPE 10). Pausa de 1s en contracción máxima.",
      notas: "3 series de 8 a 12 al fallo (RPE 10). Pausa de 1s en contracción máxima.",
      series: [
        { numero_serie: 1, peso_kg: 65, reps_hechas: 12, rpe_real: 9.5, completada: false, estimated1RM: calculateEpley1RM(65, 12) },
        { numero_serie: 2, peso_kg: 70, reps_hechas: 10, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(70, 10) },
        { numero_serie: 3, peso_kg: 75, reps_hechas: 8, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(75, 8) },
      ],
    },
    {
      id: "ej-extension-triceps-v",
      ejercicio_id: "ej-extension-de-triceps-barra-v",
      nombre: "Extensión de tríceps barra V",
      musculos_principales: ["Tríceps"],
      descanso_segundos: 60,
      rpe_objetivo: 10,
      repeticiones_objetivo: "DROP-SET",
      url_video: "v7f6PjSAO-4",
      comentario: "3 series con DROP-SET: primer serie al fallo, reducir peso sin descanso y continuar al fallo.",
      notas: "3 series con DROP-SET: primer serie al fallo, reducir peso sin descanso y continuar al fallo.",
      series: [
        { numero_serie: 1, peso_kg: 40, reps_hechas: 12, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(40, 12) },
        { numero_serie: 2, peso_kg: 30, reps_hechas: 10, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(30, 10) },
        { numero_serie: 3, peso_kg: 20, reps_hechas: 8, rpe_real: 10, completada: false, estimated1RM: calculateEpley1RM(20, 8) },
      ],
    },
  ],
};

const PERMANENT_MOLESTIA_CODES = new Set(["42501", "23514"]);
const MISSING_SCHEMA_MOLESTIA_CODES = new Set(["PGRST202", "42883", "42P01"]);
export const MOLESTIA_ENVIO_ERROR_MSG =
  "No pudimos avisarle a tu coach. Si la molestia es fuerte, escribile por el chat.";

type ResultadoEnvioMolestia =
  | { estado: "enviada" }
  | { estado: "error"; registrarError: boolean }
  | { estado: "pendiente"; missingSchema: boolean; registrarError: boolean };

async function registrarErrorMolestiaApp(
  molestia: MolestiaSesion,
  studentId: string | null,
  code: string,
  errorMessage: string | undefined,
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const authUser = (await supabase.auth.getUser())?.data?.user?.id;
    const usuarioId = authUser || (esUuid(studentId) ? studentId : null);
    if (!usuarioId) return false;
    await supabase.from("errores_app").insert({
      usuario_id: usuarioId,
      contexto: "molestia",
      mensaje_humano: "No se pudo guardar el reporte de molestia.",
      detalle_tecnico: `${code}: ${errorMessage ?? ""}`.slice(0, 500),
      payload_resumen: {
        id: molestia.id,
        sesion_id: molestia.sesionId,
        zona: molestia.zona,
        eva: molestia.eva,
        code,
      },
    });
    return true;
  } catch {
    // Silencioso si el registro en errores_app falla
    return false;
  }
}

function fusionarPendientesFueraDeSesion(
  fueraActual: MolestiaSesion[],
  molestiasSesion: MolestiaSesion[] | undefined,
): MolestiaSesion[] {
  const pendientes = (molestiasSesion ?? []).filter((m) => m.envio === "pendiente");
  if (pendientes.length === 0) return fueraActual;
  const ids = new Set(fueraActual.map((m) => m.id));
  const nuevas = pendientes.filter((m) => !ids.has(m.id));
  return nuevas.length > 0 ? [...fueraActual, ...nuevas] : fueraActual;
}

async function enviarMolestiaRpc(
  molestia: MolestiaSesion,
  diaId: string | null,
  studentId: string | null,
  yaRegistradoError: boolean,
): Promise<ResultadoEnvioMolestia> {
  if (!supabase) {
    return { estado: "pendiente", missingSchema: false, registrarError: false };
  }

  try {
    const { error } = await (supabase as any).rpc("registrar_molestia", {
      p_id: molestia.id,
      p_sesion_id: molestia.sesionId,
      p_ejercicio_id: molestia.ejercicioId,
      p_zona: molestia.zona,
      p_eva: molestia.eva,
      p_dia_id: esUuid(diaId) ? diaId : null,
      p_ejercicio_en_rutina_id: esUuid(molestia.ejercicioEnRutinaId)
        ? molestia.ejercicioEnRutinaId
        : null,
      p_numero_serie: molestia.numeroSerie,
      p_momento: molestia.momento,
      p_sintomas: molestia.sintomas,
      p_notas: molestia.notas,
    });

    if (!error) return { estado: "enviada" };

    const code = typeof error.code === "string" ? error.code : "";
    if (PERMANENT_MOLESTIA_CODES.has(code)) {
      let registrado = yaRegistradoError;
      if (!yaRegistradoError) {
        registrado = await registrarErrorMolestiaApp(
          molestia,
          studentId,
          code,
          error.message,
        );
      }
      return { estado: "error", registrarError: registrado };
    }

    if (MISSING_SCHEMA_MOLESTIA_CODES.has(code)) {
      let registrado = yaRegistradoError;
      if (!yaRegistradoError) {
        registrado = await registrarErrorMolestiaApp(
          molestia,
          studentId,
          code,
          error.message,
        );
      }
      return {
        estado: "pendiente",
        missingSchema: true,
        registrarError: registrado,
      };
    }

    return { estado: "pendiente", missingSchema: false, registrarError: false };
  } catch {
    return { estado: "pendiente", missingSchema: false, registrarError: false };
  }
}

let activeSyncSessionPromise: Promise<{ success: boolean; error?: string }> | null = null;
let activeFlushMolestiasPromise: Promise<void> | null = null;
// GOZS-695: una molestia que falla de forma transitoria se reintenta con backoff;
// al agotar los intentos el alumno ve el aviso y la molestia sigue guardada.
const backoffMolestias = crearBackoff(
  () => void useAthleteStore.getState().flushMolestiasPendientes(),
  () => useAthleteStore.setState({ molestiaEnvioError: MOLESTIA_ENVIO_ERROR_MSG }),
);
/** Corta el reintento pendiente y el contador (cambio de usuario / logout). */
export const resetBackoffMolestias = () => backoffMolestias.reset();
let activeSyncNombrePromise: Promise<boolean> | null = null;
let activeSyncOnboardingPromise: Promise<boolean> | null = null;

const PERMANENT_NOMBRE_RPC_CODES = new Set(["22001", "42501", "23514"]);

type PerfilConNombrePreferido = LiveSupabaseDataset["alumnos"][number] & {
  nombre_preferido?: string | null;
  onboarding_completado?: boolean;
};

function actualizarPrimerAlumnoEnPlan(
  plan: LiveSupabaseDataset | null,
  patch: Partial<PerfilConNombrePreferido>,
): LiveSupabaseDataset | null {
  if (!plan || plan.alumnos.length === 0) return plan;
  const [primero, ...resto] = plan.alumnos;
  if (!primero) return plan;
  const actualizado: PerfilConNombrePreferido = { ...primero, ...patch };
  return { ...plan, alumnos: [actualizado, ...resto] };
}

async function enviarOnboardingCompletadoRpc(
  set: (fn: (state: AthleteStoreState) => Partial<AthleteStoreState>) => void,
): Promise<{ ok: boolean; permanentError?: string }> {
  try {
    const { error } = await supabase.rpc("completar_onboarding_alumno");
    if (error) {
      if (error.code && PERMANENT_NOMBRE_RPC_CODES.has(error.code)) {
        set(() => ({ onboardingCompletadoPendiente: false }));
        return { ok: false, permanentError: error.message };
      }
      console.warn("Aviso guardando onboarding_completado en Supabase (queda pendiente):", error.message);
      return { ok: false };
    }

    set((state) => ({
      onboardingCompletado: true,
      onboardingCompletadoPendiente: false,
      planAlumno: actualizarPrimerAlumnoEnPlan(state.planAlumno, { onboarding_completado: true }),
    }));
    return { ok: true };
  } catch (err: unknown) {
    console.warn(
      "Excepción guardando onboarding_completado (queda pendiente offline):",
      err instanceof Error ? err.message : err,
    );
    return { ok: false };
  }
}

async function enviarNombrePreferidoRpc(
  valor: string | null,
  set: (fn: (state: AthleteStoreState) => Partial<AthleteStoreState>) => void,
): Promise<{ ok: boolean; permanentError?: string }> {
  try {
    const client = supabase as unknown as {
      rpc: (
        fn: string,
        args: { p_nombre: string | null },
      ) => Promise<{ data: string | null; error: { message: string; code?: string } | null }>;
    };
    const { data, error } = await client.rpc("actualizar_nombre_preferido", { p_nombre: valor });
    if (error) {
      if (error.code && PERMANENT_NOMBRE_RPC_CODES.has(error.code)) {
        set((state) =>
          state.nombrePreferidoPendiente === valor
            ? { nombrePreferidoPendiente: undefined }
            : {},
        );
        return { ok: false, permanentError: error.message };
      }
      console.warn("Aviso guardando nombre_preferido en Supabase (queda pendiente):", error.message);
      return { ok: false };
    }

    const confirmado = data ?? null;
    set((state) => {
      if (state.nombrePreferidoPendiente !== valor) {
        return {};
      }
      return {
        nombrePreferido: confirmado,
        nombrePreferidoPendiente: undefined,
        planAlumno: actualizarPrimerAlumnoEnPlan(state.planAlumno, { nombre_preferido: confirmado }),
      };
    });
    return { ok: true };
  } catch (err: unknown) {
    console.warn(
      "Excepción guardando nombre_preferido (queda pendiente offline):",
      err instanceof Error ? err.message : err,
    );
    return { ok: false };
  }
}

function reencolarSerieCompletadaConVideo(
  ses: LiveWorkoutSession,
  ej: LiveWorkoutExercise,
  s: LiveWorkoutSet,
  videoUrl: string | null,
  fallbackAlumnoId?: string,
): void {
  useOfflineQueueStore.getState().enqueueEvent({
    id: `set-video-${ej.id}-${s.numero_serie}-${Date.now()}`,
    action: "WORKOUT_SET_COMPLETED",
    payload: {
      sessionId: ses.id,
      alumnoId: ses.studentId ?? fallbackAlumnoId,
      diaId: ses.dia_id,
      ejercicioId: ej.ejercicio_id ?? ej.id,
      exerciseId: ej.id,
      exerciseName: ej.nombre,
      setNumber: s.numero_serie,
      pesoKg: s.peso_kg,
      reps: s.reps_hechas,
      rpe: normalizarRpeReal(s.rpe_real),
      setType: normalizeSerieTipo(s.set_type ?? ej.tipo_serie),
      painReported: s.pain_reported || false,
      painNotes: s.pain_notes || null,
      videoUrl,
      estimated1RM: s.estimated1RM ?? calculateEpley1RM(s.peso_kg, s.reps_hechas),
      completedAt: s.completedAt ?? new Date().toISOString(),
      atipica: Boolean(s.atipica),
    },
  });
}

const SIN_ALUMNO_ID_MSG =
  "No pudimos identificar tu perfil de alumno para guardar los datos. Volvé a iniciar sesión.";

function normalizarRpeReal(rpe: number | null | undefined): number | null {
  if (typeof rpe !== "number" || !Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
    return null;
  }
  return rpe;
}

function resolverAlumnoIdParaEscritura(
  state: AthleteStoreState,
  session?: LiveWorkoutSession | null,
): string | null {
  const candidato =
    session?.studentId ||
    state.planAlumno?.alumnos[0]?.id ||
    state.currentSession.studentId ||
    getStorageUser() ||
    "";
  const trimmed = candidato.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function calcularDuracionMinutos(
  sessionStartedAt: number | null | undefined,
  session: LiveWorkoutSession,
  endedAt: number = Date.now(),
): number | null {
  let startMs =
    typeof sessionStartedAt === "number" &&
    Number.isFinite(sessionStartedAt) &&
    sessionStartedAt > 0
      ? sessionStartedAt
      : null;

  if (startMs === null) {
    let earliestCompleted = Infinity;
    for (const ej of session.ejercicios) {
      for (const s of ej.series) {
        if (!s.completada || !s.completedAt) continue;
        const ms = Date.parse(s.completedAt);
        if (Number.isFinite(ms) && ms > 0 && ms < earliestCompleted) {
          earliestCompleted = ms;
        }
      }
    }
    if (Number.isFinite(earliestCompleted)) {
      startMs = earliestCompleted;
    }
  }

  if (startMs === null) return null;
  const elapsedMinutes = Math.round(Math.max(0, endedAt - startMs) / 60_000);
  return Math.max(1, elapsedMinutes);
}

function construirOpcionesSubidaVideo(
  setState: (fn: (prev: AthleteStoreState) => Partial<AthleteStoreState>) => void,
  getState: () => AthleteStoreState,
): SubirPendientesOpciones {
  return {
    estaOnline: () =>
      useOfflineQueueStore.getState().isOnline &&
      (typeof navigator === "undefined" ||
        typeof navigator.onLine !== "boolean" ||
        navigator.onLine),
    onEstadoSerie: (item, estado, videoUrl) => {
      if (getState().currentSession.id !== item.sesionId) return;
      setState((prev) => ({
        currentSession: {
          ...prev.currentSession,
          ejercicios: prev.currentSession.ejercicios.map((ej) => {
            const coincide =
              ej.id === (item.ejercicioEnRutinaId ?? item.ejercicioId) ||
              (ej.ejercicio_id ?? ej.id) === item.ejercicioId;
            if (!coincide) return ej;
            return {
              ...ej,
              series: ej.series.map((s) =>
                s.numero_serie === item.numeroSerie
                  ? {
                      ...s,
                      videoEstado: estado,
                      ...(videoUrl !== undefined ? { video_url: videoUrl } : {}),
                    }
                  : s,
              ),
            };
          }),
        },
      }));
    },
    onSubidaExitosa: (item: VideoPendiente, videoUrl: string) => {
      const actual = getState().currentSession;
      if (actual.id === item.sesionId) {
        const ejActual = actual.ejercicios.find(
          (ej) =>
            ej.id === (item.ejercicioEnRutinaId ?? item.ejercicioId) ||
            (ej.ejercicio_id ?? ej.id) === item.ejercicioId,
        );
        const serieActual = ejActual?.series.find((s) => s.numero_serie === item.numeroSerie);
        if (ejActual && serieActual && serieActual.completada) {
          reencolarSerieCompletadaConVideo(actual, ejActual, serieActual, videoUrl, item.alumnoId);
          return;
        }
      }
      if (item.setSnapshot) {
        useOfflineQueueStore.getState().enqueueEvent({
          id: `set-video-${item.ejercicioEnRutinaId ?? item.ejercicioId}-${item.numeroSerie}-${Date.now()}`,
          action: "WORKOUT_SET_COMPLETED",
          payload: {
            sessionId: item.sesionId,
            alumnoId: item.alumnoId,
            diaId: item.setSnapshot.diaId,
            ejercicioId: item.ejercicioId,
            exerciseId: item.setSnapshot.exerciseId ?? item.ejercicioEnRutinaId ?? item.ejercicioId,
            exerciseName: item.setSnapshot.exerciseName,
            setNumber: item.numeroSerie,
            pesoKg: item.setSnapshot.pesoKg,
            reps: item.setSnapshot.reps,
            rpe: item.setSnapshot.rpe,
            setType: item.setSnapshot.setType,
            painReported: item.setSnapshot.painReported,
            painNotes: item.setSnapshot.painNotes,
            videoUrl,
            estimated1RM: item.setSnapshot.estimated1RM,
            completedAt: item.setSnapshot.completedAt ?? new Date().toISOString(),
            atipica: Boolean(item.setSnapshot.atipica),
          },
        });
      }
    },
  };
}

function fusionarSesionesSemanaDesdeServidor(
  locales: AthleteStoreState["sesionesCompletadas"],
  remotas: SesionFechaResumen[],
): AthleteStoreState["sesionesCompletadas"] {
  const resultado = [...locales];
  const idsPresentes = new Set(locales.map((s) => s.id));
  const diasSemanaPresentes = new Set(
    locales.filter((s) => esFechaEnSemanaActual(s.fecha)).map((s) => s.dia_id),
  );
  for (const r of remotas) {
    if (!r.dia_id || !esFechaEnSemanaActual(r.fecha)) continue;
    if (idsPresentes.has(r.id) || diasSemanaPresentes.has(r.dia_id)) continue;
    idsPresentes.add(r.id);
    diasSemanaPresentes.add(r.dia_id);
    resultado.push({
      id: r.id,
      dia_id: r.dia_id,
      fecha: r.fecha,
    });
  }
  return resultado;
}

export const useAthleteStore = create<AthleteStoreState>()(
  persist(
    (set, get) => ({
      membershipStatus: "ACTIVE",
      currentSession: defaultSession,
      nivelVistaAlumno: "SIMPLE",
      vistaElegidaPorAlumno: null,
      vistaRecomendadaCoach: "SIMPLE",
      cuestionarioInicial: null,
      onboardingCompletado: false,
      onboardingCompletadoPendiente: false,
      mostrarTimerDescanso: true,
      diaActivoId: null,
      sessionStartedAt: null,
      ejercicioAbiertoId: null,
      cierreAbierto: false,
      cuestionarioAbierto: false,
      toastSesion: null,
      diaElegidoHoyId: null,
      diaSugeridoId: null,
      motivoCambioDia: null,
      sesionesCompletadas: [],
      fechasSesionesServidor: [],
      diamantesRacha: 0,
      ciclosLogroRegistrados: [],
      planAlumno: null,
      cargandoPlan: false,
      errorPlan: false,
      ultimaVez: {},
      cargandoUltimaVez: false,
      marcas: {},
      seriesRecordIds: [],
      sessionPRs: [],
      miProgreso: null,
      miProgresoFecha: null,
      cargandoMiProgreso: false,
      historialSesiones: [],
      cargandoHistorial: false,
      pasoIncrementoPeso: 2.5,
      colapsarRutina: false,
      nombrePreferido: null,
      nombrePreferidoPendiente: undefined,
      rpeValidationError: null,
      rpeReminderNotification: null,
      stopProtocolActive: false,
      molestiasPendientesFueraDeSesion: [],
      molestiaEnvioError: null,
      molestiasErrorRegistradoIds: [],
      restTimer: {
        isActive: false,
        isPaused: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        exerciseName: "",
        setNumber: 0,
      },

      setMembershipStatus: (status) => set({ membershipStatus: status }),
      setPasoIncrementoPeso: (paso) => set({ pasoIncrementoPeso: paso }),
      setColapsarRutina: (colapsar) => set({ colapsarRutina: colapsar }),
      guardarNombrePreferido: async (nombre) => {
        const normalizado = normalizarNombrePreferido(nombre);
        if (normalizado && Array.from(normalizado).length > NOMBRE_PREFERIDO_MAX_LEN) {
          return {
            success: false,
            error: `El nombre no puede superar los ${NOMBRE_PREFERIDO_MAX_LEN} caracteres`,
          };
        }

        set((state) => ({
          nombrePreferido: normalizado,
          nombrePreferidoPendiente: normalizado,
          planAlumno: actualizarPrimerAlumnoEnPlan(state.planAlumno, { nombre_preferido: normalizado }),
        }));

        if (!useOfflineQueueStore.getState().isOnline) {
          return { success: true, offline: true };
        }

        const res = await enviarNombrePreferidoRpc(normalizado, set);
        if (res.permanentError) {
          return { success: false, error: res.permanentError };
        }
        return res.ok ? { success: true } : { success: true, offline: true };
      },
      sincronizarNombrePreferidoPendiente: async () => {
        if (activeSyncNombrePromise) return activeSyncNombrePromise;
        const pendiente = get().nombrePreferidoPendiente;
        if (pendiente === undefined || !useOfflineQueueStore.getState().isOnline) {
          return false;
        }

        activeSyncNombrePromise = (async () => {
          const valor = get().nombrePreferidoPendiente;
          if (valor === undefined || !useOfflineQueueStore.getState().isOnline) {
            return false;
          }
          const res = await enviarNombrePreferidoRpc(valor, set);
          return res.ok;
        })().finally(() => {
          activeSyncNombrePromise = null;
        });

        return activeSyncNombrePromise;
      },
      deleteCompletedSet: (exerciseId, setNumber) => {
        get().uncompleteSet(exerciseId, setNumber);
      },
      empezarDia: (diaId) => {
        const state = get();
        const studentId = resolverAlumnoIdParaEscritura(state, state.currentSession);
        if (!studentId) {
          useOfflineQueueStore.getState().setSyncError(SIN_ALUMNO_ID_MSG);
          set({ toastSesion: { mensaje: SIN_ALUMNO_ID_MSG, tipo: "neutral" } });
          return;
        }
        const motivo = state.motivoCambioDia;
        const diaSugeridoId = state.diaSugeridoId;

        get().loadStudentSession(studentId, diaId, motivo, diaSugeridoId);
        const tieneSeriesCompletadas = get().currentSession.ejercicios.some((ej) =>
          ej.series.some((s) => s.completada),
        );
        set({
          diaActivoId: diaId,
          sessionStartedAt: tieneSeriesCompletadas ? (get().sessionStartedAt ?? Date.now()) : null,
          ejercicioAbiertoId: null,
          cierreAbierto: false,
          cuestionarioAbierto: false,
        });

        // Si hubo cambio de día (dia sugerido distinto o motivo asignado), encolar evento offline
        if (diaSugeridoId && diaSugeridoId !== diaId) {
          useOfflineQueueStore.getState().enqueueEvent({
            id: `cambio-dia-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            action: "CAMBIO_DIA_REGISTRADO",
            payload: {
              sessionId: get().currentSession.id,
              alumnoId: studentId,
              diaElegidoId: diaId,
              diaSugeridoId,
              motivoCambioDia: motivo || null,
              timestamp: new Date().toISOString(),
            },
          });

          if (supabase) {
            const sessionId = get().currentSession.id;
            supabase
              .from("registro_sesiones")
              .upsert(
                {
                  id: sessionId,
                  alumno_id: studentId,
                  dia_id: diaId,
                  dia_sugerido_id: diaSugeridoId,
                  motivo_cambio_dia: motivo || null,
                },
                { onConflict: "id" }
              )
              .then(
                ({ error }) => {
                  if (error) {
                    console.warn("Aviso guardando motivo de cambio en Supabase:", error.message);
                  }
                },
                () => {
                  // Silencioso en modo offline
                },
              );
          }
        }
      },
      volverAlInicio: () =>
        set({
          diaActivoId: null,
          ejercicioAbiertoId: null,
          cierreAbierto: false,
          cuestionarioAbierto: false,
        }),
      setEjercicioAbiertoId: (ejercicioAbiertoId) => set({ ejercicioAbiertoId }),
      setCierreAbierto: (cierreAbierto) => set({ cierreAbierto }),
      setCuestionarioAbierto: (cuestionarioAbierto) => set({ cuestionarioAbierto }),
      setToastSesion: (toastSesion) => set({ toastSesion }),
      registrarRecordSesion: (serieKey, pr) =>
        set((state) => ({
          seriesRecordIds: state.seriesRecordIds.includes(serieKey)
            ? state.seriesRecordIds
            : [...state.seriesRecordIds, serieKey],
          sessionPRs: [
            ...state.sessionPRs.filter(
              (p) => !(p.exerciseName === pr.exerciseName && p.numero_serie === pr.numero_serie),
            ),
            pr,
          ],
        })),
      consumirNavegacionHistorialToast: () =>
        set((state) =>
          state.toastSesion?.irAHistorial
            ? { toastSesion: { ...state.toastSesion, irAHistorial: false } }
            : {},
        ),
      elegirOtroDia: (diaId, motivo = null, diaSugeridoId = null) =>
        set({
          diaElegidoHoyId: diaId,
          motivoCambioDia: motivo ?? null,
          diaSugeridoId: diaSugeridoId ?? null,
        }),
      deshacerCambioDia: () =>
        set({
          diaElegidoHoyId: null,
          motivoCambioDia: null,
          diaSugeridoId: null,
        }),
      marcarDiaCompletado: (diaId) => {
        const currentState = get();
        const studentId = resolverAlumnoIdParaEscritura(currentState, currentState.currentSession);
        if (!studentId) {
          useOfflineQueueStore.getState().setSyncError(SIN_ALUMNO_ID_MSG);
          set({ toastSesion: { mensaje: SIN_ALUMNO_ID_MSG, tipo: "neutral" } });
          return;
        }
        const duracionMinutos = calcularDuracionMinutos(
          currentState.sessionStartedAt,
          currentState.currentSession,
        );

        set((state) => {
          const session = state.currentSession;
          const sessionId = session?.id || nuevoUuid();
          const fechaIso = new Date().toISOString();

          const nuevasSesiones = [
            ...state.sesionesCompletadas.filter((s) => s.dia_id !== diaId),
            {
              id: sessionId,
              dia_id: diaId,
              dia_sugerido_id: session?.dia_sugerido_id || state.diaSugeridoId || null,
              motivo_cambio_dia: session?.motivo_cambio_dia || state.motivoCambioDia || null,
              fecha: fechaIso,
            },
          ];

          const allCompletedSets = (session?.ejercicios || []).flatMap((e) =>
            e.series
              .filter((s) => s.completada)
              .map((s) => ({
                id: "ser-" + sessionId + "-" + (e.ejercicio_id ?? e.id) + "-" + s.numero_serie,
                sesion_id: sessionId,
                ejercicio_id: e.ejercicio_id ?? e.id,
                ejercicioNombre: e.nombre || "Ejercicio",
                numero_serie: s.numero_serie,
                peso_kg: s.peso_kg,
                reps_hechas: s.reps_hechas,
                rpe_real: normalizarRpeReal(s.rpe_real),
                completada: true,
                set_type: normalizeSerieTipo(s.set_type ?? e.tipo_serie) as any,
                pain_reported: s.pain_reported || false,
                pain_notes: s.pain_notes || null,
                video_url: s.video_url || null,
                created_at: fechaIso,
                updated_at: fechaIso,
              }))
          );

          const volTotal = allCompletedSets.reduce((acc, s) => acc + s.peso_kg * s.reps_hechas, 0);
          const volEfectivo = calculateEffectiveVolume(allCompletedSets);

          const nuevaEntradaHistorial: HistoricalLoadEntry = {
            sesion: {
              id: sessionId,
              alumno_id: studentId,
              dia_id: diaId,
              dia_sugerido_id: session?.dia_sugerido_id || state.diaSugeridoId || null,
              motivo_cambio_dia: session?.motivo_cambio_dia || state.motivoCambioDia || null,
              fecha: fechaIso,
              duracion_minutos: duracionMinutos,
              volumen_total_kg: volTotal,
              effective_volume_kg: volEfectivo,
              created_at: fechaIso,
              updated_at: fechaIso,
            },
            series: allCompletedSets,
          };

          const nuevoHistorial = [
            nuevaEntradaHistorial,
            ...state.historialSesiones.filter((h) => h.sesion.id !== sessionId),
          ];

          const res = {
            sesionesCompletadas: nuevasSesiones,
            historialSesiones: nuevoHistorial,
            molestiasPendientesFueraDeSesion: fusionarPendientesFueraDeSesion(
              state.molestiasPendientesFueraDeSesion,
              session?.molestias,
            ),
            currentSession: {
              ...session,
              molestias: [],
            },
            diaElegidoHoyId: state.diaElegidoHoyId === diaId ? null : state.diaElegidoHoyId,
            motivoCambioDia: state.diaElegidoHoyId === diaId ? null : state.motivoCambioDia,
            diaSugeridoId: state.diaElegidoHoyId === diaId ? null : state.diaSugeridoId,
            sessionStartedAt: null,
          };
          // Invalidar y recargar automáticamente miProgreso tras finalizar o marcar día
          setTimeout(() => {
            void get().cargarMiProgreso();
          }, 0);
          return res;
        });
      },
      setStopProtocolActive: (active) => set({ stopProtocolActive: active }),
      setNivelVistaAlumno: (nivel) =>
        set({
          vistaElegidaPorAlumno: nivel,
          nivelVistaAlumno: nivel,
        }),
      usarVistaRecomendada: () =>
        set((state) => ({
          vistaElegidaPorAlumno: null,
          nivelVistaAlumno: state.vistaRecomendadaCoach || "SIMPLE",
        })),
      setOnboardingCompletado: (completado) =>
        set({ onboardingCompletado: completado }),
      completarOnboarding: async () => {
        set((state) => ({
          onboardingCompletado: true,
          onboardingCompletadoPendiente: true,
          planAlumno: actualizarPrimerAlumnoEnPlan(state.planAlumno, { onboarding_completado: true }),
        }));

        if (!useOfflineQueueStore.getState().isOnline) {
          return { success: true, offline: true };
        }

        const res = await enviarOnboardingCompletadoRpc(set);
        if (res.permanentError) {
          return { success: false, error: res.permanentError };
        }
        return res.ok ? { success: true } : { success: true, offline: true };
      },
      sincronizarOnboardingPendiente: async () => {
        if (activeSyncOnboardingPromise) return activeSyncOnboardingPromise;
        if (!get().onboardingCompletadoPendiente || !useOfflineQueueStore.getState().isOnline) {
          return false;
        }

        activeSyncOnboardingPromise = (async () => {
          if (!get().onboardingCompletadoPendiente || !useOfflineQueueStore.getState().isOnline) {
            return false;
          }
          const res = await enviarOnboardingCompletadoRpc(set);
          return res.ok;
        })().finally(() => {
          activeSyncOnboardingPromise = null;
        });

        return activeSyncOnboardingPromise;
      },
      setMostrarTimerDescanso: (mostrar) =>
        set({ mostrarTimerDescanso: mostrar }),
      setCuestionarioInicial: (data) => set({ cuestionarioInicial: data }),
      saveCuestionarioInicial: async (data) => {
        const state = get();
        const studentId = resolverAlumnoIdParaEscritura(state);
        if (!studentId) {
          useOfflineQueueStore.getState().setSyncError(SIN_ALUMNO_ID_MSG);
          set({ toastSesion: { mensaje: SIN_ALUMNO_ID_MSG, tipo: "neutral" } });
          return { success: false, error: SIN_ALUMNO_ID_MSG };
        }
        const nowIso = new Date().toISOString();
        const prev = get().cuestionarioInicial;
        const fullRecord: AlumnoCuestionarioInicial = {
          id: prev?.id || `cuest-${Date.now()}`,
          alumno_id: studentId,
          objetivo_principal:
            data.objetivo_principal !== undefined
              ? data.objetivo_principal
              : (prev?.objetivo_principal ?? null),
          experiencia_previa:
            data.experiencia_previa !== undefined
              ? data.experiencia_previa
              : (prev?.experiencia_previa ?? null),
          dias_disponibles_semana:
            data.dias_disponibles_semana !== undefined
              ? data.dias_disponibles_semana
              : (prev?.dias_disponibles_semana ?? null),
          molestias_o_lesiones_previas:
            data.molestias_o_lesiones_previas !== undefined
              ? data.molestias_o_lesiones_previas
              : (prev?.molestias_o_lesiones_previas ?? null),
          equipamiento_disponible:
            data.equipamiento_disponible !== undefined
              ? data.equipamiento_disponible
              : (prev?.equipamiento_disponible ?? null),
          respuestas_extra:
            data.respuestas_extra !== undefined
              ? data.respuestas_extra
              : (prev?.respuestas_extra ?? {}),
          completado_at: prev?.completado_at || nowIso,
          updated_at: nowIso,
        };

        set({ cuestionarioInicial: fullRecord });

        useOfflineQueueStore.getState().enqueueEvent({
          id: `cuest-${Date.now()}`,
          action: "UPSERT_CUESTIONARIO_INICIAL",
          payload: fullRecord,
        });

        try {
          if (supabase) {
            const { error } = await supabase
              .from("alumno_cuestionario_inicial")
              .upsert(
                {
                  alumno_id: studentId,
                  objetivo_principal: fullRecord.objetivo_principal,
                  experiencia_previa: fullRecord.experiencia_previa,
                  dias_disponibles_semana: fullRecord.dias_disponibles_semana,
                  molestias_o_lesiones_previas: fullRecord.molestias_o_lesiones_previas,
                  equipamiento_disponible: fullRecord.equipamiento_disponible,
                  respuestas_extra: fullRecord.respuestas_extra,
                  completado_at: fullRecord.completado_at,
                  updated_at: fullRecord.updated_at,
                },
                { onConflict: "alumno_id" }
              );
            if (error) {
              console.warn("Aviso guardando cuestionario inicial en Supabase:", error.message);
            }
          }
        } catch (err: any) {
          console.warn("Excepción guardando cuestionario inicial (guardado local offline):", err?.message || err);
        }

        return { success: true };
      },
      clearRpeValidationError: () => set({ rpeValidationError: null }),
      clearRpeReminderNotification: () => set({ rpeReminderNotification: null }),

      updateSetField: (exerciseId, setNumber, field, value) => {
        set((state) => {
          const updatedExercises = state.currentSession.ejercicios.map((ej) => {
            if (ej.id !== exerciseId) return ej;
            const updatedSeries = ej.series.map((s) => {
              if (s.numero_serie !== setNumber) return s;
              const nextValue =
                field === "rpe_real"
                  ? normalizarRpeReal(value)
                  : typeof value === "number"
                    ? value
                    : s[field];
              const updatedSet: LiveWorkoutSet = { ...s, [field]: nextValue };
              // Recalcula 1RM en vivo cuando cambia peso o reps
              updatedSet.estimated1RM = calculateEpley1RM(
                field === "peso_kg" && typeof nextValue === "number" ? nextValue : updatedSet.peso_kg,
                field === "reps_hechas" && typeof nextValue === "number" ? nextValue : updatedSet.reps_hechas,
              );
              return updatedSet;
            });
            return { ...ej, series: updatedSeries };
          });

          return {
            currentSession: {
              ...state.currentSession,
              ejercicios: updatedExercises,
            },
          };
        });
      },

      updateSetType: (exerciseId, setNumber, type) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) =>
                  s.numero_serie === setNumber ? { ...s, set_type: type } : s
                ),
              };
            }),
          },
        }));
      },

      updateExerciseTipoSerie: (exerciseId, tipo_serie) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                tipo_serie,
                series: ej.series.map((s) => ({
                  ...s,
                  set_type:
                    tipo_serie === "DROPSET"
                      ? "DROPSET"
                      : tipo_serie === "WARMUP"
                      ? "WARMUP"
                      : "NORMAL",
                })),
              };
            }),
          },
        }));
      },

      reportPainForSet: (exerciseId, setNumber, notes) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) =>
                  s.numero_serie === setNumber
                    ? { ...s, pain_reported: true, pain_notes: notes }
                    : s
                ),
              };
            }),
          },
        }));
      },

      reportarMolestia: async (datos) => {
        const state = get();
        const sintomas = Array.isArray(datos.sintomas) ? datos.sintomas : [];
        const nivel = nivelMolestia(datos.eva, sintomas);
        const notasLimpias = datos.notas?.trim() ? datos.notas.trim() : null;
        const numeroSerie =
          typeof datos.numeroSerie === "number" && datos.numeroSerie >= 1
            ? datos.numeroSerie
            : null;

        const molestia: MolestiaSesion = {
          id: nuevoUuid(),
          sesionId: state.currentSession.id,
          ejercicioEnRutinaId: datos.ejercicioEnRutinaId,
          ejercicioId: datos.ejercicioId,
          numeroSerie,
          zona: datos.zona,
          eva: datos.eva,
          sintomas,
          momento: datos.momento ?? null,
          notas: notasLimpias,
          nivel,
          reportadaAt: new Date().toISOString(),
          envio: "pendiente",
        };

        const severidadTexto =
          nivel === "alarma" || nivel === "alta"
            ? "AGUDO"
            : nivel === "moderada"
              ? "MODERADO"
              : "LEVE";
        const notesText = `[Dolor: ${severidadTexto}] ${molestia.zona}${
          sintomas.length > 0 ? ` (Síntomas: ${sintomas.join(", ")})` : ""
        }${notasLimpias ? ` - ${notasLimpias}` : ""}`;

        set((prev) => {
          const prevMolestias = prev.currentSession.molestias ?? [];
          const sinAnterior = prevMolestias.filter(
            (m) => m.ejercicioEnRutinaId !== molestia.ejercicioEnRutinaId,
          );

          return {
            ...(nivel === "alarma" ? { stopProtocolActive: true } : {}),
            currentSession: {
              ...prev.currentSession,
              molestias: [...sinAnterior, molestia],
              ejercicios:
                numeroSerie !== null
                  ? prev.currentSession.ejercicios.map((ej) => {
                      if (ej.id !== molestia.ejercicioEnRutinaId) return ej;
                      return {
                        ...ej,
                        series: ej.series.map((s) =>
                          s.numero_serie === numeroSerie
                            ? { ...s, pain_reported: true, pain_notes: notesText }
                            : s,
                        ),
                      };
                    })
                  : prev.currentSession.ejercicios,
            },
          };
        });

        await get().flushMolestiasPendientes();

        return (
          (get().currentSession.molestias ?? []).find((m) => m.id === molestia.id) ??
          molestia
        );
      },

      flushMolestiasPendientes: async () => {
        if (activeFlushMolestiasPromise) {
          await activeFlushMolestiasPromise;
        }

        const haySenal =
          useOfflineQueueStore.getState().isOnline &&
          (typeof navigator === "undefined" || navigator.onLine !== false);
        if (!haySenal || !supabase) {
          backoffMolestias.reset();
          return;
        }

        const run = async () => {
          const snapshot = get();
          const pendientesFuera = snapshot.molestiasPendientesFueraDeSesion.filter(
            (m) => m.envio === "pendiente",
          );
          const pendientesEnSesion = (snapshot.currentSession.molestias ?? []).filter(
            (m) => m.envio === "pendiente",
          );
          const cola = [...pendientesFuera, ...pendientesEnSesion];
          if (cola.length === 0) {
            backoffMolestias.reset();
            return;
          }

          let quedoPendiente = false;
          for (const m of cola) {
            const actual = get();
            const diaId =
              m.sesionId === actual.currentSession.id
                ? (actual.currentSession.dia_id ?? null)
                : (actual.sesionesCompletadas.find((s) => s.id === m.sesionId)?.dia_id ??
                  null);
            const yaRegistrado = actual.molestiasErrorRegistradoIds.includes(m.id);

            const res = await enviarMolestiaRpc(
              m,
              diaId,
              actual.currentSession.studentId ?? null,
              yaRegistrado,
            );

            if (res.estado === "pendiente") {
              if (res.missingSchema || res.registrarError) {
                set((prev) => ({
                  ...(res.missingSchema
                    ? { molestiaEnvioError: MOLESTIA_ENVIO_ERROR_MSG }
                    : {}),
                  ...(res.registrarError &&
                  !prev.molestiasErrorRegistradoIds.includes(m.id)
                    ? {
                        molestiasErrorRegistradoIds: [
                          ...prev.molestiasErrorRegistradoIds,
                          m.id,
                        ],
                      }
                    : {}),
                }));
              }
              quedoPendiente = true;
              break;
            }

            const envio = res.estado;
            set((prev) => {
              const nuevasFuera = prev.molestiasPendientesFueraDeSesion.filter(
                (item) => item.id !== m.id,
              );
              const nuevasEnSesion = (prev.currentSession.molestias ?? []).map((item) =>
                item.id === m.id ? { ...item, envio } : item,
              );
              const quedanPendientes =
                nuevasFuera.some((item) => item.envio === "pendiente") ||
                nuevasEnSesion.some((item) => item.envio === "pendiente");
              const tieneErrorPermanente = nuevasEnSesion.some(
                (item) => item.envio === "error",
              );

              return {
                molestiasPendientesFueraDeSesion: nuevasFuera,
                molestiaEnvioError:
                  envio === "error"
                    ? MOLESTIA_ENVIO_ERROR_MSG
                    : !quedanPendientes && !tieneErrorPermanente
                      ? null
                      : prev.molestiaEnvioError,
                molestiasErrorRegistradoIds:
                  envio === "enviada"
                    ? prev.molestiasErrorRegistradoIds.filter((id) => id !== m.id)
                    : res.registrarError &&
                        !prev.molestiasErrorRegistradoIds.includes(m.id)
                      ? [...prev.molestiasErrorRegistradoIds, m.id]
                      : prev.molestiasErrorRegistradoIds,
                currentSession: {
                  ...prev.currentSession,
                  molestias: nuevasEnSesion,
                },
              };
            });
          }
          if (quedoPendiente) backoffMolestias.programar();
          else backoffMolestias.reset();
        };

        activeFlushMolestiasPromise = run().finally(() => {
          activeFlushMolestiasPromise = null;
        });
        await activeFlushMolestiasPromise;
      },

      cargarMolestiasDeSesion: async (sesionId) => {
        const targetSesionId = sesionId ?? get().currentSession.id;
        if (!esUuid(targetSesionId) || !supabase) return;

        const haySenal =
          useOfflineQueueStore.getState().isOnline &&
          (typeof navigator === "undefined" || navigator.onLine !== false);
        if (!haySenal) return;

        try {
          const { data, error } = await (supabase as any)
            .from("alumno_historial_dolor")
            .select(
              "id, sesion_id, ejercicio_en_rutina_id, ejercicio_id, numero_serie, zona_articular, eva, sintomas_alarma, momento_aparicion, notas_alumno, created_at",
            )
            .eq("sesion_id", targetSesionId);

          if (error || !Array.isArray(data)) return;
          if (get().currentSession.id !== targetSesionId) return;

          const remotas: MolestiaSesion[] = data.map((row: any) => {
            const eva = typeof row.eva === "number" ? row.eva : 5;
            const sintomas = Array.isArray(row.sintomas_alarma) ? row.sintomas_alarma : [];
            return {
              id: row.id,
              sesionId: row.sesion_id ?? targetSesionId,
              ejercicioEnRutinaId: row.ejercicio_en_rutina_id ?? row.ejercicio_id,
              ejercicioId: row.ejercicio_id,
              numeroSerie: typeof row.numero_serie === "number" ? row.numero_serie : null,
              zona: row.zona_articular as ZonaArticular,
              eva,
              sintomas,
              momento: (row.momento_aparicion as MomentoMolestia | null) ?? null,
              notas: row.notas_alumno ?? null,
              nivel: nivelMolestia(eva, sintomas),
              reportadaAt: row.created_at ?? new Date().toISOString(),
              envio: "enviada",
            };
          });

          set((prev) => {
            if (prev.currentSession.id !== targetSesionId) return prev;
            const merged = new Map<string, MolestiaSesion>();
            for (const r of remotas) {
              merged.set(r.id, r);
            }
            for (const local of prev.currentSession.molestias ?? []) {
              const existente = merged.get(local.id);
              if (!existente || local.envio === "pendiente") {
                merged.set(local.id, local);
              }
            }
            const lista = Array.from(merged.values());
            const hayAlarma = lista.some((m) => m.nivel === "alarma");
            return {
              ...(hayAlarma ? { stopProtocolActive: true } : {}),
              currentSession: {
                ...prev.currentSession,
                molestias: lista,
              },
            };
          });
        } catch {
          // Silencioso en modo offline
        }
      },

      adjuntarVideoASerie: async (ejercicioEnRutinaId, numeroSerie, origen) => {
        const state = get();
        const session = state.currentSession;
        const targetExercise = session.ejercicios.find((e) => e.id === ejercicioEnRutinaId);
        const targetSet = targetExercise?.series.find((s) => s.numero_serie === numeroSerie);
        if (!targetExercise || !targetSet) return "invalido";

        const alumnoId = resolverAlumnoIdParaEscritura(state, session);
        if (!alumnoId) {
          useOfflineQueueStore.getState().setSyncError(SIN_ALUMNO_ID_MSG);
          set({ toastSesion: { mensaje: SIN_ALUMNO_ID_MSG, tipo: "neutral" } });
          return "invalido";
        }
        const ejercicioId = targetExercise.ejercicio_id ?? targetExercise.id;

        if (origen.tipo === "enlace") {
          const urlNormalizada = normalizarEnlaceVideo(origen.url);
          if (!urlNormalizada) return "invalido";
          set((prev) => ({
            currentSession: {
              ...prev.currentSession,
              ejercicios: prev.currentSession.ejercicios.map((ej) => {
                if (ej.id !== ejercicioEnRutinaId) return ej;
                return {
                  ...ej,
                  series: ej.series.map((s) =>
                    s.numero_serie === numeroSerie
                      ? { ...s, video_url: urlNormalizada, videoEstado: "listo" }
                      : s,
                  ),
                };
              }),
            },
          }));
          if (targetSet.completada) {
            reencolarSerieCompletadaConVideo(
              session,
              targetExercise,
              targetSet,
              urlNormalizada,
              alumnoId,
            );
          }
          await eliminarVideoPendiente({
            alumnoId,
            sesionId: session.id,
            ejercicioId,
            numeroSerie,
          });
          return "ok";
        }

        const validacion = await validarArchivoVideo(origen.file);
        if (validacion !== "ok") return validacion;

        const ext = extensionDeArchivoVideo(origen.file);
        const setSnapshot: SetVideoSnapshot | undefined = targetSet.completada
          ? {
              diaId: session.dia_id,
              exerciseId: targetExercise.id,
              exerciseName: targetExercise.nombre,
              pesoKg: targetSet.peso_kg,
              reps: targetSet.reps_hechas,
              rpe: normalizarRpeReal(targetSet.rpe_real),
              setType: normalizeSerieTipo(targetSet.set_type ?? targetExercise.tipo_serie),
              painReported: targetSet.pain_reported || false,
              painNotes: targetSet.pain_notes || null,
              estimated1RM:
                targetSet.estimated1RM ?? calculateEpley1RM(targetSet.peso_kg, targetSet.reps_hechas),
              completedAt: targetSet.completedAt ?? new Date().toISOString(),
              atipica: Boolean(targetSet.atipica),
            }
          : undefined;

        await encolarVideo(
          {
            alumnoId,
            sesionId: session.id,
            ejercicioId,
            ejercicioEnRutinaId,
            numeroSerie,
            blob: origen.file,
            ext,
            setSnapshot,
          },
          construirOpcionesSubidaVideo(set, get),
        );

        return "ok";
      },

      quitarVideoDeSerie: (ejercicioEnRutinaId, numeroSerie) => {
        const state = get();
        const session = state.currentSession;
        const targetExercise = session.ejercicios.find((e) => e.id === ejercicioEnRutinaId);
        const targetSet = targetExercise?.series.find((s) => s.numero_serie === numeroSerie);
        if (!targetExercise || !targetSet) return;

        const alumnoId = resolverAlumnoIdParaEscritura(state, session);
        if (!alumnoId) {
          useOfflineQueueStore.getState().setSyncError(SIN_ALUMNO_ID_MSG);
          set({ toastSesion: { mensaje: SIN_ALUMNO_ID_MSG, tipo: "neutral" } });
          return;
        }
        const ejercicioId = targetExercise.ejercicio_id ?? targetExercise.id;

        set((prev) => ({
          currentSession: {
            ...prev.currentSession,
            ejercicios: prev.currentSession.ejercicios.map((ej) => {
              if (ej.id !== ejercicioEnRutinaId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) =>
                  s.numero_serie === numeroSerie
                    ? { ...s, video_url: null, videoEstado: "ninguno" }
                    : s,
                ),
              };
            }),
          },
        }));

        void eliminarVideoPendiente({
          alumnoId,
          sesionId: session.id,
          ejercicioId,
          numeroSerie,
        });

        if (targetSet.completada) {
          reencolarSerieCompletadaConVideo(session, targetExercise, targetSet, null, alumnoId);
        }
      },

      reintentarVideoDeSerie: async (ejercicioEnRutinaId, numeroSerie) => {
        const state = get();
        const session = state.currentSession;
        const targetExercise = session.ejercicios.find((e) => e.id === ejercicioEnRutinaId);
        const targetSet = targetExercise?.series.find((s) => s.numero_serie === numeroSerie);
        if (!targetExercise || !targetSet) return;

        const alumnoId = resolverAlumnoIdParaEscritura(state, session);
        if (!alumnoId) {
          useOfflineQueueStore.getState().setSyncError(SIN_ALUMNO_ID_MSG);
          set({ toastSesion: { mensaje: SIN_ALUMNO_ID_MSG, tipo: "neutral" } });
          return;
        }
        const ejercicioId = targetExercise.ejercicio_id ?? targetExercise.id;

        await reintentarVideoPendiente(
          { alumnoId, sesionId: session.id, ejercicioId, numeroSerie },
          construirOpcionesSubidaVideo(set, get),
        );
      },

      sincronizarVideosPendientes: async (alumnoIdArg) => {
        const alumnoId = alumnoIdArg ?? getStorageUser() ?? get().currentSession.studentId;
        if (!alumnoId) return;
        await subirPendientes(alumnoId, construirOpcionesSubidaVideo(set, get));
      },

      attachVideoForSet: (exerciseId, setNumber, videoUrl) => {
        void get().adjuntarVideoASerie(exerciseId, setNumber, {
          tipo: "enlace",
          url: videoUrl,
        });
      },

      applyWarmupSetsToExercise: (exerciseId, warmupSets) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              // Conservar calentamientos ya completados si los hubiera, descartar calentamientos pendientes previos para evitar duplicación
              const completedWarmups = ej.series.filter(
                (s) => isWarmup(s.set_type) && s.completada
              );
              const effectiveSets = ej.series.filter(
                (s) => isWorkingSet(s.set_type)
              );

              // Crear series de calentamiento con set_type = 'W'
              const wSets: LiveWorkoutSet[] = warmupSets.map((w, idx) => ({
                numero_serie: completedWarmups.length + idx + 1,
                peso_kg: w.peso_kg,
                reps_hechas: w.reps,
                rpe_real: null,
                completada: false,
                estimated1RM: calculateEpley1RM(w.peso_kg, w.reps),
                set_type: "W",
              }));

              const allWarmups = [...completedWarmups, ...wSets];
              // Re-numerar las series efectivas
              const existingSets = effectiveSets.map((s, idx) => ({
                ...s,
                numero_serie: allWarmups.length + idx + 1,
              }));

              return {
                ...ej,
                series: [...allWarmups, ...existingSets],
              };
            }),
          },
        }));
      },

      registerWarmupSet: (exerciseId, warmup) => {
        const state = get();
        const targetExercise = state.currentSession.ejercicios.find(
          (e) => e.id === exerciseId
        );
        if (!targetExercise) return;

        const completedAt = new Date().toISOString();
        const rpeReal = normalizarRpeReal(warmup.rpe_real);
        const estimated1RM = calculateEpley1RM(warmup.peso_kg, warmup.reps);

        const existingWarmups = targetExercise.series.filter(
          (s) => isWarmup(s.set_type)
        );
        const effectiveSets = targetExercise.series.filter(
          (s) => isWorkingSet(s.set_type)
        );

        const newWarmupSet: LiveWorkoutSet = {
          numero_serie: existingWarmups.length + 1,
          peso_kg: warmup.peso_kg,
          reps_hechas: warmup.reps,
          rpe_real: rpeReal,
          completada: true,
          completedAt,
          estimated1RM,
          set_type: "W",
        };

        const allWarmups = [...existingWarmups, newWarmupSet].map((s, idx) => ({
          ...s,
          numero_serie: idx + 1,
        }));

        const renumberedEffective = effectiveSets.map((s, idx) => ({
          ...s,
          numero_serie: allWarmups.length + idx + 1,
        }));

        const updatedSeries = [...allWarmups, ...renumberedEffective];

        set((prevState) => ({
          sessionStartedAt: prevState.sessionStartedAt ?? Date.now(),
          currentSession: {
            ...prevState.currentSession,
            ejercicios: prevState.currentSession.ejercicios.map((ej) =>
              ej.id === exerciseId ? { ...ej, series: updatedSeries } : ej
            ),
          },
        }));

        useOfflineQueueStore.getState().enqueueEvent({
          id: `set-warmup-${exerciseId}-${newWarmupSet.numero_serie}-${Date.now()}`,
          action: "WORKOUT_SET_COMPLETED",
          payload: {
            sessionId: state.currentSession.id,
            alumnoId: state.currentSession.studentId,
            diaId: state.currentSession.dia_id,
            ejercicioId: targetExercise.ejercicio_id ?? exerciseId,
            exerciseId,
            exerciseName: targetExercise.nombre,
            setNumber: newWarmupSet.numero_serie,
            pesoKg: warmup.peso_kg,
            reps: warmup.reps,
            rpe: rpeReal,
            setType: "W",
            painReported: false,
            painNotes: null,
            videoUrl: null,
            estimated1RM,
            completedAt,
          },
        });
      },

      completeSet: (exerciseId, setNumber, atipica) => {
        const state = get();
        const targetExercise = state.currentSession.ejercicios.find(
          (e) => e.id === exerciseId,
        );
        const targetSet = targetExercise?.series.find(
          (s) => s.numero_serie === setNumber,
        );

        if (!targetExercise || !targetSet) return;

        // Hevy control del coach: coach_force_rpe_enabled
        // Si el alumno está en modo técnica mantiene el bloqueo para retrocompatibilidad;
        // en modo estándar emite un recordatorio persistente en la app sin bloquear la ejecución.
        if (
          targetExercise.force_rpe_required &&
          (!targetSet.rpe_real || targetSet.rpe_real < 6.0 || targetSet.rpe_real > 10.0)
        ) {
          if (get().nivelVistaAlumno === "TECNICA") {
            set({
              rpeValidationError: `El Coach exige registrar un RPE válido (6.0 a 10.0) en "${targetExercise.nombre}" antes de completar la serie.`,
            });
            return;
          } else {
            set({
              rpeReminderNotification: `Recordatorio: Registrá el RPE en "${targetExercise.nombre}". Es obligatorio para tu coach, pero podés continuar entrenando sin bloqueo.`,
              rpeValidationError: null,
            });
          }
        } else {
          set({ rpeValidationError: null });
        }

        const completedAt = new Date().toISOString();
        const estimated1RM = calculateEpley1RM(
          targetSet.peso_kg,
          targetSet.reps_hechas,
        );

        // 1. Marcar serie como completada
        set((prevState) => ({
          sessionStartedAt: prevState.sessionStartedAt ?? Date.now(),
          currentSession: {
            ...prevState.currentSession,
            ejercicios: prevState.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) => {
                  if (s.numero_serie === setNumber) {
                    return {
                      ...s,
                      completada: true,
                      atipica: Boolean(atipica),
                      estimated1RM,
                      completedAt,
                    };
                  }
                  if (s.numero_serie === setNumber + 1 && !s.completada) {
                    if (isWarmup(s.set_type) && s.peso_kg > 0) {
                      return s;
                    }
                    return {
                      ...s,
                      peso_kg: targetSet.peso_kg,
                      reps_hechas: targetSet.reps_hechas,
                      estimated1RM,
                    };
                  }
                  return s;
                }),
              };
            }),
          },
        }));

        // 2. Acumular evento en cola offline de Zustand
        useOfflineQueueStore.getState().enqueueEvent({
          id: `set-${exerciseId}-${setNumber}-${Date.now()}`,
          action: "WORKOUT_SET_COMPLETED",
          payload: {
            sessionId: state.currentSession.id,
            alumnoId: state.currentSession.studentId,
            diaId: state.currentSession.dia_id,
            ejercicioId: targetExercise.ejercicio_id ?? exerciseId,
            exerciseId,
            exerciseName: targetExercise.nombre,
            setNumber,
            pesoKg: targetSet.peso_kg,
            reps: targetSet.reps_hechas,
            rpe: normalizarRpeReal(targetSet.rpe_real),
            setType:
              targetSet.set_type === "W"
                ? "W"
                : normalizeSerieTipo(targetSet.set_type ?? targetExercise.tipo_serie),
            painReported: targetSet.pain_reported || false,
            painNotes: targetSet.pain_notes || null,
            videoUrl: targetSet.video_url || null,
            estimated1RM,
            completedAt,
            atipica: Boolean(atipica),
          },
        });

        // 3. Iniciar temporizador de descanso según el tipo de ejercicio y flujo de circuito
        const hasRemainingIncompleteSets = get().currentSession.ejercicios.some((ej) =>
          ej.series.some((s) => !s.completada)
        );

        if (hasRemainingIncompleteSets && state.mostrarTimerDescanso !== false) {
          const isDropsetExercise =
            isDropset(targetExercise.tipo_serie) ||
            Boolean((targetExercise as any).es_dropset) ||
            isDropset(targetSet.set_type);

          if (isDropsetExercise) {
            // Dropset Quirúrgico: El atleta ejecuta todas las bajadas seguidas.
            // Al sentarse a registrar, al registrar la primera serie se activa de inmediato el temporizador de descanso
            // para que descanse mientras termina de anotar las series restantes del dropset.
            // Las series posteriores mantienen el temporizador en curso sin reiniciarlo.
            if (!state.restTimer.isActive) {
              const restDuration = targetExercise.descanso_segundos > 0 ? targetExercise.descanso_segundos : 90;
              get().startRestTimer(restDuration, targetExercise.nombre, setNumber);
            }
          } else if (targetExercise.es_superserie) {
            // Superserie / Circuito Round-Robin:
            // La navegación avanza en ronda: Ejercicio 1 (Serie 1) -> Ejercicio 2 (Serie 1) -> descanso.
            // El descanso se dispara únicamente al registrar el último ejercicio del circuito de esa ronda.
            const grupo = targetExercise.grupo_superserie ?? 1;
            const groupExercises = get().currentSession.ejercicios.filter(
              (e) => e.es_superserie && (e.grupo_superserie ?? 1) === grupo
            );
            // Verificar si en esta ronda (setNumber) todavía quedan ejercicios con esa serie pendiente
            const hasRemainingInRound = groupExercises.some((e) =>
              e.series.some((s) => s.numero_serie === setNumber && !s.completada)
            );

            if (!hasRemainingInRound) {
              // Todos los ejercicios de la ronda completaron la serie setNumber: se activa descanso del circuito
              const restDuration = targetExercise.descanso_segundos > 0 ? targetExercise.descanso_segundos : 90;
              get().startRestTimer(restDuration, targetExercise.nombre, setNumber);
            } else {
              // Si aún quedan ejercicios de la misma ronda en el circuito: cero descanso intermedio
              get().stopTimer();
            }
          } else {
            // Ejercicio individual estándar
            const restDuration = targetExercise.descanso_segundos > 0 ? targetExercise.descanso_segundos : 90;
            get().startRestTimer(restDuration, targetExercise.nombre, setNumber);
          }
        } else if (!hasRemainingIncompleteSets) {
          get().stopTimer();
          // Auto-finalización y sincronización automática al completar la última serie de la sesión
          const currentStore = get();
          void currentStore.syncSessionToSupabase();
          if (currentStore.diaActivoId) {
            currentStore.marcarDiaCompletado(currentStore.diaActivoId);
          }
        }
      },

      editCompletedSet: (
        exerciseId: string,
        setNumber: number,
        pesoKg: number,
        reps: number,
        atipica?: boolean,
      ) => {
        const state = get();
        const targetExercise = state.currentSession.ejercicios.find(
          (e) => e.id === exerciseId,
        );
        const targetSet = targetExercise?.series.find(
          (s) => s.numero_serie === setNumber,
        );

        if (!targetExercise || !targetSet) return;

        const estimated1RM = calculateEpley1RM(pesoKg, reps);
        const updatedAt = new Date().toISOString();

        set((prevState) => ({
          currentSession: {
            ...prevState.currentSession,
            ejercicios: prevState.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) => {
                  if (s.numero_serie !== setNumber) return s;
                  return {
                    ...s,
                    peso_kg: pesoKg,
                    reps_hechas: reps,
                    estimated1RM,
                    ...(atipica !== undefined ? { atipica } : {}),
                  };
                }),
              };
            }),
          },
        }));

        useOfflineQueueStore.getState().enqueueEvent({
          id: `set-edit-${exerciseId}-${setNumber}-${Date.now()}`,
          action: "WORKOUT_SET_UPDATED",
          payload: {
            sessionId: state.currentSession.id,
            alumnoId: state.currentSession.studentId,
            diaId: state.currentSession.dia_id,
            ejercicioId: targetExercise.ejercicio_id ?? exerciseId,
            exerciseId,
            exerciseName: targetExercise.nombre,
            setNumber,
            pesoKg,
            reps,
            estimated1RM,
            updatedAt,
            ...(atipica !== undefined ? { atipica } : {}),
          },
        });
      },

      // Descarga "la última vez" y marcas históricas de los ejercicios del día al abrir la sesión.
      // Incluye sesiones previas del mismo día excluyendo solo la sesión actual (evita PRs fantasma
      // al entrenar más de una vez en el mismo día). Sin red no consulta: queda lo persistido.
      cargarUltimaVez: async () => {
        const session = get().currentSession;
        const ids = [...new Set(session.ejercicios.map((e) => e.ejercicio_id ?? e.id))].filter((id) => esUuid(id));
        if (ids.length === 0 || !useOfflineQueueStore.getState().isOnline) return;

        const alumnoId = session.studentId && esUuid(session.studentId) ? session.studentId : null;
        set({ cargandoUltimaVez: true });
        try {
          const filas = await Promise.all(
            ids.map(async (id) => {
              let q = supabase
                .from("registro_series")
                .select(
                  "ejercicio_id, sesion_id, numero_serie, peso_kg, reps_hechas, rpe_real, completada, set_type, registro_sesiones!inner(fecha)",
                )
                .eq("ejercicio_id", id)
                .eq("completada", true)
                .gte("reps_hechas", 1)
                .or("set_type.is.null,set_type.neq.WARMUP");
              if (alumnoId) q = q.eq("registro_sesiones.alumno_id", alumnoId);
              const { data, error } = await q.order("registro_sesiones(fecha)", { ascending: false }).limit(50);
              if (error || !data) return null;
              const series: SerieHistorica[] = data
                .map(({ registro_sesiones, ...s }) => ({
                  ...s,
                  fecha: (registro_sesiones as unknown as { fecha: string }).fecha,
                }))
                .filter((s) => s.sesion_id !== session.id);
              return [id, ultimaVezDeEjercicio(series, id), marcasDeEjercicio(series, id)] as const;
            }),
          );
          const validas = filas.filter((f) => f !== null);
          const nuevas = Object.fromEntries(validas.map(([id, ultima]) => [id, ultima]));
          const nuevasMarcas = Object.fromEntries(validas.map(([id, , m]) => [id, m]));
          set((s) => ({
            ultimaVez: { ...s.ultimaVez, ...nuevas },
            marcas: { ...s.marcas, ...nuevasMarcas },
          }));
        } catch (e) {
          console.warn("No se pudo descargar «la última vez»:", e);
        } finally {
          set({ cargandoUltimaVez: false });
        }
      },

      // §0.3 y §4.3: descarga el historial del alumno y lo agrega con las funciones puras
      // (mismo patrón que cargarUltimaVez). Sin red no consulta: queda lo persistido.
      cargarMiProgreso: async () => {
        if (!useOfflineQueueStore.getState().isOnline) return;

        let alumnoId: string | null = null;

        // 1. Intentar resolver usuario autenticado de la sesión Supabase
        try {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user?.id && esUuid(authData.user.id)) {
            alumnoId = authData.user.id;
          }
        } catch (err) {
          console.warn("Aviso al obtener usuario autenticado para MiProgreso:", err);
        }

        // 2. Si no hay auth, resolver desde el perfil de plan persistido
        if (!alumnoId) {
          const planStudentId = get().planAlumno?.alumnos?.[0]?.id;
          if (planStudentId && esUuid(planStudentId)) {
            alumnoId = planStudentId;
          }
        }

        // 3. Si no, resolver desde la sesión actual o cerrada si tiene studentId válido
        if (!alumnoId) {
          const session = get().currentSession;
          if (session?.studentId && esUuid(session.studentId)) {
            alumnoId = session.studentId;
          }
        }

        // 4. Fallback al atleta por defecto para entornos demo y testing
        if (!alumnoId && DEFAULT_ATHLETE_ID && esUuid(DEFAULT_ATHLETE_ID)) {
          alumnoId = DEFAULT_ATHLETE_ID;
        }

        if (!alumnoId) return;

        set({ cargandoMiProgreso: true });
        try {
          const [{ data: filasSeries }, { data: filasSesiones }] = await Promise.all([
            supabase
              .from("registro_series")
              .select(
                "ejercicio_id, sesion_id, numero_serie, peso_kg, reps_hechas, rpe_real, completada, set_type, registro_sesiones!inner(fecha, alumno_id)",
              )
              .eq("completada", true)
              .gte("reps_hechas", 1)
              .or("set_type.is.null,set_type.neq.WARMUP")
              .eq("registro_sesiones.alumno_id", alumnoId)
              .order("registro_sesiones(fecha)", { ascending: false })
              .limit(1000),
            supabase
              .from("registro_sesiones")
              .select("id, fecha, effective_volume_kg")
              .eq("alumno_id", alumnoId)
              .order("fecha", { ascending: false })
              .limit(400),
          ]);

          const series: SerieHistorica[] = (filasSeries ?? []).map(({ registro_sesiones, ...s }) => ({
            ...s,
            fecha: (registro_sesiones as unknown as { fecha: string }).fecha,
          }));
          const sesiones: SesionHistorica[] = (filasSesiones ?? []) as unknown as SesionHistorica[];

          // Nombres del catálogo para los ejercicios presentes (ADR-005: sin datos reales en código).
          const ids = [...new Set(series.map((s) => s.ejercicio_id))];
          let nombres: Record<string, string> = {};
          if (ids.length > 0) {
            const { data: cat } = await supabase.from("ejercicios").select("id, nombre").in("id", ids);
            nombres = Object.fromEntries((cat ?? []).map((e) => [e.id as string, e.nombre as string]));
          }

          set({
            miProgreso: agregarMiProgreso(series, sesiones, nombres),
            miProgresoFecha: new Date().toISOString(),
          });
        } catch (e) {
          console.warn("No se pudo descargar «Mi progreso»:", e);
        } finally {
          set({ cargandoMiProgreso: false });
        }
      },

      // §3.3: tras registrar una serie, se suma a la frontera en memoria (fecha de la sesión de hoy).
      registrarSerieEnMarcas: (ejercicioId, serie) => {
        set((s) => ({
          marcas: {
            ...s.marcas,
            [ejercicioId]: agregarSerieAMarcas(s.marcas[ejercicioId] ?? null, ejercicioId, {
              ...serie,
              fecha: `${s.currentSession.fecha}T00:00:00-03:00`,
            }),
          },
        }));
      },

      cargarHistorialSesiones: async () => {
        if (!useOfflineQueueStore.getState().isOnline) return;
        const state = get();
        const session = state.currentSession;
        const studentId = resolverAlumnoIdParaEscritura(state, session);
        if (!studentId || !esUuid(studentId)) return;

        set({ cargandoHistorial: true });
        try {
          const { data: sesionesData, error: sesErr } = await supabase
            .from("registro_sesiones")
            .select("*")
            .eq("alumno_id", studentId)
            .order("fecha", { ascending: false })
            .limit(100);

          if (sesErr || !sesionesData || sesionesData.length === 0) {
            return;
          }

          const sesionIds = sesionesData.map((s) => s.id);
          const { data: seriesData } = await supabase
            .from("registro_series")
            .select("*, ejercicios(id, nombre)")
            .in("sesion_id", sesionIds)
            .order("numero_serie", { ascending: true });

          const seriesPorSesion: Record<string, (RegistroSerie & { ejercicioNombre: string })[]> = {};
          (seriesData || []).forEach((item: any) => {
            const ejNombre = item.ejercicios?.nombre || "Ejercicio";
            const row: RegistroSerie & { ejercicioNombre: string } = {
              id: item.id,
              sesion_id: item.sesion_id,
              ejercicio_id: item.ejercicio_id,
              ejercicioNombre: ejNombre,
              numero_serie: item.numero_serie,
              peso_kg: item.peso_kg,
              reps_hechas: item.reps_hechas,
              rpe_real: item.rpe_real,
              completada: item.completada,
              set_type: item.set_type,
              pain_reported: item.pain_reported,
              pain_notes: item.pain_notes,
              video_url: item.video_url,
              created_at: item.created_at,
              updated_at: item.updated_at,
            };
            if (!seriesPorSesion[item.sesion_id]) seriesPorSesion[item.sesion_id] = [];
            seriesPorSesion[item.sesion_id]!.push(row);
          });

          const remotas: HistoricalLoadEntry[] = sesionesData.map((ses) => ({
            sesion: ses as RegistroSesion,
            series: seriesPorSesion[ses.id] || [],
          }));

          set((state) => {
            const existentes = state.historialSesiones;
            const idsRemotos = new Set(remotas.map((r) => r.sesion.id));
            const localesSinRemoto = existentes.filter((e) => !idsRemotos.has(e.sesion.id));
            return {
              historialSesiones: [...localesSinRemoto, ...remotas].sort(
                (a, b) => new Date(b.sesion.fecha).getTime() - new Date(a.sesion.fecha).getTime()
              ),
            };
          });
        } catch (e) {
          console.warn("No se pudo descargar el historial de sesiones:", e);
        } finally {
          set({ cargandoHistorial: false });
        }
      },

      actualizarSerieHistorial: async (sesionId, serieId, pesoKg, repsHechas, atipica) => {
        const pesoValido = Math.max(0, Number(pesoKg) || 0);
        const repsValidas = Math.max(1, Math.round(Number(repsHechas) || 1));

        // 1. Guardado optimista inmediato en Zustand
        set((state) => {
          const nuevasEntradas = state.historialSesiones.map((entry) => {
            if (entry.sesion.id !== sesionId) return entry;
            const seriesActualizadas = entry.series.map((s) => {
              if (s.id !== serieId) return s;
              return {
                ...s,
                peso_kg: pesoValido,
                reps_hechas: repsValidas,
                ...(atipica !== undefined ? { atipica } : {}),
                updated_at: new Date().toISOString(),
              };
            });
            const nuevoVolumen = seriesActualizadas.reduce((acc, s) => {
              if (s.completada === false) return acc;
              return acc + (Number(s.peso_kg) || 0) * (Number(s.reps_hechas) || 0);
            }, 0);
            return {
              ...entry,
              sesion: {
                ...entry.sesion,
                volumen_total_kg: nuevoVolumen,
                updated_at: new Date().toISOString(),
              },
              series: seriesActualizadas,
            };
          });
          return { historialSesiones: nuevasEntradas };
        });

        // 2. Acumular evento en cola offline silenciosa
        useOfflineQueueStore.getState().enqueueEvent({
          id: "edit-serie-" + serieId + "-" + Date.now(),
          action: "HISTORIAL_SERIE_UPDATED",
          payload: {
            sesionId,
            serieId,
            pesoKg: pesoValido,
            repsHechas: repsValidas,
            updatedAt: new Date().toISOString(),
            ...(atipica !== undefined ? { atipica } : {}),
          },
        });

        // 3. Sincronizar en Supabase si estamos online
        if (useOfflineQueueStore.getState().isOnline) {
          try {
            if (esUuid(serieId)) {
              await supabase
                .from("registro_series")
                .update({
                  peso_kg: pesoValido,
                  reps_hechas: repsValidas,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", serieId);
            }
          } catch (err) {
            console.warn("Aviso al sincronizar edición de serie con Supabase:", err);
          }
        }
      },

      syncSessionToSupabase: async () => {
        if (activeSyncSessionPromise) {
          return activeSyncSessionPromise;
        }

        activeSyncSessionPromise = (async () => {
          const state = get();
          const session = state.currentSession;
          const studentId = resolverAlumnoIdParaEscritura(state, session);
          if (!studentId) {
            useOfflineQueueStore.getState().setSyncError(SIN_ALUMNO_ID_MSG);
            set({ toastSesion: { mensaje: SIN_ALUMNO_ID_MSG, tipo: "neutral" } });
            activeSyncSessionPromise = null;
            return { success: false, error: SIN_ALUMNO_ID_MSG };
          }

          const duracionMinutos =
            calcularDuracionMinutos(state.sessionStartedAt, session) ??
            state.historialSesiones.find((h) => h.sesion.id === session.id)?.sesion.duracion_minutos ??
            null;

          // Aplanar todas las series respetando el tipo_serie del plan si la serie no lo trae
          const allSets = session.ejercicios.flatMap((e) =>
            e.series.map((s) => ({
              ...s,
              set_type: normalizeSerieTipo(s.set_type ?? e.tipo_serie),
              exerciseId: e.ejercicio_id ?? e.id,
            }))
          );

          try {
            // Guardar registro_sesiones en Supabase
            const { error: sesErr } = await supabase.from("registro_sesiones").upsert(
              {
                id: session.id,
                alumno_id: studentId,
                dia_id: session.dia_id,
                dia_sugerido_id: session.dia_sugerido_id || null,
                motivo_cambio_dia: session.motivo_cambio_dia || null,
                duracion_minutos: duracionMinutos,
                // volumen_total_kg / effective_volume_kg los calcula la base desde registro_series (GOZS-701).
              },
              { onConflict: "id" }
            );

            if (sesErr) {
              console.warn("Aviso guardando sesion en Supabase:", sesErr.message);
            }

            // Guardar todas las series completadas en un solo upsert en lote (deduplicadas por clave)
            const seriesPorClave = new Map<
              string,
              {
                sesion_id: string;
                ejercicio_id: string;
                numero_serie: number;
                peso_kg: number;
                reps_hechas: number;
                rpe_real: number | null;
                completada: boolean;
                set_type: "NORMAL" | "WARMUP" | "DROPSET" | "FAILURE";
                pain_reported: boolean;
                pain_notes: string | null;
                video_url: string | null;
              }
            >();
            for (const s of allSets) {
              if (!s.completada) continue;
              const mappedType = normalizeSerieTipo(s.set_type);
              // Resolver ejercicio_id válido para FK de Supabase
              const resolvedEjId = s.exerciseId.length === 36 ? s.exerciseId : "55ddab2b-3449-41af-a04d-1f5ce33ad7d6";
              const clave = `${session.id}:${resolvedEjId}:${s.numero_serie}`;
              seriesPorClave.set(clave, {
                sesion_id: session.id,
                ejercicio_id: resolvedEjId,
                numero_serie: s.numero_serie,
                peso_kg: s.peso_kg,
                reps_hechas: s.reps_hechas,
                rpe_real: normalizarRpeReal(s.rpe_real),
                completada: true,
                set_type: mappedType,
                pain_reported: s.pain_reported || false,
                pain_notes: s.pain_notes || null,
                video_url: s.video_url || null,
              });
            }

            const seriesRows = Array.from(seriesPorClave.values());
            if (seriesRows.length > 0) {
              const { error: serErr } = await supabase
                .from("registro_series")
                .upsert(seriesRows, { onConflict: "sesion_id, ejercicio_id, numero_serie" });
              if (serErr) {
                console.warn("Aviso guardando series en Supabase:", serErr.message);
              }
            }

            // Vaciar la cola offline confirmada por el servidor si hay conexión
            if (useOfflineQueueStore.getState().isOnline) {
              await useOfflineQueueStore.getState().flushQueue();
            }

            // Invalidar y recargar automáticamente miProgreso tras guardar sesión
            void get().cargarMiProgreso();

            return { success: true };
          } catch (e: any) {
            console.error("Error sincronizando sesion con Supabase:", e);
            return { success: false, error: e?.message || "Error al sincronizar con Supabase" };
          } finally {
            activeSyncSessionPromise = null;
          }
        })();

        return activeSyncSessionPromise;
      },

      uncompleteSet: (exerciseId, setNumber) => {
        set((prevState) => ({
          currentSession: {
            ...prevState.currentSession,
            ejercicios: prevState.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) => {
                  if (s.numero_serie !== setNumber) return s;
                  return {
                    ...s,
                    completada: false,
                    completedAt: undefined,
                  };
                }),
              };
            }),
          },
        }));
      },

      startRestTimer: (seconds, exerciseName, setNumber) => {
        const safeSeconds = Math.max(0, seconds);
        set({
          restTimer: {
            isActive: true,
            isPaused: false,
            secondsRemaining: safeSeconds,
            totalSeconds: safeSeconds,
            exerciseName,
            setNumber,
            endsAt: Date.now() + safeSeconds * 1000,
          },
        });
      },

      tickTimer: () => {
        const { restTimer } = get();
        if (!restTimer.isActive || restTimer.isPaused) return;

        // Ancla al reloj: recupera el tiempo perdido si la pestaña estuvo suspendida.
        const clockRemaining =
          restTimer.endsAt != null
            ? Math.max(0, Math.ceil((restTimer.endsAt - Date.now()) / 1000))
            : restTimer.secondsRemaining - 1;
        const nextRemaining = Math.min(restTimer.secondsRemaining - 1, clockRemaining);

        if (nextRemaining <= 0) {
          // Timer terminado: reproducir sonido, vibrar y avisar con toast v7
          playRestTimerAlert();
          triggerHapticVibration([300, 150, 300]);
          set({
            restTimer: {
              ...restTimer,
              isActive: false,
              secondsRemaining: 0,
              endsAt: null,
            },
            toastSesion: {
              mensaje: "Terminó el descanso. A la serie.",
              tipo: "ok",
            },
          });
        } else {
          set({
            restTimer: {
              ...restTimer,
              secondsRemaining: nextRemaining,
            },
          });
        }
      },

      pauseTimer: () => {
        set((state) => {
          const { restTimer } = state;
          const synced =
            restTimer.isActive && !restTimer.isPaused && restTimer.endsAt != null
              ? Math.min(
                  restTimer.secondsRemaining,
                  Math.max(0, Math.ceil((restTimer.endsAt - Date.now()) / 1000)),
                )
              : restTimer.secondsRemaining;
          return {
            restTimer: { ...restTimer, isPaused: true, secondsRemaining: synced, endsAt: null },
          };
        });
      },

      resumeTimer: () => {
        set((state) => ({
          restTimer: {
            ...state.restTimer,
            isPaused: false,
            endsAt: Date.now() + state.restTimer.secondsRemaining * 1000,
          },
        }));
      },

      stopTimer: () => {
        set({
          restTimer: {
            isActive: false,
            isPaused: false,
            secondsRemaining: 0,
            totalSeconds: 0,
            exerciseName: "",
            setNumber: 0,
            endsAt: null,
          },
        });
      },

      addTimerSeconds: (seconds) => {
        set((state) => {
          const { restTimer } = state;
          const nextRemaining = Math.max(0, restTimer.secondsRemaining + seconds);
          const nextTotal = Math.max(nextRemaining, Math.max(0, restTimer.totalSeconds + seconds));
          return {
            restTimer: {
              ...restTimer,
              secondsRemaining: nextRemaining,
              totalSeconds: nextTotal,
              ...(restTimer.isActive && !restTimer.isPaused
                ? { endsAt: Date.now() + nextRemaining * 1000 }
                : {}),
            },
          };
        });
      },

      setSession: (session) => {
        set({ currentSession: session });
      },

      cargarLogrosRacha: async (alumnoIdParam) => {
        const alumnoId =
          alumnoIdParam ||
          get().planAlumno?.alumnos[0]?.id ||
          (get().currentSession.studentId !== DEFAULT_ATHLETE_ID
            ? get().currentSession.studentId
            : undefined);
        if (!alumnoId || !esUuid(alumnoId)) return;
        const count = await leerCantidadDiamantes(alumnoId);
        set((state) => ({
          diamantesRacha: Math.max(count, state.ciclosLogroRegistrados.length),
        }));
      },

      verificarYRegistrarLogroDiamante: async (semanas, alumnoIdParam) => {
        if (!Number.isFinite(semanas) || semanas < 52) return;
        const ciclosCompletados = Math.floor(semanas / 52);
        const alumnoId =
          alumnoIdParam ||
          get().planAlumno?.alumnos[0]?.id ||
          (get().currentSession.studentId !== DEFAULT_ATHLETE_ID
            ? get().currentSession.studentId
            : undefined);

        const registrados = get().ciclosLogroRegistrados;
        const pendientes: number[] = [];
        for (let ciclo = 1; ciclo <= ciclosCompletados; ciclo++) {
          if (!registrados.includes(ciclo)) {
            pendientes.push(ciclo);
          }
        }
        if (pendientes.length === 0) {
          if (get().diamantesRacha < ciclosCompletados) {
            set({ diamantesRacha: ciclosCompletados });
          }
          return;
        }

        set((state) => ({
          diamantesRacha: Math.max(state.diamantesRacha, ciclosCompletados),
          ciclosLogroRegistrados: Array.from(
            new Set([...state.ciclosLogroRegistrados, ...pendientes]),
          ).sort((a, b) => a - b),
        }));

        if (!alumnoId || !esUuid(alumnoId)) return;

        const isOnline = useOfflineQueueStore.getState().isOnline;
        for (const numeroCiclo of pendientes) {
          if (isOnline) {
            const res = await registrarLogroRachaIdempotente({
              alumnoId,
              numeroCiclo,
              tipo: "diamante",
            });
            if (res.ok) continue;
          }
          const eventId = `logro-racha-diamante-${alumnoId}-${numeroCiclo}`;
          const yaEncolado = useOfflineQueueStore
            .getState()
            .pendingEvents.some((ev) => ev.id === eventId);
          if (!yaEncolado) {
            useOfflineQueueStore.getState().enqueueEvent({
              id: eventId,
              action: "REGISTRAR_LOGRO_RACHA",
              payload: { alumnoId, numeroCiclo, tipo: "diamante" },
            });
          }
        }
      },

      cargarPlanAlumno: async () => {
        set({ cargandoPlan: true, errorPlan: false });
        try {
          const plan = await fetchPlanAlumno();
          if (!plan) {
            if (!get().planAlumno) {
              set({ errorPlan: true });
            }
            return;
          }
          const pendiente = get().nombrePreferidoPendiente;
          const onboardingPendiente = get().onboardingCompletadoPendiente;
          const perfilAlumno = plan.alumnos[0] as PerfilConNombrePreferido | undefined;
          const planNormalizado = actualizarPrimerAlumnoEnPlan(plan, {
            ...(pendiente !== undefined ? { nombre_preferido: pendiente } : {}),
            ...(onboardingPendiente ? { onboarding_completado: true } : {}),
          });

          const onboardingServidor = perfilAlumno?.onboarding_completado;
          set({
            planAlumno: planNormalizado,
            ...(pendiente === undefined
              ? { nombrePreferido: perfilAlumno?.nombre_preferido ?? null }
              : {}),
            ...(onboardingPendiente
              ? { onboardingCompletado: true }
              : typeof onboardingServidor === "boolean"
                ? { onboardingCompletado: onboardingServidor }
                : {}),
          });

          const prev = get().currentSession;
          const studentId = plan.alumnos[0]?.id;
          const diaEnCurso =
            studentId &&
            prev.studentId === studentId &&
            esUuid(prev.id) &&
            !get().sesionesCompletadas.some((s) => s.id === prev.id) &&
            plan.dias.some((d) => d.id === prev.dia_id)
              ? prev.dia_id
              : undefined;
          const cargaOk = get().loadStudentSession(studentId, diaEnCurso);
          if (!cargaOk && plan.alumnos[0]) {
            const alumnoReal = plan.alumnos[0];
            const coachRecomendada =
              (alumnoReal.nivel_vista_alumno as NivelVistaAlumno) || "SIMPLE";
            const eleccionAlumno = get().vistaElegidaPorAlumno;
            set((state) => ({
              vistaRecomendadaCoach: coachRecomendada,
              nivelVistaAlumno: eleccionAlumno ?? coachRecomendada,
              ...(state.currentSession.studentId !== alumnoReal.id ||
              state.currentSession.id === defaultSession.id
                ? {
                    currentSession: {
                      id: nuevoUuid(),
                      nombre_rutina: "",
                      fecha: new Date().toISOString().split("T")[0] || "2026-10-16",
                      ejercicios: [],
                      studentName: alumnoReal.nombre_completo || "",
                      studentId: alumnoReal.id,
                      dia_id: "",
                      molestias: [],
                    },
                    diaActivoId: null,
                  }
                : {}),
            }));
          }
          void get().cargarMolestiasDeSesion(get().currentSession.id);
          if (pendiente !== undefined) {
            void get().sincronizarNombrePreferidoPendiente();
          }
          if (onboardingPendiente) {
            void get().sincronizarOnboardingPendiente();
          }
          if (
            studentId &&
            useOfflineQueueStore.getState().isOnline &&
            typeof fetchSesionesRecientesAlumno === "function"
          ) {
            const sesionesRemotas = await fetchSesionesRecientesAlumno(studentId);
            if (sesionesRemotas !== null) {
              set((state) => ({
                fechasSesionesServidor: sesionesRemotas.map((s) => s.fecha),
                sesionesCompletadas: fusionarSesionesSemanaDesdeServidor(
                  state.sesionesCompletadas,
                  sesionesRemotas,
                ),
              }));
            }
          }
          if (studentId && useOfflineQueueStore.getState().isOnline) {
            void get().cargarLogrosRacha(studentId);
          }
        } catch (err) {
          console.warn("No se pudo cargar el plan del alumno (se conserva el cacheado):", err);
          if (!get().planAlumno) {
            set({ errorPlan: true });
          }
        } finally {
          set({ cargandoPlan: false });
        }
      },

      loadStudentSession: (_studentId, diaId, motivo = null, diaSugeridoId = null) => {
        const data = get().planAlumno;
        const student = data?.alumnos[0];
        const plan = data?.planes[0];
        if (!data || !student || !plan) return false;

        const dias = data.dias.filter((d) => d.plan_id === plan.id).sort((a, b) => a.orden - b.orden);
        if (dias.length === 0) return false;

        const selectedDia = (diaId ? dias.find((d) => d.id === diaId) : undefined) ?? dias[0];
        if (!selectedDia) return false;

        const ejRutinaList = data.ejerciciosEnRutina.filter((er) => er.dia_id === selectedDia.id).sort(
          (a, b) => a.orden - b.orden,
        );

        if (ejRutinaList.length === 0) return false;

        const mappedExercises: LiveWorkoutExercise[] = ejRutinaList.map((er, idx) => {
          const ejMaestro = data.ejercicios.find((e) => e.id === er.ejercicio_id);
          const seriesCount = typeof er.series === "number" && er.series > 0 ? er.series : 3;
          const ultimaVezEjercicio = get().ultimaVez?.[er.ejercicio_id];

          const tipoMedicion = (er as any).tipo_medicion === "TIEMPO" ? "TIEMPO" : "REPS";
          const tiempoObjetivo = typeof (er as any).tiempo_objetivo_segundos === "number"
            ? (er as any).tiempo_objetivo_segundos
            : null;
          const esUnilateral = Boolean((er as any).es_unilateral);
          const planSetType = normalizeSerieTipo((er as any).tipo_serie);

          const sets: LiveWorkoutSet[] = Array.from({ length: seriesCount }, (_, sIdx) => {
            const prevSet = ultimaVezEjercicio?.series?.[sIdx] ?? ultimaVezEjercicio?.series?.[0];
            const defaultPeso = prevSet?.peso_kg ?? 0;
            const reps = tipoMedicion === "TIEMPO"
              ? (tiempoObjetivo ?? parseDefaultReps(er.repeticiones, sIdx + 1))
              : parseDefaultReps(er.repeticiones, sIdx + 1);
            return {
              numero_serie: sIdx + 1,
              peso_kg: defaultPeso,
              reps_hechas: reps,
              rpe_real: null,
              completada: false,
              estimated1RM: calculateEpley1RM(defaultPeso, reps),
              set_type: planSetType,
            };
          });

          return {
            id: er.id || `ej-${idx + 1}`,
            ejercicio_id: er.ejercicio_id,
            nombre: ejMaestro?.nombre || `Ejercicio #${idx + 1}`,
            musculos_principales: ejMaestro?.musculos_principales || [],
            descanso_segundos: er.descanso_segundos || 60,
            rpe_objetivo: er.rpe_objetivo || 8,
            repeticiones_objetivo: er.repeticiones || "10-12",
            series: sets,
            url_video: ejMaestro?.url_video || null,
            comentario: er.notas || ejMaestro?.comentario || null,
            notas: er.notas || ejMaestro?.comentario || null,
            tempo: er.tempo || undefined,
            tempo_activo: Boolean((er as any).tempo_activo),
            force_rpe_required: Boolean((er as any).force_rpe_required),
            es_superserie: Boolean(er.es_superserie),
            grupo_superserie: er.grupo_superserie ?? null,
            tipo_serie: (er as any).tipo_serie,
            tipo_medicion: tipoMedicion,
            tiempo_objetivo_segundos: tiempoObjetivo,
            es_unilateral: esUnilateral,
            usa_barra: Boolean(ejMaestro?.usa_barra),
          };
        });

        const sortedExercises = sortExercisesWithWarmupFirst(mappedExercises);

        const prev = get().currentSession;
        const sesionYaCerrada = get().sesionesCompletadas.some((s) => s.id === prev.id);
        const esMismaSesionEnCurso =
          prev.studentId === student.id &&
          prev.dia_id === selectedDia.id &&
          esUuid(prev.id) &&
          !sesionYaCerrada;

        const hasCompletedSets =
          esMismaSesionEnCurso &&
          prev.ejercicios.some((ej) => ej.series.some((s) => s.completada));

        const newSession: LiveWorkoutSession = {
          id: esMismaSesionEnCurso ? prev.id : nuevoUuid(),
          nombre_rutina: `${student.nombre_completo}: ${selectedDia.nombre}`,
          fecha: new Date().toISOString().split("T")[0] || "2026-10-16",
          ejercicios: hasCompletedSets ? prev.ejercicios : sortedExercises,
          studentName: student.nombre_completo,
          studentId: student.id,
          dia_id: selectedDia.id,
          dia_sugerido_id:
            diaSugeridoId ?? (hasCompletedSets ? (prev.dia_sugerido_id ?? null) : null),
          motivo_cambio_dia:
            motivo ?? (hasCompletedSets ? (prev.motivo_cambio_dia ?? null) : null),
          // Al retomar la misma sesión en curso se conservan sus molestias (no se pierden de la vista).
          molestias: esMismaSesionEnCurso ? (prev.molestias ?? []) : [],
        };

        const coachRecomendada =
          (student.nivel_vista_alumno as NivelVistaAlumno) || "SIMPLE";
        const eleccionAlumno = get().vistaElegidaPorAlumno;
        const vistaEfectiva = eleccionAlumno ?? coachRecomendada;

        set((prev) => ({
          molestiasPendientesFueraDeSesion: esMismaSesionEnCurso
            ? prev.molestiasPendientesFueraDeSesion
            : fusionarPendientesFueraDeSesion(
                prev.molestiasPendientesFueraDeSesion,
                prev.currentSession.molestias,
              ),
          currentSession: newSession,
          diaActivoId: prev.diaActivoId ? selectedDia.id : null,
          sessionStartedAt: esMismaSesionEnCurso ? prev.sessionStartedAt : null,
          diaElegidoHoyId: null,
          vistaRecomendadaCoach: coachRecomendada,
          nivelVistaAlumno: vistaEfectiva,
          seriesRecordIds: esMismaSesionEnCurso ? prev.seriesRecordIds : [],
          sessionPRs: esMismaSesionEnCurso ? prev.sessionPRs : [],
          restTimer: {
            isActive: false,
            isPaused: false,
            secondsRemaining: 0,
            totalSeconds: 0,
            exerciseName: "",
            setNumber: 0,
          },
        }));

        return true;
      },

      resetSessionToDefaults: () => {
        const eleccionAlumno = get().vistaElegidaPorAlumno;
        set((prev) => ({
          molestiasPendientesFueraDeSesion: fusionarPendientesFueraDeSesion(
            prev.molestiasPendientesFueraDeSesion,
            prev.currentSession.molestias,
          ),
          currentSession: defaultSession,
          vistaRecomendadaCoach: "SIMPLE",
          nivelVistaAlumno: eleccionAlumno ?? "SIMPLE",
          stopProtocolActive: false,
          molestiaEnvioError: null,
          molestiasErrorRegistradoIds: [],
          diaActivoId: null,
          sessionStartedAt: null,
          ejercicioAbiertoId: null,
          diaElegidoHoyId: null,
          diaSugeridoId: null,
          motivoCambioDia: null,
          seriesRecordIds: [],
          sessionPRs: [],
          restTimer: {
            isActive: false,
            isPaused: false,
            secondsRemaining: 0,
            totalSeconds: 0,
            exerciseName: "",
            setNumber: 0,
          },
        }));
      },

      repararSesionesNoUuid: () => {
        repararSesionesNoUuid();
      },
    }),
    {
      name: "gozster-athlete-store",
      version: 2,
      storage: createJSONStorage(() => userScopedStorage),
      migrate: (persistedState: any, version: number) => {
        const state = persistedState as Partial<AthleteStoreState>;
        if (
          version < 2 ||
          !state?.currentSession?.studentId
        ) {
          return {
            ...state,
            currentSession: defaultSession,
            diaActivoId: null,
            diaElegidoHoyId: null,
          };
        }
        return state;
      },
      // No persistir el estado dinámico del temporizador para evitar inconsistencias al recargar
      partialize: (state) => ({
        membershipStatus: state.membershipStatus,
        pasoIncrementoPeso: state.pasoIncrementoPeso,
        colapsarRutina: state.colapsarRutina,
        currentSession: state.currentSession,
        planAlumno: state.planAlumno,
        nivelVistaAlumno: state.nivelVistaAlumno,
        vistaElegidaPorAlumno: state.vistaElegidaPorAlumno,
        vistaRecomendadaCoach: state.vistaRecomendadaCoach,
        cuestionarioInicial: state.cuestionarioInicial,
        onboardingCompletado: state.onboardingCompletado,
        onboardingCompletadoPendiente: state.onboardingCompletadoPendiente,
        mostrarTimerDescanso: state.mostrarTimerDescanso,
        sessionStartedAt: state.sessionStartedAt,
        sesionesCompletadas: state.sesionesCompletadas,
        fechasSesionesServidor: state.fechasSesionesServidor,
        diamantesRacha: state.diamantesRacha,
        ciclosLogroRegistrados: state.ciclosLogroRegistrados,
        ultimaVez: state.ultimaVez,
        marcas: state.marcas,
        seriesRecordIds: state.seriesRecordIds,
        sessionPRs: state.sessionPRs,
        miProgreso: state.miProgreso,
        miProgresoFecha: state.miProgresoFecha,
        diaElegidoHoyId: state.diaElegidoHoyId,
        diaSugeridoId: state.diaSugeridoId,
        motivoCambioDia: state.motivoCambioDia,
        historialSesiones: state.historialSesiones,
        molestiasPendientesFueraDeSesion: state.molestiasPendientesFueraDeSesion,
        nombrePreferido: state.nombrePreferido,
        nombrePreferidoPendiente: state.nombrePreferidoPendiente,
      }),
    },
  ),
);

/**
 * Repara al iniciar la app los ids de sesión heredados que no son UUID (`session-<alumno>-<día>`):
 * asigna un UUID nuevo por cada id viejo distinto preservando agrupación y orden en `WORKOUT_SET_*`,
 * corrige `currentSession.id` y `sesionesCompletadas[].id`, y dispara `flushQueue()` si reparó eventos.
 */
export function repararSesionesNoUuid(): void {
  const mapaIds = new Map<string, string>();
  const mapearId = (idViejo: string): string => {
    const existente = mapaIds.get(idViejo);
    if (existente) return existente;
    const nuevo = nuevoUuid();
    mapaIds.set(idViejo, nuevo);
    return nuevo;
  };

  const queueState = useOfflineQueueStore.getState();
  let repararonEventos = false;
  const eventosActualizados = queueState.pendingEvents.map((ev) => {
    if (!ev.action.startsWith("WORKOUT_SET_")) return ev;
    const sid = ev.payload?.sessionId;
    if (typeof sid !== "string" || sid.length === 0 || esUuid(sid)) return ev;
    repararonEventos = true;
    return {
      ...ev,
      payload: {
        ...ev.payload,
        sessionId: mapearId(sid),
      },
    };
  });

  if (repararonEventos) {
    useOfflineQueueStore.setState({ pendingEvents: eventosActualizados });
  }

  const athleteState = useAthleteStore.getState();
  const currentId = athleteState.currentSession?.id;
  const currentNecesita =
    typeof currentId === "string" && currentId.length > 0 && !esUuid(currentId);
  const completadasNecesitan = athleteState.sesionesCompletadas.some(
    (s) => typeof s.id === "string" && s.id.length > 0 && !esUuid(s.id),
  );

  if (currentNecesita || completadasNecesitan) {
    useAthleteStore.setState((state) => ({
      ...(currentNecesita
        ? {
            currentSession: {
              ...state.currentSession,
              id: mapearId(state.currentSession.id),
            },
          }
        : {}),
      ...(completadasNecesitan
        ? {
            sesionesCompletadas: state.sesionesCompletadas.map((s) =>
              typeof s.id === "string" && s.id.length > 0 && !esUuid(s.id)
                ? { ...s, id: mapearId(s.id) }
                : s,
            ),
          }
        : {}),
    }));
  }

  if (repararonEventos && queueState.isOnline) {
    void useOfflineQueueStore.getState().flushQueue();
  }
}
