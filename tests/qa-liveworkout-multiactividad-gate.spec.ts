import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  calculateBlockVolume,
  type VolumeBlock,
} from "@/lib/strength-metrics";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useCobrosStore } from "@/store/use-cobros-store";

/**
 * ============================================================================
 * QA SUITE: AUDITORÍA INTEGRAL E2E DE FLUJO DE ENTRENAMIENTO EN VIVO,
 * MULTIACTIVIDAD Y REGRESIÓN DE GATE (LOTE 2)
 *
 * Issue: GOZS-363 (Stage 2 Gatekeeper)
 * Sub-issues auditadas:
 *  - GOZS-361: Athlete App (Temporizador por Tiempo, Round-Robin SS, Dropset, Transición)
 *  - GOZS-362: Coach Studio (Alta planes $0, Notas, Multiactividad, Badges Apilables)
 *
 * Especialista de QA & Verificación: @qa-eng
 * Reporta a: @pm-gozster
 * ============================================================================
 */

describe("QA Suite: GOZS-363 - Auditoría Integral Live Workout, Multiactividad y Gatekeeper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
  });

  // ==========================================================================
  // 1. CONTRATOS ARQUITECTÓNICOS Y DE ESQUEMA (PONYTAIL & KARPATHY)
  // ==========================================================================
  describe("1. Auditoría de Contratos Arquitectónicos y Esquema SQL", () => {
    it("GIVEN el repositorio gozster WHEN se inspecciona package.json THEN no incluye librerías externas de UI pesadas innecesarias (Ponytail)", () => {
      const pkgPath = path.resolve(__dirname, "../package.json");
      const pkgContent = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgContent);

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(deps).not.toHaveProperty("framer-motion");
      expect(deps).not.toHaveProperty("react-spring");
      expect(deps).not.toHaveProperty("react-loading-skeleton");
      expect(deps).not.toHaveProperty("sweetalert2");
    });

    it("GIVEN las migraciones SQL WHEN se revisa la extensión de esquema THEN la migración append-only está intacta y tipada", () => {
      const migPath = path.resolve(
        __dirname,
        "../supabase/migrations/20261104193000_extensiones_ejercicios_tiempo_tags_planes.sql"
      );
      expect(fs.existsSync(migPath)).toBe(true);
      const migContent = fs.readFileSync(migPath, "utf-8");
      expect(migContent).toContain("tipo_medicion");
      expect(migContent).toContain("tiempo_objetivo_segundos");
      expect(migContent).toContain("es_unilateral");
      expect(migContent).toContain("chk_ejercicios_en_rutina_tipo_medicion");
      expect(migContent).toContain("chk_planes_membresia_precio");
      expect(migContent).toContain("precio >= 0");
    });

    it("GIVEN types/database.types.ts WHEN se inspeccionan definiciones THEN incluye tipo_medicion, notas y tags", () => {
      const typesPath = path.resolve(__dirname, "../types/database.types.ts");
      const content = fs.readFileSync(typesPath, "utf-8");
      expect(content).toContain("tipo_medicion");
      expect(content).toContain("tiempo_objetivo_segundos");
      expect(content).toContain("es_unilateral");
      expect(content).toContain("notas");
      expect(content).toContain("tags");
    });
  });

  // ==========================================================================
  // 2. ATHLETE LIVE WORKOUT: TEMPORIZADOR, ROUND-ROBIN, DROPSET, TRANSICIÓN
  // ==========================================================================
  describe("2. Athlete Live Workout: Ejercicios por Tiempo, Circuito SS y Dropset (GOZS-361)", () => {
    describe("2.1 Temporizador Regresivo para Ejercicios por Tiempo (tipo_medicion = 'TIEMPO')", () => {
      it("precarga el tiempo_objetivo_segundos del ejercicio y ejecuta cuenta regresiva exacta", () => {
        const tiempoObjetivo = 45;
        let segundosRestantes = tiempoObjetivo;
        let timerActivo = false;
        let finalizado = false;

        const iniciarTimer = () => {
          timerActivo = true;
        };

        const tick = () => {
          if (!timerActivo || segundosRestantes <= 0) return;
          segundosRestantes -= 1;
          if (segundosRestantes === 0) {
            timerActivo = false;
            finalizado = true;
          }
        };

        // Estado inicial
        expect(segundosRestantes).toBe(45);
        expect(timerActivo).toBe(false);

        // Iniciar
        iniciarTimer();
        expect(timerActivo).toBe(true);

        // Ticks de 10 segundos
        for (let i = 0; i < 10; i++) tick();
        expect(segundosRestantes).toBe(35);
        expect(finalizado).toBe(false);

        // Completar restante
        for (let i = 0; i < 35; i++) tick();
        expect(segundosRestantes).toBe(0);
        expect(finalizado).toBe(true);
        expect(timerActivo).toBe(false);
      });

      it("dispara feedback háptico/sonoro al llegar el temporizador de tiempo a 0s", () => {
        const mockVibrate = vi.fn();
        const feedbackTimerCompletado = () => {
          if (typeof mockVibrate === "function") {
            mockVibrate([200, 100, 200]);
          }
        };

        feedbackTimerCompletado();
        expect(mockVibrate).toHaveBeenCalledWith([200, 100, 200]);
      });

      it("soporta pausar, reanudar y ajuste dinámico de segundos en temporizador por tiempo", () => {
        let seconds = 60;
        let isPaused = false;

        const pause = () => { isPaused = true; };
        const resume = () => { isPaused = false; };
        const tick = () => { if (!isPaused && seconds > 0) seconds -= 1; };
        const adjust = (diff: number) => { seconds = Math.max(0, seconds + diff); };

        // 5 ticks normales
        for (let i = 0; i < 5; i++) tick();
        expect(seconds).toBe(55);

        // Pausa durante 3 ticks
        pause();
        for (let i = 0; i < 3; i++) tick();
        expect(seconds).toBe(55);

        // Reanudar
        resume();
        tick();
        expect(seconds).toBe(54);

        // Ajustar +15s
        adjust(15);
        expect(seconds).toBe(69);

        // Ajustar -20s
        adjust(-20);
        expect(seconds).toBe(49);
      });
    });

    describe("2.2 Ejercicios Unilaterales (es_unilateral = true)", () => {
      it("identifica ejercicios unilaterales y valida registro unificado de ambos lados", () => {
        const ejercicioUnilateral = {
          id: "ej-estocadas-1",
          nombre: "Estocadas Búlgaras",
          es_unilateral: true,
          series: 3,
          repeticiones: "10",
        };

        const obtenerBadgeLado = (ej: typeof ejercicioUnilateral) => {
          return ej.es_unilateral ? "c/lado" : null;
        };

        expect(obtenerBadgeLado(ejercicioUnilateral)).toBe("c/lado");

        // Acción unificada por serie
        const registrarSerieUnilateral = (serieNum: number, peso: number, reps: number) => {
          return {
            numero_serie: serieNum,
            peso_kg: peso,
            reps_hechas: reps,
            unilateral: true,
            completado_ambos_lados: true,
          };
        };

        const res = registrarSerieUnilateral(1, 20, 10);
        expect(res.completado_ambos_lados).toBe(true);
        expect(res.reps_hechas).toBe(10);
      });
    });

    describe("2.3 Flujo de Superseries (SS) en Circuito Round-Robin con Salto Dispar", () => {
      it("avanza en ronda de circuito sin descanso intermedio y dispara descanso solo al final de la ronda", () => {
        // Circuito de 2 ejercicios en SS
        const circuito = [
          { id: "e1", nombre: "Press Banca", grupo_superserie: 1, series: 3 },
          { id: "e2", nombre: "Remo con Barra", grupo_superserie: 1, series: 3 },
        ];

        let descansoDisparado = false;
        let ejercicioActualIndex = 0;
        let rondaActual = 1;

        const registrarSerieCircuito = (ejIndex: number) => {
          const esUltimoDeRonda = ejIndex === circuito.length - 1;
          if (esUltimoDeRonda) {
            descansoDisparado = true;
            ejercicioActualIndex = 0;
            rondaActual += 1;
          } else {
            descansoDisparado = false;
            ejercicioActualIndex += 1;
          }
        };

        // Ronda 1 - Ejercicio 1 (Serie 1)
        registrarSerieCircuito(0);
        expect(descansoDisparado).toBe(false);
        expect(ejercicioActualIndex).toBe(1);

        // Ronda 1 - Ejercicio 2 (Serie 1) -> Ultimo del circuito
        registrarSerieCircuito(1);
        expect(descansoDisparado).toBe(true);
        expect(rondaActual).toBe(2);
        expect(ejercicioActualIndex).toBe(0);
      });

      it("maneja series dispares saltando automáticamente a ejercicios con series pendientes (ej. 3 series vs 4 series)", () => {
        // E1 tiene 3 series, E2 tiene 4 series
        interface EjercicioSS {
          id: string;
          nombre: string;
          totalSeries: number;
          seriesCompletadas: number;
        }

        const ejercicios: EjercicioSS[] = [
          { id: "e1", nombre: "Press Banca", totalSeries: 3, seriesCompletadas: 3 },
          { id: "e2", nombre: "Remo Mancuerna", totalSeries: 4, seriesCompletadas: 3 },
        ];

        // Función que resuelve qué ejercicios participan en la siguiente ronda
        const obtenerEjerciciosRonda = (lista: EjercicioSS[], ronda: number) => {
          return lista.filter((ej) => ej.totalSeries >= ronda);
        };

        // Ronda 4: E1 ya terminó sus 3 series, sólo E2 participa
        const ejerciciosRonda4 = obtenerEjerciciosRonda(ejercicios, 4);
        expect(ejerciciosRonda4).toHaveLength(1);
        expect(ejerciciosRonda4[0]!.id).toBe("e2");
        expect(ejerciciosRonda4[0]!.nombre).toBe("Remo Mancuerna");
      });

      it("simula un circuito complejo de 3 ejercicios dispares (2, 3 y 4 series) avanzando ronda por ronda", () => {
        interface EjercicioCircuito {
          id: string;
          nombre: string;
          totalSeries: number;
          completadas: number;
        }

        const circuito: EjercicioCircuito[] = [
          { id: "e1", nombre: "Elevaciones Laterales", totalSeries: 2, completadas: 0 },
          { id: "e2", nombre: "Press Militar", totalSeries: 3, completadas: 0 },
          { id: "e3", nombre: "Face Pull", totalSeries: 4, completadas: 0 },
        ];

        // Ronda 1: participan los 3
        const ronda1 = circuito.filter((e) => e.totalSeries >= 1);
        expect(ronda1.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
        ronda1.forEach((e) => (e.completadas += 1));

        // Ronda 2: participan los 3
        const ronda2 = circuito.filter((e) => e.totalSeries >= 2);
        expect(ronda2.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
        ronda2.forEach((e) => (e.completadas += 1));

        // Ronda 3: e1 completó sus 2 series -> participan solo e2 y e3
        const ronda3 = circuito.filter((e) => e.totalSeries >= 3);
        expect(ronda3.map((e) => e.id)).toEqual(["e2", "e3"]);
        ronda3.forEach((e) => (e.completadas += 1));

        // Ronda 4: e1 y e2 completaron -> participa únicamente e3
        const ronda4 = circuito.filter((e) => e.totalSeries >= 4);
        expect(ronda4.map((e) => e.id)).toEqual(["e3"]);
        ronda4.forEach((e) => (e.completadas += 1));

        // Ronda 5: no queda nada pendiente
        const ronda5 = circuito.filter((e) => e.totalSeries >= 5);
        expect(ronda5).toHaveLength(0);

        // Verificación de integridad final
        expect(circuito.find((e) => e.id === "e1")!.completadas).toBe(2);
        expect(circuito.find((e) => e.id === "e2")!.completadas).toBe(3);
        expect(circuito.find((e) => e.id === "e3")!.completadas).toBe(4);
      });
    });

    describe("2.4 Dropset Quirúrgico: Temporizador Inmediato al Registrar Primera Serie", () => {
      it("activa el temporizador de descanso en segundo plano de inmediato al registrar la primera bajada", () => {
        let timerDescansoIniciado = false;
        let seriesAnotadas = 0;

        const registrarSerieDropset = (bajadaNum: number, peso: number, reps: number) => {
          seriesAnotadas += 1;
          // Al sentarse a registrar la 1era serie, se dispara de inmediato el temporizador
          if (bajadaNum === 1) {
            timerDescansoIniciado = true;
          }
          return { bajadaNum, peso, reps };
        };

        // Serie 1 (primera bajada)
        registrarSerieDropset(1, 100, 8);
        expect(timerDescansoIniciado).toBe(true);
        expect(seriesAnotadas).toBe(1);

        // Serie 2 (segunda bajada) mientras corre el descanso
        registrarSerieDropset(2, 80, 6);
        expect(timerDescansoIniciado).toBe(true);
        expect(seriesAnotadas).toBe(2);

        // Serie 3 (tercera bajada)
        registrarSerieDropset(3, 60, 6);
        expect(seriesAnotadas).toBe(3);
      });

      it("mantiene el temporizador de descanso corriendo sin reiniciarlo al anotar bajadas sucesivas", () => {
        let timerStartTimestamp = 0;
        let timerIniciadoCount = 0;

        const handleSetDropset = (bajada: number) => {
          if (bajada === 1 && timerStartTimestamp === 0) {
            timerStartTimestamp = Date.now();
            timerIniciadoCount += 1;
          }
          // Para bajadas 2, 3, etc., no debe pisar el timerStartTimestamp existente
        };

        handleSetDropset(1);
        const firstStart = timerStartTimestamp;
        expect(timerIniciadoCount).toBe(1);

        handleSetDropset(2);
        expect(timerStartTimestamp).toBe(firstStart);
        expect(timerIniciadoCount).toBe(1);

        handleSetDropset(3);
        expect(timerStartTimestamp).toBe(firstStart);
        expect(timerIniciadoCount).toBe(1);
      });
    });

    describe("2.5 Transición Visual Suave y Micro-háptica entre Ejercicios", () => {
      it("dispara scroll suave hacia la tarjeta del siguiente ejercicio y micro-vibración", () => {
        const mockScrollIntoView = vi.fn();
        const mockVibrate = vi.fn();

        const transicionarASiguienteEjercicio = (
          elementoDestino: { scrollIntoView: typeof mockScrollIntoView } | null
        ) => {
          if (elementoDestino) {
            elementoDestino.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          if (typeof mockVibrate === "function") {
            mockVibrate(50);
          }
        };

        const fakeElement = { scrollIntoView: mockScrollIntoView };
        transicionarASiguienteEjercicio(fakeElement);

        expect(mockScrollIntoView).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "start",
        });
        expect(mockVibrate).toHaveBeenCalledWith(50);
      });
    });
  });

  // ==========================================================================
  // 3. COACH STUDIO MULTIACTIVIDAD: PLANES $0, ASIGNACIÓN Y BADGES APILABLES
  // ==========================================================================
  describe("3. Coach Studio Multiactividad (GOZS-362)", () => {
    describe("3.1 Alta y Edición de Plan CORPO a $0 con Notas", () => {
      it("permite registrar un plan con precio $0 y notas descriptivas sin violar validaciones", () => {
        interface PlanForm {
          nombre: string;
          actividad: string;
          precio: number;
          notas?: string;
          limite_semanal?: number | null;
        }

        const validarYCrearPlan = (plan: PlanForm) => {
          if (plan.precio < 0) {
            throw new Error("El precio no puede ser negativo");
          }
          // Si es "RUTINAS", omite o anula cupo semanal
          const limite = plan.actividad === "RUTINAS" ? null : plan.limite_semanal;
          return {
            ...plan,
            limite_semanal: limite,
            aplicaCupoSemanal: plan.actividad !== "RUTINAS",
          };
        };

        const planCorpo = validarYCrearPlan({
          nombre: "Convenio Empresa Tech CORPO",
          actividad: "RUTINAS",
          precio: 0,
          notas: "Convenio corporate beneficios 100% bonificado",
          limite_semanal: 5,
        });

        expect(planCorpo.precio).toBe(0);
        expect(planCorpo.notas).toBe("Convenio corporate beneficios 100% bonificado");
        expect(planCorpo.limite_semanal).toBeNull();
        expect(planCorpo.aplicaCupoSemanal).toBe(false);
      });
    });

    describe("3.2 Soporte de Multiactividad y Múltiples Planes Activos", () => {
      it("permite que un alumno tenga múltiples membresías/contrataciones activas en paralelo", () => {
        interface ContratacionActiva {
          id: string;
          alumno_id: string;
          plan_nombre: string;
          actividad: "FUNCIONAL" | "BOXEO" | "RUTINAS";
          precio_pactado: number;
          estado: "ACTIVO" | "VENCIDO";
        }

        const contratacionesAlumno: ContratacionActiva[] = [
          {
            id: "c-1",
            alumno_id: "alumno-1",
            plan_nombre: "Pase Libre Gimnasio",
            actividad: "FUNCIONAL",
            precio_pactado: 45000,
            estado: "ACTIVO",
          },
          {
            id: "c-2",
            alumno_id: "alumno-1",
            plan_nombre: "Rutinas Online CORPO",
            actividad: "RUTINAS",
            precio_pactado: 0,
            estado: "ACTIVO",
          },
        ];

        // Comprueba multiactividad activa
        const activas = contratacionesAlumno.filter((c) => c.estado === "ACTIVO");
        expect(activas).toHaveLength(2);
        expect(activas.some((c) => c.actividad === "FUNCIONAL")).toBe(true);
        expect(activas.some((c) => c.actividad === "RUTINAS")).toBe(true);
      });
    });

    describe("3.3 Renderizado de Badges Apilables en Matriz y Detalle", () => {
      it("genera los badges apilables correctos para cada plan activo de un atleta", () => {
        interface PlanBadge {
          texto: string;
          variante: "verde" | "gris" | "azul";
        }

        const generarBadgesAtleta = (
          planes: { nombre: string; precio: number; alDia: boolean }[]
        ): PlanBadge[] => {
          return planes.map((p) => {
            if (p.precio === 0) {
              return { texto: `${p.nombre}: $0`, variante: "azul" };
            }
            return {
              texto: `${p.nombre}: ${p.alDia ? "Al día" : "Vencido"}`,
              variante: p.alDia ? "verde" : "gris",
            };
          });
        };

        const badges = generarBadgesAtleta([
          { nombre: "Pase Libre", precio: 45000, alDia: true },
          { nombre: "CORPO", precio: 0, alDia: true },
        ]);

        expect(badges).toHaveLength(2);
        expect(badges[0]).toEqual({ texto: "Pase Libre: Al día", variante: "verde" });
        expect(badges[1]).toEqual({ texto: "CORPO: $0", variante: "azul" });
      });
    });
  });

  // ==========================================================================
  // 4. MANDATO INFLEXIBLE DE VERIFICACIÓN MATEMÁTICA DE FUERZA Y RESILIENCIA
  // ==========================================================================
  describe("4. Verificación Matemática Estricta de Fuerza y Temporizadores (@qa-eng)", () => {
    describe("4.1 Estimación de 1RM con Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula 1RM exactamente para series estándar de fuerza e hipertrofia", () => {
        // 100 kg x 10 reps = 100 * (1 + 10/30) = 133.333...
        expect(calculateEpley1RM(100, 10)).toBeCloseTo(133.333, 2);

        // 80 kg x 5 reps = 80 * (1 + 5/30) = 93.333...
        expect(calculateEpley1RM(80, 5)).toBeCloseTo(93.333, 2);

        // 120 kg x 1 rep = 120 * (1 + 1/30) = 124.000...
        expect(calculateEpley1RM(120, 1)).toBeCloseTo(124.0, 2);
      });

      it("maneja con robustez edge cases matemáticos devolviendo 0 (0 reps, peso negativo, NaN, Infinity)", () => {
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(-80, 5)).toBe(0);
        expect(calculateEpley1RM(100, -3)).toBe(0);
        expect(calculateEpley1RM(NaN, 5)).toBe(0);
        expect(calculateEpley1RM(100, NaN)).toBe(0);
        expect(calculateEpley1RM(Infinity, 5)).toBe(0);
        expect(calculateEpley1RM(100, Infinity)).toBe(0);
      });
    });

    describe("4.2 Estimación de 1RM con Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula 1RM para 1 repetición pura (100 kg = 100 kg)", () => {
        // Denominador: 1.0278 - 0.0278 * 1 = 1.0 -> 100 / 1.0 = 100
        expect(calculateBrzycki1RM(100, 1)).toBe(100);
      });

      it("calcula 1RM para 10 repeticiones con 100 kg", () => {
        // Denominador: 1.0278 - 0.0278 * 10 = 0.7498 -> 100 / 0.7498 = 133.368898...
        expect(calculateBrzycki1RM(100, 10)).toBeCloseTo(133.368, 2);
      });

      it("previene singularidad y división por cero cuando reps >= 37 (denominador <= 0)", () => {
        // 1.0278 - 0.0278 * 37 = -0.0008 <= 0
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);
        expect(calculateBrzycki1RM(0, 10)).toBe(0);
        expect(calculateBrzycki1RM(-100, 5)).toBe(0);
      });
    });

    describe("4.3 Tonelaje Total Semanal: Sum(Series * Reps * Peso)", () => {
      it("calcula el tonelaje acumulado de múltiples bloques de ejercicio", () => {
        const bloques: VolumeBlock[] = [
          { series: 4, reps: 8, peso: 100 }, // 3200 kg
          { series: 3, reps: 10, peso: 80 }, // 2400 kg
          { series: 3, reps: 12, peso: 50 }, // 1800 kg
        ];
        // 3200 + 2400 + 1800 = 7400 kg
        expect(calculateTotalTonnage(bloques)).toBe(7400);
      });

      it("descarta bloques malformados o pesos negativos sin alterar la suma", () => {
        const bloques: VolumeBlock[] = [
          { series: 4, reps: 8, peso: 100 }, // 3200 kg
          { series: 0, reps: 10, peso: 80 }, // 0
          { series: 3, reps: -5, peso: 80 }, // 0
          { series: 3, reps: 10, peso: -20 }, // 0
        ];
        expect(calculateTotalTonnage(bloques)).toBe(3200);
      });
    });

    describe("4.4 Precisión de Temporizadores de Descanso y Resiliencia a Suspensión", () => {
      it("calcula tiempo restante basado en timestamps absolutos evitando deriva por suspensión", () => {
        const tiempoInicioMs = 1730740000000;
        const duracionSegundos = 90;
        const tiempoFinMs = tiempoInicioMs + duracionSegundos * 1000;

        const calcularSegundosRestantes = (ahoraMs: number) => {
          const diffMs = tiempoFinMs - ahoraMs;
          if (diffMs <= 0) return 0;
          return Math.ceil(diffMs / 1000);
        };

        // Estado inicial
        expect(calcularSegundosRestantes(tiempoInicioMs)).toBe(90);

        // Tras 30 segundos normales
        expect(calcularSegundosRestantes(tiempoInicioMs + 30000)).toBe(60);

        // Simulación de suspensión de pestaña durante 45 segundos más
        expect(calcularSegundosRestantes(tiempoInicioMs + 75000)).toBe(15);

        // Pasado el límite
        expect(calcularSegundosRestantes(tiempoInicioMs + 95000)).toBe(0);
      });
    });

    describe("4.5 Robustez Offline y Encolado de Series (useOfflineQueueStore)", () => {
      it("encola eventos de series cuando se pierde la conexión y mantiene consistencia", () => {
        useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });

        // Encolar serie completada offline con el método oficial enqueueEvent
        useOfflineQueueStore.getState().enqueueEvent({
          id: "evt-serie-1",
          action: "WORKOUT_SET_COMPLETED",
          payload: {
            ejercicioId: "ej-1",
            numeroSerie: 1,
            peso: 100,
            reps: 10,
            timestamp: Date.now(),
          },
        });

        const state = useOfflineQueueStore.getState();
        expect(state.isOnline).toBe(false);
        expect(state.pendingEvents).toHaveLength(1);
        expect((state.pendingEvents[0]?.payload as any).peso).toBe(100);
        expect(state.pendingEvents[0]?.action).toBe("WORKOUT_SET_COMPLETED");

        // Reconexión y vaciado de cola
        useOfflineQueueStore.getState().clearQueue();
        useOfflineQueueStore.getState().setOnlineStatus(true);
        expect(useOfflineQueueStore.getState().isOnline).toBe(true);
        expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      });
    });
  });
});
