import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface AthleteStoreMockState {
  nivelVistaAlumno: "SIMPLE" | "COMPLETA";
  miProgreso: null;
  miProgresoFecha: string | null;
  cargandoMiProgreso: boolean;
  cargarMiProgreso: ReturnType<typeof vi.fn>;
  diamantesRacha: number;
  cargarLogrosRacha: ReturnType<typeof vi.fn>;
  planAlumno: {
    alumnos: Array<{ id: string; ultimo_entreno_at?: string | null }>;
    planes: Array<{ id: string }>;
    dias: Array<{ id: string; plan_id: string }>;
  } | null;
  cargarPlanAlumno: ReturnType<typeof vi.fn>;
  fechasSesionesServidor: string[];
  sesionesCompletadas: Array<{ fecha: string }>;
  historialSesiones: Array<{ sesion?: { fecha?: string } }>;
}

interface ClasesStoreMockState {
  resumenClases: { racha_semanas?: number } | null;
  membresia: null;
  plan: null;
  contratacionesAlumno: unknown[];
  actividadesAlumno: unknown[];
  actividadesHabilitadas: string[];
  cargarClasesAlumno: ReturnType<typeof vi.fn>;
}

interface RankingStoreMockState {
  rankingAlumno: unknown[];
  cargarRankingAlumno: ReturnType<typeof vi.fn>;
  sincronizarMarcasPendientes: ReturnType<typeof vi.fn>;
}

interface OfflineStoreMockState {
  isOnline: boolean;
}

const mockState = vi.hoisted(() => {
  const athlete: AthleteStoreMockState = {
    nivelVistaAlumno: "SIMPLE",
    miProgreso: null,
    miProgresoFecha: null,
    cargandoMiProgreso: false,
    cargarMiProgreso: vi.fn().mockResolvedValue(undefined),
    diamantesRacha: 0,
    cargarLogrosRacha: vi.fn().mockResolvedValue(undefined),
    planAlumno: null,
    cargarPlanAlumno: vi.fn().mockResolvedValue(undefined),
    fechasSesionesServidor: [],
    sesionesCompletadas: [],
    historialSesiones: [],
  };

  const clases: ClasesStoreMockState = {
    resumenClases: null,
    membresia: null,
    plan: null,
    contratacionesAlumno: [],
    actividadesAlumno: [],
    actividadesHabilitadas: [],
    cargarClasesAlumno: vi.fn().mockResolvedValue(undefined),
  };

  const ranking: RankingStoreMockState = {
    rankingAlumno: [],
    cargarRankingAlumno: vi.fn().mockResolvedValue(undefined),
    sincronizarMarcasPendientes: vi.fn().mockResolvedValue(undefined),
  };

  const offline: OfflineStoreMockState = {
    isOnline: true,
  };

  return { athlete, clases, ranking, offline };
});

vi.mock("@/store/use-athlete-store", () => ({
  useAthleteStore: (selector: (s: AthleteStoreMockState) => unknown) => selector(mockState.athlete),
}));

vi.mock("@/store/use-clases-store", () => ({
  useClasesStore: (selector: (s: ClasesStoreMockState) => unknown) => selector(mockState.clases),
}));

vi.mock("@/store/use-ranking-store", () => ({
  useRankingStore: (selector: (s: RankingStoreMockState) => unknown) => selector(mockState.ranking),
}));

vi.mock("@/store/use-offline-queue", () => ({
  useOfflineQueueStore: (selector: (s: OfflineStoreMockState) => unknown) => selector(mockState.offline),
}));

import AthleteProgresoPage from "@/app/(athlete)/athlete/progreso/page";

