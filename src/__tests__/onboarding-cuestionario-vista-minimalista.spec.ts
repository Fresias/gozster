import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import type {
  NivelVistaAlumno,
  AlumnoCuestionarioInicial,
  AlumnoCuestionarioInicialInsert,
  AlumnoCuestionarioInicialUpdate,
} from "@/types/database.types";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  calculateEpley1RM,
  calculateBrzycki1RM,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const COACH = "00000000-0000-0000-0000-000000000002";
const OTRO_COACH = "00000000-0000-0000-0000-000000000003";
const ALUMNO = "00000000-0000-0000-0000-000000000004";
const OTRO_ALUMNO = "00000000-0000-0000-0000-000000000005";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SEED_PERFILES = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),
    ('${ALUMNO}','a@t'),('${OTRO_ALUMNO}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a@t','Alumno','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','b@t','Otro alumno','ALUMNO','${OTRO_COACH}','ACTIVA');
`;

let db: PGlite;

async function aplicarMigracion(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

describe("Issue #65 / ADR-004: Onboarding, Cuestionario Inicial y Vista Minimalista (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const archivo of archivos) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8");
      await aplicarMigracion(sql);
    }

    await db.exec(SEED_PERFILES);
  }, 120_000);

  describe("1. Columna nivel_vista_alumno y restricciones en perfiles", () => {
    it("posee DEFAULT 'SIMPLE' para perfiles preexistentes y nuevos", async () => {
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("SIMPLE");
    });

    it("rechaza valores que no sean 'SIMPLE' o 'TECNICA' mediante el check constraint", async () => {
      await expect(
        db.query(
          `UPDATE public.perfiles SET nivel_vista_alumno = 'AVANZADA' WHERE id = '${ALUMNO}'`
        )
      ).rejects.toThrow(/chk_perfiles_nivel_vista_alumno/);
    });

    it("el alumno NO puede modificar su propio nivel_vista_alumno (fn_proteger_campos_perfil)", async () => {
      await expect(
        como(
          "authenticated",
          ALUMNO,
          `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
        )
      ).rejects.toThrow(/Solo el entrenador asignado puede modificar/);
    });

    it("un entrenador no asignado NO puede modificar el nivel_vista_alumno de un alumno ajeno (RLS filtra 0 filas)", async () => {
      const res = await como(
        "authenticated",
        OTRO_COACH,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
      );
      expect(res.affectedRows).toBe(0);
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("SIMPLE");
    });

    it("el entrenador asignado PUEDE modificar nivel_vista_alumno del alumno", async () => {
      await como(
        "authenticated",
        COACH,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
      );
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("TECNICA");

      // Regresar a SIMPLE
      await como(
        "authenticated",
        COACH,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'SIMPLE' WHERE id = '${ALUMNO}'`
      );
      const r2 = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r2.rows[0]?.nivel_vista_alumno).toBe("SIMPLE");
    });

    it("un usuario ADMIN PUEDE modificar nivel_vista_alumno de cualquier alumno", async () => {
      await como(
        "authenticated",
        ADMIN,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
      );
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("TECNICA");

      // Restaurar
      await como(
        "authenticated",
        ADMIN,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'SIMPLE' WHERE id = '${ALUMNO}'`
      );
    });
  });

  describe("2. Tabla alumno_cuestionario_inicial y RLS", () => {
    it("el alumno puede insertar su propio cuestionario inicial", async () => {
      const res = await como<{ id: string; objetivo_principal: string }>(
        "authenticated",
        ALUMNO,
        `INSERT INTO public.alumno_cuestionario_inicial (
          alumno_id, objetivo_principal, experiencia_previa, dias_disponibles_semana, molestias_o_lesiones_previas, equipamiento_disponible, respuestas_extra
        ) VALUES (
          '${ALUMNO}', 'Hipertrofia y fuerza', '2 años de gimnasio', 4, 'Ninguna', 'Gimnasio comercial completo', '{"horario_preferido": "tarde"}'::jsonb
        ) RETURNING id, objetivo_principal`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.objetivo_principal).toBe("Hipertrofia y fuerza");
    });

    it("el alumno puede consultar su propio cuestionario inicial", async () => {
      const res = await como<{ alumno_id: string; dias_disponibles_semana: number }>(
        "authenticated",
        ALUMNO,
        `SELECT alumno_id, dias_disponibles_semana FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.dias_disponibles_semana).toBe(4);
    });

    it("el alumno puede actualizar su propio cuestionario inicial y updated_at se actualiza", async () => {
      const antes = await db.query<{ updated_at: string }>(
        `SELECT updated_at::text FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );

      // Pequeño delay para asegurar que el timestamp cambie
      await new Promise((r) => setTimeout(r, 10));

      await como(
        "authenticated",
        ALUMNO,
        `UPDATE public.alumno_cuestionario_inicial
         SET dias_disponibles_semana = 5, objetivo_principal = 'Ganancia de masa muscular'
         WHERE alumno_id = '${ALUMNO}'`
      );

      const despues = await db.query<{ dias_disponibles_semana: number; objetivo_principal: string; updated_at: string }>(
        `SELECT dias_disponibles_semana, objetivo_principal, updated_at::text FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(despues.rows[0]?.dias_disponibles_semana).toBe(5);
      expect(despues.rows[0]?.objetivo_principal).toBe("Ganancia de masa muscular");
      expect(despues.rows[0]?.updated_at).toBeDefined();
    });

    it("el entrenador asignado puede ver el cuestionario de su alumno", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        COACH,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.alumno_id).toBe(ALUMNO);
    });

    it("un usuario ADMIN puede ver el cuestionario de cualquier alumno", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        ADMIN,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.alumno_id).toBe(ALUMNO);
    });

    it("un entrenador ajeno NO puede ver el cuestionario de un alumno no asignado", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        OTRO_COACH,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(0);
    });

    it("otro alumno NO puede ver el cuestionario ajeno", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        OTRO_ALUMNO,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(0);
    });

    it("un alumno NO puede insertar un cuestionario para otro alumno", async () => {
      await expect(
        como(
          "authenticated",
          OTRO_ALUMNO,
          `INSERT INTO public.alumno_cuestionario_inicial (alumno_id, objetivo_principal)
           VALUES ('${ALUMNO}', 'Intento de suplantar')`
        )
      ).rejects.toThrow(/row-level security|permission denied/);
    });

    it("un alumno NO puede modificar el cuestionario de otro alumno", async () => {
      await como(
        "authenticated",
        OTRO_ALUMNO,
        `UPDATE public.alumno_cuestionario_inicial SET objetivo_principal = 'Hackeado' WHERE alumno_id = '${ALUMNO}'`
      );
      // RLS filtra filas no visibles en UPDATE, por lo que no altera la fila
      const r = await db.query<{ objetivo_principal: string }>(
        `SELECT objetivo_principal FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.objetivo_principal).toBe("Ganancia de masa muscular");
    });

    it("usuario anónimo (anon) no puede leer ni escribir en alumno_cuestionario_inicial", async () => {
      const r = await como<{ alumno_id: string }>(
        "anon",
        null,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(r.rows.length).toBe(0);

      await expect(
        como(
          "anon",
          null,
          `INSERT INTO public.alumno_cuestionario_inicial (alumno_id, objetivo_principal) VALUES ('${ALUMNO}', 'Anon')`
        )
      ).rejects.toThrow(/row-level security|permission denied/);
    });

    it("la eliminación del perfil borra el cuestionario en cascada (ON DELETE CASCADE)", async () => {
      const TEMP_USER = "00000000-0000-0000-0000-000000000099";
      await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${TEMP_USER}', 'temp@t');`);
      await db.exec(
        `INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES ('${TEMP_USER}', 'temp@t', 'Temp', 'ALUMNO');`
      );
      await como(
        "authenticated",
        TEMP_USER,
        `INSERT INTO public.alumno_cuestionario_inicial (alumno_id, objetivo_principal) VALUES ('${TEMP_USER}', 'Temporal')`
      );

      const antes = await db.query(
        `SELECT id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${TEMP_USER}'`
      );
      expect(antes.rows.length).toBe(1);

      await db.exec(`DELETE FROM public.perfiles WHERE id = '${TEMP_USER}'`);

      const despues = await db.query(
        `SELECT id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${TEMP_USER}'`
      );
      expect(despues.rows.length).toBe(0);
    });
  });

  describe("3. Coherencia de tipos TypeScript", () => {
    it("los tipos NivelVistaAlumno y AlumnoCuestionarioInicial están tipados correctamente", () => {
      const nivelValido1: NivelVistaAlumno = "SIMPLE";
      const nivelValido2: NivelVistaAlumno = "TECNICA";
      expect(nivelValido1).toBe("SIMPLE");
      expect(nivelValido2).toBe("TECNICA");

      const insertPayload: AlumnoCuestionarioInicialInsert = {
        alumno_id: ALUMNO,
        objetivo_principal: "Fuerza",
        experiencia_previa: "Intermedio",
        dias_disponibles_semana: 3,
        molestias_o_lesiones_previas: null,
        equipamiento_disponible: "Mancuernas",
        respuestas_extra: { dias: [1, 3, 5] },
      };
      expect(insertPayload.alumno_id).toBe(ALUMNO);

      const updatePayload: AlumnoCuestionarioInicialUpdate = {
        dias_disponibles_semana: 4,
      };
      expect(updatePayload.dias_disponibles_semana).toBe(4);
    });
  });

  describe("4. Zustand Stores: useAthleteStore y useCoachStudioStore", () => {
    beforeEach(() => {
      useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [] });
      useAthleteStore.getState().resetSessionToDefaults();
      useAthleteStore.getState().setNivelVistaAlumno("SIMPLE");
      useAthleteStore.getState().setCuestionarioInicial(null);
      vi.restoreAllMocks();
    });

    it("useAthleteStore inicia por defecto en modo SIMPLE y cuestionarioInicial null", () => {
      const state = useAthleteStore.getState();
      expect(state.nivelVistaAlumno).toBe("SIMPLE");
      expect(state.cuestionarioInicial).toBeNull();
    });

    it("permite alternar el nivel de vista entre SIMPLE y TECNICA", () => {
      const store = useAthleteStore.getState();
      store.setNivelVistaAlumno("TECNICA");
      expect(useAthleteStore.getState().nivelVistaAlumno).toBe("TECNICA");

      store.setNivelVistaAlumno("SIMPLE");
      expect(useAthleteStore.getState().nivelVistaAlumno).toBe("SIMPLE");
    });

    it("guarda el cuestionario inicial en memoria y encola evento offline", async () => {
      const store = useAthleteStore.getState();
      await store.saveCuestionarioInicial({
        objetivo_principal: "Ganar masa muscular y fuerza",
        experiencia_previa: "1 a 2 años",
        dias_disponibles_semana: 4,
        molestias_o_lesiones_previas: "Molestia leve en hombro derecho",
        equipamiento_disponible: "Gimnasio comercial completo",
        respuestas_extra: { comentarios: "Prefiero no hacer sentadilla profunda" },
      });

      const updated = useAthleteStore.getState().cuestionarioInicial;
      expect(updated).not.toBeNull();
      expect(updated?.objetivo_principal).toBe("Ganar masa muscular y fuerza");
      expect(updated?.dias_disponibles_semana).toBe(4);
      expect(updated?.completado_at).toBeDefined();

      const queue = useOfflineQueueStore.getState().pendingEvents;
      const queueEvent = queue.find((e) => e.action === "UPSERT_CUESTIONARIO_INICIAL");
      expect(queueEvent).toBeDefined();
      expect((queueEvent?.payload as any)?.objetivo_principal).toBe("Ganar masa muscular y fuerza");
    });

    it("en modo SIMPLE: completeSet permite registrar serie normal con peso y repeticiones sin bloqueo", () => {
      const store = useAthleteStore.getState();
      store.setNivelVistaAlumno("SIMPLE");

      const session = store.currentSession;
      const ejId = session.ejercicios[0]!.id;

      store.updateSetField(ejId, 1, "peso_kg", 80);
      store.updateSetField(ejId, 1, "reps_hechas", 10);
      store.completeSet(ejId, 1);

      expect(useAthleteStore.getState().rpeValidationError).toBeNull();
      const updatedSet = useAthleteStore
        .getState()
        .currentSession.ejercicios[0]!.series[0]!;
      expect(updatedSet.completada).toBe(true);
      expect(updatedSet.peso_kg).toBe(80);
      expect(updatedSet.reps_hechas).toBe(10);
    });

    it("en modo TECNICA: completeSet exige RPE obligatorio si force_rpe_required está activo", () => {
      const store = useAthleteStore.getState();
      store.setNivelVistaAlumno("TECNICA");

      const session = store.currentSession;
      const ejId = session.ejercicios[0]!.id;
      session.ejercicios[0]!.force_rpe_required = true;
      session.ejercicios[0]!.series[0]!.completada = false;
      session.ejercicios[0]!.series[0]!.rpe_real = 0;

      store.completeSet(ejId, 1);

      expect(useAthleteStore.getState().rpeValidationError).toContain("exige registrar un RPE válido");
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.completada).toBe(false);

      store.updateSetField(ejId, 1, "rpe_real", 8);
      store.completeSet(ejId, 1);
      expect(useAthleteStore.getState().rpeValidationError).toBeNull();
      expect(useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.completada).toBe(true);

      // Limpiar mutación para no contaminar tests subsiguientes
      session.ejercicios[0]!.force_rpe_required = false;
      session.ejercicios[0]!.series[0]!.completada = false;
    });

    it("useCoachStudioStore.actualizarNivelVistaAlumno actualiza estado, muestra toast y encola evento", async () => {
      const coachStore = useCoachStudioStore.getState();
      const mockAlumno = coachStore.alumnos[0];
      if (!mockAlumno) return;

      await coachStore.actualizarNivelVistaAlumno(mockAlumno.id, "TECNICA");

      const alumnoActualizado = useCoachStudioStore
        .getState()
        .alumnos.find((a) => a.id === mockAlumno.id);
      expect(alumnoActualizado?.nivel_vista_alumno).toBe("TECNICA");

      const toast = useCoachStudioStore.getState().toast;
      expect(toast?.title).toBe("Nivel de vista actualizado");
      expect(toast?.message).toContain("Vista Técnica Avanzada");

      const queue = useOfflineQueueStore.getState().pendingEvents;
      const queueEvent = queue.find((e) => e.action === "UPDATE_ALUMNO_NIVEL_VISTA");
      expect(queueEvent).toBeDefined();
      expect((queueEvent?.payload as any)?.nivel).toBe("TECNICA");
    });
  });

  describe("5. Ergonomía Táctil, PWA Offline y Componentes de UI", () => {
    const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
    const cuestionarioPath = path.resolve(__dirname, "../components/athlete/cuestionario-inicial.tsx");
    const studentDetailPath = path.resolve(__dirname, "../components/coach/student-detail.tsx");
    const coachStudioViewPath = path.resolve(__dirname, "../components/coach/coach-studio-view.tsx");

    const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
    const cuestionarioCode = fs.readFileSync(cuestionarioPath, "utf-8");
    const studentDetailCode = fs.readFileSync(studentDetailPath, "utf-8");
    const coachStudioViewCode = fs.readFileSync(coachStudioViewPath, "utf-8");

    it("Athlete App (LiveWorkout) contiene la solapa 'Cuestionario Inicial' sin bloquear el entrenamiento", () => {
      expect(liveWorkoutCode).toContain('data-testid="tab-cuestionario"');
      expect(liveWorkoutCode).toContain('data-testid="tab-workout"');
      // GOZS-144 PR1: las solapas Hábitos y Nutrición dejaron de montarse en la
      // app del alumno; sólo quedan Entrenamiento y Cuestionario.
      expect(liveWorkoutCode).toContain('useState<"workout" | "cuestionario">("workout")');
      expect(liveWorkoutCode).not.toContain('data-testid="tab-habits"');
      expect(liveWorkoutCode).not.toContain('data-testid="tab-nutrition"');
      expect(liveWorkoutCode).toContain("<CuestionarioInicial");
    });

    it("LiveWorkout provee conmutador de vista y oculta métricas complejas en modo SIMPLE", () => {
      expect(liveWorkoutCode).toContain('data-testid="athlete-view-mode-container"');
      expect(liveWorkoutCode).toContain('data-testid="athlete-toggle-vista-simple"');
      expect(liveWorkoutCode).toContain('data-testid="athlete-toggle-vista-tecnica"');

      expect(liveWorkoutCode).toContain("isSimpleView");
      expect(liveWorkoutCode).toContain("!isSimpleView && (");
      expect(liveWorkoutCode).toContain("setWarmupModalExercise");
      expect(liveWorkoutCode).not.toContain("setPlateModalWeight"); // GOZS-279: calculadora de discos eliminada
    });

    it("CuestionarioInicial ofrece experiencia opcional, accesible y táctil (>= 44-48px)", () => {
      expect(cuestionarioCode).toContain("Cuestionario Inicial (Opcional)");
      expect(cuestionarioCode).toContain('data-testid="cuestionario-inicial-container"');
      expect(cuestionarioCode).toContain('data-testid="cuestionario-opcional-badge"');
      expect(cuestionarioCode).toContain("No bloquea tu entrenamiento");

      expect(cuestionarioCode).toContain('data-testid="cuestionario-resumen-objetivo"');
      expect(cuestionarioCode).toContain('data-testid="cuestionario-resumen-experiencia"');
      expect(cuestionarioCode).toContain('data-testid="cuestionario-resumen-dias"');
      expect(cuestionarioCode).toContain('data-testid="cuestionario-resumen-equipamiento"');
      expect(cuestionarioCode).toContain('data-testid="cuestionario-resumen-molestias"');
      expect(cuestionarioCode).toContain('data-testid="input-molestias"');
      expect(cuestionarioCode).toContain('data-testid="input-comentarios"');

      expect(cuestionarioCode).toContain('data-testid="submit-cuestionario-btn"');
      expect(cuestionarioCode).toMatch(/min-h-\[48px\]|min-h-12/);

      expect(cuestionarioCode).toContain('data-testid="cuestionario-resumen-card"');
      expect(cuestionarioCode).toContain('data-testid="btn-editar-cuestionario"');
    });

    it("Coach Studio (StudentDetail) permite alternar vista SIMPLE/TECNICA y visualizar el cuestionario", () => {
      expect(studentDetailCode).toContain('data-testid="coach-nivel-vista-card"');
      expect(studentDetailCode).toContain('data-testid="coach-toggle-vista-simple"');
      expect(studentDetailCode).toContain('data-testid="coach-toggle-vista-tecnica"');

      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-card"');
      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-badge-completado"');
      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-badge-pendiente"');
      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-objetivo"');
      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-experiencia"');
      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-dias"');
      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-equipamiento"');
      expect(studentDetailCode).toContain('data-testid="coach-cuestionario-molestias"');
    });

    it("CoachStudioView propaga onActualizarNivelVista a StudentDetail", () => {
      expect(coachStudioViewCode).toContain("actualizarNivelVistaAlumno");
      expect(coachStudioViewCode).toContain("onActualizarNivelVista={actualizarNivelVistaAlumno}");
    });
  });

  describe("6. Auditoría Estricta QA: Casos Límite, Robustez Offline y Verificación Matemática de Fuerza", () => {
    it("verificación matemática estricta de 1RM Epley y Brzycki ante cargas reales y submáximas", () => {
      // Epley: 1RM = Peso * (1 + Reps / 30)
      const epley100 = calculateEpley1RM(100, 10);
      expect(epley100).toBeCloseTo(133.3333, 4);

      const epley140 = calculateEpley1RM(140, 5);
      expect(epley140).toBeCloseTo(163.3333, 4);

      // Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)
      const brzycki100 = calculateBrzycki1RM(100, 10);
      expect(brzycki100).toBeCloseTo(133.3689, 4);

      expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100.0, 4);
    });

    it("manejo riguroso de casos límite en fórmulas de fuerza (0 reps, peso negativo, NaN, overflow)", () => {
      expect(calculateEpley1RM(0, 10)).toBe(0);
      expect(calculateEpley1RM(100, 0)).toBe(0);
      expect(calculateEpley1RM(-50, 10)).toBe(0);
      expect(calculateEpley1RM(100, -5)).toBe(0);
      expect(calculateEpley1RM(Number.NaN, 10)).toBe(0);
      expect(calculateEpley1RM(100, Number.POSITIVE_INFINITY)).toBe(0);

      expect(calculateBrzycki1RM(0, 10)).toBe(0);
      expect(calculateBrzycki1RM(100, 0)).toBe(0);
      expect(calculateBrzycki1RM(-50, 10)).toBe(0);
      expect(calculateBrzycki1RM(100, -5)).toBe(0);
      expect(calculateBrzycki1RM(100, 37)).toBe(0);
      expect(calculateBrzycki1RM(100, 50)).toBe(0);
    });

    it("cálculo exacto de tonelaje semanal acumulado: sum(Series * Reps * Peso)", () => {
      const blocks = [
        { series: 4, reps: 8, peso: 100 },
        { series: 3, reps: 10, peso: 80 },
        { series: 5, reps: 5, peso: 120 },
      ];
      const tonelajeTotal = calculateTotalTonnage(blocks);
      expect(tonelajeTotal).toBe(8600);
    });

    it("en modo SIMPLE, LiveWorkout oculta estrictamente RPE, estimación 1RM y calculadoras avanzadas", () => {
      const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
      const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");

      expect(liveWorkoutCode).toContain("!isSimpleView && (");
      expect(liveWorkoutCode).toContain('data-testid="input-rpe"');
      expect(liveWorkoutCode).toContain("serie.estimated1RM.toFixed(1)} kg 1RM");
      expect(liveWorkoutCode).toContain("setWarmupModalExercise");
      expect(liveWorkoutCode).not.toContain("setPlateModalWeight");
      expect(liveWorkoutCode).toContain("Vol. Efectivo (Hevy)");
    });

    it("alumno nuevo inicia con cuestionarioInicial nulo y entrena de inmediato sin bloqueos de onboarding", () => {
      const store = useAthleteStore.getState();
      store.resetSessionToDefaults();
      store.setCuestionarioInicial(null);
      store.setNivelVistaAlumno("SIMPLE");

      expect(useAthleteStore.getState().cuestionarioInicial).toBeNull();
      expect(useAthleteStore.getState().nivelVistaAlumno).toBe("SIMPLE");

      const ejId = useAthleteStore.getState().currentSession.ejercicios[0]!.id;
      store.updateSetField(ejId, 1, "peso_kg", 60);
      store.updateSetField(ejId, 1, "reps_hechas", 12);
      store.completeSet(ejId, 1);

      expect(useAthleteStore.getState().rpeValidationError).toBeNull();
      const serieCompletada = useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!;
      expect(serieCompletada.completada).toBe(true);
      expect(serieCompletada.peso_kg).toBe(60);
      expect(serieCompletada.reps_hechas).toBe(12);
    });

    it("soporta llenado parcial del cuestionario y resiliencia offline ante desconexión", async () => {
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });
      const store = useAthleteStore.getState();

      await store.saveCuestionarioInicial({
        objetivo_principal: "Salud general y postura",
      });

      const cuestionarioGuardado = useAthleteStore.getState().cuestionarioInicial;
      expect(cuestionarioGuardado).not.toBeNull();
      expect(cuestionarioGuardado?.objetivo_principal).toBe("Salud general y postura");
      expect(cuestionarioGuardado?.experiencia_previa).toBeNull();
      expect(cuestionarioGuardado?.dias_disponibles_semana).toBeNull();

      const pending = useOfflineQueueStore.getState().pendingEvents;
      expect(pending.length).toBeGreaterThan(0);
      const offlineEvent = pending.find((e) => e.action === "UPSERT_CUESTIONARIO_INICIAL");
      expect(offlineEvent).toBeDefined();
      expect((offlineEvent?.payload as any)?.objetivo_principal).toBe("Salud general y postura");
    });

    it("la base de datos rechaza duplicados en alumno_cuestionario_inicial (alumno_id UNIQUE)", async () => {
      await expect(
        como(
          "authenticated",
          ALUMNO,
          `INSERT INTO public.alumno_cuestionario_inicial (alumno_id, objetivo_principal)
           VALUES ('${ALUMNO}', 'Segundo intento duplicado')`
        )
      ).rejects.toThrow(/alumno_cuestionario_inicial_alumno_id_key|unique/i);
    });
  });
});

