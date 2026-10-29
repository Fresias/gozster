// QA GOZS-201: solo gaps no cubiertos por plausibilidad-series, athlete-plausibility-guards,
// registro-series-plausibilidad-tester, athlete-offline-silent-sync y athlete-youtube-video.
// Casos atómicos: un caso = una entrada = un resultado. IDs referenciados en docs/qa/qa-movil-2026-10-29.md.
// Los `it.fails` reproducen bugs abiertos: el que los arregle debe convertirlos en `it`.
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { evaluarPlausibilidadSerie, normalizarEntradaSerie } from "@/lib/plausibilidad-series";
import { extractYouTubeVideoId, getYouTubeEmbedUrl } from "@/lib/youtube";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const leer = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("GOZS-201 · Entradas absurdas en peso/reps/RPE (gaps)", () => {
  it.each([
    ["QA-201-01", "💪", "10"],
    ["QA-201-02", "20kg", "10"],
    ["QA-201-03", "١٢", "10"], // dígitos arábigos
    ["QA-201-04", "‮02", "10"], // bidi override
    ["QA-201-05", "2".repeat(10_000), "10"], // 10.000 chars
    ["QA-201-06", "' OR 1=1--", "10"],
    ["QA-201-07", "<img src=x onerror=alert(1)>", "10"],
    ["QA-201-08", "{{7*7}}", "10"],
    ["QA-201-09", "20", "💪"],
    ["QA-201-10", "20", "abc"],
  ])("%s rechaza peso=%j reps=%j sin romper", (_id, peso, reps) => {
    const res = evaluarPlausibilidadSerie({ peso, reps });
    expect(res.estado).toBe("bloqueado");
  });

  it("QA-201-11 bloquea 1e9 kg ingresado como número", () => {
    expect(evaluarPlausibilidadSerie({ peso: 1e9, reps: 5 }).estado).toBe("bloqueado");
  });

  it("QA-201-12 bloquea Infinity kg ingresado como número", () => {
    expect(evaluarPlausibilidadSerie({ peso: Infinity, reps: 5 }).estado).toBe("bloqueado");
  });

  it("QA-201-13 pide confirmación: 200 kg en pecho con historial de 20 kg", () => {
    const res = evaluarPlausibilidadSerie({
      peso: "200",
      reps: "8",
      historialPesos: [20, 20, 20],
      musculos: ["pecho"],
      nombreEjercicio: "Press plano con barra",
    });
    expect(res.estado).toBe("requiere_confirmacion");
  });

  it("QA-201-14 bloquea 120 kg en bíceps sin historial", () => {
    const res = evaluarPlausibilidadSerie({ peso: 120, reps: 8, musculos: ["bíceps"], nombreEjercicio: "Curl" });
    expect(res.estado).toBe("bloqueado");
  });

  it("QA-201-15 pide confirmación: 120 kg en bíceps con historial de 15 kg", () => {
    const res = evaluarPlausibilidadSerie({
      peso: 120,
      reps: 8,
      historialPesos: [15, 15],
      musculos: ["bíceps"],
      nombreEjercicio: "Curl",
    });
    expect(res.estado).toBe("requiere_confirmacion");
  });

  it("QA-201-16 RPE 10,5 con coma decimal se rechaza", () => {
    expect(normalizarEntradaSerie("20", "10", "10,5").valido).toBe(false);
  });

  it("QA-201-17 el tope del cliente (500 kg) es más estricto que el CHECK de BD (1000 kg)", () => {
    expect(evaluarPlausibilidadSerie({ peso: 501, reps: 1 }).estado).toBe("bloqueado");
    expect(leer("supabase/migrations/20261028130000_registro_series_checks_plausibilidad.sql")).toMatch(
      /peso_kg >= 0 AND peso_kg <= 1000/,
    );
  });
});

describe("GOZS-201 · XSS en URLs de video (gaps)", () => {
  it("QA-201-20 un ID inyectado tras 'javascript:' solo produce un embed del host fijo nocookie", () => {
    const url = getYouTubeEmbedUrl("javascript:alert(1)//youtu.be/AAAAAAAAAAA");
    expect(url?.startsWith("https://www.youtube-nocookie.com/embed/")).toBe(true);
  });

  it("QA-201-21 '\"><script>' no produce ID de video", () => {
    expect(extractYouTubeVideoId('"><script>alert(1)</script>')).toBeNull();
  });

  it("QA-201-22 el único dangerouslySetInnerHTML del front es el script constante de tema", () => {
    const layout = leer("src/app/layout.tsx");
    expect(layout).toMatch(/dangerouslySetInnerHTML=\{\{ __html: themeInitScript \}\}/);
    expect(layout).toMatch(/const themeInitScript = `/);
  });
});

describe("GOZS-201 · Escalada de rol vía perfiles (gaps)", () => {
  const trigger = leer("supabase/migrations/20261019100000_nivel_vista_alumno_cuestionario_inicial.sql");

  it("QA-201-30 el alumno no puede cambiar su propio rol", () => {
    expect(trigger).toMatch(/IF NEW\.rol IS DISTINCT FROM OLD\.rol THEN\s+RAISE EXCEPTION/);
  });

  it("QA-201-31 el alumno no puede auto-activar su membresía ni reasignarse entrenador", () => {
    expect(trigger).toMatch(/NEW\.estado_membresia IS DISTINCT FROM OLD\.estado_membresia/);
    expect(trigger).toMatch(/NEW\.profesor_asignado_id IS DISTINCT FROM OLD\.profesor_asignado_id/);
    expect(trigger).toMatch(/OLD\.id <> auth\.uid\(\)/);
  });
});

describe("GOZS-201 · Sync offline→online y doble tap (bugs abiertos)", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useAthleteStore.getState().resetSessionToDefaults();
  });

  const eventosDeSerie = (setNumber: number) =>
    useOfflineQueueStore
      .getState()
      .pendingEvents.filter((e) => e.action === "WORKOUT_SET_COMPLETED" && e.payload.setNumber === setNumber);

  it("QA-201-40 completar una serie encola exactamente un WORKOUT_SET_COMPLETED", () => {
    const ejId = useAthleteStore.getState().currentSession.ejercicios[0]!.id;
    useAthleteStore.getState().completeSet(ejId, 1);
    expect(eventosDeSerie(1)).toHaveLength(1);
  });

  // BUG-201-B (P2): completeSet no corta si la serie ya estaba completada.
  it.fails("QA-201-41 doble tap en 'Completar serie' no duplica el evento a sincronizar", () => {
    const ejId = useAthleteStore.getState().currentSession.ejercicios[0]!.id;
    useAthleteStore.getState().completeSet(ejId, 1);
    useAthleteStore.getState().completeSet(ejId, 1);
    expect(eventosDeSerie(1)).toHaveLength(1);
  });

  // BUG-201-A (P0): flushQueue vacía la cola sin enviarla; nada escribe registro_series.
  it.fails("QA-201-42 al volver la señal sin capa de envío, la serie completada no se descarta", () => {
    const ejId = useAthleteStore.getState().currentSession.ejercicios[0]!.id;
    useAthleteStore.getState().completeSet(ejId, 1);
    useOfflineQueueStore.getState().flushQueue();
    expect(eventosDeSerie(1)).toHaveLength(1);
  });
});