function montarConHooks(Component: () => React.ReactNode) {
  const effectDeps: Array<unknown[] | undefined> = [];
  const memoEntries: Array<{ value: unknown; deps?: unknown[] }> = [];

  function render() {
    const internals = (React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown };
    }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prev = internals.H;
    let effectIndex = 0;
    let memoIndex = 0;

    internals.H = {
      useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
        const idx = effectIndex++;
        const prevDeps = effectDeps[idx];
        const changed =
          !prevDeps ||
          !deps ||
          deps.length !== prevDeps.length ||
          deps.some((d, i) => !Object.is(d, prevDeps[i]));
        if (changed) {
          effectDeps[idx] = deps ? [...deps] : undefined;
          fn();
        }
      },
      useMemo: <T,>(factory: () => T, deps?: unknown[]): T => {
        const idx = memoIndex++;
        const existing = memoEntries[idx];
        const changed =
          !existing ||
          !existing.deps ||
          !deps ||
          deps.length !== existing.deps.length ||
          deps.some((d, i) => !Object.is(d, existing.deps![i]));
        if (changed) {
          const value = factory();
          memoEntries[idx] = { value, deps: deps ? [...deps] : undefined };
          return value;
        }
        return existing.value as T;
      },
    };

    try {
      return Component();
    } finally {
      internals.H = prev;
    }
  }

  return { render };
}

const PLAN_ALUMNO_HIDRATADO = {
  alumnos: [{ id: "alu-1", ultimo_entreno_at: null }],
  planes: [{ id: "plan-1" }],
  dias: [
    { id: "dia-1", plan_id: "plan-1" },
    { id: "dia-2", plan_id: "plan-1" },
    { id: "dia-3", plan_id: "plan-1" },
  ],
};

describe("GOZS-857: Deep-link /athlete/progreso hidrata planAlumno cuando falta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.offline.isOnline = true;
    mockState.athlete.planAlumno = null;
    mockState.athlete.fechasSesionesServidor = [];
    mockState.athlete.sesionesCompletadas = [];
    mockState.athlete.historialSesiones = [];
    mockState.clases.actividadesHabilitadas = [];
  });

  it("con isOnline=true y planAlumno=null invoca cargarPlanAlumno() al montar", () => {
    const mounted = montarConHooks(AthleteProgresoPage);
    mounted.render();

    expect(mockState.athlete.cargarPlanAlumno).toHaveBeenCalledTimes(1);
    expect(mockState.athlete.cargarMiProgreso).toHaveBeenCalledTimes(1);
    expect(mockState.clases.cargarClasesAlumno).toHaveBeenCalledTimes(1);
    expect(mockState.athlete.cargarLogrosRacha).toHaveBeenCalledTimes(1);
  });

  it("con isOnline=false y planAlumno=null NO invoca cargarPlanAlumno() ni otros fetches online", () => {
    mockState.offline.isOnline = false;
    const mounted = montarConHooks(AthleteProgresoPage);
    mounted.render();

    expect(mockState.athlete.cargarPlanAlumno).not.toHaveBeenCalled();
    expect(mockState.athlete.cargarMiProgreso).not.toHaveBeenCalled();
    expect(mockState.clases.cargarClasesAlumno).not.toHaveBeenCalled();
    expect(mockState.athlete.cargarLogrosRacha).not.toHaveBeenCalled();
  });

  it("con isOnline=true y planAlumno ya hidratado NO hace refetch innecesario de cargarPlanAlumno()", () => {
    mockState.athlete.planAlumno = PLAN_ALUMNO_HIDRATADO;
    mockState.athlete.fechasSesionesServidor = [new Date().toISOString()];
    const mounted = montarConHooks(AthleteProgresoPage);
    const element = mounted.render() as React.ReactElement<{ cumplimientoPct: number | null }>;

    expect(mockState.athlete.cargarPlanAlumno).not.toHaveBeenCalled();
    expect(mockState.athlete.cargarMiProgreso).toHaveBeenCalledTimes(1);
    expect(element.props.cumplimientoPct).not.toBeNull();
  });

  it("al volver online con planAlumno=null llama cargarPlanAlumno() una vez y no lo repite tras hidratarse", () => {
    mockState.offline.isOnline = false;
    const mounted = montarConHooks(AthleteProgresoPage);
    mounted.render();
    expect(mockState.athlete.cargarPlanAlumno).not.toHaveBeenCalled();

    mockState.offline.isOnline = true;
    mounted.render();
    expect(mockState.athlete.cargarPlanAlumno).toHaveBeenCalledTimes(1);

    mockState.athlete.planAlumno = PLAN_ALUMNO_HIDRATADO;
    mounted.render();
    expect(mockState.athlete.cargarPlanAlumno).toHaveBeenCalledTimes(1);
  });
});
