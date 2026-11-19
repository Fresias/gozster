import { describe, expect, it } from "vitest";
import {
  avisoMolestiaPara,
  ejercicioBloqueado,
  GRUPOS_POR_ZONA,
  nivelMolestia,
  TREN_INFERIOR,
  TREN_SUPERIOR,
  type MolestiaSesion,
  type ZonaArticular,
} from "@/lib/athlete/molestias";
import { useAthleteStore } from "@/store/use-athlete-store";

function crearMolestia(
  overrides: Partial<MolestiaSesion> = {},
): MolestiaSesion {
  const eva = overrides.eva ?? 5;
  const sintomas = overrides.sintomas ?? [];
  return {
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
    sesionId: overrides.sesionId ?? "22222222-2222-4222-8222-222222222222",
    ejercicioEnRutinaId: overrides.ejercicioEnRutinaId ?? "er-press-banca",
    ejercicioId: overrides.ejercicioId ?? "ej-press-banca",
    numeroSerie: overrides.numeroSerie ?? null,
    zona: overrides.zona ?? "HOMBRO",
    eva,
    sintomas,
    momento: overrides.momento ?? "EN_SERIE",
    notas: overrides.notas ?? null,
    nivel: overrides.nivel ?? nivelMolestia(eva, sintomas),
    reportadaAt: overrides.reportadaAt ?? "2026-11-18T12:00:00.000Z",
    envio: overrides.envio ?? "enviada",
  };
}

