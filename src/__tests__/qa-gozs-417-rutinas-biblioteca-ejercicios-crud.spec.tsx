import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { RutinasLibrary } from "@/components/coach/rutinas-library";
import { EjerciciosLibraryTab } from "@/components/coach/ejercicios-library-tab";
import {
  filtrarEjercicios,
  filtrarEjerciciosPorBusqueda,
  filtrarEjerciciosPorMusculo,
} from "@/lib/rutinas-biblioteca";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { Ejercicio, EjercicioEnRutina, Perfil, PlanEntrenamiento } from "@/types/database.types";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";

vi.mock("@/lib/supabase/browser", () => ({
  SUPABASE_URL: "https://cutvhrxgrwwfntetdsdo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_BdrxwuFPjcloqpXvWYAvHw_jw8TJAEH",
  createClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  }),
}));

const mockPerfilCoach: Perfil = {
  id: "coach-gonzalo",
  nombre_completo: "Gonzalo Salas",
  email: "gonzasalas2016@gmail.com",
  rol: "ADMIN",
  estado_membresia: "ACTIVA",
  profesor_asignado_id: null,
  fecha_baja: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const mockEjercicios: Ejercicio[] = [
  {
    id: "ej-press-banca",
    nombre: "Press de Banca Plano con Barra",
    musculos_principales: ["Pecho", "Tríceps"],
    musculos_secundarios: ["Deltoides Anterior"],
    url_video: "https://www.youtube.com/watch?v=rT7DgCr-3pg",
    comentario: "Retraer escápulas y mantener apoyo de pies firme.",
    creado_por: "coach-gonzalo",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "ej-sentadilla",
    nombre: "Sentadilla Trasera Profunda",
    musculos_principales: ["Piernas", "Cuádriceps", "Glúteos"],
    musculos_secundarios: ["Core", "Espalda Baja"],
    url_video: "https://youtu.be/SEdqd1n0cvg",
    comentario: "Romper paralelo con rodillas alineadas con la punta del pie.",
    creado_por: "coach-gonzalo",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "ej-remo-barra",
    nombre: "Remo con Barra Pendlay",
    musculos_principales: ["Espalda", "Dorsales"],
    musculos_secundarios: ["Bíceps", "Deltoides Posterior"],
    url_video: null,
    comentario: "Tirón explosivo al esternón desde el suelo.",
    creado_por: "coach-gonzalo",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "ej-press-militar",
    nombre: "Press Militar de Pie",
    musculos_principales: ["Hombros", "Deltoides"],
    musculos_secundarios: ["Tríceps", "Core"],
    url_video: "https://www.youtube.com/watch?v=2yjwXTZQDDI",
    comentario: "Sin hiperextender zona lumbar.",
    creado_por: "coach-gonzalo",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "ej-curl-biceps",
    nombre: "Curl de Bíceps con Barra Z",
    musculos_principales: ["Brazos", "Bíceps"],
    musculos_secundarios: ["Antebrazos"],
    url_video: null,
    comentario: "Codos pegados al cuerpo, tempo 3-0-1.",
    creado_por: "coach-gonzalo",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const mockEjerciciosEnRutina: EjercicioEnRutina[] = [
  {
    id: "er-1",
    dia_id: "dia-1",
    ejercicio_id: "ej-press-banca", // EN USO
    series: 4,
    repeticiones: "10-8-6-6",
    descanso_segundos: 90,
    orden: 1,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    rpe_objetivo: 8,
    tipo_serie: "NORMAL",
    tempo: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "er-2",
    dia_id: "dia-1",
    ejercicio_id: "ej-sentadilla", // EN USO
    series: 4,
    repeticiones: "8/12",
    descanso_segundos: 120,
    orden: 2,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    rpe_objetivo: 8.5,
    tipo_serie: "NORMAL",
    tempo: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const mockPlanes: PlanEntrenamiento[] = [
  {
    id: "plan-1",
    profesor_id: "coach-gonzalo",
    alumno_id: "alumno-1",
    nombre: "Rutina Hipertrofia Fase 1",
    tipo: "DE_ALUMNO",
    estado: "ACTIVO",
    comentarios: "Plan activo",
    fecha_inicio: "2026-10-01T00:00:00Z",
    fecha_fin: null,
    tags: ["Hipertrofia"],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const mockDataset: LiveSupabaseDataset = {
  alumnos: [mockPerfilCoach],
  planes: mockPlanes,
  dias: [
    {
      id: "dia-1",
      plan_id: "plan-1",
      nombre: "Día 1 - Fuerza y Torso",
      orden: 1,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ],
  ejerciciosEnRutina: mockEjerciciosEnRutina,
  ejercicios: mockEjercicios,
};

describe("GOZS-417: Rutinas - Pestaña 'Biblioteca de Ejercicios' con CRUD completo del Catálogo Maestro", () => {
  describe("Criterio 1: Exhibición de pestaña 'Biblioteca de Ejercicios' en la cabecera principal", () => {
    it("GIVEN la vista /studio/rutinas WHEN el entrenador visualiza las pestañas principales THEN se exhibe la pestaña 'Biblioteca de Ejercicios' junto a 'Rutinas y Plantillas'", () => {
      const { container, getByTestId } = render(
        <RutinasLibrary initialDataset={mockDataset} />
      );

      assertNoDemoLiteralsInLiveMode(container);

      // Verificación de tabs principales
      const mainTabs = getByTestId("rutinas-main-nav-tabs");
      expect(mainTabs).toBeTruthy();

      const tabRutinas = getByTestId("tab-biblioteca-plantillas");
      expect(tabRutinas).toBeTruthy();
      expect(tabRutinas.textContent).toContain("Rutinas y Plantillas");

      const tabEjercicios = getByTestId("tab-biblioteca-ejercicios");
      expect(tabEjercicios).toBeTruthy();
      expect(tabEjercicios.textContent).toContain("Biblioteca de Ejercicios");

      const tabConstructor = getByTestId("tab-constructor-visual");
      expect(tabConstructor).toBeTruthy();
      expect(tabConstructor.textContent).toContain("Constructor Visual");
    });
  });

  describe("Criterio 2: Listado de ejercicios con buscador reactivo y filtro por grupo muscular", () => {
    it("filtra correctamente por grupo muscular ('Pecho', 'Piernas', 'Todos')", () => {
      const soloPecho = filtrarEjerciciosPorMusculo(mockEjercicios, "Pecho");
      expect(soloPecho).toHaveLength(1);
      expect(soloPecho[0]!.id).toBe("ej-press-banca");

      const soloPiernas = filtrarEjerciciosPorMusculo(mockEjercicios, "Piernas");
      expect(soloPiernas).toHaveLength(1);
      expect(soloPiernas[0]!.id).toBe("ej-sentadilla");

      const todos = filtrarEjerciciosPorMusculo(mockEjercicios, "Todos");
      expect(todos).toHaveLength(mockEjercicios.length);
    });

    it("filtra por término de búsqueda en nombre, músculos y comentarios", () => {
      const busquedaSentadilla = filtrarEjerciciosPorBusqueda(mockEjercicios, "profunda");
      expect(busquedaSentadilla).toHaveLength(1);
      expect(busquedaSentadilla[0]!.id).toBe("ej-sentadilla");

      const busquedaMusculo = filtrarEjerciciosPorBusqueda(mockEjercicios, "tríceps");
      expect(busquedaMusculo.length).toBeGreaterThanOrEqual(2);

      const combinada = filtrarEjercicios(mockEjercicios, "Hombros", "militar");
      expect(combinada).toHaveLength(1);
      expect(combinada[0]!.id).toBe("ej-press-militar");
    });

    it("GIVEN la pestaña 'Biblioteca de Ejercicios' montada THEN renderiza la lista y permite filtrar interactivamente", () => {
      const { container, getByTestId, queryByTestId } = render(
        <EjerciciosLibraryTab
          ejercicios={mockEjercicios}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      // Verificamos que se renderizan las tarjetas
      expect(getByTestId("ejercicios-list")).toBeTruthy();
      expect(getByTestId("ejercicio-card-ej-press-banca")).toBeTruthy();
      expect(getByTestId("ejercicio-card-ej-sentadilla")).toBeTruthy();

      // Buscador
      const searchInput = getByTestId("search-ejercicios-input");
      expect(searchInput).toBeTruthy();

      // Filtro de músculos
      expect(getByTestId("ejercicios-musculo-filter")).toBeTruthy();
      expect(getByTestId("filtro-musculo-todos")).toBeTruthy();
      expect(getByTestId("filtro-musculo-pecho")).toBeTruthy();

      // Filtrar por texto
      fireEvent.change(searchInput, { target: { value: "Pendlay" } });
      expect(getByTestId("ejercicio-card-ej-remo-barra")).toBeTruthy();
      expect(queryByTestId("ejercicio-card-ej-press-banca")).toBeNull();
    });
  });

  describe("Criterio 3: Botón '+ Nuevo Ejercicio' y Diálogo Accesible", () => {
    it("GIVEN el botón '+ Nuevo Ejercicio' WHEN el entrenador hace click THEN abre el diálogo accesible con todos los campos", () => {
      const onCreated = vi.fn();
      const { getByTestId } = render(
        <EjerciciosLibraryTab
          ejercicios={mockEjercicios}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          onEjercicioCreated={onCreated}
        />
      );

      const btnNuevo = getByTestId("btn-nuevo-ejercicio");
      fireEvent.click(btnNuevo);

      // Diálogo abierto
      expect(getByTestId("dialog-ejercicio")).toBeTruthy();
      expect(getByTestId("dialog-ejercicio-title").textContent).toContain("Nuevo Ejercicio");

      // Campos del formulario
      expect(getByTestId("input-ejercicio-nombre")).toBeTruthy();
      expect(getByTestId("input-ejercicio-musculos")).toBeTruthy();
      expect(getByTestId("input-ejercicio-musculos-secundarios")).toBeTruthy();
      expect(getByTestId("input-ejercicio-video")).toBeTruthy();
      expect(getByTestId("input-ejercicio-comentarios")).toBeTruthy();

      // Botón Guardar
      expect(getByTestId("btn-guardar-ejercicio")).toBeTruthy();
    });

    it("crea un nuevo ejercicio al completar el formulario y enviarlo", async () => {
      const onCreated = vi.fn();
      const { getByTestId } = render(
        <EjerciciosLibraryTab
          ejercicios={mockEjercicios}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          onEjercicioCreated={onCreated}
        />
      );

      fireEvent.click(getByTestId("btn-nuevo-ejercicio"));

      // Completar campos
      fireEvent.change(getByTestId("input-ejercicio-nombre"), {
        target: { value: "Hip Thrust con Barra" },
      });
      fireEvent.click(getByTestId("chip-musculo-piernas"));
      fireEvent.click(getByTestId("chip-musculo-core"));
      fireEvent.change(getByTestId("input-ejercicio-video"), {
        target: { value: "https://www.youtube.com/watch?v=mock-hip-thrust" },
      });
      fireEvent.change(getByTestId("input-ejercicio-comentarios"), {
        target: { value: "Pausa de 1 segundo arriba en contracción máxima" },
      });

      // Submit
      fireEvent.click(getByTestId("btn-guardar-ejercicio"));
      await Promise.resolve();
      await Promise.resolve();

      expect(onCreated).toHaveBeenCalledTimes(1);
      const createdEj = onCreated.mock.calls[0]![0] as Ejercicio;
      expect(createdEj.nombre).toBe("Hip Thrust con Barra");
      expect(createdEj.musculos_principales).toEqual(["Piernas", "Core"]);
      expect(createdEj.comentario).toBe("Pausa de 1 segundo arriba en contracción máxima");
    });
  });

  describe("Criterio 4: Acciones 'Editar' y 'Eliminar' con confirmación modal", () => {
    it("GIVEN un ejercicio existente WHEN se hace click en 'Editar' THEN abre el diálogo precargado", async () => {
      const onUpdated = vi.fn();
      const { getByTestId } = render(
        <EjerciciosLibraryTab
          ejercicios={mockEjercicios}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          onEjercicioUpdated={onUpdated}
        />
      );

      const btnEdit = getByTestId("btn-editar-ejercicio-ej-press-banca");
      fireEvent.click(btnEdit);

      expect(getByTestId("dialog-ejercicio-title").textContent).toContain("Editar Ejercicio");
      const inputNombre = getByTestId("input-ejercicio-nombre") as any;
      expect(inputNombre.value).toBe("Press de Banca Plano con Barra");

      // Modificar nombre
      fireEvent.change(inputNombre, { target: { value: "Press de Banca Plano con Mancuernas" } });
      fireEvent.click(getByTestId("btn-guardar-ejercicio"));
      await Promise.resolve();
      await Promise.resolve();

      expect(onUpdated).toHaveBeenCalledTimes(1);
      const updated = onUpdated.mock.calls[0]![0] as Ejercicio;
      expect(updated.id).toBe("ej-press-banca");
      expect(updated.nombre).toBe("Press de Banca Plano con Mancuernas");
    });

    it("GOZS-426: chips de músculos principales preseleccionados al editar, multiselección y sin input de texto", async () => {
      const onUpdated = vi.fn();
      const { getByTestId } = render(
        <EjerciciosLibraryTab
          ejercicios={mockEjercicios}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          onEjercicioUpdated={onUpdated}
        />
      );
      fireEvent.click(getByTestId("btn-editar-ejercicio-ej-sentadilla"));
      expect(getByTestId("chip-musculo-piernas").getAttribute("aria-pressed")).toBe("true");
      expect(getByTestId("chip-musculo-pecho").getAttribute("aria-pressed")).toBe("false");
      expect(getByTestId("input-ejercicio-musculos").querySelector("input")).toBeNull();

      fireEvent.click(getByTestId("chip-musculo-piernas"));
      fireEvent.click(getByTestId("chip-musculo-pecho"));
      fireEvent.click(getByTestId("chip-musculo-brazos"));
      fireEvent.click(getByTestId("btn-guardar-ejercicio"));
      await Promise.resolve();
      await Promise.resolve();

      const updated = onUpdated.mock.calls[0]![0] as Ejercicio;
      expect(updated.musculos_principales).toEqual(["Cuádriceps", "Glúteos", "Pecho", "Brazos"]);
    });
  });

  describe("Criterio 5: Detección estricta de ejercicio en uso al intentar eliminar", () => {
    it("GIVEN un ejercicio en uso en rutinas WHEN se presiona 'Eliminar' THEN el sistema advierte y bloquea la acción", () => {
      const onDeleted = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <EjerciciosLibraryTab
          ejercicios={mockEjercicios}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          onEjercicioDeleted={onDeleted}
        />
      );

      // ej-press-banca está en mockEjerciciosEnRutina (en uso)
      const btnEliminar = getByTestId("btn-eliminar-ejercicio-ej-press-banca");
      fireEvent.click(btnEliminar);

      // Se abre el modal de confirmación
      expect(getByTestId("modal-confirmar-eliminar-ejercicio")).toBeTruthy();

      // Se exhibe la advertencia de ejercicio en uso
      const alerta = getByTestId("alerta-ejercicio-en-uso");
      expect(alerta).toBeTruthy();
      expect(alerta.textContent).toContain("Ejercicio en uso");
      expect(alerta.textContent).toContain("No se puede eliminar");

      // El botón de confirmación queda deshabilitado
      const btnConfirmar = getByTestId("btn-confirmar-eliminar") as any;
      expect(btnConfirmar.disabled).toBe(true);

      // Clic no surte efecto
      fireEvent.click(btnConfirmar);
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it("GIVEN un ejercicio libre (sin uso en rutinas) WHEN se presiona 'Eliminar' THEN permite confirmar y ejecutar el borrado", async () => {
      const onDeleted = vi.fn();
      const { getByTestId, queryByTestId } = render(
        <EjerciciosLibraryTab
          ejercicios={mockEjercicios}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
          onEjercicioDeleted={onDeleted}
        />
      );

      // ej-curl-biceps NO está en mockEjerciciosEnRutina
      const btnEliminar = getByTestId("btn-eliminar-ejercicio-ej-curl-biceps");
      fireEvent.click(btnEliminar);

      expect(getByTestId("modal-confirmar-eliminar-ejercicio")).toBeTruthy();

      // No hay alerta de bloqueo
      expect(queryByTestId("alerta-ejercicio-en-uso")).toBeNull();

      // El botón de confirmación está habilitado
      const btnConfirmar = getByTestId("btn-confirmar-eliminar") as any;
      expect(btnConfirmar.disabled).toBe(false);

      // Confirmar eliminación
      fireEvent.click(btnConfirmar);
      await Promise.resolve();
      await Promise.resolve();
      expect(onDeleted).toHaveBeenCalledTimes(1);
      expect(onDeleted).toHaveBeenCalledWith("ej-curl-biceps");
    });
  });

  describe("Criterio 6: Integración y Estética Visual (Sistema de Diseño Geist y Tokens)", () => {
    it("cumple con las restricciones de tokens vigentes (sin shadow-m3-*, rounded-xl, rounded-lg)", () => {
      const { container } = render(
        <RutinasLibrary initialDataset={mockDataset} />
      );

      const html = container.innerHTML || "";
      expect(html).not.toContain("shadow-m3-");
      expect(html).toContain("rounded-xl");
      expect(html).toContain("rounded-lg");
    });
  });
});
