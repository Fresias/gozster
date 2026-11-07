import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { COLOR_ACTIVIDAD } from "@/components/ui/days-strip";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

describe("GOZS-190 / GOZS-191 · Agenda de clases: tokens, cabecera y grilla horaria", () => {
  const globalsCss = readSource("../app/globals.css");
  const tailwindConfig = readSource("../../tailwind.config.ts");
  const daysStripSource = readSource("../components/ui/days-strip.tsx");
  const classAgendaSource = readSource("../components/coach/class-agenda.tsx");

  describe("Sección 2: Tokens de actividad deportiva y Tailwind", () => {
    it("globals.css define tokens día y noche para Funcional y Boxeo con contraste AA/AAA", () => {
      // Modo Día (:root)
      expect(globalsCss).toContain("--act-funcional-bg: 240 4.8% 95.9%;");
      expect(globalsCss).toContain("--act-funcional-border: 240 5.9% 90%;");
      expect(globalsCss).toContain("--act-funcional-fg: 204 80% 16%;");
      expect(globalsCss).toContain("--act-funcional-bar: 199 89% 48%;");
      expect(globalsCss).toContain("--act-boxeo-bg: 33 100% 96%;");
      expect(globalsCss).toContain("--act-boxeo-border: 32 98% 83%;");
      expect(globalsCss).toContain("--act-boxeo-fg: 15 75% 15%;");
      expect(globalsCss).toContain("--act-boxeo-bar: 25 95% 53%;");

      // Modo Noche (.dark)
      expect(globalsCss).toContain("--act-funcional-bg: 240 3.7% 15.9%;");
      expect(globalsCss).toContain("--act-funcional-border: 240 5.3% 26%;");
      expect(globalsCss).toContain("--act-funcional-fg: 204 94% 94%;");
      expect(globalsCss).toContain("--act-boxeo-bg: 21 75% 12%;");
      expect(globalsCss).toContain("--act-boxeo-border: 26 80% 30%;");
      expect(globalsCss).toContain("--act-boxeo-fg: 34 100% 92%;");
    });

    it("tailwind.config.ts expone act-funcional y act-boxeo con bg, fg y bar", () => {
      expect(tailwindConfig).toContain('"act-funcional":');
      expect(tailwindConfig).toContain('"act-boxeo":');
      expect(tailwindConfig).toContain("var(--act-funcional-bg)");
      expect(tailwindConfig).toContain("var(--act-funcional-fg)");
      expect(tailwindConfig).toContain("var(--act-funcional-bar)");
      expect(tailwindConfig).toContain("var(--act-boxeo-bg)");
      expect(tailwindConfig).toContain("var(--act-boxeo-fg)");
      expect(tailwindConfig).toContain("var(--act-boxeo-bar)");
    });

    it("COLOR_ACTIVIDAD migra a los tokens act-funcional y act-boxeo para compartir con Athlete App", () => {
      expect(COLOR_ACTIVIDAD.FUNCIONAL).toContain("bg-act-funcional-bg");
      expect(COLOR_ACTIVIDAD.FUNCIONAL).toContain("text-act-funcional-fg");
      expect(COLOR_ACTIVIDAD.FUNCIONAL).toContain("border-act-funcional-bar/30");

      expect(COLOR_ACTIVIDAD.BOXEO).toContain("bg-act-boxeo-bg");
      expect(COLOR_ACTIVIDAD.BOXEO).toContain("text-act-boxeo-fg");
      expect(COLOR_ACTIVIDAD.BOXEO).toContain("border-act-boxeo-bar/30");
    });
  });

  describe("Sección 4: Cabecera del calendario y navegación", () => {
    it("contiene título de mes, semana con rango en fuente mono y atajos de teclado", () => {
      expect(classAgendaSource).toContain("headerTitulo");
      expect(classAgendaSource).toContain("headerSubtitulo");
      expect(classAgendaSource).toContain("font-mono tabular-nums");
      expect(classAgendaSource).toContain("numeroSemanaIso");

      // Atajos de teclado T, D, S, M y flechas
      expect(classAgendaSource).toContain('key === "T"');
      expect(classAgendaSource).toContain('key === "D"');
      expect(classAgendaSource).toContain('key === "S"');
      expect(classAgendaSource).toContain('key === "M"');
      expect(classAgendaSource).toContain('key === "ArrowLeft"');
      expect(classAgendaSource).toContain('key === "ArrowRight"');
    });

    it("conserva data-testids oficiales en controles de cabecera", () => {
      expect(classAgendaSource).toContain('data-testid="view-day-btn"');
      expect(classAgendaSource).toContain('data-testid="view-week-btn"');
      expect(classAgendaSource).toContain('data-testid="view-month-btn"');
      expect(classAgendaSource).toContain('data-testid="create-class-btn"');
      expect(classAgendaSource).toContain('data-testid="demo-coach-badge"');
    });
  });

  describe("Sección 5: Grilla horaria semanal y banda colapsada", () => {
    it("renderiza columnas grid-cols-[56px_repeat(7,1fr)] y altura de 56px por hora", () => {
      expect(classAgendaSource).toContain("grid-cols-[56px_repeat(7,1fr)]");
      expect(classAgendaSource).toContain("h-[56px]");
    });

    it("resalta el día actual con pill azul bg-primary y fondo de columna bg-primary/5", () => {
      expect(classAgendaSource).toContain("bg-primary text-primary-foreground");
      expect(classAgendaSource).toContain("bg-primary/5");
    });

    it("implementa banda colapsada de 36px para tramos de >= 3h sin clases", () => {
      expect(classAgendaSource).toContain("h-[36px]");
      expect(classAgendaSource).toContain("repeating-linear-gradient");
      expect(classAgendaSource).toContain("count >= 3");
      expect(classAgendaSource).toContain("toggleGap");
      expect(classAgendaSource).toContain("sin clases");
    });

    it("renderiza la línea de ahora (h-0.5 bg-primary + dot 8px) solo en la columna de hoy", () => {
      expect(classAgendaSource).toContain("h-0.5 bg-primary");
      expect(classAgendaSource).toContain("h-2 w-2 rounded-full bg-primary");
      expect(classAgendaSource).toContain("topAhora");
      expect(classAgendaSource).toContain("esHoy && mostrarLineaAhora");
    });
  });

  describe("Sección 6: Componente ClaseBlock y solapes", () => {
    it("define ClaseBlock con soporte de estados Programada, Llena, Sobrecupo, Finalizada y Cancelada", () => {
      expect(classAgendaSource).toContain("export function ClaseBlock(");
      expect(classAgendaSource).toContain('data-testid="class-block-card"');
      expect(classAgendaSource).toContain("ocupados === capacidad");
      expect(classAgendaSource).toContain("ocupados > capacidad");
      expect(classAgendaSource).toContain("finClaseMs < ahoraMs");
      expect(classAgendaSource).toContain('clase.estado === "CANCELADA"');
      expect(classAgendaSource).toContain("ring-2 ring-primary ring-offset-1");
    });

    it("calcula solapes dividiendo columnas con detectarSolapes y elimina el emoji prohibido ⚡", () => {
      expect(classAgendaSource).toContain("detectarSolapes");
      expect(classAgendaSource).toContain("solape.totalColumnas > 1");
      expect(classAgendaSource).not.toContain("⚡");
    });
  });

  describe("Sección 7: Vista Día", () => {
    it("presenta grilla en 1 columna con barra de ocupación (línea 3) y panel de detalle", () => {
      expect(classAgendaSource).toContain('vista === "dia"');
      expect(classAgendaSource).toContain("grid-cols-[56px_1fr]");
      expect(classAgendaSource).toContain("h-1.5 w-full rounded-full");
      expect(classAgendaSource).toContain('data-testid="class-detail"');
    });
  });
});
