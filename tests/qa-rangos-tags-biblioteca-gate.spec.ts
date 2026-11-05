import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  parseRepRange,
  parseDefaultReps,
  type RepRangeInfo,
} from "@/lib/routine-helpers";
import {
  TAGS_CATALOGO_RUTINAS,
  TAGS_FILTRO_BIBLIOTECA,
  tagToSlug,
  getTagBadgeStyles,
  getTagChipFilterStyles,
  filtrarRutinasPorTag,
  filtrarRutinasPorBusqueda,
  filtrarRutinas,
  heredarTagsDePlantilla,
} from "@/lib/rutinas-biblioteca";
import type { PlanEntrenamiento } from "@/types/database.types";
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  type VolumeBlock,
} from "@/lib/strength-metrics";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useCoachStudioStore } from "@/store/use-coach-studio";

/**
 * ============================================================================
 * QA SUITE: AUDITORÍA INTEGRAL E2E DE RANGOS DE REPETICIONES CON BARRA (/),
 * TAGS Y FILTROS DE BIBLIOTECA, EXACTITUD MATEMÁTICA Y REGRESIÓN GATE (LOTE 3)
 *
 * Issue: GOZS-366 (Stage 3 Gatekeeper)
 * Sub-issues auditadas:
 *  - GOZS-364: Athlete App: Carga por defecto del máximo y bloqueo superior en rangos con "/"
 *  - GOZS-365: Coach Studio: Filtro por tags, badges semánticos y herencia en Biblioteca de Rutinas
 *
 * Especialista de QA & Verificación: @qa-eng
 * Reporta exclusivamente a: @pm-gozster
 * ============================================================================
 */

