import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useAthleteStore } from "@/store/use-athlete-store";
import { AvisoMolestia } from "@/components/athlete/aviso-molestia";
import {
  avisoMolestiaPara,
  ejercicioBloqueado,
  nivelMolestia,
  type MolestiaSesion,
} from "@/lib/athlete/molestias";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

function crearMolestiaBase(overrides: Partial<MolestiaSesion> = {}): MolestiaSesion {
  const eva = overrides.eva ?? 5;
  const sintomas = overrides.sintomas ?? [];
  return {
    id: "mol-test-1",
    sesionId: "ses-test-1",
    ejercicioEnRutinaId: "ej-bp",
    ejercicioId: "cat-bp",
    numeroSerie: 1,
    zona: "HOMBRO",
    eva,
    sintomas,
    momento: "EN_SERIE",
    notas: null,
    nivel: nivelMolestia(eva, sintomas),
    reportadaAt: "2026-11-19T12:00:00.000Z",
    envio: "pendiente",
    ...overrides,
  };
}

describe("FE App: Avisos de molestia por nivel y heredados v7 (FE-08)", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("1. AvisoMolestia por nivel (1-3, 4-6, 7-9, 10/alarma) y variante heredada", () => {
    it("Rango 1-3 (leve): genera aviso neutro role='status' sin bloquear el ejercicio", () => {
      for (const eva of [1, 2, 3]) {
        const m = crearMolestiaBase({ eva, zona: "HOMBRO" });
        const aviso = avisoMolestiaPara({ id: "ej-bp", musculos_principales: ["Pecho"] }, [m]);
        const html = renderToStaticMarkup(React.createElement(AvisoMolestia, { aviso }));

        expect(m.nivel).toBe("leve");
        expect(ejercicioBloqueado("ej-bp", [m])).toBe(false);
        expect(html).toContain('data-testid="pain-banner-range-1-3"');
        expect(html).toContain('role="status"');
        expect(html).toContain(`Molestia leve · Hombro · ${eva}/10`);
        expect(html).toContain("Avisamos a tu coach. Seguí con precaución según cómo te sientas.");
      }
    });

    it("Rango 4-6 (moderada): genera aviso de advertencia role='status' que sugiere bajar peso", () => {
      for (const eva of [4, 5, 6]) {
        const m = crearMolestiaBase({ eva, zona: "HOMBRO" });
        const aviso = avisoMolestiaPara({ id: "ej-bp", musculos_principales: ["Pecho"] }, [m]);
        const html = renderToStaticMarkup(React.createElement(AvisoMolestia, { aviso }));

        expect(m.nivel).toBe("moderada");
        expect(ejercicioBloqueado("ej-bp", [m])).toBe(false);
        expect(html).toContain('data-testid="pain-banner-range-4-6"');
        expect(html).toContain('role="status"');
        expect(html).toContain("a-pain a-mod");
        expect(html).toContain(`Molestia moderada · Hombro · ${eva}/10`);
        expect(html).toContain("Avisamos a tu coach. Si sigue, bajá el peso en las próximas series.");
      }
    });

    it("Rango 7-9 (alta): genera aviso rojo role='alert' y bloquea el registro del ejercicio", () => {
      for (const eva of [7, 8, 9]) {
        const m = crearMolestiaBase({ eva, zona: "HOMBRO" });
        const aviso = avisoMolestiaPara({ id: "ej-bp", musculos_principales: ["Pecho"] }, [m]);
        const html = renderToStaticMarkup(React.createElement(AvisoMolestia, { aviso }));

        expect(m.nivel).toBe("alta");
        expect(ejercicioBloqueado("ej-bp", [m])).toBe(true);
        expect(html).toContain('data-testid="pain-banner-range-7-9"');
        expect(html).toContain('role="alert"');
        expect(html).toContain("a-pain a-alta");
        expect(html).toContain("Suspendé este ejercicio");
        expect(html).toContain(
          `Hombro · ${eva}/10. Seguí con el resto solo si no te molesta. Tu coach ya fue avisado.`,
        );
      }
    });

    it("Rango 10 o síntoma de alarma: genera 'Frená por hoy' role='alert' con botón 'Terminar sesión'", () => {
      const m = crearMolestiaBase({ eva: 10, zona: "LUMBAR" });
      const aviso = avisoMolestiaPara({ id: "ej-bp", musculos_principales: ["Pecho"] }, [m]);
      const html = renderToStaticMarkup(
        React.createElement(AvisoMolestia, { aviso, onTerminarSesion: () => {} }),
      );

      expect(m.nivel).toBe("alarma");
      expect(ejercicioBloqueado("ej-bp", [m])).toBe(true);
      expect(html).toContain('data-testid="live-workout-stop-protocol-banner"');
      expect(html).toContain('role="alert"');
      expect(html).toContain("a-pain a-alarm");
      expect(html).toContain("Frená por hoy");
      expect(html).toContain("Espalda baja / Lumbar · 10/10");
      expect(html).toContain("Terminar sesión");
    });

    it("Molestia heredada: muestra formato chico role='status' y nunca bloquea", () => {
      const m = crearMolestiaBase({ eva: 8, zona: "HOMBRO", ejercicioEnRutinaId: "ej-bp" });
      const avisoRemo = avisoMolestiaPara({ id: "ej-rm", musculos_principales: ["Espalda"] }, [m]);
      const htmlRemo = renderToStaticMarkup(
        React.createElement(AvisoMolestia, { aviso: avisoRemo }),
      );

      expect(avisoRemo?.tipo).toBe("heredado");
      expect(ejercicioBloqueado("ej-rm", [m])).toBe(false);
      expect(htmlRemo).toContain('data-testid="molestia-heredada"');
      expect(htmlRemo).toContain('role="status"');
      expect(htmlRemo).toContain("a-pain-mini");
      expect(htmlRemo).toContain("Molestia reportada");
      expect(htmlRemo).not.toContain("Suspendé este ejercicio");
    });
  });

  describe("2. Integración con useAthleteStore y limpieza entre sesiones", () => {
    it("WHEN envía reporte de dolor 1-3 THEN guarda molestia leve en currentSession.molestias", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-1",
        ejercicioId: "ej-curl-biceps",
        numeroSerie: 1,
        zona: "CODO",
        eva: 2,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Ligera tensión en tendón",
      });

      const molestias = useAthleteStore.getState().currentSession.molestias ?? [];
      expect(molestias).toHaveLength(1);
      expect(molestias[0]?.id).toBe(molestia.id);
      expect(molestias[0]?.nivel).toBe("leve");
    });

    it("WHEN envía reporte de dolor 4-6 THEN guarda molestia moderada", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-2",
        ejercicioId: "ej-press-militar",
        numeroSerie: 2,
        zona: "HOMBRO",
        eva: 5,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Molestia en el deltoides al empujar",
      });

      expect(molestia.nivel).toBe("moderada");
      expect(ejercicioBloqueado("ej-2", useAthleteStore.getState().currentSession.molestias ?? [])).toBe(false);
    });

    it("WHEN envía reporte de dolor 7-9 THEN guarda molestia alta y bloquea el ejercicio", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-3",
        ejercicioId: "ej-sentadilla-bulgara",
        numeroSerie: 3,
        zona: "RODILLA",
        eva: 8,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor punzante en rótula",
      });

      expect(molestia.nivel).toBe("alta");
      expect(ejercicioBloqueado("ej-3", useAthleteStore.getState().currentSession.molestias ?? [])).toBe(true);
    });

    it("WHEN envía reporte de dolor 10 THEN guarda alarma y activa stopProtocolActive", async () => {
      const molestia = await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-4",
        ejercicioId: "ej-peso-muerto-rumano",
        numeroSerie: 1,
        zona: "LUMBAR",
        eva: 10,
        momento: "EN_SERIE",
        sintomas: [],
        notas: "Dolor agudo insoportable",
      });

      expect(molestia.nivel).toBe("alarma");
      expect(useAthleteStore.getState().stopProtocolActive).toBe(true);
    });

    it("limpia currentSession.molestias al terminar la sesión (marcarDiaCompletado) y al reiniciar", async () => {
      await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-5",
        ejercicioId: "ej-cadera",
        zona: "CADERA",
        eva: 5,
        momento: "CALENTAMIENTO",
        sintomas: [],
        notas: "",
      });
      expect(useAthleteStore.getState().currentSession.molestias).toHaveLength(1);

      useAthleteStore.getState().marcarDiaCompletado("dia-1");
      expect(useAthleteStore.getState().currentSession.molestias).toEqual([]);

      await useAthleteStore.getState().reportarMolestia({
        ejercicioEnRutinaId: "ej-6",
        ejercicioId: "ej-cadera",
        zona: "CADERA",
        eva: 3,
        momento: "CALENTAMIENTO",
        sintomas: [],
        notas: "",
      });
      useAthleteStore.getState().resetSessionToDefaults();
      expect(useAthleteStore.getState().currentSession.molestias).toEqual([]);
    });
  });

  describe("3. Código Fuente y Contratos UI v7", () => {
    const ejercicioActivoCode = readSource("../components/athlete/ejercicio-activo.tsx");
    const painModalCode = readSource("../components/athlete/pain-report-modal.tsx");
    const avisoMolestiaCode = readSource("../components/athlete/aviso-molestia.tsx");
    const rutinaCode = readSource("../components/athlete/rutina-del-dia.tsx");

    it("EjercicioActivo renderiza AvisoMolestia con avisoMolestiaPara y bloquea si ejercicioEstaBloqueado", () => {
      expect(ejercicioActivoCode).toContain("<AvisoMolestia");
      expect(ejercicioActivoCode).toContain("avisoMolestia");
      expect(ejercicioActivoCode).toContain("disabled={ejercicioEstaBloqueado}");
      expect(ejercicioActivoCode).toContain("!ejercicioEstaBloqueado");
      expect(ejercicioActivoCode).toContain("reportarMolestia");
    });

    it("RutinaDelDia muestra chip MOLESTIA solo en el ejercicio reportado", () => {
      expect(rutinaCode).toContain("molestias.some((m) => m.ejercicioEnRutinaId === ej.id)");
      expect(rutinaCode).toContain("data-testid={`molestia-chip-${ej.id}`}");
    });

    it("PainReportModal usa hoja v7 con focus trap, Escape, captura segura en StrictMode y retorno de foco al disparador", () => {
      expect(painModalCode).toContain('className="a-sheet-wrap justify-center"');
      expect(painModalCode).toContain('e.key === "Escape"');
      expect(painModalCode).toContain('e.key !== "Tab"');
      expect(painModalCode).toContain("!sheetRef.current?.contains(active)");
      expect(painModalCode).toContain("returnTarget.isConnected");
      expect(painModalCode).toContain("returnTarget.focus()");
      expect(painModalCode).toContain('"pain-modal-cartel-1-3"');
      expect(painModalCode).toContain('"pain-modal-cartel-4-6"');
      expect(painModalCode).toContain('"pain-modal-cartel-7-9"');
      expect(painModalCode).toContain('"protocolo-freno-alert"');
      expect(painModalCode).toContain("Avisar a mi coach");
    });

    it("AvisoMolestia define los 5 estados y roles accesibles (status vs alert)", () => {
      expect(avisoMolestiaCode).toContain('data-testid="pain-banner-range-1-3"');
      expect(avisoMolestiaCode).toContain('data-testid="pain-banner-range-4-6"');
      expect(avisoMolestiaCode).toContain('data-testid="pain-banner-range-7-9"');
      expect(avisoMolestiaCode).toContain('data-testid="live-workout-stop-protocol-banner"');
      expect(avisoMolestiaCode).toContain('data-testid="molestia-heredada"');
    });
  });
});
