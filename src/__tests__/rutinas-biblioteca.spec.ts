import { describe, it, expect, vi } from "vitest";
import {
  clasificarRutinas,
  filtrarRutinas,
  filtrarRutinasPorBusqueda,
  filtrarRutinasPorTag,
  getTagBadgeStyles,
  getTagChipFilterStyles,
  heredarTagsDePlantilla,
  nombreUnico,
  separarBorradores,
} from "@/lib/rutinas-biblioteca";
import { activarRutina, archivarRutina, asignarRutinaAAlumno } from "@/services/rutinas-service";
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

describe("GOZS-319: nombres y estados en la biblioteca", () => {
  it("nombreUnico agrega (copia) y (copia N) sin repetir", () => {
    expect(nombreUnico("X", ["Y"])).toBe("X");
    expect(nombreUnico("X", ["X"])).toBe("X (copia)");
    expect(nombreUnico("X", ["X", "X (copia)"])).toBe("X (copia 2)");
    expect(nombreUnico("X (copia)", ["X", "X (copia)"])).toBe("X (copia 2)");
  });

  it("separarBorradores aparta los BORRADOR de lo vigente", () => {
    const r = separarBorradores([
      plan({ id: "act", alumno_id: "al", estado: "ACTIVO" }),
      plan({ id: "bor", alumno_id: "al", estado: "BORRADOR" }),
    ]);
    expect(r.vigentes.map((p) => p.id)).toEqual(["act"]);
    expect(r.borradores.map((p) => p.id)).toEqual(["bor"]);
  });
});

describe("GOZS-319: activarRutina / archivarRutina", () => {
  type Fila = { id: string; alumno_id: string | null; estado: string; fecha_fin: string | null };
  const fila = (id: string, alumno_id: string | null, estado: string): Fila => ({ id, alumno_id, estado, fecha_fin: null });

  /** Cliente en memoria: cada update() aplica filtros eq/neq/in y puede fallar en el n-ésimo llamado. */
  const fake = (filas: Fila[], fallaEnUpdate = 0) => {
    let llamadas = 0;
    const client = {
      from: () => ({
        update: (valores: Partial<Fila>) => {
          llamadas++;
          const falla = llamadas === fallaEnUpdate;
          const filtros: Array<(f: Fila) => boolean> = [];
          const q: any = {
            eq: (c: keyof Fila, v: unknown) => (filtros.push((f) => f[c] === v), q),
            neq: (c: keyof Fila, v: unknown) => (filtros.push((f) => f[c] !== v), q),
            in: (c: keyof Fila, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), q),
            select: () => q,
            then: (ok: (r: unknown) => unknown) => {
              if (falla) return Promise.resolve({ data: null, error: { message: "x" } }).then(ok);
              const tocadas = filas.filter((f) => filtros.every((fn) => fn(f)));
              tocadas.forEach((f) => Object.assign(f, valores));
              return Promise.resolve({ data: tocadas.map((f) => ({ id: f.id })), error: null }).then(ok);
            },
          };
          return q;
        },
      }),
    } as never;
    return { client, filas };
  };
  const estados = (filas: Fila[]) => Object.fromEntries(filas.map((f) => [f.id, f.estado]));

  it("activa un BORRADOR y archiva la ACTIVA anterior con fecha_fin", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO"), fila("b", "al", "BORRADOR")]);
    await activarRutina(filas[1]!, client);
    expect(estados(filas)).toEqual({ a: "INACTIVO", b: "ACTIVO" });
    expect(filas[0]!.fecha_fin).not.toBeNull();
    expect(filas[1]!.fecha_fin).toBeNull();
  });

  it("reactiva una archivada", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO"), { ...fila("v", "al", "INACTIVO"), fecha_fin: "2026-10-01" }]);
    await activarRutina(filas[1]!, client);
    expect(estados(filas)).toEqual({ a: "INACTIVO", v: "ACTIVO" });
    expect(filas[1]!.fecha_fin).toBeNull();
  });

  it("activar la que ya está activa no cambia nada", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO")]);
    await activarRutina(filas[0]!, client);
    expect(estados(filas)).toEqual({ a: "ACTIVO" });
    expect(filas[0]!.fecha_fin).toBeNull();
  });

  it("dos ACTIVO del mismo alumno quedan en uno", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO"), fila("b", "al", "ACTIVO"), fila("c", "al", "BORRADOR")]);
    await activarRutina(filas[2]!, client);
    expect(filas.filter((f) => f.estado === "ACTIVO").map((f) => f.id)).toEqual(["c"]);
  });

  it("si falla el 2.º UPDATE restaura la ACTIVA anterior", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO"), fila("b", "al", "BORRADOR")], 2);
    await expect(activarRutina(filas[1]!, client)).rejects.toThrow("No pudimos activar la rutina");
    expect(estados(filas)).toEqual({ a: "ACTIVO", b: "BORRADOR" });
    expect(filas[0]!.fecha_fin).toBeNull();
  });

  it("si falla el 1.º UPDATE no toca nada", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO"), fila("b", "al", "BORRADOR")], 1);
    await expect(activarRutina(filas[1]!, client)).rejects.toThrow("No pudimos activar la rutina");
    expect(estados(filas)).toEqual({ a: "ACTIVO", b: "BORRADOR" });
  });

  it("rechaza una plantilla sin alumno", async () => {
    const { client, filas } = fake([fila("t", null, "BORRADOR")]);
    await expect(activarRutina(filas[0]!, client)).rejects.toThrow("Solo se puede activar");
    expect(estados(filas)).toEqual({ t: "BORRADOR" });
  });

  it("no afecta a otros alumnos", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO"), fila("b", "al", "BORRADOR"), fila("o", "otro", "ACTIVO")]);
    await activarRutina(filas[1]!, client);
    expect(estados(filas)).toEqual({ a: "INACTIVO", b: "ACTIVO", o: "ACTIVO" });
  });

  it("archivarRutina cierra con fecha_fin y falla con mensaje humano", async () => {
    const { client, filas } = fake([fila("a", "al", "ACTIVO")]);
    await archivarRutina("a", client);
    expect(filas[0]!.estado).toBe("INACTIVO");
    expect(filas[0]!.fecha_fin).not.toBeNull();
    const malo = fake([fila("a", "al", "ACTIVO")], 1);
    await expect(archivarRutina("a", malo.client)).rejects.toThrow("No pudimos archivar la rutina");
  });

  it("asignarRutinaAAlumno envía p_nombre solo si se indica", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "n", error: null });
    const client = { rpc } as never;
    await asignarRutinaAAlumno("p", "a", client);
    expect(rpc).toHaveBeenLastCalledWith("asignar_rutina_a_alumno", { p_plan_id: "p", p_alumno_id: "a" });
    await asignarRutinaAAlumno("p", "a", client, "X (copia)");
    expect(rpc).toHaveBeenLastCalledWith("asignar_rutina_a_alumno", { p_plan_id: "p", p_alumno_id: "a", p_nombre: "X (copia)" });
  });
});

