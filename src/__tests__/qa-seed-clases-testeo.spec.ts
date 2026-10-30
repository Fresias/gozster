import { describe, it, expect } from "vitest";
import { generarDemoClasesSemana, generarDemoReservasIniciales } from "@/services/coach-demo-dataset";

// GOZS-196: QA del seed de clases (GOZS-194). Lunes 2026-10-26 como semana de referencia.
const REF = new Date("2026-10-28T12:00:00-03:00");
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" });
const diaSemana = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short" });

describe("seed de clases ficticias", () => {
  it("es idempotente: dos ejecuciones producen los mismos ids, sin duplicados", () => {
    const a = generarDemoClasesSemana(REF);
    const b = generarDemoClasesSemana(REF);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    expect(a.map((c) => c.inicio)).toEqual(b.map((c) => c.inicio));

    const ra = generarDemoReservasIniciales();
    const rb = generarDemoReservasIniciales();
    expect(ra.map((r) => r.id)).toEqual(rb.map((r) => r.id));
    expect(new Set(ra.map((r) => r.id)).size).toBe(ra.length);
  });

  it("no repite el par (clase, alumno) y toda reserva apunta a una clase existente", () => {
    const clases = new Set(generarDemoClasesSemana(REF).map((c) => c.id));
    const reservas = generarDemoReservasIniciales();
    const pares = reservas.map((r) => `${r.clase_id}|${r.alumno_id}`);
    expect(new Set(pares).size).toBe(pares.length);
    for (const r of reservas) expect(clases.has(r.clase_id)).toBe(true);
  });

  it("respeta el horario acordado", () => {
    const clases = generarDemoClasesSemana(REF);
    const slot = (act: string, h: string) =>
      clases.filter((c) => c.actividad === act && hora(c.inicio) === h).map((c) => diaSemana(c.inicio));
    expect(slot("FUNCIONAL", "18:00")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(slot("FUNCIONAL", "17:00")).toEqual(["Tue", "Thu"]);
    expect(slot("BOXEO", "19:30")).toEqual(["Mon", "Wed", "Fri"]);
    expect(clases).toHaveLength(10);
  });

  it("los anotados activos nunca exceden la capacidad; EN_ESPERA y CANCELADO no cuentan", () => {
    const clases = generarDemoClasesSemana(REF);
    const reservas = generarDemoReservasIniciales();
    for (const c of clases) {
      const ocupados = reservas.filter((r) => r.clase_id === c.id && ["ANOTADO", "AUSENTE"].includes(r.estado)).length;
      expect(ocupados).toBeLessThanOrEqual(c.capacidad ?? 0);
    }
    expect(reservas.some((r) => r.estado === "EN_ESPERA")).toBe(true);
    expect(reservas.some((r) => r.estado === "CANCELADO")).toBe(true);
  });

  it("la clase cancelada tiene motivo y las programadas no", () => {
    for (const c of generarDemoClasesSemana(REF)) {
      if (c.estado === "CANCELADA") expect(c.motivo_cancelacion).toBeTruthy();
      else expect(c.motivo_cancelacion).toBeNull();
    }
  });
});
