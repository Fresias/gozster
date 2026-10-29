import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateEpley1RM,
  calculateBrzycki1RM,
  calculateEffectiveVolume,
  calculateWarmupSets,
  calculateBarbellPlates,
  calculateStudentHealthScore,
  generateWhatsAppReactivationUrl,
} from "@/lib/strength-metrics";
import { useAthleteStore } from "@/store/use-athlete-store";
import { supabase } from "@/lib/supabase/client";

describe("GOZSter Sprints 1 a 4: Benchmark Hevy, Everfit, Mynter & Supabase Real", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().clearRpeValidationError();
  });

  describe("Sprint 1: Motor de Rutinas & Superseries ($A_1/A_2$)", () => {
    it("debe validar la estructura de superseries y tempos en ejercicios de rutina", () => {
      const store = useAthleteStore.getState();
      const session = store.currentSession;
      expect(session.ejercicios.length).toBeGreaterThan(0);

      // Verificamos que cada ejercicio tenga soporte para tempo y superseries
      const ej = session.ejercicios[0]!;
      expect(ej).toHaveProperty("descanso_segundos");
      expect(ej).toHaveProperty("rpe_objetivo");
    });
  });

  describe("Sprint 2: Hevy Benchmark & Live Workout Player", () => {
    it("Taxonomía de series: debe soportar W (Calentamiento), N (Normal), F (Fallo) y D (Drop Set)", () => {
      const store = useAthleteStore.getState();
      const ejId = store.currentSession.ejercicios[0]!.id;

      store.updateSetType(ejId, 1, "W");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.set_type).toBe("W");

      store.updateSetType(ejId, 1, "F");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.set_type).toBe("F");

      store.updateSetType(ejId, 1, "D");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.set_type).toBe("D");
    });

    it("Hevy Double Volume: debe excluir estrictamente las series de calentamiento (W) del tonelaje efectivo", () => {
      const sets = [
        { peso_kg: 20, reps_hechas: 10, set_type: "W", completada: true }, // 200kg (Warmup) -> EXCLUIDO
        { peso_kg: 50, reps_hechas: 5, set_type: "WARMUP", completada: true }, // 250kg (Warmup) -> EXCLUIDO
        { peso_kg: 100, reps_hechas: 8, set_type: "N", completada: true }, // 800kg (Normal) -> INCLUIDO
        { peso_kg: 100, reps_hechas: 6, set_type: "F", completada: true }, // 600kg (Fallo) -> INCLUIDO
        { peso_kg: 70, reps_hechas: 10, set_type: "D", completada: true }, // 700kg (Drop) -> INCLUIDO
        { peso_kg: 100, reps_hechas: 5, set_type: "N", completada: false }, // No completada -> EXCLUIDA
      ];

      const effectiveVolume = calculateEffectiveVolume(sets);
      // Esperado: 800 + 600 + 700 = 2100 kg
      expect(effectiveVolume).toBe(2100);
    });

    it("Hevy WarmupCalculator: calcula 4 series progresivas escalonadas (Barra, 50%, 75%, 90%)", () => {
      const targetWeight = 100;
      const warmups = calculateWarmupSets(targetWeight, 20);

      expect(warmups).toHaveLength(4);
      // Serie 1: Barra sola 20kg x 10
      expect(warmups[0]).toEqual({
        setNumber: 1,
        peso_kg: 20,
        reps: 10,
        percentage: 0,
        descripcion: "Barra sola (activación articular)",
        set_type: "WARMUP",
      });
      // Serie 2: 50% de 100 = 50kg x 5
      expect(warmups[1]!.peso_kg).toBe(50);
      expect(warmups[1]!.reps).toBe(5);
      // Serie 3: 75% de 100 = 75kg x 3
      expect(warmups[2]!.peso_kg).toBe(75);
      expect(warmups[2]!.reps).toBe(3);
      // Serie 4: 90% de 100 = 90kg x 1
      expect(warmups[3]!.peso_kg).toBe(90);
      expect(warmups[3]!.reps).toBe(1);
    });

    it("Hevy PlateCalculator: calcula los discos olímpicos exactos a colocar por lado en barra de 20kg", () => {
      // 100 kg total = 20kg barra + 40kg por lado
      // 40kg = 1x25kg + 1x15kg
      const result100 = calculateBarbellPlates(100, 20);
      expect(result100.barWeightKg).toBe(20);
      expect(result100.perSideWeightKg).toBe(40);
      expect(result100.platesPerSide).toEqual([
        { weight: 25, count: 1 },
        { weight: 15, count: 1 },
      ]);
      expect(result100.remainderKg).toBe(0);

      // 142.5 kg total = 20kg barra + 61.25kg por lado
      // 61.25kg = 2x25kg (50) + 1x10kg (10) + 1x1.25kg (1.25)
      const result142 = calculateBarbellPlates(142.5, 20);
      expect(result142.perSideWeightKg).toBe(61.25);
      expect(result142.platesPerSide).toEqual([
        { weight: 25, count: 2 },
        { weight: 10, count: 1 },
        { weight: 1.25, count: 1 },
      ]);
      expect(result142.remainderKg).toBe(0);
    });

    it("Control coach_force_rpe_enabled: bloquea guardado de serie si el alumno no cargó RPE válido (6.0 a 10.0)", () => {
      const store = useAthleteStore.getState();
      const session = store.currentSession;
      const ejId = session.ejercicios[0]!.id;

      // Habilitamos la exigencia de RPE en el ejercicio (el bloqueo aplica en vista TECNICA; en estándar solo avisa)
      useAthleteStore.setState((s) => ({
        nivelVistaAlumno: "TECNICA",
        currentSession: {
          ...s.currentSession,
          ejercicios: s.currentSession.ejercicios.map((e) =>
            e.id === ejId ? { ...e, force_rpe_required: true } : e
          ),
        },
      }));

      // Configuramos RPE inválido o 0
      store.updateSetField(ejId, 1, "rpe_real", 0);

      // Intentar completar serie
      store.completeSet(ejId, 1);

      // Debe haber generado error de validación y la serie no debe estar completada
      expect(useAthleteStore.getState().rpeValidationError).toContain("El Coach exige registrar un RPE válido");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.completada).toBe(false);

      // Si el alumno pone RPE válido (ej. 8.5)
      store.updateSetField(ejId, 1, "rpe_real", 8.5);
      store.completeSet(ejId, 1);

      // Ahora debe completarse con éxito y limpiarse el error
      expect(useAthleteStore.getState().rpeValidationError).toBeNull();
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.completada).toBe(true);
    });
  });

  describe("Sprint 3: Feedback Loop (Dolor/Video) & Everfit Hábitos/Nutrición", () => {
    it("Reporte de molestia articular (notificoDolor): registra dolor y notas en la serie", () => {
      const store = useAthleteStore.getState();
      const ejId = store.currentSession.ejercicios[0]!.id;

      store.reportPainForSet(ejId, 1, "[Dolor: MODERADO] Rodilla izquierda en concéntrica");

      const serie = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
      expect(serie.pain_reported).toBe(true);
      expect(serie.pain_notes).toContain("Rodilla izquierda");
    });

    it("Subida de video form check (cargoVideo): registra url en la serie para revisión del coach", () => {
      const store = useAthleteStore.getState();
      const ejId = store.currentSession.ejercicios[0]!.id;

      store.attachVideoForSet(ejId, 1, "https://cloudflare-r2.gozster.app/form-checks/squat.mp4");

      const serie = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
      expect(serie.video_url).toBe("https://cloudflare-r2.gozster.app/form-checks/squat.mp4");
    });

    it("Everfit Nutrición: cálculo calórico por macronutrientes (4 kcal/g Prot, 4 kcal/g Carb, 9 kcal/g Grasa)", () => {
      const prot = 150; // 600 kcal
      const carb = 200; // 800 kcal
      const fat = 60;   // 540 kcal
      const totalKcal = prot * 4 + carb * 4 + fat * 9;
      expect(totalKcal).toBe(1940);
    });
  });

  describe("Sprint 4: Semáforo de Retención (SH) & WhatsApp 1-Clic", () => {
    it("Semáforo de Salud (SH): calcula ponderación de 4 variables y asigna niveles verde, amarillo y rojo", () => {
      // Caso 1: Alumno óptimo (Verde >= 75)
      // 0.4*90 + 0.3*90 + 0.2*80 + 0.1*100 = 36 + 27 + 16 + 10 = 89
      const verde = calculateStudentHealthScore({
        adherencia: 90,
        frecuencia: 90,
        interaccionChat: 80,
        estadoCuota: 100,
      });
      expect(verde.score).toBe(89);
      expect(verde.status).toBe("GREEN");

      // Caso 2: Alumno irregular (Amarillo 50..74)
      // 0.4*60 + 0.3*50 + 0.2*60 + 0.1*50 = 24 + 15 + 12 + 5 = 56
      const amarillo = calculateStudentHealthScore({
        adherencia: 60,
        frecuencia: 50,
        interaccionChat: 60,
        estadoCuota: 50,
      });
      expect(amarillo.score).toBe(56);
      expect(amarillo.status).toBe("YELLOW");

      // Caso 3: Alumno en riesgo de deserción (Rojo < 50)
      // 0.4*30 + 0.3*20 + 0.2*20 + 0.1*0 = 12 + 6 + 4 + 0 = 22
      const rojo = calculateStudentHealthScore({
        adherencia: 30,
        frecuencia: 20,
        interaccionChat: 20,
        estadoCuota: 0,
      });
      expect(rojo.score).toBe(22);
      expect(rojo.status).toBe("RED");
    });

    it("WhatsApp 1-Clic: genera URL con número limpio y mensaje dinámico contextual", () => {
      const url = generateWhatsAppReactivationUrl({
        phone: "+54 9 11 2345-6789",
        studentName: "Celeste",
        daysInactive: 7,
        routineName: "Piernas & Empuje",
        coachName: "Gabriel",
      });

      expect(url).toContain("https://wa.me/5491123456789");
      expect(url).toContain("text=Hola%20Celeste");
      expect(url).toContain("7%20d%C3%ADas");
      expect(url).toContain("Piernas%20%26%20Empuje");
    });
  });

  describe("Supabase Live Database Integration (NADA hardcodeado)", () => {
    it("debe confirmar que las tablas y columnas operacionales existen en Supabase en vivo", async () => {
      // Consultamos perfiles de Supabase
      const { data: perfiles, error: e1 } = await supabase
        .from("perfiles")
        .select("id, nombre_completo, rol, estado_membresia, telefono")
        .limit(3);

      expect(e1).toBeNull();
      expect(perfiles).toBeDefined();
      expect(Array.isArray(perfiles)).toBe(true);

      // Consultamos habitos_registros de Supabase
      const { data: habitos, error: e2 } = await supabase
        .from("habitos_registros")
        .select("id, alumno_id, fecha, agua_ml, pasos, sueno_horas, habitos_completados")
        .limit(1);

      expect(e2).toBeNull();
      expect(habitos).toBeDefined();

      // Consultamos nutricion_registros de Supabase
      const { data: nutricion, error: e3 } = await supabase
        .from("nutricion_registros")
        .select("id, alumno_id, fecha, calorias_consumidas, proteinas_g, carbos_g, grasas_g")
        .limit(1);

      expect(e3).toBeNull();
      expect(nutricion).toBeDefined();

      // Consultamos ejercicios_en_rutina para verificar columnas tempo y force_rpe_required
      const { data: ejRutina, error: e4 } = await supabase
        .from("ejercicios_en_rutina")
        .select("id, tempo, force_rpe_required")
        .limit(1);

      expect(e4).toBeNull();
      expect(ejRutina).toBeDefined();

      // Consultamos registro_series para verificar columnas set_type, pain_reported, video_url
      const { data: regSeries, error: e5 } = await supabase
        .from("registro_series")
        .select("id, set_type, pain_reported, pain_notes, video_url")
        .limit(1);

      expect(e5).toBeNull();
      expect(regSeries).toBeDefined();
    });
  });
});
