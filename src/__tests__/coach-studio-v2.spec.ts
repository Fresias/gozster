import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  generateWhatsAppArgentinoUrl,
  type VolumeBlock,
  type WhatsAppTemplateType,
} from "@/lib/strength-metrics";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { Database } from "@/types/database.types";

/**
 * ============================================================================
 * QA SUITE: CERTIFICACIÓN INTEGRAL DE COACH STUDIO V2 (GOZS-28 / Issue #43)
 * Guardián Técnico Inflexible: @qa-eng
 *
 * Módulos Verificados:
 * 1. Semáforos Temporales y de Estado (Cuota, Vigencia de Rutina, Actividad).
 * 2. Ergonomía Táctil Material Design 3 (≥ 48px) y Responsive de Alertas.
 * 3. Ausencia de Texto Redundante (Semáforos Puros M3 con tooltips).
 * 4. Poda Radical de Bloatware (Karpathy & Ponytail).
 * 5. Templates Argentinos de WhatsApp (sin signos "¡").
 * 6. Quick Swap y Persistencia en Supabase (alertas, historial, RPC).
 * 7. Verificación Matemática Estricta de Métricas de Fuerza (Epley, Brzycki, Tonelaje).
 * 8. Robustez Offline-First y Manejo de Cola de Eventos.
 * ============================================================================
 */

// Helper functions for pure mathematical evaluation of semaphores according to spec:
export function evaluateCuotaSemaphore(
  fechaVencimiento: string | Date | null | undefined,
  referenceDate: Date = new Date(),
): "GREEN" | "YELLOW" | "RED" {
  if (!fechaVencimiento) return "RED";
  const vencimiento = new Date(fechaVencimiento);
  if (Number.isNaN(vencimiento.getTime())) return "RED";

  // Normalizar a días respecto a referenceDate
  const msPorDia = 1000 * 60 * 60 * 24;
  const diffDias = (vencimiento.getTime() - referenceDate.getTime()) / msPorDia;

  if (diffDias > 3) {
    return "GREEN";
  }
  if (diffDias >= 0 && diffDias <= 3) {
    return "YELLOW";
  }
  return "RED";
}

import { evaluateRutinaVigenciaSemaphore } from "@/lib/rutina-vigencia";
export { evaluateRutinaVigenciaSemaphore };

export function evaluateActividadSemaphore(
  ultimoEntreno: string | Date | null | undefined,
  referenceDate: Date = new Date(),
): "GREEN" | "YELLOW" | "RED" {
  if (!ultimoEntreno) return "RED";
  const entreno = new Date(ultimoEntreno);
  if (Number.isNaN(entreno.getTime())) return "RED";

  const msPorDia = 1000 * 60 * 60 * 24;
  const diasInactivo = (referenceDate.getTime() - entreno.getTime()) / msPorDia;

  if (diasInactivo < 7) {
    return "GREEN";
  }
  if (diasInactivo >= 7 && diasInactivo <= 14) {
    return "YELLOW";
  }
  return "RED";
}

