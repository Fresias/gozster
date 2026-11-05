import type { PlanEntrenamiento } from "@/types/database.types";

export interface RutinasClasificadas {
  plantillas: PlanEntrenamiento[];
  deAlumnos: PlanEntrenamiento[];
  archivadas: PlanEntrenamiento[];
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

