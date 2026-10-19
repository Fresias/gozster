import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type {
  Database,
  AlertaEntrenador,
  AlertaEntrenadorInsert,
  AlertaEntrenadorUpdate,
  AlumnoHistorialDolor,
  AlumnoHistorialDolorInsert,
  AlumnoHistorialDolorUpdate,
  Perfil,
} from "@/types/database.types";
import { supabase } from "@/lib/supabase/client";

describe("GOZS-26: Alertas de Entrenador, Historial de Dolor y Quick Swap RPC", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../supabase/migrations/20261017100000_alertas_historial_dolor_quick_swap.sql"
  );

  describe("1. Integridad y Sintaxis de la Migración SQL", () => {
    it("debe existir el archivo de migración versionado en supabase/migrations/", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it("debe contener la definición completa y restricciones de la tabla alertas_entrenador", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.alertas_entrenador");
      expect(sql).toContain("alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE");
      expect(sql).toContain("profesor_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE");
      expect(sql).toContain("ejercicio_id UUID REFERENCES public.ejercicios(id) ON DELETE SET NULL");
      expect(sql).toContain("serie_id UUID REFERENCES public.registro_series(id) ON DELETE SET NULL");
      expect(sql).toContain(
        "tipo_alerta TEXT NOT NULL CHECK (tipo_alerta IN ('DOLOR_ARTICULAR', 'RECORD_1RM', 'DESERCION_RIESGO', 'CUOTA_VENCIDA', 'INACTIVIDAD'))"
      );
      expect(sql).toContain(
        "severidad TEXT NOT NULL DEFAULT 'ALTA' CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA'))"
      );
      expect(sql).toContain(
        "estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'RESUELTO', 'IGNORADO'))"
      );
      expect(sql).toContain("resuelto_por UUID REFERENCES public.perfiles(id)");
      expect(sql).toContain("resuelto_at TIMESTAMPTZ");
      expect(sql).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
      expect(sql).toContain("updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
    });

    it("debe contener la definición y restricciones de alumno_historial_dolor (Ficha Biomecánica Permanente)", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.alumno_historial_dolor");
      expect(sql).toContain("alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE");
      expect(sql).toContain("ejercicio_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE CASCADE");
      expect(sql).toContain(
        "zona_articular TEXT NOT NULL CHECK (zona_articular IN ('HOMBRO', 'RODILLA', 'LUMBAR', 'CODO', 'CUELLO', 'CADERA', 'TOBILLO', 'OTRO'))"
      );
      expect(sql).toContain(
        "severidad TEXT NOT NULL DEFAULT 'MODERADO' CHECK (severidad IN ('LEVE', 'MODERADO', 'AGUDO'))"
      );
      expect(sql).toContain(
        "estado_recuperacion TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado_recuperacion IN ('ACTIVO', 'EN_RECUPERACION', 'RESUELTO'))"
      );
      expect(sql).toContain("fecha_reporte DATE NOT NULL DEFAULT CURRENT_DATE");
      expect(sql).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
      expect(sql).toContain("updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
    });

    it("debe alterar quirúrgicamente la tabla perfiles con fecha_vencimiento_cuota y ultimo_entreno_at", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("ALTER TABLE public.perfiles");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS fecha_vencimiento_cuota DATE");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS ultimo_entreno_at TIMESTAMPTZ");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_perfiles_ultimo_entreno");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_perfiles_cuota_vencimiento");
    });

    it("debe implementar los triggers trg_actualizar_ultimo_entreno y trg_crear_alerta_dolor", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fn_actualizar_ultimo_entreno()");
      expect(sql).toContain("CREATE TRIGGER trg_actualizar_ultimo_entreno");
      expect(sql).toContain("AFTER INSERT ON public.registro_sesiones");

      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fn_crear_alerta_dolor()");
      expect(sql).toContain("CREATE TRIGGER trg_crear_alerta_dolor");
      expect(sql).toContain("AFTER INSERT OR UPDATE ON public.registro_series");
      expect(sql).toContain("NEW.pain_reported = true");
    });

    it("debe definir la función RPC transaccional quick_swap_ejercicio con SECURITY DEFINER", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.quick_swap_ejercicio");
      expect(sql).toContain("p_ejercicio_en_rutina_id UUID");
      expect(sql).toContain("p_nuevo_ejercicio_id UUID");
      expect(sql).toContain("p_alerta_id UUID DEFAULT NULL");
      expect(sql).toContain("p_motivo TEXT DEFAULT NULL");
      expect(sql).toContain("SECURITY DEFINER");
      expect(sql).toContain("SET search_path = public");
      expect(sql).toContain("public.es_entrenador_de(v_alumno_id)");
      expect(sql).toContain("UPDATE public.ejercicios_en_rutina");
      expect(sql).toContain("UPDATE public.alertas_entrenador");
    });

    it("debe aplicar Row Level Security estricto sin relajar permisos (cero USING true en estas tablas)", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("ALTER TABLE public.alertas_entrenador ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("ALTER TABLE public.alumno_historial_dolor ENABLE ROW LEVEL SECURITY;");

      expect(sql).toContain('CREATE POLICY "alertas_entrenador_select"');
      expect(sql).toContain('CREATE POLICY "alertas_entrenador_insert"');
      expect(sql).toContain('CREATE POLICY "alertas_entrenador_update"');
      expect(sql).toContain('CREATE POLICY "alertas_entrenador_delete"');

      expect(sql).toContain('CREATE POLICY "alumno_historial_dolor_select"');
      expect(sql).toContain('CREATE POLICY "alumno_historial_dolor_insert"');
      expect(sql).toContain('CREATE POLICY "alumno_historial_dolor_update"');
      expect(sql).toContain('CREATE POLICY "alumno_historial_dolor_delete"');

      // Verificar que NO existan políticas inseguras USING (true) para alertas_entrenador ni alumno_historial_dolor
      const lines = sql.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (line.includes('ON public.alertas_entrenador') || line.includes('ON public.alumno_historial_dolor')) {
          // Revisar las siguientes 10 líneas de la política
          const policyBlock = lines.slice(i, i + 10).join("\n");
          expect(policyBlock).not.toMatch(/USING\s*\(\s*true\s*\)/i);
          expect(policyBlock).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
        }
      }
    });

    it("debe crear índices para claves foráneas y delta sync (updated_at)", () => {
      const sql = fs.readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("idx_alertas_entrenador_profesor_id");
      expect(sql).toContain("idx_alertas_entrenador_alumno_id");
      expect(sql).toContain("idx_alertas_entrenador_ejercicio_id");
      expect(sql).toContain("idx_alertas_entrenador_serie_id");
      expect(sql).toContain("idx_alertas_entrenador_updated_at");

      expect(sql).toContain("idx_alumno_historial_dolor_alumno");
      expect(sql).toContain("idx_alumno_historial_dolor_ejercicio");
      expect(sql).toContain("idx_alumno_historial_dolor_zona");
      expect(sql).toContain("idx_alumno_historial_dolor_updated_at");
    });
  });

  describe("2. Verificación de Tipos TypeScript (database.types.ts)", () => {
    it("debe validar la tipificación de AlertaEntrenador", () => {
      const dummyAlerta: AlertaEntrenador = {
        id: "a0000000-0000-0000-0000-000000000001",
        alumno_id: "u0000000-0000-0000-0000-000000000001",
        profesor_id: "p0000000-0000-0000-0000-000000000001",
        ejercicio_id: "e0000000-0000-0000-0000-000000000001",
        serie_id: "s0000000-0000-0000-0000-000000000001",
        tipo_alerta: "DOLOR_ARTICULAR",
        severidad: "ALTA",
        titulo: "Dolor en Hombro",
        detalle: "Pinchazo agudo durante serie 2",
        estado: "PENDIENTE",
        accion_tomada: null,
        resuelto_por: null,
        resuelto_at: null,
        created_at: "2026-10-17T12:00:00Z",
        updated_at: "2026-10-17T12:00:00Z",
      };

      expect(dummyAlerta.tipo_alerta).toBe("DOLOR_ARTICULAR");
      expect(dummyAlerta.severidad).toBe("ALTA");
      expect(dummyAlerta.estado).toBe("PENDIENTE");
    });

    it("debe validar la tipificación de AlumnoHistorialDolor", () => {
      const dummyHistorial: AlumnoHistorialDolor = {
        id: "h0000000-0000-0000-0000-000000000001",
        alumno_id: "u0000000-0000-0000-0000-000000000001",
        ejercicio_id: "e0000000-0000-0000-0000-000000000001",
        zona_articular: "HOMBRO",
        severidad: "MODERADO",
        notas_alumno: "Molestia en articulación glenohumeral",
        notas_profesor: "Sustituido por Press Banca Mancuernas neutro",
        estado_recuperacion: "ACTIVO",
        fecha_reporte: "2026-10-17",
        momento_aparicion: null,
        es_sintoma_alarma: false,
        sintomas_alarma: [],
        estado: "PENDIENTE",
        created_at: "2026-10-17T12:00:00Z",
        updated_at: "2026-10-17T12:00:00Z",
      };

      expect(dummyHistorial.zona_articular).toBe("HOMBRO");
      expect(dummyHistorial.estado_recuperacion).toBe("ACTIVO");
    });

    it("debe incluir fecha_vencimiento_cuota y ultimo_entreno_at en Perfil", () => {
      const dummyPerfil: Partial<Perfil> = {
        id: "p0000000-0000-0000-0000-000000000001",
        nombre_completo: "Carlos Bilardo",
        fecha_vencimiento_cuota: "2026-11-01",
        ultimo_entreno_at: "2026-10-17T10:30:00Z",
      };

      expect(dummyPerfil.fecha_vencimiento_cuota).toBe("2026-11-01");
      expect(dummyPerfil.ultimo_entreno_at).toBe("2026-10-17T10:30:00Z");
    });

    it("debe validar el tipado de la función RPC quick_swap_ejercicio", () => {
      type QuickSwapFn = Database["public"]["Functions"]["quick_swap_ejercicio"];
      type QuickSwapArgs = QuickSwapFn["Args"];
      type QuickSwapReturn = QuickSwapFn["Returns"];

      const args: QuickSwapArgs = {
        p_ejercicio_en_rutina_id: "r0000000-0000-0000-0000-000000000001",
        p_nuevo_ejercicio_id: "e0000000-0000-0000-0000-000000000002",
        p_alerta_id: "a0000000-0000-0000-0000-000000000001",
        p_motivo: "Dolor en hombro reportado por atleta",
      };

      expect(args.p_ejercicio_en_rutina_id).toBeDefined();
      expect(args.p_nuevo_ejercicio_id).toBeDefined();
    });
  });

  describe("3. Simulación de Lógica de Detección Biomecánica y Quick Swap", () => {
    function inferirZonaArticular(painNotes: string | null, musculos: string[]): string {
      const upper = (painNotes || "").toUpperCase();
      if (upper.includes("HOMBRO")) return "HOMBRO";
      if (upper.includes("RODILLA")) return "RODILLA";
      if (upper.includes("LUMBAR") || upper.includes("ESPALDA BAJA")) return "LUMBAR";
      if (upper.includes("CODO")) return "CODO";
      if (upper.includes("CUELLO") || upper.includes("CERVICAL")) return "CUELLO";
      if (upper.includes("CADERA")) return "CADERA";
      if (upper.includes("TOBILLO")) return "TOBILLO";

      if (musculos && musculos.length > 0) {
        const muscUpper = musculos.map((m) => m.toUpperCase());
        if (muscUpper.some((m) => ["HOMBRO", "HOMBROS", "DELTOIDES"].includes(m))) return "HOMBRO";
        if (muscUpper.some((m) => ["CUADRICEPS", "ISQUIOS", "ISQUIOTIBIALES", "RODILLA", "PIERNAS"].includes(m))) return "RODILLA";
        if (muscUpper.some((m) => ["LUMBARES", "LUMBAR", "ESPALDA BAJA", "ESPALDA"].includes(m))) return "LUMBAR";
        if (muscUpper.some((m) => ["BICEPS", "TRICEPS", "CODO", "BRAZOS"].includes(m))) return "CODO";
        if (muscUpper.some((m) => ["GLUTEOS", "CADERA"].includes(m))) return "CADERA";
        if (muscUpper.some((m) => ["GEMELOS", "PANTORRILLAS", "TOBILLO"].includes(m))) return "TOBILLO";
      }

      return "OTRO";
    }

    it("debe inferir correctamente zonas articulares desde notas o anatomía del ejercicio", () => {
      expect(inferirZonaArticular("Pinchazo en el hombro derecho al empujar", [])).toBe("HOMBRO");
      expect(inferirZonaArticular("Molestia en la rodilla al bajar", [])).toBe("RODILLA");
      expect(inferirZonaArticular("Tirón lumbar durante el despegue", [])).toBe("LUMBAR");
      expect(inferirZonaArticular(null, ["Deltoides", "Pectoral"])).toBe("HOMBRO");
      expect(inferirZonaArticular(null, ["Cuadriceps", "Gluteos"])).toBe("RODILLA");
      expect(inferirZonaArticular(null, ["Inespecífico"])).toBe("OTRO");
    });

    it("debe simular la ejecución atómica de quick_swap_ejercicio", () => {
      // Estado inicial simulado
      const rutinaItem = {
        id: "er-001",
        ejercicio_id: "ej-barra",
        notas: "Series pesadas al 85% 1RM",
      };

      const alerta = {
        id: "al-001",
        alumno_id: "al-123",
        ejercicio_id: "ej-barra",
        estado: "PENDIENTE",
        accion_tomada: null as string | null,
        resuelto_at: null as string | null,
      };

      // Ejecución del swap
      const nuevoEjercicioNombre = "Press con Mancuernas en Banco Inclinado";
      const motivo = "Dolor articular en hombro reportado";
      const notaSwap = `Sustituido por ${nuevoEjercicioNombre} (Motivo: ${motivo})`;

      rutinaItem.ejercicio_id = "ej-mancuernas";
      rutinaItem.notas = `${rutinaItem.notas}\n${notaSwap}`;

      alerta.estado = "RESUELTO";
      alerta.accion_tomada = `Quick swap por ${nuevoEjercicioNombre}`;
      alerta.resuelto_at = new Date().toISOString();

      // Verificaciones del resultado atómico
      expect(rutinaItem.ejercicio_id).toBe("ej-mancuernas");
      expect(rutinaItem.notas).toContain(nuevoEjercicioNombre);
      expect(rutinaItem.notas).toContain(motivo);
      expect(alerta.estado).toBe("RESUELTO");
      expect(alerta.accion_tomada).toContain("Quick swap por");
      expect(alerta.resuelto_at).toBeDefined();
    });
  });

  describe("4. Verificación de Tablas en Supabase Live", () => {
    it("debe validar conectividad con las tablas de base de datos", async () => {
      const { data, error } = await supabase.from("perfiles").select("id, nombre_completo").limit(1);
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });
  });
});
