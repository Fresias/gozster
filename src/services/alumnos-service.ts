import type { SupabaseClient } from "@supabase/supabase-js";
import { diasSinPR, estaEstancado } from "@/lib/estancamiento";
import type { SerieHistorica } from "@/lib/historial-ejercicio";
import { supabase } from "@/lib/supabase/client";
import type {
  AlumnoActividad,
  Cobro,
  Contratacion,
  Database,
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  EntrenadorStaff,
  Perfil,
  PlanCompartido,
  PlanEntrenamiento,
  PlanMembresia,
} from "@/types/database.types";

export interface LiveSupabaseDataset {
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejercicios: Ejercicio[];
  alumnoActividades?: AlumnoActividad[];
  contrataciones?: Contratacion[];
  planesMembresia?: PlanMembresia[];
  cobros?: Cobro[];
  /** Fuente única de "alumno al día": vista v_estado_alumno (contrataciones + cobros). */
  estadosAlumno?: EstadoAlumno[];
  /** Identidad del usuario autenticado (para distinguir plantillas propias vs compartidas). */
  currentUserId?: string | null;
  currentUserRol?: string | null;
  /** Tags de plantillas compartidas visibles por RLS (propias compartidas + compartidas conmigo). */
  planesCompartidos?: PlanCompartido[];
  /** Listado mínimo de staff (id, nombre_completo) desde RPC listar_entrenadores_staff. */
  entrenadoresStaff?: EntrenadorStaff[];
}

export type EstadoAlumno = Database["public"]["Views"]["v_estado_alumno"]["Row"];

const PERFILES_DATASET_COLUMNS =
  "id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, fecha_baja, created_at, updated_at, telefono, fecha_vencimiento_cuota, ultimo_entreno_at, estado_cuenta, nivel_vista_alumno, peso_corporal_kg, sexo, nombre_preferido";

const PLANES_DATASET_COLUMNS =
  "id, profesor_id, alumno_id, nombre, estado, comentarios, created_at, updated_at, fecha_inicio, fecha_fin, tipo, etiqueta, plan_origen_id, tags";

const DIAS_RUTINA_DATASET_COLUMNS = "id, plan_id, nombre, orden";

const EJERCICIOS_EN_RUTINA_DATASET_COLUMNS =
  "id, dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo, notas, es_superserie, grupo_superserie, tempo, force_rpe_required, tempo_activo, tipo_serie, tipo_medicion, tiempo_objetivo_segundos, es_unilateral";

const EJERCICIOS_DATASET_COLUMNS =
  "id, nombre, comentario, url_video, musculos_principales, musculos_secundarios";

const ALUMNO_ACTIVIDADES_DATASET_COLUMNS =
  "id, alumno_id, actividad, veces_por_semana, pase_libre";

const CONTRATACIONES_DATASET_COLUMNS =
  "id, alumno_id, tipo_servicio, estado, dia_vencimiento, fecha_inicio, fecha_fin, plan_membresia_id, actividad, precio_pactado";

const PLANES_MEMBRESIA_DATASET_COLUMNS =
  "id, nombre, limite_semanal, cantidad_actividades, duracion_meses, precio, activo, notas";

const ESTADO_ALUMNO_DATASET_COLUMNS =
  "alumno_id, estado, al_dia, fecha_vencimiento, cobros_vencidos";

const COBROS_DATASET_COLUMNS =
  "id, contratacion_id, alumno_id, monto, fecha_vencimiento, estado, concepto, notas";

const PLANES_COMPARTIDOS_DATASET_COLUMNS =
  "id, plan_id, profesor_id, compartido_por, created_at";

function emptyDataset(): LiveSupabaseDataset {
  return {
    alumnos: [],
    planes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejercicios: [],
    alumnoActividades: [],
    contrataciones: [],
    planesMembresia: [],
    cobros: [],
    currentUserId: null,
    currentUserRol: null,
    planesCompartidos: [],
    entrenadoresStaff: [],
  };
}

/**
 * Carga el dataset en vivo desde Supabase seleccionando solo columnas usadas
 * y filtrando por el coach/alumno autenticado y los IDs relacionados.
 * Acepta un cliente explícito: desde un Server Component se pasa el cliente de servidor
 * autenticado (`@/lib/supabase/server`) para que PostgREST reciba el JWT del entrenador y
 * aplique RLS (solo sus alumnos). En el navegador usa por defecto el cliente con sesión por cookies.
 */
