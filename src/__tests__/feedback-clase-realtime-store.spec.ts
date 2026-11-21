import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase/client";
import { useClasesStore } from "@/store/use-clases-store";

describe("GOZS-672: subscribeToRealtime escucha feedback_clase en el canal existente", () => {
  beforeEach(() => {
    useClasesStore.setState({
      clases: [],
      misReservas: [],
      agendaReservas: [],
      feedbacksPorReserva: {},
      resumenClases: null,
      cargando: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maneja INSERT, UPDATE y DELETE en feedbacksPorReserva sin crear canal nuevo ni refetch", () => {
    const handlersByTable: Record<string, (payload: unknown) => void> = {};
    const mockChannel = {
      on: vi.fn(
        (
          _type: string,
          filter: { event: string; schema: string; table: string },
          cb: (payload: unknown) => void,
        ) => {
          handlersByTable[filter.table] = cb;
          return mockChannel;
        },
      ),
      subscribe: vi.fn(() => mockChannel),
    };

    const channelSpy = vi.spyOn(supabase, "channel").mockReturnValue(mockChannel as any);
    const removeSpy = vi.spyOn(supabase, "removeChannel").mockResolvedValue("ok" as any);
    const cargarAgendaSpy = vi.spyOn(useClasesStore.getState(), "cargarAgenda");
    const cargarClasesAlumnoSpy = vi.spyOn(useClasesStore.getState(), "cargarClasesAlumno");

    const unsubscribe = useClasesStore.getState().subscribeToRealtime();

    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy).toHaveBeenCalledWith("clases-reservas-global");
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
    expect(Object.keys(handlersByTable)).toEqual(["reservas", "clases", "feedback_clase"]);

    const handler = handlersByTable.feedback_clase;
    expect(handler).toBeTypeOf("function");
    if (!handler) throw new Error("Missing feedback_clase realtime handler");

    const reservaId = "res-rt-1";

    // INSERT: alumno responde "Dura" (3)
    handler({
      eventType: "INSERT",
      new: { id: "fb-1", reserva_id: reservaId, sensacion: 3 },
      old: {},
    });
    expect(useClasesStore.getState().feedbacksPorReserva).toEqual({ [reservaId]: 3 });

    // UPDATE: alumno cambia su respuesta a "Durísima" (4) sin duplicar
    handler({
      eventType: "UPDATE",
      new: { id: "fb-1", reserva_id: reservaId, sensacion: 4 },
      old: { id: "fb-1", reserva_id: reservaId, sensacion: 3 },
    });
    expect(useClasesStore.getState().feedbacksPorReserva).toEqual({ [reservaId]: 4 });
    expect(Object.keys(useClasesStore.getState().feedbacksPorReserva)).toHaveLength(1);

    // DELETE: elimina la clave del mapa
    handler({
      eventType: "DELETE",
      new: {},
      old: { id: "fb-1", reserva_id: reservaId },
    });
    expect(useClasesStore.getState().feedbacksPorReserva).toEqual({});
    expect(reservaId in useClasesStore.getState().feedbacksPorReserva).toBe(false);

    expect(cargarAgendaSpy).not.toHaveBeenCalled();
    expect(cargarClasesAlumnoSpy).not.toHaveBeenCalled();

    unsubscribe();
    expect(removeSpy).toHaveBeenCalledWith(mockChannel);
  });
});
