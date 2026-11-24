import * as React from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntrenadorApoyoPanel } from "@/components/coach/student-detail/entrenador-apoyo-panel";
import { StudentDetail, type StudentDetailProps } from "@/components/coach/student-detail";
import { CoachStudioView } from "@/components/coach/coach-studio-view";
import { CobrosPanel } from "@/components/coach/cobros-panel";
import {
  esEntrenadorDeApoyo,
  esEntrenadorTitular,
  filtrarCandidatosEntrenadorApoyo,
  puedeGestionarEntrenadorApoyo,
  puedeVerFinanzasAlumno,
  type CoachCandidato,
} from "@/lib/entrenador-apoyo";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useChatStore } from "@/store/use-chat-store";
import { useCobrosStore } from "@/store/use-cobros-store";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { Perfil } from "@/types/database.types";

const mockSupabaseState = vi.hoisted(() => ({
  updateCalls: [] as Array<{ table: string; payload: Record<string, unknown>; eqCol: string; eqVal: string }>,
  updateError: null as { message: string } | null,
  authUserId: "00000000-0000-4000-8000-0000000000c1",
  serverAuthUser: { id: "00000000-0000-4000-8000-0000000000c1" } as { id: string } | null,
  serverUserRol: "ENTRENADOR" as string | null,
  serverStaffRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockSupabaseState.serverAuthUser },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: mockSupabaseState.serverUserRol ? { rol: mockSupabaseState.serverUserRol } : null,
            error: null,
          })),
        })),
        in: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: mockSupabaseState.serverStaffRows,
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: mockSupabaseState.authUserId } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => ({
      update: vi.fn((payload: Record<string, unknown>) => ({
        eq: vi.fn(async (eqCol: string, eqVal: string) => {
          mockSupabaseState.updateCalls.push({ table, payload, eqCol, eqVal });
          return { data: null, error: mockSupabaseState.updateError };
        }),
      })),
      select: vi.fn(() => ({
        in: vi.fn(async () => ({ data: [], error: null })),
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

const TITULAR_ID = "00000000-0000-4000-8000-0000000000c1";
const APOYO_ID = "00000000-0000-4000-8000-0000000000c2";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000c9";
const OTRO_COACH_ID = "00000000-0000-4000-8000-0000000000c3";
const ALUMNO_ID = "00000000-0000-4000-8000-0000000000a1";

const COACHES_STAFF: CoachCandidato[] = [
  { id: TITULAR_ID, nombre: "Gonzalo Titular", rol: "ENTRENADOR" },
  { id: APOYO_ID, nombre: "Lucía Apoyo", rol: "ENTRENADOR" },
  { id: ADMIN_ID, nombre: "Admin GOZS", rol: "ADMIN" },
];

function crearAlumno(overrides: Partial<Perfil> = {}): Perfil {
  return {
    ...MOCK_ALUMNOS[0]!,
    id: ALUMNO_ID,
    nombre_completo: "Lucas Giménez",
    email: "lucas.gimenez@ejemplo.test",
    rol: "ALUMNO",
    estado_membresia: "ACTIVA",
    estado_cuenta: "ACTIVO",
    profesor_asignado_id: TITULAR_ID,
    profesor_apoyo_id: null,
    apoyo_acceso_financiero: false,
    fecha_baja: null,
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    ...overrides,
  };
}

function crearPropsStudentDetail(
  alumno: Perfil,
  overrides: Partial<StudentDetailProps> = {},
): StudentDetailProps {
  return {
    alumno,
    activeTab: "rutina_actual",
    onTabChange: vi.fn(),
    onBack: vi.fn(),
    rutinaActiva: null,
    historialPlanes: [],
    dias: [],
    ejerciciosEnRutina: [],
    ejerciciosCatalogo: [],
    onOpenHistoricalLoads: vi.fn(),
    onClonarUltimaRutina: vi.fn().mockResolvedValue(null),
    isOffline: false,
    onOpenChat: vi.fn(),
    ...overrides,
  };
}

describe("GOZS-760: UI de Entrenador de apoyo, cartel de permiso financiero ($) y texto RLS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.updateCalls = [];
    mockSupabaseState.updateError = null;
    mockSupabaseState.authUserId = TITULAR_ID;
    mockSupabaseState.serverAuthUser = { id: TITULAR_ID };
    mockSupabaseState.serverUserRol = "ENTRENADOR";
    mockSupabaseState.serverStaffRows = [];
    useChatStore.getState().resetToDefaults();
    useChatStore.setState({
      staffCoaches: COACHES_STAFF.map((c) => ({ ...c, esStaff: true })),
    });
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("1. Reglas de permisos y filtrado de candidatos (src/lib/entrenador-apoyo.ts)", () => {
    it("identifica correctamente titular, apoyo, permisos de gestión y acceso financiero ($)", () => {
      const alumnoSinFinanzas = crearAlumno({
        profesor_apoyo_id: APOYO_ID,
        apoyo_acceso_financiero: false,
      });
      const alumnoConFinanzas = crearAlumno({
        profesor_apoyo_id: APOYO_ID,
        apoyo_acceso_financiero: true,
      });

      // Titular
      expect(esEntrenadorTitular(alumnoSinFinanzas, { userId: TITULAR_ID, rol: "ENTRENADOR" })).toBe(true);
      expect(esEntrenadorDeApoyo(alumnoSinFinanzas, { userId: TITULAR_ID, rol: "ENTRENADOR" })).toBe(false);
      expect(puedeGestionarEntrenadorApoyo(alumnoSinFinanzas, { userId: TITULAR_ID, rol: "ENTRENADOR" })).toBe(true);
      expect(puedeVerFinanzasAlumno(alumnoSinFinanzas, { userId: TITULAR_ID, rol: "ENTRENADOR" })).toBe(true);

      // ADMIN
      expect(puedeGestionarEntrenadorApoyo(alumnoSinFinanzas, { userId: ADMIN_ID, rol: "ADMIN" })).toBe(true);
      expect(puedeVerFinanzasAlumno(alumnoSinFinanzas, { userId: ADMIN_ID, rol: "ADMIN" })).toBe(true);

      // Apoyo sin permiso financiero ($)
      expect(esEntrenadorDeApoyo(alumnoSinFinanzas, { userId: APOYO_ID, rol: "ENTRENADOR" })).toBe(true);
      expect(puedeGestionarEntrenadorApoyo(alumnoSinFinanzas, { userId: APOYO_ID, rol: "ENTRENADOR" })).toBe(false);
      expect(puedeVerFinanzasAlumno(alumnoSinFinanzas, { userId: APOYO_ID, rol: "ENTRENADOR" })).toBe(false);

      // Apoyo con permiso financiero ($) habilitado
      expect(puedeGestionarEntrenadorApoyo(alumnoConFinanzas, { userId: APOYO_ID, rol: "ENTRENADOR" })).toBe(false);
      expect(puedeVerFinanzasAlumno(alumnoConFinanzas, { userId: APOYO_ID, rol: "ENTRENADOR" })).toBe(true);
    });

    it("filtra al titular y al propio alumno de los candidatos a entrenador de apoyo", () => {
      const alumno = crearAlumno();
      const candidatos = filtrarCandidatosEntrenadorApoyo(
        [...COACHES_STAFF, { id: ALUMNO_ID, nombre: "Lucas Giménez", rol: "ENTRENADOR" }],
        alumno,
      );

      expect(candidatos.map((c) => c.id)).toEqual([APOYO_ID, ADMIN_ID]);
    });
  });

  describe("2. Persistencia en Zustand + Supabase (asignación, baja manual y permiso $)", () => {
    it("GIVEN un titular o ADMIN WHEN asigna un entrenador de apoyo THEN persiste profesor_apoyo_id con apoyo_acceso_financiero=false por defecto y permite dar de baja manualmente", async () => {
      const alumno = crearAlumno();
      useCoachStudioStore.setState({ alumnos: [alumno], isLiveDatabase: true });

      const resAsignar = await useCoachStudioStore
        .getState()
        .actualizarEntrenadorApoyo(ALUMNO_ID, APOYO_ID);

      expect(resAsignar.ok).toBe(true);
      expect(mockSupabaseState.updateCalls[0]).toEqual({
        table: "perfiles",
        payload: {
          profesor_apoyo_id: APOYO_ID,
          apoyo_acceso_financiero: false,
        },
        eqCol: "id",
        eqVal: ALUMNO_ID,
      });

      const actualizado = useCoachStudioStore.getState().alumnos.find((a) => a.id === ALUMNO_ID)!;
      expect(actualizado.profesor_apoyo_id).toBe(APOYO_ID);
      expect(actualizado.apoyo_acceso_financiero).toBe(false);

      // Baja manual
      const resBaja = await useCoachStudioStore
        .getState()
        .actualizarEntrenadorApoyo(ALUMNO_ID, null);

      expect(resBaja.ok).toBe(true);
      expect(mockSupabaseState.updateCalls[1]).toEqual({
        table: "perfiles",
        payload: {
          profesor_apoyo_id: null,
          apoyo_acceso_financiero: false,
        },
        eqCol: "id",
        eqVal: ALUMNO_ID,
      });
      const trasBaja = useCoachStudioStore.getState().alumnos.find((a) => a.id === ALUMNO_ID)!;
      expect(trasBaja.profesor_apoyo_id).toBeNull();
      expect(trasBaja.apoyo_acceso_financiero).toBe(false);
    });

    it("GIVEN un alumno con apoyo asignado WHEN confirma acceso financiero ($) THEN persiste apoyo_acceso_financiero=true y revierte si falla Supabase", async () => {
      const alumno = crearAlumno({ profesor_apoyo_id: APOYO_ID, apoyo_acceso_financiero: false });
      useCoachStudioStore.setState({ alumnos: [alumno], isLiveDatabase: true });

      const resOk = await useCoachStudioStore
        .getState()
        .actualizarAccesoFinancieroApoyo(ALUMNO_ID, true);

      expect(resOk.ok).toBe(true);
      expect(mockSupabaseState.updateCalls[0]).toEqual({
        table: "perfiles",
        payload: { apoyo_acceso_financiero: true },
        eqCol: "id",
        eqVal: ALUMNO_ID,
      });
      expect(
        useCoachStudioStore.getState().alumnos.find((a) => a.id === ALUMNO_ID)
          ?.apoyo_acceso_financiero,
      ).toBe(true);

      // Error en Supabase revierte el estado local
      mockSupabaseState.updateError = { message: "42501 permiso denegado" };
      const resErr = await useCoachStudioStore
        .getState()
        .actualizarAccesoFinancieroApoyo(ALUMNO_ID, false);

      expect(resErr.ok).toBe(false);
      expect(resErr.error).toContain("42501");
      expect(
        useCoachStudioStore.getState().alumnos.find((a) => a.id === ALUMNO_ID)
          ?.apoyo_acceso_financiero,
      ).toBe(true);
    });

    it("GET /api/coach/entrenadores exige rol ENTRENADOR/ADMIN y devuelve solo id, nombre_completo y rol (sin email ni PII)", async () => {
      const { GET } = await import("@/app/api/coach/entrenadores/route");

      // Sin sesión -> 401
      mockSupabaseState.serverAuthUser = null;
      const res401 = await GET();
      expect(res401.status).toBe(401);

      // ALUMNO -> 403
      mockSupabaseState.serverAuthUser = { id: ALUMNO_ID };
      mockSupabaseState.serverUserRol = "ALUMNO";
      const res403 = await GET();
      expect(res403.status).toBe(403);

      // ENTRENADOR -> 200 con proyección mínima (sin email ni teléfono)
      mockSupabaseState.serverAuthUser = { id: TITULAR_ID };
      mockSupabaseState.serverUserRol = "ENTRENADOR";
      mockSupabaseState.serverStaffRows = [
        {
          id: TITULAR_ID,
          nombre_completo: "Gonzalo Titular",
          rol: "ENTRENADOR",
          email: "oculto@ejemplo.test",
          telefono: "1155550000",
        },
        {
          id: APOYO_ID,
          nombre_completo: "Lucía Apoyo",
          rol: "ENTRENADOR",
          email: "lucia@ejemplo.test",
        },
      ];
      const res200 = await GET();
      expect(res200.status).toBe(200);
      const body = (await res200.json()) as { entrenadores: Array<Record<string, unknown>> };
      expect(body.entrenadores).toEqual([
        { id: TITULAR_ID, nombre_completo: "Gonzalo Titular", rol: "ENTRENADOR" },
        { id: APOYO_ID, nombre_completo: "Lucía Apoyo", rol: "ENTRENADOR" },
      ]);
      expect(JSON.stringify(body)).not.toContain("oculto@ejemplo.test");
      expect(JSON.stringify(body)).not.toContain("1155550000");
    });

    it("loadStaffCoaches consume /api/coach/entrenadores para hidratar el selector de entrenadores", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entrenadores: [
            { id: TITULAR_ID, nombre_completo: "Gonzalo Titular", rol: "ENTRENADOR" },
            { id: APOYO_ID, nombre_completo: "Lucía Apoyo", rol: "ENTRENADOR" },
          ],
        }),
      } as Response);
      useChatStore.setState({ staffCoaches: [] });

      await useChatStore.getState().loadStaffCoaches();

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/coach/entrenadores",
        expect.objectContaining({ method: "GET" }),
      );
      expect(useChatStore.getState().staffCoaches.map((c) => c.id)).toEqual([TITULAR_ID, APOYO_ID]);
      fetchSpy.mockRestore();
    });
  });

  describe("3. UI de Entrenador de apoyo y cartel de confirmación Acceso financiero ($)", () => {
    it("GIVEN un titular sin apoyo asignado THEN muestra selector sin el titular, sin input de vencimiento, y botón de asignar", () => {
      const alumno = crearAlumno();
      const html = renderToStaticMarkup(
        <EntrenadorApoyoPanel
          alumno={alumno}
          coaches={COACHES_STAFF}
          puedeGestionar={true}
          onAsignarApoyo={vi.fn().mockResolvedValue({ ok: true })}
          onQuitarApoyo={vi.fn().mockResolvedValue({ ok: true })}
          onCambiarAccesoFinanciero={vi.fn().mockResolvedValue({ ok: true })}
        />,
      );

      expect(html).toContain('data-testid="entrenador-apoyo-panel"');
      expect(html).toContain('data-testid="select-entrenador-apoyo"');
      expect(html).toContain('data-testid="btn-asignar-entrenador-apoyo"');
      expect(html).toContain("Lucía Apoyo");
      expect(html).toContain("Admin GOZS");
      // No debe ofrecer al titular como candidato a apoyo ni pedir fecha de vencimiento
      expect(html).not.toContain("Gonzalo Titular");
      expect(html).not.toContain('type="date"');
      expect(html).toContain("sin fecha de vencimiento");
    });

    it("GIVEN un alumno con apoyo asignado WHEN el titular/ADMIN abre el panel THEN ve baja manual directa y control Acceso financiero ($)", () => {
      const alumno = crearAlumno({
        profesor_apoyo_id: APOYO_ID,
        apoyo_acceso_financiero: false,
      });
      const html = renderToStaticMarkup(
        <EntrenadorApoyoPanel
          alumno={alumno}
          coaches={COACHES_STAFF}
          puedeGestionar={true}
          onAsignarApoyo={vi.fn().mockResolvedValue({ ok: true })}
          onQuitarApoyo={vi.fn().mockResolvedValue({ ok: true })}
          onCambiarAccesoFinanciero={vi.fn().mockResolvedValue({ ok: true })}
        />,
      );

      expect(html).toContain('data-testid="entrenador-apoyo-nombre"');
      expect(html).toContain("Lucía Apoyo");
      expect(html).toContain('data-testid="badge-apoyo-solo-entrenamiento"');
      expect(html).toContain('data-testid="btn-quitar-entrenador-apoyo"');
      expect(html).toContain("Dar de baja apoyo");
      expect(html).toContain('data-testid="toggle-acceso-financiero-apoyo"');
      expect(html).toContain("Acceso financiero ($)");
      expect(html).toContain('aria-checked="false"');
    });

    it("GIVEN el cartel de confirmación de Acceso financiero ($) WHEN se activa THEN advierte explícitamente sobre dinero, membresías, cobros y pagos con botones Cancelar y Confirmar", () => {
      const alumno = crearAlumno({
        profesor_apoyo_id: APOYO_ID,
        apoyo_acceso_financiero: false,
      });
      const html = renderToStaticMarkup(
        <EntrenadorApoyoPanel
          alumno={alumno}
          coaches={COACHES_STAFF}
          puedeGestionar={true}
          onAsignarApoyo={vi.fn().mockResolvedValue({ ok: true })}
          onQuitarApoyo={vi.fn().mockResolvedValue({ ok: true })}
          onCambiarAccesoFinanciero={vi.fn().mockResolvedValue({ ok: true })}
          initialConfirmDialogOpen={true}
        />,
      );

      expect(html).toContain('data-testid="dialog-confirmar-acceso-financiero"');
      expect(html).toContain('role="alertdialog"');
      expect(html).toContain("Confirmar acceso financiero ($)");
      expect(html).toContain("dinero, membresías, cobros y pagos");
      expect(html).toContain("Lucía Apoyo");
      expect(html).toContain("Lucas Giménez");
      expect(html).toContain('data-testid="btn-cancelar-acceso-financiero"');
      expect(html).toContain('data-testid="btn-confirmar-acceso-financiero"');
    });
  });

  describe("4. Ocultamiento financiero en ficha y vistas de Coach Studio para apoyo sin permiso ($)", () => {
    it("GIVEN entrenador de apoyo con apoyo_acceso_financiero=false WHEN abre StudentDetail THEN gestiona entrenamiento pero no ve dinero, membresías, cobros ni pagos", () => {
      const alumno = crearAlumno({
        profesor_apoyo_id: APOYO_ID,
        apoyo_acceso_financiero: false,
      });
      const html = renderToStaticMarkup(
        <StudentDetail
          {...crearPropsStudentDetail(alumno, {
            currentUserId: APOYO_ID,
            currentUserRole: "ENTRENADOR",
            headerMenuOpen: true,
          })}
        />,
      );

      // Puede gestionar entrenamiento, rutinas, chat y seguimiento
      expect(html).toContain('data-testid="btn-asignar-rutina"');
      expect(html).toContain('data-testid="enviar-mensaje-btn"');
      expect(html).toContain('data-testid="isla-routine-workbench"');
      expect(html).toContain('data-testid="coach-nivel-vista-card"');
      expect(html).toContain('data-testid="badge-entrenador-apoyo"');
      expect(html).toContain('data-testid="badge-solo-entrenamiento"');
      expect(html).toContain('data-testid="aviso-rol-entrenador-apoyo"');

      // NO ve controles de gestión de apoyo (solo titular/ADMIN)
      expect(html).not.toContain('data-testid="btn-quitar-entrenador-apoyo"');
      expect(html).not.toContain('data-testid="toggle-acceso-financiero-apoyo"');

      // NO ve ni puede ejecutar acciones de dinero, membresías, cobros ni pagos
      expect(html).not.toContain('data-testid="student-menu-registrar-pago"');
      expect(html).not.toContain('data-testid="isla-membresia-resumen"');
      expect(html).not.toContain('data-testid="btn-registrar-pago"');
      expect(html).not.toContain('data-testid="btn-asignar-plan-desde-membresia"');
      expect(html).not.toContain('data-testid="btn-historial-pagos"');
      expect(html).not.toContain('data-testid="ficha-suscripcion-resumen"');
      expect(html).not.toContain('data-testid="historial-pagos-card"');
      expect(html).not.toContain('data-testid="contratacion-panel"');
      expect(html).not.toContain('data-testid="dialog-registrar-pago"');
      expect(html).not.toContain("Cuota &amp; Historial");
      expect(html).not.toContain("Contratación &amp; Renovación");
    });

    it("GIVEN entrenador de apoyo con apoyo_acceso_financiero=true WHEN abre StudentDetail THEN puede ver y operar finanzas pero sigue sin poder gestionar la asignación del apoyo", () => {
      const alumno = crearAlumno({
        profesor_apoyo_id: APOYO_ID,
        apoyo_acceso_financiero: true,
      });
      const html = renderToStaticMarkup(
        <StudentDetail
          {...crearPropsStudentDetail(alumno, {
            currentUserId: APOYO_ID,
            currentUserRole: "ENTRENADOR",
            headerMenuOpen: true,
          })}
        />,
      );

      expect(html).toContain('data-testid="student-menu-registrar-pago"');
      expect(html).toContain('data-testid="isla-membresia-resumen"');
      expect(html).toContain('data-testid="dialog-registrar-pago"');
      expect(html).not.toContain('data-testid="btn-quitar-entrenador-apoyo"');
      expect(html).not.toContain('data-testid="toggle-acceso-financiero-apoyo"');
    });

    it("GIVEN entrenador de apoyo sin permiso ($) en CoachStudioView y CobrosPanel THEN oculta cuota y cobros de ese alumno", () => {
      const alumnoApoyo = crearAlumno({
        id: ALUMNO_ID,
        nombre_completo: "Lucas Apoyo",
        profesor_asignado_id: TITULAR_ID,
        profesor_apoyo_id: APOYO_ID,
        apoyo_acceso_financiero: false,
      });
      const alumnoPropio = crearAlumno({
        id: "00000000-0000-4000-8000-0000000000a2",
        nombre_completo: "Ana Propia",
        profesor_asignado_id: APOYO_ID,
        profesor_apoyo_id: null,
        apoyo_acceso_financiero: false,
      });

      const dataset: LiveSupabaseDataset = {
        alumnos: [alumnoApoyo, alumnoPropio],
        planes: [],
        dias: [],
        ejerciciosEnRutina: [],
        ejercicios: [],
        estadosAlumno: [
          {
            alumno_id: alumnoPropio.id,
            estado: "AL_DIA",
            al_dia: true,
            fecha_vencimiento: "2026-12-31",
            cobros_vencidos: 0,
            profesor_asignado_id: APOYO_ID,
            contratacion_id: "ct-1",
            estado_contratacion: "VIGENTE",
            primer_vencimiento_impago: null,
          },
        ],
      };

      const htmlStudio = renderToStaticMarkup(
        <CoachStudioView
          initialDataset={dataset}
          coachName="Lucía Apoyo"
          userRole="ENTRENADOR"
          userId={APOYO_ID}
        />,
      );

      expect(htmlStudio).toContain(`data-testid="badge-apoyo-tabla-${alumnoApoyo.id}"`);
      expect(htmlStudio).toContain(`data-testid="cuota-oculta-apoyo-${alumnoApoyo.id}"`);
      expect(htmlStudio).not.toContain(`data-testid="cuota-oculta-apoyo-${alumnoPropio.id}"`);

      // CobrosPanel también excluye los cobros del alumno donde es apoyo sin permiso ($)
      const htmlCobros = renderToStaticMarkup(
        <CobrosPanel
          isLiveMode={true}
          currentUserId={APOYO_ID}
          userRole="ENTRENADOR"
          initialPerfiles={[alumnoApoyo, alumnoPropio]}
          initialDataset={{
            cobros: [
              {
                id: "cb-oculto",
                alumno_id: alumnoApoyo.id,
                contratacion_id: "ct-oculto",
                periodo: "2026-12-01",
                monto: 40000,
                fecha_vencimiento: "2026-12-10",
                estado: "PENDIENTE",
                concepto: "Cuota bloqueada",
                notas: null,
                created_at: "2026-11-01T00:00:00Z",
                updated_at: "2026-11-01T00:00:00Z",
              },
              {
                id: "cb-propio",
                alumno_id: alumnoPropio.id,
                contratacion_id: "ct-propio",
                periodo: "2026-12-01",
                monto: 35000,
                fecha_vencimiento: "2026-12-10",
                estado: "PENDIENTE",
                concepto: "Cuota propia",
                notas: null,
                created_at: "2026-11-01T00:00:00Z",
                updated_at: "2026-11-01T00:00:00Z",
              },
            ],
            contrataciones: [],
            planesMembresia: [],
            pagos: [],
            alumnoActividades: [],
          }}
        />,
      );

      expect(htmlCobros).toContain("Ana Propia");
      expect(htmlCobros).not.toContain("Lucas Apoyo");
    });

    it("GIVEN un entrenador ajeno (ni titular ni ADMIN) THEN tampoco ve los controles de gestión de apoyo", () => {
      const alumno = crearAlumno();
      const html = renderToStaticMarkup(
        <StudentDetail
          {...crearPropsStudentDetail(alumno, {
            currentUserId: OTRO_COACH_ID,
            currentUserRole: "ENTRENADOR",
          })}
        />,
      );

      expect(html).not.toContain('data-testid="select-entrenador-apoyo"');
      expect(html).not.toContain('data-testid="btn-asignar-entrenador-apoyo"');
    });
  });

  describe("5. Texto RLS obsoleto actualizado en student-detail.tsx", () => {
    it("GIVEN src/components/coach/student-detail.tsx THEN ya no menciona entrenador_alumnos y refleja profesor_asignado_id / entrenador de apoyo", () => {
      const sourcePath = path.resolve(
        process.cwd(),
        "src/components/coach/student-detail.tsx",
      );
      const source = fs.readFileSync(sourcePath, "utf8");
      expect(source).not.toContain("entrenador_alumnos");

      const htmlSinApoyo = renderToStaticMarkup(
        <StudentDetail {...crearPropsStudentDetail(crearAlumno())} />,
      );
      expect(htmlSinApoyo).not.toContain("entrenador_alumnos");
      expect(htmlSinApoyo).toContain('data-testid="student-vinculo-rls"');
      expect(htmlSinApoyo).toContain("profesor_asignado_id");

      const htmlConApoyo = renderToStaticMarkup(
        <StudentDetail
          {...crearPropsStudentDetail(crearAlumno({ profesor_apoyo_id: APOYO_ID }))}
        />,
      );
      expect(htmlConApoyo).toContain("profesor_asignado_id y entrenador de apoyo");
    });
  });
});
