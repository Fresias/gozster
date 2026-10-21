import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  clasesUsadas,
  diasDeLaSemana,
  estadoTarjetaClase,
  horaLocal,
  inicioPeriodoRenovacion,
  mensajeErrorReserva,
  semanaEnCurso,
} from "@/lib/clases";
import type { Reserva } from "@/types/database.types";

// Argentina es UTC-3: lunes 00:00 ART = lunes 03:00Z.
describe("semanaEnCurso() en America/Argentina/Buenos_Aires (#113)", () => {
  it("devuelve lunes 00:00:00.000 a domingo 23:59:59.999 hora argentina", () => {
    const { inicio, fin } = semanaEnCurso(new Date("2026-10-21T15:00:00Z")); // miércoles
    expect(inicio.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-10-26T02:59:59.999Z");
  });

  it("domingo 23:59 ART sigue en la misma semana", () => {
    const { inicio } = semanaEnCurso(new Date("2026-10-26T02:59:00Z")); // dom 25 23:59 ART
    expect(inicio.toISOString()).toBe("2026-10-19T03:00:00.000Z");
  });

  it("lunes 00:00 ART abre la semana siguiente", () => {
    const { inicio, fin } = semanaEnCurso(new Date("2026-10-26T03:00:00Z"));
    expect(inicio.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-11-02T02:59:59.999Z");
  });

  it("una fecha UTC de lunes que en ART todavía es domingo cae en la semana anterior", () => {
    const { inicio } = semanaEnCurso(new Date("2026-10-26T01:30:00Z")); // dom 25 22:30 ART
    expect(inicio.toISOString()).toBe("2026-10-19T03:00:00.000Z");
  });

  it("cruza el cambio de año", () => {
    const { inicio, fin } = semanaEnCurso(new Date("2027-01-01T12:00:00Z")); // viernes
    expect(inicio.toISOString()).toBe("2026-12-28T03:00:00.000Z");
    expect(fin.toISOString()).toBe("2027-01-04T02:59:59.999Z");
  });

  it("sin argumento usa el instante actual", () => {
    const ahora = Date.now();
    const { inicio, fin } = semanaEnCurso();
    expect(inicio.getTime()).toBeLessThanOrEqual(ahora);
    expect(fin.getTime()).toBeGreaterThanOrEqual(ahora);
    expect(fin.getTime() - inicio.getTime()).toBe(7 * 86_400_000 - 1);
  });

  it("no usa librerías de fechas (Ponytail)", () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, "../lib/clases.ts"), "utf-8");
    expect(fuente).not.toMatch(/from ["'](date-fns|moment|dayjs|luxon)/);
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const lib of ["date-fns", "moment", "dayjs", "luxon"]) expect(deps[lib]).toBeUndefined();
  });
});

describe("helpers de calendario", () => {
  it("diasDeLaSemana arma lunes a domingo en hora argentina", () => {
    const dias = diasDeLaSemana(new Date("2026-10-21T15:00:00Z"));
    expect(dias.map((d) => d.etiqueta)).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
    expect(dias[0]?.clave).toBe("2026-10-19");
    expect(dias[6]?.clave).toBe("2026-10-25");
  });

  it("horaLocal muestra la hora del gimnasio", () => {
    expect(horaLocal("2026-10-21T21:30:00Z")).toBe("18:30");
  });
});

const reserva = (clase_id: string, estado: Reserva["estado"]): Reserva => ({
  id: `r-${clase_id}-${estado}`,
  clase_id,
  alumno_id: "a1",
  estado,
  created_at: "",
  updated_at: "",
});

