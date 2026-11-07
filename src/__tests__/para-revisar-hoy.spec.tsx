import * as React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ParaRevisarHoy } from "@/components/coach/para-revisar-hoy";
import { useCobrosStore, type CobroItem } from "@/store/use-cobros-store";
import type { DolorActivo } from "@/lib/dolor";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";

describe("FIX-08 / GOZS-392: Bloque 'Para revisar hoy' montado con render(...) y datos en vivo", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  it("GIVEN reportes de molestia y cuotas vencidas reales WHEN se monta ParaRevisarHoy con render(...) THEN prioriza la alerta clínica antes de la cuota, no filtra literales demo e invoca onSelectAlumno al hacer clic", () => {
    const onSelectAlumno = vi.fn();

    const molestiaVivaEva7: Partial<DolorActivo> = {
      id: "reporte-vivo-eva-7",
      alumno_id: "alumno-real-101",
      alumno_nombre: "Fernando Rosales",
      zona_articular: "Rodilla izquierda",
      ejercicio_nombre: "Sentadilla Búlgara con Mancuernas",
      eva: 7,
      severidad: "AGUDO",
      nivel: "alto",
      estado: "PENDIENTE",
      fecha_reporte: "06 nov 09:30",
    };

    const cuotaVivaVencida: CobroItem = {
      id: "cobro-vivo-1",
      contratacionId: "cont-vivo-1",
      alumnoId: "alumno-real-102",
      alumnoNombre: "Julieta Pereyra",
      alumnoEmail: "julieta@example.com",
      alumnoTelefono: null,
      servicioNombre: "Musculación Personalizada",
      actividad: "MUSCULACION",
      diaVencimiento: 2,
      monto: 42000,
      montoLista: 42000,
      fechaVencimiento: "2026-11-02",
      estado: "VENCIDO",
      ultimoPago: {
        id: "pago-vivo-1",
        fechaPago: "2026-10-02",
        monto: 42000,
        medioPago: "TRANSFERENCIA",
        confirmadoPor: "admin",
      },
    };

    const { container, getByTestId, getAllByTestId } = render(
      <ParaRevisarHoy
        molestias={[molestiaVivaEva7 as DolorActivo]}
        cuotasVencidas={[cuotaVivaVencida]}
        onSelectAlumno={onSelectAlumno}
      />
    );

    assertNoDemoLiteralsInLiveMode(container);

    const root = getByTestId("para-revisar-hoy-container");
    expect(root.textContent).toContain("Para revisar hoy");
    expect(getByTestId("para-revisar-hoy-badge-count").textContent).toBe("2");

    // Verifica que la molestia viva encabeza la lista
    const itemsMolestia = getAllByTestId("revisar-item-molestia");
    expect(itemsMolestia).toHaveLength(1);
    expect(itemsMolestia[0]!.textContent).toContain("Fernando Rosales");
    expect(itemsMolestia[0]!.textContent).toContain("Rodilla izquierda");
    expect(itemsMolestia[0]!.textContent).toContain("Sentadilla Búlgara con Mancuernas");
    expect(itemsMolestia[0]!.textContent).toContain("EVA 7/10");
    expect(itemsMolestia[0]!.textContent).toContain("Alto");

    // Verifica que la cuota vencida viva se renderiza debajo
    const itemsCuota = getAllByTestId("revisar-item-cuota");
    expect(itemsCuota).toHaveLength(1);
    expect(itemsCuota[0]!.textContent).toContain("Julieta Pereyra");
    expect(itemsCuota[0]!.textContent).toContain("$42.000");
    expect(itemsCuota[0]!.textContent).toContain("Musculación Personalizada");

    const fullText = container.textContent ?? "";
    expect(fullText.indexOf("Fernando Rosales")).toBeLessThan(
      fullText.indexOf("Julieta Pereyra")
    );

    // Interacción sobre los ítems montados
    fireEvent.click(itemsMolestia[0]!);
    expect(onSelectAlumno).toHaveBeenCalledWith("alumno-real-101");

    fireEvent.click(itemsCuota[0]!);
    expect(onSelectAlumno).toHaveBeenCalledWith("alumno-real-102");
  });

  it("GIVEN múltiples reportes de molestia en vivo THEN los ordena en el DOM por severidad clínica (EVA 9 'Alto' antes que EVA 5 'Moderado') sin literales de demo", () => {
    const molestiasVivas: Partial<DolorActivo>[] = [
      {
        id: "mol-viva-eva-5",
        alumno_id: "alumno-real-201",
        alumno_nombre: "Esteban Quiroga",
        zona_articular: "Codo derecho",
        ejercicio_nombre: "Press Francés",
        eva: 5,
        estado: "PENDIENTE",
      },
      {
        id: "mol-viva-eva-9",
        alumno_id: "alumno-real-202",
        alumno_nombre: "Carolina Méndez",
        zona_articular: "Columna lumbar",
        ejercicio_nombre: "Peso Muerto Convencional",
        eva: 9,
        estado: "PENDIENTE",
      },
    ];

    const { container, getAllByTestId } = render(
      <ParaRevisarHoy
        molestias={molestiasVivas as DolorActivo[]}
        cuotasVencidas={[]}
      />
    );

    assertNoDemoLiteralsInLiveMode(container);

    const filas = getAllByTestId("revisar-item-molestia");
    expect(filas).toHaveLength(2);
    expect(filas[0]!.textContent).toContain("Carolina Méndez");
    expect(filas[0]!.textContent).toContain("Alto");
    expect(filas[0]!.textContent).toContain("EVA 9/10");

    expect(filas[1]!.textContent).toContain("Esteban Quiroga");
    expect(filas[1]!.textContent).toContain("Moderado");
    expect(filas[1]!.textContent).toContain("EVA 5/10");
  });

  it("GIVEN 0 alertas o cuotas vencidas pendientes en vivo THEN monta el EmptyState con 'Nada urgente por hoy.' y no filtra alertas de DEMO_CRITICAL_ALERTS", () => {
    const { container, getByTestId } = render(
      <ParaRevisarHoy molestias={[]} cuotasVencidas={[]} />
    );

    assertNoDemoLiteralsInLiveMode(container);

    const empty = getByTestId("para-revisar-hoy-empty");
    expect(empty.textContent).toContain("Nada urgente por hoy.");
    expect(container.textContent).toContain("0 pendientes");
  });
});