export async function fetchLiveDatasetFromSupabase(
  client: SupabaseClient<Database> = supabase,
): Promise<LiveSupabaseDataset> {
  try {
    let currentUserId: string | null = null;
    let currentUserRol: string | null = null;

    if (typeof client.auth?.getUser === "function") {
      const authRes = await client.auth.getUser();
      currentUserId = authRes?.data?.user?.id ?? null;
      if (currentUserId) {
        const perfilPropioQuery = client.from("perfiles").select("id, rol");
        const perfilPropioEq =
          typeof (perfilPropioQuery as any).eq === "function"
            ? (perfilPropioQuery as any).eq("id", currentUserId)
            : null;
        const perfilPropioRes =
          perfilPropioEq && typeof perfilPropioEq.maybeSingle === "function"
            ? await perfilPropioEq.maybeSingle()
            : null;
        currentUserRol = (perfilPropioRes?.data as { rol?: string } | null)?.rol ?? null;
      }
    }

    const perfilesQuery = client.from("perfiles").select(PERFILES_DATASET_COLUMNS);
    let alumnosRes: { data: unknown; error: { message?: string } | null };

    if (currentUserRol === "ALUMNO" && currentUserId && typeof (perfilesQuery as any).eq === "function") {
      alumnosRes = await (perfilesQuery as any)
        .eq("id", currentUserId)
        .order("nombre_completo", { ascending: true });
    } else if (currentUserRol === "ENTRENADOR" && currentUserId) {
      if (typeof (perfilesQuery as any).eq === "function") {
        alumnosRes = await (perfilesQuery as any)
          .eq("profesor_asignado_id", currentUserId)
          .order("nombre_completo", { ascending: true });
      } else {
        alumnosRes = await (perfilesQuery as any).order("nombre_completo", { ascending: true });
      }
    } else if (typeof (perfilesQuery as any).or === "function") {
      alumnosRes = await (perfilesQuery as any)
        .or("rol.eq.ALUMNO,profesor_asignado_id.not.is.null")
        .order("nombre_completo", { ascending: true });
    } else {
      alumnosRes = await (perfilesQuery as any)
        .eq("rol", "ALUMNO")
        .order("nombre_completo", { ascending: true });
    }

    if (alumnosRes.error) {
      console.warn("Aviso cargando alumnos de Supabase (sin datos de respaldo):", alumnosRes.error.message);
      return emptyDataset();
    }

    const alumnos = (alumnosRes.data as Perfil[]) || [];
    const alumnoIds = alumnos
      .map((a) => a.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const planesQuery = client.from("planes_entrenamiento").select(PLANES_DATASET_COLUMNS);
    let planesPromise: Promise<{ data: unknown; error: unknown }>;
    if (currentUserRol === "ALUMNO" && currentUserId && typeof (planesQuery as any).eq === "function") {
      planesPromise = (planesQuery as any)
        .eq("alumno_id", currentUserId)
        .order("created_at", { ascending: false });
    } else if (typeof (planesQuery as any).or === "function") {
      const scopeParts = ["alumno_id.is.null"];
      if (currentUserId) scopeParts.push(`profesor_id.eq.${currentUserId}`);
      if (alumnoIds.length > 0) scopeParts.push(`alumno_id.in.(${alumnoIds.join(",")})`);
      planesPromise = (planesQuery as any)
        .or(scopeParts.join(","))
        .order("created_at", { ascending: false });
    } else {
      planesPromise = (planesQuery as any).order("created_at", { ascending: false });
    }

    const scopedByAlumnos = (
      table: "alumno_actividades" | "contrataciones" | "cobros" | "v_estado_alumno",
      columns: string,
      orderColumn: string,
      ascending: boolean,
    ): Promise<{ data: unknown; error: unknown }> => {
      if (alumnoIds.length === 0 && currentUserId) {
        return Promise.resolve({ data: [], error: null });
      }
      const query = (client as any).from(table).select(columns);
      if (alumnoIds.length > 0 && typeof (query as any).in === "function") {
        return (query as any).in("alumno_id", alumnoIds).order(orderColumn, { ascending });
      }
      return (query as any).order(orderColumn, { ascending });
    };

    const planesCompartidosPromise: Promise<{ data: unknown; error: unknown }> =
      currentUserRol === "ALUMNO"
        ? Promise.resolve({ data: [], error: null })
        : Promise.resolve()
            .then(() =>
              (client as any)
                .from("planes_compartidos")
                .select(PLANES_COMPARTIDOS_DATASET_COLUMNS)
                .order("created_at", { ascending: false }),
            )
            .catch(() => ({ data: [], error: null }));

    const staffPromise: Promise<{ data: unknown; error: unknown }> =
      currentUserRol === "ALUMNO" || typeof (client as any).rpc !== "function"
        ? Promise.resolve({ data: [], error: null })
        : Promise.resolve()
            .then(() => (client as any).rpc("listar_entrenadores_staff"))
            .catch(() => ({ data: [], error: null }));

    const [
      planesRes,
      ejerciciosRes,
      alumnoActividadesRes,
      contratacionesRes,
      planesMembresiaRes,
      cobrosRes,
      estadosAlumnoRes,
      planesCompartidosRes,
      staffRes,
    ] = await Promise.all([
      planesPromise,
      client.from("ejercicios").select(EJERCICIOS_DATASET_COLUMNS).order("nombre", { ascending: true }),
      scopedByAlumnos("alumno_actividades", ALUMNO_ACTIVIDADES_DATASET_COLUMNS, "created_at", true),
      scopedByAlumnos("contrataciones", CONTRATACIONES_DATASET_COLUMNS, "created_at", false),
      client.from("planes_membresia").select(PLANES_MEMBRESIA_DATASET_COLUMNS).order("precio", { ascending: true }),
      scopedByAlumnos("cobros", COBROS_DATASET_COLUMNS, "fecha_vencimiento", false),
      scopedByAlumnos("v_estado_alumno", ESTADO_ALUMNO_DATASET_COLUMNS, "alumno_id", true),
      planesCompartidosPromise,
      staffPromise,
    ]);

    const planes = (planesRes.data as PlanEntrenamiento[]) || [];
    const planIds = planes
      .map((p) => p.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    let diasRes: { data: unknown; error: unknown };
    if (planIds.length === 0 && currentUserId) {
      diasRes = { data: [], error: null };
    } else {
      const diasQuery = client.from("dias_rutina").select(DIAS_RUTINA_DATASET_COLUMNS);
      diasRes =
        planIds.length > 0 && typeof (diasQuery as any).in === "function"
          ? await (diasQuery as any).in("plan_id", planIds).order("orden", { ascending: true })
          : await (diasQuery as any).order("orden", { ascending: true });
    }

    const dias = (diasRes.data as DiaRutina[]) || [];
    const diaIds = dias
      .map((d) => d.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    let ejRutinaRes: { data: unknown; error: unknown };
    if (diaIds.length === 0 && currentUserId) {
      ejRutinaRes = { data: [], error: null };
    } else {
      const ejRutinaQuery = client
        .from("ejercicios_en_rutina")
        .select(EJERCICIOS_EN_RUTINA_DATASET_COLUMNS);
      ejRutinaRes =
        diaIds.length > 0 && typeof (ejRutinaQuery as any).in === "function"
          ? await (ejRutinaQuery as any).in("dia_id", diaIds).order("orden", { ascending: true })
          : await (ejRutinaQuery as any).order("orden", { ascending: true });
    }

    return {
      alumnos,
      planes,
      dias,
      ejerciciosEnRutina: (ejRutinaRes.data as EjercicioEnRutina[]) || [],
      ejercicios: (ejerciciosRes.data as Ejercicio[]) || [],
      alumnoActividades: !alumnoActividadesRes?.error
        ? ((alumnoActividadesRes?.data as AlumnoActividad[]) || [])
        : [],
      contrataciones: !contratacionesRes?.error
        ? ((contratacionesRes?.data as Contratacion[]) || [])
        : [],
      planesMembresia: !planesMembresiaRes?.error
        ? ((planesMembresiaRes?.data as PlanMembresia[]) || [])
        : [],
      cobros: !cobrosRes?.error ? ((cobrosRes?.data as Cobro[]) || []) : [],
      estadosAlumno:
        !estadosAlumnoRes?.error && Array.isArray(estadosAlumnoRes?.data)
          ? (estadosAlumnoRes.data as EstadoAlumno[])
          : undefined,
      currentUserId,
      currentUserRol,
      planesCompartidos:
        !planesCompartidosRes?.error && Array.isArray(planesCompartidosRes?.data)
          ? (planesCompartidosRes.data as PlanCompartido[])
          : [],
      entrenadoresStaff:
        !staffRes?.error && Array.isArray(staffRes?.data)
          ? (staffRes.data as EntrenadorStaff[])
          : [],
    };
  } catch (err: any) {
    console.warn("Excepción al conectar con Supabase (sin datos de respaldo):", err?.message || err);
    return emptyDataset();
  }
}

/**
 * Relee v_estado_alumno (GOZS-694) tras una mutación de contrataciones o cobros.
 * undefined si la lectura falla: quien llama conserva el estado previo.
 */
export async function fetchEstadosAlumno(
  client: SupabaseClient<Database> = supabase,
): Promise<EstadoAlumno[] | undefined> {
  try {
    const { data, error } = await client.from("v_estado_alumno").select(ESTADO_ALUMNO_DATASET_COLUMNS);
    return !error && Array.isArray(data) ? (data as EstadoAlumno[]) : undefined;
  } catch {
    return undefined;
  }
}

export interface AlumnoEstancado {
  alumnoId: string;
  diasSinPR: number;
}

/** Alumnos con 30+ días sin PR habiendo entrenado (GOZS-226). RLS limita a los alumnos del coach. */
export async function fetchAlumnosEstancados(client: SupabaseClient<Database> = supabase): Promise<AlumnoEstancado[]> {
  const porAlumno = new Map<string, SerieHistorica[]>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await client
      .from("registro_series")
      .select("ejercicio_id, sesion_id, numero_serie, peso_kg, reps_hechas, rpe_real, completada, set_type, registro_sesiones!inner(fecha, alumno_id)")
      .eq("completada", true)
      .order("id")
      .range(desde, desde + 999);
    if (error || !data) return [];
    for (const { registro_sesiones, ...s } of data as any[]) {
      const lista = porAlumno.get(registro_sesiones.alumno_id) ?? [];
      lista.push({ ...s, fecha: registro_sesiones.fecha });
      porAlumno.set(registro_sesiones.alumno_id, lista);
    }
    if (data.length < 1000) break;
  }
  return [...porAlumno]
    .filter(([, series]) => estaEstancado(series))
    .map(([alumnoId, series]) => ({ alumnoId, diasSinPR: diasSinPR(series) }))
    .sort((a, b) => b.diasSinPR - a.diasSinPR);
}

/**
 * Plan real del alumno autenticado (GOZS-285). Sin fallback a datos demo: RLS limita
 * todo a lo propio. Devuelve `null` si no hay sesión o falla la lectura (el llamador
 * conserva lo cacheado); un alumno sin plan devuelve el dataset con `planes: []`.
 */
export async function fetchPlanAlumno(client: SupabaseClient<Database> = supabase): Promise<LiveSupabaseDataset | null> {
  const { data: auth } = await client.auth.getUser();
  if (!auth?.user) return null;
  const perfilRes = await client.from("perfiles").select("*").eq("id", auth.user.id).maybeSingle();
  if (perfilRes.error || !perfilRes.data) return null;
  const alumno = perfilRes.data as Perfil;
  const vacio = { alumnos: [alumno], planes: [], dias: [], ejerciciosEnRutina: [], ejercicios: [] };

  const planesRes = await client
    .from("planes_entrenamiento")
    .select("*")
    .eq("alumno_id", alumno.id)
    .order("created_at", { ascending: false });
  if (planesRes.error) return null;
  const planes = (planesRes.data as PlanEntrenamiento[]) ?? [];
  const plan = planes.find((p) => p.estado === "ACTIVO") ?? planes[0];
  if (!plan) return vacio;

  const diasRes = await client.from("dias_rutina").select("*").eq("plan_id", plan.id).order("orden", { ascending: true });
  if (diasRes.error) return null;
  const dias = (diasRes.data as DiaRutina[]) ?? [];
  if (dias.length === 0) return { ...vacio, planes: [plan] };

  const ejRutinaRes = await client
    .from("ejercicios_en_rutina")
    .select("*")
    .in("dia_id", dias.map((d) => d.id))
    .order("orden", { ascending: true });
  if (ejRutinaRes.error) return null;
  const ejerciciosEnRutina = (ejRutinaRes.data as EjercicioEnRutina[]) ?? [];

  const ejerciciosRes = await client
    .from("ejercicios")
    .select("*")
    .in("id", [...new Set(ejerciciosEnRutina.map((e) => e.ejercicio_id))]);
  if (ejerciciosRes.error) return null;

  return {
    alumnos: [alumno],
    planes: [plan],
    dias,
    ejerciciosEnRutina,
    ejercicios: (ejerciciosRes.data as Ejercicio[]) ?? [],
  };
}

export interface SesionFechaResumen {
  id: string;
  dia_id: string | null;
  fecha: string;
}

/**
 * Consulta no bloqueante de las últimas sesiones del alumno en `registro_sesiones`
 * para hidratar la racha semanal multi-dispositivo desde Supabase.
 * Devuelve `null` si falla la lectura o no hay conexión (preservando caché local).
 */
export async function fetchSesionesRecientesAlumno(
  alumnoId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<SesionFechaResumen[] | null> {
  try {
    if (!alumnoId) return null;
    const { data, error } = await client
      .from("registro_sesiones")
      .select("id, dia_id, fecha")
      .eq("alumno_id", alumnoId)
      .order("fecha", { ascending: false })
      .limit(100);
    if (error || !Array.isArray(data)) return null;
    return data
      .filter(
        (r): r is { id: string; dia_id: string | null; fecha: string } =>
          Boolean(r && typeof r.id === "string" && typeof r.fecha === "string"),
      )
      .map((r) => ({ id: r.id, dia_id: r.dia_id ?? null, fecha: r.fecha }));
  } catch {
    return null;
  }
}
