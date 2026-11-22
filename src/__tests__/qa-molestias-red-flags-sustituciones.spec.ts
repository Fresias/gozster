import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { ejercicioBloqueado } from "@/lib/athlete/molestias";

/**
 * ============================================================================
 * QA Verification Suite — Fase 4: Auditoría de Seguridad Clínica, Red Flags,
 * Inmutabilidad de Historial y Trazabilidad de Sustituciones (#67 / PR #71)
 *
 * Supervisor: @pm-gozster
 * Especialista: @qa-eng
 * Referencias Normativas:
 * - ADR-002: Inmutabilidad del Historial de Entrenamiento y Sustitución Trazable
 * - Regla Ponytail: Cero sobre-ingeniería; UI móvil táctil >= 44px
 * - Regla Karpathy: Modificaciones quirúrgicas, sin reescrituras innecesarias
 * ============================================================================
 */

// UUIDs canónicos para el entorno de test PostgreSQL (PGlite)
const ADMIN_ID = "00000000-0000-0000-0000-0000000000ad";
const COACH_ID = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH_ID = "00000000-0000-0000-0000-0000000000c2";
const ALUMNO_ID = "00000000-0000-0000-0000-00000000000a";
const OTRO_ALUMNO_ID = "00000000-0000-0000-0000-00000000000b";

const EJ_SENTADILLA = "10000000-0000-0000-0000-000000000001";
const EJ_PRENSA = "10000000-0000-0000-0000-000000000002";
const EJ_BULGARAS = "10000000-0000-0000-0000-000000000003";

const PLAN_ACTIVO_ID = "20000000-0000-0000-0000-000000000001";
const DIA_PIERNA_ID = "30000000-0000-0000-0000-000000000001";
const ITEM_RUTINA_ID = "40000000-0000-0000-0000-000000000001";
const SESION_PASADA_ID = "50000000-0000-0000-0000-000000000001";
const SERIE_PASADA_ID = "60000000-0000-0000-0000-000000000001";

type RolDB = "anon" | "authenticated" | "service_role";

const QA_SEED_SQL = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN_ID}','admin@gozster.test'),
    ('${COACH_ID}','coach@gozster.test'),
    ('${OTRO_COACH_ID}','otro_coach@gozster.test'),
    ('${ALUMNO_ID}','alumno@gozster.test'),
    ('${OTRO_ALUMNO_ID}','otro_alumno@gozster.test');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN_ID}','admin@gozster.test','Admin QA','ADMIN',NULL,'ACTIVA'),
    ('${COACH_ID}','coach@gozster.test','Coach Asignado QA','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH_ID}','otro_coach@gozster.test','Coach Ajeno QA','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO_ID}','alumno@gozster.test','Alumno Principal QA','ALUMNO','${COACH_ID}','ACTIVA'),
    ('${OTRO_ALUMNO_ID}','otro_alumno@gozster.test','Alumno Secundario QA','ALUMNO','${OTRO_COACH_ID}','ACTIVA')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;

  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id, es_principal) VALUES
    ('${COACH_ID}','${ALUMNO_ID}',true),
    ('${OTRO_COACH_ID}','${OTRO_ALUMNO_ID}',true);

  INSERT INTO public.ejercicios (id, nombre, musculos_principales, creado_por) VALUES
    ('${EJ_SENTADILLA}', 'Sentadilla Trasera con Barra', '{CUADRICEPS,GLUTEOS}', '${COACH_ID}'),
    ('${EJ_PRENSA}', 'Prensa Inclinada 45', '{CUADRICEPS,GLUTEOS}', '${COACH_ID}'),
    ('${EJ_BULGARAS}', 'Sentadilla Búlgara con Mancuernas', '{CUADRICEPS,GLUTEOS}', '${COACH_ID}');

  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre) VALUES
    ('${PLAN_ACTIVO_ID}', '${COACH_ID}', '${ALUMNO_ID}', 'Plan Hipertrofia QA');

  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES
    ('${DIA_PIERNA_ID}', '${PLAN_ACTIVO_ID}', 'Día Pierna - Cuádriceps', 1);

  INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones) VALUES
    ('${ITEM_RUTINA_ID}', '${DIA_PIERNA_ID}', '${EJ_SENTADILLA}', 1, 4, '8-10');

  -- Sesión completada en el pasado con Sentadilla Trasera (DEBE SER 100% INMUTABLE)
  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id, fecha, volumen_total_kg) VALUES
    ('${SESION_PASADA_ID}', '${ALUMNO_ID}', '${DIA_PIERNA_ID}', '2026-10-15 09:30:00+00', 4800.00);

  INSERT INTO public.registro_series (id, sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, pain_reported) VALUES
    ('${SERIE_PASADA_ID}', '${SESION_PASADA_ID}', '${EJ_SENTADILLA}', 1, 120.0, 10, true, false);