describe("contador semanal y estado de la tarjeta", () => {
  it("cuenta ANOTADO y AUSENTE, no CANCELADO ni ANULADO ni otras semanas", () => {
    const reservas = [
      reserva("c1", "ANOTADO"),
      reserva("c2", "AUSENTE"),
      reserva("c3", "CANCELADO"),
      reserva("c4", "ANULADO"),
      reserva("otra-semana", "ANOTADO"),
    ];
    expect(clasesUsadas(reservas, [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }])).toBe(2);
    expect(clasesUsadas([], [{ id: "c1" }])).toBe(0);
  });

  const ahora = new Date("2026-10-21T15:00:00Z");
  const futura = { inicio: "2026-10-22T21:00:00Z", estado: "PROGRAMADA" as const };
  const pasada = { inicio: "2026-10-21T14:00:00Z", estado: "PROGRAMADA" as const };

  it("deshabilita cancelar cuando la clase ya comenzó", () => {
    expect(estadoTarjetaClase({ clase: futura, reserva: { estado: "ANOTADO" }, usadas: 1, limiteSemanal: 3, ahora })).toBe("RESERVADA");
    expect(estadoTarjetaClase({ clase: pasada, reserva: { estado: "ANOTADO" }, usadas: 1, limiteSemanal: 3, ahora })).toBe("RESERVADA_INICIADA");
  });

  it("bloquea por límite semanal con el cupo lleno y lo ignora en pase libre", () => {
    expect(estadoTarjetaClase({ clase: futura, usadas: 3, limiteSemanal: 3, ahora })).toBe("LIMITE");
    expect(estadoTarjetaClase({ clase: futura, usadas: 0, limiteSemanal: 3, ahora })).toBe("DISPONIBLE");
    expect(estadoTarjetaClase({ clase: futura, usadas: 9, limiteSemanal: null, ahora })).toBe("DISPONIBLE");
  });

  it("prioriza cancelada, ausente y sin cupo", () => {
    expect(estadoTarjetaClase({ clase: { ...futura, estado: "CANCELADA" }, reserva: { estado: "ANULADO" }, usadas: 0, limiteSemanal: 3, ahora })).toBe("CANCELADA");
    expect(estadoTarjetaClase({ clase: pasada, reserva: { estado: "AUSENTE" }, usadas: 1, limiteSemanal: 3, ahora })).toBe("AUSENTE");
    expect(estadoTarjetaClase({ clase: futura, usadas: 0, limiteSemanal: 3, sinCupo: true, ahora })).toBe("SIN_CUPO");
    expect(estadoTarjetaClase({ clase: pasada, usadas: 0, limiteSemanal: 3, ahora })).toBe("INICIADA");
  });
});

describe("aviso de período de renovación (POR_VENCER)", () => {
  const clase = { inicio: "2026-10-24T13:00:00Z" }; // sábado 24 10:00 ART

  it("avisa desde el día siguiente a fecha_fin", () => {
    expect(inicioPeriodoRenovacion(clase, { estado: "POR_VENCER", fecha_fin: "2026-10-22" })).toBe("23/10");
  });

  it("no avisa si la clase está dentro del período o la membresía no está por vencer", () => {
    expect(inicioPeriodoRenovacion(clase, { estado: "POR_VENCER", fecha_fin: "2026-10-24" })).toBeNull();
    expect(inicioPeriodoRenovacion(clase, { estado: "VIGENTE", fecha_fin: "2026-10-22" })).toBeNull();
    expect(inicioPeriodoRenovacion(clase, null)).toBeNull();
  });
});

describe("mensajes de error de las RPC", () => {
  it("mapea los códigos GZ00x", () => {
    expect(mensajeErrorReserva({ code: "GZ001" })).toBe("La clase no tiene más cupo.");
    expect(mensajeErrorReserva({ code: "GZ004" })).toContain("membresía");
    for (const code of ["GZ002", "GZ003", "GZ005", "GZ006", "GZ007", "GZ008", "GZ009"]) {
      expect(mensajeErrorReserva({ code })).not.toBe(mensajeErrorReserva({ code: "XX000" }));
    }
  });

  it("usa un mensaje genérico para códigos desconocidos", () => {
    expect(mensajeErrorReserva({ code: "XX000" })).toBe("No pudimos completar la acción. Probá de nuevo.");
    expect(mensajeErrorReserva(null)).toBe("");
  });
});
