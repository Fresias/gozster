import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  generateWhatsAppArgentinoUrl,
  type WhatsAppTemplateType,
} from "@/lib/strength-metrics";

describe("Sprint Coach Studio v2 UI - Semáforos M3, Poda de Bloatware y Ergonomía Táctil (Issue #43 / GOZS-27)", () => {
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
  const studioShellPath = path.resolve(
    __dirname,
    "../components/coach/studio-shell.tsx"
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
  const shellContent = fs.readFileSync(studioShellPath, "utf-8");

  // ==========================================================================
  // 1. PODA RADICAL DE BLOATWARE (FILOSOFÍAS KARPATHY & PONYTAIL)
  // ==========================================================================
  describe("1. Poda Radical de Bloatware", () => {
    it("retira ProgressiveOverloadFeed de la pantalla de inicio del entrenador", () => {
      expect(viewContent).not.toContain("ProgressiveOverloadFeed");
      expect(viewContent).not.toContain("progressive-overload-feed");
    });

    it("retira el botón 'Constructor de Rutinas' de la cabecera principal y lo traslada a herramientas/lateral", () => {
      // No debe existir el botón grande de constructor en la cabecera principal junto al título
      expect(viewContent).toContain('data-testid="open-routine-builder-btn"');
      // Debe existir en la barra de herramientas y en el menú lateral
      expect(shellContent).toContain('data-testid="sidebar-routine-builder-btn"');
      expect(shellContent).toContain('aria-label="Rutinas"');
    });

    it("elimina de la tabla matriz las columnas pesadas: Vol. Semanal, 1RM Banca y 1RM Sentadilla", () => {
      expect(viewContent).not.toContain("Vol. Semanal [kg]");
      expect(viewContent).not.toContain("1RM Banca [kg]");
      expect(viewContent).not.toContain("1RM Sentadilla [kg]");
      expect(viewContent).not.toContain("volumenTotal");
      expect(viewContent).not.toContain("bancaRecord");
      expect(viewContent).not.toContain("sentadillaRecord");
    });

    it("simplifica retention-kpi-cards.tsx a un banner ejecutivo compacto de Alumnos activos eliminando Churn y Sin Plan gigantes", () => {
      expect(retentionContent).toContain("retention-executive-banner");
      expect(retentionContent).toContain('data-testid="kpi-cant-activas"');
      expect(retentionContent).not.toContain("Deserción Mensual (Churn)");
      expect(retentionContent).not.toContain("kpi-cant-perdidos-mes");
    });
  });

  // ==========================================================================
  // 2. MATRIZ OPERATIVA CON SEMÁFOROS M3 (CERO TEXTO REDUNDANTE)
  // ==========================================================================
  describe("2. Matriz Operativa con Semáforos M3 (Cero Texto Redundante)", () => {
    it("preserva los requerimientos de estructura del cuadro y columna matriz", () => {
      expect(viewContent).toContain('const rowPaddingClass = "h-14 py-2";');
      expect(viewContent).toContain('header: "Alumno"');
      expect(viewContent).toContain("tabular-nums");
    });

    it("comunica el estado de Cuota con palabra + color (StatusBadge), no con un punto aislado (00-PM §6)", () => {
      expect(viewContent).toContain("cuotaDotColor");
      expect(viewContent).toContain('{isAlDia ? "Al día" : venceProntoTexto ?? "Vencida"}');
      expect(viewContent).toContain("role=\"status\"");
      // No debe contener badges textuales en la columna Cuota
      expect(viewContent).not.toMatch(/<td[^>]*>\s*<span[^>]*>Al Día<\/span>\s*<\/td>/);
    });

    it("verifica que no exista rastro del proxy Score Salud [SH] en la tabla ni código muerto (GOZS-240)", () => {
      expect(viewContent).not.toContain("Score Salud [SH]");
      expect(viewContent).not.toContain("shColorClass");
      expect(viewContent).not.toMatch(/\[\s*\{\s*Math\.round\(healthScore\.score\)\s*\}\s*\]/);
    });

    it("implementa Vigencia de Rutina como micro-barra o pill sin nombre de archivo visible", () => {
      expect(viewContent).toContain("Vigencia Rutina");
      expect(viewContent).toContain("rutinaPillColor");
      expect(viewContent).toContain("h-2.5 w-10 rounded-full");
      // No debe renderizar el nombre de la rutina o 'SIN PLAN ASIGNADO' como texto plano en esa celda
      expect(viewContent).not.toContain("{planActivo.nombre}");
      expect(viewContent).not.toContain("SIN PLAN ASIGNADO");
    });

    it("muestra Último entreno como texto plano (Hoy / Ayer / Hace n días), sin semáforo de color", () => {
      expect(viewContent).toContain("recenciaDotColor");
      expect(viewContent).not.toContain("inline-block h-3 w-3 rounded-full shrink-0 ${recenciaDotColor}");
      // No debe renderizar los números crudos de días en la tabla
      expect(viewContent).not.toMatch(/\{planActivo \? \(historial\.length > 0 \? "1" : "3"\) : "8"\}/);
    });

    it("implementa la Columna de Alertas Responsive con contenedor md:min-w-[130px] md:max-w-[190px] y badges simultáneos", () => {
      expect(viewContent).toContain("md:min-w-[130px] md:max-w-[190px]");
      expect(viewContent).toContain("flex flex-wrap gap-1.5");
      expect(viewContent).toContain("getDemoAlumnoAlerts(alumno.nombre_completo)");
      expect(fs.readFileSync(path.resolve(__dirname, "../services/coach-demo-dataset.ts"), "utf-8")).toContain("PR Banca");
    });
  });

  // ==========================================================================
  // 3. BANDEJA DE ALERTAS CRÍTICAS COMPACTA (EXCLUSIVA DOLOR ARTICULAR)
  // ==========================================================================
  describe("3. Bandeja de Alertas Críticas Compacta", () => {
    it("filtra estrictamente alertas de dolor articular (DOLOR)", () => {
      expect(alertsContent).toContain('type === "DOLOR"');
      expect(alertsDataContent).toContain('.eq("pain_reported", true)');
      expect(alertsContent).not.toContain("VIDEO_FORM_CHECK");
    });

    it("posee un layout compacto de alta densidad con ancho contenido sin espacios vacíos muertos", () => {
      expect(alertsContent).toContain("xl:absolute xl:inset-x-0 xl:top-0 xl:max-h-full flex flex-col");
      expect(alertsContent).toContain("onQuickSwap");
    });

    it("arranca colapsada, con título corto y header como botón accesible sin pulso", () => {
      expect(alertsContent).toContain("React.useState(false)");
      expect(alertsContent).toContain("Bandeja de alertas críticas");
      expect(alertsContent).toContain("aria-expanded={isExpanded}");
      expect(alertsContent).toContain("w-full min-h-12 flex items-center justify-between");
    });

    it("no ofrece el selector Cuadro INDEC / Tarjetas: la tabla es la única vista", () => {
      expect(viewContent).not.toContain("viewMode");
      expect(viewContent).not.toContain("Cuadro INDEC");
      expect(viewContent).not.toContain("StudentCard");
    });
  });

  // ==========================================================================
  // 4. ACCIONES TÁCTILES FAT-FINGER FRIENDLY Y TEMPLATES ARGENTINOS
  // ==========================================================================
  describe("4. Acciones Táctiles 'Fat-Finger Friendly' y Templates Argentinos", () => {
    it("usa el botón de ícono ⋯ del diseño (size-target) dentro de filas de 56 px y separación de 8 px", () => {
      expect(viewContent).toContain("inline-flex size-target items-center justify-center rounded-md");
      expect(viewContent).toContain('const rowPaddingClass = "h-14 py-2";');
      expect(viewContent).toContain("gap-2"); // 8px de separación
    });

    it("genera URL de WhatsApp wa.me con template de Cuota en tono de profesor argentino", () => {
      const { url, message } = generateWhatsAppArgentinoUrl({
        phone: "5491123456789",
        studentName: "Celeste Gerardi",
        type: "cuota",
      });

      expect(url).toContain("https://wa.me/5491123456789?text=");
      expect(message).toBe(
        "Hola Celeste Gerardi! Che, cómo andás? Te aviso que se te vence la cuota estos días. Te paso el alias así quedás al día?"
      );
      expect(url).toContain(encodeURIComponent(message));
    });

    it("genera URL de WhatsApp wa.me con template de Inactividad en tono de profesor argentino", () => {
      const { url, message } = generateWhatsAppArgentinoUrl({
        phone: "+54 9 11 9876-5432",
        studentName: "Sofía Rossi",
        type: "inactividad",
      });

      expect(url).toContain("https://wa.me/5491198765432?text=");
      expect(message).toBe(
        "Hola crack! Cómo va? Che, vi que hace unos días no te das una vuelta por el gym. Venís bien con los tiempos o querés que ajustemos la rutina?"
      );
      expect(url).toContain(encodeURIComponent(message));
    });

    it("genera URL de WhatsApp wa.me con template de Récord en tono de profesor argentino", () => {
      const { url, message } = generateWhatsAppArgentinoUrl({
        phone: "5491100001111",
        studentName: "Lucas Giménez",
        type: "record",
        exerciseName: "Press de Banca Plano",
      });

      expect(url).toContain("https://wa.me/5491100001111?text=");
      expect(message).toBe(
        "Hola Lucas Giménez! Tremendo el récord que clavaste en Press de Banca Plano, felicitaciones fiera! A seguir metiéndole 💪"
      );
      expect(url).toContain(encodeURIComponent(message));
    });

    it("integra WhatsAppTemplateModal con botones táctiles ≥ 48px y soporte para los 3 templates", () => {
      expect(whatsappContent).toContain("Templates WhatsApp (Coach Argentino)");
      expect(whatsappContent).toContain("min-h-12");
      expect(whatsappContent).toContain("btn-send-whatsapp-cuota");
      expect(whatsappContent).toContain("btn-send-whatsapp-inactividad");
      expect(whatsappContent).toContain("btn-send-whatsapp-record");
    });
  });

  // ==========================================================================
  // 5. MODAL DE QUICK SWAP (SUSTITUIR EJERCICIO ANTE DOLOR)
  // ==========================================================================
  describe("5. Modal de Quick Swap (Sustituir Ejercicio)", () => {
    it("provee alternativas pre-filtradas biomecánicamente seguras ante dolor articular", () => {
      expect(quickSwapContent).toContain("Sustituir Ejercicio por Molestia Articular");
      expect(quickSwapContent).toContain("Prensa de Piernas a 45°");
      expect(quickSwapContent).toContain("Hip Thrust con Barra");
      expect(quickSwapContent).toContain("Press con Mancuernas en Banco Plano (Agarre Neutro)");
      expect(quickSwapContent).toContain("Floor Press con Mancuernas");
    });

    it("posee botón 'Sustituir en 1-Toque' con touch target ≥ 48px", () => {
      expect(quickSwapContent).toContain("min-h-12");
      expect(quickSwapContent).toContain("Sustituir en 1-Toque");
    });
  });
});
