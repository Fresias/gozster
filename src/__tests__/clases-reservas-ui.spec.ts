import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { useClasesStore, type ReservaAgenda } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const readSource = (relPath: string) => fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

const reservaAgenda: ReservaAgenda = {
  id: "r1",
  clase_id: "c1",
  alumno_id: "a1",
  estado: "ANOTADO",
  created_at: "",
  updated_at: "",
  alumno_nombre: "Ana",
};

describe("Store de clases y reservas (#113)", () => {
  beforeEach(() => {
    rpc.mockReset();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [] });
    useClasesStore.setState({ sinCupo: [], error: null, aviso: null, accionEnCurso: null, agendaReservas: [] });
  });

  it("reservar_clase sin cupo (GZ001) marca la clase y muestra el mensaje", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "GZ001", message: "Sin cupo" } });
    await useClasesStore.getState().reservar("c1");
    expect(rpc).toHaveBeenCalledWith("reservar_clase", { p_clase_id: "c1" });
    expect(useClasesStore.getState().sinCupo).toContain("c1");
    expect(useClasesStore.getState().error).toBe("La clase no tiene más cupo.");
  });

  it("membresía vencida (GZ004) se informa sin marcar sin cupo", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "GZ004", message: "x" } });
    await useClasesStore.getState().reservar("c1");
    expect(useClasesStore.getState().sinCupo).toEqual([]);
    expect(useClasesStore.getState().error).toContain("membresía");
  });

  it("sin conexión no llama a las RPC y conserva el caché", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    useClasesStore.setState({ agendaReservas: [reservaAgenda] });
    await useClasesStore.getState().reservar("c1");
    await useClasesStore.getState().cancelarReserva("r1");
    await useClasesStore.getState().marcarAusente("r1");
    expect(await useClasesStore.getState().cancelarClase("c1", "corte de luz")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(useClasesStore.getState().agendaReservas).toEqual([reservaAgenda]);
    expect(useClasesStore.getState().error).toContain("Sin conexión");
  });

  it("marcar ausente es optimista y se revierte si la RPC rechaza", async () => {
    useClasesStore.setState({ agendaReservas: [reservaAgenda] });
    rpc.mockResolvedValueOnce({ data: { ...reservaAgenda, estado: "AUSENTE" }, error: null });
    await useClasesStore.getState().marcarAusente("r1");
    expect(rpc).toHaveBeenCalledWith("marcar_ausente", { p_reserva_id: "r1" });
    expect(useClasesStore.getState().agendaReservas[0]?.estado).toBe("AUSENTE");

    useClasesStore.setState({ agendaReservas: [reservaAgenda] });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "x" } });
    await useClasesStore.getState().marcarAusente("r1");
    expect(useClasesStore.getState().agendaReservas[0]?.estado).toBe("ANOTADO");
    expect(useClasesStore.getState().error).toBe("No tenés permisos para esta acción.");
  });

  it("cancelar clase rechazada devuelve false con el mensaje", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "GZ007", message: "x" } });
    expect(await useClasesStore.getState().cancelarClase("c1", "corte de luz")).toBe(false);
    expect(rpc).toHaveBeenCalledWith("cancelar_clase", { p_clase_id: "c1", p_motivo: "corte de luz" });
    expect(useClasesStore.getState().error).toBe("La clase fue cancelada.");
  });

  it("persiste solo datos (no estados transitorios) para el modo offline", () => {
    const store = readSource("../store/use-clases-store.ts");
    expect(store).toContain('name: "gozster-clases"');
    expect(store).toContain("partialize");
  });
});

describe("Vistas de clases (#113)", () => {
  const athlete = readSource("../components/athlete/athlete-classes.tsx");
  const agenda = readSource("../components/coach/class-agenda.tsx");

  it("Athlete App: contador semanal, días, tarjetas y banner de renovación", () => {
    expect(athlete).toContain("clases usadas esta semana");
    expect(athlete).toContain("<DaysStrip");
    expect(athlete).toContain('data-testid="renewal-period-banner"');
    expect(athlete).toContain("Esta clase corresponde a tu período de renovación a partir del");
    expect(athlete).toContain("venció el plazo para cancelar");
    expect(athlete).toContain('size="touch"');
  });

  it("Coach Studio: ocupación, ausente en un toque y cancelación con motivo", () => {
    expect(agenda).toContain('data-testid="mark-absent-btn"');
    expect(agenda).toContain("min-h-11");
    expect(agenda).toContain("cupos");
    expect(agenda).toContain("minLength={MOTIVO_MINIMO}");
    expect(agenda).toContain("<dialog");
  });

  it("las rutas existen y están enlazadas desde los shells", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../app/(athlete)/athlete/clases/page.tsx"))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, "../app/(coach)/studio/agenda/page.tsx"))).toBe(true);
    expect(readSource("../components/athlete/athlete-shell.tsx")).toContain('href: "/athlete/clases"');
    expect(readSource("../components/coach/studio-shell.tsx")).toContain('href="/studio/agenda"');
  });
});
