import { describe, expect, it } from "vitest";
import { ordenarAlertasPorPrioridad } from "@/components/coach/critical-alerts-data";

describe("GOZS-243: alertas del dashboard ordenadas por prioridad", () => {
  it("rojas (crítica / dolor >= 7) primero, luego amarillas y luego el resto, estable dentro de cada nivel", () => {
    const input = [
      { id: "baja", severidad: "BAJA" as const },
      { id: "media", severidad: "MEDIA" as const },
      { id: "alarma", severidad: "MEDIA" as const, esSintomaAlarma: true },
      { id: "critica", severidad: "CRITICA" as const },
      { id: "alta", severidad: "ALTA" as const },
    ];
    expect(ordenarAlertasPorPrioridad(input).map((a) => a.id)).toEqual([
      "alarma", "critica", "media", "alta", "baja",
    ]);
  });
});