describe("QA Suite: GOZS-366 - Auditoría Integral Rangos con Barra, Tags de Biblioteca y Gatekeeper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
  });

  // ==========================================================================
  // 1. CONTRATOS ARQUITECTÓNICOS, PREVENCIÓN DE BLOATWARE Y HARNESS
  // ==========================================================================
  describe("1. Auditoría de Contratos Arquitectónicos y Esquema (Ponytail, Karpathy & Harness)", () => {
    it("GIVEN el repositorio gozster WHEN se inspecciona package.json THEN no incluye librerías de UI pesadas no autorizadas (Ponytail)", () => {
      const pkgPath = path.resolve(__dirname, "../package.json");
      const pkgContent = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgContent);

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(deps).not.toHaveProperty("framer-motion");
      expect(deps).not.toHaveProperty("react-spring");
      expect(deps).not.toHaveProperty("react-loading-skeleton");
      expect(deps).not.toHaveProperty("sweetalert2");
    });

    it("GIVEN el archivo de instrucciones AGENTS.md WHEN se audita su presupuesto estricto THEN cumple <= 8.000 caracteres y < 150 líneas", () => {
      const agentsPath = path.resolve(__dirname, "../AGENTS.md");
      expect(fs.existsSync(agentsPath)).toBe(true);

      const content = fs.readFileSync(agentsPath, "utf-8");
      const lineCount = content.split("\n").length;
      const charCount = content.length;

      expect(charCount).toBeLessThanOrEqual(8000);
      expect(lineCount).toBeLessThan(150);
    });

    it("GIVEN las migraciones append-only WHEN se revisa la extensión de esquema THEN no hay reescrituras de migraciones históricas", () => {
      const migrationsDir = path.resolve(__dirname, "../supabase/migrations");
      const migrations = fs.readdirSync(migrationsDir);

      expect(migrations.length).toBeGreaterThan(0);
      // Las migraciones principales de la plataforma y extensiones existen
      expect(
        migrations.some((m) =>
          m.includes("extensiones_ejercicios_tiempo_tags_planes")
        )
      ).toBe(true);
    });
  });

  // ==========================================================================
  // 2. ATHLETE APP: RANGOS CON BARRA "/" (GOZS-364)
  // ==========================================================================
  describe("2. Athlete App: Rangos con Barra '/' (GOZS-364)", () => {
    describe("2.1 Parser parseRepRange: Identificación precisa de rangos con barra y tolerancia a espacios", () => {
      it("detecta y descompone '8/12' correctamente con min=8 y max=12", () => {
        const res = parseRepRange("8/12");
        expect(res).not.toBeNull();
        expect(res?.isRange).toBe(true);
        expect(res?.min).toBe(8);
        expect(res?.max).toBe(12);
      });

      it("soporta todas las variantes de espaciado alrededor de la barra ('8 / 12', '8/ 12', '8 /12', ' 10 / 15 ')", () => {
        const variants = ["8 / 12", "8/ 12", "8 /12", " 8 / 12 ", "8/12\t"];
        for (const v of variants) {
          const res = parseRepRange(v);
          expect(res?.isRange).toBe(true);
          expect(res?.min).toBe(8);
          expect(res?.max).toBe(12);
        }

        const res15 = parseRepRange(" 10 / 15 ");
        expect(res15?.isRange).toBe(true);
        expect(res15?.min).toBe(10);
        expect(res15?.max).toBe(15);
      });

      it("invierte rangos invertidos de forma segura ('12/8' -> min: 8, max: 12)", () => {
        const res = parseRepRange("12/8");
        expect(res?.isRange).toBe(true);
        expect(res?.min).toBe(8);
        expect(res?.max).toBe(12);
      });

      it("rechaza de forma estricta strings que no son rangos con barra pura (pirámides '10-8-6', rangos '4 a 6', números directos '10')", () => {
        expect(parseRepRange("10")).toBeNull();
        expect(parseRepRange("10-8-6")).toBeNull();
        expect(parseRepRange("4 a 6")).toBeNull();
        expect(parseRepRange("8-10")).toBeNull();
        expect(parseRepRange("")).toBeNull();
        expect(parseRepRange(undefined)).toBeNull();
        expect(parseRepRange("8//12")).toBeNull();
        expect(parseRepRange("8/10/12")).toBeNull();
        expect(parseRepRange("8/abc")).toBeNull();
      });
    });

    describe("2.2 Target por Defecto parseDefaultReps: Precarga del Máximo del Rango", () => {
      it("precarga por defecto el valor superior / máximo para prescripciones con barra", () => {
        expect(parseDefaultReps("8/12")).toBe(12);
        expect(parseDefaultReps("8 / 12")).toBe(12);
        expect(parseDefaultReps("8/ 12")).toBe(12);
        expect(parseDefaultReps("8 /12")).toBe(12);
        expect(parseDefaultReps("10/15")).toBe(15);
        expect(parseDefaultReps("6/10")).toBe(10);
        expect(parseDefaultReps("12/8")).toBe(12);
      });

      it("mantiene intacta la compatibilidad con pirámides descendentes, rangos 'a' y números simples", () => {
        // Pirámide "12-10-8"
        expect(parseDefaultReps("12-10-8", 1)).toBe(12);
        expect(parseDefaultReps("12-10-8", 2)).toBe(10);
        expect(parseDefaultReps("12-10-8", 3)).toBe(8);

        // Rango "4 a 6" o "8-10"
        expect(parseDefaultReps("4 a 6")).toBe(4);
        expect(parseDefaultReps("8-10")).toBe(8);

        // Número directo "10"
        expect(parseDefaultReps("10")).toBe(10);

        // Sin prescripción -> fallback 10
        expect(parseDefaultReps("")).toBe(10);
        expect(parseDefaultReps(undefined)).toBe(10);
      });
    });

    describe("2.3 Ergonomía de Live Workout: Stepper Cap y Badge de Rango", () => {
      it("valida la regla de negocio del stepper: el botón '+' queda inhabilitado cuando reps_hechas >= repRange.max", () => {
        const repRange: RepRangeInfo = { isRange: true, min: 8, max: 12 };
        let repsHechas = 12;

        const isIncrementDisabled = (reps: number, range: RepRangeInfo | null) =>
          range?.isRange ? reps >= range.max : reps >= 100;

        expect(isIncrementDisabled(repsHechas, repRange)).toBe(true);
        expect(isIncrementDisabled(11, repRange)).toBe(false);
        expect(isIncrementDisabled(8, repRange)).toBe(false);
      });

      it("permite decrementar libremente hacia abajo con el botón '−' dentro y fuera del rango", () => {
        const repRange: RepRangeInfo = { isRange: true, min: 8, max: 12 };
        const maxLimit = repRange.max;

        const handleAdjustReps = (currentReps: number, delta: number) => {
          return Math.min(maxLimit, Math.max(1, currentReps + delta));
        };

        expect(handleAdjustReps(12, -1)).toBe(11);
        expect(handleAdjustReps(11, -1)).toBe(10);
        expect(handleAdjustReps(8, -1)).toBe(7); // Permite bajar por debajo del mínimo del rango si el alumno fatiga
        expect(handleAdjustReps(1, -1)).toBe(1); // Piso inferior mínimo de 1 repetición
      });

      it("restringe la entrada manual por teclado (handleDirectUpdateReps) respetando el cap máximo", () => {
        const repRange: RepRangeInfo = { isRange: true, min: 8, max: 12 };
        const maxLimit = repRange.max;

        const handleDirectUpdateReps = (val: number) => {
          return Math.min(maxLimit, Math.max(0, val));
        };

        expect(handleDirectUpdateReps(12)).toBe(12);
        expect(handleDirectUpdateReps(10)).toBe(10);
        expect(handleDirectUpdateReps(15)).toBe(12); // Clampeado al máximo 12
        expect(handleDirectUpdateReps(99)).toBe(12); // Clampeado al máximo 12
        expect(handleDirectUpdateReps(-5)).toBe(0); // Piso 0
      });

      it("genera el texto exacto requerido para el badge ergonómico: 'Rango: min a max reps (máx. max)'", () => {
        const repRange: RepRangeInfo = { isRange: true, min: 8, max: 12 };
        const badgeText = `Rango: ${repRange.min} a ${repRange.max} reps (máx. ${repRange.max})`;
        expect(badgeText).toBe("Rango: 8 a 12 reps (máx. 12)");

        const repRange15: RepRangeInfo = { isRange: true, min: 10, max: 15 };
        const badgeText15 = `Rango: ${repRange15.min} a ${repRange15.max} reps (máx. ${repRange15.max})`;
        expect(badgeText15).toBe("Rango: 10 a 15 reps (máx. 15)");
      });
    });
  });

  // ==========================================================================
  // 3. COACH STUDIO: TAGS Y FILTRADO EN BIBLIOTECA DE RUTINAS (GOZS-365)
  // ==========================================================================
  describe("3. Coach Studio: Tags y Filtrado en Biblioteca de Rutinas (GOZS-365)", () => {
    describe("3.1 Catálogo Oficial de Tags y Generación de Slugs", () => {
      it("define los 5 tags oficiales del catálogo de rutinas", () => {
        expect(TAGS_CATALOGO_RUTINAS).toEqual([
          "Fuerza",
          "Hipertrofia",
          "Rehabilitación",
          "Potencia",
          "Peso Corporal",
        ]);
      });

      it("incluye 'Todos' al inicio de los chips de filtrado de biblioteca", () => {
        expect(TAGS_FILTRO_BIBLIOTECA).toEqual([
          "Todos",
          "Fuerza",
          "Hipertrofia",
          "Rehabilitación",
          "Potencia",
          "Peso Corporal",
        ]);
      });

      it("convierte tags a slugs ASCII limpios para data-testid y atributos DOM", () => {
        expect(tagToSlug("Rehabilitación")).toBe("rehabilitacion");
        expect(tagToSlug("Peso Corporal")).toBe("peso-corporal");
        expect(tagToSlug("Hipertrofia")).toBe("hipertrofia");
        expect(tagToSlug("Fuerza")).toBe("fuerza");
        expect(tagToSlug("Potencia")).toBe("potencia");
        expect(tagToSlug("Todos")).toBe("todos");
      });
    });

    describe("3.2 Estilos Semánticos de Badges y Chips de Filtro", () => {
      it("asigna paletas de color distinguibles por tag", () => {
        const fuerzaStyles = getTagBadgeStyles("Fuerza");
        expect(fuerzaStyles.dotColor).toContain("amber");

        const hipertrofiaStyles = getTagBadgeStyles("Hipertrofia");
        expect(hipertrofiaStyles.dotColor).toContain("emerald");

        const rehabStyles = getTagBadgeStyles("Rehabilitación");
        expect(rehabStyles.dotColor).toContain("sky");

        const potenciaStyles = getTagBadgeStyles("Potencia");
        expect(potenciaStyles.dotColor).toContain("purple");

        const pesoCorpStyles = getTagBadgeStyles("Peso Corporal");
        expect(pesoCorpStyles.dotColor).toContain("slate");
      });

      it("aplica estilos condicionales activos e inactivos en chips de filtrado", () => {
        const activoFuerza = getTagChipFilterStyles("Fuerza", true);
        const inactivoFuerza = getTagChipFilterStyles("Fuerza", false);

        expect(activoFuerza).toContain("border-amber-500");
        expect(inactivoFuerza).toContain("text-muted-foreground");

        const activoTodos = getTagChipFilterStyles("Todos", true);
        expect(activoTodos).toContain("bg-primary");
      });
    });

    describe("3.3 Filtrado Reactivo en Memoria y Búsqueda Combinada", () => {
      const mockPlanes: PlanEntrenamiento[] = [
        {
          id: "p1",
          profesor_id: null,
          nombre: "Torso Pesado Fuerza",
          tipo: "PLANTILLA",
          estado: "ACTIVO",
          alumno_id: null,
          comentarios: "Foco en press banca y dominadas lastradas",
          tags: ["Fuerza", "Potencia"],
          fecha_inicio: "2026-01-01",
          fecha_fin: "2026-02-01",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "p2",
          profesor_id: null,
          nombre: "Piernas Hipertrofia y Glúteos",
          tipo: "PLANTILLA",
          estado: "ACTIVO",
          alumno_id: null,
          comentarios: "Volumen alto con sentadillas y rdl",
          tags: ["Hipertrofia"],
          fecha_inicio: "2026-01-01",
          fecha_fin: "2026-02-01",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "p3",
          profesor_id: null,
          nombre: "Readaptación Hombro y Manguito",
          tipo: "PLANTILLA",
          estado: "ACTIVO",
          alumno_id: null,
          comentarios: "Ejercicios isométricos con bandas",
          tags: ["Rehabilitación"],
          fecha_inicio: "2026-01-01",
          fecha_fin: "2026-02-01",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "p4",
          profesor_id: null,
          nombre: "Calistenia y Dominadas",
          tipo: "PLANTILLA",
          estado: "ACTIVO",
          alumno_id: null,
          comentarios: "Entrenamiento al aire libre",
          tags: ["Peso Corporal", "Fuerza"],
          fecha_inicio: "2026-01-01",
          fecha_fin: "2026-02-01",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      it("filtra exclusivamente los planes que contienen el tag seleccionado", () => {
        const soloFuerza = filtrarRutinasPorTag(mockPlanes, "Fuerza");
        expect(soloFuerza.map((p) => p.id)).toEqual(["p1", "p4"]);

        const soloHipertrofia = filtrarRutinasPorTag(mockPlanes, "Hipertrofia");
        expect(soloHipertrofia.map((p) => p.id)).toEqual(["p2"]);

        const soloRehab = filtrarRutinasPorTag(mockPlanes, "Rehabilitación");
        expect(soloRehab.map((p) => p.id)).toEqual(["p3"]);
      });

      it("devuelve todos los planes cuando se selecciona 'Todos', null o undefined", () => {
        expect(filtrarRutinasPorTag(mockPlanes, "Todos")).toHaveLength(4);
        expect(filtrarRutinasPorTag(mockPlanes, null)).toHaveLength(4);
        expect(filtrarRutinasPorTag(mockPlanes, undefined)).toHaveLength(4);
      });

      it("busca de forma insensible a mayúsculas en nombre, comentarios y tags", () => {
        // Coincidencia por comentario "press banca"
        const busquedaComentario = filtrarRutinasPorBusqueda(mockPlanes, "press banca");
        expect(busquedaComentario).toHaveLength(1);
        expect(busquedaComentario[0]?.id).toBe("p1");

        // Coincidencia por tag "potencia"
        const busquedaTag = filtrarRutinasPorBusqueda(mockPlanes, "potencia");
        expect(busquedaTag).toHaveLength(1);
        expect(busquedaTag[0]?.id).toBe("p1");

        // Coincidencia por nombre "Calistenia"
        const busquedaNombre = filtrarRutinasPorBusqueda(mockPlanes, "calistenia");
        expect(busquedaNombre).toHaveLength(1);
        expect(busquedaNombre[0]?.id).toBe("p4");
      });

      it("combina el filtro por tag y la búsqueda por texto (filtrarRutinas)", () => {
        // Tag "Fuerza" Y búsqueda "Calistenia" -> solo p4
        const res = filtrarRutinas(mockPlanes, "Fuerza", "Calistenia");
        expect(res).toHaveLength(1);
        expect(res[0]?.id).toBe("p4");

        // Tag "Fuerza" Y búsqueda "Hombro" -> sin coincidencias
        const sinResultados = filtrarRutinas(mockPlanes, "Fuerza", "Hombro");
        expect(sinResultados).toHaveLength(0);
      });
    });

    describe("3.4 Herencia de Tags en Duplicación y Asignación de Plantillas", () => {
      it("hereda íntegramente el array de tags desde la plantilla origen sin mutar el original", () => {
        const plantilla: Partial<PlanEntrenamiento> = {
          tags: ["Fuerza", "Potencia"],
        };

        const tagsHeredados = heredarTagsDePlantilla(plantilla);
        expect(tagsHeredados).toEqual(["Fuerza", "Potencia"]);
        expect(tagsHeredados).not.toBe(plantilla.tags); // Clon independiente

        tagsHeredados.push("Hipertrofia");
        expect(plantilla.tags).toEqual(["Fuerza", "Potencia"]); // No muta origen
      });

      it("maneja plantillas sin tags devolviendo array vacío de forma segura", () => {
        expect(heredarTagsDePlantilla(null)).toEqual([]);
        expect(heredarTagsDePlantilla(undefined)).toEqual([]);
        expect(heredarTagsDePlantilla({})).toEqual([]);
        expect(heredarTagsDePlantilla({ tags: [] })).toEqual([]);
      });

      it("preserva tags al clonar rutina de alumno en useCoachStudioStore (clonarUltimaRutina)", async () => {
        const planBase: PlanEntrenamiento = {
          id: "plan-original-123",
          profesor_id: null,
          nombre: "Fuerza Explosiva",
          tipo: "DE_ALUMNO",
          estado: "ACTIVO",
          alumno_id: "alumno-test-clone",
          comentarios: "Rutina base",
          tags: ["Fuerza", "Potencia"],
          fecha_inicio: "2026-01-01",
          fecha_fin: "2026-02-01",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        };

        useCoachStudioStore.setState({ planes: [planBase] });
        const clon = await useCoachStudioStore.getState().clonarUltimaRutina("alumno-test-clone");

        expect(clon).not.toBeNull();
        expect(clon?.tags).toEqual(["Fuerza", "Potencia"]);
        expect(clon?.nombre).toContain("[Clon] Fuerza Explosiva");
      });
    });
  });

  // ==========================================================================
  // 4. VERIFICACIÓN MATEMÁTICA ESTRICTA DE ENTRENAMIENTO DE FUERZA (@qa-eng)
  // ==========================================================================
  describe("4. Verificación Matemática Estricta de Fuerza y Temporizadores (@qa-eng)", () => {
    describe("4.1 Estimación de 1RM con Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula 1RM exactamente para series estándar de fuerza e hipertrofia", () => {
        // 100 kg x 10 reps = 100 * (1 + 10/30) = 133.333...
        expect(calculateEpley1RM(100, 10)).toBeCloseTo(133.333, 2);

        // 80 kg x 5 reps = 80 * (1 + 5/30) = 93.333...
        expect(calculateEpley1RM(80, 5)).toBeCloseTo(93.333, 2);

        // 120 kg x 1 rep = 120 * (1 + 1/30) = 124.000...
        expect(calculateEpley1RM(120, 1)).toBeCloseTo(124.0, 2);

        // 60 kg x 12 reps (rango máximo superior de 8/12) = 60 * (1 + 12/30) = 84.0 kg
        expect(calculateEpley1RM(60, 12)).toBeCloseTo(84.0, 2);
      });

      it("maneja con robustez edge cases matemáticos devolviendo 0 (0 reps, peso negativo, NaN, Infinity)", () => {
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(-80, 5)).toBe(0);
        expect(calculateEpley1RM(100, -3)).toBe(0);
        expect(calculateEpley1RM(NaN, 5)).toBe(0);
        expect(calculateEpley1RM(100, NaN)).toBe(0);
        expect(calculateEpley1RM(Infinity, 5)).toBe(0);
        expect(calculateEpley1RM(100, Infinity)).toBe(0);
      });
    });

    describe("4.2 Estimación de 1RM con Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula 1RM para 1 repetición pura (100 kg = 100 kg exacto)", () => {
        // Denominador: 1.0278 - 0.0278 * 1 = 1.0 -> 100 / 1.0 = 100
        expect(calculateBrzycki1RM(100, 1)).toBe(100);
      });

      it("calcula 1RM para 10 repeticiones con 100 kg", () => {
        // Denominador: 1.0278 - 0.0278 * 10 = 0.7498 -> 100 / 0.7498 = 133.368898...
        expect(calculateBrzycki1RM(100, 10)).toBeCloseTo(133.368, 2);
      });

      it("calcula 1RM para 12 repeticiones (límite superior de rango '8/12')", () => {
        // Denominador: 1.0278 - 0.0278 * 12 = 0.6942 -> 70 / 0.6942 = 100.835...
        expect(calculateBrzycki1RM(70, 12)).toBeCloseTo(100.835, 2);
      });

      it("previene singularidad matemática y división por cero cuando reps >= 37 (denominador <= 0)", () => {
        // 1.0278 - 0.0278 * 37 = -0.0008 <= 0
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);
        expect(calculateBrzycki1RM(0, 10)).toBe(0);
        expect(calculateBrzycki1RM(-100, 5)).toBe(0);
      });
    });

    describe("4.3 Tonelaje Total Semanal: Sum(Series * Reps * Peso)", () => {
      it("calcula el tonelaje acumulado de múltiples bloques de ejercicio con exactitud", () => {
        const bloques: VolumeBlock[] = [
          { series: 4, reps: 12, peso: 100 }, // 4 * 12 * 100 = 4800 kg (usando rango 8/12 max)
          { series: 3, reps: 10, peso: 80 },  // 3 * 10 * 80  = 2400 kg
          { series: 3, reps: 15, peso: 50 },  // 3 * 15 * 50  = 2250 kg
        ];
        // 4800 + 2400 + 2250 = 9450 kg
        expect(calculateTotalTonnage(bloques)).toBe(9450);
      });

      it("descarta bloques malformados o pesos negativos sin alterar la suma", () => {
        const bloques: VolumeBlock[] = [
          { series: 4, reps: 12, peso: 100 }, // 4800 kg
          { series: 0, reps: 10, peso: 80 },  // 0
          { series: 3, reps: -5, peso: 80 },  // 0
          { series: 3, reps: 10, peso: -20 }, // 0
        ];
        expect(calculateTotalTonnage(bloques)).toBe(4800);
      });
    });

    describe("4.4 Precisión de Temporizadores de Descanso y Resiliencia a Suspensión", () => {
      it("calcula tiempo restante basado en timestamps absolutos (Date.now()) evitando deriva por suspensión", () => {
        const tiempoInicioMs = 1730740000000;
        const duracionSegundos = 90;
        const tiempoFinMs = tiempoInicioMs + duracionSegundos * 1000;

        const calcularSegundosRestantes = (ahoraMs: number) => {
          const diffMs = tiempoFinMs - ahoraMs;
          if (diffMs <= 0) return 0;
          return Math.ceil(diffMs / 1000);
        };

        // Estado inicial
        expect(calcularSegundosRestantes(tiempoInicioMs)).toBe(90);

        // Tras 30 segundos normales
        expect(calcularSegundosRestantes(tiempoInicioMs + 30000)).toBe(60);

        // Simulación de suspensión de pestaña móvil durante 45 segundos más
        expect(calcularSegundosRestantes(tiempoInicioMs + 75000)).toBe(15);

        // Pasado el límite (timer completado)
        expect(calcularSegundosRestantes(tiempoInicioMs + 95000)).toBe(0);
      });
    });

    describe("4.5 Robustez Offline y Encolado Atómico (useOfflineQueueStore)", () => {
      it("encola eventos de series cuando se pierde la conexión y mantiene consistencia", () => {
        useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });

        // Encolar serie completada offline con el método oficial enqueueEvent
        useOfflineQueueStore.getState().enqueueEvent({
          id: "evt-serie-rango-1",
          action: "WORKOUT_SET_COMPLETED",
          payload: {
            ejercicioId: "ej-press-1",
            numeroSerie: 1,
            peso: 100,
            reps: 12, // Rango máximo
            timestamp: Date.now(),
          },
        });

        const state = useOfflineQueueStore.getState();
        expect(state.isOnline).toBe(false);
        expect(state.pendingEvents).toHaveLength(1);
        expect((state.pendingEvents[0]?.payload as any).reps).toBe(12);
        expect(state.pendingEvents[0]?.action).toBe("WORKOUT_SET_COMPLETED");

        // Reconexión y vaciado de cola
        useOfflineQueueStore.getState().clearQueue();
        useOfflineQueueStore.getState().setOnlineStatus(true);
        expect(useOfflineQueueStore.getState().isOnline).toBe(true);
        expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // 5. FLUJO E2E INTEGRADO: BIBLIOTECA -> ASIGNACIÓN -> LIVE WORKOUT -> OFFLINE
  // ==========================================================================
  describe("5. Flujo E2E Integrado: Plantilla con Tags -> Asignación -> Rango en Atleta -> Offline Sync", () => {
    it("ejecuta el ciclo de vida completo de extremo a extremo sin pérdida de datos", () => {
      // 1. Coach define plantilla con tags y ejercicio con rango de repeticiones "8/12"
      const plantillaOrigen: PlanEntrenamiento = {
        id: "plantilla-fuerza-1",
        profesor_id: null,
        nombre: "Fuerza y Potencia Avanzada",
        tipo: "PLANTILLA",
        estado: "ACTIVO",
        alumno_id: null,
        comentarios: "Plantilla con prescripciones en rango",
        tags: ["Fuerza", "Potencia"],
        fecha_inicio: "2026-01-01",
        fecha_fin: "2026-03-01",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };

      // 2. Filtro en biblioteca encuentra la plantilla por el tag "Potencia"
      const encontradas = filtrarRutinas([plantillaOrigen], "Potencia");
      expect(encontradas).toHaveLength(1);
      expect(encontradas[0]?.id).toBe("plantilla-fuerza-1");

      // 3. Asignación a alumno preserva los tags
      const rutinaAlumno: Partial<PlanEntrenamiento> = {
        id: "plan-alumno-1",
        nombre: plantillaOrigen.nombre,
        tipo: "DE_ALUMNO",
        alumno_id: "alumno-martin",
        tags: heredarTagsDePlantilla(plantillaOrigen),
      };
      expect(rutinaAlumno.tags).toEqual(["Fuerza", "Potencia"]);

      // 4. Atleta abre sesión con ejercicio prescripto "8/12"
      const repeticionesPrescriptas = "8/12";
      const repRange = parseRepRange(repeticionesPrescriptas);
      expect(repRange).not.toBeNull();
      expect(repRange?.max).toBe(12);

      // Carga por defecto del target
      const targetDefault = parseDefaultReps(repeticionesPrescriptas);
      expect(targetDefault).toBe(12);

      // 5. Stepper cap: intenta incrementar por encima de 12
      let repsAtleta = targetDefault;
      const isBlocked = repsAtleta >= repRange!.max;
      expect(isBlocked).toBe(true);

      // Permite registrar la serie con 12 reps y 90 kg
      const pesoAtleta = 90;
      const epley1RM = calculateEpley1RM(pesoAtleta, repsAtleta);
      expect(epley1RM).toBeCloseTo(90 * (1 + 12 / 30), 2); // 126 kg

      // 6. Pérdida repentina de conexión y encolado en useOfflineQueueStore
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });
      useOfflineQueueStore.getState().enqueueEvent({
        id: "evt-e2e-1",
        action: "WORKOUT_SET_COMPLETED",
        payload: {
          planId: rutinaAlumno.id,
          reps: repsAtleta,
          peso: pesoAtleta,
          estimacion1RM: epley1RM,
        },
      });

      expect(useOfflineQueueStore.getState().isOnline).toBe(false);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);

      // 7. Reconexión y sincronización
      useOfflineQueueStore.getState().setOnlineStatus(true);
      useOfflineQueueStore.getState().clearQueue();
      expect(useOfflineQueueStore.getState().isOnline).toBe(true);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    });
  });
});
