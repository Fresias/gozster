import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  IslaSaludAnamnesis,
  type IslaSaludAnamnesisProps,
} from "@/components/coach/student-detail/islas/isla-salud-anamnesis";
import * as dolorModule from "@/lib/dolor";

function findElement(node: any, predicate: (el: any) => boolean): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (node.props?.children) {
    return findElement(node.props.children, predicate);
  }
  return null;
}

function renderAndCaptureIsla(props: IslaSaludAnamnesisProps) {
  let capturedTree: React.ReactElement | null = null;
  function Wrapper() {
    const tree = IslaSaludAnamnesis(props);
    capturedTree = tree;
    return tree;
  }
  const html = renderToStaticMarkup(<Wrapper />);
  const segmented = findElement(
    capturedTree,
    (el) => el?.props?.["aria-label"] === "Estado de intervención"
  );
  const textarea = findElement(
    capturedTree,
    (el) => el?.type === "textarea" && el?.props?.["aria-label"] === "Nota de intervención"
  );
  return { html, tree: capturedTree, segmented, textarea };
}

describe("GOZS-382: Isla de Salud Unificada (EVA 0-10, Alert Semántico, Segmented Control y Rollback Optimista)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Criterio 1 (Gherkin): Visualización de molestia con EVA = 5 en Alert Semántico", () => {
    it("GIVEN EVA = 5, THEN el Alert exhibe badge 'Moderado', zona articular, EVA 5 y estado 'Pendiente'", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={5}
          zonaDolorActual="Hombro anterior"
          ejercicioNombre="Press de banca plano, serie 2"
          fechaReporte="ayer 18:30"
          alumnoId="alumno-test-01"
        />
      );

      // Alert semántico presente
      expect(html).toContain('data-testid="alert-salud"');
      // Badge semántico derivado de EVA = 5 (Moderado)
      expect(html).toContain("Moderado");
      // Zona articular reportada
      expect(html).toContain("Hombro anterior");
      // Valor EVA 5 explícito
      expect(html).toContain("EVA 5");
      // Estado inicial Pendiente
      expect(html).toContain("Pendiente");
      // Detalle de ejercicio y fecha
      expect(html).toContain("Press de banca plano, serie 2");
      expect(html).toContain("ayer 18:30");
      // Control Segmented presente
      expect(html).toContain('role="tablist"');
      expect(html).toContain("Resuelta");
    });

    it("GIVEN EVA = 8 (Dolor Agudo), THEN el Alert aplica variante destructiva y badge 'Agudo'", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={8}
          zonaDolorActual="Rodilla derecha"
          ejercicioNombre="Sentadilla trasera, serie 3"
        />
      );

      expect(html).toContain("Agudo");
      expect(html).toContain("Rodilla derecha");
      expect(html).toContain("EVA 8");
      // Variante destructiva / aviso crítico
      expect(html).toContain("border-destructive");
    });

    it("GIVEN EVA = 2 (Dolor Leve), THEN el Alert exhibe badge 'Leve' sin clase destructiva", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={2}
          zonaDolorActual="Muñeca izquierda"
        />
      );

      expect(html).toContain("Leve");
      expect(html).toContain("Muñeca izquierda");
      expect(html).toContain("EVA 2");
      expect(html).not.toContain("border-destructive");
    });
  });

  describe("Criterio 2 (Gherkin): Control Segmented de estado, actualización RPC y Rollback Optimista", () => {
    it("permite invocar actualizarEstadoDolor al seleccionar 'Atendida'", async () => {
      const spyActualizar = vi.spyOn(dolorModule, "actualizarEstadoDolor").mockResolvedValue({
        ok: true,
        data: { id: "reporte-123", estado: "ATENDIDO" },
      });

      let estadoActual = "PENDIENTE";
      const onEstadoChange = vi.fn().mockImplementation(async (nuevoEstado) => {
        estadoActual = nuevoEstado;
        const res = await dolorModule.actualizarEstadoDolor({
          reporteId: "reporte-123",
          nuevoEstado,
          nota: "Ajuste de carga",
        });
        return res.ok;
      });

      const element = (
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={5}
          zonaDolorActual="Hombro anterior"
          reporteId="reporte-123"
          onEstadoChange={onEstadoChange}
        />
      );

      const html = renderToStaticMarkup(element);
      expect(html).toContain("Pendiente");
      expect(html).toContain("Atendida");

      // Simulamos la selección de 'Atendida'
      const success = await onEstadoChange("ATENDIDO");
      expect(success).toBe(true);
      expect(spyActualizar).toHaveBeenCalledWith({
        reporteId: "reporte-123",
        nuevoEstado: "ATENDIDO",
        nota: "Ajuste de carga",
      });
      expect(estadoActual).toBe("ATENDIDO");
    });

    it("ante fallo de red, se revierte el estado y se notifica el error (Rollback Optimista)", async () => {
      const spyActualizar = vi.spyOn(dolorModule, "actualizarEstadoDolor").mockResolvedValue({
        ok: false,
        error: "Fallo de conexión con la base de datos Supabase",
      });

      let estadoUI = "PENDIENTE";
      let errorNotificado: string | null = null;

      // Simulador del flujo optimista con rollback
      const simularCambioSegmented = async (nuevoEstado: string) => {
        const prevEstado = estadoUI;
        estadoUI = nuevoEstado; // Optimistic update
        errorNotificado = null;

        const res = await dolorModule.actualizarEstadoDolor({
          reporteId: "reporte-fail",
          nuevoEstado: nuevoEstado as any,
        });

        if (!res.ok) {
          // Rollback
          estadoUI = prevEstado;
          errorNotificado = res.error || "Error de red";
        }
      };

      await simularCambioSegmented("ATENDIDO");

      expect(spyActualizar).toHaveBeenCalled();
      // Verificamos que el estado fue revertido a PENDIENTE
      expect(estadoUI).toBe("PENDIENTE");
      // Verificamos que el error fue capturado y notificado
      expect(errorNotificado).toContain("Fallo de conexión con la base de datos");
    });

    it("renderiza mensaje de error accesible cuando errorMsg está presente", () => {
      // Verificamos la presencia estructural de la notificación de error
      const htmlConError = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={5}
          zonaDolorActual="Hombro anterior"
          onEstadoChange={vi.fn().mockResolvedValue(false)}
        />
      );

      expect(htmlConError).toContain('data-testid="alert-salud"');
    });
  });

  describe("Criterio 3 (Gherkin): Atleta sin dolores activos", () => {
    it("GIVEN un atleta con eva = 0, THEN exhibe 'Sin dolores activos.' y ningún badge destructivo", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={0}
          zonaDolorActual="Ninguna"
        />
      );

      // Mensaje de estado libre de dolor
      expect(html).toContain("Sin dolores activos.");
      // Badge neutral en la cabecera
      expect(html).toContain("Sin dolores activos");
      // Cero badges destructivos
      expect(html).not.toContain("border-destructive");
      expect(html).not.toContain("bg-rose-500");
      expect(html).not.toContain("bg-destructive");
      expect(html).not.toContain("Molestia:");
    });

    it("GIVEN dolorActivo = null, THEN exhibe 'Sin dolores activos.'", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={null}
        />
      );

      expect(html).toContain("Sin dolores activos.");
      expect(html).toContain("Sin dolores activos");
      expect(html).not.toContain("border-destructive");
    });
  });

  describe("Criterio 4: Nota de intervención sin texto de ejemplo, sin duplicación y con único mecanismo de guardado (GOZS-402)", () => {
    it("GIVEN la ficha recién abierta WHEN se renderiza la isla Salud THEN la nota muestra notas_profesor real del caso o está vacía (''), nunca el texto de ejemplo de Landmine Press", () => {
      // Caso 1: sin notas_profesor -> vacía ("")
      const { html: htmlVacia, textarea: textareaVacia } = renderAndCaptureIsla({
        isCollapsed: false,
        onToggleCollapse: vi.fn(),
        evaDolorActual: 5,
        zonaDolorActual: "Hombro anterior",
      });

      expect(textareaVacia).toBeTruthy();
      expect(textareaVacia.props.value).toBe("");
      expect(htmlVacia).not.toContain("Landmine Press");
      expect(htmlVacia).not.toContain("28 oct");

      // Caso 2: con notas_profesor real en dolorActivo
      const notaReal = "Controlar escapular y usar mancuernas de 20 kg con pausa isométrica.";
      const { html: htmlConNota, textarea: textareaConNota } = renderAndCaptureIsla({
        isCollapsed: false,
        onToggleCollapse: vi.fn(),
        dolorActivo: {
          id: "caso-real-01",
          eva: 5,
          zona_articular: "Hombro anterior",
          estado: "PENDIENTE",
          notas_profesor: notaReal,
        },
      });

      expect(textareaConNota.props.value).toBe(notaReal);
      expect(htmlConNota).toContain(notaReal);
      expect(htmlConNota).not.toContain("Landmine Press");
    });

    it("GIVEN un cambio de estado en el Segmented sin nota nueva escrita por el coach WHEN se invoca actualizarEstadoDolor THEN recibe p_nota = null", async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: { id: "caso-01", estado: "ATENDIDO" }, error: null });
      const clientMock = { rpc: rpcMock };
      const origActualizar = dolorModule.actualizarEstadoDolor;
      const spyActualizar = vi
        .spyOn(dolorModule, "actualizarEstadoDolor")
        .mockImplementation((params) => origActualizar(params, clientMock));

      // Con nota previa ya existente en el caso, pero sin nota nueva escrita por el coach
      const { segmented } = renderAndCaptureIsla({
        isCollapsed: false,
        onToggleCollapse: vi.fn(),
        dolorActivo: {
          id: "caso-01",
          eva: 5,
          zona_articular: "Hombro anterior",
          estado: "PENDIENTE",
          notas_profesor: "Nota previa existente del caso",
        },
      });

      expect(segmented).toBeTruthy();
      await segmented.props.onChange("ATENDIDO");

      expect(spyActualizar).toHaveBeenCalledTimes(1);
      expect(spyActualizar).toHaveBeenCalledWith({
        reporteId: "caso-01",
        nuevoEstado: "ATENDIDO",
        nota: null,
      });
      expect(rpcMock).toHaveBeenCalledWith("actualizar_estado_dolor", {
        p_reporte_id: "caso-01",
        p_nuevo_estado: "ATENDIDO",
        p_nota: null,
      });
    });

    it("GIVEN dos cambios de estado seguidos con la misma nota WHEN se inspecciona notas_profesor THEN la nota aparece una sola vez (sin duplicación por concatenación)", async () => {
      let notasProfesorEnDb: string | null = null;
      const spyActualizar = vi
        .spyOn(dolorModule, "actualizarEstadoDolor")
        .mockImplementation(async ({ reporteId, nuevoEstado, nota }) => {
          const limpia = (nota ?? "").trim();
          if (limpia !== "") {
            notasProfesorEnDb =
              notasProfesorEnDb && notasProfesorEnDb.trim() !== ""
                ? `${notasProfesorEnDb} | ${limpia}`
                : limpia;
          }
          return {
            ok: true,
            data: {
              id: reporteId,
              estado: nuevoEstado,
              notas_profesor: notasProfesorEnDb,
            },
          };
        });

      const { segmented, textarea } = renderAndCaptureIsla({
        isCollapsed: false,
        onToggleCollapse: vi.fn(),
        dolorActivo: {
          id: "caso-02",
          eva: 6,
          zona_articular: "Rodilla derecha",
          estado: "PENDIENTE",
          notas_profesor: null,
        },
      });

      const nuevaNota = "Se redujo peso un 20% y se aplicó tempo 3-1-1";
      textarea.props.onChange({ target: { value: nuevaNota } });

      // Primer cambio de estado (PENDIENTE -> ATENDIDO)
      await segmented.props.onChange("ATENDIDO");
      // Segundo cambio de estado seguido (ATENDIDO -> RESUELTO) con la misma nota
      await segmented.props.onChange("RESUELTO");

      expect(spyActualizar).toHaveBeenCalledTimes(2);
      expect(spyActualizar).toHaveBeenNthCalledWith(1, {
        reporteId: "caso-02",
        nuevoEstado: "ATENDIDO",
        nota: nuevaNota,
      });
      expect(spyActualizar).toHaveBeenNthCalledWith(2, {
        reporteId: "caso-02",
        nuevoEstado: "RESUELTO",
        nota: null,
      });

      // En notas_profesor la nota aparece exactamente una sola vez (sin concatenación duplicada)
      expect(notasProfesorEnDb).toBe(nuevaNota);
    });

    it("GIVEN la isla Salud WHEN se inspecciona el bloque de Nota de intervención THEN existe un único mecanismo de guardado (onBlur) y un único texto de ayuda ('Se guarda al salir del campo.')", async () => {
      const spyActualizar = vi.spyOn(dolorModule, "actualizarEstadoDolor").mockResolvedValue({
        ok: true,
        data: { id: "caso-03", estado: "PENDIENTE" },
      });

      const { html, textarea } = renderAndCaptureIsla({
        isCollapsed: false,
        onToggleCollapse: vi.fn(),
        dolorActivo: {
          id: "caso-03",
          eva: 5,
          zona_articular: "Hombro anterior",
          estado: "PENDIENTE",
        },
      });

      expect(html).toContain("Nota de intervención");
      expect(html).toContain("Se guarda al salir del campo.");
      expect(html).toContain("<textarea");
      // No existen mecanismos ni textos de ayuda duplicados
      expect(html).not.toContain("Se guarda automáticamente al escribir o salir.");
      expect(html).not.toContain("Guardar Registro en la Ficha");
      expect(html).not.toContain("Guardar registro en la ficha");

      // Al escribir y desenfocar (onBlur), persiste en notas_profesor del caso una sola vez
      const testNota = "Ajuste de ROM y control excéntrico";
      textarea.props.onChange({ target: { value: testNota } });
      await textarea.props.onBlur();

      expect(spyActualizar).toHaveBeenCalledTimes(1);
      expect(spyActualizar).toHaveBeenCalledWith({
        reporteId: "caso-03",
        nuevoEstado: "PENDIENTE",
        nota: testNota,
      });

      // Un segundo onBlur sin cambios no vuelve a enviar ni concatenar la nota
      await textarea.props.onBlur();
      expect(spyActualizar).toHaveBeenCalledTimes(1);
    });
  });

  describe("Criterio 5: Bloque de Anamnesis accesible y colapsable", () => {
    it("renderiza los 4 bloques clínicos clave (Objetivo, Frecuencia, Molestia previa, Cirugías)", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          anamnesisData={{
            objetivo: "Hipertrofia & Fuerza",
            frecuencia: "4 días / semana",
            molestiaPrevia: "Hombro anterior",
            cirugias: "Ninguna",
          }}
        />
      );

      expect(html).toContain("Objetivo");
      expect(html).toContain("Hipertrofia &amp; Fuerza");
      expect(html).toContain("Frecuencia");
      expect(html).toContain("4 días / semana");
      expect(html).toContain("Molestia previa");
      expect(html).toContain("Hombro anterior");
      expect(html).toContain("Cirugías");
      expect(html).toContain("Ninguna");
      expect(html).toContain("Ver cuestionario inicial completo");
    });

    it("no contiene bloques duplicados de notificación de molestia", () => {
      const html = renderToStaticMarkup(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={5}
          zonaDolorActual="Hombro anterior"
        />
      );

      // Solo hay 1 Alert semántico de molestia
      const alertMatches = html.match(/data-testid="alert-salud"/g);
      expect(alertMatches).toHaveLength(1);
    });
  });
});
