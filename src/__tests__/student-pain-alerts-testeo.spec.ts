import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoCriticalAlerts } from "@/components/coach/critical-alerts-data";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-126: ficha del alumno con Alertas de dolor (Modo Testeo)", () => {
  const section = read("../components/coach/student-pain-alerts.tsx");
  const detail = read("../components/coach/student-detail.tsx");
  const view = read("../components/coach/coach-studio-view.tsx");

  it("hay al menos un alumno demo con alertas, con detalle completo", () => {
    const alerts = getDemoCriticalAlerts();
    const celeste = alerts.filter((a) => a.alumnoId === "demo-alumno-02-celeste");
    expect(celeste.length).toBeGreaterThan(0);
    expect(celeste[0]?.zona).toBeTruthy();
    expect(celeste[0]?.detalle).toBeTruthy();
  });

  it("la sección solo se renderiza en Testeo y si el alumno tiene alertas", () => {
    expect(section).toContain('useWorkspaceModeStore().mode === "TESTEO"');
    expect(section).toContain("if (!isTesteo || alerts.length === 0) return null;");
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
});
