import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  entrenadoresCompartidosDePlan,
  entrenadoresElegiblesParaCompartir,
  esPlantillaCompartidaSoloLectura,
  nombreAutorPlantilla,
  separarPlantillasPorOrigen,
} from "@/lib/rutinas-biblioteca";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type {
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  EntrenadorStaff,
  Perfil,
  PlanCompartido,
  PlanEntrenamiento,
} from "@/types/database.types";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";

const mocks = vi.hoisted(() => ({
  fetchLiveDatasetFromSupabase: vi.fn(),
  asignarRutinaAAlumno: vi.fn(),
  compartirPlantillaConEntrenador: vi.fn(),
  revocarPlantillaCompartida: vi.fn(),
  duplicarPlantillaAMisPlantillas: vi.fn(),
  eliminarPlantillaPropia: vi.fn(),
  activarRutina: vi.fn(),
  archivarRutina: vi.fn(),
}));

vi.mock("@/services/alumnos-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/alumnos-service")>();
  return {
    ...actual,
    fetchLiveDatasetFromSupabase: mocks.fetchLiveDatasetFromSupabase,
  };
});

vi.mock("@/services/rutinas-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/rutinas-service")>();
  return {
    ...actual,
    asignarRutinaAAlumno: mocks.asignarRutinaAAlumno,
    compartirPlantillaConEntrenador: mocks.compartirPlantillaConEntrenador,
    revocarPlantillaCompartida: mocks.revocarPlantillaCompartida,
    duplicarPlantillaAMisPlantillas: mocks.duplicarPlantillaAMisPlantillas,
    eliminarPlantillaPropia: mocks.eliminarPlantillaPropia,
    activarRutina: mocks.activarRutina,
    archivarRutina: mocks.archivarRutina,
  };
});

import { RutinasLibrary } from "@/components/coach/rutinas-library";

const COACH_YO = "coach-yo-761";
const COACH_ANA = "coach-ana-761";
const COACH_BRUNO = "coach-bruno-761";
const COACH_CARLA = "coach-carla-761";

const STAFF: EntrenadorStaff[] = [
  { id: COACH_YO, nombre_completo: "Entrenador Yo" },
  { id: COACH_ANA, nombre_completo: "Ana Martínez" },
  { id: COACH_BRUNO, nombre_completo: "Bruno López" },
  { id: COACH_CARLA, nombre_completo: "Carla Ruiz" },
];

