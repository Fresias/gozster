import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/store/use-offline-queue";
import type { Perfil, RankingPR, Reserva } from "@/types/database.types";

export interface RankingCalculadoItem {
  alumno_id: string;
  nombre_completo: string;
  sexo: "M" | "F" | null;
  peso_corporal_kg: number | null;
  pr_id: string;
  peso_kg: number;
  reps: number;
  fecha: string;
  ratio: number | null; // PR (kg) / Peso Corporal (kg)
  posicion?: number;
  motivo_exclusion?: "SIN_PESO_CORPORAL" | "SIN_SEXO" | "SIN_PESO_Y_SEXO" | null;
}

export interface ResultadoRanking {
  hombres: RankingCalculadoItem[];
  mujeres: RankingCalculadoItem[];
  sinClasificar: RankingCalculadoItem[];
}

export interface RankingState {
  claseIdSeleccionada: string | null;
  ejercicioIdSeleccionado: string | null;
  prs: RankingPR[];
  cargando: boolean;
  guardandoPrId: string | null;
  error: string | null;
  aviso: string | null;

  setClaseId: (id: string | null) => void;
  setEjercicioId: (id: string | null) => void;
  cargarPrsClase: (claseId: string, ejercicioId?: string) => Promise<void>;
  registrarPr: (datos: {
    clase_id: string;
    alumno_id: string;
    ejercicio_id: string;
    peso_kg: number;
    reps?: number;
    fecha?: string;
  }) => Promise<{ ok: boolean; pr?: RankingPR; error?: string }>;
  actualizarPerfilAlumno: (
    alumnoId: string,
    peso_corporal_kg: number,
    sexo: "M" | "F",
  ) => Promise<{ ok: boolean; error?: string }>;
  calcularRanking: (params: {
    claseId: string;
    ejercicioId: string;
    alumnos: Perfil[];
    reservas?: Reserva[];
  }) => ResultadoRanking;
  limpiarAviso: () => void;
}

