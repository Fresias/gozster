import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getDemoCriticalAlerts } from "@/components/coach/critical-alerts-data";
import { applyDemoEstados, useDemoAlertEstados } from "@/components/coach/critical-alerts-store";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-134: layout KPIs + bandeja arriba, Alumnos a todo el ancho", () => {
  const shell = read("../components/coach/studio-shell.tsx");
  const inbox = read("../components/coach/critical-alerts-inbox.tsx");
  const view = read("../components/coach/coach-studio-view.tsx");

  beforeEach(() => useDemoAlertEstados.setState({ estados: {} }));

  it("main ancho, grilla de dos columnas y tabla a todo el ancho", () => {
    expect(shell).toContain("max-w-[1280px]");
    expect(shell).not.toContain("max-w-7xl");
    expect(view).toContain("grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]");
    expect(view).toContain('className="xl:col-span-2"');
    expect(view).toContain("relative self-stretch");
    expect(view).not.toContain("items-start xl:grid-cols");
  });

  it("bandeja absoluta desde xl, scroll interno accesible y degradado condicional", () => {
    expect(inbox).toContain("xl:absolute xl:inset-x-0 xl:top-0 xl:max-h-full flex flex-col");
    expect(inbox).toContain("max-h-80 xl:max-h-none overflow-y-auto overscroll-contain");
    expect(inbox).toContain("tabIndex={0}");
    expect(inbox).toContain('aria-label="Alertas pendientes"');
    expect(inbox).toContain("scrollTop + el.clientHeight < el.scrollHeight");
    expect(inbox).toContain("{hasHiddenBelow && (");
    expect(inbox).toContain("bg-gradient-to-t from-card");
  });

  it("sin alertas pendientes: la celda 2 desaparece y los KPIs ocupan las dos columnas", () => {
    expect(view).toContain('hasPendingAlerts ? "xl:col-start-1" : "xl:col-span-2"');
    expect(view).toContain("hasPendingAlerts && (");
    const demo = getDemoCriticalAlerts();
    for (const a of demo) useDemoAlertEstados.getState().setEstado(a.id, "ATENDIDO");
    const pendientes = applyDemoEstados(demo, useDemoAlertEstados.getState().estados).filter(
      (a) => a.type === "DOLOR" && (a.estado || "PENDIENTE") === "PENDIENTE"
    );
    expect(pendientes.length).toBe(0);
  });
});
