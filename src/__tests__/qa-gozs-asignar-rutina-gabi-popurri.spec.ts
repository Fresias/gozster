import { describe, it, expect, vi, beforeEach } from "vitest";
import { asignarRutinaAAlumno } from "@/services/rutinas-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { nombreUnico } from "@/lib/rutinas-biblioteca";

describe("QA GOZS: Asignación de rutina y resolución de 'Gabi Popurrí'", () => {
  let mockRpc: ReturnType<typeof vi.fn>;
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockGetUser: ReturnType<typeof vi.fn>;
  let mockClient: SupabaseClient<Database>;

  beforeEach(() => {
    mockRpc = vi.fn();
    mockInsert = vi.fn().mockResolvedValue({ error: null });
    mockGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: "coach-uuid-123" } },
      error: null,
    });

    mockClient = {
      rpc: mockRpc,
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
      }),
    } as unknown as SupabaseClient<Database>;
  });

  it("1. asignarRutinaAAlumno envía p_nombre cuando se propone un nombre personalizado (ej. clon o desambiguación)", async () => {
    mockRpc.mockResolvedValue({ data: "nuevo-plan-id", error: null });

    const result = await asignarRutinaAAlumno(
      "plan-popurri-id",
      "alumno-gabi-id",
      mockClient,
      "GABI POPURRÍ (copia)",
    );

    expect(result).toBe("nuevo-plan-id");
    expect(mockRpc).toHaveBeenCalledWith("asignar_rutina_a_alumno", {
      p_plan_id: "plan-popurri-id",
      p_alumno_id: "alumno-gabi-id",
      p_nombre: "GABI POPURRÍ (copia)",
    });
  });

  it("2. asignarRutinaAAlumno NO envía p_nombre si no se especifica", async () => {
    mockRpc.mockResolvedValue({ data: "nuevo-plan-id-2", error: null });

    const result = await asignarRutinaAAlumno(
      "plan-popurri-id",
      "alumno-gabi-id",
      mockClient,
    );

    expect(result).toBe("nuevo-plan-id-2");
    expect(mockRpc).toHaveBeenCalledWith("asignar_rutina_a_alumno", {
      p_plan_id: "plan-popurri-id",
      p_alumno_id: "alumno-gabi-id",
    });
  });

  it("3. Si la RPC falla con error de base de datos (ej. PGRST202 o check violation), registra en errores_app y lanza mensaje humano", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.asignar_rutina_a_alumno(p_alumno_id, p_nombre, p_plan_id) in the schema cache",
      },
    });

    await expect(
      asignarRutinaAAlumno("plan-popurri-id", "alumno-gabi-id", mockClient, "GABI POPURRÍ"),
    ).rejects.toThrow("No pudimos asignar la rutina. Intenta de nuevo.");

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: "coach-uuid-123",
        contexto: "asignar_rutina",
        mensaje_humano: "No pudimos asignar la rutina. Intenta de nuevo.",
        detalle_tecnico: expect.stringContaining("PGRST202"),
        payload_resumen: {
          plan_id: "plan-popurri-id",
          alumno_id: "alumno-gabi-id",
        },
      }),
    );
  });

  it("4. Desambiguación de nombres con nombreUnico: si el alumno ya tiene un plan con el mismo nombre, genera copia numerada", () => {
    const planesExistentes = ["GABI POPURRÍ", "GABI AGOSTO"];
    const propuesto = nombreUnico("GABI POPURRÍ", planesExistentes);

    expect(propuesto).toBe("GABI POPURRÍ (copia)");
    // Al asignarse nuevamente generará (copia 2)
    const propuesto2 = nombreUnico("GABI POPURRÍ", [...planesExistentes, propuesto]);
    expect(propuesto2).toBe("GABI POPURRÍ (copia 2)");
  });

  it("5. Validación de formato de repeticiones en rutinas: comprueba compatibilidad con chk_eer_repeticiones_formato", () => {
    const regexFormato = /^(\d{1,3}(-\d{1,3})*|\d{1,2}x\d{1,3})$/;

    // Formatos válidos que acepta el check constraint
    expect(regexFormato.test("10")).toBe(true);
    expect(regexFormato.test("8-12")).toBe(true);
    expect(regexFormato.test("10-8-6-4")).toBe(true);
    expect(regexFormato.test("3x10")).toBe(true);
    expect(regexFormato.test("4-6")).toBe(true);

    // Formatos legacy que provocan check violation y deben normalizarse
    expect(regexFormato.test("8/12")).toBe(false);
    expect(regexFormato.test("4/6")).toBe(false);
    expect(regexFormato.test("8 a 10")).toBe(false);
    expect(regexFormato.test("AL FALLO")).toBe(false);
  });
});
