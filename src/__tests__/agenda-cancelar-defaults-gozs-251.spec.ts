import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { useClasesStore, type ReservaAgenda } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { useChatStore, STAFF_COACH_PRINCIPAL } from "@/store/use-chat-store";
import type { Clase } from "@/types/database.types";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

describe("GOZS-251: FE Studio/agenda: cancelar clase (avisa solo si hay inscriptos) y defaults sin cupo y 60 min", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useClasesStore.getState().resetDemoDataset(new Date("2026-10-28T12:00:00-03:00"));
    useChatStore.getState().resetToDefaults?.();
  });

  describe("Criterios de Aceptación (Gherkin)", () => {
    it("GIVEN una clase con y otra sin inscriptos WHEN el coach cancela cada una THEN la primera notifica a todos los inscriptos, la segunda se borra sin mensajes; las clases nuevas nacen sin cupo y de 60 minutos", async () => {
      const store = useClasesStore.getState();
      const chatStore = useChatStore.getState();

      // 1. Las clases nuevas nacen sin cupo (null) y de 60 minutos por defecto
      const claseCon = await store.crearClase({
        actividad: "FUNCIONAL",
        inicio: "2026-10-30T10:00:00-03:00",
      });
      expect(claseCon.capacidad).toBeNull();
      expect(claseCon.duracion_minutos).toBe(60);
      expect(claseCon.estado).toBe("PROGRAMADA");

      const claseSin = await store.crearClase({
        actividad: "BOXEO",
        inicio: "2026-10-30T11:00:00-03:00",
      });
      expect(claseSin.capacidad).toBeNull();
      expect(claseSin.duracion_minutos).toBe(60);
      expect(claseSin.estado).toBe("PROGRAMADA");

      // Anotamos 2 alumnos a claseCon
      const alumnoA = "demo-alumno-valentina";
      const alumnoB = "demo-alumno-sofia";

      const reservaA: ReservaAgenda = {
        id: "res-test-a",
        clase_id: claseCon.id,
        alumno_id: alumnoA,
        estado: "ANOTADO",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        alumno_nombre: "Valentina Ríos",
      };
      const reservaB: ReservaAgenda = {
        id: "res-test-b",
        clase_id: claseCon.id,
        alumno_id: alumnoB,
        estado: "ANOTADO",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        alumno_nombre: "Sofía Benítez",
      };

      useClasesStore.setState({
        agendaReservas: [...useClasesStore.getState().agendaReservas, reservaA, reservaB],
      });

      // Verificamos mensajes previos en el chat
      const msgsAntesA = chatStore.getConversation(alumnoA).mensajes.length;
      const msgsAntesB = chatStore.getConversation(alumnoB).mensajes.length;
      const totalMsgsAntes = Object.values(useChatStore.getState().conversations).reduce(
        (acc, c) => acc + c.mensajes.length,
        0,
      );

      // 2. WHEN el coach cancela la clase CON inscriptos
      const okCon = await useClasesStore.getState().cancelarClase(claseCon.id, "Indisposición del entrenador");
      expect(okCon).toBe(true);

      // THEN la primera notifica a todos los inscriptos por el chat y queda CANCELADA con reservas ANULADO
      const claseConActualizada = useClasesStore.getState().clases.find((c) => c.id === claseCon.id);
      expect(claseConActualizada).toBeDefined();
      expect(claseConActualizada?.estado).toBe("CANCELADA");
      expect(claseConActualizada?.motivo_cancelacion).toBe("Indisposición del entrenador");

      const reservasClaseCon = useClasesStore
        .getState()
        .agendaReservas.filter((r) => r.clase_id === claseCon.id);
      expect(reservasClaseCon.every((r) => r.estado === "ANULADO")).toBe(true);

      // Alumno A recibió mensaje por el chat
      const convA = useChatStore.getState().getConversation(alumnoA);
      expect(convA.mensajes.length).toBe(msgsAntesA + 1);
      const ultimoMsgA = convA.mensajes[convA.mensajes.length - 1];
      expect(ultimoMsgA).toBeDefined();
      expect(ultimoMsgA?.contenido).toContain("cancelada");
      expect(ultimoMsgA?.contenido).toContain("Indisposición del entrenador");

      // Alumno B recibió mensaje por el chat
      const convB = useChatStore.getState().getConversation(alumnoB);
      expect(convB.mensajes.length).toBe(msgsAntesB + 1);
      const ultimoMsgB = convB.mensajes[convB.mensajes.length - 1];
      expect(ultimoMsgB).toBeDefined();
      expect(ultimoMsgB?.contenido).toContain("cancelada");
      expect(ultimoMsgB?.contenido).toContain("Indisposición del entrenador");

      const totalMsgsDespuesCon = Object.values(useChatStore.getState().conversations).reduce(
        (acc, c) => acc + c.mensajes.length,
        0,
      );
      expect(totalMsgsDespuesCon).toBe(totalMsgsAntes + 2);

      // 3. WHEN el coach cancela la clase SIN inscriptos
      const okSin = await useClasesStore.getState().cancelarClase(claseSin.id, "");
      expect(okSin).toBe(true);

      // THEN la segunda se borra sin mensajes
      const claseSinActualizada = useClasesStore.getState().clases.find((c) => c.id === claseSin.id);
      expect(claseSinActualizada).toBeUndefined(); // Se borró completamente

      const totalMsgsDespuesSin = Object.values(useChatStore.getState().conversations).reduce(
        (acc, c) => acc + c.mensajes.length,
        0,
      );
      expect(totalMsgsDespuesSin).toBe(totalMsgsDespuesCon); // Cero mensajes adicionales
    });
  });

  describe("UI y Componente ClassAgenda", () => {
    const agendaSource = readSource("../components/coach/class-agenda.tsx");

    it("la UI inicializa la creación con duración 60 y sin límite activo (cupo opcional)", () => {
      expect(agendaSource).toContain("const [crearDuracion, setCrearDuracion] = React.useState(60)");
      expect(agendaSource).toContain("const [crearCapacidad, setCrearCapacidad] = React.useState<number | null>(null)");
      expect(agendaSource).toContain("const [crearSinLimite, setCrearSinLimite] = React.useState(true)");
      expect(agendaSource).toContain('data-testid="create-class-unlimited-checkbox"');
    });

    it("el diálogo de cancelación adapta el mensaje y no exige motivo si la clase no tiene inscriptos", () => {
      expect(agendaSource).toContain("inscriptosClase.length === 0");
      expect(agendaSource).toContain("Esta clase no tiene alumnos inscriptos. Se eliminará de la agenda sin enviar mensajes.");
      expect(agendaSource).toContain("Al cancelar, se anularán las reservas de todos los alumnos anotados y se les notificará por chat.");
      expect(agendaSource).toContain("data-testid=\"cancel-class-reason\"");
      expect(agendaSource).toContain("data-testid=\"confirm-cancel-class-btn\"");
    });
  });
});
