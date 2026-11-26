import type { Ejercicio, EntrenadorStaff, PlanCompartido, PlanEntrenamiento } from "@/types/database.types";

export interface RutinasClasificadas {
  plantillas: PlanEntrenamiento[];
  deAlumnos: PlanEntrenamiento[];
  archivadas: PlanEntrenamiento[];
}

export interface PlantillasPorOrigen {
  misPlantillas: PlanEntrenamiento[];
  compartidasConmigo: PlanEntrenamiento[];
}

/**
 * Separa las plantillas en exactamente 2 vistas:
 * - "Mis plantillas": plantillas propias del entrenador (privadas por defecto).
 * - "Compartidas conmigo": plantillas ajenas donde el entrenador está tageado en `planes_compartidos`.
 * Sin vista pública global.
 */
export function separarPlantillasPorOrigen(
  plantillas: PlanEntrenamiento[],
  planesCompartidos: readonly PlanCompartido[] = [],
  currentUserId?: string | null,
  currentUserRol?: string | null,
): PlantillasPorOrigen {
  if (!currentUserId) {
    const idsCompartidas = new Set(planesCompartidos.map((pc) => pc.plan_id));
    return {
      misPlantillas: plantillas.filter((p) => !idsCompartidas.has(p.id)),
      compartidasConmigo: plantillas.filter((p) => idsCompartidas.has(p.id)),
    };
  }

  const compartidasConmigoIds = new Set(
    planesCompartidos
      .filter((pc) => pc.profesor_id === currentUserId)
      .map((pc) => pc.plan_id),
  );

  const misPlantillas: PlanEntrenamiento[] = [];
  const compartidasConmigo: PlanEntrenamiento[] = [];

  for (const plan of plantillas) {
    if (
      plan.profesor_id === currentUserId ||
      (plan.profesor_id === null && currentUserRol === "ADMIN")
    ) {
      misPlantillas.push(plan);
    } else if (compartidasConmigoIds.has(plan.id)) {
      compartidasConmigo.push(plan);
    }
  }

  return { misPlantillas, compartidasConmigo };
}

/** Devuelve los IDs de entrenadores con los que se compartió una plantilla propia. */
export function entrenadoresCompartidosDePlan(
  planId: string,
  planesCompartidos: readonly PlanCompartido[] = [],
): string[] {
  return planesCompartidos
    .filter((pc) => pc.plan_id === planId)
    .map((pc) => pc.profesor_id);
}

/** Lista entrenadores elegibles para compartir una plantilla (excluye al autor y al usuario actual). */
export function entrenadoresElegiblesParaCompartir(
  staff: readonly EntrenadorStaff[] = [],
  autorId?: string | null,
  currentUserId?: string | null,
): EntrenadorStaff[] {
  return staff
    .filter((e) => e.id !== autorId && e.id !== currentUserId)
    .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo, "es"));
}

/** Resuelve el nombre del autor de una plantilla usando el listado mínimo de staff. */
export function nombreAutorPlantilla(
  plan: Pick<PlanEntrenamiento, "profesor_id">,
  staff: readonly EntrenadorStaff[] = [],
): string {
  if (!plan.profesor_id) return "Otro entrenador";
  return staff.find((s) => s.id === plan.profesor_id)?.nombre_completo ?? "Otro entrenador";
}

/** Determina si una plantilla es compartida por otro entrenador y debe abrirse en modo solo lectura. */
export function esPlantillaCompartidaSoloLectura(
  plan: Pick<PlanEntrenamiento, "id" | "alumno_id" | "profesor_id">,
  planesCompartidos: readonly PlanCompartido[] = [],
  currentUserId?: string | null,
): boolean {
  if (plan.alumno_id !== null) return false;
  if (!currentUserId) {
    return planesCompartidos.some((pc) => pc.plan_id === plan.id);
  }
  if (plan.profesor_id === currentUserId) return false;
  return planesCompartidos.some(
    (pc) => pc.plan_id === plan.id && pc.profesor_id === currentUserId,
  );
}

/** Sin `tipo` (datasets de respaldo) se deduce por la presencia de alumno. */
export function tipoDePlan(plan: PlanEntrenamiento): "PLANTILLA" | "DE_ALUMNO" {
  return plan.tipo ?? (plan.alumno_id ? "DE_ALUMNO" : "PLANTILLA");
}

/** Reparte los planes en las tres pestañas de la biblioteca. Un plan INACTIVO solo va a Archivadas. */
export function clasificarRutinas(planes: PlanEntrenamiento[]): RutinasClasificadas {
  const out: RutinasClasificadas = { plantillas: [], deAlumnos: [], archivadas: [] };
  for (const plan of planes) {
    if (plan.estado === "INACTIVO") out.archivadas.push(plan);
    else if (tipoDePlan(plan) === "PLANTILLA") out.plantillas.push(plan);
    else out.deAlumnos.push(plan);
  }
  return out;
}