`;

let db: PGlite;

function queryAs<T>(rol: RolDB, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

const readSourceFile = (relativePath: string) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), "utf-8");

describe("QA Verification Suite — Fase 4: Reporte de Molestias, Red Flags y Sustituciones Trazables (#67 / PR #71)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(QA_SEED_SQL);
  }, 60_000);

  beforeEach(() => {
    // Reset Zustand stores
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setStopProtocolActive(false);

    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      sustituciones: [],
      toast: null,
    });

    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. AUDITORÍA DE SEGURIDAD Y RED FLAGS (ATHLETE APP & PROTOCOLO DE FRENO)
  // =========================================================================
  describe("1. Auditoría de Seguridad Clínica y Protocolo de Freno en Athlete App", () => {
    const ejercicioActivoCode = readSourceFile("../components/athlete/ejercicio-activo.tsx");
    const painModalCode = readSourceFile("../components/athlete/pain-report-modal.tsx");

    it("el modal del alumno NO contiene selectores ni opciones de ejercicio sustituto (ADR-002 / Ponytail)", () => {
      // Regla Ponytail & ADR-002: El alumno únicamente reporta la molestia; jamás elige o confirma sustitutos
      expect(painModalCode).not.toContain("p_nuevo_ejercicio_id");
      expect(painModalCode).not.toContain("quick_swap_ejercicio");
      expect(painModalCode).not.toContain("ejercicio_sustituto");
      expect(painModalCode).not.toContain("select-alternativa");
      expect(ejercicioActivoCode).not.toContain("quick_swap_ejercicio");
    });

    it("incluye los 4 checks explícitos de Síntomas de Alarma (Red Flags)", () => {
      const redFlagsEsperadas = [
        "Dolor punzante/súbito",
        "Irradiación/adormecimiento",
        "Mareo/falta de aire",
        "Inestabilidad articular",
      ];
      for (const flag of redFlagsEsperadas) {
        expect(painModalCode).toContain(flag);
      }
    });

    it("muestra advertencia médica obligatoria al detectar síntomas de alarma o dolor agudo", () => {
      expect(painModalCode).toContain('"protocolo-freno-alert"');
      expect(painModalCode).toContain("Síntoma de alarma: frená por hoy y avisá en el gimnasio.");
      expect(painModalCode).toContain("Alta: vas a suspender este ejercicio.");
    });

    it("activa stopProtocolActive de inmediato en useAthleteStore al reportar con Red Flags", async () => {
      expect(useAthleteStore.getState().stopProtocolActive).toBe(false);
      await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-qa-1",
        ejercicioId: "ej-sentadilla",
        numeroSerie: 1,
        zona: "RODILLA",
        eva: 5,
        momento: "EN_SERIE",
        sintomas: ["Dolor punzante/súbito"],
        notas: "Sensación de chasquido agudo en la bajada",
      });

      // Verificación de activación del protocolo de freno
      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);
    });

    it("bloquea el ejercicio con EVA 7-9 y activa stopProtocolActive al reportar EVA 10 aun sin red flags explícitas", async () => {
      expect(useAthleteStore.getState().stopProtocolActive).toBe(false);
      const alta = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-qa-2",
        ejercicioId: "ej-press-banca",
        numeroSerie: 2,
        zona: "HOMBRO",
        eva: 8,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor muy intenso, no puedo estabilizar la barra",
      });
      expect(alta.nivel).toBe("alta");
      expect(
        ejercicioBloqueado("ej-qa-2", useAthleteStore.getState().currentSession.molestias ?? []),
      ).toBe(true);

      await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-qa-2",
        ejercicioId: "ej-press-banca",
        numeroSerie: 2,
        zona: "HOMBRO",
        eva: 10,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor máximo",
      });

      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);
    });

    it("NO activa stopProtocolActive si el dolor es LEVE o MODERADO sin síntomas de alarma", async () => {
      expect(useAthleteStore.getState().stopProtocolActive).toBe(false);
      await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-qa-3",
        ejercicioId: "ej-curl-biceps",
        numeroSerie: 1,
        zona: "CODO",
        eva: 3,
        momento: "POST_EJERCICIO",
        sintomas: [],
        notas: "Tensión leve en tendón",
      });

      expect(useAthleteStore.getState().stopProtocolActive).toBe(false);
    });

    it("renderiza el banner visual de protocolo de freno con indicación de parar por hoy y avisar al coach", () => {
      const avisoMolestiaCode = readSourceFile("../components/athlete/aviso-molestia.tsx");
      expect(ejercicioActivoCode).toContain("<AvisoMolestia");
      expect(avisoMolestiaCode).toContain('data-testid="live-workout-stop-protocol-banner"');
      expect(avisoMolestiaCode).toContain("Frená por hoy");
      expect(avisoMolestiaCode).toContain(
        "Avisá en el gimnasio o a tu entrenador cercano. Tu coach ya recibió una alerta.",
      );
      expect(avisoMolestiaCode).toContain("Terminar sesión");
    });
  });

  // =========================================================================
  // 2. AUDITORÍA DE BASE DE DATOS Y RLS: BLOQUEO ESTRICTO AL ALUMNO (PGlite)
  // =========================================================================
  describe("2. Auditoría de Seguridad en Base de Datos y Bloqueo RLS de quick_swap_ejercicio", () => {
    it("la inserción de dolor con es_sintoma_alarma = true genera automáticamente una alerta CRITICA via trigger", async () => {
      // Inserción como el alumno autenticado
      await queryAs("authenticated", ALUMNO_ID, `
        INSERT INTO public.alumno_historial_dolor (
          alumno_id, ejercicio_id, zona_articular, severidad,
          momento_aparicion, es_sintoma_alarma, sintomas_alarma,
          notas_alumno, estado
        ) VALUES (
          '${ALUMNO_ID}', '${EJ_SENTADILLA}', 'RODILLA', 'AGUDO',
          'EN_SERIE', true, ARRAY['Dolor punzante o súbito', 'Inestabilidad articular']::text[],
          'Chasquido y fallo súbito', 'PENDIENTE'
        );
      `);

      // Verificar que el trigger insertó en alertas_entrenador con severidad CRITICA
      const { rows } = await queryAs<{
        severidad: string;
        estado: string;
        tipo_alerta: string;
        titulo: string;
        detalle: string;
      }>("authenticated", COACH_ID, `
        SELECT severidad, estado, tipo_alerta, titulo, detalle
        FROM public.alertas_entrenador
        WHERE alumno_id = '${ALUMNO_ID}' AND severidad = 'CRITICA'
        ORDER BY created_at DESC LIMIT 1;
      `);

      expect(rows.length).toBe(1);
      const alerta = rows[0]!;
      expect(alerta.severidad).toBe("CRITICA");
      expect(alerta.estado).toBe("PENDIENTE");
      expect(alerta.tipo_alerta).toBe("DOLOR_ARTICULAR");
      expect(alerta.titulo).toContain("RED FLAG");
      expect(alerta.detalle).toContain("Inestabilidad articular");
    });

    it("rechaza categóricamente la invocación de quick_swap_ejercicio por parte de un ALUMNO con SQLSTATE 42501", async () => {
      await expect(
        queryAs("authenticated", ALUMNO_ID, `
          SELECT * FROM public.quick_swap_ejercicio(
            '${ITEM_RUTINA_ID}'::uuid,
            '${EJ_PRENSA}'::uuid,
            NULL,
            'El alumno intentando cambiar su propio ejercicio'
          );
        `)
      ).rejects.toThrow(/Operación no permitida: el alumno no puede elegir ni ejecutar la sustitución de ejercicios/);
    });

    it("rechaza la invocación de quick_swap_ejercicio por parte de un ENTRENADOR AJENO no asignado", async () => {
      await expect(
        queryAs("authenticated", OTRO_COACH_ID, `
          SELECT * FROM public.quick_swap_ejercicio(
            '${ITEM_RUTINA_ID}'::uuid,
            '${EJ_PRENSA}'::uuid,
            NULL,
            'Entrenador ajeno intentando modificar rutina'
          );
        `)
      ).rejects.toThrow(/No autorizado para modificar la rutina de este alumno/);
    });

    it("permite la ejecución exitosa al ENTRENADOR ASIGNADO y registra en sustituciones_ejercicios", async () => {
      const { rows: swapRows } = await queryAs<{ id: string; ejercicio_id: string; notas: string }>(
        "authenticated",
        COACH_ID,
        `
          SELECT id, ejercicio_id, notas
          FROM public.quick_swap_ejercicio(
            '${ITEM_RUTINA_ID}'::uuid,
            '${EJ_PRENSA}'::uuid,
            NULL,
            'Sustitución por molestia patelofemoral'
          );
        `
      );

      expect(swapRows.length).toBe(1);
      const swapResult = swapRows[0]!;
      expect(swapResult.ejercicio_id).toBe(EJ_PRENSA);
      expect(swapResult.notas).toContain("Sustituido por Prensa Inclinada 45");
      expect(swapResult.notas).toContain("Sustitución por molestia patelofemoral");

      // Verificar registro estructurado en public.sustituciones_ejercicios
      const { rows: auditRows } = await queryAs<{
        ejercicio_original_id: string;
        ejercicio_sustituto_id: string;
        motivo: string;
        responsable_id: string;
        created_at: string;
      }>(
        "authenticated",
        COACH_ID,
        `
          SELECT ejercicio_original_id, ejercicio_sustituto_id, motivo, responsable_id, created_at
          FROM public.sustituciones_ejercicios
          WHERE ejercicio_en_rutina_id = '${ITEM_RUTINA_ID}'
          ORDER BY created_at DESC LIMIT 1;
        `
      );

      expect(auditRows.length).toBe(1);
      const auditResult = auditRows[0]!;
      expect(auditResult.ejercicio_original_id).toBe(EJ_SENTADILLA);
      expect(auditResult.ejercicio_sustituto_id).toBe(EJ_PRENSA);
      expect(auditResult.motivo).toBe("Sustitución por molestia patelofemoral");
      expect(auditResult.responsable_id).toBe(COACH_ID);
      expect(auditResult.created_at).toBeTruthy();
    });

    it("GARANTÍA DE INMUTABILIDAD HISTÓRICA: registro_sesiones y registro_series pasadas permanecen intactas", async () => {
      // Las sesiones completadas en el pasado NUNCA deben cambiar su ejercicio_id histórico
      const { rows: sesionRows } = await queryAs<{ volumen_total_kg: string | number }>(
        "authenticated",
        COACH_ID,
        `SELECT volumen_total_kg FROM public.registro_sesiones WHERE id = '${SESION_PASADA_ID}';`
      );
      expect(Number(sesionRows[0]!.volumen_total_kg)).toBe(4800.0);

      const { rows: seriesRows } = await queryAs<{ ejercicio_id: string; peso_kg: string | number; reps_hechas: number }>(
        "authenticated",
        COACH_ID,
        `SELECT ejercicio_id, peso_kg, reps_hechas FROM public.registro_series WHERE id = '${SERIE_PASADA_ID}';`
      );
      const serieResult = seriesRows[0]!;
      expect(serieResult.ejercicio_id).toBe(EJ_SENTADILLA); // Sigue siendo la Sentadilla original
      expect(Number(serieResult.peso_kg)).toBe(120.0);
      expect(serieResult.reps_hechas).toBe(10);
    });

    it("el alumno puede consultar el catálogo de alternativas pero NO puede insertar ni modificarlo (RLS)", async () => {
      // Insertar una alternativa como Coach
      await queryAs("authenticated", COACH_ID, `
        INSERT INTO public.ejercicios_alternativas (
          ejercicio_origen_id, ejercicio_alternativo_id, patron_movimiento,
          equipamiento, nivel_exigencia, explicacion_tecnica
        ) VALUES (
          '${EJ_SENTADILLA}', '${EJ_BULGARAS}', 'SENTADILLA',
          'MANCUERNAS', 'MODERADO', 'Variante unilateral con menor compresión espinal'
        );
      `);

      // Alumno consulta catálogo -> Permitido
      const { rows: alumnoSelect } = await queryAs(
        "authenticated",
        ALUMNO_ID,
        `SELECT id, explicacion_tecnica FROM public.ejercicios_alternativas WHERE ejercicio_origen_id = '${EJ_SENTADILLA}';`
      );
      expect(alumnoSelect.length).toBeGreaterThanOrEqual(1);

      // Alumno intenta insertar -> Bloqueado por RLS (0 rows insertadas o violación RLS)
      await expect(
        queryAs("authenticated", ALUMNO_ID, `
          INSERT INTO public.ejercicios_alternativas (
            ejercicio_origen_id, ejercicio_alternativo_id, patron_movimiento,
            equipamiento, nivel_exigencia, explicacion_tecnica
          ) VALUES (
            '${EJ_SENTADILLA}', '${EJ_PRENSA}', 'SENTADILLA',
            'MAQUINA', 'BAJO', 'Intento no autorizado de alumno'
          );
        `)
      ).rejects.toThrow(/row-level security/);
    });
  });

  // =========================================================================
  // 3. CASOS LÍMITE (EDGE CASES) Y ROBUSTEZ OFFLINE
  // =========================================================================
  describe("3. Casos Límite (Edge Cases) y Robustez Offline", () => {
    it("soporta modo avión guardando la molestia pendiente en currentSession.molestias y activando freno local", async () => {
      // Simular desconexión
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });

      const creada = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-offline-99",
        ejercicioId: "ej-lumbar-99",
        numeroSerie: 3,
        zona: "LUMBAR",
        eva: 9,
        momento: "EN_SERIE",
        sintomas: ["Dolor punzante/súbito"],
        notas: "Punzón severo en zona lumbar baja",
      });

      // Freno de seguridad inmediato en local sin depender de internet
      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);

      // Molestia persistida en outbox de sesión con estado pendiente
      const molestias = useAthleteStore.getState().currentSession.molestias ?? [];
      expect(molestias.length).toBe(1);
      expect(molestias[0]?.id).toBe(creada.id);
      expect(molestias[0]?.envio).toBe("pendiente");
      expect(molestias[0]?.zona).toBe("LUMBAR");
      expect(molestias[0]?.nivel).toBe("alarma");
    });

    it("base de datos rechaza momentos de aparición inválidos mediante CHECK constraint", async () => {
      await expect(
        queryAs("authenticated", ALUMNO_ID, `
          INSERT INTO public.alumno_historial_dolor (
            alumno_id, ejercicio_id, zona_articular, severidad,
            momento_aparicion, estado
          ) VALUES (
            '${ALUMNO_ID}', '${EJ_SENTADILLA}', 'RODILLA', 'MODERADO',
            'DURMIENDO_EN_CASA', 'PENDIENTE'
          );
        `)
      ).rejects.toThrow();
    });

    it("base de datos rechaza estados de caso inválidos mediante CHECK constraint", async () => {
      await expect(
        queryAs("authenticated", ALUMNO_ID, `
          INSERT INTO public.alumno_historial_dolor (
            alumno_id, ejercicio_id, zona_articular, severidad,
            momento_aparicion, estado
          ) VALUES (
            '${ALUMNO_ID}', '${EJ_SENTADILLA}', 'RODILLA', 'MODERADO',
            'CALENTAMIENTO', 'IGNORADO_TOTALMENTE'
          );
        `)
      ).rejects.toThrow();
    });

    it("base de datos rechaza severidades de alerta inválidas mediante CHECK constraint", async () => {
      await expect(
        queryAs("authenticated", COACH_ID, `
          INSERT INTO public.alertas_entrenador (
            alumno_id, profesor_id, tipo_alerta, severidad, titulo
          ) VALUES (
            '${ALUMNO_ID}', '${COACH_ID}', 'DOLOR_ARTICULAR', 'SUPER_URGENTISIMO', 'Severidad inventada'
          );
        `)
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 4. VERIFICACIÓN MATEMÁTICA ESTRICTA DE MÉTRICAS DE FUERZA (CONTRATO QA)
  // =========================================================================
  describe("4. Verificación Matemática Estricta de Fórmulas de Fuerza (Mandato QA)", () => {
    describe("Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula exactamente 1RM para valores estándar", () => {
        // 100 kg x 10 reps = 100 * (1 + 10/30) = 133.3333...
        const epley100x10 = calculateEpley1RM(100, 10);
        expect(epley100x10).toBeCloseTo(133.333, 2);

        // 80 kg x 5 reps = 80 * (1 + 5/30) = 93.3333...
        const epley80x5 = calculateEpley1RM(80, 5);
        expect(epley80x5).toBeCloseTo(93.333, 2);
      });

      it("casos límite: 1 repetición equivale a 155.0 kg para 150 kg x 1 rep", () => {
        expect(calculateEpley1RM(150, 1)).toBeCloseTo(155.0, 1); // 150 * (1 + 1/30)
      });

      it("casos límite: 0 repeticiones, valores nulos o negativos retornan 0 de forma segura", () => {
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(-50, 5)).toBe(0);
        expect(calculateEpley1RM(100, -5)).toBe(0);
        expect(calculateEpley1RM(Number.NaN, 5)).toBe(0);
        expect(calculateEpley1RM(100, Number.POSITIVE_INFINITY)).toBe(0);
      });
    });

    describe("Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula exactamente 1RM para valores estándar", () => {
        // 100 kg x 1 rep: 100 / (1.0278 - 0.0278 * 1) = 100 / 1.0 = 100 kg
        const brzycki100x1 = calculateBrzycki1RM(100, 1);
        expect(brzycki100x1).toBeCloseTo(100.0, 1);

        // 100 kg x 5 reps: 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.511...
        const brzycki100x5 = calculateBrzycki1RM(100, 5);
        expect(brzycki100x5).toBeCloseTo(112.51, 1);
      });

      it("casos límite: repeticiones que anulen o hagan negativo el denominador retornan 0", () => {
        // Con reps >= 37, el denominador (1.0278 - 0.0278 * 37) <= 0
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);
        expect(calculateBrzycki1RM(0, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, 0)).toBe(0);
        expect(calculateBrzycki1RM(-10, 5)).toBe(0);
      });
    });

    describe("Tonelaje Total Semanal: Tonelaje = Σ (Series * Reps * Peso)", () => {
      it("calcula la suma ponderada exacta de todos los bloques", () => {
        const bloques = [
          { series: 4, reps: 8, peso: 100 },  // 4 * 8 * 100 = 3200 kg
          { series: 3, reps: 12, peso: 60 },  // 3 * 12 * 60 = 2160 kg
          { series: 3, reps: 15, peso: 20 },  // 3 * 15 * 20 = 900 kg
        ];
        const tonelaje = calculateTotalTonnage(bloques);
        expect(tonelaje).toBe(6260); // 3200 + 2160 + 900
      });

      it("bloques con series, reps o peso <= 0 son ignorados sin contaminar el cálculo", () => {
        const bloques = [
          { series: 4, reps: 10, peso: 100 }, // 4000
          { series: 0, reps: 10, peso: 100 }, // 0
          { series: 3, reps: 0, peso: 100 },  // 0
          { series: 3, reps: 10, peso: -50 },  // 0
        ];
        expect(calculateTotalTonnage(bloques)).toBe(4000);
      });
    });
  });

  // =========================================================================
  // 5. AUDITORÍA DE NO SOBRE-INGENIERÍA Y ARQUITECTURA (KARPATHY & PONYTAIL)
  // =========================================================================
  describe("5. Auditoría de Arquitectura, No Sobre-Ingeniería y Backup (Karpathy)", () => {
    it("package.json no incorpora dependencias superfluas o librerías pesadas no autorizadas", () => {
      const pkgJson = JSON.parse(readSourceFile("../../package.json"));
      const allowedDeps = [
        "@supabase/ssr",
        "@supabase/supabase-js",
        "next",
        "react",
        "react-dom",
        "zustand",
      ];
      const deps = Object.keys(pkgJson.dependencies || {});
      for (const dep of deps) {
        expect(allowedDeps).toContain(dep);
      }
    });

    it("el script de backup-restore-gozs.mjs contiene las tablas ejercicios_alternativas y sustituciones_ejercicios", () => {
      const backupScript = readSourceFile("../../scripts/backup-restore-gozs.mjs");
      expect(backupScript).toContain('nombre: "ejercicios_alternativas"');
      expect(backupScript).toContain('nombre: "sustituciones_ejercicios"');
    });

    it("las sustituciones en Coach Studio se conservan en memoria y soportan getters de consulta", async () => {
      await useCoachStudioStore.getState().registrarSustitucion({
        ejercicioEnRutinaId: "rut-item-1",
        ejercicioOriginalId: "ej-orig-1",
        ejercicioSustitutoId: "ej-sust-1",
        planId: "plan-qa-1",
        motivo: "Molestia en rodilla",
        responsableId: "coach-qa-1",
        originalNombre: "Sentadilla",
        nuevoNombre: "Prensa",
      });

      const sustituciones = useCoachStudioStore.getState().getSustitucionesPlan("plan-qa-1");
      expect(sustituciones.length).toBe(1);
      const sust = sustituciones[0]!;
      expect(sust.ejercicio_original_id).toBe("ej-orig-1");
      expect(sust.ejercicio_sustituto_id).toBe("ej-sust-1");
      expect(sust.motivo).toBe("Molestia en rodilla");
    });
  });
});