describe("GOZS-365: filtros por tags, badges semánticos y herencia en asignación", () => {
  it("filtrarRutinasPorTag filtra exactamente por el tag especificado", () => {
    const planes = [
      plan({ id: "p1", nombre: "Fuerza 5x5", tags: ["Fuerza", "Potencia"] }),
      plan({ id: "p2", nombre: "Hipertrofia Piernas", tags: ["Hipertrofia"] }),
      plan({ id: "p3", nombre: "Sin tags", tags: [] }),
    ];
    expect(filtrarRutinasPorTag(planes, "Hipertrofia").map((p) => p.id)).toEqual(["p2"]);
    expect(filtrarRutinasPorTag(planes, "Fuerza").map((p) => p.id)).toEqual(["p1"]);
    expect(filtrarRutinasPorTag(planes, "Todos").map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(filtrarRutinasPorTag(planes, null).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("filtrarRutinasPorBusqueda filtra por nombre o comentarios", () => {
    const planes = [
      plan({ id: "p1", nombre: "Torso Fuerza", comentarios: "Enfoque banca" }),
      plan({ id: "p2", nombre: "Pierna Bombeo", comentarios: "Sentadilla libre" }),
    ];
    expect(filtrarRutinasPorBusqueda(planes, "torso").map((p) => p.id)).toEqual(["p1"]);
    expect(filtrarRutinasPorBusqueda(planes, "banca").map((p) => p.id)).toEqual(["p1"]);
    expect(filtrarRutinasPorBusqueda(planes, "libre").map((p) => p.id)).toEqual(["p2"]);
    expect(filtrarRutinasPorBusqueda(planes, "").map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("filtrarRutinas combina reactivamente tag y búsqueda", () => {
    const planes = [
      plan({ id: "p1", nombre: "Fuerza Torso", tags: ["Fuerza"] }),
      plan({ id: "p2", nombre: "Fuerza Pierna", tags: ["Fuerza"] }),
      plan({ id: "p3", nombre: "Hipertrofia Torso", tags: ["Hipertrofia"] }),
    ];
    expect(filtrarRutinas(planes, "Fuerza", "Pierna").map((p) => p.id)).toEqual(["p2"]);
    expect(filtrarRutinas(planes, "Hipertrofia", "Torso").map((p) => p.id)).toEqual(["p3"]);
    expect(filtrarRutinas(planes, "Fuerza", "Glúteo").map((p) => p.id)).toEqual([]);
  });

  it("heredarTagsDePlantilla preserva fielmente los tags de la plantilla", () => {
    const plantilla = plan({ id: "pt", tags: ["Fuerza", "Potencia"] });
    const clon = heredarTagsDePlantilla(plantilla);
    expect(clon).toEqual(["Fuerza", "Potencia"]);
    expect(clon).not.toBe(plantilla.tags); // copia inmutable
  });

  it("getTagBadgeStyles entrega clases y dots semánticos contrastantes para cada tag del catálogo", () => {
    expect(getTagBadgeStyles("Fuerza").className).toContain("border-amber-500");
    expect(getTagBadgeStyles("Hipertrofia").className).toContain("border-emerald-500");
    expect(getTagBadgeStyles("Rehabilitación").className).toContain("border-sky-500");
    expect(getTagBadgeStyles("Potencia").className).toContain("border-purple-500");
    expect(getTagBadgeStyles("Peso Corporal").className).toContain("border-slate-500");
  });

  it("getTagChipFilterStyles entrega estilos diferenciados para estado activo/inactivo", () => {
    const inactivo = getTagChipFilterStyles("Hipertrofia", false);
    const activo = getTagChipFilterStyles("Hipertrofia", true);
    expect(inactivo).toContain("text-muted-foreground");
    expect(activo).toContain("border-emerald-500");
  });
});
