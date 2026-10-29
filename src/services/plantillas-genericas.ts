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

/** Catálogo de plantillas genéricas disponibles en Coach Studio */
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
];

export function obtenerPlantillasGenericas(): PlantillaGenerica[] {
  return PLANTILLAS_GENERICAS;
}

export function obtenerPlantillaGenericaPorId(
  id: string,
): PlantillaGenerica | undefined {
  return PLANTILLAS_GENERICAS.find((p) => p.id === id);
}