/**
 * Si no existen plantillas maestras pero sí rutinas asignadas a alumnos,
 * la biblioteca abre por defecto en la pestaña 'alumnos' ('De alumnos') para evitar
 * mostrar una pantalla vacía confusa. En cualquier otro caso abre en 'plantillas'.
 */
export function determinarPestanaPorDefecto(planes: PlanEntrenamiento[]): "alumnos" | "plantillas" {
  const { plantillas, deAlumnos } = clasificarRutinas(planes);
  return plantillas.length === 0 && deAlumnos.length > 0 ? "alumnos" : "plantillas";
}

/** "De alumnos" muestra lo vigente; los BORRADOR van aparte para que no se confundan con la ACTIVA. */
export function separarBorradores(deAlumnos: PlanEntrenamiento[]) {
  return {
    vigentes: deAlumnos.filter((p) => p.estado !== "BORRADOR"),
    borradores: deAlumnos.filter((p) => p.estado === "BORRADOR"),
  };
}

/** "X" → "X (copia)" → "X (copia 2)"…: nunca devuelve un nombre que ya exista (sin distinguir mayúsculas). */
export function nombreUnico(nombre: string, existentes: readonly string[]): string {
  const usados = new Set(existentes.map((n) => n.trim().toLowerCase()));
  const limpio = nombre.trim();
  if (!usados.has(limpio.toLowerCase())) return limpio;
  const base = limpio.replace(/ \(copia(?: \d+)?\)$/i, "");
  let candidato = `${base} (copia)`;
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${base} (copia ${n})`;
  return candidato;
}

const FECHA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" });
export const formatFecha = (iso: string | null) => (iso ? FECHA.format(new Date(iso)) : "—");

export const TAGS_CATALOGO_RUTINAS = [
  "Fuerza",
  "Hipertrofia",
  "Rehabilitación",
  "Potencia",
  "Peso Corporal",
] as const;

export type TagCatalogoRutina = (typeof TAGS_CATALOGO_RUTINAS)[number];

export const TAGS_FILTRO_BIBLIOTECA = [
  "Todos",
  ...TAGS_CATALOGO_RUTINAS,
] as const;

export type TagFiltroBiblioteca = (typeof TAGS_FILTRO_BIBLIOTECA)[number];

/** Convierte un tag a slug ASCII limpio para testids y atributos (ej. 'Rehabilitación' -> 'rehabilitacion'). */
export function tagToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

export interface TagStyleDefinition {
  className: string;
  dotColor: string;
}

export function getTagBadgeStyles(tag: string): TagStyleDefinition {
  switch (tag) {
    case "Fuerza":
      return {
        className:
          "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold",
        dotColor: "bg-amber-400",
      };
    case "Hipertrofia":
      return {
        className:
          "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold",
        dotColor: "bg-emerald-400",
      };
    case "Rehabilitación":
      return {
        className:
          "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300 font-bold",
        dotColor: "bg-sky-400",
      };
    case "Potencia":
      return {
        className:
          "border-purple-500/40 bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold",
        dotColor: "bg-purple-400",
      };
    case "Peso Corporal":
      return {
        className:
          "border-slate-500/40 bg-slate-500/15 text-slate-700 dark:text-slate-300 font-bold",
        dotColor: "bg-slate-400",
      };
    default:
      return {
        className:
          "border-border/70 bg-secondary/80 text-foreground font-semibold",
        dotColor: "bg-primary",
      };
  }
}

export function getTagChipFilterStyles(tag: string, isSelected: boolean): string {
  if (!isSelected) {
    return "bg-background/80 text-muted-foreground border-border/80 hover:bg-secondary/60 hover:text-foreground";
  }
  switch (tag) {
    case "Todos":
      return "bg-primary text-primary-foreground border-primary font-bold shadow-xs";
    case "Fuerza":
      return "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500 font-bold shadow-xs";
    case "Hipertrofia":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500 font-bold shadow-xs";
    case "Rehabilitación":
      return "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500 font-bold shadow-xs";
    case "Potencia":
      return "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500 font-bold shadow-xs";
    case "Peso Corporal":
      return "bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500 font-bold shadow-xs";
    default:
      return "bg-primary text-primary-foreground border-primary font-bold shadow-xs";
  }
}

/**
 * Filtra una lista de planes por tag semántico.
 * Si tag es "Todos", null o undefined, devuelve todos los planes.
 */
export function filtrarRutinasPorTag(
  planes: PlanEntrenamiento[],
  tag: string | null | undefined,
): PlanEntrenamiento[] {
  if (!tag || tag === "Todos") return planes;
  return planes.filter((p) => Array.isArray(p.tags) && p.tags.includes(tag));
}

/**
 * Filtra planes de entrenamiento combinando coincidencia por texto (nombre, comentarios o tags).
 */
export function filtrarRutinasPorBusqueda(
  planes: PlanEntrenamiento[],
  busqueda: string,
): PlanEntrenamiento[] {
  const query = busqueda.trim().toLowerCase();
  if (!query) return planes;
  return planes.filter((p) => {
    const nombreMatch = p.nombre.toLowerCase().includes(query);
    const comentariosMatch = p.comentarios ? p.comentarios.toLowerCase().includes(query) : false;
    const tagMatch = Array.isArray(p.tags) && p.tags.some((t) => t.toLowerCase().includes(query));
    return nombreMatch || comentariosMatch || tagMatch;
  });
}

/**
 * Filtro combinado reactivo por tag y texto.
 */
export function filtrarRutinas(
  planes: PlanEntrenamiento[],
  tag: string | null | undefined,
  busqueda: string = "",
): PlanEntrenamiento[] {
  const porTag = filtrarRutinasPorTag(planes, tag);
  return filtrarRutinasPorBusqueda(porTag, busqueda);
}

/**
 * Copia fielmente los tags de una plantilla origen hacia una rutina clonada o asignada.
 */
export function heredarTagsDePlantilla(
  plantilla: Partial<PlanEntrenamiento> | null | undefined,
  rutinaDestino?: Partial<PlanEntrenamiento> | null,
): string[] {
  if (!plantilla?.tags || !Array.isArray(plantilla.tags)) {
    return rutinaDestino?.tags && Array.isArray(rutinaDestino.tags) ? [...rutinaDestino.tags] : [];
  }
  return [...plantilla.tags];
}

/**
 * Normaliza una cadena para búsquedas insensibles a mayúsculas y diacríticos.
 */
export function normalizarTexto(texto?: string | null): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Grupos musculares oficiales / sugeridos para la barra de chips de la biblioteca de ejercicios.
 */
export const GRUPOS_MUSCULARES_CATALOGO = [
  "Todos",
  "Pecho",
  "Espalda",
  "Piernas",
  "Hombros",
  "Brazos",
  "Core",
] as const;

export type GrupoMuscularCatalogo = (typeof GRUPOS_MUSCULARES_CATALOGO)[number];

/**
 * Filtra la lista de ejercicios del catálogo maestro por grupo muscular.
 * Si musculo es "Todos", null o undefined, devuelve todos los ejercicios.
 */
export function filtrarEjerciciosPorMusculo(
  ejercicios: Ejercicio[],
  musculo?: string | null,
): Ejercicio[] {
  if (!musculo || musculo === "Todos") return ejercicios;
  const mTarget = normalizarTexto(musculo);
  return ejercicios.filter((ej) => {
    const principales = (ej.musculos_principales || []).map(normalizarTexto);
    const secundarios = (ej.musculos_secundarios || []).map(normalizarTexto);
    return (
      principales.some((m) => m.includes(mTarget) || mTarget.includes(m)) ||
      secundarios.some((m) => m.includes(mTarget) || mTarget.includes(m))
    );
  });
}

/**
 * Filtra ejercicios por término de búsqueda en nombre, músculos y comentarios.
 */
export function filtrarEjerciciosPorBusqueda(
  ejercicios: Ejercicio[],
  busqueda: string,
): Ejercicio[] {
  const query = normalizarTexto(busqueda);
  if (!query) return ejercicios;
  return ejercicios.filter((ej) => {
    const nombre = normalizarTexto(ej.nombre);
    const comentario = normalizarTexto(ej.comentario);
    const principales = (ej.musculos_principales || []).some((m) =>
      normalizarTexto(m).includes(query),
    );
    const secundarios = (ej.musculos_secundarios || []).some((m) =>
      normalizarTexto(m).includes(query),
    );
    return nombre.includes(query) || comentario.includes(query) || principales || secundarios;
  });
}

/**
 * Filtro reactivo combinado para la biblioteca de ejercicios (músculo, búsqueda y, opcionalmente,
 * solo ejercicios con barra libre — GOZS-873).
 */
export function filtrarEjercicios(
  ejercicios: Ejercicio[],
  musculo?: string | null,
  busqueda: string = "",
  soloBarra: boolean = false,
): Ejercicio[] {
  const base = soloBarra ? ejercicios.filter((ej) => ej.usa_barra === true) : ejercicios;
  const porMusculo = filtrarEjerciciosPorMusculo(base, musculo);
  return filtrarEjerciciosPorBusqueda(porMusculo, busqueda);
}

/**
 * Extrae todos los grupos o etiquetas musculares únicos encontrados en el catálogo.
 */
export function obtenerGruposMuscularesUnicos(ejercicios: Ejercicio[]): string[] {
  const set = new Set<string>();
  for (const ej of ejercicios) {
    for (const m of ej.musculos_principales || []) {
      const limpio = m.trim();
      if (limpio) set.add(limpio);
    }
  }
  return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
}


