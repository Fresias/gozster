import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const reportarErrorAppMock = vi.hoisted(() => vi.fn(async () => true));
const asignarSuscripcionYCobroMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/reportar-error-app", () => ({ reportarErrorApp: reportarErrorAppMock }));
vi.mock("@/services/cobros-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/cobros-service")>();
  return { ...actual, asignarSuscripcionYCobro: asignarSuscripcionYCobroMock };
});
// SSR (React 19): leer el estado vigente del store en vez del snapshot inicial.
vi.mock("@/store/use-coach-studio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/use-coach-studio")>();
  const real = actual.useCoachStudioStore;
  const hook = Object.assign(
    (selector?: (s: ReturnType<typeof real.getState>) => unknown) =>
      selector ? selector(real.getState()) : real.getState(),
    real,
  );
  return { ...actual, useCoachStudioStore: hook };
});

import {
  AltaExitosaResumen,
  aplicarResultadoPostAlta,
  persistirDatosPostAlta,
  type AltaExitosa,
  type DatosPostAlta,
} from "@/components/coach/invite-student-modal";
import { IslaRoutineWorkbench } from "@/components/coach/student-detail/islas/isla-routine-workbench";
import { useClasesStore } from "@/store/use-clases-store";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";

const ALUMNO_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const BASE: AltaExitosa = {
  alumno_id: ALUMNO_ID,
  email: "nuevo@alumno.test",
  password_temporal: "Temp-9xQ2",
  email_enviado: false,
  mensaje: "Alumno creado.",
};

const DATOS: DatosPostAlta = {
  alumnoId: ALUMNO_ID,
  alumnoNombre: "Alumno Nuevo",
  alumnoEmail: "nuevo@alumno.test",
  alumnoTelefono: null,
  sexo: "F",
  pesoNum: 62,
  actividades: [{ actividad: "FUNCIONAL", veces_por_semana: 2, pase_libre: false }],
  clasesFijas: [
    { id: "horario-func-lun-18", actividad: "FUNCIONAL", dia_semana: 1, dia_nombre: "Lunes", hora_inicio: "18:00" },
  ],
  monto: 25000,
  pagado: true,
  medioPago: "TRANSFERENCIA",
  nota: null,
  planId: null,
  planNombre: null,
};

function fakeSupabase(opts: { perfilError?: unknown; actividadesError?: unknown } = {}) {
  const eq = vi.fn(async () => ({ error: opts.perfilError ?? null }));
  const update = vi.fn(() => ({ eq }));
  const upsert = vi.fn(async () => ({ error: opts.actividadesError ?? null }));
  return {
    client: { from: vi.fn((t: string) => (t === "perfiles" ? { update } : { upsert })) } as any,
    update,
    upsert,
  };
}

async function altaRenderizada(supabase: any) {
  const resultado = await persistirDatosPostAlta(supabase, DATOS);
  const alta = aplicarResultadoPostAlta(BASE, DATOS, resultado);
  return { resultado, html: renderToStaticMarkup(<AltaExitosaResumen alta={alta} />) };
}

function expectCredenciales(html: string) {
  expect(html).toContain('data-testid="alta-alumno-success"');
  expect(html).toContain("nuevo@alumno.test");
  expect(html).toContain("Temp-9xQ2");
}

function bloqueAdvertencias(html: string): string {
  const m = html.match(/<div[^>]*data-testid="alta-alumno-advertencias"[^>]*>[\s\S]*?<\/ul>/);
  expect(m, "debe renderizar alta-alumno-advertencias").not.toBeNull();
  expect(m![0]).toContain('role="alert"');
  return m![0];
}

