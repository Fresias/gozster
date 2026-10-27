import { beforeEach, describe, expect, it } from "vitest";
import { useClasesStore } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import {
  detectarSolapes,
  diasDelMes,
} from "@/lib/clases";
import {
  DEMO_ALUMNOS_CLASES,
} from "@/services/coach-demo-dataset";
import type { Clase } from "@/types/database.types";

describe("Agenda de Clases en Coach Studio (GOZS-184 / GH #181)", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useClasesStore.getState().resetDemoDataset();
  });

  describe("Criterio Gherkin: Anotación manual de alumnos y validación de suscripción", () => {
    it("GIVEN una clase con cupo N WHEN el coach anota un alumno sin suscripción vigente THEN se le avisa y puede forzar con confirmación", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;
      expect(clase).toBeDefined();

      // Tomás Ledesma tiene membresía VENCIDA
      const tomas = DEMO_ALUMNOS_CLASES.find((a) => a.id === "demo-alumno-tomas");
      expect(tomas).toBeDefined();

      // Intento sin forzar: debe avisar y requerir confirmación
      const intento1 = await store.anotarAlumnoCoach(clase.id, tomas!.id, false);
      expect(intento1.ok).toBe(false);
      expect(intento1.requiereConfirmacion).toBe(true);
      expect(intento1.advertencia).toContain("no tiene una suscripción vigente");

      // Forzar con confirmación: debe registrar la reserva y quedar anotado
      const intento2 = await store.anotarAlumnoCoach(clase.id, tomas!.id, true);
      expect(intento2.ok).toBe(true);

      const reservaTomas = useClasesStore
        .getState()
        .agendaReservas.find((r) => r.clase_id === clase.id && r.alumno_id === tomas!.id);
      expect(reservaTomas).toBeDefined();
      expect(reservaTomas?.estado).toBe("ANOTADO");
    });

    it("GIVEN una clase con cupo flexible lleno WHEN el coach anota a un alumno THEN se le avisa de sobrecupo y permite anotar", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      // Ajustamos cupo a 1 para forzar sobrecupo inmediato
      await store.actualizarCupoClase(clase.id, 1);

      // Anotamos a Valentina (suscripción vigente)
      const resVal = await store.anotarAlumnoCoach(clase.id, "demo-alumno-valentina", true);
      expect(resVal.ok).toBe(true);

      // Ahora intentamos anotar a Sofía (pase libre vigente): la clase ya alcanzó su cupo 1/1
      const resSofiaSinForzar = await store.anotarAlumnoCoach(clase.id, "demo-alumno-sofia", false);
      expect(resSofiaSinForzar.ok).toBe(false);
      expect(resSofiaSinForzar.requiereConfirmacion).toBe(true);
      expect(resSofiaSinForzar.advertencia).toContain("sobrecupo");

      // Forzamos sobrecupo (cupo flexible)
      const resSofiaForzada = await store.anotarAlumnoCoach(clase.id, "demo-alumno-sofia", true);
      expect(resSofiaForzada.ok).toBe(true);

      const anotados = useClasesStore
        .getState()
        .agendaReservas.filter((r) => r.clase_id === clase.id && r.estado === "ANOTADO");
      expect(anotados.length).toBeGreaterThanOrEqual(2);
    });

    it("GIVEN un alumno con límite semanal alcanzado WHEN el coach intenta anotarlo THEN avisa del límite semanal y permite forzar", async () => {
      const store = useClasesStore.getState();
      // Valentina tiene Funcional 2x (límite 2 por semana)
      const clase1 = store.clases[0]!;
      const clase2 = store.clases[1]!;
      const clase3 = store.clases[2] ?? store.clases[0]!;

      await store.anotarAlumnoCoach(clase1.id, "demo-alumno-valentina", true);
      await store.anotarAlumnoCoach(clase2.id, "demo-alumno-valentina", true);

      // Intento en 3ra clase de la semana:
      if (clase3.id !== clase1.id && clase3.id !== clase2.id) {
        const resTercera = await store.anotarAlumnoCoach(clase3.id, "demo-alumno-valentina", false);
        expect(resTercera.ok).toBe(false);
        expect(resTercera.requiereConfirmacion).toBe(true);
        expect(resTercera.advertencia).toContain("semana");

        // Puede forzar con confirmación
        const resForzada = await store.anotarAlumnoCoach(clase3.id, "demo-alumno-valentina", true);
        expect(resForzada.ok).toBe(true);
      }
    });

    it("GIVEN un alumno ya anotado en una clase WHEN se intenta anotar nuevamente THEN rechaza con error de duplicado", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      await store.anotarAlumnoCoach(clase.id, "demo-alumno-valentina", true);
      const resRepetido = await store.anotarAlumnoCoach(clase.id, "demo-alumno-valentina", true);
      expect(resRepetido.ok).toBe(false);
      expect(resRepetido.advertencia).toContain("Ya estás anotado");
    });
  });

  describe("CRUD de clases en Coach Studio: Crear, Mover, Redimensionar y Cupo flexible", () => {
    it("permite crear una nueva clase con cupo flexible y duración", async () => {
      const store = useClasesStore.getState();
      const iniciales = store.clases.length;

      const nueva = await store.crearClase({
        actividad: "BOXEO",
        inicio: "2026-10-30T18:00:00-03:00",
        duracion_minutos: 60,
        capacidad: 8,
      });

      expect(nueva.id).toBeDefined();
      expect(nueva.actividad).toBe("BOXEO");
      expect(nueva.capacidad).toBe(8);
      expect(nueva.estado).toBe("PROGRAMADA");
      expect(useClasesStore.getState().clases.length).toBe(iniciales + 1);
    });

    it("permite mover una clase a otro horario o día", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;
      const nuevoHorario = "2026-10-28T10:30:00-03:00";

      const ok = await store.moverClase(clase.id, nuevoHorario);
      expect(ok).toBe(true);

      const actualizada = useClasesStore.getState().clases.find((c) => c.id === clase.id);
      expect(actualizada?.inicio).toBe(nuevoHorario);
    });

    it("permite redimensionar la duración de una clase (ej. 60 -> 90 min)", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      const ok = await store.redimensionarClase(clase.id, 90);
      expect(ok).toBe(true);

      const actualizada = useClasesStore.getState().clases.find((c) => c.id === clase.id);
      expect(actualizada?.duracion_minutos).toBe(90);
    });

    it("permite editar el cupo flexible de una clase existente", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      const ok = await store.actualizarCupoClase(clase.id, 12);
      expect(ok).toBe(true);

      const actualizada = useClasesStore.getState().clases.find((c) => c.id === clase.id);
      expect(actualizada?.capacidad).toBe(12);
    });

    it("permite quitar a un alumno de la clase", async () => {
      const store = useClasesStore.getState();
      const clase = store.clases[0]!;

      await store.anotarAlumnoCoach(clase.id, "demo-alumno-valentina", true);
      const reserva = useClasesStore
        .getState()
        .agendaReservas.find((r) => r.clase_id === clase.id && r.alumno_id === "demo-alumno-valentina");
      expect(reserva).toBeDefined();

      const ok = await store.quitarAnotadoCoach(reserva!.id);
      expect(ok).toBe(true);

      const buscada = useClasesStore
        .getState()
        .agendaReservas.find((r) => r.id === reserva!.id);
      expect(buscada).toBeUndefined();
    });

    it("permite alternar entre vistas de agenda: día, semana y mes", () => {
      const store = useClasesStore.getState();
      expect(store.vista).toBe("semana");

      store.setVista("dia");
      expect(useClasesStore.getState().vista).toBe("dia");

      store.setVista("mes");
      expect(useClasesStore.getState().vista).toBe("mes");

      store.setVista("semana");
      expect(useClasesStore.getState().vista).toBe("semana");
    });
  });

  describe("Funciones auxiliares: Solapes y Vista Mes (Ponytail)", () => {
    it("detectarSolapes asigna columnas independientes a clases que coinciden en horario", () => {
      const clasesSolapadas: Pick<Clase, "id" | "inicio" | "duracion_minutos">[] = [
        {
          id: "c1",
          inicio: "2026-10-28T18:00:00-03:00",
          duracion_minutos: 60,
        },
        {
          id: "c2",
          inicio: "2026-10-28T18:30:00-03:00",
          duracion_minutos: 60,
        },
        {
          id: "c3",
          inicio: "2026-10-28T20:00:00-03:00",
          duracion_minutos: 60,
        },
      ];

      const solapes = detectarSolapes(clasesSolapadas);
      expect(solapes.has("c1")).toBe(true);
      expect(solapes.has("c2")).toBe(true);
      expect(solapes.has("c3")).toBe(true);

      const s1 = solapes.get("c1")!;
      const s2 = solapes.get("c2")!;
      const s3 = solapes.get("c3")!;

      // c1 y c2 se solapan entre sí
      expect(s1.columna).not.toBe(s2.columna);
      expect(s1.totalColumnas).toBeGreaterThanOrEqual(2);
      expect(s2.totalColumnas).toBeGreaterThanOrEqual(2);

      // c3 no se solapa con c1 ni c2
      expect(s3.totalColumnas).toBe(1);
    });

    it("diasDelMes genera la grilla completa alineada a lunes", () => {
      const dias = diasDelMes(new Date("2026-10-15T12:00:00-03:00"));
      expect(dias.length % 7).toBe(0);
      expect(dias.length).toBeGreaterThanOrEqual(35);
      expect(dias[0]!.diaSemana).toBe(1); // Lunes
      expect(dias[dias.length - 1]!.diaSemana).toBe(7); // Domingo
      expect(dias.some((d) => d.esMesActual && d.numero === 15)).toBe(true);
    });
  });
});
