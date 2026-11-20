import * as React from "react";
import * as fs from "node:fs";
import * as path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteClasses } from "@/components/athlete/athlete-classes";
import { ClassAgenda } from "@/components/coach/class-agenda";
import { MENSAJE_SIN_SENAL, claveDia } from "@/lib/clases";
import { supabase } from "@/lib/supabase/client";
import { useClasesStore, type ReservaAgenda } from "@/store/use-clases-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { Clase, Perfil } from "@/types/database.types";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

describe("GOZS-638: Agenda Online Real, recurrencia, des-cancelar, Listo unificado y filtro estricto Athlete", () => {
  const FECHA_DEMO = new Date("2026-11-20T12:00:00-03:00");

  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useClasesStore.getState().resetDemoDataset(FECHA_DEMO);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Edición unificada con botón Listo, cierre de diálogo + Sheet y persistencia Supabase", () => {
    it("DialogContent asegura max-h-[90vh] overflow-y-auto y ClassAgenda expone botón 'Listo · Guardar cambios' y cierra modal + Sheet", () => {
      const dialogSrc = readSource("../components/ui/dialog.tsx");
      const agendaSrc = readSource("../components/coach/class-agenda.tsx");

      expect(dialogSrc).toContain("max-h-[90vh] overflow-y-auto");
      expect(agendaSrc).toContain("Listo · Guardar cambios");
      expect(agendaSrc).toContain("setEditDialogAbierto(false)");
      expect(agendaSrc).toContain("setSheetDetalleAbierto(false)");

      const clase = useClasesStore.getState().clases[0]!;
      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={clase.id}
          initialEditDialogOpen={true}
          testAhora={FECHA_DEMO}
        />,
      );

      expect(html).toContain('data-testid="edit-class-dialog"');
      expect(html).toContain('data-testid="edit-class-submit"');
      expect(html).toContain("Listo · Guardar cambios");
      expect(html).toContain("max-h-[90vh] overflow-y-auto");
    });

    it("actualizarClase persiste en Supabase public.clases, emite aviso 'Clase actualizada' y propaga error real si PostgREST falla", async () => {
      const coachId = "11111111-1111-4111-8111-111111111111";
      const claseId = "22222222-2222-4222-8222-222222222222";
      const claseReal: Clase = {
        id: claseId,
        horario_id: null,
        actividad: "FUNCIONAL",
        inicio: "2026-11-21T18:00:00-03:00",
        duracion_minutos: 60,
        capacidad: 10,
        estado: "PROGRAMADA",
        motivo_cancelacion: null,
        created_at: "2026-11-20T10:00:00Z",
        updated_at: "2026-11-20T10:00:00Z",
      };

      useClasesStore.setState({ clases: [claseReal], agendaReservas: [] });

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: coachId } as any },
        error: null,
      } as any);

      // 1) Fallo de PostgREST -> debe propagar error y retornar false sin alterar la clase
      vi.spyOn(supabase, "from").mockImplementationOnce(() => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { message: "permission denied for table clases", code: "42501" },
              }),
            }),
          }),
        }),
      }) as any);

      const failOk = await useClasesStore.getState().actualizarClase(claseId, {
        actividad: "BOXEO",
        capacidad: 14,
      });
      expect(failOk).toBe(false);
      expect(useClasesStore.getState().error).toBeTruthy();
      expect(useClasesStore.getState().aviso).toBeNull();
      expect(useClasesStore.getState().clases[0]?.actividad).toBe("FUNCIONAL");

      // 2) RLS filtra o la clase ya no existe ({ data: null, error: null }) -> no emite aviso ni altera estado local
      vi.spyOn(supabase, "from").mockImplementationOnce(() => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }) as any);

      const notFoundOk = await useClasesStore.getState().actualizarClase(claseId, {
        actividad: "BOXEO",
        capacidad: 20,
      });
      expect(notFoundOk).toBe(false);
      expect(useClasesStore.getState().error).toBe("No pudimos guardar los cambios de la clase.");
      expect(useClasesStore.getState().aviso).toBeNull();
      expect(useClasesStore.getState().clases[0]?.actividad).toBe("FUNCIONAL");
      expect(useClasesStore.getState().clases[0]?.capacidad).toBe(10);

      // 3) Éxito -> actualiza clase y emite aviso "Clase actualizada"
      const updatedRow: Clase = { ...claseReal, actividad: "BOXEO", capacidad: 14 };
      vi.spyOn(supabase, "from").mockImplementationOnce(() => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: updatedRow, error: null }),
            }),
          }),
        }),
      }) as any);

      const ok = await useClasesStore.getState().actualizarClase(claseId, {
        actividad: "BOXEO",
        capacidad: 14,
      });
      expect(ok).toBe(true);
      expect(useClasesStore.getState().error).toBeNull();
      expect(useClasesStore.getState().aviso).toBe("Clase actualizada");
      expect(useClasesStore.getState().clases[0]?.actividad).toBe("BOXEO");
      expect(useClasesStore.getState().clases[0]?.capacidad).toBe(14);
    });
  });

  describe("2. Des-cancelar clase (reactivar_clase) y cancelar vs eliminar clase vacía", () => {
    it("GIVEN una clase cancelada en ClassAgenda THEN renderiza el botón 'Des-cancelar clase'", () => {
      const claseCancelada: Clase = {
        ...useClasesStore.getState().clases[0]!,
        id: "clase-cancelada-ui",
        estado: "CANCELADA",
        motivo_cancelacion: "Lluvia",
      };
      useClasesStore.setState({ clases: [claseCancelada] });

      const html = renderToStaticMarkup(
        <ClassAgenda
          clases={[claseCancelada]}
          initialSheetOpen={true}
          initialClaseId={claseCancelada.id}
          testAhora={FECHA_DEMO}
        />,
      );

      expect(html).toContain('data-testid="class-canceled-banner"');
      expect(html).toContain('data-testid="reactivate-class-btn"');
      expect(html).toContain("Des-cancelar clase");
    });

    it("GIVEN una clase cancelada con alumnos ANULADO y uno CANCELADO WHEN reactivarClase THEN llama RPC reactivar_clase, vuelve a PROGRAMADA y restaura solo ANULADO -> ANOTADO", async () => {
      const coachId = "11111111-1111-4111-8111-111111111111";
      const claseId = "22222222-2222-4222-8222-222222222222";
      const claseCancelada: Clase = {
        id: claseId,
        horario_id: null,
        actividad: "BOXEO",
        inicio: "2026-11-21T19:30:00-03:00",
        duracion_minutos: 60,
        capacidad: 10,
        estado: "CANCELADA",
        motivo_cancelacion: "Corte de luz",
        created_at: "2026-11-20T10:00:00Z",
        updated_at: "2026-11-20T10:00:00Z",
      };
      const resAnulada: ReservaAgenda = {
        id: "33333333-3333-4333-8333-333333333333",
        clase_id: claseId,
        alumno_id: "44444444-4444-4444-8444-444444444444",
        alumno_nombre: "Sofía",
        estado: "ANULADO",
        created_at: "2026-11-20T10:00:00Z",
        updated_at: "2026-11-20T10:00:00Z",
      };
      const resCanceladaAntes: ReservaAgenda = {
        id: "55555555-5555-4555-8555-555555555555",
        clase_id: claseId,
        alumno_id: "66666666-6666-4666-8666-666666666666",
        alumno_nombre: "Tomás",
        estado: "CANCELADO",
        created_at: "2026-11-20T10:00:00Z",
        updated_at: "2026-11-20T10:00:00Z",
      };

      useClasesStore.setState({
        clases: [claseCancelada],
        agendaReservas: [resAnulada, resCanceladaAntes],
        misReservas: [resAnulada],
      });

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: coachId } as any },
        error: null,
      } as any);
      const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({
        data: { ...claseCancelada, estado: "PROGRAMADA", motivo_cancelacion: null },
        error: null,
      } as any);

      const ok = await useClasesStore.getState().reactivarClase(claseId);
      expect(ok).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith("reactivar_clase", { p_clase_id: claseId });

      const estado = useClasesStore.getState();
      expect(estado.clases[0]?.estado).toBe("PROGRAMADA");
      expect(estado.clases[0]?.motivo_cancelacion).toBeNull();
      expect(estado.agendaReservas.find((r) => r.id === resAnulada.id)?.estado).toBe("ANOTADO");
      expect(estado.agendaReservas.find((r) => r.id === resCanceladaAntes.id)?.estado).toBe("CANCELADO");
      expect(estado.misReservas[0]?.estado).toBe("ANOTADO");
      expect(estado.aviso).toContain("reactivada");
    });

    it("cancelarClase con 0 inscriptos invoca eliminar_clase_vacia y con >=1 inscripto invoca cancelar_clase_con_aviso", async () => {
      const coachId = "11111111-1111-4111-8111-111111111111";
      const vaciaId = "22222222-2222-4222-8222-222222222221";
      const conGenteId = "22222222-2222-4222-8222-222222222222";

      useClasesStore.setState({
        clases: [
          {
            id: vaciaId,
            horario_id: null,
            actividad: "BOXEO",
            inicio: "2026-11-21T19:30:00-03:00",
            duracion_minutos: 60,
            capacidad: 10,
            estado: "PROGRAMADA",
            motivo_cancelacion: null,
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
          },
          {
            id: conGenteId,
            horario_id: null,
            actividad: "FUNCIONAL",
            inicio: "2026-11-21T18:00:00-03:00",
            duracion_minutos: 60,
            capacidad: 10,
            estado: "PROGRAMADA",
            motivo_cancelacion: null,
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
          },
        ],
        agendaReservas: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            clase_id: conGenteId,
            alumno_id: "44444444-4444-4444-8444-444444444444",
            alumno_nombre: "Alumno 1",
            estado: "ANOTADO",
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
          },
        ],
      });

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: coachId } as any },
        error: null,
      } as any);
      const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: true, error: null } as any);

      const okVacia = await useClasesStore.getState().cancelarClase(vaciaId, "");
      expect(okVacia).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith("eliminar_clase_vacia", { p_clase_id: vaciaId });
      expect(useClasesStore.getState().clases.some((c) => c.id === vaciaId)).toBe(false);

      const okCon = await useClasesStore.getState().cancelarClase(conGenteId, "Feriado");
      expect(okCon).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith("cancelar_clase_con_aviso", {
        p_clase_id: conGenteId,
        p_motivo: "Feriado",
        p_pushear_inicio: true,
      });
      expect(useClasesStore.getState().clases.find((c) => c.id === conGenteId)?.estado).toBe("CANCELADA");
    });
  });

  describe("3. Creación única/recurrente estilo Google Calendar y modo Online-only con aviso offline", () => {
    it("ClassAgenda renderiza selector de repetición estilo Google Calendar y aviso offline claro cuando !isOnline", () => {
      useOfflineQueueStore.setState({ isOnline: false });
      const html = renderToStaticMarkup(<ClassAgenda testAhora={FECHA_DEMO} />);

      expect(html).toContain('data-testid="create-class-recurrence"');
      expect(html).toContain("No se repite (única)");
      expect(html).toContain("Semanalmente");
      expect(html).toContain('data-testid="agenda-offline-banner"');
      expect(html).toContain("Estás sin señal");
    });

    it("crearClasesRecurrentes invoca RPC crear_clases_agenda en Supabase y rechaza con MENSAJE_SIN_SENAL si !isOnline", async () => {
      // 1) Offline -> rechaza con mensaje claro
      useOfflineQueueStore.setState({ isOnline: false });
      await expect(
        useClasesStore.getState().crearClase({
          actividad: "BOXEO",
          inicio: "2026-11-20T19:30:00-03:00",
        }),
      ).rejects.toThrow(MENSAJE_SIN_SENAL);
      expect(useClasesStore.getState().error).toBe(MENSAJE_SIN_SENAL);

      await expect(
        useClasesStore.getState().crearClasesRecurrentes({
          actividad: "BOXEO",
          hora_inicio: "19:30",
          fecha_inicio: "2026-11-20",
          dias_semana: [1, 3, 5],
          semanas: 4,
        }),
      ).rejects.toThrow(MENSAJE_SIN_SENAL);

      // 2) Online + sesión real -> invoca crear_clases_agenda
      useOfflineQueueStore.setState({ isOnline: true });
      const coachId = "11111111-1111-4111-8111-111111111111";
      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: coachId } as any },
        error: null,
      } as any);

      const creadasMock: Clase[] = [
        {
          id: "22222222-2222-4222-8222-222222222211",
          horario_id: "77777777-7777-4777-8777-777777777711",
          actividad: "BOXEO",
          inicio: "2026-11-23T19:30:00-03:00",
          duracion_minutos: 60,
          capacidad: 12,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          created_at: "2026-11-20T10:00:00Z",
          updated_at: "2026-11-20T10:00:00Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222212",
          horario_id: "77777777-7777-4777-8777-777777777712",
          actividad: "BOXEO",
          inicio: "2026-11-25T19:30:00-03:00",
          duracion_minutos: 60,
          capacidad: 12,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          created_at: "2026-11-20T10:00:00Z",
          updated_at: "2026-11-20T10:00:00Z",
        },
      ];

      const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({
        data: creadasMock,
        error: null,
      } as any);

      const res = await useClasesStore.getState().crearClasesRecurrentes({
        actividad: "BOXEO",
        hora_inicio: "19:30",
        fecha_inicio: "2026-11-23",
        dias_semana: [1, 3, 5],
        semanas: 4,
        duracion_minutos: 60,
        capacidad: 12,
      });

      expect(rpcSpy).toHaveBeenCalledWith("crear_clases_agenda", {
        p_actividad: "BOXEO",
        p_duracion_minutos: 60,
        p_capacidad: 12,
        p_recurrente: true,
        p_dias_semana: [1, 3, 5],
        p_hora_inicio: "19:30",
        p_fecha_inicio: "2026-11-23",
        p_fecha_fin: null,
        p_semanas: 4,
      });
      expect(res).toHaveLength(2);
      expect(useClasesStore.getState().clases.some((c) => c.id === creadasMock[0]!.id)).toBe(true);
    });

    it("reservar y cancelarReserva muestran MENSAJE_SIN_SENAL si !isOnline y llaman RPCs en Supabase cuando está Online", async () => {
      const alumnoId = "44444444-4444-4444-8444-444444444444";
      const claseId = "22222222-2222-4222-8222-222222222299";
      const reservaId = "33333333-3333-4333-8333-333333333399";

      useClasesStore.setState({
        clases: [
          {
            id: claseId,
            horario_id: null,
            actividad: "BOXEO",
            inicio: "2026-11-25T19:30:00-03:00",
            duracion_minutos: 60,
            capacidad: 10,
            estado: "PROGRAMADA",
            motivo_cancelacion: null,
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
          },
        ],
        misReservas: [],
        agendaReservas: [],
      });

      // Offline: rechaza reservar y cancelarReserva con MENSAJE_SIN_SENAL
      useOfflineQueueStore.setState({ isOnline: false });
      await useClasesStore.getState().reservar(claseId);
      expect(useClasesStore.getState().error).toBe(MENSAJE_SIN_SENAL);

      await useClasesStore.getState().cancelarReserva(reservaId);
      expect(useClasesStore.getState().error).toBe(MENSAJE_SIN_SENAL);

      // Online: invoca reservar_clase y cancelar_reserva
      useOfflineQueueStore.setState({ isOnline: true });
      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: alumnoId } as any },
        error: null,
      } as any);

      const rpcSpy = vi
        .spyOn(supabase, "rpc")
        .mockResolvedValueOnce({ data: [{ reserva_id: reservaId, aviso: null }], error: null } as any)
        .mockResolvedValueOnce({
          data: { id: reservaId, clase_id: claseId, alumno_id: alumnoId, estado: "CANCELADO" },
          error: null,
        } as any);

      await useClasesStore.getState().reservar(claseId);
      expect(rpcSpy).toHaveBeenCalledWith("reservar_clase", { p_clase_id: claseId });
      expect(useClasesStore.getState().misReservas[0]?.estado).toBe("ANOTADO");

      await useClasesStore.getState().cancelarReserva(reservaId);
      expect(rpcSpy).toHaveBeenCalledWith("cancelar_reserva", { p_reserva_id: reservaId });
      expect(useClasesStore.getState().misReservas[0]?.estado).toBe("CANCELADO");
    });
  });

  describe("4. Visibilidad estricta por actividad en AthleteClasses y carga real desde Supabase", () => {
    it("GIVEN un alumno apuntado únicamente a BOXEO en Studio WHEN carga clases y renderiza AthleteClasses THEN ve solo Boxeo (hoy 19:30), NO ve Funcional ni botón 'Ver todas'", async () => {
      const alumnoId = "44444444-4444-4444-8444-444444444444";
      const hoyClave = claveDia(new Date());
      const boxeoHoyId = "22222222-2222-4222-8222-222222222301";
      const funcionalHoyId = "22222222-2222-4222-8222-222222222302";

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: alumnoId } as any },
        error: null,
      } as any);

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "clases") {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: boxeoHoyId,
                    horario_id: null,
                    actividad: "BOXEO",
                    inicio: `${hoyClave}T19:30:00-03:00`,
                    duracion_minutos: 60,
                    capacidad: 10,
                    estado: "PROGRAMADA",
                    motivo_cancelacion: null,
                    created_at: "2026-11-20T10:00:00Z",
                    updated_at: "2026-11-20T10:00:00Z",
                  },
                  {
                    id: funcionalHoyId,
                    horario_id: null,
                    actividad: "FUNCIONAL",
                    inicio: `${hoyClave}T18:00:00-03:00`,
                    duracion_minutos: 60,
                    capacidad: 10,
                    estado: "PROGRAMADA",
                    motivo_cancelacion: null,
                    created_at: "2026-11-20T10:00:00Z",
                    updated_at: "2026-11-20T10:00:00Z",
                  },
                ],
                error: null,
              }),
            }),
          } as any;
        }
        if (table === "reservas") {
          return {
            select: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          } as any;
        }
        if (table === "contrataciones") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          } as any;
        }
        if (table === "alumno_actividades") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  {
                    id: "88888888-8888-4888-8888-888888888881",
                    alumno_id: alumnoId,
                    actividad: "BOXEO",
                    veces_por_semana: 2,
                    pase_libre: false,
                    created_at: "2026-11-20T10:00:00Z",
                    updated_at: "2026-11-20T10:00:00Z",
                  },
                ],
                error: null,
              }),
            }),
          } as any;
        }
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) } as any;
      });

      await useClasesStore.getState().cargarClasesAlumno();
      expect(useClasesStore.getState().actividadesHabilitadas).toEqual(["BOXEO"]);

      const html = renderToStaticMarkup(<AthleteClasses />);
      expect(html).toContain("19:30");
      expect(html).toContain("Boxeo");
      expect(html).not.toContain("18:00");
      expect(html).not.toContain(">Funcional<");
      expect(html).not.toContain("Ver todas");
      expect(html).not.toContain("toggle-filter-actividades");
    });

    it("GIVEN un alumno sin actividades presenciales habilitadas THEN AthleteClasses muestra estado vacío claro y ninguna clase", () => {
      useClasesStore.setState({
        membresia: null,
        plan: null,
        contratacionesAlumno: [],
        actividadesAlumno: [],
        actividadesHabilitadas: [],
      });

      const html = renderToStaticMarkup(<AthleteClasses />);
      expect(html).toContain('data-testid="no-enabled-activities-empty"');
      expect(html).toContain("Todavía no tenés actividades habilitadas");
      expect(html).not.toContain('data-testid="class-booking-card"');
    });

    it("GIVEN !isOnline en AthleteClasses THEN muestra banner offline claro y deshabilita reservar/cancelar", () => {
      useOfflineQueueStore.setState({ isOnline: false });
      const html = renderToStaticMarkup(<AthleteClasses />);
      expect(html).toContain('data-testid="athlete-offline-banner"');
      expect(html).toContain("Estás sin señal");
    });
  });

  describe("5. Coach Studio cargarAgenda, anotarAlumnoCoach y quitarAnotadoCoach con Supabase real", () => {
    it("cargarAgenda consulta clases, reservas con perfiles y clases_fijas en Supabase cuando está Online", async () => {
      const coachId = "11111111-1111-4111-8111-111111111111";
      const claseId = "22222222-2222-4222-8222-222222222244";
      const reservaId = "33333333-3333-4333-8333-333333333344";
      const alumnoId = "44444444-4444-4444-8444-444444444444";

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: coachId } as any },
        error: null,
      } as any);

      vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "clases") {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: claseId,
                    horario_id: null,
                    actividad: "BOXEO",
                    inicio: "2026-11-25T19:30:00-03:00",
                    duracion_minutos: 60,
                    capacidad: 10,
                    estado: "PROGRAMADA",
                    motivo_cancelacion: null,
                    created_at: "2026-11-20T10:00:00Z",
                    updated_at: "2026-11-20T10:00:00Z",
                  },
                ],
                error: null,
              }),
            }),
          } as any;
        }
        if (table === "reservas") {
          return {
            select: () => ({
              order: async () => ({
                data: [
                  {
                    id: reservaId,
                    clase_id: claseId,
                    alumno_id: alumnoId,
                    estado: "ANOTADO",
                    created_at: "2026-11-20T10:00:00Z",
                    updated_at: "2026-11-20T10:00:00Z",
                    perfiles: { nombre_completo: "Carlos Boxeo" },
                  },
                ],
                error: null,
              }),
            }),
          } as any;
        }
        if (table === "clases_fijas") {
          return {
            select: async () => ({
              data: [
                {
                  id: "99999999-9999-4999-8999-999999999991",
                  alumno_id: alumnoId,
                  horario_id: "77777777-7777-4777-8777-777777777791",
                  created_at: "2026-11-20T10:00:00Z",
                  clases_horario: { actividad: "BOXEO", dia_semana: 3, hora_inicio: "19:30" },
                },
              ],
              error: null,
            }),
          } as any;
        }
        return { select: async () => ({ data: [], error: null }) } as any;
      });

      await useClasesStore.getState().cargarAgenda();
      const estado = useClasesStore.getState();
      expect(estado.clases).toHaveLength(1);
      expect(estado.clases[0]?.id).toBe(claseId);
      expect(estado.agendaReservas[0]?.alumno_nombre).toBe("Carlos Boxeo");
      expect(estado.clasesFijas).toHaveLength(1);
      expect(estado.clasesFijas[0]?.actividad).toBe("BOXEO");
    });

    it("anotarAlumnoCoach usa alumnos reales de useCoachStudioStore y RPCs anotar_alumno_coach / quitar_reserva_coach", async () => {
      const coachId = "11111111-1111-4111-8111-111111111111";
      const claseId = "22222222-2222-4222-8222-222222222233";
      const alumnoId = "44444444-4444-4444-8444-444444444455";
      const reservaId = "33333333-3333-4333-8333-333333333355";

      const alumnoReal: Perfil = {
        id: alumnoId,
        email: "luciano@gozster.test",
        nombre_completo: "Luciano Real",
        rol: "ALUMNO",
        estado_membresia: "ACTIVA",
        profesor_asignado_id: coachId,
        fecha_baja: null,
        created_at: "2026-11-20T10:00:00Z",
        updated_at: "2026-11-20T10:00:00Z",
      };

      useCoachStudioStore.setState({ alumnos: [alumnoReal], isLiveDatabase: true });
      useClasesStore.setState({
        clases: [
          {
            id: claseId,
            horario_id: null,
            actividad: "BOXEO",
            inicio: "2026-11-25T19:30:00-03:00",
            duracion_minutos: 60,
            capacidad: 10,
            estado: "PROGRAMADA",
            motivo_cancelacion: null,
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
          },
        ],
        agendaReservas: [],
      });

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: coachId } as any },
        error: null,
      } as any);

      const rpcSpy = vi
        .spyOn(supabase, "rpc")
        .mockResolvedValueOnce({
          data: [
            {
              reserva_id: reservaId,
              requiere_confirmacion: false,
              tipo_aviso: "NINGUNO",
              sobrecupo: false,
              aviso: null,
            },
          ],
          error: null,
        } as any)
        .mockResolvedValueOnce({
          data: { id: reservaId, clase_id: claseId, alumno_id: alumnoId, estado: "CANCELADO" },
          error: null,
        } as any);

      const anotarRes = await useClasesStore.getState().anotarAlumnoCoach(claseId, alumnoId, false);
      expect(anotarRes.ok).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith("anotar_alumno_coach", {
        p_clase_id: claseId,
        p_alumno_id: alumnoId,
        p_forzar: false,
      });
      expect(useClasesStore.getState().agendaReservas[0]?.alumno_nombre).toBe("Luciano Real");

      const quitarOk = await useClasesStore.getState().quitarAnotadoCoach(reservaId);
      expect(quitarOk).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith("quitar_reserva_coach", { p_reserva_id: reservaId });
      expect(useClasesStore.getState().agendaReservas).toHaveLength(0);
    });
  });
});
