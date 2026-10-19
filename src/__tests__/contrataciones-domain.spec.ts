import { describe, expect, it } from "vitest";
import {
  computeAnchoredRenewalDate,
  derivarContratacionDesdePerfil,
  derivarEstadoContratacion,
} from "@/lib/contrataciones";
import type { Perfil } from "@/types/database.types";

describe("Dominio de Contrataciones (ADR-001)", () => {
  describe("Regla de anclaje de fecha en renovaciones ('no se corre la fecha')", () => {
    it("vencida el día 10 y pagada el día 18 → próximo corte mantiene el día 10 del mes siguiente", () => {
      // fecha_fin original = 10 de enero; día de vencimiento anclado = 10.
      const next = computeAnchoredRenewalDate("2026-01-10", 10);
      expect(next).toBe("2026-02-10");
    });

    it("avanza correctamente al cruzar diciembre → enero del año siguiente", () => {
      expect(computeAnchoredRenewalDate("2026-12-10", 10)).toBe("2027-01-10");
    });

    it("ancla al último día disponible cuando el mes destino no tiene ese día", () => {
      // Día 31 de enero → febrero no tiene día 31: se ancla al 28 (2026 no bisiesto).
      expect(computeAnchoredRenewalDate("2026-01-31", 31)).toBe("2026-02-28");
    });
  });

  describe("Derivación de estado por fecha", () => {
    it("marca VENCIDA cuando hoy supera fecha_fin", () => {
      expect(derivarEstadoContratacion("2026-10-10", 5, "2026-10-11")).toBe(
        "VENCIDA",
      );
    });

    it("marca POR_VENCER dentro de los 5 días de aviso previo", () => {
      expect(derivarEstadoContratacion("2026-10-15", 5, "2026-10-12")).toBe(
        "POR_VENCER",
      );
    });

    it("marca VIGENTE fuera de la ventana de aviso", () => {
      expect(derivarEstadoContratacion("2026-10-30", 5, "2026-10-12")).toBe(
        "VIGENTE",
      );
    });
  });

  describe("Derivación desde perfil sin inventar datos fuera del esquema", () => {
    const basePerfil = (overrides: Partial<Perfil>): Perfil =>
      ({
        id: "alumno-1",
        email: "a@gozs.fit",
        nombre_completo: "Atleta GOZS",
        rol: "ALUMNO",
        estado_membresia: "ACTIVA",
        profesor_asignado_id: null,
        fecha_baja: null,
        fecha_vencimiento_cuota: "2026-11-10",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
      }) as Perfil;

    it("EXPIRED_PAYMENT_PENDING → contratación VENCIDA conservando el día de corte", () => {
      const c = derivarContratacionDesdePerfil(
        basePerfil({ estado_membresia: "EXPIRED_PAYMENT_PENDING" }),
      );
      expect(c.estado).toBe("VENCIDA");
      expect(c.dia_vencimiento).toBe(10);
      expect(c.fecha_fin).toBe("2026-11-10");
    });

    it("PENDIENTE → PENDIENTE_RENOVACION", () => {
      const c = derivarContratacionDesdePerfil(
        basePerfil({ estado_membresia: "PENDIENTE" }),
      );
      expect(c.estado).toBe("PENDIENTE_RENOVACION");
    });
  });
});
