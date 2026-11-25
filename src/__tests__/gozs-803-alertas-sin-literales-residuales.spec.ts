import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCriticalAlerts,
  getReactiveCriticalAlerts,
} from "@/components/coach/critical-alerts-data";
import {
  useCriticalAlertsStore,
  useDemoAlertEstados,
  getReactiveAlertsForStudent,
} from "@/components/coach/critical-alerts-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useAthleteStore } from "@/store/use-athlete-store";

const ALUMNO_ID_A = "11111111-1111-4111-8111-111111111111";
const ALUMNO_ID_B = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/supabase/client", async () => {
  const { createSupabaseClientMock } = await import("./helpers/supabase-client-mock");
  return {
    supabase: createSupabaseClientMock({
      tables: {
        alumno_historial_dolor: [
          {
            id: "dolor-803-a",
            alumno_id: "11111111-1111-4111-8111-111111111111",
            ejercicio_id: "ej-1",
            zona_articular: "RODILLA",
            severidad: "AGUDO",
            momento_aparicion: "EN_SERIE",
            es_sintoma_alarma: true,
            sintomas_alarma: [],
            notas_alumno: "x",
            estado: "PENDIENTE",
            created_at: "2026-11-24T10:00:00Z",
            ejercicios: { id: "ej-1", nombre: "Sentadilla" },
            perfiles: { id: "11111111-1111-4111-8111-111111111111", nombre_completo: "Fernando Pérez" },
          },
        ],
      },
    }),
  };
});

describe("GOZS-803: alertas de dolor sin literales residuales ni falsos positivos", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ pendingEvents: [], isOnline: true });
    useCriticalAlertsStore.getState().clearAlerts();
    useDemoAlertEstados.setState({ estados: {} });
    useAthleteStore.getState().resetSessionToDefaults();
  });

  it("fetchCriticalAlerts conserva el nombre y el id reales de un alumno llamado Fernando", async () => {
    const alerts = await fetchCriticalAlerts();
    const a = alerts.find((x) => x.id === "dolor-803-a");
    expect(a?.alumnoNombre).toBe("Fernando Pérez");
    expect(a?.alumnoId).toBe(ALUMNO_ID_A);
  });

  it("getReactiveCriticalAlerts conserva nombre/id reales y no cruza alumnos", () => {
    const base = {
      exerciseName: "Sentadilla",
      zonaArticular: "RODILLA",
      severidad: "AGUDO",
      esSintomaAlarma: true,
    };
    useOfflineQueueStore.getState().enqueueEvent({
      id: "offline-803-a",
      action: "PAIN_REPORT_SUBMITTED",
      payload: { ...base, studentId: ALUMNO_ID_A, studentName: "Fernando Pérez" },
    });
    useOfflineQueueStore.getState().enqueueEvent({
      id: "offline-803-b",
      action: "PAIN_REPORT_SUBMITTED",
      payload: { ...base, studentId: ALUMNO_ID_B, studentName: "Lucía Gómez" },
    });

    const alerts = getReactiveCriticalAlerts();
    const a = alerts.find((x) => x.id === "offline-803-a");
    expect(a?.alumnoNombre).toBe("Fernando Pérez");
    expect(a?.alumnoId).toBe(ALUMNO_ID_A);

    const porId = useCriticalAlertsStore.getState();
    porId.setAlerts(alerts);
    expect(porId.getAlertsForAlumno(ALUMNO_ID_A).map((x) => x.id)).toEqual(
      expect.not.arrayContaining(["offline-803-b"]),
    );
    expect(getReactiveAlertsForStudent(ALUMNO_ID_B).length).toBe(1);
    expect(getReactiveAlertsForStudent(ALUMNO_ID_B)[0]?.label).toBeDefined();
  });

  it("sin studentName usa el fallback genérico", () => {
    useOfflineQueueStore.getState().enqueueEvent({
      id: "offline-803-c",
      action: "PAIN_REPORT_SUBMITTED",
      payload: { zonaArticular: "LUMBAR", severidad: "AGUDO", esSintomaAlarma: true },
    });
    const a = getReactiveCriticalAlerts().find((x) => x.id === "offline-803-c");
    expect(a?.alumnoNombre).toBe("Alumno GOZSter");
    expect(a?.alumnoId).toBe("");
  });
});

describe("GOZS-803: guard G4 — sin PII residual en src/ ni en .next/static", () => {
  // Patrones construidos por partes para no reintroducir el literal en el repo.
  const patterns = [
    ["66b92b9a", "1ce7", "4e2e", "a47c", "7c5600000000"].join("-"),
    ["Ros", "ales"].join(""),
    ["FER ", "ROSALES"].join(""),
  ].map((p) => new RegExp(p, "i"));

  const root = path.resolve(__dirname, "../..");

  function walk(dir: string, skipTests: boolean, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skipTests && e.name === "__tests__") continue;
        walk(p, skipTests, out);
      } else if (/\.(tsx?|jsx?|json|css|html|js|mjs)$/.test(e.name)) {
        out.push(p);
      }
    }
    return out;
  }

  function offenders(files: string[]): string[] {
    return files.filter((f) => {
      const txt = fs.readFileSync(f, "utf8");
      return patterns.some((re) => re.test(txt));
    });
  }

  it("src/ (excluyendo __tests__) no contiene el UUID, apellido ni rutina eliminados", () => {
    expect(offenders(walk(path.join(root, "src"), true))).toEqual([]);
  });

  it("los chunks compilados de .next/static (si existen) no contienen PII residual", () => {
    expect(offenders(walk(path.join(root, ".next", "static"), false))).toEqual([]);
  });
});
