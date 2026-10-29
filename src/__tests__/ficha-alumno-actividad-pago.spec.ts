import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  derivarActividadFrecuencia,
  derivarEstadoPagoAlumno,
  derivarMontoSuscripcion,
} from "@/lib/alumno-ficha";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { DEMO_ALUMNOS_CLASES, DEMO_CONTRATACIONES_CLASES } from "@/services/coach-demo-dataset";
import type { Contratacion, Perfil, PlanEntrenamiento } from "@/types/database.types";

describe("FE Studio: Ficha del alumno con actividad, frecuencia, estado de pago y registro de pago (GOZS-247)", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("1. Derivación de Actividad y Frecuencia: Funcional, Boxeo, Pase libre y Rutina", () => {
    it("identifica 'Funcional (2 veces por semana)' para Valentina Ríos", () => {
      const contratacion = DEMO_CONTRATACIONES_CLASES.find(
        (c) => c.alumno_id === "demo-alumno-valentina",
      );
      const res = derivarActividadFrecuencia({
        contratacion,
        planMembresiaNombre: "Funcional 2x semana",
        limiteSemanal: 2,
      });

      expect(res.tipo).toBe("FUNCIONAL");
      expect(res.etiqueta).toBe("Funcional (2 veces por semana)");
      expect(res.vecesPorSemana).toBe(2);
    });

    it("identifica 'Funcional (3 veces por semana)' cuando el plan especifica 3x", () => {
      const res = derivarActividadFrecuencia({
        contratacion: {
          id: "cont-func-3x",
          alumno_id: "alu-1",
          actividad: "FUNCIONAL",
          tipo_servicio: "PRESENCIAL",
          plan_membresia_id: "plan-funcional-3x",
          dia_vencimiento: 10,
          dias_aviso_previo: 5,
          fecha_inicio: "2026-10-01",
          fecha_fin: "2026-10-31",
          estado: "VIGENTE",
          precio_pactado: 30000,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
        },
        planMembresiaNombre: "Funcional 3x semana",
        limiteSemanal: 3,
      });

      expect(res.tipo).toBe("FUNCIONAL");
      expect(res.etiqueta).toBe("Funcional (3 veces por semana)");
      expect(res.vecesPorSemana).toBe(3);
    });

    it("identifica 'Boxeo (2 veces por semana)' y 'Boxeo (1 vez por semana)'", () => {
      const res2x = derivarActividadFrecuencia({
        contratacion: {
          id: "cont-box-2x",
          alumno_id: "alu-box-2",
          actividad: "BOXEO",
          tipo_servicio: "PRESENCIAL",
          plan_membresia_id: "plan-boxeo-2x",
          dia_vencimiento: 15,
          dias_aviso_previo: 5,
          fecha_inicio: "2026-10-01",
          fecha_fin: "2026-10-31",
          estado: "VIGENTE",
          precio_pactado: 28000,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
        },
        planMembresiaNombre: "Boxeo 2x semana",
        limiteSemanal: 2,
      });

      expect(res2x.tipo).toBe("BOXEO");
      expect(res2x.etiqueta).toBe("Boxeo (2 veces por semana)");
      expect(res2x.vecesPorSemana).toBe(2);

      const res1x = derivarActividadFrecuencia({
        contratacion: {
          id: "cont-box-1x",
          alumno_id: "alu-box-1",
          actividad: "BOXEO",
          tipo_servicio: "PRESENCIAL",
          plan_membresia_id: "plan-boxeo-1x",
          dia_vencimiento: 5,
          dias_aviso_previo: 5,
          fecha_inicio: "2026-10-01",
          fecha_fin: "2026-10-31",
          estado: "VIGENTE",
          precio_pactado: 18000,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
        },
        planMembresiaNombre: "Boxeo 1x semana",
        limiteSemanal: 1,
      });

      expect(res1x.tipo).toBe("BOXEO");
      expect(res1x.etiqueta).toBe("Boxeo (1 vez por semana)");
      expect(res1x.vecesPorSemana).toBe(1);
    });

    it("identifica 'Pase libre' para Sofía Martínez (Funcional + Boxeo sin límite)", () => {
      const contratacion = DEMO_CONTRATACIONES_CLASES.find(
        (c) => c.alumno_id === "demo-alumno-sofia",
      );
      const res = derivarActividadFrecuencia({
        contratacion,
        planMembresiaNombre: "Pase libre Funcional + Boxeo",
      });

      expect(res.tipo).toBe("PASE_LIBRE");
      expect(res.etiqueta).toBe("Pase libre");
      expect(res.detalle).toContain("sin límite");
      expect(res.vecesPorSemana).toBeNull();
    });

    it("identifica 'Rutina' para alumnos sin membresía de clases (Asesoría Online)", () => {
      const mockRutina: PlanEntrenamiento = {
        id: "plan-rutina-fuerza",
        alumno_id: "demo-alumno-online",
        nombre: "Hipertrofia Tren Superior & Core",
        estado: "ACTIVO",
        profesor_id: "coach-1",
        fecha_inicio: "2026-10-01",
        fecha_fin: "2026-11-01",
        comentarios: null,
        created_at: "2026-10-01",
        updated_at: "2026-10-01",
      };

      const res = derivarActividadFrecuencia({
        contratacion: {
          id: "cont-online",
          alumno_id: "demo-alumno-online",
          actividad: null,
          tipo_servicio: "ASESORIA_ONLINE",
          plan_membresia_id: null,
          dia_vencimiento: 10,
          dias_aviso_previo: 5,
          fecha_inicio: "2026-10-01",
          fecha_fin: "2026-11-01",
          estado: "VIGENTE",
          precio_pactado: 22000,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
        },
        rutinaActiva: mockRutina,
      });

      expect(res.tipo).toBe("RUTINA");
      expect(res.etiqueta).toBe("Rutina");
      expect(res.detalle).toContain("Hipertrofia Tren Superior & Core");
    });
  });

  describe("2. Estado de Pago: 'Pagó' vs 'No pagó' (Vencido o Pendiente)", () => {
    it("determina 'Pagó' para Valentina y Sofía en el dataset demo", () => {
      const store = useCobrosStore.getState();

      const cobroValentina = store.cobros.find((c) => c.alumnoId === "demo-alumno-valentina");
      const estadoVal = derivarEstadoPagoAlumno({ cobroItem: cobroValentina });
      expect(estadoVal.pago).toBe(true);
      expect(estadoVal.etiquetaPrincipal).toBe("Pagó");
      expect(estadoVal.estado).toBe("PAGADO");

      const cobroSofia = store.cobros.find((c) => c.alumnoId === "demo-alumno-sofia");
      const estadoSof = derivarEstadoPagoAlumno({ cobroItem: cobroSofia });
      expect(estadoSof.pago).toBe(true);
      expect(estadoSof.etiquetaPrincipal).toBe("Pagó");
      expect(estadoSof.estado).toBe("PAGADO");
    });

    it("determina 'No pagó' (Vencido) para Tomás Ledesma", () => {
      const store = useCobrosStore.getState();
      const cobroTomas = store.cobros.find((c) => c.alumnoId === "demo-alumno-tomas");
      const estadoTomas = derivarEstadoPagoAlumno({ cobroItem: cobroTomas });

      expect(estadoTomas.pago).toBe(false);
      expect(estadoTomas.etiquetaPrincipal).toBe("No pagó");
      expect(estadoTomas.estado).toBe("VENCIDO");
      expect(estadoTomas.etiquetaDetalle).toBe("Vencido");
    });

    it("reconoce pago inmediato cuando se registra en la sesión", () => {
      const estado = derivarEstadoPagoAlumno({
        pagoRegistradoEnSesion: true,
      });

      expect(estado.pago).toBe(true);
      expect(estado.etiquetaPrincipal).toBe("Pagó");
      expect(estado.estado).toBe("PAGADO");
    });
  });

  describe("3. Monto de la Suscripción", () => {
    it("obtiene el monto de $25.000 para plan Funcional 2x de Valentina", () => {
      const store = useCobrosStore.getState();
      const cobroVal = store.cobros.find((c) => c.alumnoId === "demo-alumno-valentina");
      const montoInfo = derivarMontoSuscripcion({ cobroItem: cobroVal });

      expect(montoInfo.monto).toBe(25000);
      expect(montoInfo.formateado).toContain("25.000");
    });

    it("obtiene monto cobrado con descuento para Sofía ($32.000 cobrado, $40.000 lista)", () => {
      const store = useCobrosStore.getState();
      const cobroSof = store.cobros.find((c) => c.alumnoId === "demo-alumno-sofia");
      const montoInfo = derivarMontoSuscripcion({ cobroItem: cobroSof });

      expect(montoInfo.monto).toBe(32000);
      expect(montoInfo.montoLista).toBe(40000);
      expect(montoInfo.descuento).toBe(8000);
      expect(montoInfo.formateado).toContain("32.000");
    });
  });

  describe("4. Criterios de Aceptación Gherkin en Ficha del Alumno (StudentDetail)", () => {
    const studentDetailPath = path.resolve(
      __dirname,
      "../components/coach/student-detail.tsx",
    );
    const code = fs.readFileSync(studentDetailPath, "utf-8");

    it("GIVEN la ficha de un alumno WHEN se abre THEN se ven actividades/frecuencia, estado de pago, monto de la sub y un botón para registrar el pago", () => {
      // Elementos visibles al abrir la ficha del alumno:
      expect(code).toContain('data-testid="ficha-suscripcion-resumen"');
      expect(code).toContain('data-testid="ficha-actividad-frecuencia"');
      expect(code).toContain('data-testid="ficha-estado-pago"');
      expect(code).toContain('data-testid="ficha-monto-sub"');
      expect(code).toContain('data-testid="btn-registrar-pago"');
    });

    it("provee diálogo accesible para registrar el pago con monto, medio (Transferencia/Efectivo) y confirmación", () => {
      expect(code).toContain('data-testid="dialog-registrar-pago"');
      expect(code).toContain('data-testid="input-monto-pago"');
      expect(code).toContain('data-testid="btn-medio-transferencia"');
      expect(code).toContain('data-testid="btn-medio-efectivo"');
      expect(code).toContain('data-testid="btn-confirmar-pago"');
    });

    it("al registrar el pago desde la ficha, actualiza el estado a 'Pagó' en useCobrosStore", async () => {
      const store = useCobrosStore.getState();
      const tomas = store.cobros.find((c) => c.alumnoId === "demo-alumno-tomas");
      expect(tomas?.estado).toBe("VENCIDO");

      // Registrar pago
      const comprobante = await store.registrarPago({
        contratacionId: tomas!.contratacionId,
        monto: tomas!.monto,
        medioPago: "TRANSFERENCIA",
        notas: "Pago en ficha de alumno",
      });

      expect(comprobante).toBeDefined();
      expect(comprobante.reciboNumero).toContain("REC-");

      const actualizado = useCobrosStore
        .getState()
        .cobros.find((c) => c.alumnoId === "demo-alumno-tomas");
      expect(actualizado?.estado).toBe("PAGADO");

      const estadoTomasNuevo = derivarEstadoPagoAlumno({ cobroItem: actualizado });
      expect(estadoTomasNuevo.pago).toBe(true);
      expect(estadoTomasNuevo.etiquetaPrincipal).toBe("Pagó");
    });
  });
});
