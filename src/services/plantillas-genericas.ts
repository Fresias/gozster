export interface PlantillaEjercicioItem {
  nombre: string;
  orden: number;
  series: number;
  repeticiones: string;
  descanso_segundos: number;
  rpe_objetivo?: number | null;
  notas?: string | null;
}

export interface PlantillaDiaItem {
  id: string;
  nombre: string;
  orden: number;
  ejercicios: PlantillaEjercicioItem[];
}

export interface PlantillaGenerica {
  id: string;
  nombre: string;
  descripcion: string;
  comentarios: string;
  categoria: string;
  dias: PlantillaDiaItem[];
}

/** ID canónico sincronizado con supabase/seed.sql (GOZS-228) */
export const PLANTILLA_ADAPTACION_ID = "22222222-2222-4222-8222-2222222222a1";
export const DIA_ADAPTACION_ID = "33333333-3333-4333-8333-3333333333a1";

/** IDs canónicos para las 3 rutinas genéricas básicas (GOZS-351) */
export const PLANTILLA_TORSO_ID = "22222222-2222-4222-8222-2222222222b2";
export const DIA_TORSO_ID = "33333333-3333-4333-8333-3333333333b2";

export const PLANTILLA_PIERNAS_CORE_ID = "22222222-2222-4222-8222-2222222222c3";
export const DIA_PIERNAS_CORE_ID = "33333333-3333-4333-8333-3333333333c3";

/** Catálogo de plantillas genéricas disponibles en Coach Studio (3 plantillas básicas) */
export const PLANTILLAS_GENERICAS: PlantillaGenerica[] = [
  {
    id: PLANTILLA_ADAPTACION_ID,
    nombre: "Adaptación - Primer día de gimnasio",
    categoria: "Adaptación Full Body",
    descripcion:
      "Rutina base de aclimatación para atletas que inician en el gimnasio o retornan tras una pausa prolongada.",
    comentarios:
      "Rutina genérica de adaptación: cargas livianas, técnica primero, RPE 5-6 (4-5 repeticiones en recámara).",
    dias: [
      {
        id: DIA_ADAPTACION_ID,
        nombre: "Día 1: Adaptación Full Body",
        orden: 1,
        ejercicios: [
          {
            nombre: "Prensa de Piernas",
            orden: 1,
            series: 2,
            repeticiones: "12",
            descanso_segundos: 90,
            rpe_objetivo: 5.0,
            notas: "Carga liviana, aprender el movimiento.",
          },
          {
            nombre: "Jalón al Pecho",
            orden: 2,
            series: 2,
            repeticiones: "12",
            descanso_segundos: 90,
            rpe_objetivo: 5.0,
            notas: null,
          },
          {
            nombre: "Press de Pecho en Máquina",
            orden: 3,
            series: 2,
            repeticiones: "12",
            descanso_segundos: 90,
            rpe_objetivo: 5.0,
            notas: null,
          },
          {
            nombre: "Remo en Máquina",
            orden: 4,
            series: 2,
            repeticiones: "12",
            descanso_segundos: 90,
            rpe_objetivo: 5.0,
            notas: null,
          },
          {
            nombre: "Plancha",
            orden: 5,
            series: 2,
            repeticiones: "20-30 s",
            descanso_segundos: 60,
            rpe_objetivo: 5.0,
            notas: "Mantener la posición con buena técnica.",
          },
        ],
      },
    ],
  },
  {
    id: PLANTILLA_TORSO_ID,
    nombre: "Fuerza e Hipertrofia - Torso (Empuje y Tracción)",
    categoria: "Fuerza e Hipertrofia",
    descripcion:
      "Rutina estructurada de tren superior para ganancia de fuerza e hipertrofia con ejercicios multiarticulares.",
    comentarios:
      "Controlar la fase excéntrica y respetar los descansos programados. RPE 7-8.",
    dias: [
      {
        id: DIA_TORSO_ID,
        nombre: "Día 1: Torso / Tren Superior",
        orden: 1,
        ejercicios: [
          {
            nombre: "Press de Pecho en Máquina",
            orden: 1,
            series: 3,
            repeticiones: "10-12",
            descanso_segundos: 90,
            rpe_objetivo: 7.5,
            notas: "Retracción escapular firme al inicio de cada repetición.",
          },
          {
            nombre: "Remo en Máquina",
            orden: 2,
            series: 3,
            repeticiones: "10-12",
            descanso_segundos: 90,
            rpe_objetivo: 7.5,
            notas: "Pausa de 1 segundo en máxima contracción.",
          },
          {
            nombre: "Jalón al Pecho",
            orden: 3,
            series: 3,
            repeticiones: "10",
            descanso_segundos: 90,
            rpe_objetivo: 8.0,
            notas: null,
          },
          {
            nombre: "Plancha",
            orden: 4,
            series: 3,
            repeticiones: "30-45 s",
            descanso_segundos: 60,
            rpe_objetivo: 7.0,
            notas: "Mantener tensión continua en abdomen y glúteos.",
          },
        ],
      },
    ],
  },
  {
    id: PLANTILLA_PIERNAS_CORE_ID,
    nombre: "Fuerza e Hipertrofia - Piernas y Core",
    categoria: "Fuerza e Hipertrofia",
    descripcion:
      "Rutina orientada al desarrollo de tren inferior y estabilidad del tronco con máquinas guiadas y peso corporal.",
    comentarios:
      "Priorizar profundidad segura y control articular en cada serie. RPE 7-8.",
    dias: [
      {
        id: DIA_PIERNAS_CORE_ID,
        nombre: "Día 1: Piernas y Core",
        orden: 1,
        ejercicios: [
          {
            nombre: "Prensa de Piernas",
            orden: 1,
            series: 3,
            repeticiones: "10-12",
            descanso_segundos: 120,
            rpe_objetivo: 8.0,
            notas: "Pies al ancho de hombros, no bloquear rodillas en extensión.",
          },
          {
            nombre: "Plancha",
            orden: 2,
            series: 3,
            repeticiones: "30-45 s",
            descanso_segundos: 60,
            rpe_objetivo: 7.0,
            notas: "Respiración controlada y espalda neutra.",
          },
          {
            nombre: "Remo en Máquina",
            orden: 3,
            series: 2,
            repeticiones: "12",
            descanso_segundos: 60,
            rpe_objetivo: 6.5,
            notas: "Trabajo postural complementario.",
          },
        ],
      },
    ],
  },
];

export function obtenerPlantillasGenericas(): PlantillaGenerica[] {
  return PLANTILLAS_GENERICAS;
}

export function obtenerPlantillaGenericaPorId(
  id: string,
): PlantillaGenerica | undefined {
  return PLANTILLAS_GENERICAS.find((p) => p.id === id);
}
