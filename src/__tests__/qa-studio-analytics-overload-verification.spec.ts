import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";
import {
  MOCK_ALUMNOS,
  MOCK_HISTORIAL_CARGAS,
  MOCK_PLANES,
  MOCK_PROFESOR_ID,
} from "@/services/coach-mock-data";
import type { Perfil, PlanEntrenamiento } from "@/types/database.types";

describe("QA Formal Audit: Studio Analytics, Progressive Overload & Edge Cases (GOZS-12 / PR #23)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T15:00:00Z"));
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useCoachStudioStore.setState({
      alumnos: JSON.parse(JSON.stringify(MOCK_ALUMNOS)),
      planes: JSON.parse(JSON.stringify(MOCK_PLANES)),
      historialCargas: JSON.parse(JSON.stringify(MOCK_HISTORIAL_CARGAS)),
      selectedAlumnoId: null,
      activeTab: "rutina_actual",
      isHistoricalLoadsOpen: false,
      isChatOpen: false,
      toast: null,
      currentPage: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. Verificación Matemática Estricta de Fórmulas de Fuerza", () => {
    it("Epley 1RM: 1RM = Peso * (1 + Reps / 30) con precisión decimal", () => {
      // 100kg x 10 reps = 100 * (1 + 10/30) = 133.333... kg
      expect(calculateEpley1RM(100, 10)).toBeCloseTo(133.333, 2);

      // 80kg x 5 reps = 80 * (1 + 5/30) = 93.333... kg
      expect(calculateEpley1RM(80, 5)).toBeCloseTo(93.333, 2);

      // 120kg x 1 rep = 120 * (1 + 1/30) = 124 kg
      expect(calculateEpley1RM(120, 1)).toBeCloseTo(124, 2);
    });

    it("Brzycki 1RM: 1RM = Peso / (1.0278 - 0.0278 * Reps) con precisión decimal", () => {
      // 100kg x 1 rep = 100 / (1.0278 - 0.0278) = 100 kg exacto
      expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 1);

      // 100kg x 10 reps = 100 / (1.0278 - 0.278) = 100 / 0.7498 = 133.3688... kg
      expect(calculateBrzycki1RM(100, 10)).toBeCloseTo(133.369, 2);

      // 80kg x 6 reps = 80 / (1.0278 - 0.1668) = 80 / 0.861 = 92.915... kg
      expect(calculateBrzycki1RM(80, 6)).toBeCloseTo(92.915, 2);
    });

    it("Casos Límite Matemáticos: ceros, números negativos, NaN, Infinity", () => {
      expect(calculateEpley1RM(0, 10)).toBe(0);
      expect(calculateEpley1RM(-50, 10)).toBe(0);
      expect(calculateEpley1RM(100, 0)).toBe(0);
      expect(calculateEpley1RM(100, -5)).toBe(0);
      expect(calculateEpley1RM(NaN, 10)).toBe(0);
      expect(calculateEpley1RM(100, Infinity)).toBe(0);

      expect(calculateBrzycki1RM(0, 10)).toBe(0);
      expect(calculateBrzycki1RM(-80, 5)).toBe(0);
      expect(calculateBrzycki1RM(80, 0)).toBe(0);
      expect(calculateBrzycki1RM(80, -2)).toBe(0);
      expect(calculateBrzycki1RM(NaN, 5)).toBe(0);
      // Brzycki con reps >= 37 (denominador <= 0) no debe producir Infinity ni valores negativos
      expect(calculateBrzycki1RM(100, 37)).toBe(0);
      expect(calculateBrzycki1RM(100, 50)).toBe(0);
    });

    it("Tonelaje y Volumen de Bloques: Σ (Series * Reps * Peso)", () => {
      expect(calculateBlockVolume(4, 10, 100)).toBe(4000);
      expect(calculateBlockVolume(0, 10, 100)).toBe(0);
      expect(calculateBlockVolume(3, -5, 50)).toBe(0);

      const blocks = [
        { series: 4, reps: 8, peso: 100 },  // 3200 kg
        { series: 3, reps: 10, peso: 80 },  // 2400 kg
        { series: 2, reps: 12, peso: 50 },  // 1200 kg
      ];
      expect(calculateTotalTonnage(blocks)).toBe(6800);
    });
  });

  describe("2. Casos Límite en Métricas de Retención (obtenerMetricasRetencion)", () => {
    it("ignora usuarios con rol distinto de 'ALUMNO' (ej. ENTRENADOR, ADMIN)", () => {
      const store = useCoachStudioStore.getState();
      const alumnosConStaff: Perfil[] = [
        ...store.alumnos,
        {
          id: "staff-1",
          nombre_completo: "Profesor Prueba",
          email: "profe@test.com",
          rol: "ENTRENADOR",
          estado_membresia: "ACTIVA",
          profesor_asignado_id: null,
          fecha_baja: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      useCoachStudioStore.setState({ alumnos: alumnosConStaff });
      const metricas = useCoachStudioStore.getState().obtenerMetricasRetencion();

      // cantActivas debe permanecer en 3 (los 3 alumnos reales)
      expect(metricas.cantActivas).toBe(3);
    });

    it("distingue alumnos con plan ACTIVO vs planes INACTIVOS", () => {
      const camilaId = "a6666666-6666-4666-8666-666666666606";
      const store = useCoachStudioStore.getState();

      // Agregamos a Camila un plan pero con estado 'INACTIVO'
      const planInactivo: PlanEntrenamiento = {
        id: "plan-camila-inactivo",
        alumno_id: camilaId,
        profesor_id: MOCK_PROFESOR_ID,
        nombre: "Plan Antiguo Inactivo",
        estado: "INACTIVO",
        comentarios: null,
        fecha_inicio: "2026-01-01",
        fecha_fin: "2026-02-01",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };

      useCoachStudioStore.setState({ planes: [...store.planes, planInactivo] });

      const metricas = useCoachStudioStore.getState().obtenerMetricasRetencion();
      // Debe seguir contando a Camila como sin plan entrenamiento porque no tiene plan ACTIVO
      expect(metricas.cantSinPlanEntrenamiento).toBe(1);
    });

    it("filtra correctamente alumnos dados de baja fuera del mes en curso vs dentro del mes", () => {
      const store = useCoachStudioStore.getState();
      const alumnosTest: Perfil[] = [
        {
          id: "baja-mes-pasado",
          nombre_completo: "Baja Anterior",
          email: "ant@test.com",
          rol: "ALUMNO",
          estado_membresia: "BAJA",
          profesor_asignado_id: MOCK_PROFESOR_ID,
          fecha_baja: "2025-12-15T00:00:00Z", // Año anterior / mes pasado
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-12-15T00:00:00Z",
        },
        {
          id: "baja-mes-actual",
          nombre_completo: "Baja Actual",
          email: "act@test.com",
          rol: "ALUMNO",
          estado_membresia: "INACTIVA",
          profesor_asignado_id: MOCK_PROFESOR_ID,
          fecha_baja: new Date().toISOString(), // Mes actual
          created_at: "2026-01-01T00:00:00Z",
          updated_at: new Date().toISOString(),
        },
      ];

      useCoachStudioStore.setState({ alumnos: alumnosTest });
      const metricas = useCoachStudioStore.getState().obtenerMetricasRetencion();

      // Solo baja-mes-actual debe ser contado en cantClientesPerdidosMes
      expect(metricas.cantClientesPerdidosMes).toBe(1);
    });
  });

  describe("3. Robustez Offline y Encolamiento (Asignación Urgente de Rutina)", () => {
    it("funciona en modo offline (isOnline: false), actualiza UI y encola acción en useOfflineQueueStore", async () => {
      // Simular desconexión
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });
      const store = useCoachStudioStore.getState();
      const camilaId = "a6666666-6666-4666-8666-666666666606";

      expect(store.obtenerMetricasRetencion().cantSinPlanEntrenamiento).toBe(1);

      // Asignar plan en offline
      const nuevoPlan = await store.asignarPlanUrgente(camilaId, "Plan Hipertrofia Express");

      expect(nuevoPlan.nombre).toBe("Plan Hipertrofia Express");
      expect(nuevoPlan.estado).toBe("ACTIVO");

      // UI actualizada optimistamente
      expect(useCoachStudioStore.getState().obtenerMetricasRetencion().cantSinPlanEntrenamiento).toBe(0);

      // Evento encolado en cola offline
      const queue = useOfflineQueueStore.getState().pendingEvents;
      expect(queue.length).toBe(1);
      expect(queue[0]?.action).toBe("RPC_ASIGNAR_PLAN_URGENTE");
      expect(queue[0]?.payload).toEqual({
        alumnoId: camilaId,
        planId: nuevoPlan.id,
        nombre: nuevoPlan.nombre,
      });
    });
  });

  describe("4. Casos Límite en Detección de Sobrecarga Progresiva (detectarSobrecargaProgresiva)", () => {
    it("filtra series incompletas, con peso <= 0 o reps <= 0 para no computar falsas sobrecargas", () => {
      const store = useCoachStudioStore.getState();
      const alumnoId = "alumno-test-edge";
      const ejercicioId = "ej-bench-press";

      // Alumno con sesiones con series incompletas o peso 0
      useCoachStudioStore.setState({
        historialCargas: {
          [alumnoId]: [
            {
              sesion: {
                id: "ses-1",
                alumno_id: alumnoId,
                dia_id: null,
                fecha: "2026-10-01",
                duracion_minutos: 60,
                volumen_total_kg: 500,
                created_at: "2026-10-01T10:00:00Z",
                updated_at: "2026-10-01T11:00:00Z",
              },
              series: [
                {
                  id: "s-1",
                  sesion_id: "ses-1",
                  ejercicio_id: ejercicioId,
                  ejercicioNombre: "Press de Banca Plano",
                  numero_serie: 1,
                  peso_kg: 50,
                  reps_hechas: 10,
                  rpe_real: 8,
                  completada: true,
                  created_at: "2026-10-01T10:00:00Z",
                  updated_at: "2026-10-01T10:00:00Z",
                },
                {
                  id: "s-2",
                  sesion_id: "ses-1",
                  ejercicio_id: ejercicioId,
                  ejercicioNombre: "Press de Banca Plano",
                  numero_serie: 2,
                  peso_kg: 100, // Alto peso pero no completada
                  reps_hechas: 1,
                  rpe_real: 10,
                  completada: false, // Incompleta: NO DEBE COMPUTAR
                  created_at: "2026-10-01T10:05:00Z",
                  updated_at: "2026-10-01T10:05:00Z",
                },
                {
                  id: "s-3",
                  sesion_id: "ses-1",
                  ejercicio_id: ejercicioId,
                  ejercicioNombre: "Press de Banca Plano",
                  numero_serie: 3,
                  peso_kg: 0, // Peso 0: calentamiento
                  reps_hechas: 15,
                  rpe_real: 5,
                  completada: true,
                  created_at: "2026-10-01T10:10:00Z",
                  updated_at: "2026-10-01T10:10:00Z",
                },
              ],
            },
          ],
        },
      });

      const res = store.detectarSobrecargaProgresiva(alumnoId, ejercicioId);
      expect(res.length).toBe(1);
      // Solo s-1 es válida: peso_max_kg = 50, volumen = 50 * 10 = 500
      expect(res[0]?.peso_max_kg).toBe(50);
      expect(res[0]?.volumen_ejercicio_kg).toBe(500);
      expect(res[0]?.hubo_sobrecarga).toBe(false);
    });

    it("evalúa sobrecarga estrictamente positiva (carga > previa O volumen > previo)", () => {
      const store = useCoachStudioStore.getState();
      const alumnoId = "alumno-test-progression";
      const ejercicioId = "ej-squat";

      useCoachStudioStore.setState({
        historialCargas: {
          [alumnoId]: [
            {
              sesion: {
                id: "ses-base",
                alumno_id: alumnoId,
                dia_id: null,
                fecha: "2026-10-01",
                duracion_minutos: 50,
                volumen_total_kg: 1000,
                created_at: "2026-10-01T10:00:00Z",
                updated_at: "2026-10-01T10:50:00Z",
              },
              series: [
                {
                  id: "sb-1",
                  sesion_id: "ses-base",
                  ejercicio_id: ejercicioId,
                  ejercicioNombre: "Sentadilla Trasera",
                  numero_serie: 1,
                  peso_kg: 100,
                  reps_hechas: 10,
                  rpe_real: 8,
                  completada: true,
                  created_at: "2026-10-01T10:00:00Z",
                  updated_at: "2026-10-01T10:00:00Z",
                },
              ], // max: 100kg, vol: 1000kg
            },
            {
              sesion: {
                id: "ses-igual",
                alumno_id: alumnoId,
                dia_id: null,
                fecha: "2026-10-05",
                duracion_minutos: 50,
                volumen_total_kg: 1000,
                created_at: "2026-10-05T10:00:00Z",
                updated_at: "2026-10-05T10:50:00Z",
              },
              series: [
                {
                  id: "si-1",
                  sesion_id: "ses-igual",
                  ejercicio_id: ejercicioId,
                  ejercicioNombre: "Sentadilla Trasera",
                  numero_serie: 1,
                  peso_kg: 100,
                  reps_hechas: 10,
                  rpe_real: 8,
                  completada: true,
                  created_at: "2026-10-05T10:00:00Z",
                  updated_at: "2026-10-05T10:00:00Z",
                },
              ], // max: 100kg, vol: 1000kg -> IGUAL -> hubo_sobrecarga: false
            },
            {
              sesion: {
                id: "ses-mayor-volumen",
                alumno_id: alumnoId,
                dia_id: null,
                fecha: "2026-10-10",
                duracion_minutos: 50,
                volumen_total_kg: 1350,
                created_at: "2026-10-10T10:00:00Z",
                updated_at: "2026-10-10T10:50:00Z",
              },
              series: [
                {
                  id: "smv-1",
                  sesion_id: "ses-mayor-volumen",
                  ejercicio_id: ejercicioId,
                  ejercicioNombre: "Sentadilla Trasera",
                  numero_serie: 1,
                  peso_kg: 90,
                  reps_hechas: 15, // 90 * 15 = 1350 kg (> 1000kg)
                  rpe_real: 9,
                  completada: true,
                  created_at: "2026-10-10T10:00:00Z",
                  updated_at: "2026-10-10T10:00:00Z",
                },
              ], // max: 90kg (< 100kg), vol: 1350kg (> 1000kg) -> hubo_sobrecarga: true (por volumen)
            },
          ],
        },
      });

      const res = store.detectarSobrecargaProgresiva(alumnoId, ejercicioId);
      expect(res.length).toBe(3);

      // Orden DESC por fecha
      const [ses3, ses2, ses1] = res;
      expect(ses1?.sesion_id).toBe("ses-base");
      expect(ses1?.hubo_sobrecarga).toBe(false);

      expect(ses2?.sesion_id).toBe("ses-igual");
      expect(ses2?.hubo_sobrecarga).toBe(false);

      expect(ses3?.sesion_id).toBe("ses-mayor-volumen");
      expect(ses3?.hubo_sobrecarga).toBe(true);
    });
  });
});
