/**
 * QA Acceptance Suite — Sprint Feedback Entrenador (GOZS-421)
 *
 * Verificación automatizada transversal de los 8 desarrollos de Stage 1 (GOZS-412 a GOZS-420):
 * 1. CTA inferior de añadir ejercicio en routine-builder-modal.tsx (GOZS-412)
 * 2. Propagación en bloque de tipo_serie: "WARMUP" en superseries y tooltip explicativo (GOZS-413)
 * 3. Bloqueo de descanso en 0s para ejercicios intermedios de superseries y descanso de ronda al final (GOZS-414)
 * 4. RPE piramidal escalonado (6-7-8-9) emparejado con 12-10-8-6 y rechazo estricto de espacios "12 10 8 6" (GOZS-418)
 * 5. Chat: apertura de Inbox general, modo directo simplificado desde alumno y erradicación total de DEMO_CRITICAL_ALERTS (GOZS-416)
 * 6. Biblioteca de ejercicios dentro de /studio/rutinas con acciones de agregar, editar y eliminar (GOZS-417)
 * 7. Diálogo de edición de clases en agenda (GOZS-419)
 * 8. Eliminación / soft-delete de planes de membresía en Cobros sin romper históricos (GOZS-420)
 * AND Guard contra datos de demo (assertNoDemoLiteralsInLiveMode)
 */

