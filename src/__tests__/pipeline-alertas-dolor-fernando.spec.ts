import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  fetchCriticalAlerts,
  getDemoCriticalAlerts,
  persistAlertEstado,
  type CriticalAlert,
} from "@/components/coach/critical-alerts-data";
import {
  useCriticalAlertsStore,
  useDemoAlertEstados,
  getReactiveAlertsForStudent,
} from "@/components/coach/critical-alerts-store";
import { getDemoAlumnoAlerts, DEMO_GIMNASIO } from "@/services/coach-demo-dataset";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useAthleteStore, DEFAULT_ATHLETE_ID } from "@/store/use-athlete-store";
import { supabase } from "@/lib/supabase/client";

describe("GOZS-348: Pipeline Reactivo de Alertas de Dolor en Dashboard (Fix Caso Fernando)", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ pendingEvents: [], isOnline: true });
    useCriticalAlertsStore.getState().clearAlerts();
    useDemoAlertEstados.setState({ estados: {} });
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("1. Verificación Estricta de Migración SQL y Contrato de Base de Datos", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../supabase/migrations/20261104100000_alertas_dolor_historial_pipeline_fernando.sql"
    );

    it("existe la migración append-only de GOZS-348", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it("la migración vincula reporte_dolor_id en public.alertas_entrenador con FK e índice", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("ALTER TABLE public.alertas_entrenador");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS reporte_dolor_id UUID REFERENCES public.alumno_historial_dolor(id)");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_reporte_dolor_id");
    });

    it("actualiza fn_crear_alerta_sintoma_alarma() para poblar reporte_dolor_id y capturar dolor agudo", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fn_crear_alerta_sintoma_alarma()");
      expect(sql).toContain("reporte_dolor_id");
      expect(sql).toContain("NEW.id");
      expect(sql).toContain("NEW.es_sintoma_alarma = true OR NEW.severidad = 'AGUDO'");
      expect(sql).toContain("trg_alumno_historial_dolor_alerta_critica");
      expect(sql).toContain("AFTER INSERT OR UPDATE OF es_sintoma_alarma, severidad ON public.alumno_historial_dolor");
    });

    it("mantiene RLS estricto y prohíbe USING (true) sin autorización", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).not.toContain("USING (true)");
      expect(sql).not.toContain("WITH CHECK (true)");
    });
  });

  describe("2. Pipeline Reactivo: Reporte de Dolor en Athlete App y Detección Inmediata", () => {
    it("GIVEN un reporte en sesión activa en Athlete App THEN fetchCriticalAlerts y store lo detectan de inmediato", async () => {
      // 1. Fernando Rosales reporta un dolor en su sesión activa
      await useAthleteStore.getState().reportPainEvent({
        exerciseId: "ej-sentadilla-con-barra",
        setNumber: 1,
        zonaArticular: "RODILLA",
        intensidadNumerica: 8,
        severidad: "AGUDO",
        sintomasAlarma: ["Dolor punzante o súbito", "Inestabilidad articular"],
        esSintomaAlarma: true,
        notasAlumno: "Pinchazo agudo e inestabilidad al subir",
        momentoAparicion: "EN_SERIE",
        exerciseName: "Sentadilla Trasera con Barra",
      });

      // 2. fetchCriticalAlerts lee el reporte de inmediato
      const alerts = await fetchCriticalAlerts();
      const fernandoAlert = alerts.find(
        (a) =>
          a.alumnoNombre.includes("Fernando") ||
          a.alumnoId === DEFAULT_ATHLETE_ID ||
          a.zona === "Rodilla"
      );

      expect(fernandoAlert).toBeDefined();
      expect(fernandoAlert?.zona).toBe("Rodilla");
      expect(fernandoAlert?.severidad).toBe("CRITICA");
      expect(fernandoAlert?.esSintomaAlarma).toBe(true);
      expect(fernandoAlert?.detalle).toContain("Pinchazo agudo");
    });

    it("GIVEN Fernando Rosales con dolor reportado THEN getDemoAlumnoAlerts emite el badge reactivo 🚨 [Zona]", async () => {
      // Estado inicial: Fernando Rosales no tiene alertas
      expect(getDemoAlumnoAlerts("Fernando Rosales").length).toBe(0);

      // Fernando reporta dolor de Hombro en Press de Banca
      await useAthleteStore.getState().reportPainEvent({
        exerciseId: "ej-press-banca",
        setNumber: 2,
        zonaArticular: "HOMBRO",
        intensidadNumerica: 9,
        severidad: "AGUDO",
        sintomasAlarma: ["Irradiación o adormecimiento"],
        esSintomaAlarma: true,
        notasAlumno: "Molestia anterior aguda al descender",
        momentoAparicion: "EN_SERIE",
        exerciseName: "Press de Banca Plano",
      });

      // El badge reactivo se genera para Fernando Rosales
      const badges = getDemoAlumnoAlerts("Fernando Rosales");
      expect(badges.length).toBeGreaterThan(0);
      const painBadge = badges.find((b) => b.type === "pain");
      expect(painBadge).toBeDefined();
      expect(painBadge?.label).toBe("🚨 Hombro");
      expect(painBadge?.zona).toBe("Hombro");
      expect(painBadge?.ejercicio).toBe("Press de Banca Plano");
      expect(painBadge?.detalle).toContain("Molestia anterior aguda");
      expect((painBadge as any)?.reporteDolorId).toBeDefined();
    });

    it("Fernando Rosales figura en la lista de alumnos del Studio para renderizar su fila y badge", () => {
      const fernandoEnGimnasio = DEMO_GIMNASIO.alumnos.find(
        (a) => a.nombre_completo === "Fernando Rosales"
      );
      expect(fernandoEnGimnasio).toBeDefined();
      expect(fernandoEnGimnasio?.nombre_completo).toBe("Fernando Rosales");
    });
  });

  describe("3. Reportes sin Conexión (Offline Queue) y Severidad Dinámica sin Datasets Hardcodeados", () => {
    it("GIVEN un reporte encolado offline con severidad AGUDO THEN inbox lo expone como CRITICA sin hardcoding", async () => {
      // Simular evento encolado por el motor offline de la app
      useOfflineQueueStore.getState().enqueueEvent({
        id: "offline-pain-ev-101",
        action: "PAIN_REPORT_SUBMITTED",
        payload: {
          studentId: DEFAULT_ATHLETE_ID,
          studentName: "Fernando Rosales",
          exerciseId: "ej-peso-muerto",
          exerciseName: "Peso Muerto Rumano",
          zonaArticular: "LUMBAR",
          severidad: "AGUDO",
          esSintomaAlarma: true,
          sintomasAlarma: ["Dolor punzante o súbito"],
          notasAlumno: "Tirón lumbar severo en fase excéntrica",
          momentoAparicion: "EN_SERIE",
        },
      });

      const inboxAlerts = getDemoCriticalAlerts();
      const offlineAlert = inboxAlerts.find((a) => a.id === "offline-pain-ev-101");

      expect(offlineAlert).toBeDefined();
      expect(offlineAlert?.alumnoNombre).toBe("Fernando Rosales");
      expect(offlineAlert?.zona).toBe("Lumbar");
      expect(offlineAlert?.severidad).toBe("CRITICA");
      expect(offlineAlert?.esSintomaAlarma).toBe(true);
      expect(offlineAlert?.detalle).toContain("Tirón lumbar severo");
    });

    it("GIVEN un reporte con dolor MODERADO sin alarma THEN inbox asigna severidad ALTA y genera badge correspondiente", () => {
      useOfflineQueueStore.getState().enqueueEvent({
        id: "offline-pain-ev-102",
        action: "PAIN_REPORT_SUBMITTED",
        payload: {
          studentId: DEFAULT_ATHLETE_ID,
          studentName: "Fernando Rosales",
          exerciseId: "ej-curl-biceps",
          exerciseName: "Curl de Bíceps en Polea",
          zonaArticular: "CODO",
          severidad: "MODERADO",
          esSintomaAlarma: false,
          sintomasAlarma: [],
          notasAlumno: "Molestia leve en tendón distal",
          momentoAparicion: "EN_SERIE",
        },
      });

      const inboxAlerts = getDemoCriticalAlerts();
      const alert = inboxAlerts.find((a) => a.id === "offline-pain-ev-102");
      expect(alert).toBeDefined();
      expect(alert?.severidad).toBe("ALTA");
      expect(alert?.esSintomaAlarma).toBe(false);

      const badges = getDemoAlumnoAlerts("Fernando Rosales");
      expect(badges.some((b) => b.label === "🚨 Codo")).toBe(true);
    });

    it("GIVEN un reporte marcado como ATENDIDO o CERRADO THEN el badge de Fernando desaparece", async () => {
      const alertId = "offline-pain-ev-103";
      useOfflineQueueStore.getState().enqueueEvent({
        id: alertId,
        action: "PAIN_REPORT_SUBMITTED",
        payload: {
          studentId: DEFAULT_ATHLETE_ID,
          studentName: "Fernando Rosales",
          exerciseId: "ej-sentadilla-1",
          exerciseName: "Sentadilla Trasera con Barra",
          zonaArticular: "RODILLA",
          severidad: "AGUDO",
          esSintomaAlarma: true,
          sintomasAlarma: [],
          notasAlumno: "Molestia en flexión profunda",
        },
      });

      // El badge está activo
      expect(getDemoAlumnoAlerts("Fernando Rosales").length).toBe(1);

      // El entrenador atiende o cierra el caso
      useDemoAlertEstados.getState().setEstado(alertId, "ATENDIDO");
      await persistAlertEstado(alertId, "ATENDIDO");

      // La alerta ya no figura como PENDIENTE y el badge se apaga
      expect(getDemoAlumnoAlerts("Fernando Rosales").length).toBe(0);
    });
  });
});
