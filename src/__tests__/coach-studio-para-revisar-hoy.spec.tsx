import * as React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { ParaRevisarHoy } from "@/components/coach/para-revisar-hoy";
import { useCobrosStore } from "@/store/use-cobros-store";
import type { CobroItem } from "@/store/use-cobros-store";
import type { DolorActivo } from "@/lib/dolor";
import {
  assertNoDemoLiteralsInLiveMode,
  render,
} from "@/test-utils/no-demo-literals";

describe("GOZS-392: Coach Studio: Vista Inicio - Bloque 'Para revisar hoy' (EVA y Cuotas)", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  it("GIVEN un reporte de molestia activo con EVA = 7 WHEN el coach ingresa a /studio THEN la alerta encabeza la lista con badge semántico 'Alto', zona articular y ejercicio", () => {
    const molestiaEva7: Partial<DolorActivo> = {
      id: "reporte-eva-7",
      alumno_id: "alumno-test-1",
      alumno_nombre: "Sofía Martínez",
      zona_articular: "Rodilla",
      ejercicio_nombre: "Sentadilla Búlgara",
      eva: 7,
      severidad: "AGUDO",
      nivel: "alto",
      estado: "PENDIENTE",
      fecha_reporte: "Hoy, 09:30",
    };

    const cuotaVencida: CobroItem = {
      id: "cobro-test-1",
      contratacionId: "cont-test-1",
      alumnoId: "alumno-test-2",
      alumnoNombre: "Lucas Gómez",
      alumnoEmail: "lucas@example.com",
      alumnoTelefono: null,
      servicioNombre: "Musculación Libre",
      actividad: "MUSCULACION",
      diaVencimiento: 1,
      monto: 35000,
      montoLista: 35000,
      fechaVencimiento: "2026-11-01",
      estado: "VENCIDO",
      ultimoPago: {
        id: "pago-1",
        fechaPago: "2026-10-01",
        monto: 35000,
        medioPago: "EFECTIVO",
        confirmadoPor: "admin",
      },
    };

    const { container, getByTestId } = render(
      <ParaRevisarHoy
        molestias={[molestiaEva7 as DolorActivo]}
        cuotasVencidas={[cuotaVencida]}
      />
    );

    assertNoDemoLiteralsInLiveMode(container);

    expect(getByTestId("para-revisar-hoy-container")).toBeTruthy();
    expect(container.textContent).toContain("Para revisar hoy");

    // La alerta encabeza la lista
    expect(container.textContent).toContain("Sofía Martínez");
    expect(container.textContent).toContain("Rodilla");
    expect(container.textContent).toContain("Sentadilla Búlgara");
    expect(container.textContent).toContain("EVA 7/10");
    expect(container.textContent).toContain("Alto");

    // Posicionamiento relativo: la molestia aparece ANTES de la cuota vencida
    const text = container.textContent ?? "";
    const posMolestia = text.indexOf("Sofía Martínez");
    const posCuota = text.indexOf("Lucas Gómez");
    expect(posMolestia).toBeGreaterThan(-1);
    expect(posCuota).toBeGreaterThan(-1);
    expect(posMolestia).toBeLessThan(posCuota);
  });

  it("GIVEN un atleta con cuota vencida y sin molestias THEN se lista inmediatamente debajo de las alertas de molestia activa", () => {
    const cuotaVencida: CobroItem = {
      id: "cobro-test-vencida",
      contratacionId: "cont-test-vencida",
      alumnoId: "alumno-test-3",
      alumnoNombre: "Martín Benítez",
      alumnoEmail: "martin@example.com",
      alumnoTelefono: null,
      servicioNombre: "Funcional 3x Semana",
      actividad: "FUNCIONAL",
      diaVencimiento: 3,
      monto: 28000,
      montoLista: 28000,
      fechaVencimiento: "2026-11-03",
      estado: "VENCIDO",
      ultimoPago: {
        id: "pago-2",
        fechaPago: "2026-10-03",
        monto: 28000,
        medioPago: "TRANSFERENCIA",
        confirmadoPor: "admin",
      },
    };

    const { container } = render(
      <ParaRevisarHoy
        molestias={[]}
        cuotasVencidas={[cuotaVencida]}
      />
    );

    assertNoDemoLiteralsInLiveMode(container);

    expect(container.textContent).toContain("Martín Benítez");
    expect(container.textContent).toContain("Vencido");
    expect(container.textContent).toContain("$28.000");
    expect(container.textContent).toContain("Funcional 3x Semana");
    expect(container.textContent).toContain("2026-11-03");
  });

  it("GIVEN 0 alertas o cuotas vencidas pendientes THEN se renderiza el EmptyState con el texto exacto 'Nada urgente por hoy.'", () => {
    const { container, getByTestId } = render(
      <ParaRevisarHoy
        molestias={[]}
        cuotasVencidas={[]}
      />
    );

    assertNoDemoLiteralsInLiveMode(container);

    expect(getByTestId("para-revisar-hoy-empty")).toBeTruthy();
    expect(container.textContent).toContain("Nada urgente por hoy.");
    expect(container.textContent).toContain("0 pendientes");
  });

  it("GIVEN múltiples reportes de molestia THEN los ordena por severidad clínica (EVA 8-10 primero, luego EVA 4-7)", () => {
    const molestias: Partial<DolorActivo>[] = [
      {
        id: "mol-eva-5",
        alumno_nombre: "Alumno Moderado",
        zona_articular: "Hombro",
        ejercicio_nombre: "Press Militar",
        eva: 5,
      },
      {
        id: "mol-eva-9",
        alumno_nombre: "Alumno Crítico",
        zona_articular: "Lumbar",
        ejercicio_nombre: "Peso Muerto",
        eva: 9,
      },
    ];

    const { container } = render(
      <ParaRevisarHoy molestias={molestias as DolorActivo[]} cuotasVencidas={[]} />
    );

    assertNoDemoLiteralsInLiveMode(container);

    const text = container.textContent ?? "";
    const posCritico = text.indexOf("Alumno Crítico");
    const posModerado = text.indexOf("Alumno Moderado");
    expect(posCritico).toBeGreaterThan(-1);
    expect(posModerado).toBeGreaterThan(-1);
    expect(posCritico).toBeLessThan(posModerado);

    expect(text).toContain("Alto");
    expect(text).toContain("Moderado");
  });
});