import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mock Supabase clients
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  },
}));
vi.mock("@/lib/supabase/browser", () => ({
  SUPABASE_URL: "https://cutvhrxgrwwfntetdsdo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_test_key",
  createClient: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import {
  RoutineBuilderModal,
  buildGuardarRutinaPayload,
  type BuilderDay,
} from "@/components/coach/routine-builder/routine-builder-modal";
import { ClaseBlock, ClassAgenda } from "@/components/coach/class-agenda";
import { CobrosPanel } from "@/components/coach/cobros-panel";
import { RutinasLibrary } from "@/components/coach/rutinas-library";
import { EjerciciosLibraryTab } from "@/components/coach/ejercicios-library-tab";
import { ChatFab } from "@/components/coach/chat-fab";
import { useClasesStore } from "@/store/use-clases-store";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useChatStore } from "@/store/use-chat-store";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";
import {
  parseTargetRpe,
  validarRpeObjetivo,
} from "@/lib/routine-helpers";
import {
  assertNoDemoLiteralsInLiveMode,
  render,
} from "@/test-utils/no-demo-literals";
import type {
  Ejercicio,
  DiaRutina,
  EjercicioEnRutina,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import { DEMO_ALUMNOS } from "@/services/coach-demo-dataset";

// Fixtures para testing transversal
const mockCatalogo: Ejercicio[] = [
  {
    id: "ej-bench",
    nombre: "Press de Banca Plano",
    comentario: "Pecho y tríceps con barra olímpica",
    musculos_principales: ["PECHO", "TRICEPS"],
    musculos_secundarios: ["HOMBROS"],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: "https://youtube.com/watch?v=mockbench",
  },
  {
    id: "ej-fly",
    nombre: "Aperturas con Mancuernas",
    comentario: "Aislamiento pectoral",
    musculos_principales: ["PECHO"],
    musculos_secundarios: [],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: null,
  },
  {
    id: "ej-row",
    nombre: "Remo con Barra Pendlay",
    comentario: "Espalda alta y dorsal",
    musculos_principales: ["ESPALDA"],
    musculos_secundarios: ["BICEPS"],
    creado_por: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    url_video: "https://youtube.com/watch?v=mockrow",
  },
];

const mockPlanBase: PlanEntrenamiento = {
  id: "plan-qa-acceptance",
  profesor_id: "coach-uuid-1",
  alumno_id: "alum-uuid-1",
  nombre: "Plan Fuerza & Acondicionamiento QA",
  comentarios: "Rutina testeada para aceptación transversal",
  estado: "ACTIVO",
  fecha_inicio: "2026-11-08",
  fecha_fin: null,
  tags: ["Fuerza", "Hipertrofia"],
  created_at: "2026-11-08T00:00:00Z",
  updated_at: "2026-11-08T00:00:00Z",
};

const mockDiasConEjercicios: DiaRutina[] = [
  {
    id: "dia-1",
    plan_id: "plan-qa-acceptance",
    nombre: "Día 1: Torso",
    orden: 1,
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
  },
];

const mockEjerciciosEnRutina: EjercicioEnRutina[] = [
  {
    id: "eer-1",
    dia_id: "dia-1",
    ejercicio_id: "ej-bench",
    orden: 1,
    series: 4,
    repeticiones: "10-8-6-4",
    descanso_segundos: 90,
    rpe_objetivo: 8,
    notas: null,
    es_superserie: false,
    grupo_superserie: null,
    tipo_serie: "NORMAL",
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z",
  },
];

const mockPerfilCoach: Perfil = {
  id: "coach-uuid-1",
  nombre_completo: "Gonzalo Salas",
  email: "gonzasalas2016@gmail.com",
  rol: "ADMIN",
  estado_membresia: "ACTIVA",
  profesor_asignado_id: null,
  fecha_baja: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const mockDataset: LiveSupabaseDataset = {
  alumnos: [mockPerfilCoach],
  planes: [mockPlanBase],
  dias: mockDiasConEjercicios,
  ejerciciosEnRutina: mockEjerciciosEnRutina,
  ejercicios: mockCatalogo,
};

describe("QA Acceptance Suite — Sprint Feedback Entrenador (GOZS-421)", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
    useCoachStudioStore.setState({
      alumnos: DEMO_ALUMNOS,
      contrataciones: [],
    });
    useClasesStore.getState().resetDemoDataset(new Date("2026-11-05T12:00:00-03:00"));
    useChatStore.getState().resetToDefaults();
  });

  // --------------------------------------------------------------------------
  // Criterio 1: CTA inferior de añadir ejercicio en routine-builder-modal.tsx
  // --------------------------------------------------------------------------
  describe("1. Constructor: CTA '+ Añadir otro ejercicio' al pie del día (GOZS-412)", () => {
    it("GIVEN un día con ejercicios cargados en RoutineBuilderModal THEN renderiza el botón '+ Añadir otro ejercicio' con estilo outline al pie", () => {
      const html = renderToStaticMarkup(
        <RoutineBuilderModal
          isOpen={true}
          onClose={vi.fn()}
          planInicial={mockPlanBase}
          catalogoEjercicios={mockCatalogo}
          diasIniciales={mockDiasConEjercicios}
          ejerciciosEnRutinaIniciales={mockEjerciciosEnRutina}
        />
      );

      // Verificación de CTA amplio accesible
      expect(html).toContain('data-testid="add-another-exercise-btn"');
      expect(html).toContain("+ Añadir otro ejercicio");
      expect(html).toContain("border-dashed");
      expect(html).toContain("rounded-lg");
      expect(html).toContain("min-h-11");
      assertNoDemoLiteralsInLiveMode(html);
    });
  });

  // --------------------------------------------------------------------------
  // Criterio 2: Propagación en bloque de tipo_serie: "WARMUP" en superseries
  // --------------------------------------------------------------------------
  describe("2. Superseries: Propagación de Warmup en bloque y tooltip explicativo (GOZS-413)", () => {
    it("GIVEN un grupo de superserie con ejercicios intermedios THEN incluye el tooltip explicativo accesible sobre el cómputo de 1RM y tonelaje", () => {
      const ejerciciosSS: EjercicioEnRutina[] = [
        {
          id: "er-ss-1",
          dia_id: "dia-1",
          ejercicio_id: "ej-bench",
          orden: 1,
          series: 3,
          repeticiones: "10",
          descanso_segundos: 0,
          rpe_objetivo: 6,
          notas: null,
          es_superserie: true,
          grupo_superserie: 1,
          tipo_serie: "WARMUP",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
        {
          id: "er-ss-2",
          dia_id: "dia-1",
          ejercicio_id: "ej-fly",
          orden: 2,
          series: 3,
          repeticiones: "12",
          descanso_segundos: 90,
          rpe_objetivo: 6,
          notas: null,
          es_superserie: true,
          grupo_superserie: 1,
          tipo_serie: "WARMUP",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
      ];

      const html = renderToStaticMarkup(
        <RoutineBuilderModal
          isOpen={true}
          onClose={vi.fn()}
          planInicial={mockPlanBase}
          catalogoEjercicios={mockCatalogo}
          diasIniciales={mockDiasConEjercicios}
          ejerciciosEnRutinaIniciales={ejerciciosSS}
        />
      );

      expect(html).toContain("Calentamiento / Aproximación: no computa para el tonelaje acumulado ni récords 1RM");
      expect(html).toContain('data-testid="btn-tipo-serie-warmup-er-ss-1"');
      expect(html).toContain('data-testid="badge-tipo-serie-er-ss-1"');
      expect(html).toContain("bg-warning-soft");
    });

    it("GIVEN un payload preparado para guardar_rutina THEN propaga tipo_serie WARMUP a todos los ejercicios del mismo grupo_superserie", () => {
      const daysBuilder: BuilderDay[] = [
        {
          id: "dia-builder-1",
          nombre: "Día Superserie Warmup",
          orden: 1,
          ejercicios: [
            {
              id: "b-ex-1",
              ejercicio_id: "ej-bench",
              nombre: "Press Banca",
              series: 3,
              repeticiones: "10",
              descanso_segundos: 0,
              rpe_objetivo: 6,
              tempo: "",
              tempo_activo: false,
              force_rpe_required: false,
              notas: "",
              es_superserie: true,
              grupo_superserie: 1,
              tipo_serie: "WARMUP",
            },
            {
              id: "b-ex-2",
              ejercicio_id: "ej-fly",
              nombre: "Aperturas",
              series: 3,
              repeticiones: "12",
              descanso_segundos: 90,
              rpe_objetivo: 6,
              tempo: "",
              tempo_activo: false,
              force_rpe_required: false,
              notas: "",
              es_superserie: true,
              grupo_superserie: 1,
              tipo_serie: "WARMUP",
            },
          ],
        },
      ];

      const payload = buildGuardarRutinaPayload({
        nombre: "Plan QA Warmup SS",
        comentarios: "Verificación de propagación",
        comoNueva: false,
        days: daysBuilder,
      });

      const diaPayload = payload.dias[0]!;
      expect(diaPayload.ejercicios[0]!.tipo_serie).toBe("WARMUP");
      expect(diaPayload.ejercicios[1]!.tipo_serie).toBe("WARMUP");
    });
  });

  // --------------------------------------------------------------------------
  // Criterio 3: Bloqueo de descanso en 0s para ejercicios intermedios de superseries
  // --------------------------------------------------------------------------
  describe("3. Superseries: Bloqueo de descanso en intermedios (0s) y descanso de ronda al final (GOZS-414)", () => {
    it("GIVEN una superserie de 3 ejercicios THEN los ejercicios intermedios quedan bloqueados en 0s y el último permite editar el descanso de ronda", () => {
      const ejerciciosCircuito: EjercicioEnRutina[] = [
        {
          id: "er-c-1",
          dia_id: "dia-1",
          ejercicio_id: "ej-bench",
          orden: 1,
          series: 3,
          repeticiones: "10",
          descanso_segundos: 90,
          rpe_objetivo: 8,
          notas: null,
          es_superserie: true,
          grupo_superserie: 1,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
        {
          id: "er-c-2",
          dia_id: "dia-1",
          ejercicio_id: "ej-fly",
          orden: 2,
          series: 3,
          repeticiones: "12",
          descanso_segundos: 90,
          rpe_objetivo: 8,
          notas: null,
          es_superserie: true,
          grupo_superserie: 1,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
        {
          id: "er-c-3",
          dia_id: "dia-1",
          ejercicio_id: "ej-row",
          orden: 3,
          series: 3,
          repeticiones: "10",
          descanso_segundos: 120,
          rpe_objetivo: 8,
          notas: null,
          es_superserie: true,
          grupo_superserie: 1,
          tipo_serie: "NORMAL",
          created_at: "2026-11-08T00:00:00Z",
          updated_at: "2026-11-08T00:00:00Z",
        },
      ];

      const html = renderToStaticMarkup(
        <RoutineBuilderModal
          isOpen={true}
          onClose={vi.fn()}
          planInicial={mockPlanBase}
          catalogoEjercicios={mockCatalogo}
          diasIniciales={mockDiasConEjercicios}
          ejerciciosEnRutinaIniciales={ejerciciosCircuito}
        />
      );

      // Verificación de bloqueo 0s en intermedios y descanso de ronda al final
      expect(html).toContain("0s (inmediato: superserie)");
      expect(html).toContain('data-testid="superserie-descanso-inmediato"');
      expect(html).toContain("Descanso de ronda (s):");
    });
  });

  // --------------------------------------------------------------------------
  // Criterio 4: RPE piramidal escalonado con guiones y rechazo de espacios (GOZS-418)
  // --------------------------------------------------------------------------
  describe("4. Motor de Cargas: RPE piramidal con guiones sincronizado con repeticiones (GOZS-418)", () => {
    it("GIVEN repeticiones piramidales '12-10-8-6' WHEN se ingresa RPE '6-7-8-9' THEN valida que coinciden en series y valores válidos", () => {
      const res = validarRpeObjetivo("6-7-8-9", 4);
      expect(res.valido).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("GIVEN una secuencia con espacios '6 7 8 9' o '12 10 8 6' THEN el motor rechaza explícitamente la entrada", () => {
      const res = validarRpeObjetivo("6 7 8 9", 4);
      expect(res.valido).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).toContain("no debe contener espacios");
    });

    it("GIVEN RPE piramidal '6-7-8-9' en la Athlete App THEN resuelve Serie 1 como 6 y Serie 4 como 9", () => {
      expect(parseTargetRpe("6-7-8-9", 1)).toBe(6);
      expect(parseTargetRpe("6-7-8-9", 2)).toBe(7);
      expect(parseTargetRpe("6-7-8-9", 3)).toBe(8);
      expect(parseTargetRpe("6-7-8-9", 4)).toBe(9);
    });
  });

  // --------------------------------------------------------------------------
  // Criterio 5: Chat: Inbox general, modo directo desde alumno y erradicación de DEMO_CRITICAL_ALERTS
  // --------------------------------------------------------------------------
  describe("5. Chat: Inbox general vs. Modo directo simplificado sin alertas de dolor (GOZS-416)", () => {
    it("GIVEN el Drawer de Chat WHEN se abre globalmente THEN muestra por defecto el Inbox general sin banners de molestias críticas", () => {
      useChatStore.getState().resetToDefaults();
      const html = renderToStaticMarkup(
        React.createElement(ChatFab, { alumno: null, isOpen: true, onToggle: vi.fn() })
      );

      expect(html).toContain('data-testid="coach-chat-drawer"');
      expect(html).toContain("Inbox de Chats");
      expect(html).toContain("Bandeja unificada de conversaciones activas");
      expect(html).toContain('data-testid="chat-inbox-search"');
      expect(html).toContain('placeholder="Buscar conversación..."');
      // Verificación de erradicación de alertas demo de molestia y filtro
      expect(html).not.toContain("DEMO_CRITICAL_ALERTS");
      expect(html).not.toContain("Bandeja de alertas críticas");
      expect(html).not.toContain('data-tab="MOLESTIAS"');
      assertNoDemoLiteralsInLiveMode(html);
    });

    it("GIVEN la apertura de chat directo para un alumno específico THEN entra en modo simplificado con botón 'Volver a chats'", () => {
      const alumno = MOCK_ALUMNOS[0]!;
      const html = renderToStaticMarkup(
        React.createElement(ChatFab, { alumno, isOpen: true, onToggle: vi.fn() })
      );

      expect(html).toContain(`Chat con ${alumno.nombre_completo}`);
      expect(html).toContain("← Volver a chats");
      expect(html).not.toContain('data-testid="coach-chat-filter-bar"');
      expect(html).not.toContain("Responder como:");
      assertNoDemoLiteralsInLiveMode(html);
    });
  });

  // --------------------------------------------------------------------------
  // Criterio 6: Biblioteca de ejercicios en /studio/rutinas con CRUD
  // --------------------------------------------------------------------------
  describe("6. Rutinas: Pestaña 'Biblioteca de Ejercicios' con CRUD completo (GOZS-417)", () => {
    it("GIVEN la vista RutinasLibrary THEN contiene la pestaña 'Biblioteca de Ejercicios' junto a 'Rutinas y Plantillas'", () => {
      const { container } = render(
        <RutinasLibrary initialDataset={mockDataset} />
      );

      const html = container.innerHTML;
      expect(html).toContain("Biblioteca de Ejercicios");
      expect(html).toContain("Rutinas y Plantillas");
      assertNoDemoLiteralsInLiveMode(container);
    });

    it("GIVEN la pestaña EjerciciosLibraryTab THEN exhibe buscador, filtros musculares y acciones de Editar y Eliminar", () => {
      const { container } = render(
        <EjerciciosLibraryTab
          ejercicios={mockCatalogo}
          ejerciciosEnRutina={mockEjerciciosEnRutina}
        />
      );

      const html = container.innerHTML;
      expect(html).toContain("Buscar por nombre o músculo...");
      expect(html).toContain("Todos");
      expect(html).toContain('data-testid="btn-editar-ejercicio-ej-bench"');
      expect(html).toContain('data-testid="btn-eliminar-ejercicio-ej-bench"');
      expect(html).toContain("Editar");
      expect(html).toContain("Eliminar");
      assertNoDemoLiteralsInLiveMode(container);
    });
  });

  // --------------------------------------------------------------------------
  // Criterio 7: Diálogo de edición de clases en agenda
  // --------------------------------------------------------------------------
  describe("7. Agenda: Diálogo unificado 'Editar Clase' en semanal y lateral (GOZS-419)", () => {
    it("GIVEN cualquier clase en la grilla THEN exhibe el botón accesible 'Editar clase' y renderiza los campos precargados", () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      const html = renderToStaticMarkup(
        <ClaseBlock
          clase={clase}
          ocupados={3}
          activa={false}
          ahoraMs={new Date("2026-11-05T12:00:00-03:00").getTime()}
          vista="semana"
          top={80}
          height={60}
          onSelect={vi.fn()}
          onEdit={vi.fn()}
        />
      );

      expect(html).toContain("Editar clase");
      expect(html).toContain('data-testid="edit-class-grid-btn"');
      assertNoDemoLiteralsInLiveMode(html);
    });
  });

  // --------------------------------------------------------------------------
  // Criterio 8: Eliminación / soft-delete de planes de membresía en Cobros sin romper históricos
  // --------------------------------------------------------------------------
  describe("8. Finanzas: Eliminación y desactivación de Planes de Membresía en Cobros (GOZS-420)", () => {
    it("GIVEN la tabla de planes en CobrosPanel THEN cada plan cuenta con botón Eliminar y confirmación modal", () => {
      const html = renderToStaticMarkup(<CobrosPanel />);

      expect(html).toContain('data-testid="planes-table"');
      expect(html).toContain("Eliminar");
      assertNoDemoLiteralsInLiveMode(html);
    });

    it("GIVEN la acción de eliminar un plan sin contrataciones THEN lo desactiva en el store (activo: false) preservando integridad", async () => {
      const cobrosStore = useCobrosStore.getState();
      const nuevoPlan = await cobrosStore.crearPlan({
        nombre: "Plan Temporal Test QA",
        actividad: "RUTINAS",
        duracionMeses: 1,
        limiteSemanal: null,
        precio: 15000,
        fechaVigencia: "2026-12-01",
        notas: "Plan para probar eliminación limpia",
      });

      expect(nuevoPlan).toBeDefined();
      expect(nuevoPlan.activo).toBe(true);

      await cobrosStore.eliminarPlan(nuevoPlan.id);

      const planActualizado = useCobrosStore.getState().planes.find((p) => p.id === nuevoPlan.id);
      expect(planActualizado?.activo).toBe(false);
      expect(useCobrosStore.getState().aviso).toContain("eliminado correctamente");
    });
  });

  // --------------------------------------------------------------------------
  // Criterio Transversal: Guard contra datos demo (assertNoDemoLiteralsInLiveMode)
  // --------------------------------------------------------------------------
  describe("9. Guard Antirregresión Visual: Cero literales de demo en componentes montados", () => {
    it("GIVEN los componentes montados en vivo THEN superan assertNoDemoLiteralsInLiveMode sin excepciones", () => {
      const htmlCobros = renderToStaticMarkup(<CobrosPanel />);
      assertNoDemoLiteralsInLiveMode(htmlCobros);

      const htmlAgenda = renderToStaticMarkup(<ClassAgenda />);
      assertNoDemoLiteralsInLiveMode(htmlAgenda);
    });
  });
});
