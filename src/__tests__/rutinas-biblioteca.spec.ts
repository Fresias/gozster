import { describe, it, expect, vi } from "vitest";
import { clasificarRutinas } from "@/lib/rutinas-biblioteca";
import { asignarRutinaAAlumno } from "@/services/rutinas-service";
import type { PlanEntrenamiento } from "@/types/database.types";

const plan = (over: Partial<PlanEntrenamiento>): PlanEntrenamiento => ({
  id: "p",
  profesor_id: "c",
  alumno_id: null,
  nombre: "n",
  estado: "ACTIVO",
  comentarios: null,
  fecha_inicio: "2026-10-01T00:00:00Z",
  fecha_fin: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("GOZS-296: biblioteca de rutinas", () => {
  it("reparte plantillas, rutinas de alumnos y archivadas", () => {
    const r = clasificarRutinas([
      plan({ id: "t", tipo: "PLANTILLA", etiqueta: "STANDARD" }),
      plan({ id: "a", tipo: "DE_ALUMNO", alumno_id: "al", estado: "BORRADOR" }),
      plan({ id: "v", tipo: "DE_ALUMNO", alumno_id: "al", estado: "INACTIVO", fecha_fin: "2026-10-20T00:00:00Z" }),
      plan({ id: "legacy", alumno_id: "al" }),
    ]);
    expect(r.plantillas.map((p) => p.id)).toEqual(["t"]);
    expect(r.deAlumnos.map((p) => p.id)).toEqual(["a", "legacy"]);
    expect(r.archivadas.map((p) => p.id)).toEqual(["v"]);
  });

  const cliente = (rpc: unknown) => {
    const insert = vi.fn().mockResolvedValue({});
    return {
      insert,
      client: {
        rpc: vi.fn().mockResolvedValue(rpc),
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "coach" } } }) },
        from: vi.fn(() => ({ insert })),
      } as never,
    };
  };

  it("devuelve el id del clon cuando la RPC funciona", async () => {
    const { client } = cliente({ data: "nuevo", error: null });
    await expect(asignarRutinaAAlumno("p", "a", client)).resolves.toBe("nuevo");
  });

  it("muestra el mensaje de negocio GZ010 y registra en errores_app", async () => {
    const { client, insert } = cliente({ data: null, error: { code: "GZ010", message: "La rutina ya no existe" } });
    await expect(asignarRutinaAAlumno("p", "a", client)).rejects.toThrow("La rutina ya no existe");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ usuario_id: "coach", contexto: "asignar_rutina" }));
  });

  it("oculta el error técnico en cualquier otro caso", async () => {
    const { client } = cliente({ data: null, error: { code: "42501", message: "permission denied for table x" } });
    await expect(asignarRutinaAAlumno("p", "a", client)).rejects.toThrow("No pudimos asignar la rutina. Intenta de nuevo.");
  });
});