const ALUMNOS: Perfil[] = [
  {
    id: "alumno-1",
    nombre_completo: "Sofía Gómez",
    email: "sofia@gozster.test",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    profesor_asignado_id: COACH_YO,
    fecha_baja: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const EJERCICIOS: Ejercicio[] = [
  {
    id: "ej-1",
    nombre: "Sentadilla trasera",
    comentario: null,
    creado_por: COACH_YO,
    url_video: null,
    musculos_principales: ["Piernas"],
    musculos_secundarios: ["Core"],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const PLANTILLA_PROPIA: PlanEntrenamiento = {
  id: "plan-propio-1",
  profesor_id: COACH_YO,
  alumno_id: null,
  nombre: "Fuerza Base Propia",
  tipo: "PLANTILLA",
  estado: "ACTIVO",
  comentarios: "Plantilla privada del coach",
  fecha_inicio: "2026-11-01T00:00:00Z",
  fecha_fin: null,
  tags: ["Fuerza"],
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const PLANTILLA_COMPARTIDA: PlanEntrenamiento = {
  id: "plan-compartido-1",
  profesor_id: COACH_ANA,
  alumno_id: null,
  nombre: "Hipertrofia Tren Superior",
  tipo: "PLANTILLA",
  estado: "ACTIVO",
  comentarios: "Compartida por Ana",
  fecha_inicio: "2026-11-02T00:00:00Z",
  fecha_fin: null,
  tags: ["Hipertrofia"],
  created_at: "2026-11-02T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
};

const PLANTILLA_AJENA_PRIVADA: PlanEntrenamiento = {
  id: "plan-ajeno-privado",
  profesor_id: COACH_CARLA,
  alumno_id: null,
  nombre: "Privada de Carla",
  tipo: "PLANTILLA",
  estado: "ACTIVO",
  comentarios: "No compartida",
  fecha_inicio: "2026-11-03T00:00:00Z",
  fecha_fin: null,
  tags: ["Potencia"],
  created_at: "2026-11-03T00:00:00Z",
  updated_at: "2026-11-03T00:00:00Z",
};

const DIAS: DiaRutina[] = [
  {
    id: "dia-comp-1",
    plan_id: PLANTILLA_COMPARTIDA.id,
    nombre: "Día 1",
    orden: 1,
    created_at: "2026-11-02T00:00:00Z",
    updated_at: "2026-11-02T00:00:00Z",
  },
];

const EJ_EN_RUTINA: EjercicioEnRutina[] = [
  {
    id: "er-comp-1",
    dia_id: "dia-comp-1",
    ejercicio_id: "ej-1",
    orden: 1,
    series: 4,
    repeticiones: "8",
    descanso_segundos: 90,
    rpe_objetivo: "8",
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    created_at: "2026-11-02T00:00:00Z",
    updated_at: "2026-11-02T00:00:00Z",
  },
];

const TAGS_COMPARTIDOS_INICIALES: PlanCompartido[] = [
  {
    id: "pc-recibido-1",
    plan_id: PLANTILLA_COMPARTIDA.id,
    profesor_id: COACH_YO,
    compartido_por: COACH_ANA,
    created_at: "2026-11-05T00:00:00Z",
  },
];

function buildDataset(over: Partial<LiveSupabaseDataset> = {}): LiveSupabaseDataset {
  return {
    alumnos: ALUMNOS,
    planes: [PLANTILLA_PROPIA, PLANTILLA_COMPARTIDA],
    dias: DIAS,
    ejerciciosEnRutina: EJ_EN_RUTINA,
    ejercicios: EJERCICIOS,
    currentUserId: COACH_YO,
    currentUserRol: "ENTRENADOR",
    planesCompartidos: TAGS_COMPARTIDOS_INICIALES,
    entrenadoresStaff: STAFF,
    ...over,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("GOZS-761: Biblioteca de rutinas en 2 vistas (Mis plantillas / Compartidas conmigo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Helpers puros de clasificación y permisos", () => {
    it("separa plantillas en exactamente 2 vistas y excluye plantillas ajenas no compartidas", () => {
      const { misPlantillas, compartidasConmigo } = separarPlantillasPorOrigen(
        [PLANTILLA_PROPIA, PLANTILLA_COMPARTIDA, PLANTILLA_AJENA_PRIVADA],
        TAGS_COMPARTIDOS_INICIALES,
        COACH_YO,
        "ENTRENADOR",
      );

      expect(misPlantillas.map((p) => p.id)).toEqual([PLANTILLA_PROPIA.id]);
      expect(compartidasConmigo.map((p) => p.id)).toEqual([PLANTILLA_COMPARTIDA.id]);
    });

    it("filtra staff elegible excluyendo al autor y al usuario actual, y resuelve nombre del autor", () => {
      const elegibles = entrenadoresElegiblesParaCompartir(STAFF, COACH_YO, COACH_YO);
      expect(elegibles.map((e) => e.id)).toEqual([COACH_ANA, COACH_BRUNO, COACH_CARLA]);
      expect(nombreAutorPlantilla(PLANTILLA_COMPARTIDA, STAFF)).toBe("Ana Martínez");
      expect(nombreAutorPlantilla({ profesor_id: "desconocido" }, STAFF)).toBe("Otro entrenador");
      expect(
        esPlantillaCompartidaSoloLectura(PLANTILLA_COMPARTIDA, TAGS_COMPARTIDOS_INICIALES, COACH_YO),
      ).toBe(true);
      expect(
        esPlantillaCompartidaSoloLectura(PLANTILLA_PROPIA, TAGS_COMPARTIDOS_INICIALES, COACH_YO),
      ).toBe(false);
      expect(entrenadoresCompartidosDePlan(PLANTILLA_COMPARTIDA.id, TAGS_COMPARTIDOS_INICIALES)).toEqual([
        COACH_YO,
      ]);
    });
  });

  describe("Criterio 1: Exactamente 2 vistas de plantillas (sin vista pública/gimnasio)", () => {
    it("muestra 'Mis plantillas' y 'Compartidas conmigo' con sus conteos y sin pestaña pública", () => {
      const { container, getByTestId, getAllByTestId } = render(
        <RutinasLibrary initialDataset={buildDataset()} />,
      );

      assertNoDemoLiteralsInLiveMode(container);

      const tabMis = getByTestId("tab-plantillas-maestras");
      const tabCompartidas = getByTestId("tab-compartidas-conmigo");
      expect(tabMis.textContent).toMatch(/Mis plantillas\s*1/i);
      expect(tabCompartidas.textContent).toMatch(/Compartidas conmigo\s*1/i);
      expect(tabMis.getAttribute("aria-selected")).toBe("true");

      // Sin pestaña pública / gimnasio
      const subTabsText = getByTestId("rutinas-sub-tabs").textContent ?? "";
      expect(subTabsText).not.toMatch(/p[uú]blica|gimnasio|global/i);

      // En "Mis plantillas" solo aparece la propia
      const itemsPropios = getAllByTestId("rutina-item");
      expect(itemsPropios).toHaveLength(1);
      expect(itemsPropios[0]!.textContent).toContain("Fuerza Base Propia");
      expect(itemsPropios[0]!.textContent).not.toContain("Hipertrofia Tren Superior");

      // Al cambiar a "Compartidas conmigo" aparece solo la compartida con su autor
      fireEvent.click(tabCompartidas);
      expect(getByTestId("tab-compartidas-conmigo").getAttribute("aria-selected")).toBe("true");
      const itemsCompartidos = getAllByTestId("rutina-item");
      expect(itemsCompartidos).toHaveLength(1);
      expect(itemsCompartidos[0]!.textContent).toContain("Hipertrofia Tren Superior");
      expect(getByTestId("plantilla-autor").textContent).toContain("Ana Martínez");
      expect(getByTestId("badge-solo-lectura").textContent).toContain("Solo lectura");
    });
  });

  describe("Criterio 2: Compartir y revocar entrenadores desde 'Mis plantillas'", () => {
    it("permite tagear uno o más entrenadores y revocar acceso persistiendo en planes_compartidos", async () => {
      mocks.compartirPlantillaConEntrenador.mockImplementation(
        async (planId: string, profesorId: string, compartidoPor: string) => ({
          id: `pc-${profesorId}`,
          plan_id: planId,
          profesor_id: profesorId,
          compartido_por: compartidoPor,
          created_at: "2026-11-24T00:00:00Z",
        }),
      );
      mocks.revocarPlantillaCompartida.mockResolvedValue(undefined);

      const { container, getByTestId, queryByTestId } = render(
        <RutinasLibrary initialDataset={buildDataset()} />,
      );
      assertNoDemoLiteralsInLiveMode(container);

      // Abrir diálogo Compartir de la plantilla propia
      fireEvent.click(getByTestId(`btn-compartir-${PLANTILLA_PROPIA.id}`));
      const dialog = getByTestId("dialog-compartir-plantilla");
      expect(dialog.textContent).toContain("Fuerza Base Propia");

      // Excluye al propio autor y muestra a Ana, Bruno y Carla
      expect(queryByTestId(`share-coach-row-${COACH_YO}`)).toBeNull();
      expect(getByTestId(`share-coach-row-${COACH_ANA}`).textContent).toContain("Ana Martínez");
      expect(getByTestId(`share-coach-row-${COACH_BRUNO}`).textContent).toContain("Bruno López");

      // Compartir con Bruno y Carla
      fireEvent.click(getByTestId(`btn-compartir-coach-${COACH_BRUNO}`));
      await flushMicrotasks();
      expect(mocks.compartirPlantillaConEntrenador).toHaveBeenCalledWith(
        PLANTILLA_PROPIA.id,
        COACH_BRUNO,
        COACH_YO,
      );
      expect(getByTestId(`badge-coach-compartido-${COACH_BRUNO}`)).toBeTruthy();
      expect(getByTestId(`badge-compartida-count-${PLANTILLA_PROPIA.id}`).textContent).toContain(
        "Compartida (1)",
      );

      fireEvent.click(getByTestId(`btn-compartir-coach-${COACH_CARLA}`));
      await flushMicrotasks();
      expect(mocks.compartirPlantillaConEntrenador).toHaveBeenCalledWith(
        PLANTILLA_PROPIA.id,
        COACH_CARLA,
        COACH_YO,
      );
      expect(getByTestId(`badge-compartida-count-${PLANTILLA_PROPIA.id}`).textContent).toContain(
        "Compartida (2)",
      );

      // Revocar acceso a Bruno
      fireEvent.click(getByTestId(`btn-revocar-coach-${COACH_BRUNO}`));
      await flushMicrotasks();
      expect(mocks.revocarPlantillaCompartida).toHaveBeenCalledWith(PLANTILLA_PROPIA.id, COACH_BRUNO);
      expect(queryByTestId(`badge-coach-compartido-${COACH_BRUNO}`)).toBeNull();
      expect(getByTestId(`badge-compartida-count-${PLANTILLA_PROPIA.id}`).textContent).toContain(
        "Compartida (1)",
      );
    });
  });

  describe("Criterio 3: Modo solo lectura, duplicar a mis plantillas y asignar a alumno en 'Compartidas conmigo'", () => {
    it("muestra autor, bloquea edición/eliminación y permite duplicar a 'Mis plantillas' y asignar a alumno", async () => {
      const clonado: PlanEntrenamiento = {
        ...PLANTILLA_COMPARTIDA,
        id: "plan-clonado-mio",
        profesor_id: COACH_YO,
        nombre: "Hipertrofia Tren Superior (copia)",
        estado: "BORRADOR",
        plan_origen_id: PLANTILLA_COMPARTIDA.id,
      };
      mocks.duplicarPlantillaAMisPlantillas.mockResolvedValue(clonado.id);
      mocks.fetchLiveDatasetFromSupabase.mockResolvedValue(
        buildDataset({
          planes: [PLANTILLA_PROPIA, clonado, PLANTILLA_COMPARTIDA],
        }),
      );
      mocks.asignarRutinaAAlumno.mockResolvedValue("plan-asignado-sofia");

      const { container, getByTestId, queryByTestId } = render(
        <RutinasLibrary initialDataset={buildDataset()} defaultSubTab="compartidas" />,
      );
      assertNoDemoLiteralsInLiveMode(container);

      // En la tarjeta compartida: autor visible, sin botones de compartir ni eliminar
      expect(getByTestId("plantilla-autor").textContent).toContain("Ana Martínez");
      expect(getByTestId("badge-solo-lectura").textContent).toContain("Solo lectura");
      expect(queryByTestId(`btn-compartir-${PLANTILLA_COMPARTIDA.id}`)).toBeNull();
      expect(queryByTestId(`menu-eliminar-${PLANTILLA_COMPARTIDA.id}`)).toBeNull();
      expect(getByTestId(`btn-duplicar-${PLANTILLA_COMPARTIDA.id}`)).toBeTruthy();
      expect(getByTestId(`btn-asignar-${PLANTILLA_COMPARTIDA.id}`)).toBeTruthy();

      // Al abrir la plantilla compartida entra al constructor en modo solo lectura con banner del autor
      fireEvent.click(getByTestId(`btn-ver-compartida-${PLANTILLA_COMPARTIDA.id}`));
      const banner = getByTestId("banner-plantilla-compartida-lectura");
      expect(banner.textContent).toContain("Ana Martínez");
      expect(banner.textContent).toContain("solo lectura");
      expect(getByTestId("btn-duplicar-desde-constructor")).toBeTruthy();
      expect(getByTestId("btn-asignar-desde-constructor")).toBeTruthy();

      // En modo solo lectura no aparecen botones de guardar ni eliminar el original
      const constructorText = container.textContent ?? "";
      expect(constructorText).not.toContain("✓ Guardar");
      expect(constructorText).not.toContain("Guardar como nueva versión");

      // Duplicar a mis plantillas crea copia editable propia y vuelve a "Mis plantillas"
      fireEvent.click(getByTestId("btn-duplicar-desde-constructor"));
      await flushMicrotasks();

      expect(mocks.duplicarPlantillaAMisPlantillas).toHaveBeenCalledWith(
        PLANTILLA_COMPARTIDA.id,
        "Hipertrofia Tren Superior (copia)",
      );
      expect(getByTestId("tab-plantillas-maestras").getAttribute("aria-selected")).toBe("true");
      expect(container.textContent).toContain("Hipertrofia Tren Superior (copia)");
    });

    it("permite asignar una plantilla compartida directamente a un alumno propio", async () => {
      const planAlumno: PlanEntrenamiento = {
        ...PLANTILLA_COMPARTIDA,
        id: "plan-asignado-sofia",
        profesor_id: COACH_YO,
        alumno_id: "alumno-1",
        tipo: "DE_ALUMNO",
      };
      mocks.asignarRutinaAAlumno.mockResolvedValue(planAlumno.id);
      mocks.fetchLiveDatasetFromSupabase.mockResolvedValue(
        buildDataset({
          planes: [PLANTILLA_PROPIA, PLANTILLA_COMPARTIDA, planAlumno],
        }),
      );

      const { getByTestId, container } = render(
        <RutinasLibrary initialDataset={buildDataset()} defaultSubTab="compartidas" />,
      );

      fireEvent.click(getByTestId(`btn-asignar-${PLANTILLA_COMPARTIDA.id}`));
      const selectAlumno = container.querySelector("#rutinas-alumno") as HTMLSelectElement;
      expect(selectAlumno).toBeTruthy();
      fireEvent.change(selectAlumno, { target: { value: "alumno-1" } });

      const botones = Array.from(container.querySelectorAll("dialog button"));
      const btnConfirmar = botones.find((b) => b.textContent?.trim() === "Asignar") as HTMLElement | undefined;
      expect(btnConfirmar).toBeTruthy();
      fireEvent.click(btnConfirmar!);
      await flushMicrotasks();

      expect(mocks.asignarRutinaAAlumno).toHaveBeenCalledWith(
        PLANTILLA_COMPARTIDA.id,
        "alumno-1",
        undefined,
        undefined,
      );
    });
  });
});
