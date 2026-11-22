/**
 * Fixtures 100% sintéticos para tests (sin datos de personas reales).
 * Reemplaza al antiguo dataset de respaldo del Studio.
 */
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import type {
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";

const TS = "2026-07-26T22:56:23+0000";
const COACH_ID = "00000000-0000-4000-8000-0000000000c0";
const ids = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

export const SINT_ALUMNOS: Perfil[] = [1, 2, 3].map((n) => ({
  id: ids(n),
  email: `alumno${n}@example.test`,
  nombre_completo: `Alumno Sintetico ${n}`,
  rol: "ALUMNO",
  estado_membresia: "ACTIVA",
  profesor_asignado_id: COACH_ID,
  sexo: n % 2 ? "M" : "F",
  peso_corporal_kg: 60 + n,
  fecha_baja: null,
  created_at: TS,
  updated_at: TS,
})) as Perfil[];

export const SINT_PLANES: PlanEntrenamiento[] = SINT_ALUMNOS.map((a, i) => ({
  id: `00000000-0000-4000-8000-0000000001${i}0`,
  profesor_id: COACH_ID,
  alumno_id: a.id,
  nombre: `Plan sintetico ${i + 1}`,
  estado: "ACTIVO",
  fecha_inicio: TS,
  fecha_fin: null,
  comentarios: null,
  created_at: TS,
  updated_at: TS,
})) as PlanEntrenamiento[];

export const SINT_DIAS: DiaRutina[] = SINT_PLANES.flatMap((p, i) =>
  [1, 2].map((orden) => ({
    id: `00000000-0000-4000-8000-0000000002${i}${orden}`,
    plan_id: p.id,
    nombre: `DIA ${orden}`,
    orden,
    created_at: TS,
    updated_at: TS,
  })),
) as DiaRutina[];

export const SINT_EJERCICIOS: Ejercicio[] = [
  ["ej-sentadilla", "Sentadilla"],
  ["ej-press-plano", "Press Plano con Barra"],
  ["ej-estocada", "Estocadas Caminando con Mancuernas"],
  ["ej-dominadas-c-carga", "Dominadas c/ Carga"],
].map(([id, nombre]) => ({
  id,
  nombre,
  comentario: null,
  url_video: "dQw4w9WgXcQ",
  musculos_principales: ["Cuerpo completo"],
  musculos_secundarios: [],
  creado_por: COACH_ID,
  created_at: TS,
  updated_at: TS,
})) as Ejercicio[];

export const SINT_EJERCICIOS_RUTINA: EjercicioEnRutina[] = SINT_DIAS.flatMap((d) =>
  SINT_EJERCICIOS.map((e, i) => ({
    id: `er-${d.id.slice(-3)}-${i}`,
    dia_id: d.id,
    ejercicio_id: e.id,
    orden: i + 1,
    series: 3,
    repeticiones: "10",
    descanso_segundos: 90,
    rpe_objetivo: 7,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    created_at: TS,
    updated_at: TS,
  })),
) as EjercicioEnRutina[];

export const SINT_HISTORIAL_CARGAS: Record<string, HistoricalLoadEntry[]> = {
  [ids(1)]: [
    {
      sesion: {
        id: "ses-sint-1",
        alumno_id: ids(1),
        dia_id: SINT_DIAS[0]!.id,
        dia_sugerido_id: null,
        motivo_cambio_dia: null,
        fecha: "2026-10-05T18:00:00.000Z",
        duracion_minutos: 60,
        volumen_total_kg: 900,
        created_at: "2026-10-05T18:00:00.000Z",
        updated_at: "2026-10-05T18:00:00.000Z",
      },
      series: [
        {
          id: "ser-sint-1",
          sesion_id: "ses-sint-1",
          ejercicio_id: "ej-press-plano",
          ejercicioNombre: "Press Plano con Barra",
          numero_serie: 1,
          peso_kg: 30,
          reps_hechas: 10,
          rpe_real: 7,
          completada: true,
          created_at: "2026-10-05T18:00:00.000Z",
          updated_at: "2026-10-05T18:00:00.000Z",
        },
      ],
    },
    {
      sesion: {
        id: "ses-sint-0",
        alumno_id: ids(1),
        dia_id: SINT_DIAS[0]!.id,
        dia_sugerido_id: null,
        motivo_cambio_dia: null,
        fecha: "2026-09-28T18:00:00.000Z",
        duracion_minutos: 60,
        volumen_total_kg: 900,
        created_at: "2026-09-28T18:00:00.000Z",
        updated_at: "2026-09-28T18:00:00.000Z",
      },
      series: [
        {
          id: "ser-sint-0",
          sesion_id: "ses-sint-0",
          ejercicio_id: "ej-press-plano",
          ejercicioNombre: "Press Plano con Barra",
          numero_serie: 1,
          peso_kg: 30,
          reps_hechas: 10,
          rpe_real: 7,
          completada: true,
          created_at: "2026-09-28T18:00:00.000Z",
          updated_at: "2026-09-28T18:00:00.000Z",
        },
      ],
    },
  ],
} as unknown as Record<string, HistoricalLoadEntry[]>;