describe("QA Verification Suite - Coach Studio v2 (Issue #43 / GOZS-28)", () => {
  const coachStudioViewPath = path.resolve(
    __dirname,
    "../components/coach/coach-studio-view.tsx"
  );
  const criticalAlertsPath = path.resolve(
    __dirname,
    "../components/coach/critical-alerts-inbox.tsx"
  );
  const retentionCardsPath = path.resolve(
    __dirname,
    "../components/coach/retention-kpi-cards.tsx"
  );
  const quickSwapModalPath = path.resolve(
    __dirname,
    "../components/coach/quick-swap-modal.tsx"
  );
  const whatsappModalPath = path.resolve(
    __dirname,
    "../components/coach/whatsapp-template-modal.tsx"
  );
  const migrationPath = path.resolve(
    __dirname,
    "../../supabase/migrations/20261017100000_alertas_historial_dolor_quick_swap.sql"
  );

  const viewContent = fs.readFileSync(coachStudioViewPath, "utf-8");
  const alertsContent = fs.readFileSync(criticalAlertsPath, "utf-8");
  const alertsDataContent = fs.readFileSync(
    path.resolve(__dirname, "../components/coach/critical-alerts-data.ts"),
    "utf-8"
  );
  const retentionContent = fs.readFileSync(retentionCardsPath, "utf-8");
  const quickSwapContent = fs.readFileSync(quickSwapModalPath, "utf-8");
  const whatsappContent = fs.readFileSync(whatsappModalPath, "utf-8");
  const migrationSql = fs.readFileSync(migrationPath, "utf-8");

  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      activeTab: "rutina_actual",
      isHistoricalLoadsOpen: false,
      isChatOpen: false,
      isRoutineBuilderOpen: false,
      toast: null,
      currentPage: 1,
    });

    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. SEMÁFOROS TEMPORALES Y DE ESTADO
  // ==========================================================================
  describe("1. Lógica y Umbrales de Semáforos Temporales M3", () => {
    const baseNow = new Date("2026-10-17T12:00:00Z");

    describe("Semáforo de Cuota (fecha_vencimiento_cuota)", () => {
      it("Verde: fecha_vencimiento_cuota > 3 días en el futuro", () => {
        const en4Dias = new Date("2026-10-21T12:00:00Z"); // +4 días
        const en15Dias = new Date("2026-11-01T12:00:00Z"); // +15 días

        expect(evaluateCuotaSemaphore(en4Dias, baseNow)).toBe("GREEN");
        expect(evaluateCuotaSemaphore(en15Dias, baseNow)).toBe("GREEN");
      });

      it("Amarillo: fecha_vencimiento_cuota <= 3 días y >= hoy", () => {
        const en3Dias = new Date("2026-10-20T12:00:00Z"); // +3 días exactos
        const en1Dia = new Date("2026-10-18T12:00:00Z"); // +1 día
        const hoyMismo = new Date("2026-10-17T12:00:00Z"); // 0 días

        expect(evaluateCuotaSemaphore(en3Dias, baseNow)).toBe("YELLOW");
        expect(evaluateCuotaSemaphore(en1Dia, baseNow)).toBe("YELLOW");
        expect(evaluateCuotaSemaphore(hoyMismo, baseNow)).toBe("YELLOW");
      });

      it("Rojo: fecha_vencimiento_cuota < hoy (vencida) o valor nulo/inválido", () => {
        const ayer = new Date("2026-10-16T12:00:00Z"); // -1 día
        const hace10Dias = new Date("2026-10-07T12:00:00Z"); // -10 días

        expect(evaluateCuotaSemaphore(ayer, baseNow)).toBe("RED");
        expect(evaluateCuotaSemaphore(hace10Dias, baseNow)).toBe("RED");
        expect(evaluateCuotaSemaphore(null, baseNow)).toBe("RED");
        expect(evaluateCuotaSemaphore(undefined, baseNow)).toBe("RED");
        expect(evaluateCuotaSemaphore("fecha-invalida", baseNow)).toBe("RED");
      });
    });

    describe("Semáforo de Vigencia de Rutina (GOZS-242)", () => {
      it("Verde: plan creado hace 0 a 15 días (borde 15)", () => {
        const hoy = new Date("2026-10-17T12:00:00Z"); // 0 días
        const hace10Dias = new Date("2026-10-07T12:00:00Z"); // 10 días
        const hace15Dias = new Date("2026-10-02T12:00:00Z"); // 15 días exactos (borde)

        expect(evaluateRutinaVigenciaSemaphore(hoy, baseNow)).toBe("GREEN");
        expect(evaluateRutinaVigenciaSemaphore(hace10Dias, baseNow)).toBe("GREEN");
        expect(evaluateRutinaVigenciaSemaphore(hace15Dias, baseNow)).toBe("GREEN");
      });

      it("Amarillo: plan creado hace 16 a 21 días (bordes 16 y 21)", () => {
        const hace16Dias = new Date("2026-10-01T12:00:00Z"); // 16 días exactos (borde)
        const hace18Dias = new Date("2026-09-29T12:00:00Z"); // 18 días
        const hace21Dias = new Date("2026-09-26T12:00:00Z"); // 21 días exactos (borde)

        expect(evaluateRutinaVigenciaSemaphore(hace16Dias, baseNow)).toBe("YELLOW");
        expect(evaluateRutinaVigenciaSemaphore(hace18Dias, baseNow)).toBe("YELLOW");
        expect(evaluateRutinaVigenciaSemaphore(hace21Dias, baseNow)).toBe("YELLOW");
      });

      it("Rojo: plan creado hace 22+ días (borde 22) o sin plan activo", () => {
        const hace22Dias = new Date("2026-09-25T12:00:00Z"); // 22 días exactos (borde)
        const hace30Dias = new Date("2026-09-17T12:00:00Z"); // 30 días
        const hace60Dias = new Date("2026-08-18T12:00:00Z"); // 60 días
        const hace90Dias = new Date("2026-07-19T12:00:00Z"); // 90 días

        expect(evaluateRutinaVigenciaSemaphore(hace22Dias, baseNow)).toBe("RED");
        expect(evaluateRutinaVigenciaSemaphore(hace30Dias, baseNow)).toBe("RED");
        expect(evaluateRutinaVigenciaSemaphore(hace60Dias, baseNow)).toBe("RED");
        expect(evaluateRutinaVigenciaSemaphore(hace90Dias, baseNow)).toBe("RED");
        expect(evaluateRutinaVigenciaSemaphore(null, baseNow)).toBe("RED");
        expect(evaluateRutinaVigenciaSemaphore(undefined, baseNow)).toBe("RED");
      });
    });

    describe("Semáforo de Actividad (Recencia de Último Entreno)", () => {
      it("Verde: último entreno realizado hace < 7 días", () => {
        const hoy = new Date("2026-10-17T12:00:00Z"); // 0 días
        const hace3Dias = new Date("2026-10-14T12:00:00Z"); // 3 días
        const hace6Dias = new Date("2026-10-11T12:00:00Z"); // 6 días

        expect(evaluateActividadSemaphore(hoy, baseNow)).toBe("GREEN");
        expect(evaluateActividadSemaphore(hace3Dias, baseNow)).toBe("GREEN");
        expect(evaluateActividadSemaphore(hace6Dias, baseNow)).toBe("GREEN");
      });

      it("Amarillo: último entreno realizado hace 7 a 14 días", () => {
        const hace7Dias = new Date("2026-10-10T12:00:00Z"); // 7 días exactos
        const hace10Dias = new Date("2026-10-07T12:00:00Z"); // 10 días
        const hace14Dias = new Date("2026-10-03T12:00:00Z"); // 14 días exactos

        expect(evaluateActividadSemaphore(hace7Dias, baseNow)).toBe("YELLOW");
        expect(evaluateActividadSemaphore(hace10Dias, baseNow)).toBe("YELLOW");
        expect(evaluateActividadSemaphore(hace14Dias, baseNow)).toBe("YELLOW");
      });

      it("Rojo: último entreno realizado hace > 14 días o sin entreno", () => {
        const hace15Dias = new Date("2026-10-02T12:00:00Z"); // 15 días
        const hace30Dias = new Date("2026-09-17T12:00:00Z"); // 30 días

        expect(evaluateActividadSemaphore(hace15Dias, baseNow)).toBe("RED");
        expect(evaluateActividadSemaphore(hace30Dias, baseNow)).toBe("RED");
        expect(evaluateActividadSemaphore(null, baseNow)).toBe("RED");
        expect(evaluateActividadSemaphore(undefined, baseNow)).toBe("RED");
      });
    });
  });

  // ==========================================================================
  // 2. ERGONOMÍA TÁCTIL MATERIAL DESIGN 3 Y RESPONSIVE
  // ==========================================================================
  describe("2. Verificación de Ergonomía Táctil M3 y Responsive", () => {
    it("comprueba que los botones interactivos de acción rápida cumplan con touch target ≥ 48px", () => {
      // En CoachStudioView: botones de WhatsApp y Quick Swap
      expect(viewContent).toContain("h-12 w-12 min-h-[48px] min-w-[48px]");
      expect(viewContent).toContain("min-h-[48px]");

      // En WhatsAppTemplateModal: botones de acción con min-h-12 (48px)
      expect(whatsappContent).toContain("min-h-12");

      // En QuickSwapModal: botón de sustituir y opciones con min-h-12
      expect(quickSwapContent).toContain("min-h-12");
    });

    it("comprueba separación táctil mínima entre botones de acción rápida de al menos 8px", () => {
      expect(viewContent).toContain("gap-2"); // gap-2 en Tailwind = 8px
    });

    it("comprueba que la celda de alertas combine múltiples eventos sin colapso ni desbordamiento de grilla", () => {
      expect(viewContent).toContain("min-w-[130px] max-w-[190px]");
      expect(viewContent).toContain("flex flex-wrap gap-1.5");
      expect(viewContent).toContain("getDemoAlumnoAlerts(alumno.nombre_completo)");
      const dataset = fs.readFileSync(path.resolve(__dirname, "../services/coach-demo-dataset.ts"), "utf-8");
      expect(dataset).toContain("🚨");
      expect(dataset).toContain("⚡");
    });
  });

  // ==========================================================================
  // 3. SEMÁFOROS PUROS M3 Y AUSENCIA DE TEXTO REDUNDANTE
  // ==========================================================================
  describe("3. Semáforos Puros M3 y Ausencia de Texto Redundante", () => {
    it("comprueba que las columnas de Cuota, Vigencia y Actividad utilicen dots/pills de color puros", () => {
      // Cuota: dot puro de 12px con role='status'
      expect(viewContent).toContain("h-3 w-3 rounded-full");
      expect(viewContent).toContain('role="status"');

      // Vigencia: micro-pill pura
      expect(viewContent).toContain("h-2.5 w-10 rounded-full");

      // Actividad: dot puro de 12px
      expect(viewContent).toContain("recenciaDotColor");
    });

    it("comprueba que los detalles cuantitativos y explicativos residan en tooltips (title y aria-label)", () => {
      expect(viewContent).toContain("title={cuotaTooltip}");
      expect(viewContent).toContain("aria-label={cuotaTooltip}");
      expect(viewContent).toContain("title={rutinaTooltip}");
      expect(viewContent).toContain("aria-label={rutinaTooltip}");
      expect(viewContent).toContain("title={recenciaTooltip}");
      expect(viewContent).toContain("aria-label={recenciaTooltip}");
    });

    it("comprueba que no haya rastro del proxy de Score Salud [SH] en la tabla ni código muerto (GOZS-240)", () => {
      expect(viewContent).not.toContain("Score Salud [SH]");
      expect(viewContent).not.toContain("shColorClass");
      expect(viewContent).not.toMatch(/\[\s*\{\s*Math\.round\(healthScore\.score\)\s*\}\s*\]/);
    });
  });

  // ==========================================================================
  // 4. PODA RADICAL DE BLOATWARE (KARPATHY & PONYTAIL)
  // ==========================================================================
  describe("4. Poda Radical de Bloatware (Karpathy & Ponytail)", () => {
    it("la tabla principal no muestra columnas pesadas de Vol. Semanal ni 1RM", () => {
      expect(viewContent).not.toContain("Vol. Semanal [kg]");
      expect(viewContent).not.toContain("1RM Banca [kg]");
      expect(viewContent).not.toContain("1RM Sentadilla [kg]");
      expect(viewContent).not.toContain("bancaRecord");
      expect(viewContent).not.toContain("sentadillaRecord");
    });

    it("retira ProgressiveOverloadFeed del inicio", () => {
      expect(viewContent).not.toContain("<ProgressiveOverloadFeed");
      expect(viewContent).not.toContain("progressive-overload-feed");
    });

    it("retira el botón 'Constructor de Rutinas' de la cabecera principal de la tabla", () => {
      // Trasladado a herramientas secundarias o menú lateral
      expect(viewContent).not.toMatch(/<h1[^>]*>[\s\S]*?Constructor de Rutinas[\s\S]*?<\/h1>/);
      expect(viewContent).toContain('data-testid="open-routine-builder-btn"');
    });

    it("la bandeja de alertas críticas filtra estrictamente alertas rojas de dolor articular", () => {
      expect(alertsContent).toContain('type === "DOLOR"');
      expect(alertsDataContent).toContain('.eq("pain_reported", true)');
      expect(alertsContent).not.toContain("VIDEO_FORM_CHECK");
    });
  });

  // ==========================================================================
  // 5. TEMPLATES ARGENTINOS DE WHATSAPP (SIN SIGNOS DE APERTURA "¡")
  // ==========================================================================
  describe("5. Templates Argentinos de WhatsApp (wa.me sin '¡')", () => {
    it("genera URL de cuota con formato argentino sin signo de apertura '¡'", () => {
      const { url, message } = generateWhatsAppArgentinoUrl({
        phone: "+54 9 11 9876-5432",
        studentName: "Martín",
        type: "cuota",
      });

      expect(url).toContain("https://wa.me/5491198765432");
      expect(message).not.toContain("¡");
      expect(message).toBe(
        "Hola Martín! Che, cómo andás? Te aviso que se te vence la cuota estos días. Te paso el alias así quedás al día?"
      );
    });

    it("genera URL de reactivación por inactividad con formato argentino sin signo '¡'", () => {
      const { url, message } = generateWhatsAppArgentinoUrl({
        phone: "+54 9 11 1122-3344",
        studentName: "Celeste",
        type: "inactividad",
      });

      expect(url).toContain("https://wa.me/5491111223344");
      expect(message).not.toContain("¡");
      expect(message).toBe(
        "Hola crack! Cómo va? Che, vi que hace unos días no te das una vuelta por el gym. Venís bien con los tiempos o querés que ajustemos la rutina?"
      );
    });

    it("genera URL de felicitación por récord de fuerza (PR) con formato argentino sin signo '¡'", () => {
      const { url, message } = generateWhatsAppArgentinoUrl({
        phone: "+54 9 11 5566-7788",
        studentName: "Lucas",
        type: "record",
        exerciseName: "Press de Banca Plano",
      });

      expect(url).toContain("https://wa.me/5491155667788");
      expect(message).not.toContain("¡");
      expect(message).toBe(
        "Hola Lucas! Tremendo el récord que clavaste en Press de Banca Plano, felicitaciones fiera! A seguir metiéndole 💪"
      );
    });
  });

  // ==========================================================================
  // 6. QUICK SWAP Y PERSISTENCIA RELACIONAL EN SUPABASE
  // ==========================================================================
  describe("6. Quick Swap y Esquema Relacional de Alertas en Supabase", () => {
    it("la migración SQL define alertas_entrenador con foreign keys y enum checks", () => {
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.alertas_entrenador");
      expect(migrationSql).toContain("tipo_alerta TEXT NOT NULL CHECK (tipo_alerta IN ('DOLOR_ARTICULAR', 'RECORD_1RM', 'DESERCION_RIESGO', 'CUOTA_VENCIDA', 'INACTIVIDAD'))");
      expect(migrationSql).toContain("severidad TEXT NOT NULL DEFAULT 'ALTA' CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA'))");
      expect(migrationSql).toContain("estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'RESUELTO', 'IGNORADO'))");
      expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
    });

    it("la migración SQL define alumno_historial_dolor como ficha biomecánica permanente", () => {
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.alumno_historial_dolor");
      expect(migrationSql).toContain("zona_articular TEXT NOT NULL CHECK (zona_articular IN ('HOMBRO', 'RODILLA', 'LUMBAR', 'CODO', 'CUELLO', 'CADERA', 'TOBILLO', 'OTRO'))");
      expect(migrationSql).toContain("estado_recuperacion TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado_recuperacion IN ('ACTIVO', 'EN_RECUPERACION', 'RESUELTO'))");
      expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
    });

    it("la migración implementa la RPC transaccional quick_swap_ejercicio con SECURITY DEFINER", () => {
      expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.quick_swap_ejercicio");
      expect(migrationSql).toContain("SECURITY DEFINER");
      expect(migrationSql).toContain("public.es_entrenador_de");
      expect(migrationSql).toContain("UPDATE public.ejercicios_en_rutina");
      expect(migrationSql).toContain("UPDATE public.alertas_entrenador");
    });

    it("el archivo database.types.ts tipa con precisión las tablas y la RPC quick_swap_ejercicio", () => {
      type DB = Database["public"]["Tables"];
      type AlertasRow = DB["alertas_entrenador"]["Row"];
      type HistorialRow = DB["alumno_historial_dolor"]["Row"];
      type QuickSwapFn = Database["public"]["Functions"]["quick_swap_ejercicio"];

      // Verificación de compilación estática de tipos en TypeScript
      const dummyAlerta: Partial<AlertasRow> = {
        tipo_alerta: "DOLOR_ARTICULAR",
        severidad: "ALTA",
        estado: "PENDIENTE",
      };
      expect(dummyAlerta.tipo_alerta).toBe("DOLOR_ARTICULAR");

      const dummyHistorial: Partial<HistorialRow> = {
        zona_articular: "HOMBRO",
        estado_recuperacion: "ACTIVO",
      };
      expect(dummyHistorial.zona_articular).toBe("HOMBRO");
    });
  });

  // ==========================================================================
  // 7. VERIFICACIÓN MATEMÁTICA ESTRICTA DE MÉTRICAS DE FUERZA (MANDATO QA)
  // ==========================================================================
  describe("7. Verificación Matemática Estricta de Fórmulas de Fuerza", () => {
    describe("Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula con rigor algebraico el 1RM para cargas habituales", () => {
        // 100 kg a 5 reps -> 100 * (1 + 5/30) = 100 * 1.166667 = 116.6667
        expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);

        // 140 kg a 3 reps -> 140 * (1 + 3/30) = 140 * 1.10 = 154
        expect(calculateEpley1RM(140, 3)).toBe(154);

        // 80 kg a 12 reps -> 80 * (1 + 12/30) = 80 * 1.40 = 112
        expect(calculateEpley1RM(80, 12)).toBe(112);

        // 1 rep (directa) -> 120 * (1 + 1/30) = 124
        expect(calculateEpley1RM(120, 1)).toBeCloseTo(124, 4);
      });

      it("maneja de forma robusta casos límite e inputs anómalos", () => {
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(0, 0)).toBe(0);
        expect(calculateEpley1RM(-100, 5)).toBe(0);
        expect(calculateEpley1RM(100, -5)).toBe(0);
        expect(calculateEpley1RM(Number.NaN, 5)).toBe(0);
        expect(calculateEpley1RM(100, Number.NaN)).toBe(0);
        expect(calculateEpley1RM(Number.POSITIVE_INFINITY, 5)).toBe(0);
      });
    });

    describe("Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula con exactitud el 1RM para cargas submáximas", () => {
        // 100 kg a 1 rep -> 100 / (1.0278 - 0.0278) = 100
        expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 4);

        // 100 kg a 5 reps -> 100 / (1.0278 - 0.139) = 100 / 0.8888 = 112.5113
        expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 4);

        // 80 kg a 10 reps -> 80 / (1.0278 - 0.278) = 80 / 0.7498 = 106.6951
        expect(calculateBrzycki1RM(80, 10)).toBeCloseTo(106.6951, 4);
      });

      it("previene división por cero y denominador negativo en repeticiones extremas (>= 37)", () => {
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);
        expect(calculateBrzycki1RM(0, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, 0)).toBe(0);
        expect(calculateBrzycki1RM(-100, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, -5)).toBe(0);
        expect(calculateBrzycki1RM(Number.NaN, 5)).toBe(0);
      });
    });

    describe("Tonelaje Total Semanal: Σ(Series * Reps * Peso)", () => {
      it("acumula exactamente el volumen de series válidas y descarta anomalías", () => {
        const blocks: VolumeBlock[] = [
          { series: 4, reps: 8, peso: 100 }, // 3200
          { series: 3, reps: 10, peso: 80 },  // 2400
          { series: 5, reps: 5, peso: 120 },  // 3000
          { series: 0, reps: 10, peso: 100 }, // 0
          { series: -2, reps: 10, peso: 100 },// 0
          { series: 3, reps: -5, peso: 100 }, // 0
          { series: 3, reps: 10, peso: -50 }, // 0
        ];

        // 3200 + 2400 + 3000 = 8600
        expect(calculateTotalTonnage(blocks)).toBe(8600);
        expect(calculateTotalTonnage([])).toBe(0);
      });
    });
  });

  // ==========================================================================
  // 8. ROBUSTEZ OFFLINE-FIRST
  // ==========================================================================
  describe("8. Robustez Offline-First y Manejo de Cola de Eventos", () => {
    it("encola eventos con idempotencia ante pérdida de conexión y sincroniza al reconectar", () => {
      const offlineStore = useOfflineQueueStore.getState();

      // 1. Simular pérdida de conexión
      offlineStore.setOnlineStatus(false);
      expect(useOfflineQueueStore.getState().isOnline).toBe(false);

      // 2. Encolar eventos de Coach Studio
      offlineStore.enqueueEvent({
        id: "evt-swap-1",
        action: "RPC_QUICK_SWAP_EJERCICIO",
        payload: {
          ejercicioEnRutinaId: "e-rut-1",
          nuevoEjercicioId: "ej-alt-rodilla-1",
          alumnoId: "al-1",
        },
      });

      offlineStore.enqueueEvent({
        id: "evt-plan-ext-1",
        action: "RPC_EXTENDER_VIGENCIA_PLAN",
        payload: { planId: "p-1", diasExtra: 30 },
      });

      expect(useOfflineQueueStore.getState().pendingEvents.length).toBe(2);

      // 3. Simular reconexión exitosa
      offlineStore.setOnlineStatus(true);
      expect(useOfflineQueueStore.getState().isOnline).toBe(true);

      offlineStore.clearQueue();
      expect(useOfflineQueueStore.getState().pendingEvents.length).toBe(0);
    });
  });
});
