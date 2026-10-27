import { beforeEach, describe, expect, it } from "vitest";
import { useClasesStore } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import {
  diasDeLaSemana,
  horaLocal,
  ocupaCupo,
} from "@/lib/clases";
import {
  generarDemoClasesSemana,
  generarDemoReservasIniciales,
  DEMO_PLANES_MEMBRESIA,
} from "@/services/coach-demo-dataset";

describe("Dataset demo: cronograma semanal de clases y cupos ficticios en Modo Test (GOZS-189 / GH #189)", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useClasesStore.getState().resetDemoDataset();
  });

  describe("Estructura del cronograma semanal (generarDemoClasesSemana)", () => {
    it("genera exactamente 10 clases en la semana con cupo flexible de 15 alumnos", () => {
      const fechaRef = new Date("2026-10-26T12:00:00-03:00"); // Lunes
      const clases = generarDemoClasesSemana(fechaRef);

      expect(clases).toHaveLength(10);
      for (const clase of clases) {
        expect(clase.capacidad).toBe(15);
        expect(clase.duracion_minutos).toBe(60);
        expect(clase.estado).toBe("PROGRAMADA");
        expect(clase.motivo_cancelacion).toBeNull();
      }
    });

    it("incluye Funcional 18:00 de lunes a viernes (5 clases)", () => {
      const fechaRef = new Date("2026-10-26T12:00:00-03:00");
      const clases = generarDemoClasesSemana(fechaRef);
      const dias = diasDeLaSemana(fechaRef);

      const funcional18 = clases.filter(
        (c) => c.actividad === "FUNCIONAL" && horaLocal(c.inicio) === "18:00",
      );
      expect(funcional18).toHaveLength(5);

      // Verificamos que cubra lunes (0) a viernes (4)
      const diasCubiertos = funcional18.map((c) => c.inicio.slice(0, 10));
      for (let i = 0; i <= 4; i++) {
        expect(diasCubiertos).toContain(dias[i]?.clave);
      }
    });

    it("incluye Funcional 17:00 los martes y jueves como turno extra (2 clases)", () => {
      const fechaRef = new Date("2026-10-26T12:00:00-03:00");
      const clases = generarDemoClasesSemana(fechaRef);
      const dias = diasDeLaSemana(fechaRef);

      const funcional17 = clases.filter(
        (c) => c.actividad === "FUNCIONAL" && horaLocal(c.inicio) === "17:00",
      );
      expect(funcional17).toHaveLength(2);

      const diasCubiertos = funcional17.map((c) => c.inicio.slice(0, 10));
      expect(diasCubiertos).toContain(dias[1]?.clave); // Martes
      expect(diasCubiertos).toContain(dias[3]?.clave); // Jueves
    });

    it("incluye Boxeo 19:30 los lunes, miércoles y viernes (3 clases)", () => {
      const fechaRef = new Date("2026-10-26T12:00:00-03:00");
      const clases = generarDemoClasesSemana(fechaRef);
      const dias = diasDeLaSemana(fechaRef);

      const boxeo1930 = clases.filter(
        (c) => c.actividad === "BOXEO" && horaLocal(c.inicio) === "19:30",
      );
      expect(boxeo1930).toHaveLength(3);

      const diasCubiertos = boxeo1930.map((c) => c.inicio.slice(0, 10));
      expect(diasCubiertos).toContain(dias[0]?.clave); // Lunes
      expect(diasCubiertos).toContain(dias[2]?.clave); // Miércoles
      expect(diasCubiertos).toContain(dias[4]?.clave); // Viernes
    });
  });

  describe("Criterios Gherkin: Reparto de reservas y cupos en Coach Studio", () => {
    it("GIVEN Coach Studio en Modo Test WHEN abro Agenda en vista semana THEN veo las clases del cronograma con ocupación X/15", () => {
      const store = useClasesStore.getState();
      expect(store.vista).toBe("semana");
      expect(store.clases).toHaveLength(10);

      for (const clase of store.clases) {
        expect(clase.capacidad).toBe(15);
        const ocupados = store.agendaReservas.filter(
          (r) => r.clase_id === clase.id && ocupaCupo(r),
        ).length;

        // Ocupación válida calculada
        expect(typeof ocupados).toBe("number");
        expect(ocupados).toBeGreaterThanOrEqual(0);
      }
    });

    it("AND ningún alumno demo supera 3 clases en la semana", () => {
      const reservas = generarDemoReservasIniciales();
      const reservasPorAlumno = new Map<string, number>();

      for (const r of reservas) {
        if (!ocupaCupo(r)) continue;
        const count = reservasPorAlumno.get(r.alumno_id) ?? 0;
        reservasPorAlumno.set(r.alumno_id, count + 1);
      }

      // Debe haber alumnos distribuidos
      expect(reservasPorAlumno.size).toBeGreaterThanOrEqual(25);

      // Verificamos que NINGÚN alumno supere 3 clases semanales
      for (const [alumnoId, totalClases] of reservasPorAlumno.entries()) {
        expect(
          totalClases,
          `El alumno ${alumnoId} tiene ${totalClases} clases (máximo permitido: 3)`,
        ).toBeLessThanOrEqual(3);
      }
    });

    it("AND existe al menos una clase llena con alumnos en lista de espera / sobrecupo", () => {
      const store = useClasesStore.getState();

      // Al menos una clase con exactamente 15/15 (llena)
      const clasesLlenas = store.clases.filter((c) => {
        const ocupados = store.agendaReservas.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
        return c.capacidad !== null && ocupados === c.capacidad;
      });
      expect(clasesLlenas.length).toBeGreaterThanOrEqual(1);

      // Al menos una clase con sobrecupo / lista de espera (ocupados > capacidad)
      const clasesSobrecupo = store.clases.filter((c) => {
        const ocupados = store.agendaReservas.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
        return c.capacidad !== null && ocupados > c.capacidad;
      });
      expect(clasesSobrecupo.length).toBeGreaterThanOrEqual(1);

      // Verificamos la clase con sobrecupo específica (Miércoles 19:30 Boxeo con 16/15)
      const boxeoMiercoles = store.clases.find((c) => c.id === "demo-clase-box-miercoles")!;
      expect(boxeoMiercoles).toBeDefined();
      const ocupadosBoxMie = store.agendaReservas.filter(
        (r) => r.clase_id === boxeoMiercoles.id && ocupaCupo(r),
      ).length;
      expect(ocupadosBoxMie).toBe(16);

      // Al menos una clase con cupo libre (ocupados < 15)
      const clasesLibres = store.clases.filter((c) => {
        const ocupados = store.agendaReservas.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
        return c.capacidad !== null && ocupados < c.capacidad;
      });
      expect(clasesLibres.length).toBeGreaterThanOrEqual(1);

      // Las clases completas figuran en sinCupo del store
      expect(store.sinCupo).toContain("demo-clase-func-miercoles");
      expect(store.sinCupo).toContain("demo-clase-box-miercoles");
      expect(store.sinCupo).toContain("demo-clase-func-viernes");
    });

    it("incluye al menos un alumno con pase libre (Sofía Benítez) combinando funcional y boxeo en días distintos", () => {
      const store = useClasesStore.getState();
      const paseLibrePlan = DEMO_PLANES_MEMBRESIA.find((p) => p.id === "demo-plan-pase-libre");
      expect(paseLibrePlan).toBeDefined();
      expect(paseLibrePlan?.cantidad_actividades).toBe(2);

      // Sofía Benítez está anotada en funcional y boxeo
      const reservasSofia = store.agendaReservas.filter(
        (r) => r.alumno_id === "demo-alumno-sofia" && ocupaCupo(r),
      );
      expect(reservasSofia.length).toBeGreaterThanOrEqual(2);
      expect(reservasSofia.length).toBeLessThanOrEqual(3);

      const clasesSofia = store.clases.filter((c) =>
        reservasSofia.some((r) => r.clase_id === c.id),
      );
      const actividades = new Set(clasesSofia.map((c) => c.actividad));
      expect(actividades.has("FUNCIONAL")).toBe(true);
      expect(actividades.has("BOXEO")).toBe(true);

      // Clases en días distintos
      const diasClasesSofia = clasesSofia.map((c) => c.inicio.slice(0, 10));
      const diasUnicos = new Set(diasClasesSofia);
      expect(diasUnicos.size).toBe(clasesSofia.length);
    });

    it("conserva compatibilidad con las reservas históricas usadas en tests existentes", () => {
      const store = useClasesStore.getState();

      const r1 = store.agendaReservas.find((r) => r.id === "demo-res-mie-1");
      expect(r1).toBeDefined();
      expect(r1?.clase_id).toBe("demo-clase-func-miercoles");
      expect(r1?.alumno_nombre).toBe("Camila Navarro");

      const r2 = store.agendaReservas.find((r) => r.id === "demo-res-mie-2");
      expect(r2).toBeDefined();
      expect(r2?.clase_id).toBe("demo-clase-func-miercoles");

      const r3 = store.agendaReservas.find((r) => r.id === "demo-res-mie-3");
      expect(r3).toBeDefined();
      expect(r3?.clase_id).toBe("demo-clase-func-miercoles");

      // Lunes 18:00 inicia vacía para los tests que prueban reservar cupo libre
      const ocupadosLunes = store.agendaReservas.filter(
        (r) => r.clase_id === "demo-clase-func-lunes",
      ).length;
      expect(ocupadosLunes).toBe(0);
    });
  });
});
