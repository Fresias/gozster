import { describe, expect, it } from "vitest";
import { calcularRachaAsistenciasClases } from "@/lib/athlete-dias";
import {
  clasesUsadasEstaSemana,
  obtenerLimiteSemanalClases,
  tieneMembresiaOReservasClases,
} from "@/lib/clases";
import type { Clase, Reserva } from "@/types/database.types";

const makeClase = (
  id: string,
  inicio: string,
  estado: Clase["estado"] = "PROGRAMADA",
): Clase => ({
  id,
  horario_id: null,
  actividad: "FUNCIONAL",
  inicio,
  duracion_minutos: 60,
  capacidad: 12,
  estado,
  motivo_cancelacion: null,
  created_at: "",
  updated_at: "",
});

const makeReserva = (clase_id: string, estado: Reserva["estado"]): Reserva => ({
  id: `res-${clase_id}-${estado}`,
  clase_id,
  alumno_id: "al-1",
  estado,
  created_at: "",
  updated_at: "",
});

describe("Inicio clases · lógica pura (GOZS-662 / GOZS-668)", () => {
  const ahora = new Date("2026-11-20T12:00:00-03:00"); // viernes de la semana 2026-11-16..2026-11-22

  describe("clasesUsadasEstaSemana", () => {
    it("cuenta solo clases dentro de la semana en curso con estado ANOTADO o AUSENTE", () => {
      const clases = [
        makeClase("sem-pasada", "2026-11-11T19:00:00-03:00"),
        makeClase("sem-lun", "2026-11-16T19:00:00-03:00"),
        makeClase("sem-mie", "2026-11-18T19:00:00-03:00"),
        makeClase("sem-jue", "2026-11-19T19:00:00-03:00"),
        makeClase("sem-vie", "2026-11-20T19:00:00-03:00"),
        makeClase("sem-prox", "2026-11-25T19:00:00-03:00"),
      ];
      const reservas = [
        makeReserva("sem-pasada", "ANOTADO"),
        makeReserva("sem-lun", "ANOTADO"),
        makeReserva("sem-mie", "AUSENTE"),
        makeReserva("sem-jue", "CANCELADO"),
        makeReserva("sem-vie", "ANULADO"),
        makeReserva("sem-prox", "ANOTADO"),
      ];

      expect(clasesUsadasEstaSemana(reservas, clases, ahora)).toBe(2);
    });
  });

  describe("obtenerLimiteSemanalClases", () => {
    it("prioriza limite_semanal del plan y cae a veces_por_semana o null (pase libre)", () => {
      expect(obtenerLimiteSemanalClases({ plan: { limite_semanal: 3 } })).toBe(3);
      expect(
        obtenerLimiteSemanalClases({
          plan: null,
          actividadesAlumno: [{ actividad: "BOXEO", pase_libre: false, veces_por_semana: 2 }],
          habilitadas: ["BOXEO"],
        }),
      ).toBe(2);
      expect(
        obtenerLimiteSemanalClases({
          plan: { limite_semanal: null },
          actividadesAlumno: [{ actividad: "FUNCIONAL", pase_libre: true, veces_por_semana: null }],
          habilitadas: ["FUNCIONAL"],
        }),
      ).toBeNull();
    });
  });

  describe("tieneMembresiaOReservasClases", () => {
    it("detecta alumno de clases por plan, contratación presencial, actividades o reserva ANOTADO", () => {
      expect(tieneMembresiaOReservasClases({ plan: { id: "pm-1" } })).toBe(true);
      expect(tieneMembresiaOReservasClases({ actividadesHabilitadas: ["FUNCIONAL"] })).toBe(true);
      expect(
        tieneMembresiaOReservasClases({
          membresia: { estado: "VIGENTE", plan_membresia_id: null, actividad: "BOXEO" },
        }),
      ).toBe(true);
      expect(tieneMembresiaOReservasClases({ misReservas: [{ estado: "ANOTADO" }] })).toBe(true);
    });

    it("retorna false si no tiene membresía de clases (incluyendo solo RUTINAS, vencida o cancelada)", () => {
      expect(tieneMembresiaOReservasClases({})).toBe(false);
      expect(
        tieneMembresiaOReservasClases({
          membresia: { estado: "VIGENTE", plan_membresia_id: null, actividad: "RUTINAS" },
        }),
      ).toBe(false);
      expect(
        tieneMembresiaOReservasClases({
          membresia: { estado: "VENCIDA", plan_membresia_id: "pm-1", actividad: "FUNCIONAL" },
        }),
      ).toBe(false);
      expect(tieneMembresiaOReservasClases({ misReservas: [{ estado: "CANCELADO" }] })).toBe(false);
    });
  });

  describe("calcularRachaAsistenciasClases", () => {
    it("cuenta semanas consecutivas solo con reservas ANOTADO en clases PROGRAMADA ya iniciadas", () => {
      const clases = [
        makeClase("w-2", "2026-11-04T19:00:00-03:00", "PROGRAMADA"),
        makeClase("w-1", "2026-11-11T19:00:00-03:00", "PROGRAMADA"),
        makeClase("w-0-pasada", "2026-11-18T19:00:00-03:00", "PROGRAMADA"),
        makeClase("w-0-futura", "2026-11-20T19:00:00-03:00", "PROGRAMADA"),
      ];
      const reservas = [
        makeReserva("w-2", "ANOTADO"),
        makeReserva("w-1", "ANOTADO"),
        makeReserva("w-0-pasada", "ANOTADO"),
        makeReserva("w-0-futura", "ANOTADO"),
      ];

      expect(calcularRachaAsistenciasClases(reservas, clases, ahora)).toBe(3);
    });

    it("no cuenta AUSENTE, CANCELADO, ANULADO, clases CANCELADA ni clases futuras", () => {
      const clases = [
        makeClase("w-1-ausente", "2026-11-11T19:00:00-03:00", "PROGRAMADA"),
        makeClase("w-1-cancelada", "2026-11-12T19:00:00-03:00", "CANCELADA"),
        makeClase("w-0-futura", "2026-11-20T19:00:00-03:00", "PROGRAMADA"),
        makeClase("w-0-anulada", "2026-11-18T19:00:00-03:00", "PROGRAMADA"),
      ];
      const reservas = [
        makeReserva("w-1-ausente", "AUSENTE"),
        makeReserva("w-1-cancelada", "ANOTADO"),
        makeReserva("w-0-futura", "ANOTADO"),
        makeReserva("w-0-anulada", "CANCELADO"),
      ];

      expect(calcularRachaAsistenciasClases(reservas, clases, ahora)).toBe(0);
    });

    it("mantiene la racha si la semana en curso aún no tuvo asistencias pero la semana pasada sí", () => {
      const clases = [
        makeClase("w-2", "2026-11-04T19:00:00-03:00", "PROGRAMADA"),
        makeClase("w-1", "2026-11-11T19:00:00-03:00", "PROGRAMADA"),
        makeClase("w-0-futura", "2026-11-20T19:00:00-03:00", "PROGRAMADA"),
      ];
      const reservas = [
        makeReserva("w-2", "ANOTADO"),
        makeReserva("w-1", "ANOTADO"),
        makeReserva("w-0-futura", "ANOTADO"),
      ];

      expect(calcularRachaAsistenciasClases(reservas, clases, ahora)).toBe(2);
    });
  });
});
