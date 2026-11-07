import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoCriticalAlerts } from "@/components/coach/critical-alerts-data";
import { etiquetaNivelDolor, tonoNivelDolor } from "@/lib/dolor";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-126 & GOZS-407 (FIX-04 / P07): Alertas de dolor, vocabulario EVA y único camino RPC", () => {
  const section = read("../components/coach/student-pain-alerts.tsx");
  const detail = read("../components/coach/student-detail.tsx");
  const view = read("../components/coach/coach-studio-view.tsx");
  const alertsData = read("../components/coach/critical-alerts-data.ts");
  const islaSalud = read("../components/coach/student-detail/islas/isla-salud-anamnesis.tsx");

  it("hay al menos un alumno demo con alertas, con detalle completo", () => {
    const alerts = getDemoCriticalAlerts();
    const celeste = alerts.filter((a) => a.alumnoId === "demo-alumno-02-celeste");
    expect(celeste.length).toBeGreaterThan(0);
    expect(celeste[0]?.zona).toBeTruthy();
    expect(celeste[0]?.detalle).toBeTruthy();
  });

  it("la sección solo se renderiza si el alumno tiene alertas", () => {
    expect(section).toContain("if (alerts.length === 0) return null;");
  });

  it("filtra por alumno_id y ordena pendientes primero", () => {
    expect(section).toContain("a.alumnoId === alumnoId");
    expect(section).toContain("Number(isPendiente(b)) - Number(isPendiente(a))");
  });

  it("ofrece Sustituir ejercicio (callback opcional) y estados con botones min-h-11", () => {
    expect(section).toContain("onQuickSwap?: (alert: CriticalAlert) => void");
    expect(section).toContain("Sustituir Ejercicio");
    expect(section).toContain("persistAlertEstado");
    expect(section.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2);
    for (const l of ["Pendiente", "Atendido", "Cerrado"]) expect(section).toContain(l);
  });

  it("student-detail monta la sección y coach-studio-view pasa el mismo Quick Swap", () => {
    expect(detail).toContain("<StudentPainAlerts alumnoId={alumno.id} onQuickSwap={onQuickSwap} />");
    expect(view).toMatch(/onQuickSwap=\{handleOpenQuickSwapFromAlert\}\s*\/>/);
  });

  it("FIX-04: persistAlertEstado e IslaSaludAnamnesis escriben exclusivamente por actualizarEstadoDolor con rollback y mensaje de error", () => {
    expect(alertsData).toContain("actualizarEstadoDolor");
    expect(alertsData).not.toMatch(/\.from\(["']alertas_entrenador["']\)\s*\.update/);
    expect(alertsData).not.toMatch(/\.from\(["']alumno_historial_dolor["']\)\s*\.update/);

    expect(section).toContain("No se pudo guardar. Reintentá.");
    expect(islaSalud).toContain("actualizarEstadoDolor");
    expect(islaSalud).toContain("No se pudo guardar. Reintentá.");
  });

  it("P07: etiquetaNivelDolor y tonoNivelDolor mapean vocabulario visible de dolor ('bajo' -> 'leve', 'medio' -> 'moderado', 'alto' -> 'alto')", () => {
    expect(etiquetaNivelDolor("bajo")).toBe("leve");
    expect(tonoNivelDolor("bajo")).toBe("neutral");

    expect(etiquetaNivelDolor("medio")).toBe("moderado");
    expect(tonoNivelDolor("medio")).toBe("warning");

    expect(etiquetaNivelDolor("alto")).toBe("alto");
    expect(tonoNivelDolor("alto")).toBe("danger");
  });
});
