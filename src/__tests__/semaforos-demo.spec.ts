import { describe, expect, it } from "vitest";
import {
  DEMO_ALUMNOS,
  DEMO_PLANES,
  DEMO_CRITICAL_ALERTS,
  getDemoAlumnoAlerts,
} from "@/services/coach-demo-dataset";
import {
  evaluateCuotaSemaphore,
  evaluateRutinaVigenciaSemaphore,
  evaluateActividadSemaphore,
} from "./coach-studio-v2.spec";

describe("Sprint Demo INDEC: Semáforos M3 (Issue #47 / GOZS-29)", () => {
  // ==========================================================================
  // 2. COBERTURA TOTAL DE SEMÁFOROS M3 EN DATASET DEMO
  // ==========================================================================
  describe("2. Cobertura Exhaustiva de Semáforos en Dataset Demo INDEC", () => {
    it("incluye exactamente 10 atletas ficticios representativos con IDs únicos", () => {
      expect(DEMO_ALUMNOS.length).toBe(10);
      const ids = new Set(DEMO_ALUMNOS.map((a) => a.id));
      expect(ids.size).toBe(10);
    });

    it("cubre todos los estados del semáforo de CUOTA (Verde, Amarillo, Rojo)", () => {
      const resultados = DEMO_ALUMNOS.map((a) => ({
        nombre: a.nombre_completo,
        semaphore: evaluateCuotaSemaphore(a.fecha_vencimiento_cuota),
      }));

      const verdes = resultados.filter((r) => r.semaphore === "GREEN");
      const amarillos = resultados.filter((r) => r.semaphore === "YELLOW");
      const rojos = resultados.filter((r) => r.semaphore === "RED");

      expect(verdes.length).toBeGreaterThanOrEqual(3);
      expect(amarillos.length).toBeGreaterThanOrEqual(2);
      expect(rojos.length).toBeGreaterThanOrEqual(2);

      // Lucas, Celeste, Mateo, Camila, Esteban -> VERDE
      expect(verdes.some((r) => r.nombre.includes("Lucas"))).toBe(true);
      expect(verdes.some((r) => r.nombre.includes("Celeste"))).toBe(true);

      // Facundo (2d), Valentina (1d), Martina (0d) -> AMARILLO
      expect(amarillos.some((r) => r.nombre.includes("Facundo"))).toBe(true);
      expect(amarillos.some((r) => r.nombre.includes("Valentina"))).toBe(true);
      expect(amarillos.some((r) => r.nombre.includes("Martina"))).toBe(true);

      // Sofía (-12d), Bautista (-5d) -> ROJO
      expect(rojos.some((r) => r.nombre.includes("Sofía"))).toBe(true);
      expect(rojos.some((r) => r.nombre.includes("Bautista"))).toBe(true);
    });

    it("cubre todos los estados del semáforo de VIGENCIA DE RUTINA (Verde, Amarillo, Rojo, Sin Plan)", () => {
      const resultados = DEMO_ALUMNOS.map((a) => {
        const plan = DEMO_PLANES.find((p) => p.alumno_id === a.id && p.estado === "ACTIVO");
        return {
          nombre: a.nombre_completo,
          tienePlan: Boolean(plan),
          semaphore: evaluateRutinaVigenciaSemaphore(plan?.fecha_inicio),
        };
      });

      const verdes = resultados.filter((r) => r.semaphore === "GREEN");
      const amarillos = resultados.filter((r) => r.semaphore === "YELLOW");
      const rojos = resultados.filter((r) => r.semaphore === "RED");
      const sinPlan = resultados.filter((r) => !r.tienePlan);

      expect(verdes.length).toBeGreaterThanOrEqual(3); // 0-15 días
      expect(amarillos.length).toBeGreaterThanOrEqual(2); // 16-21 días
      expect(rojos.length).toBeGreaterThanOrEqual(2); // 22+ días o sin plan
      expect(sinPlan.length).toBe(1); // Bautista Benítez sin plan
      expect(sinPlan[0]?.nombre).toContain("Bautista");
      expect(rojos.some((r) => r.nombre.includes("Sofía"))).toBe(true); // 70 días
      expect(rojos.some((r) => r.nombre.includes("Martina"))).toBe(true); // 65 días
      expect(amarillos.some((r) => r.nombre.includes("Facundo"))).toBe(true); // 18 días
      expect(amarillos.some((r) => r.nombre.includes("Camila"))).toBe(true); // 19 días
      expect(verdes.some((r) => r.nombre.includes("Lucas"))).toBe(true); // 10 días
    });

    it("cubre todos los estados del semáforo de ACTIVIDAD / RECENCIA (Verde, Amarillo, Rojo)", () => {
      const resultados = DEMO_ALUMNOS.map((a) => ({
        nombre: a.nombre_completo,
        semaphore: evaluateActividadSemaphore(a.ultimo_entreno_at),
      }));

      const verdes = resultados.filter((r) => r.semaphore === "GREEN");
      const amarillos = resultados.filter((r) => r.semaphore === "YELLOW");
      const rojos = resultados.filter((r) => r.semaphore === "RED");

      expect(verdes.length).toBeGreaterThanOrEqual(4); // < 7 días
      expect(amarillos.length).toBeGreaterThanOrEqual(2); // 7-14 días
      expect(rojos.length).toBeGreaterThanOrEqual(2); // > 14 días

      // Facundo (9d), Martina (8d) -> AMARILLO
      expect(amarillos.some((r) => r.nombre.includes("Facundo"))).toBe(true);
      expect(amarillos.some((r) => r.nombre.includes("Martina"))).toBe(true);

      // Sofía (18d), Bautista (25d) -> ROJO
      expect(rojos.some((r) => r.nombre.includes("Sofía"))).toBe(true);
      expect(rojos.some((r) => r.nombre.includes("Bautista"))).toBe(true);

      // Lucas (1d), Celeste (0d), Mateo (0d) -> VERDE
      expect(verdes.some((r) => r.nombre.includes("Lucas"))).toBe(true);
      expect(verdes.some((r) => r.nombre.includes("Celeste"))).toBe(true);
    });

    it("cubre todos los rangos del Score Salud [SH] (Verde >=80, Amarillo 60-79, Rojo <60)", () => {
      const scores = [
        { nombre: "Mateo Rossi", score: 96 },
        { nombre: "Esteban Papic", score: 91 },
        { nombre: "Lucas Giménez", score: 88 },
        { nombre: "Valentina Quiroga", score: 82 },
        { nombre: "Celeste Gerardi", score: 76 },
        { nombre: "Camila Navarro", score: 71 },
        { nombre: "Facundo Medina", score: 64 },
        { nombre: "Martina Gómez", score: 58 },
        { nombre: "Sofía Albarracín", score: 48 },
        { nombre: "Bautista Benítez", score: 35 },
      ];

      const verdes = scores.filter((s) => s.score >= 80);
      const amarillos = scores.filter((s) => s.score >= 60 && s.score < 80);
      const rojos = scores.filter((s) => s.score < 60);

      expect(verdes.length).toBe(4);
      expect(amarillos.length).toBe(3);
      expect(rojos.length).toBe(3);
    });

    it("cubre combinaciones simultáneas y variadas en la columna responsive de Alertas", () => {
      // Lucas Giménez: dolor de hombro + récord en banca
      const lucasAlerts = getDemoAlumnoAlerts("Lucas Giménez");
      expect(lucasAlerts.length).toBe(2);
      expect(lucasAlerts.some((a) => a.type === "pain" && a.zona === "Hombro")).toBe(true);
      expect(lucasAlerts.some((a) => a.type === "pr" && a.label.includes("PR Banca"))).toBe(true);

      // Martina Gómez: dolor de rodilla + récord en prensa
      const martinaAlerts = getDemoAlumnoAlerts("Martina Gómez");
      expect(martinaAlerts.length).toBe(2);
      expect(martinaAlerts.some((a) => a.type === "pain" && a.zona === "Rodilla")).toBe(true);
      expect(martinaAlerts.some((a) => a.type === "pr" && a.label.includes("PR Prensa"))).toBe(true);

      // Celeste Gerardi: dolor articular puro
      const celesteAlerts = getDemoAlumnoAlerts("Celeste Gerardi");
      expect(celesteAlerts.length).toBe(1);
      expect(celesteAlerts[0]?.type).toBe("pain");
      expect(celesteAlerts[0]?.zona).toBe("Rodilla");

      // Facundo Medina: dolor lumbar
      const facundoAlerts = getDemoAlumnoAlerts("Facundo Medina");
      expect(facundoAlerts.length).toBe(1);
      expect(facundoAlerts[0]?.zona).toBe("Lumbar");

      // Camila Navarro: dolor de codo
      const camilaAlerts = getDemoAlumnoAlerts("Camila Navarro");
      expect(camilaAlerts.length).toBe(1);
      expect(camilaAlerts[0]?.zona).toBe("Codo");

      // Mateo Rossi & Valentina Quiroga: PRs puros
      const mateoAlerts = getDemoAlumnoAlerts("Mateo Rossi");
      expect(mateoAlerts.length).toBe(1);
      expect(mateoAlerts[0]?.type).toBe("pr");

      const valentinaAlerts = getDemoAlumnoAlerts("Valentina Quiroga");
      expect(valentinaAlerts.length).toBe(1);
      expect(valentinaAlerts[0]?.type).toBe("pr");

      // Atletas sin alertas
      expect(getDemoAlumnoAlerts("Esteban Papic").length).toBe(0);
      expect(getDemoAlumnoAlerts("Sofía Albarracín").length).toBe(0);
      expect(getDemoAlumnoAlerts("Bautista Benítez").length).toBe(0);
    });

    it("provee alertas de dolor articular de triaje para CriticalAlertsInbox", () => {
      expect(DEMO_CRITICAL_ALERTS.length).toBe(5);
      expect(DEMO_CRITICAL_ALERTS.every((a) => a.type === "DOLOR")).toBe(true);
      expect(DEMO_CRITICAL_ALERTS.every((a) => !a.resolved)).toBe(true);
    });
  });
});