describe("BE-02 CP2 · Herencia por articulación y lógica pura (src/lib/athlete/molestias.ts)", () => {
  describe("nivelMolestia y GRUPOS_POR_ZONA", () => {
    it("mapea niveles correctamente según EVA y síntomas de alarma", () => {
      expect(nivelMolestia(1, [])).toBe("leve");
      expect(nivelMolestia(3, [])).toBe("leve");
      expect(nivelMolestia(4, [])).toBe("moderada");
      expect(nivelMolestia(6, [])).toBe("moderada");
      expect(nivelMolestia(7, [])).toBe("alta");
      expect(nivelMolestia(9, [])).toBe("alta");
      expect(nivelMolestia(10, [])).toBe("alarma");
      expect(nivelMolestia(2, ["Dolor punzante/súbito"])).toBe("alarma");
    });

    it("define los grupos canónicos por zona articular", () => {
      expect(GRUPOS_POR_ZONA.HOMBRO).toEqual(TREN_SUPERIOR);
      expect(GRUPOS_POR_ZONA.CODO).toEqual(TREN_SUPERIOR);
      expect(GRUPOS_POR_ZONA.CUELLO).toEqual(TREN_SUPERIOR);
      expect(GRUPOS_POR_ZONA.RODILLA).toEqual(TREN_INFERIOR);
      expect(GRUPOS_POR_ZONA.CADERA).toEqual(TREN_INFERIOR);
      expect(GRUPOS_POR_ZONA.TOBILLO).toEqual(TREN_INFERIOR);
      expect(GRUPOS_POR_ZONA.LUMBAR).toEqual([...TREN_SUPERIOR, ...TREN_INFERIOR, "Core"]);
      expect(GRUPOS_POR_ZONA.OTRO).toEqual([]);
    });
  });

  describe("10 casos de 03a §7", () => {
    it("1. Press banca (Pecho) HOMBRO -> Remo (Espalda) => heredado", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-press", zona: "HOMBRO" });
      const aviso = avisoMolestiaPara({ id: "er-remo", musculos_principales: ["Espalda"] }, [m]);
      expect(aviso).toEqual({ tipo: "heredado", origen: m });
    });

    it("2. Press banca (Pecho) HOMBRO -> Sentadilla (Piernas) => null", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-press", zona: "HOMBRO" });
      const aviso = avisoMolestiaPara({ id: "er-sentadilla", musculos_principales: ["Piernas"] }, [m]);
      expect(aviso).toBeNull();
    });

    it("3. Press banca (Pecho) HOMBRO -> Plancha (Core) => null", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-press", zona: "HOMBRO" });
      const aviso = avisoMolestiaPara({ id: "er-plancha", musculos_principales: ["Core"] }, [m]);
      expect(aviso).toBeNull();
    });

    it("4. Sentadilla (Piernas) LUMBAR -> Plancha (Core) => heredado", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-sentadilla", zona: "LUMBAR" });
      const aviso = avisoMolestiaPara({ id: "er-plancha", musculos_principales: ["Core"] }, [m]);
      expect(aviso).toEqual({ tipo: "heredado", origen: m });
    });

    it("5. Sentadilla (Piernas) LUMBAR -> Press militar (Hombros) => heredado", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-sentadilla", zona: "LUMBAR" });
      const aviso = avisoMolestiaPara({ id: "er-militar", musculos_principales: ["Hombros"] }, [m]);
      expect(aviso).toEqual({ tipo: "heredado", origen: m });
    });

    it("6. Sentadilla (Piernas) RODILLA -> Peso muerto rumano (Piernas) => heredado", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-sentadilla", zona: "RODILLA" });
      const aviso = avisoMolestiaPara({ id: "er-pmr", musculos_principales: ["Piernas"] }, [m]);
      expect(aviso).toEqual({ tipo: "heredado", origen: m });
    });

    it("7. Press banca (Pecho) OTRO -> Remo (Espalda) => null", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-press", zona: "OTRO" as ZonaArticular });
      const aviso = avisoMolestiaPara({ id: "er-remo", musculos_principales: ["Espalda"] }, [m]);
      expect(aviso).toBeNull();
    });

    it("8. Press banca (Pecho) HOMBRO -> Press banca (Pecho) => propio", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-press", zona: "HOMBRO" });
      const aviso = avisoMolestiaPara({ id: "er-press", musculos_principales: ["Pecho"] }, [m]);
      expect(aviso).toEqual({ tipo: "propio", molestia: m });
    });

    it("9. Press banca, EVA 8 HOMBRO -> Remo => heredado y ejercicioBloqueado(remo) === false", () => {
      const m = crearMolestia({
        ejercicioEnRutinaId: "er-press",
        zona: "HOMBRO",
        eva: 8,
      });
      const molestias = [m];
      const avisoRemo = avisoMolestiaPara({ id: "er-remo", musculos_principales: ["Espalda"] }, molestias);
      expect(avisoRemo).toEqual({ tipo: "heredado", origen: m });
      expect(ejercicioBloqueado("er-remo", molestias)).toBe(false);
      expect(ejercicioBloqueado("er-press", molestias)).toBe(true);
    });

    it("10. Sesión nueva => molestias = []", () => {
      useAthleteStore.getState().resetSessionToDefaults();
      expect(useAthleteStore.getState().currentSession.molestias ?? []).toEqual([]);
    });
  });

  describe("Reglas adicionales de herencia y bloqueo", () => {
    it("ignora tildes y mayúsculas en musculos_principales y no hereda sin grupo canónico", () => {
      const m = crearMolestia({ ejercicioEnRutinaId: "er-press", zona: "HOMBRO" });
      expect(
        avisoMolestiaPara({ id: "er-remo", musculos_principales: ["  ESPÁLDA "] }, [m]),
      ).toEqual({ tipo: "heredado", origen: m });

      expect(
        avisoMolestiaPara({ id: "er-sin-grupo", musculos_principales: [] }, [m]),
      ).toBeNull();
      expect(
        avisoMolestiaPara({ id: "er-null", musculos_principales: null }, [m]),
      ).toBeNull();
      expect(
        avisoMolestiaPara({ id: "er-no-canon", musculos_principales: ["Cardio"] }, [m]),
      ).toBeNull();
    });

    it("prioriza propia sobre heredada y elige la más reciente por reportadaAt", () => {
      const vieja = crearMolestia({
        id: "m-1",
        ejercicioEnRutinaId: "er-remo",
        zona: "HOMBRO",
        eva: 4,
        reportadaAt: "2026-11-18T10:00:00.000Z",
      });
      const nueva = crearMolestia({
        id: "m-2",
        ejercicioEnRutinaId: "er-press",
        zona: "CODO",
        eva: 6,
        reportadaAt: "2026-11-18T11:00:00.000Z",
      });

      const avisoPress = avisoMolestiaPara(
        { id: "er-press", musculos_principales: ["Pecho"] },
        [vieja, nueva],
      );
      expect(avisoPress).toEqual({ tipo: "propio", molestia: nueva });

      const avisoBiceps = avisoMolestiaPara(
        { id: "er-curl", musculos_principales: ["Brazos"] },
        [vieja, nueva],
      );
      expect(avisoBiceps).toEqual({ tipo: "heredado", origen: nueva });
    });

    it("ejercicioBloqueado solo bloquea en alta (7-9) o alarma, no en leve o moderada", () => {
      expect(
        ejercicioBloqueado("er-1", [crearMolestia({ ejercicioEnRutinaId: "er-1", eva: 3 })]),
      ).toBe(false);
      expect(
        ejercicioBloqueado("er-1", [crearMolestia({ ejercicioEnRutinaId: "er-1", eva: 6 })]),
      ).toBe(false);
      expect(
        ejercicioBloqueado("er-1", [crearMolestia({ ejercicioEnRutinaId: "er-1", eva: 7 })]),
      ).toBe(true);
      expect(
        ejercicioBloqueado("er-1", [
          crearMolestia({ ejercicioEnRutinaId: "er-1", eva: 2, sintomas: ["Dolor punzante/súbito"] }),
        ]),
      ).toBe(true);
    });
  });
});
