import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  IslaSaludAnamnesis,
} from "@/components/coach/student-detail/islas/isla-salud-anamnesis";
import * as dolorModule from "@/lib/dolor";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";

describe("GOZS-382 / FIX-08: Isla de Salud Unificada montada con render(...) y datos en vivo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Criterio 1 (Gherkin): Visualización de molestia con EVA en Alert Semántico sobre datos vivos", () => {
    it("GIVEN un caso en vivo con EVA = 5 distinto del fallback, WHEN se monta IslaSaludAnamnesis con render(...), THEN el Alert exhibe badge 'Moderado', zona articular, EVA 5, estado 'Pendiente' y cero literales demo", () => {
      const { container, getByTestId, getByRole } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-vivo-01"
          dolorActivo={{
            id: "dolor-vivo-01",
            alumno_id: "alumno-vivo-01",
            zona_articular: "Cadera izquierda",
            ejercicio_nombre: "Zancadas caminando con mancuernas, serie 3",
            eva: 5,
            severidad: "MODERADO",
            nivel: "medio",
            estado: "PENDIENTE",
            fecha_reporte: "06 nov 14:20",
            notas_profesor: "Acortar zancada y evitar retroversión pélvica.",
          }}
          anamnesisData={{
            objetivo: "Fuerza Funcional",
            frecuencia: "3 días / semana",
            molestiaPrevia: "Cadera izquierda",
            cirugias: "Meniscectomía parcial 2021",
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const alertSalud = getByTestId("alert-salud");
      expect(alertSalud.textContent).toContain("Moderado");
      expect(alertSalud.textContent?.toLowerCase()).toContain("cadera izquierda");
      expect(alertSalud.textContent).toContain("EVA 5");
      expect(alertSalud.textContent).toContain("Pendiente");
      expect(alertSalud.textContent).toContain("Zancadas caminando con mancuernas, serie 3");
      expect(alertSalud.textContent).toContain("06 nov 14:20");

      // Verifica que los valores vivos reemplazaron a los fallbacks ("Hombro anterior", "Press de banca plano, serie 2", "ayer 18:30")
      expect(container.textContent).not.toContain("Press de banca plano, serie 2");
      expect(container.textContent).not.toContain("ayer 18:30");

      const tablist = getByRole("tablist");
      expect(tablist.textContent).toContain("Resuelta");
    });

    it("GIVEN EVA = 8 (Dolor Agudo), THEN el Alert aplica variante destructiva y badge 'Agudo'", () => {
      const { container, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-vivo-02"
          dolorActivo={{
            id: "dolor-vivo-02",
            eva: 8,
            zona_articular: "Rodilla derecha",
            ejercicio_nombre: "Sentadilla frontal, serie 3",
            fecha_reporte: "06 nov 16:00",
            estado: "PENDIENTE",
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const alertSalud = getByTestId("alert-salud");
      expect(alertSalud.textContent).toContain("Agudo");
      expect(alertSalud.textContent?.toLowerCase()).toContain("rodilla derecha");
      expect(alertSalud.textContent).toContain("EVA 8");
      expect(alertSalud.className).toContain("border-rose-500/35");
    });

    it("GIVEN EVA = 2 (Dolor Leve), THEN el Alert exhibe badge 'Leve' sin clase destructiva", () => {
      const { container, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-vivo-03"
          dolorActivo={{
            id: "dolor-vivo-03",
            eva: 2,
            zona_articular: "Muñeca izquierda",
            ejercicio_nombre: "Curl con barra recta",
            fecha_reporte: "05 nov 19:00",
            estado: "PENDIENTE",
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const alertSalud = getByTestId("alert-salud");
      expect(alertSalud.textContent).toContain("Leve");
      expect(alertSalud.textContent?.toLowerCase()).toContain("muñeca izquierda");
      expect(alertSalud.textContent).toContain("EVA 2");
      expect(alertSalud.className).not.toContain("border-destructive");
    });
  });

  describe("Criterio 2 (Gherkin): Control Segmented interactivo, actualización RPC y Rollback Optimista en el DOM", () => {
    it("GIVEN el componente montado con render(...) WHEN el coach hace clic en 'Atendida' THEN invoca actualizarEstadoDolor y actualiza el DOM a 'Atendida'", async () => {
      const spyActualizar = vi.spyOn(dolorModule, "actualizarEstadoDolor").mockResolvedValue({
        ok: true,
        data: { id: "reporte-vivo-123", estado: "ATENDIDO" },
      });

      const { container, getByRole, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-vivo-123"
          dolorActivo={{
            id: "reporte-vivo-123",
            eva: 5,
            zona_articular: "Tobillo derecho",
            ejercicio_nombre: "Saltos al cajón",
            fecha_reporte: "06 nov 10:00",
            estado: "PENDIENTE",
            notas_profesor: null,
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const tabAtendida = getByRole("tab", { name: "Atendida" });
      await fireEvent.click(tabAtendida);

      expect(spyActualizar).toHaveBeenCalledTimes(1);
      expect(spyActualizar).toHaveBeenCalledWith({
        reporteId: "reporte-vivo-123",
        nuevoEstado: "ATENDIDO",
        nota: null,
      });

      // El DOM refleja el nuevo estado 'Atendida'
      expect(getByTestId("red-flags-alert").textContent).toContain("Atendida");
    });

    it("GIVEN un fallo de red en actualizarEstadoDolor WHEN se selecciona 'Atendida' THEN revierte el estado a 'Pendiente' (Rollback Optimista) y renderiza salud-error-alert en el DOM", async () => {
      const spyActualizar = vi.spyOn(dolorModule, "actualizarEstadoDolor").mockResolvedValue({
        ok: false,
        error: "Fallo de conexión con la base de datos Supabase",
      });

      const { container, getByRole, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-vivo-fail"
          dolorActivo={{
            id: "reporte-fail-01",
            eva: 6,
            zona_articular: "Isquiotibial izquierdo",
            ejercicio_nombre: "Peso muerto rumano",
            fecha_reporte: "06 nov 11:30",
            estado: "PENDIENTE",
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const tabAtendida = getByRole("tab", { name: "Atendida" });
      await fireEvent.click(tabAtendida);

      expect(spyActualizar).toHaveBeenCalledTimes(1);

      // Estado revertido a Pendiente en el DOM
      const tabPendiente = getByRole("tab", { name: "Pendiente" });
      expect(tabPendiente.getAttribute("aria-selected")).toBe("true");

      // Alerta de error visible en el DOM
      const errorAlert = getByTestId("salud-error-alert");
      expect(errorAlert.textContent).toContain("Fallo de conexión con la base de datos Supabase");
    });

    it("GIVEN onEstadoChange retorna false WHEN el usuario cambia de estado THEN revierte el estado y muestra mensaje de error accesible", async () => {
      vi.spyOn(dolorModule, "actualizarEstadoDolor").mockResolvedValue({
        ok: true,
        data: null,
      });
      const onEstadoChange = vi.fn().mockResolvedValue(false);

      const { container, getByRole, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-vivo-err"
          dolorActivo={{
            id: "reporte-err-02",
            eva: 5,
            zona_articular: "Cuello cervical",
            ejercicio_nombre: "Encogimientos con barra",
            fecha_reporte: "06 nov 12:00",
            estado: "PENDIENTE",
          }}
          onEstadoChange={onEstadoChange}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const tabResuelta = getByRole("tab", { name: "Resuelta" });
      await fireEvent.click(tabResuelta);
      await new Promise((r) => setTimeout(r, 10));

      expect(onEstadoChange).toHaveBeenCalledWith("RESUELTO");
      expect(getByTestId("salud-error-alert").textContent).toContain(
        "Error de red al actualizar estado"
      );
    });
  });

  describe("Criterio 3 (Gherkin): Atleta sin dolores activos", () => {
    it("GIVEN un atleta con eva = 0, THEN exhibe 'Sin dolores activos.' y ningún badge destructivo", () => {
      const { container, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          evaDolorActual={0}
          zonaDolorActual="Ninguna"
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const emptyAlert = getByTestId("alert-salud-empty");
      expect(emptyAlert.textContent).toContain("Sin dolores activos.");
      expect(container.innerHTML).not.toContain("border-destructive");
      expect(container.innerHTML).not.toContain("bg-rose-500");
      expect(container.textContent).not.toContain("Molestia:");
    });

    it("GIVEN dolorActivo = null, THEN exhibe 'Sin dolores activos.'", () => {
      const { container, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={null}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      expect(getByTestId("alert-salud-empty").textContent).toContain("Sin dolores activos.");
      expect(container.innerHTML).not.toContain("border-destructive");
    });
  });

  describe("Criterio 4: Nota de intervención sin texto de ejemplo, sin duplicación y con único mecanismo de guardado (GOZS-402 / FIX-08)", () => {
    it("GIVEN la ficha recién abierta WHEN se monta la isla Salud con render(...) THEN la nota muestra notas_profesor real del caso o está vacía (''), nunca el texto de ejemplo de Landmine Press", () => {
      // Caso 1: sin notas_profesor -> vacía ("")
      const { container: containerVacia, getByTestId: getByTestIdVacia } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={{
            id: "caso-vacio-01",
            eva: 5,
            zona_articular: "Codo derecho",
            ejercicio_nombre: "Press francés",
            fecha_reporte: "06 nov 08:30",
            estado: "PENDIENTE",
            notas_profesor: null,
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(containerVacia);
      const textareaVacia = getByTestIdVacia("nota-intervencion-textarea") as HTMLTextAreaElement;
      expect(textareaVacia.value).toBe("");
      expect(containerVacia.textContent).not.toContain("Landmine Press");
      expect(containerVacia.textContent).not.toContain("28 oct");

      // Caso 2: con notas_profesor real en dolorActivo
      const notaReal = "Controlar escapular y usar mancuernas de 20 kg con pausa isométrica.";
      const { container: containerConNota, getByTestId: getByTestIdConNota } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={{
            id: "caso-real-01",
            eva: 5,
            zona_articular: "Codo derecho",
            ejercicio_nombre: "Press francés",
            fecha_reporte: "06 nov 08:30",
            estado: "PENDIENTE",
            notas_profesor: notaReal,
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(containerConNota);
      const textareaConNota = getByTestIdConNota("nota-intervencion-textarea") as HTMLTextAreaElement;
      expect(textareaConNota.value).toBe(notaReal);
      expect(containerConNota.textContent).toContain(notaReal);
      expect(containerConNota.textContent).not.toContain("Landmine Press");
    });

    it("GIVEN un cambio de estado en el Segmented sin nota nueva escrita por el coach WHEN se invoca actualizarEstadoDolor THEN recibe p_nota = null", async () => {
      const rpcMock = vi.fn().mockResolvedValue({ data: { id: "caso-01", estado: "ATENDIDO" }, error: null });
      const clientMock = { rpc: rpcMock };
      const origActualizar = dolorModule.actualizarEstadoDolor;
      const spyActualizar = vi
        .spyOn(dolorModule, "actualizarEstadoDolor")
        .mockImplementation((params) => origActualizar(params, clientMock));

      const { container, getByRole } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={{
            id: "caso-01",
            eva: 5,
            zona_articular: "Tobillo izquierdo",
            ejercicio_nombre: "Sentadilla búlgara",
            fecha_reporte: "06 nov 10:00",
            estado: "PENDIENTE",
            notas_profesor: "Nota previa existente del caso",
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const tabAtendida = getByRole("tab", { name: "Atendida" });
      await fireEvent.click(tabAtendida);

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

      const { container, getByTestId, getByRole } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={{
            id: "caso-02",
            eva: 6,
            zona_articular: "Rodilla derecha",
            ejercicio_nombre: "Prensa 45°",
            fecha_reporte: "06 nov 11:00",
            estado: "PENDIENTE",
            notas_profesor: null,
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const nuevaNota = "Se redujo peso un 20% y se aplicó tempo 3-1-1";
      const textarea = getByTestId("nota-intervencion-textarea");
      fireEvent.change(textarea, { target: { value: nuevaNota } });

      // Primer cambio de estado (PENDIENTE -> ATENDIDO)
      await fireEvent.click(getByRole("tab", { name: "Atendida" }));
      // Segundo cambio de estado seguido (ATENDIDO -> RESUELTO) con la misma nota
      await fireEvent.click(getByRole("tab", { name: "Resuelta" }));

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

      expect(notasProfesorEnDb).toBe(nuevaNota);
    });

    it("GIVEN la isla Salud montada WHEN se escribe en el textarea y se dispara onBlur THEN persiste la nota una sola vez y exhibe confirmación 'Guardado'", async () => {
      const spyActualizar = vi.spyOn(dolorModule, "actualizarEstadoDolor").mockResolvedValue({
        ok: true,
        data: { id: "caso-03", estado: "PENDIENTE" },
      });

      const { container, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={{
            id: "caso-03",
            eva: 5,
            zona_articular: "Zona dorsal media",
            ejercicio_nombre: "Remo con barra Pendlay",
            fecha_reporte: "06 nov 12:15",
            estado: "PENDIENTE",
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const block = getByTestId("nota-intervencion-block");
      expect(block.textContent).toContain("Nota de intervención");
      expect(block.textContent).toContain("Se guarda al salir del campo.");
      expect(container.textContent).not.toContain("Se guarda automáticamente al escribir o salir.");
      expect(container.textContent).not.toContain("Guardar Registro en la Ficha");
      expect(container.textContent).not.toContain("Guardar registro en la ficha");

      const testNota = "Ajuste de ROM y control excéntrico";
      const textarea = getByTestId("nota-intervencion-textarea");
      fireEvent.change(textarea, { target: { value: testNota } });
      await fireEvent.blur(textarea);

      expect(spyActualizar).toHaveBeenCalledTimes(1);
      expect(spyActualizar).toHaveBeenCalledWith({
        reporteId: "caso-03",
        nuevoEstado: "PENDIENTE",
        nota: testNota,
      });
      expect(getByTestId("nota-intervencion-guardado").textContent).toContain("Guardado");

      // Un segundo onBlur sin cambios no vuelve a enviar ni concatenar la nota
      await fireEvent.blur(textarea);
      expect(spyActualizar).toHaveBeenCalledTimes(1);
    });
  });

  describe("Criterio 5: Bloque de Anamnesis accesible, colapsable y con datos distintos del fallback", () => {
    it("renderiza los 4 bloques clínicos provistos por props y despliega cuestionarioNode al hacer clic en 'Ver cuestionario inicial completo'", () => {
      const { container, getByTestId, getByRole } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          anamnesisData={{
            objetivo: "Readaptación Deportiva",
            frecuencia: "5 días / semana",
            molestiaPrevia: "Rodilla izquierda",
            cirugias: "LCA reconstruido 2022",
          }}
          cuestionarioNode={
            <div data-testid="cuestionario-completo-real">
              Detalle de respuestas clínicas del atleta en vivo
            </div>
          }
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const anamnesisBox = getByTestId("anamnesis-summary-collapsible");
      expect(anamnesisBox.textContent).toContain("Objetivo");
      expect(anamnesisBox.textContent).toContain("Readaptación Deportiva");
      expect(anamnesisBox.textContent).toContain("Frecuencia");
      expect(anamnesisBox.textContent).toContain("5 días / semana");
      expect(anamnesisBox.textContent).toContain("Molestia previa");
      expect(anamnesisBox.textContent).toContain("Rodilla izquierda");
      expect(anamnesisBox.textContent).toContain("Cirugías");
      expect(anamnesisBox.textContent).toContain("LCA reconstruido 2022");

      // Expandir el cuestionario haciendo clic en el botón
      const btnToggleCuestionario = getByRole("button", {
        name: "Ver cuestionario inicial completo",
      });
      expect(btnToggleCuestionario.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(btnToggleCuestionario);

      expect(getByTestId("cuestionario-completo-real").textContent).toContain(
        "Detalle de respuestas clínicas del atleta en vivo"
      );
    });

    it("no contiene bloques duplicados de notificación de molestia", () => {
      const { container, getAllByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          dolorActivo={{
            id: "caso-unico-01",
            eva: 5,
            zona_articular: "Cadera derecha",
            ejercicio_nombre: "Hip Thrust",
            fecha_reporte: "06 nov 15:00",
            estado: "PENDIENTE",
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);
      expect(getAllByTestId("alert-salud")).toHaveLength(1);
    });
  });
});
