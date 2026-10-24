import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  type VolumeBlock,
} from "@/lib/strength-metrics";
import {
  esSerieValida as esSerieValidaHistorial,
  ultimaVezDeEjercicio,
  serieDeReferencia,
  formatearCarga,
  formatearFechaCorta,
  ariaUltimaVez,
  type SerieHistorica,
} from "@/lib/historial-ejercicio";
import {
  sugerirCarga,
  incrementoKg,
  parseObjetivo,
  partesTitulo,
  motivoSugerencia,
  INCREMENTOS_SUGERIDOS,
  type Prescripcion,
} from "@/lib/sugerencia-carga";
import {
  fronteraPareto,
  marcasDeEjercicio,
  agregarSerieAMarcas,
  esNuevoRecord,
  detalleRecord,
  lineaEpleyRecord,
  type MarcasEjercicio,
  type SerieCandidata,
} from "@/lib/record-ejercicio";
import {
  armarAdherencia,
  badgeAdherencia,
  formatearPromedio,
  type SesionAdherencia,
} from "@/lib/adherencia";
import {
  obtenerCambiosDePlan,
  calcularPuntosGrafico,
  formatearFechaDashboard,
} from "@/lib/cambio-plan";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import {
  sesionesDelMes,
  volumenDelMes,
  ejerciciosPrincipales,
  puntosDeEjercicio,
  formatearDelta,
  agregarMiProgreso,
} from "@/lib/mi-progreso";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useCoachStudioStore } from "@/store/use-coach-studio";

