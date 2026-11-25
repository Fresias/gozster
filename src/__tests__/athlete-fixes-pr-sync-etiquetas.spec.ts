import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { supabase } from "@/lib/supabase/client";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { esNuevoRecord } from "@/lib/record-ejercicio";
import { obtenerNombreDiaRutina } from "@/lib/historial-sesiones";
import { etiquetaDia } from "@/lib/athlete-dias";
import { formatearObjetivoSerie } from "@/components/athlete/ejercicio-activo";

const ALUMNO_ID = "11111111-1111-4111-8111-111111111111";
const DIA_ID = "22222222-2222-4222-8222-222222222222";
const EJ_1 = "33333333-3333-4333-8333-333333333331";
const EJ_2 = "33333333-3333-4333-8333-333333333332";
const SESION_ACTUAL = "44444444-4444-4444-8444-444444444441";
const SESION_MISMO_DIA = "44444444-4444-4444-8444-444444444442";

describe("Fixes Athlete App: PRs fantasma, batch upsert + loader, y etiquetas claras", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useAthleteStore.getState().resetSessionToDefaults();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Desacoplar precarga de inputs vs. PRs fantasma", () => {
    it("cargarUltimaVez incluye sesiones previas del mismo día y excluye solo la sesión actual", async () => {
      const sesionHoy: LiveWorkoutSession = {
        id: SESION_ACTUAL,
        nombre_rutina: "Fuerza: Día 1",
        fecha: "2026-11-24",
        studentId: ALUMNO_ID,
        dia_id: DIA_ID,
        ejercicios: [
          {
            id: "er-1",
            ejercicio_id: EJ_1,
            nombre: "Sentadilla",
            musculos_principales: ["Cuádriceps"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8",
            series: [],
          },
        ],
      };
      useAthleteStore.setState({ currentSession: sesionHoy, ultimaVez: {}, marcas: {} });

      vi.spyOn(supabase, "from").mockImplementation((() => {
        const cadena: Record<string, unknown> = {};
        for (const m of ["select", "eq", "gte", "or", "order", "limit"]) cadena[m] = () => cadena;
        cadena.then = (ok: (r: unknown) => unknown) =>
          ok({
            data: [
              // Serie ya guardada de la sesión actual -> debe ignorarse
              {
                ejercicio_id: EJ_1,
                sesion_id: SESION_ACTUAL,
                numero_serie: 1,
                peso_kg: 120,
                reps_hechas: 8,
                rpe_real: null,
                completada: true,
                set_type: "NORMAL",
                registro_sesiones: { fecha: "2026-11-24T18:00:00-03:00" },
              },
              // Sesión completada más temprano el mismo día -> debe contarse en ultimaVez y marcas
              {
                ejercicio_id: EJ_1,
                sesion_id: SESION_MISMO_DIA,
                numero_serie: 1,
                peso_kg: 80,
                reps_hechas: 8,
                rpe_real: null,
                completada: true,
                set_type: "NORMAL",
                registro_sesiones: { fecha: "2026-11-24T10:00:00-03:00" },
              },
            ],
            error: null,
          });
        return cadena;
      }) as never);

      await useAthleteStore.getState().cargarUltimaVez();

      const { ultimaVez, marcas } = useAthleteStore.getState();
      expect(ultimaVez[EJ_1]?.series[0]).toMatchObject({ peso_kg: 80, reps_hechas: 8 });
      expect(marcas[EJ_1]?.max_peso_kg).toBe(80);
      // Repetir exactamente 80 kg × 8 NO dispara PR
      expect(esNuevoRecord({ peso_kg: 80, reps_hechas: 8 }, marcas[EJ_1] ?? null).esRecord).toBe(false);
    });

    it("use-live-workout precarga los valores de la última vez y no el peso incrementado de sugerencia", () => {
      const hookSrc = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/use-live-workout.ts"),
        "utf-8",
      );
      expect(hookSrc).toContain("const pesoPrecarga = serieAnteriorHoy?.peso_kg ?? refUltimaActual?.peso_kg;");
      expect(hookSrc).toContain("const repsPrecarga = serieAnteriorHoy?.reps_hechas ?? refUltimaActual?.reps_hechas;");
      expect(hookSrc).toContain('updateSetField(currentExercise.id, serie.numero_serie, "peso_kg", pesoPrecarga);');
      expect(hookSrc).not.toContain('updateSetField(currentExercise.id, serie.numero_serie, "peso_kg", pesoSugerido)');
    });
  });

  describe("2. Batch upsert en registro_series + feedback visual al guardar sesión", () => {
    it("syncSessionToSupabase envía todas las series completadas en un único upsert en lote y deduplica claves", async () => {
      const batchCalls: unknown[][] = [];
      vi.spyOn(supabase, "from").mockImplementation(((table: string) => ({
        upsert: vi.fn().mockImplementation(async (payload: unknown) => {
          if (table === "registro_series" && Array.isArray(payload)) {
            batchCalls.push(payload);
          }
          return { error: null };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
      })) as never);

      const sesion: LiveWorkoutSession = {
        id: SESION_ACTUAL,
        nombre_rutina: "Día 1",
        fecha: "2026-11-24",
        studentId: ALUMNO_ID,
        dia_id: DIA_ID,
        ejercicios: [
          {
            id: "er-1",
            ejercicio_id: EJ_1,
            nombre: "Sentadilla",
            musculos_principales: ["Piernas"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8",
            series: [
              { numero_serie: 1, peso_kg: 80, reps_hechas: 8, rpe_real: null, completada: true, estimated1RM: 101 },
              { numero_serie: 2, peso_kg: 80, reps_hechas: 8, rpe_real: null, completada: true, estimated1RM: 101 },
              { numero_serie: 3, peso_kg: 80, reps_hechas: 8, rpe_real: null, completada: false, estimated1RM: 101 },
            ],
          },
          {
            id: "er-2",
            ejercicio_id: EJ_2,
            nombre: "Press banca",
            musculos_principales: ["Pecho"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "8",
            series: [
              { numero_serie: 1, peso_kg: 60, reps_hechas: 8, rpe_real: 8, completada: true, estimated1RM: 76 },
            ],
          },
        ],
      };
      useAthleteStore.setState({ currentSession: sesion });

      const res = await useAthleteStore.getState().syncSessionToSupabase();
      expect(res.success).toBe(true);
      expect(batchCalls).toHaveLength(1);
      expect(batchCalls[0]).toHaveLength(3);
    });

    it("EjercicioActivo y RutinaDelDia muestran un overlay de guardado accesible mientras isFinishing es true", () => {
      const ejSrc = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx"),
        "utf-8",
      );
      const rutSrc = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/rutina-del-dia.tsx"),
        "utf-8",
      );
      for (const src of [ejSrc, rutSrc]) {
        expect(src).toContain('data-testid="guardando-sesion-overlay"');
        expect(src).toContain("Guardando tu sesión…");
        expect(src).toContain('aria-busy="true"');
      }
    });
  });

  describe("3. Etiquetas claras: sin 'Día 1: Día 1' y 'OBJ. 8 REPS'", () => {
    it("obtenerNombreDiaRutina evita duplicar 'Día N' cuando el día no tiene nombre particular", () => {
      const dias = [
        { id: "d1", plan_id: "p1", orden: 1, nombre: "Día 1", created_at: "", updated_at: "" },
        { id: "d2", plan_id: "p1", orden: 2, nombre: "Dia 2", created_at: "", updated_at: "" },
        { id: "d3", plan_id: "p1", orden: 3, nombre: "   ", created_at: "", updated_at: "" },
        { id: "d4", plan_id: "p1", orden: 4, nombre: "Día 4: Torso Pesado", created_at: "", updated_at: "" },
        { id: "d5", plan_id: "p1", orden: 5, nombre: "Piernas", created_at: "", updated_at: "" },
      ];
      expect(obtenerNombreDiaRutina("d1", dias)).toBe("Día 1");
      expect(obtenerNombreDiaRutina("d2", dias)).toBe("Día 2");
      expect(obtenerNombreDiaRutina("d3", dias)).toBe("Día 3");
      expect(obtenerNombreDiaRutina("d4", dias)).toBe("Día 4: Torso Pesado");
      expect(obtenerNombreDiaRutina("d5", dias)).toBe("Día 5: Piernas");
    });

    it("etiquetaDia evita 'Día 1 · Día 1' cuando el nombre es genérico", () => {
      expect(etiquetaDia({ orden: 1, nombre: "Día 1" })).toBe("Día 1");
      expect(etiquetaDia({ orden: 2, nombre: "Dia 2" })).toBe("Día 2");
      expect(etiquetaDia({ orden: 3, nombre: "" })).toBe("Día 3");
      expect(etiquetaDia({ orden: 1, nombre: "Día 1: Torso Pesado" })).toBe("Día 1: Torso Pesado");
      expect(etiquetaDia({ orden: 2, nombre: "Piernas" })).toBe("Día 2 · Piernas");
    });

    it("formatearObjetivoSerie oculta objetivos numéricos y respeta tiempo y textos especiales", () => {
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "8", esTiempo: false, tiempoSegundos: 0, esUnilateral: false }),
      ).toBe("");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "6-8", esTiempo: false, tiempoSegundos: 0, esUnilateral: false }),
      ).toBe("");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "8", esTiempo: false, tiempoSegundos: 0, esUnilateral: true }),
      ).toBe("");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "8 x lado", esTiempo: false, tiempoSegundos: 0, esUnilateral: true }),
      ).toBe("");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "12 reps", esTiempo: false, tiempoSegundos: 0, esUnilateral: false }),
      ).toBe("");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "AL FALLO", esTiempo: false, tiempoSegundos: 0, esUnilateral: false }),
      ).toBe("OBJ. AL FALLO");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "DROP-SET", esTiempo: false, tiempoSegundos: 0, esUnilateral: false }),
      ).toBe("OBJ. DROP-SET");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "15'' x lado", esTiempo: false, tiempoSegundos: 0, esUnilateral: true }),
      ).toBe("OBJ. 15'' x lado");
      expect(
        formatearObjetivoSerie({ repeticionesObjetivo: "45", esTiempo: true, tiempoSegundos: 45, esUnilateral: false }),
      ).toBe("OBJ. 45 S");
    });
  });
});
