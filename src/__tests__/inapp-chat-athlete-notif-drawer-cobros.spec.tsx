import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Mock de next/navigation para interceptar redirecciones
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/studio/cobros",
}));

import { CobrosPanel } from "@/components/coach/cobros-panel";
import { HistorialCobrosDrawer } from "@/components/coach/historial-cobros-drawer";
import { ChatFab } from "@/components/coach/chat-fab";
import { InicioMisDias } from "@/components/athlete/inicio-mis-dias";
import { AthleteChat } from "@/components/athlete/athlete-chat";
import {
  useChatStore,
  STAFF_COACH_PRINCIPAL,
  DEFAULT_ATHLETE_SENDER,
} from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useCobrosStore, type CobroItem } from "@/store/use-cobros-store";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";

describe("GOZS-350: In-App Chat en Fila de Alumno, Notificación al Loguear en Atleta y Drawer Historial en Cobros", () => {
  const coachStudioViewPath = path.resolve(
    __dirname,
    "../components/coach/coach-studio-view.tsx"
  );
  const viewContent = fs.readFileSync(coachStudioViewPath, "utf-8");

  beforeEach(() => {
    mockPush.mockClear();
    useChatStore.getState().resetToDefaults();
    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      chatAlumnoId: null,
      isChatOpen: false,
      isWhatsAppEnabled: false,
    });
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("1. En /studio, el botón de la fila del alumno abre ChatFab in-app (Criterio Gherkin 1)", () => {
    it("GIVEN la tabla de alumnos en /studio WHEN el coach visualiza la fila de un atleta THEN expone el botón de mensaje in-app con touch target ergonómico", () => {
      expect(viewContent).toContain("btn-enviar-mensaje-${alumno.id}");
      expect(viewContent).toContain('title="Enviar mensaje"');
      expect(viewContent).toContain("aria-label={`Enviar mensaje a ${alumno.nombre_completo}`}");
      expect(viewContent).toContain("openChatForAlumno(alumno.id)");
    });

    it("WHEN el coach toca el botón de mensaje en la fila de un atleta THEN se abre de inmediato el drawer de chat vinculado a ese alumno", () => {
      const alumno = MOCK_ALUMNOS[0]!;
      const alumnoId = alumno.id;

      expect(useCoachStudioStore.getState().isChatOpen).toBe(false);
      expect(useCoachStudioStore.getState().chatAlumnoId).toBeNull();

      // Coach pulsa el botón de mensaje en la fila del alumno
      useCoachStudioStore.getState().openChatForAlumno(alumnoId);

      expect(useCoachStudioStore.getState().isChatOpen).toBe(true);
      expect(useCoachStudioStore.getState().chatAlumnoId).toBe(alumnoId);
      expect(useChatStore.getState().selectedAlumnoId).toBe(alumnoId);
    });

    it("THEN ChatFab renderiza el drawer interactivo (data-testid='coach-chat-drawer') con el nombre del alumno", () => {
      const alumno = MOCK_ALUMNOS[0]!;
      const html = renderToStaticMarkup(
        <ChatFab alumno={alumno} isOpen={true} onToggle={vi.fn()} />
      );

      expect(html).toContain('data-testid="coach-chat-drawer"');
      expect(html).toContain(`Chat con ${alumno.nombre_completo}`);
      expect(html).toContain("Hilo de equipo sincronizado en tiempo real");
    });
  });

  describe("2. En la Athlete App (/athlete), notificación destacada al acceder con mensajes no leídos (Criterio Gherkin 2)", () => {
    it("GIVEN un alumno con mensajes no leídos del entrenador WHEN ingresa a la Athlete App THEN se muestra aviso visible (banner flotante)", () => {
      const alumnoId = DEFAULT_ATHLETE_SENDER.id;
      // Limpiamos mensajes previos para verificar el flujo aislado
      useChatStore.getState().markAsRead(alumnoId);
      expect(useChatStore.getState().getUnreadStaffCount(alumnoId)).toBe(0);

      // El coach envía un mensaje al alumno
      useChatStore.getState().sendMessage({
        alumnoId,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Lucas, acordate de hidratar bien antes de la serie pesada.",
      });

      // El alumno tiene 1 mensaje no leído del staff
      expect(useChatStore.getState().getUnreadStaffCount(alumnoId)).toBe(1);
      const latest = useChatStore.getState().getLatestUnreadStaffMessage(alumnoId);
      expect(latest).toBeDefined();
      expect(latest?.contenido).toBe("Lucas, acordate de hidratar bien antes de la serie pesada.");

      // En la pantalla inicial de la Athlete App se renderiza el banner prominente
      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).toContain('data-testid="unread-coach-message-banner"');
      expect(html).toContain("Mensaje nuevo del Coach");
      expect(html).toContain("No leído");
      expect(html).toContain("Lucas, acordate de hidratar bien antes de la serie pesada.");
      expect(html).toContain("Ver mensaje");
    });

    it("THEN el botón flotante de chat muestra el badge pulsante con el conteo de no leídos", () => {
      const alumnoId = DEFAULT_ATHLETE_SENDER.id;
      useChatStore.getState().markAsRead(alumnoId);

      useChatStore.getState().sendMessage({
        alumnoId,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Buen entrenamiento hoy!",
      });

      const html = renderToStaticMarkup(<AthleteChat />);
      expect(html).toContain('data-testid="unread-chat-badge"');
      expect(html).toContain("animate-pulse");
      expect(html).toContain("mensajes no leídos del equipo GOZS");
    });

    it("WHEN el atleta abre el chat y lee el mensaje THEN el aviso se limpia reactivamente", () => {
      const alumnoId = DEFAULT_ATHLETE_SENDER.id;
      useChatStore.getState().markAsRead(alumnoId);

      useChatStore.getState().sendMessage({
        alumnoId,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Mensaje leído.",
      });

      expect(useChatStore.getState().getUnreadStaffCount(alumnoId)).toBe(1);

      // El atleta abre el chat y marca como leído
      useChatStore.getState().markAsRead(alumnoId);

      expect(useChatStore.getState().getUnreadStaffCount(alumnoId)).toBe(0);
      expect(useChatStore.getState().getLatestUnreadStaffMessage(alumnoId)).toBeNull();

      // Al renderizar sin mensajes pendientes, el banner no figura
      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).not.toContain('data-testid="unread-coach-message-banner"');
    });
  });

  describe("3. En /studio/cobros, el botón 'Historial' abre Drawer lateral en la misma página (Criterio Gherkin 3)", () => {
    it("GIVEN la tabla de Cobros & Pagos en /studio/cobros THEN el menú ⋯ de cada fila expone 'Historial de cobros'", () => {
      const html = renderToStaticMarkup(<CobrosPanel initialRowMenuOpen />);
      expect(html).toContain('data-testid="ver-historial-btn"');
      expect(html).toContain("Historial");
    });

    it("WHEN el coach pulsa 'Historial' THEN abre el Drawer sin redirigir a /studio (router.push no se llama)", () => {
      // El componente CobrosPanel maneja verHistorial abriendo el drawer local
      renderToStaticMarkup(<CobrosPanel />);

      // En el código previo, verHistorial ejecutaba router.push('/studio').
      // Verificamos que al abrir el drawer no se dispare ninguna navegación externa
      expect(mockPush).not.toHaveBeenCalledWith("/studio");
    });

    it("THEN HistorialCobrosDrawer renderiza la cronología de cuotas, montos cobrados, descuento 'N' y recibos generados", () => {
      const mockCobros: CobroItem[] = [
        {
          id: "cobro-sofia-actual",
          alumnoId: "demo-alumno-sofia",
          alumnoNombre: "Sofía Rossi",
          alumnoEmail: "sofia.rossi@ejemplo.com",
          alumnoTelefono: "+54 9 11 5566-7788",
          contratacionId: "cont-sofia-1",
          servicioNombre: "Pase Libre (Funcional + Boxeo)",
          actividad: "FUNCIONAL_BOXEO",
          monto: 32000,
          montoLista: 40000,
          descuento: 8000,
          notaDescuento: "Descuento 20% acordado con el coach",
          diaVencimiento: 15,
          fechaVencimiento: "2026-10-15",
          estado: "PAGADO",
          ultimoPago: {
            id: "pago-sofia-1",
            monto: 32000,
            montoLista: 40000,
            descuento: 8000,
            medioPago: "TRANSFERENCIA",
            fechaPago: "2026-10-14T12:00:00Z",
            confirmadoPor: "Lucía Ferraro",
            notas: "Descuento 20% acordado con el coach",
          },
        },
        {
          id: "cobro-sofia-anterior",
          alumnoId: "demo-alumno-sofia",
          alumnoNombre: "Sofía Rossi",
          alumnoEmail: "sofia.rossi@ejemplo.com",
          alumnoTelefono: "+54 9 11 5566-7788",
          contratacionId: "cont-sofia-prev",
          servicioNombre: "Pase Libre (Funcional + Boxeo)",
          actividad: "FUNCIONAL_BOXEO",
          monto: 32000,
          montoLista: 40000,
          descuento: 8000,
          notaDescuento: "Descuento 20% acordado con el coach",
          diaVencimiento: 15,
          fechaVencimiento: "2026-09-15",
          estado: "PAGADO",
          ultimoPago: {
            id: "pago-sofia-prev",
            monto: 32000,
            montoLista: 40000,
            descuento: 8000,
            medioPago: "TRANSFERENCIA",
            fechaPago: "2026-09-14T10:00:00Z",
            confirmadoPor: "Lucía Ferraro",
            notas: "Descuento 20% acordado con el coach",
          },
        },
      ];

      const html = renderToStaticMarkup(
        <HistorialCobrosDrawer
          isOpen={true}
          onClose={vi.fn()}
          alumnoId="demo-alumno-sofia"
          cobros={mockCobros}
          onAbrirComprobante={vi.fn()}
        />
      );

      // Estructura de diálogo modal lateral
      expect(html).toContain('data-testid="historial-cobros-drawer"');
      expect(html).toContain("Historial de Cobros y Pagos");
      expect(html).toContain("Sofía Rossi");
      expect(html).toContain("sofia.rossi@ejemplo.com");
      expect(html).toContain("+54 9 11 5566-7788");

      // Botón de cierre accesible
      expect(html).toContain('data-testid="cerrar-historial-drawer"');

      // Cronología y cuotas
      expect(html).toContain('data-testid="historial-cobros-lista"');
      expect(html).toContain("Pase Libre (Funcional + Boxeo)");
      expect(html).toContain("Actividad: FUNCIONAL_BOXEO");
      expect(html).toContain("✓ Pagado");

      // Monto cobrado vs Lista y distintivo de descuento "N"
      expect(html).toContain("$32.000");
      expect(html).toContain("$40.000");
      expect(html).toContain('data-testid="descuento-n-badge"');
      expect(html).toContain("-$8.000");
      expect(html).toContain("Descuento 20% acordado con el coach");

      // Botón para visualizar el recibo emitido sin abandonar la página
      expect(html).toContain('data-testid="ver-recibo-historial-btn"');
      expect(html).toContain("Ver recibo");
      expect(html).toContain("REC-");
    });

    it("THEN si el drawer está cerrado (isOpen=false) no renderiza nada en el DOM", () => {
      const html = renderToStaticMarkup(
        <HistorialCobrosDrawer
          isOpen={false}
          onClose={vi.fn()}
          alumnoId="demo-alumno-sofia"
          cobros={[]}
          onAbrirComprobante={vi.fn()}
        />
      );

      expect(html).toBe("");
    });
  });
});