describe("GOZS-935 · G12: Alta de alumno con persistencia parcial", () => {
  beforeEach(() => {
    reportarErrorAppMock.mockClear();
    asignarSuscripcionYCobroMock.mockReset();
    asignarSuscripcionYCobroMock.mockResolvedValue({ cobro_id: "cobro-1" });
    useClasesStore.setState({ asignarClaseFija: vi.fn(async () => true) } as any);
    useCobrosStore.setState({
      cargarCobros: vi.fn(async () => {}),
      cobros: [{ id: "cobro-1" }],
      registrarCobroInicial: vi.fn(async () => ({})),
    } as any);
  });

  it("Caso 1: GIVEN alta 201 WHEN perfiles.update devuelve { error } THEN muestra credenciales y advertencia de perfil", async () => {
    const { client } = fakeSupabase({ perfilError: { message: "permission denied" } });
    const { html, resultado } = await altaRenderizada(client);

    expectCredenciales(html);
    expect(bloqueAdvertencias(html)).toContain("No pudimos guardar el sexo/peso en el perfil.");
    expect(html).toContain("Podés completarlos desde la ficha del alumno.");
    expect(resultado.advertencias).toHaveLength(1);
    expect(reportarErrorAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contexto: "alta_alumno_post_creacion",
        payloadResumen: expect.objectContaining({ paso: "perfil" }),
      }),
    );
  });

  it("Caso 2: GIVEN alta 201 WHEN alumno_actividades.upsert devuelve { error } THEN avisa y NO muestra actividades como guardadas", async () => {
    const { client } = fakeSupabase({ actividadesError: { message: "violates check constraint" } });
    const { html, resultado } = await altaRenderizada(client);

    expectCredenciales(html);
    expect(bloqueAdvertencias(html)).toContain("No pudimos guardar las actividades seleccionadas.");
    expect(resultado.actividadesGuardadas).toBe(false);
    expect(html).not.toContain('data-testid="alta-success-actividades"');
  });

  it("Caso 2b: GIVEN alta 201 WHEN asignarClaseFija devuelve false THEN avisa y NO muestra esa clase fija", async () => {
    useClasesStore.setState({ asignarClaseFija: vi.fn(async () => false), error: "RPC caída" } as any);
    const { client } = fakeSupabase();
    const { html } = await altaRenderizada(client);

    expectCredenciales(html);
    expect(bloqueAdvertencias(html)).toContain("No pudimos asignar las clases fijas (Lunes 18:00 hs).");
    expect(html).not.toContain('data-testid="alta-success-clases-fijas"');
  });

  it("Caso 3: GIVEN alta 201 WHEN asignarSuscripcionYCobro lanza THEN avisa del cobro (sin quedar solo en console.warn) y no lo muestra registrado", async () => {
    asignarSuscripcionYCobroMock.mockRejectedValue(new Error("rpc asignar_suscripcion_y_cobro falló"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeSupabase();
    const { html, resultado } = await altaRenderizada(client);

    expectCredenciales(html);
    expect(bloqueAdvertencias(html)).toContain("No pudimos registrar el cobro inicial.");
    expect(resultado.cobroRegistrado).toBe(false);
    expect(html).not.toContain('data-testid="alta-success-cobro"');
    expect(reportarErrorAppMock).toHaveBeenCalledWith(
      expect.objectContaining({ payloadResumen: expect.objectContaining({ paso: "cobro_inicial" }) }),
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("Caso 4: GIVEN alta 201 WHEN todo se guarda THEN muestra todas las secciones confirmadas y sin advertencias", async () => {
    const { client, update, upsert } = fakeSupabase();
    const { html, resultado } = await altaRenderizada(client);

    expectCredenciales(html);
    expect(update).toHaveBeenCalledWith({ sexo: "F", peso_corporal_kg: 62 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(resultado.advertencias).toEqual([]);
    expect(html).not.toContain('data-testid="alta-alumno-advertencias"');
    expect(html).toContain('data-testid="alta-success-actividades"');
    expect(html).toContain('data-testid="alta-success-clases-fijas"');
    expect(html).toContain('data-testid="alta-success-cobro"');
    expect(reportarErrorAppMock).not.toHaveBeenCalled();
  });
});

describe("GOZS-935 · G5: IslaRoutineWorkbench sin alertas demo en modo live", () => {
  const rutina = { id: "plan-1", nombre: "Plan Torso", estado: "ACTIVO" } as any;
  const dias = [{ id: "dia-1", plan_id: "plan-1", nombre: "Día 1", orden: 1 }] as any;
  const catalogo = [{ id: "ej-banca", nombre: "Press de banca plano" }] as any;
  const ejercicios = [
    { id: "er-banca", dia_id: "dia-1", ejercicio_id: "ej-banca", orden: 1, series: 4, repeticiones: "8", descanso_segundos: 120 },
  ] as any;
  // Marcadores con que la isla pinta la alerta demo "demo-alert-lucas-hombro".
  const DEMO_DETALLE = "Dolor de hombro activo";
  const AVISO_FILA = "alerta de dolor activa";

  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      <IslaRoutineWorkbench
        rutinaActiva={rutina}
        dias={dias}
        ejerciciosEnRutina={ejercicios}
        ejerciciosCatalogo={catalogo}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        {...props}
      />,
    );

  it("Caso 5: GIVEN alumno demo WHEN isLiveDatabase pasa de false a true THEN deja de resolver DEMO_CRITICAL_ALERTS / Lucas Giménez", () => {
    useCoachStudioStore.setState({ isLiveDatabase: false } as any);
    const demo = render({ alumnoId: "demo-alumno-01-lucas", alertasDolor: [] });
    // Control: en modo demo la alerta demo sí aparece (prueba que el test es sensible).
    expect(demo).toContain(DEMO_DETALLE);
    expect(demo).toContain(AVISO_FILA);

    useCoachStudioStore.setState({ isLiveDatabase: true } as any);
    const live = render({ alumnoId: "demo-alumno-01-lucas", alertasDolor: [] });
    expect(live).not.toContain(DEMO_DETALLE);
    expect(live).not.toContain(AVISO_FILA);
    expect(live).not.toContain("Lucas Giménez");
  });

  it("Caso 5b: GIVEN alumno UUID real sin molestias THEN no muestra alertas ni nombres demo aunque isLiveDatabase sea false", () => {
    useCoachStudioStore.setState({ isLiveDatabase: false } as any);
    const html = render({ alumnoId: ALUMNO_ID, alumnoNombre: "Lucas Giménez", alertasDolor: [] });
    expect(html).not.toContain(DEMO_DETALLE);
    expect(html).not.toContain(AVISO_FILA);
  });

  it("Caso 5c: getExercisePainAlert recalcula cuando cambian isLiveDatabase o isUuidAlumno (sin stale closure)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/coach/student-detail/islas/isla-routine-workbench.tsx"),
      "utf8",
    );
    const deps = src.match(/const getExercisePainAlert = React\.useCallback\([\s\S]*?\n\s*\[([^\]]*)\]\s*\n\s*\);/);
    expect(deps).not.toBeNull();
    expect(deps![1]).toMatch(/\bisLiveDatabase\b/);
    expect(deps![1]).toMatch(/\bisUuidAlumno\b/);
  });
});
