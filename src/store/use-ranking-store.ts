import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-storage";
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
  perfilesActualizados: Record<string, { peso_corporal_kg?: number; sexo?: "M" | "F" }>;
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
  guardarFilaRegistro: (datos: {
    clase_id: string;
    alumno_id: string;
    ejercicio_id: string;
    peso_corporal_kg?: number;
    sexo?: "M" | "F";
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

export const DEMO_PERFILES_INICIALES: Record<
  string,
  { peso_corporal_kg?: number; sexo?: "M" | "F" }
> = {
  "demo-alumno-01-lucas": { peso_corporal_kg: 78, sexo: "M" },
  "demo-alumno-08-camila": { peso_corporal_kg: 62, sexo: "F" },
  "demo-alumno-05-mateo": { peso_corporal_kg: 84, sexo: "M" },
  "demo-alumno-ext-mie-4": { peso_corporal_kg: 58, sexo: "F" },
  "demo-alumno-ext-mie-5": { peso_corporal_kg: 65, sexo: "F" },
};

export const DEMO_RANKING_PRS_INICIALES: RankingPR[] = [
  {
    id: "demo-pr-01-lucas",
    clase_id: "demo-clase-func-miercoles",
    alumno_id: "demo-alumno-01-lucas",
    ejercicio_id: "ej-dominadas-c-carga",
    fecha: new Date().toISOString().substring(0, 10),
    peso_kg: 20,
    reps: 3,
    registrado_por: "00000000-0000-4000-a000-000000000001",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-pr-01-lucas-legacy",
    clase_id: "demo-clase-func-miercoles",
    alumno_id: "demo-alumno-01-lucas",
    ejercicio_id: "ej-demo-dominadas",
    fecha: new Date().toISOString().substring(0, 10),
    peso_kg: 20,
    reps: 3,
    registrado_por: "00000000-0000-4000-a000-000000000001",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-pr-05-emilia",
    clase_id: "demo-clase-func-miercoles",
    alumno_id: "demo-alumno-ext-mie-5",
    ejercicio_id: "ej-dominadas-c-carga",
    fecha: new Date().toISOString().substring(0, 10),
    peso_kg: 12.5,
    reps: 3,
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
      perfilesActualizados: DEMO_PERFILES_INICIALES,
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

      guardarFilaRegistro: async (datos) => {
        const reps = datos.reps ?? 1;
        const fecha = datos.fecha ?? new Date().toISOString().substring(0, 10);
        const nuevoId = `pr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        set({ guardandoPrId: datos.alumno_id, error: null });

        if (datos.peso_kg < 0 || isNaN(datos.peso_kg)) {
          set({ guardandoPrId: null, error: "La carga debe ser mayor o igual a 0 kg." });
          return { ok: false, error: "La carga debe ser mayor o igual a 0 kg." };
        }

        if (datos.peso_corporal_kg !== undefined) {
          if (datos.peso_corporal_kg <= 0 || datos.peso_corporal_kg > 500 || isNaN(datos.peso_corporal_kg)) {
            set({ guardandoPrId: null, error: "El peso corporal debe ser mayor a 0 y hasta 500 kg." });
            return { ok: false, error: "El peso corporal debe ser mayor a 0 y hasta 500 kg." };
          }
        }

        if (datos.sexo !== undefined && datos.sexo !== "M" && datos.sexo !== "F") {
          set({ guardandoPrId: null, error: "El sexo debe ser 'M' o 'F'." });
          return { ok: false, error: "El sexo debe ser 'M' o 'F'." };
        }

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

        const prsActuales = get().prs.filter(
          (p) =>
            !(
              p.clase_id === datos.clase_id &&
              p.alumno_id === datos.alumno_id &&
              p.ejercicio_id === datos.ejercicio_id
            ),
        );

        const prevPerfiles = get().perfilesActualizados;
        const perfilesActualizados = {
          ...prevPerfiles,
          [datos.alumno_id]: {
            ...prevPerfiles[datos.alumno_id],
            ...(datos.peso_corporal_kg !== undefined ? { peso_corporal_kg: datos.peso_corporal_kg } : {}),
            ...(datos.sexo !== undefined ? { sexo: datos.sexo } : {}),
          },
        };

        set({
          prs: [...prsActuales, nuevoPr],
          perfilesActualizados,
          guardandoPrId: null,
          aviso: "Registro guardado con éxito.",
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

        const prev = get().perfilesActualizados;
        const perfilesActualizados = {
          ...prev,
          [alumnoId]: { ...prev[alumnoId], peso_corporal_kg, sexo },
        };

        set({
          perfilesActualizados,
          aviso: "Datos de peso y sexo guardados en el perfil del alumno.",
        });
        return { ok: true };
      },

      calcularRanking: (params) => {
        const perfiles = get().perfilesActualizados;
        const mapaExistentes = new Set(params.alumnos.map((a) => a.id));
        const alumnosCombinados: Perfil[] = params.alumnos.map((a) => {
          const override = perfiles[a.id];
          if (override) {
            return {
              ...a,
              peso_corporal_kg: override.peso_corporal_kg ?? a.peso_corporal_kg,
              sexo: override.sexo ?? a.sexo,
            };
          }
          return a;
        });

        // Completar con stubs si hay alumnos en reservas o en perfilesActualizados no presentes en alumnos
        if (params.reservas) {
          for (const r of params.reservas) {
            if (!mapaExistentes.has(r.alumno_id)) {
              const override = perfiles[r.alumno_id];
              alumnosCombinados.push({
                id: r.alumno_id,
                nombre_completo: (r as any).alumno_nombre ?? "Alumno",
                email: `${r.alumno_id}@gozster.test`,
                rol: "ALUMNO",
                estado_membresia: "ACTIVA",
                peso_corporal_kg: override?.peso_corporal_kg ?? null,
                sexo: override?.sexo ?? null,
                profesor_asignado_id: "",
                fecha_baja: null,
                fecha_vencimiento_cuota: null,
                ultimo_entreno_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              mapaExistentes.add(r.alumno_id);
            }
          }
        }

        // Asegurar que alumnos con PR registrado tengan su perfil cargado desde perfilesActualizados
        for (const p of get().prs) {
          if (!mapaExistentes.has(p.alumno_id)) {
            const override = perfiles[p.alumno_id];
            let nombre = "Alumno Desconocido";
            if (p.alumno_id === "demo-alumno-01-lucas") nombre = "Lucas Giménez";
            else if (p.alumno_id === "demo-alumno-ext-mie-5") nombre = "Emilia Castro";
            else if (p.alumno_id === "demo-alumno-08-camila") nombre = "Camila Navarro";
            else if (p.alumno_id === "demo-alumno-05-mateo") nombre = "Mateo Rossi";
            else if (p.alumno_id === "demo-alumno-ext-mie-4") nombre = "Renata Quiroga";

            alumnosCombinados.push({
              id: p.alumno_id,
              nombre_completo: nombre,
              email: `${p.alumno_id}@gozster.test`,
              rol: "ALUMNO",
              estado_membresia: "ACTIVA",
              peso_corporal_kg: override?.peso_corporal_kg ?? null,
              sexo: override?.sexo ?? null,
              profesor_asignado_id: "",
              fecha_baja: null,
              fecha_vencimiento_cuota: null,
              ultimo_entreno_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            mapaExistentes.add(p.alumno_id);
          }
        }

        return calcularRankingRelativo({
          prs: get().prs,
          claseId: params.claseId,
          ejercicioId: params.ejercicioId,
          alumnos: alumnosCombinados,
          reservas: params.reservas,
        });
      },
    }),
    {
      name: "gozster-ranking-store",
      storage: createJSONStorage(() => userScopedStorage),
      partialize: (state) => ({
        claseIdSeleccionada: state.claseIdSeleccionada,
        ejercicioIdSeleccionado: state.ejercicioIdSeleccionado,
        prs: state.prs,
        perfilesActualizados: state.perfilesActualizados,
      }),
    },
  ),
);
