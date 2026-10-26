/**
 * Parser y estructurador de notas técnicas e indicaciones del entrenador.
 * Procesa comentarios libres o estructurados (ej. "Configuración:" / "Ejecución:")
 * para garantizar visualización ergonómica en pantallas móviles sin desbordes.
 */

export interface StructuredExerciseNotes {
  configuracion: string[];
  ejecucion: string[];
  indicaciones: string[];
  rawText: string;
  hasStructuredSections: boolean;
}

/**
 * Limpia viñetas, guiones y numeraciones redundantes al inicio de cada línea.
 */
function cleanBullet(text: string): string {
  return text.replace(/^(?:[-*•]\s+|\d+[\.\)]\s+)/, "").trim();
}

/**
 * Parsea el texto del comentario técnico del coach en secciones ordenadas.
 */
export function parseExerciseNotes(raw?: string | null): StructuredExerciseNotes {
  if (!raw || !raw.trim()) {
    return {
      configuracion: [],
      ejecucion: [],
      indicaciones: [],
      rawText: "",
      hasStructuredSections: false,
    };
  }

  const clean = raw.trim();
  const configuracion: string[] = [];
  const ejecucion: string[] = [];
  const indicaciones: string[] = [];

  const lines = clean.split("\n");
  let currentSection: "none" | "config" | "ejec" | "indic" = "none";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Encabezado de Configuración / Postura
    if (/^(?:[-*#]*\s*)?(?:1[\.\)]\s*)?Configuraci[oó]n\s*:/i.test(trimmed)) {
      currentSection = "config";
      const afterColon = trimmed
        .replace(/^(?:[-*#]*\s*)?(?:1[\.\)]\s*)?Configuraci[oó]n\s*:/i, "")
        .trim();
      if (afterColon) {
        configuracion.push(cleanBullet(afterColon));
      }
      continue;
    }

    // Encabezado de Ejecución (soporta "Ejecución:", "Ejecucion:", "Ejecucción:")
    if (/^(?:[-*#]*\s*)?(?:2[\.\)]\s*)?Ejecu(?:cci|ci)[oó]n\s*:/i.test(trimmed)) {
      currentSection = "ejec";
      const afterColon = trimmed
        .replace(/^(?:[-*#]*\s*)?(?:2[\.\)]\s*)?Ejecu(?:cci|ci)[oó]n\s*:/i, "")
        .trim();
      if (afterColon) {
        ejecucion.push(cleanBullet(afterColon));
      }
      continue;
    }

    // Encabezado de Notas / Indicaciones adicionales
    if (
      /^(?:[-*#]*\s*)?(?:3[\.\)]\s*)?(?:Indicaci[oó]n(?:es)?|Notas?|Tips?|Recomendaci[oó]n(?:es)?)\s*(?:del coach)?\s*:/i.test(
        trimmed
      )
    ) {
      currentSection = "indic";
      const afterColon = trimmed
        .replace(
          /^(?:[-*#]*\s*)?(?:3[\.\)]\s*)?(?:Indicaci[oó]n(?:es)?|Notas?|Tips?|Recomendaci[oó]n(?:es)?)\s*(?:del coach)?\s*:\s*/i,
          ""
        )
        .trim();
      if (afterColon) {
        indicaciones.push(cleanBullet(afterColon));
      }
      continue;
    }

    // Línea de contenido
    const item = cleanBullet(trimmed);
    if (!item) continue;

    if (currentSection === "config") {
      configuracion.push(item);
    } else if (currentSection === "ejec") {
      ejecucion.push(item);
    } else if (currentSection === "indic") {
      indicaciones.push(item);
    } else {
      indicaciones.push(item);
    }
  }

  const hasStructuredSections = configuracion.length > 0 || ejecucion.length > 0;

  return {
    configuracion,
    ejecucion,
    indicaciones,
    rawText: clean,
    hasStructuredSections,
  };
}