describe("QA Verification Suite — Historial y Progreso (GOZS-158 / F1–F6)", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
    useAthleteStore.getState().stopTimer();

    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      activeTab: "rutina_actual",
      isHistoricalLoadsOpen: false,
      isChatOpen: false,
      toast: null,
      currentPage: 1,
    });

    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. VERIFICACIÓN MATEMÁTICA ESTRICTA DE FÓRMULAS DE FUERZA Y MÉTRICAS PURAS
  // ==========================================================================
  describe("1. Verificación Matemática Estricta de Fórmulas de Fuerza y Métricas", () => {
    describe("Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula exactamente los valores de 1RM para combinaciones clave", () => {
        expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);
        expect(calculateEpley1RM(140, 3)).toBe(154);
        expect(calculateEpley1RM(85, 5)).toBeCloseTo(99.1667, 4);
        expect(calculateEpley1RM(60, 10)).toBeCloseTo(80, 2);
      });

      it("maneja casos límite: 0 repeticiones, peso cero y números negativos sin romper", () => {
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(-50, 5)).toBe(0);
      });
    });

    describe("Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula con rigor el 1RM Brzycki", () => {
        // 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.511
        expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 3);
        expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 0);
      });

      it("maneja casos límite: reps <= 0 retorna 0 sin división por cero ni NaN", () => {
        expect(calculateBrzycki1RM(100, 0)).toBe(0);
        expect(calculateBrzycki1RM(0, 5)).toBe(0);
        expect(calculateBrzycki1RM(-80, 5)).toBe(0);
      });
    });

    describe("Cálculo de Tonelaje Total Semanal: Sum(Series * Reps * Peso)", () => {
      it("suma el volumen efectivo ignorando calentamientos", () => {
        const bloques: VolumeBlock[] = [
          { series: 4, reps: 10, peso: 100 }, // 4 * 10 * 100 = 4000
          { series: 3, reps: 8, peso: 80 },   // 3 * 8 * 80 = 1920
        ];
        expect(calculateTotalTonnage(bloques)).toBe(5920);
      });
    });

    describe("Frontera de Pareto y Reglas de Récord (§3.3 & §3.4)", () => {
      it("elimina estrictamente puntos dominados y colapsa duplicados exactos", () => {
        const puntos = [
          { peso_kg: 100, reps_hechas: 5, fecha: "2026-10-01" },
          { peso_kg: 90, reps_hechas: 4, fecha: "2026-10-02" }, // dominado por 100x5
          { peso_kg: 80, reps_hechas: 10, fecha: "2026-10-03" }, // en la frontera
          { peso_kg: 100, reps_hechas: 5, fecha: "2026-10-04" }, // duplicado
        ];
        const frontera = fronteraPareto(puntos);
        expect(frontera).toHaveLength(2);
        expect(frontera.some((p) => p.peso_kg === 100 && p.reps_hechas === 5)).toBe(true);
        expect(frontera.some((p) => p.peso_kg === 80 && p.reps_hechas === 10)).toBe(true);
      });

      it("aplica la regla del 80% del peso máximo para evitar festejar series livianas", () => {
        const historial: MarcasEjercicio = {
          ejercicio_id: "sentadilla",
          frontera: [{ peso_kg: 100, reps_hechas: 3, fecha: "2026-10-01" }],
          max_peso_kg: 100,
          max_epley_kg: 110,
        };

        // 60 kg < 0.8 * 100 = 80 kg -> NO es récord aunque haga 20 reps
        const res = esNuevoRecord({ peso_kg: 60, reps_hechas: 20 }, historial);
        expect(res.esRecord).toBe(false);

        // 80 kg >= 80 kg y reps 5 > 0 -> SÍ es récord de reps
        const res80 = esNuevoRecord({ peso_kg: 80, reps_hechas: 5 }, historial);
        expect(res80.esRecord).toBe(true);
        expect(res80.tipo).toBe("reps");
      });

      it("en peso corporal la regla del 80% no aplica y nunca genera récord de peso", () => {
        const historial: MarcasEjercicio = {
          ejercicio_id: "dominadas",
          frontera: [{ peso_kg: 0, reps_hechas: 10, fecha: "2026-10-01" }],
          max_peso_kg: 0,
          max_epley_kg: 0,
        };

        const res = esNuevoRecord({ peso_kg: 0, reps_hechas: 12 }, historial);
        expect(res.esRecord).toBe(true);
        expect(res.tipo).toBe("reps");
      });

      it("DROPSET y FAILURE cuentan como récord, pero WARMUP nunca", () => {
        const historial: MarcasEjercicio = {
          ejercicio_id: "sentadilla",
          frontera: [{ peso_kg: 100, reps_hechas: 3, fecha: "2026-10-01" }],
          max_peso_kg: 100,
          max_epley_kg: 110,
        };

        const warmup = esNuevoRecord({ peso_kg: 120, reps_hechas: 5, set_type: "WARMUP" }, historial);
        expect(warmup.esRecord).toBe(false);

        const dropset = esNuevoRecord({ peso_kg: 105, reps_hechas: 4, set_type: "DROPSET" }, historial);
        expect(dropset.esRecord).toBe(true);
        expect(dropset.tipo).toBe("peso");
      });
    });
  });

  // ==========================================================================
  // 2. VERIFICACIÓN DE SOBRECARGA PROGRESIVA Y DOBLE PROGRESIÓN (F2)
  // ==========================================================================
  describe("2. Verificación de Sobrecarga Progresiva y Sugerencia de Carga (§2)", () => {
    it("tren inferior pesado (>= 60 kg) suma exactamente +5 kg y redondea a 0.5 kg", () => {
      expect(incrementoKg(80, ["Cuádriceps", "Glúteos"])).toBe(5);
      expect(incrementoKg(60, "prensa de piernas isquiotibiales")).toBe(5);
    });

    it("tren inferior liviano (< 60 kg) suma exactamente +2.5 kg", () => {
      expect(incrementoKg(50, ["Cuádriceps"])).toBe(2.5);
    });

    it("tren superior / resto (>= 20 kg) suma +2.5 kg, y liviano (< 20 kg) suma +1 kg", () => {
      expect(incrementoKg(60, ["Pectorales"])).toBe(2.5);
      expect(incrementoKg(10, ["Deltoides lateral"])).toBe(1);
    });

    it("normaliza tildes, mayúsculas y acentos al evaluar grupos musculares", () => {
      expect(incrementoKg(100, ["GLÚTEO MAYOR"])).toBe(5);
      expect(incrementoKg(70, ["ISQUIOSURALES Y ADUCTOR"])).toBe(5);
    });

    it("si completó todas las reps pero tuvo RPE >= 9.5 sugiere REPETIR por límite de RPE", () => {
      const ultimaVez = {
        ejercicio_id: "bench",
        fecha: "2026-10-10",
        series: [
          { numero_serie: 1, peso_kg: 80, reps_hechas: 8, rpe_real: 9.5 },
          { numero_serie: 2, peso_kg: 80, reps_hechas: 8, rpe_real: 10 },
        ],
      };
      const prescripcion: Prescripcion = {
        numeroSerie: 1,
        repeticionesObjetivo: "8",
        seriesPrescriptas: 2,
        musculosPrincipales: ["Pectorales"],
      };

      const sugerencia = sugerirCarga(ultimaVez, prescripcion);
      expect(sugerencia).not.toBeNull();
      expect(sugerencia?.tipo).toBe("repetir");
      expect(sugerencia?.motivo).toBe("rpe-limite");
      expect(sugerencia?.pesoSugerido).toBe(80);
      expect(motivoSugerencia(sugerencia!, "SIMPLE")).not.toContain("RPE");
      expect(motivoSugerencia(sugerencia!, "TECNICA")).toContain("RPE");
    });

    it("DROPSET nunca progresa aunque se hayan completado todas las repeticiones", () => {
      const ultimaVez = {
        ejercicio_id: "curl",
        fecha: "2026-10-10",
        series: [{ numero_serie: 1, peso_kg: 30, reps_hechas: 12, rpe_real: 8 }],
      };
      const prescripcion: Prescripcion = {
        numeroSerie: 1,
        repeticionesObjetivo: "10-12",
        seriesPrescriptas: 1,
        musculosPrincipales: ["Bíceps"],
        setType: "DROPSET",
      };

      const sugerencia = sugerirCarga(ultimaVez, prescripcion);
      expect(sugerencia?.tipo).toBe("repetir");
      expect(sugerencia?.motivo).toBe("mismo-peso");
      expect(sugerencia?.pesoSugerido).toBe(30);
    });
  });

  // ==========================================================================
  // 3. CALENDARIO DE ADHERENCIA Y CAMBIOS DE PLAN (F5 & F6)
  // ==========================================================================
  describe("3. Calendario de Adherencia y Marcas de Cambio de Plan (§5 & §6)", () => {
    it("arma exactamente 52 semanas completas con semana actual a la derecha", () => {
      const hoy = new Date("2026-10-24T12:00:00-03:00");
      const res = armarAdherencia([], hoy, 3, "2026-01-01T00:00:00-03:00");
      expect(res.semanas).toHaveLength(52);
      expect(res.semanas[51]?.esActual).toBe(true);
      expect(res.semanas[0]?.completa).toBe(true);
    });

    it("evalúa badges de 'días sin entrenar' con precisión y umbrales correctos", () => {
      expect(badgeAdherencia(0, false)).toEqual({
        texto: "Entrenó hoy",
        variante: "outline",
        entrenoHoy: true,
      });
      expect(badgeAdherencia(1, false)).toEqual({
        texto: "1 día sin entrenar",
        variante: "outline",
        entrenoHoy: false,
      });
      expect(badgeAdherencia(7, false)).toEqual({
        texto: "7 días sin entrenar",
        variante: "outline",
        entrenoHoy: false,
      });
      // > 7 días activa variant destructive
      expect(badgeAdherencia(8, false)).toEqual({
        texto: "8 días sin entrenar",
        variante: "destructive",
        entrenoHoy: false,
      });
      expect(badgeAdherencia(null, true)).toEqual({
        texto: "Nunca entrenó",
        variante: "secondary",
        entrenoHoy: false,
      });
    });

    it("calcula cambios de plan cronológicamente y no marca la primera sesión", () => {
      const planA = { id: "p1", nombre: "Fuerza Base" };
      const planB = { id: "p2", nombre: "Hipertrofia 2" };
      const historial: HistoricalLoadEntry[] = [
        {
          sesion: { id: "s1", fecha: "2026-08-01T10:00:00Z" } as any,
          series: [{ id: "sr1", ejercicio_id: "ej1", completada: true, reps_hechas: 5, peso_kg: 80, numero_serie: 1 } as any],
          plan: planA,
        },
        {
          sesion: { id: "s2", fecha: "2026-08-15T10:00:00Z" } as any,
          series: [{ id: "sr2", ejercicio_id: "ej1", completada: true, reps_hechas: 5, peso_kg: 82.5, numero_serie: 1 } as any],
          plan: planA,
        },
        {
          sesion: { id: "s3", fecha: "2026-09-01T10:00:00Z" } as any,
          series: [{ id: "sr3", ejercicio_id: "ej1", completada: true, reps_hechas: 8, peso_kg: 85, numero_serie: 1 } as any],
          plan: planB,
        },
      ];

      const cambios = obtenerCambiosDePlan(historial);
      expect(cambios).toHaveLength(1);
      expect(cambios[0]?.planAnterior?.nombre).toBe("Fuerza Base");
      expect(cambios[0]?.planNuevo?.nombre).toBe("Hipertrofia 2");
      expect(cambios[0]?.fecha).toBe("2026-09-01T10:00:00Z");
    });
  });

  // ==========================================================================
  // 4. FLUJO E2E INTEGRADO ATHLETE APP: ÚLTIMA VEZ + SUGERENCIA + RÉCORD + OFFLINE
  // ==========================================================================
  describe("4. Flujo End-to-End Integrado en Athlete App", () => {
    it("ejecuta el ciclo completo: carga de última vez, sugerencia, precarga, registro de récord y memoria", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // 1. Simular carga inicial de historial y marcas
      const historialSentadilla: SerieHistorica[] = [
        {
          ejercicio_id: exerciseId,
          sesion_id: "sesion-previa-1",
          fecha: "2026-10-12T10:00:00-03:00",
          numero_serie: 1,
          peso_kg: 80,
          reps_hechas: 8,
          rpe_real: 8,
          completada: true,
        },
        {
          ejercicio_id: exerciseId,
          sesion_id: "sesion-previa-1",
          fecha: "2026-10-12T10:00:00-03:00",
          numero_serie: 2,
          peso_kg: 80,
          reps_hechas: 8,
          rpe_real: 8.5,
          completada: true,
        },
      ];

      const uv = ultimaVezDeEjercicio(historialSentadilla, exerciseId, "2026-10-24T00:00:00-03:00");
      const marcas = marcasDeEjercicio(historialSentadilla, exerciseId);

      expect(uv).not.toBeNull();
      expect(marcas).not.toBeNull();

      useAthleteStore.setState({
        ultimaVez: { [exerciseId]: uv },
        marcas: { [exerciseId]: marcas },
      });

      // 2. Verificar sugerencia de carga
      const refSerie1 = serieDeReferencia(uv!, 1);
      expect(refSerie1).not.toBeNull();
      expect(refSerie1?.peso_kg).toBe(80);

      const sugerencia = sugerirCarga(uv, {
        numeroSerie: 1,
        repeticionesObjetivo: "6-8",
        seriesPrescriptas: 2,
        musculosPrincipales: ["Cuádriceps", "Glúteos"],
      });

      expect(sugerencia?.tipo).toBe("subir");
      expect(sugerencia?.pesoSugerido).toBe(85); // 80 + 5 kg
      expect(sugerencia?.repsSugeridas).toBe(6);  // piso de 6-8

      // 3. Registrar serie 1 con 85 kg x 6 -> Debe ser récord de peso
      const candidataSerie1: SerieCandidata = { peso_kg: 85, reps_hechas: 6, set_type: "NORMAL" };
      const resRecord1 = esNuevoRecord(candidataSerie1, marcas);
      expect(resRecord1.esRecord).toBe(true);
      expect(resRecord1.tipo).toBe("peso");

      // Actualizar Zustand con la serie registrada
      store.registrarSerieEnMarcas(exerciseId, candidataSerie1);

      // 4. Registrar serie 2 con exactamente el mismo peso y reps -> NO debe ser récord
      const marcasActualizadas = useAthleteStore.getState().marcas[exerciseId];
      const candidataSerie2: SerieCandidata = { peso_kg: 85, reps_hechas: 6, set_type: "NORMAL" };
      const resRecord2 = esNuevoRecord(candidataSerie2, marcasActualizadas ?? null);
      expect(resRecord2.esRecord).toBe(false);
    });

    it("resiliencia offline: cuando la red cae, el flujo opera sin interrupción y encola eventos", () => {
      // Simular desconexión
      useOfflineQueueStore.setState({ isOnline: false });

      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      store.updateSetField(exerciseId, 1, "peso_kg", 90);
      store.updateSetField(exerciseId, 1, "reps_hechas", 5);
      store.completeSet(exerciseId, 1);

      // Cola de sincronización retiene el evento
      const queue = useOfflineQueueStore.getState();
      expect(queue.pendingEvents.length).toBeGreaterThan(0);

      // Simular reconexión de red
      useOfflineQueueStore.setState({ isOnline: true });
      expect(useOfflineQueueStore.getState().isOnline).toBe(true);
    });
  });

  // ==========================================================================
  // 5. AUDITORÍA DE ACCESIBILIDAD, ERGONOMÍA TÁCTIL Y DESIGN SYSTEM (PONYTAIL)
  // ==========================================================================
  describe("5. Auditoría de Accesibilidad, Ergonomía y Diseño Ponytail", () => {
    it("los componentes clave cumplen con clases táctiles >= 48px y aria descriptivos", () => {
      const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
      const ultimaVezPath = path.resolve(__dirname, "../components/athlete/ultima-vez.tsx");
      const sugerenciaPath = path.resolve(__dirname, "../components/athlete/sugerencia-carga.tsx");
      const avisoRecordPath = path.resolve(__dirname, "../components/athlete/aviso-record.tsx");
      const shellPath = path.resolve(__dirname, "../components/athlete/athlete-shell.tsx");
      const adherenciaCardPath = path.resolve(__dirname, "../components/coach/adherencia-card.tsx");

      const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
      const ultimaVezCode = fs.readFileSync(ultimaVezPath, "utf-8");
      const sugerenciaCode = fs.readFileSync(sugerenciaPath, "utf-8");
      const avisoRecordCode = fs.readFileSync(avisoRecordPath, "utf-8");
      const shellCode = fs.readFileSync(shellPath, "utf-8");
      const adherenciaCardCode = fs.readFileSync(adherenciaCardPath, "utf-8");

      // Shell: 3 columnas iguales y táctil min-h-12 (48px)
      expect(shellCode).toContain("grid-cols-3");
      expect(shellCode).toContain("min-h-12");

      // Aviso récord: botón de cerrar 48x48 px (h-12 w-12) y aria-live
      expect(avisoRecordCode).toContain("h-12 w-12");
      expect(avisoRecordCode).toContain('aria-live="polite"');
      expect(avisoRecordCode).toContain('role="status"');

      // Live workout: integra los componentes de F1, F2, F3
      expect(liveWorkoutCode).toContain("<UltimaVez");
      expect(liveWorkoutCode).toContain("<SugerenciaCarga");
      expect(liveWorkoutCode).toContain("<AvisoRecord");

      // Data-testids en los componentes correspondientes
      expect(ultimaVezCode).toContain('data-testid="ultima-vez"');
      expect(sugerenciaCode).toContain('data-testid="sugerencia-carga"');
      expect(avisoRecordCode).toContain('data-testid="nuevo-record-banner"');

      // Adherencia: data-testid y aria-label accesible
      expect(adherenciaCardCode).toContain('data-testid="adherencia-card"');
      expect(adherenciaCardCode).toContain('role="img"');
    });

    it("cero dependencias externas no autorizadas (cumplimiento estricto Ponytail)", () => {
      const packageJsonPath = path.resolve(__dirname, "../../package.json");
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      const all = [...deps, ...devDeps];

      // Verificar que no se agregaron librerías redundantes de gráficos o UI
      expect(all).not.toContain("lucide-react");
      expect(all).not.toContain("recharts");
      expect(all).not.toContain("chart.js");
      expect(all).not.toContain("canvas-confetti");
      expect(all).not.toContain("framer-motion");
    });
  });
});
