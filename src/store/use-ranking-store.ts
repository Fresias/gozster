import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { userScopedStorage } from "@/lib/user-storage";
import { supabase } from "@/lib/supabase/client";
import { esUuid } from "@/lib/athlete/uuid";
import { prsDeClasesDesdeVista } from "@/lib/ranking-prs";
import type { RankingFuncionalFila } from "@/lib/mi-progreso";
import type { Perfil, PrView, RankingPR, Reserva } from "@/types/database.types";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

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

// Marca que no llegó al servidor (sin red o error): se reintenta al reconectar.
export interface MarcaPendiente {
  alumno_id: string;
  ejercicio_id: string;
  peso_kg: number;
  reps: number;
  fecha: string;
  clase_id?: string;
  peso_corporal_kg?: number;
  sexo?: "M" | "F";
}

const hayRed = () => typeof navigator === "undefined" || navigator.onLine !== false;

// Persiste una marca con registrar_marca_funcional (GOZS-824).
async function enviarMarca(m: MarcaPendiente): Promise<{ ok: boolean; error?: string }> {
  if (typeof supabase?.rpc !== "function") return { ok: false, error: "Cliente no disponible" };
  try {
    const { error } = await supabase.rpc("registrar_marca_funcional", {
      p_alumno_id: m.alumno_id,
      p_ejercicio_id: m.ejercicio_id,
      p_peso_kg: m.peso_kg,
      p_reps: m.reps,
      p_fecha: m.fecha,
      p_clase_id: m.clase_id && esUuid(m.clase_id) ? m.clase_id : undefined,
      p_peso_corporal_kg: m.peso_corporal_kg,
      p_sexo: m.sexo,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red" };
  }
}

export type EstadoSincronizacionRanking =
  | { tipo: "sin-conexion"; ultimaSincronizacionAt: string | null }
  | { tipo: "sincronizando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "al-dia"; ultimaSincronizacionAt: string | null };

export const RANKING_SYNC_ERROR_MSG = "No se pudo actualizar el ranking";
export const RANKING_ALUMNO_ERROR_MSG = "No se pudo cargar tu ranking de Funcional";

/**
 * Señal de frescura del ranking (GOZS-885). Pura: la reutilizan Coach Studio y
 * la vista de ranking del alumno. Prioridad: sin señal > error > sincronizando.
 */
export function resolverEstadoSincronizacionRanking(p: {
  isOnline: boolean;
  isFlushing: boolean;
  hasPendingSeries: boolean;
  syncingSessionId: string | null;
  syncError: string | null;
  ultimaSincronizacionAt: string | null;
}): EstadoSincronizacionRanking {
  if (!p.isOnline) return { tipo: "sin-conexion", ultimaSincronizacionAt: p.ultimaSincronizacionAt };
  if (p.syncError) return { tipo: "error", mensaje: p.syncError };
  if (p.isFlushing || p.hasPendingSeries || p.syncingSessionId) return { tipo: "sincronizando" };
  return { tipo: "al-dia", ultimaSincronizacionAt: p.ultimaSincronizacionAt };
}

export interface RankingState {
  claseIdSeleccionada: string | null;
  ejercicioIdSeleccionado: string | null;
  prs: RankingPR[];
  perfilesActualizados: Record<string, { peso_corporal_kg?: number; sexo?: "M" | "F" }>;
  pendientesMarcas: MarcaPendiente[];
  rankingAlumno: RankingFuncionalFila[];
  rankingAlumnoFecha: string | null;
  /** Efímero: la última descarga online del ranking del alumno falló. */
  rankingAlumnoError: string | null;
  cargandoRankingAlumno: boolean;
  cargando: boolean;
  guardandoPrId: string | null;
  error: string | null;
  aviso: string | null;
  /** Última carga online exitosa de `cargarPrsClase` (persistido). */
  ultimaSincronizacionAt: string | null;
  /** Efímero: la última carga online falló. */
  syncError: string | null;

  setClaseId: (id: string | null) => void;
  setEjercicioId: (id: string | null) => void;
  cargarPrsClase: (claseId: string, ejercicioId?: string) => Promise<void>;
  cargarRankingAlumno: () => Promise<void>;
  sincronizarMarcasPendientes: () => Promise<void>;
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
  resetDemoDataset: () => void;
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
    (set, get) => {
      // Envía la marca; sin red o con error la deja en cola y devuelve el aviso a mostrar.
      // Ids que no son UUID (datos locales) no se persisten en el servidor.
      const persistirMarca = async (m: MarcaPendiente): Promise<Partial<RankingState> | null> => {
        if (!esUuid(m.alumno_id) || !esUuid(m.ejercicio_id) || m.peso_kg <= 0) return null;
        const conRed = hayRed();
        const r = conRed ? await enviarMarca(m) : { ok: false, error: "Sin conexión" };
        if (r.ok) return null;
        set((state) => ({ pendientesMarcas: [...state.pendientesMarcas, m] }));
        return conRed
          ? { error: `No se pudo guardar en el servidor: ${r.error ?? "error"}. Se reintenta al reconectar.` }
          : { aviso: "Sin conexión: la marca se sincroniza al reconectar." };
      };
      return {
      claseIdSeleccionada: null,
      ejercicioIdSeleccionado: null,
      prs: [],
      perfilesActualizados: {},
      pendientesMarcas: [],
      rankingAlumno: [],
      rankingAlumnoFecha: null,
      rankingAlumnoError: null,
      cargandoRankingAlumno: false,
      cargando: false,
      guardandoPrId: null,
      error: null,
      aviso: null,
      ultimaSincronizacionAt: null,
      syncError: null,

      setClaseId: (id) => set({ claseIdSeleccionada: id }),
      setEjercicioId: (id) => set({ ejercicioIdSeleccionado: id }),

      resetDemoDataset: () =>
        set({
          claseIdSeleccionada: null,
          ejercicioIdSeleccionado: null,
          prs: DEMO_RANKING_PRS_INICIALES,
          perfilesActualizados: DEMO_PERFILES_INICIALES,
          cargando: false,
          guardandoPrId: null,
          error: null,
          aviso: null,
        }),

      limpiarAviso: () => set({ aviso: null, error: null, rankingAlumnoError: null }),

      cargarPrsClase: async (claseId) => {
        if (!claseId || !esUuid(claseId) || typeof supabase?.from !== "function") {
          return;
        }
        // Sin señal se conservan los datos previos y no se gasta red.
        if (!useOfflineQueueStore.getState().isOnline) return;
        try {
          const authRes = await supabase.auth.getUser();
          if (!authRes.data?.user) return;
          set({ cargando: true });
          const reservasRes = await supabase
            .from("reservas")
            .select("clase_id, alumno_id")
            .eq("clase_id", claseId)
            .in("estado", ["ANOTADO", "AUSENTE"]);
          const reservas = (reservasRes.data ?? []) as { clase_id: string; alumno_id: string }[];
          const { data, error } = reservasRes.error
            ? { data: null, error: reservasRes.error }
            : await supabase
                .from("v_prs")
                .select("*")
                .in("alumno_id", reservas.map((r) => r.alumno_id));
          if (!error && Array.isArray(data)) {
            const reales = prsDeClasesDesdeVista(data as PrView[], reservas);
            set((state) => ({
              prs: [
                ...state.prs.filter(
                  (p) => p.clase_id !== claseId && !p.id.startsWith("demo-"),
                ),
                ...reales,
              ],
              cargando: false,
              ultimaSincronizacionAt: new Date().toISOString(),
              syncError: null,
            }));
          } else {
            set({ cargando: false, syncError: `${RANKING_SYNC_ERROR_MSG}: ${error?.message ?? "respuesta inválida del servidor"}.` });
          }
        } catch (e) {
          set({
            cargando: false,
            syncError: `${RANKING_SYNC_ERROR_MSG}: ${e instanceof Error ? e.message : "error de red"}.`,
          });
        }
      },

      cargarRankingAlumno: async () => {
        if (typeof supabase?.rpc !== "function" || !hayRed()) return;
        set({ cargandoRankingAlumno: true, rankingAlumnoError: null });
        try {
          const { data, error } = await supabase.rpc("obtener_ranking_funcional_alumno", {});
          if (!error && Array.isArray(data)) {
            set({
              rankingAlumno: (data as RankingFuncionalFila[]).map((f) => ({
                ...f,
                peso_kg: Number(f.peso_kg),
                ratio: f.ratio === null ? null : Number(f.ratio),
                posicion: f.posicion === null ? null : Number(f.posicion),
              })),
              rankingAlumnoFecha: new Date().toISOString(),
              rankingAlumnoError: null,
              cargandoRankingAlumno: false,
            });
          } else {
            set({
              cargandoRankingAlumno: false,
              rankingAlumnoError: `${RANKING_ALUMNO_ERROR_MSG}: ${error?.message ?? "respuesta inválida del servidor"}.`,
            });
          }
        } catch (e) {
          set({
            cargandoRankingAlumno: false,
            rankingAlumnoError: `${RANKING_ALUMNO_ERROR_MSG}: ${e instanceof Error ? e.message : "error de red"}.`,
          });
        }
      },

      sincronizarMarcasPendientes: async () => {
        const cola = get().pendientesMarcas;
        if (cola.length === 0 || !hayRed()) return;
        const fallidas: MarcaPendiente[] = [];
        for (const m of cola) {
          if (!(await enviarMarca(m)).ok) fallidas.push(m);
        }
        // Se conserva lo que se agregó mientras se sincronizaba.
        set((state) => ({
          pendientesMarcas: [...fallidas, ...state.pendientesMarcas.filter((p) => !cola.includes(p))],
          aviso: fallidas.length < cola.length ? "Marcas sincronizadas." : state.aviso,
        }));
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
        const resultado = await persistirMarca({
          alumno_id: datos.alumno_id,
          ejercicio_id: datos.ejercicio_id,
          peso_kg: datos.peso_kg,
          reps,
          fecha,
          clase_id: datos.clase_id,
        });
        if (resultado) set(resultado);
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

        const resultado = await persistirMarca({
          alumno_id: datos.alumno_id,
          ejercicio_id: datos.ejercicio_id,
          peso_kg: datos.peso_kg,
          reps,
          fecha,
          clase_id: datos.clase_id,
          peso_corporal_kg: datos.peso_corporal_kg,
          sexo: datos.sexo,
        });
        if (resultado) set(resultado);

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
            alumnosCombinados.push({
              id: p.alumno_id,
              nombre_completo: "Alumno",
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
      };
    },
    {
      name: "gozster-ranking-store",
      version: 2,
      storage: createJSONStorage(() => userScopedStorage),
      migrate: (persistedState: unknown, version: number) => {
        const state = (persistedState as Partial<RankingState>) ?? {};
        if (!version || version < 2) {
          const perfilesLimpios: Record<string, { peso_corporal_kg?: number; sexo?: "M" | "F" }> = {};
          for (const [k, v] of Object.entries(state.perfilesActualizados ?? {})) {
            if (!k.startsWith("demo-")) perfilesLimpios[k] = v;
          }
          return {
            ...state,
            prs: (state.prs ?? []).filter((p) => !p.id.startsWith("demo-")),
            perfilesActualizados: perfilesLimpios,
          };
        }
        return state;
      },
      partialize: (state) => ({
        claseIdSeleccionada: state.claseIdSeleccionada,
        ejercicioIdSeleccionado: state.ejercicioIdSeleccionado,
        prs: state.prs,
        perfilesActualizados: state.perfilesActualizados,
        pendientesMarcas: state.pendientesMarcas,
        rankingAlumno: state.rankingAlumno,
        rankingAlumnoFecha: state.rankingAlumnoFecha,
        ultimaSincronizacionAt: state.ultimaSincronizacionAt,
      }),
    },
  ),
);