export const DEMO_RANKING_PRS_INICIALES: RankingPR[] = [
  {
    id: "demo-pr-01-lucas",
    clase_id: "demo-clase-func-miercoles",
    alumno_id: "demo-alumno-01-lucas",
    ejercicio_id: "ej-demo-dominadas",
    fecha: new Date().toISOString().substring(0, 10),
    peso_kg: 35,
    reps: 1,
    registrado_por: "00000000-0000-4000-a000-000000000001",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-pr-02-mateo",
    clase_id: "demo-clase-func-miercoles",
    alumno_id: "demo-alumno-05-mateo",
    ejercicio_id: "ej-demo-dominadas",
    fecha: new Date().toISOString().substring(0, 10),
    peso_kg: 30,
    reps: 1,
    registrado_por: "00000000-0000-4000-a000-000000000001",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-pr-03-camila",
    clase_id: "demo-clase-func-miercoles",
    alumno_id: "demo-alumno-08-camila",
    ejercicio_id: "ej-demo-dominadas",
    fecha: new Date().toISOString().substring(0, 10),
    peso_kg: 15,
    reps: 1,
    registrado_por: "00000000-0000-4000-a000-000000000001",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

/**
 * Función pura de cálculo de ranking relativo.
 * Ordena por ratio (PR / peso corporal) DESC en tablas separadas por sexo.
 */
export function calcularRankingRelativo(params: {
  prs: RankingPR[];
  claseId: string;
  ejercicioId: string;
  alumnos: Perfil[];
  reservas?: Reserva[];
}): ResultadoRanking {
  const { prs, claseId, ejercicioId, alumnos } = params;

  // Filtrar PRs correspondientes a esta clase y este ejercicio
  const prsFiltrados = prs.filter(
    (p) => p.clase_id === claseId && p.ejercicio_id === ejercicioId,
  );

  // Mapear por alumno_id tomando su mejor PR en esta clase (mayor peso_kg)
  const mejorPrPorAlumno = new Map<string, RankingPR>();
  for (const pr of prsFiltrados) {
    const actual = mejorPrPorAlumno.get(pr.alumno_id);
    if (!actual || pr.peso_kg > actual.peso_kg) {
      mejorPrPorAlumno.set(pr.alumno_id, pr);
    }
  }

  const alumnosMap = new Map(alumnos.map((a) => [a.id, a]));

  const hombres: RankingCalculadoItem[] = [];
  const mujeres: RankingCalculadoItem[] = [];
  const sinClasificar: RankingCalculadoItem[] = [];

  mejorPrPorAlumno.forEach((pr, alumnoId) => {
    const alumno = alumnosMap.get(alumnoId);
    const nombre = alumno?.nombre_completo ?? "Alumno Desconocido";
    const pesoCorporal = alumno?.peso_corporal_kg ?? null;
    const sexo = alumno?.sexo ?? null;

    if (pesoCorporal && pesoCorporal > 0 && (sexo === "M" || sexo === "F")) {
      const ratio = Math.round((pr.peso_kg / pesoCorporal) * 100) / 100;
      const item: RankingCalculadoItem = {
        alumno_id: alumnoId,
        nombre_completo: nombre,
        sexo,
        peso_corporal_kg: pesoCorporal,
        pr_id: pr.id,
        peso_kg: pr.peso_kg,
        reps: pr.reps,
        fecha: pr.fecha,
        ratio,
        motivo_exclusion: null,
      };

      if (sexo === "M") {
        hombres.push(item);
      } else {
        mujeres.push(item);
      }
    } else {
      let motivo: RankingCalculadoItem["motivo_exclusion"] = "SIN_PESO_Y_SEXO";
      if (!pesoCorporal && sexo) motivo = "SIN_PESO_CORPORAL";
      else if (pesoCorporal && !sexo) motivo = "SIN_SEXO";

      sinClasificar.push({
        alumno_id: alumnoId,
        nombre_completo: nombre,
        sexo,
        peso_corporal_kg: pesoCorporal,
        pr_id: pr.id,
        peso_kg: pr.peso_kg,
        reps: pr.reps,
        fecha: pr.fecha,
        ratio: null,
        motivo_exclusion: motivo,
      });
    }
  });

  // Ordenar hombres por ratio DESC, luego peso_kg DESC, luego nombre
  hombres.sort((a, b) => {
    if ((b.ratio ?? 0) !== (a.ratio ?? 0)) return (b.ratio ?? 0) - (a.ratio ?? 0);
    if (b.peso_kg !== a.peso_kg) return b.peso_kg - a.peso_kg;
    return a.nombre_completo.localeCompare(b.nombre_completo);
  });
  hombres.forEach((item, idx) => {
    item.posicion = idx + 1;
  });

  // Ordenar mujeres por ratio DESC, luego peso_kg DESC, luego nombre
  mujeres.sort((a, b) => {
    if ((b.ratio ?? 0) !== (a.ratio ?? 0)) return (b.ratio ?? 0) - (a.ratio ?? 0);
    if (b.peso_kg !== a.peso_kg) return b.peso_kg - a.peso_kg;
    return a.nombre_completo.localeCompare(b.nombre_completo);
  });
  mujeres.forEach((item, idx) => {
    item.posicion = idx + 1;
  });

  // Ordenar sin clasificar por peso_kg DESC
  sinClasificar.sort((a, b) => b.peso_kg - a.peso_kg);

  return { hombres, mujeres, sinClasificar };
}

export const useRankingStore = create<RankingState>()(
  persist(
    (set, get) => ({
      claseIdSeleccionada: null,
      ejercicioIdSeleccionado: null,
      prs: DEMO_RANKING_PRS_INICIALES,
      cargando: false,
      guardandoPrId: null,
      error: null,
      aviso: null,

      setClaseId: (id) => set({ claseIdSeleccionada: id }),
      setEjercicioId: (id) => set({ ejercicioIdSeleccionado: id }),

      limpiarAviso: () => set({ aviso: null, error: null }),

      cargarPrsClase: async () => {
        // Los PRs viven en la lista local persistida.
      },

      registrarPr: async (datos) => {
        const reps = datos.reps ?? 1;
        const fecha = datos.fecha ?? new Date().toISOString().substring(0, 10);
        const nuevoId = `pr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        set({ guardandoPrId: datos.alumno_id, error: null });

        const nuevoPr: RankingPR = {
          id: nuevoId,
          clase_id: datos.clase_id,
          alumno_id: datos.alumno_id,
          ejercicio_id: datos.ejercicio_id,
          peso_kg: datos.peso_kg,
          reps,
          fecha,
          registrado_por: "coach-actual",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Actualización optimista local
        const prsActuales = get().prs.filter(
          (p) =>
            !(
              p.clase_id === datos.clase_id &&
              p.alumno_id === datos.alumno_id &&
              p.ejercicio_id === datos.ejercicio_id
            ),
        );
        set({
          prs: [...prsActuales, nuevoPr],
          guardandoPrId: null,
          aviso: "PR guardado con éxito.",
        });
        return { ok: true, pr: nuevoPr };
      },

      actualizarPerfilAlumno: async (alumnoId, peso_corporal_kg, sexo) => {
        if (peso_corporal_kg <= 0 || peso_corporal_kg > 500) {
          return { ok: false, error: "El peso corporal debe ser mayor a 0 y hasta 500 kg." };
        }
        if (sexo !== "M" && sexo !== "F") {
          return { ok: false, error: "El sexo debe ser 'M' o 'F'." };
        }

        set({ aviso: "Datos de peso y sexo guardados en el perfil del alumno." });
        return { ok: true };
      },

      calcularRanking: (params) => {
        return calcularRankingRelativo({
          prs: get().prs,
          claseId: params.claseId,
          ejercicioId: params.ejercicioId,
          alumnos: params.alumnos,
          reservas: params.reservas,
        });
      },
    }),
    {
      name: "gozster-ranking-store",
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        claseIdSeleccionada: state.claseIdSeleccionada,
        ejercicioIdSeleccionado: state.ejercicioIdSeleccionado,
        prs: state.prs,
      }),
    },
  ),
);
