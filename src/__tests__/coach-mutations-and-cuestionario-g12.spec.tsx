import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GOZS-929 (G5/G12): los errores reales de Supabase al mutar ejercicios, al hacer Quick Swap
 * y al leer el cuestionario inicial se muestran al coach y se reportan, sin cerrar el diálogo
 * ni fingir éxito ni disfrazarse de "estado vacío".
 */

const sb = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  createClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: (row: unknown) => sb.insert(row),
      update: (row: unknown) => ({ eq: (_c: string, id: string) => sb.update(row, id) }),
      delete: () => ({ eq: (_c: string, id: string) => sb.delete(id) }),
    }),
  }),
}));

const reportar = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/reportar-error-app", () => ({ reportarErrorApp: reportar }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/studio",
  useSearchParams: () => new URLSearchParams(),
}));

import { EjerciciosLibraryTab } from "@/components/coach/ejercicios-library-tab";
import { QuickSwapModal } from "@/components/coach/quick-swap-modal";
import { StudentDetail } from "@/components/coach/student-detail";
import { supabase } from "@/lib/supabase/client";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { fireEvent, render } from "@/test-utils/no-demo-literals";
import type { AlumnoCuestionarioInicial, Ejercicio, Perfil } from "@/types/database.types";

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

const ejercicio = (id: string, nombre: string): Ejercicio => ({
  id,
  nombre,
  musculos_principales: ["Pecho"],
  musculos_secundarios: [],
  url_video: null,
  comentario: null,
  usa_barra: false,
  creado_por: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

const pgError = { code: "42501", message: "new row violates row-level security policy" };

beforeEach(() => {
  vi.clearAllMocks();
  sb.insert.mockResolvedValue({ data: null, error: null });
  sb.update.mockResolvedValue({ data: null, error: null });
  sb.delete.mockResolvedValue({ data: null, error: null });
});

describe("EjerciciosLibraryTab: errores reales al crear/editar/eliminar (G12)", () => {
  const catalogo = [ejercicio("ej-1", "Press Banca"), ejercicio("ej-2", "Curl Bíceps")];

  function abrirCrear(props: Partial<React.ComponentProps<typeof EjerciciosLibraryTab>> = {}) {
    const r = render(<EjerciciosLibraryTab ejercicios={catalogo} ejerciciosEnRutina={[]} {...props} />);
    fireEvent.click(r.getByTestId("btn-nuevo-ejercicio"));
    fireEvent.change(r.getByTestId("input-ejercicio-nombre"), { target: { value: "Hip Thrust" } });
    return r;
  }

  it.each([
    ["error de PostgREST", () => sb.insert.mockResolvedValueOnce({ data: null, error: pgError })],
    ["rechazo de red", () => sb.insert.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
  ])("al crear con %s NO llama onEjercicioCreated, mantiene el diálogo y muestra alerta; reintento OK cierra", async (_n, falla) => {
    falla();
    const onCreated = vi.fn();
    const r = abrirCrear({ onEjercicioCreated: onCreated });

    fireEvent.click(r.getByTestId("btn-guardar-ejercicio"));
    await flush();

    expect(onCreated).not.toHaveBeenCalled();
    expect(r.queryByTestId("dialog-ejercicio")).toBeTruthy();
    const alerta = r.getByRole("alert");
    expect(alerta.textContent).toContain("No pudimos guardar el ejercicio");
    expect(alerta.textContent).not.toContain("row-level security");
    expect(reportar).toHaveBeenCalledWith(expect.objectContaining({ contexto: "coach.ejercicios.guardar" }));

    fireEvent.click(r.getByTestId("btn-guardar-ejercicio"));
    await flush();
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(r.queryByTestId("dialog-ejercicio")).toBeNull();
  });

  it.each([
    ["error de PostgREST", () => sb.update.mockResolvedValueOnce({ data: null, error: pgError })],
    ["rechazo de red", () => sb.update.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
  ])("al editar con %s NO llama onEjercicioUpdated y deja el diálogo abierto con alerta", async (_n, falla) => {
    falla();
    const onUpdated = vi.fn();
    const r = render(
      <EjerciciosLibraryTab ejercicios={catalogo} ejerciciosEnRutina={[]} onEjercicioUpdated={onUpdated} />,
    );
    fireEvent.click(r.getByTestId("btn-editar-ejercicio-ej-1"));
    fireEvent.click(r.getByTestId("btn-guardar-ejercicio"));
    await flush();

    expect(onUpdated).not.toHaveBeenCalled();
    expect(r.queryByTestId("dialog-ejercicio")).toBeTruthy();
    expect(r.getByRole("alert").textContent).toContain("No pudimos guardar el ejercicio");

    fireEvent.click(r.getByTestId("btn-guardar-ejercicio"));
    await flush();
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(r.queryByTestId("dialog-ejercicio")).toBeNull();
  });

  it.each([
    ["error de PostgREST", () => sb.delete.mockResolvedValueOnce({ data: null, error: pgError })],
    ["rechazo de red", () => sb.delete.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
  ])("al eliminar con %s NO llama onEjercicioDeleted, mantiene la confirmación y muestra ejercicios-delete-error", async (_n, falla) => {
    falla();
    const onDeleted = vi.fn();
    const r = render(
      <EjerciciosLibraryTab ejercicios={catalogo} ejerciciosEnRutina={[]} onEjercicioDeleted={onDeleted} />,
    );
    fireEvent.click(r.getByTestId("btn-eliminar-ejercicio-ej-2"));
    fireEvent.click(r.getByTestId("btn-confirmar-eliminar"));
    await flush();

    expect(onDeleted).not.toHaveBeenCalled();
    expect(r.queryByTestId("modal-confirmar-eliminar-ejercicio")).toBeTruthy();
    const alerta = r.getByTestId("ejercicios-delete-error");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain("No pudimos eliminar el ejercicio");
    expect(reportar).toHaveBeenCalledWith(expect.objectContaining({ contexto: "coach.ejercicios.eliminar" }));

    fireEvent.click(r.getByTestId("btn-confirmar-eliminar"));
    await flush();
    expect(onDeleted).toHaveBeenCalledWith("ej-2");
    expect(r.queryByTestId("modal-confirmar-eliminar-ejercicio")).toBeNull();
  });
});

describe("QuickSwapModal: la sustitución solo se aplica si la RPC la confirma (G12)", () => {
  const ALT = "Prensa de Piernas a 45°";
  const altBtn = `confirm-swap-btn-${ALT.toLowerCase().replace(/\s+/g, "-")}`;
  const catalogo = [ejercicio("11111111-1111-4111-8111-111111111111", ALT)];

  function abrir(cat: Ejercicio[] = catalogo) {
    const onSwapSuccess = vi.fn();
    const onClose = vi.fn();
    const r = render(
      <QuickSwapModal
        isOpen
        onClose={onClose}
        alumnoNombre="Alumno"
        alumnoId="al-1"
        ejercicioActual="Sentadilla Libre"
        ejercicioEnRutinaId="22222222-2222-4222-8222-222222222222"
        catalogoEjercicios={cat}
        onSwapSuccess={onSwapSuccess}
      />,
    );
    return { r, onSwapSuccess, onClose };
  }

  it.each([
    ["error de la RPC", () => ({ data: null, error: pgError })],
    ["rechazo de red", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("con %s NO llama onSwapSuccess, no cierra y muestra quick-swap-error", async (_n, respuesta) => {
    const rpc = vi.spyOn(supabase, "rpc").mockImplementation((() => respuesta()) as any);
    const { r, onSwapSuccess, onClose } = abrir();

    fireEvent.click(r.getByTestId(altBtn));
    await flush();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(onSwapSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    const alerta = r.getByTestId("quick-swap-error");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain("No pudimos guardar la sustitución");
    expect(reportar).toHaveBeenCalledWith(expect.objectContaining({ contexto: "coach.quick_swap" }));
  });

  it("con la alternativa fuera del catálogo NO llama a la RPC con un UUID ficticio ni cierra", async () => {
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);
    const { r, onSwapSuccess, onClose } = abrir([]);

    fireEvent.click(r.getByTestId(altBtn));
    await flush();

    expect(rpc).not.toHaveBeenCalled();
    expect(onSwapSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(r.getByTestId("quick-swap-error").textContent).toContain("no está en tu catálogo");
  });

  it("con ejercicio real del catálogo invoca la RPC con su id, onSwapSuccess y onClose", async () => {
    const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null } as any);
    const { r, onSwapSuccess, onClose } = abrir();

    fireEvent.click(r.getByTestId(altBtn));
    await flush();

    expect(rpc).toHaveBeenCalledWith(
      "quick_swap_ejercicio",
      expect.objectContaining({ p_nuevo_ejercicio_id: catalogo[0]!.id }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("30000000-0000-0000-0000-000000000002");
    expect(onSwapSuccess).toHaveBeenCalledWith("Sentadilla Libre", ALT, expect.any(String));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(r.queryByTestId("quick-swap-error")).toBeNull();
  });
});

describe("StudentDetail: fallo al leer alumno_cuestionario_inicial en modo live (G5/G12)", () => {
  const ALUMNO_ID = "55555555-5555-4555-8555-555555555555";
  const alumno: Perfil = {
    id: ALUMNO_ID,
    nombre_completo: "Alumno Real",
    email: "alumno.real@ficticio.ar",
    telefono: null,
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: null,
    fecha_baja: null,
    fecha_vencimiento_cuota: null,
    ultimo_entreno_at: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  } as Perfil;

  const cuestionarioReal = {
    id: "cq-1",
    alumno_id: ALUMNO_ID,
    objetivo_principal: "Ganar fuerza real",
    experiencia_previa: "1 año",
    dias_disponibles_semana: 3,
    equipamiento_disponible: "Gimnasio",
    molestias_o_lesiones_previas: "Ninguna reportada",
    respuestas_extra: null,
    completado_at: "2026-10-02T10:00:00Z",
    created_at: "2026-10-02T10:00:00Z",
    updated_at: "2026-10-02T10:00:00Z",
  } as unknown as AlumnoCuestionarioInicial;

  /** Responde cada lectura de alumno_cuestionario_inicial con la siguiente respuesta de la cola. */
  function mockCuestionario(respuestas: Array<() => Promise<unknown>>) {
    const lecturas = vi.fn();
    vi.spyOn(supabase, "from").mockImplementation(((tabla: string) => {
      const builder: any = {};
      for (const m of ["select", "eq", "in", "gte", "order", "limit", "or", "neq", "is"]) builder[m] = () => builder;
      builder.then = (ok: any, ko: any) => Promise.resolve({ data: [], error: null }).then(ok, ko);
      if (tabla === "alumno_cuestionario_inicial") {
        builder.maybeSingle = () => {
          lecturas();
          const next = respuestas.shift() ?? (() => Promise.resolve({ data: null, error: null }));
          return next();
        };
      } else {
        builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
        builder.single = () => Promise.resolve({ data: null, error: null });
      }
      return builder;
    }) as any);
    return lecturas;
  }

  async function renderFicha() {
    const r = render(
      <StudentDetail
        alumno={alumno}
        activeTab="rutina_actual"
        onTabChange={vi.fn()}
        onBack={vi.fn()}
        rutinaActiva={null}
        historialPlanes={[]}
        dias={[]}
        ejerciciosEnRutina={[]}
        ejerciciosCatalogo={[]}
        onOpenHistoricalLoads={vi.fn()}
        onClonarUltimaRutina={vi.fn().mockResolvedValue(null)}
        isOffline={false}
      />,
    );
    await flush();
    return r;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    useCoachStudioStore.setState({ isLiveDatabase: true });
  });

  it.each([
    ["error de PostgREST", () => Promise.resolve({ data: null, error: pgError })],
    ["rechazo de red", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("con %s muestra coach-cuestionario-error (sin vacío falso ni demo) y Reintentar recupera el real", async (_n, falla) => {
    const lecturas = mockCuestionario([falla, () => Promise.resolve({ data: cuestionarioReal, error: null })]);
    const r = await renderFicha();

    const alerta = r.getByTestId("coach-cuestionario-error");
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).not.toContain("row-level security");
    expect(r.queryByTestId("coach-cuestionario-empty")).toBeNull();
    expect(r.container.textContent).not.toContain("Hipertrofia y Fuerza");
    expect(reportar).toHaveBeenCalledWith(
      expect.objectContaining({ contexto: "coach.student_detail.cuestionario" }),
    );

    fireEvent.click(r.getByTestId("btn-reintentar-cuestionario"));
    await flush();

    expect(lecturas).toHaveBeenCalledTimes(2);
    expect(r.queryByTestId("coach-cuestionario-error")).toBeNull();
    expect(r.getByTestId("coach-cuestionario-objetivo").textContent).toContain("Ganar fuerza real");
  });

  it("con { data: null, error: null } mantiene el estado vacío real", async () => {
    mockCuestionario([() => Promise.resolve({ data: null, error: null })]);
    const r = await renderFicha();

    expect(r.getByTestId("coach-cuestionario-empty")).toBeTruthy();
    expect(r.queryByTestId("coach-cuestionario-error")).toBeNull();
    expect(reportar).not.toHaveBeenCalled();
  });
});
