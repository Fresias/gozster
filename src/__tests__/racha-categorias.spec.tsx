import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { especificacionRacha, PALETAS_RACHA } from "@/lib/racha-flama";
import { RachaFlama } from "@/components/athlete/icons";
import { IndicadorRachaSemanas } from "@/components/athlete/inicio-mis-dias";
import { TarjetaLogroDiamante } from "@/components/athlete/tarjeta-logro-diamante";
import { MiProgreso } from "@/components/athlete/mi-progreso";
import {
  leerCantidadDiamantes,
  registrarLogroRachaIdempotente,
} from "@/lib/racha-logros";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { supabase } from "@/lib/supabase/client";

const ALUMNO_UUID = "11111111-1111-4111-8111-111111111111";

describe("GOZS-680 / #587 · Racha por categorías según racha-config-final-v3.json", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.setState({
      diamantesRacha: 0,
      ciclosLogroRegistrados: [],
    });
  });

  describe("Función pura especificacionRacha(semanas, diamantes)", () => {
    it("cubre los bordes 1, 4, 5, 8, 9, 24, 25, 28, 29, 48, 49, 52, 53, 56 y 104", () => {
      const s1 = especificacionRacha(1);
      expect(s1).toMatchObject({
        categoria: "hierro",
        nivel: 1,
        semanaCiclo: 1,
        porcentajeLlenado: 0,
        esChipDual: false,
      });
      expect(s1.barras).toMatchObject({
        activas: 1,
        posicion: 1,
        animada: false,
        bloqueConLatido: true,
        amplitud: 0,
        duracionSeg: null,
      });

      const s4 = especificacionRacha(4);
      expect(s4).toMatchObject({
        categoria: "hierro",
        nivel: 1,
        porcentajeLlenado: 80,
      });
      expect(s4.barras).toMatchObject({
        activas: 4,
        posicion: 4,
        animada: true,
        amplitud: 0.75,
        duracionSeg: 0.8,
      });

      const s5 = especificacionRacha(5);
      expect(s5).toMatchObject({
        categoria: "bronce",
        nivel: 2,
        porcentajeLlenado: 0,
      });
      expect(s5.barras).toMatchObject({
        activas: 1,
        posicion: 1,
        animada: false,
        bloqueConLatido: false,
        amplitud: 0,
        duracionSeg: null,
      });

      const s8 = especificacionRacha(8);
      expect(s8.categoria).toBe("bronce");
      expect(s8.barras).toMatchObject({
        activas: 4,
        posicion: 4,
        animada: false,
        bloqueConLatido: false,
        amplitud: 0,
        duracionSeg: null,
      });

      const s9 = especificacionRacha(9);
      expect(s9.categoria).toBe("bronce");
      expect(s9.barras).toMatchObject({
        activas: 1,
        posicion: 1,
        animada: false,
        bloqueConLatido: true,
        amplitud: 0,
        duracionSeg: null,
      });

      const s10 = especificacionRacha(10);
      expect(s10.barras).toMatchObject({
        activas: 2,
        posicion: 2,
        animada: true,
        amplitud: 0.32,
        duracionSeg: 2.93,
      });

      const s11 = especificacionRacha(11);
      expect(s11.barras).toMatchObject({
        activas: 3,
        posicion: 3,
        animada: true,
        amplitud: 0.54,
        duracionSeg: 1.87,
      });

      const s24 = especificacionRacha(24);
      expect(s24).toMatchObject({
        categoria: "bronce",
        nivel: 2,
        porcentajeLlenado: 80,
      });
      expect(s24.barras).toMatchObject({
        activas: 4,
        posicion: 4,
        animada: true,
        amplitud: 0.75,
        duracionSeg: 0.8,
      });

      const s25 = especificacionRacha(25);
      expect(s25).toMatchObject({
        categoria: "oro",
        nivel: 3,
        porcentajeLlenado: 0,
      });
      expect(s25.escalonOro).toEqual({
        escalon: 1,
        duracionFlickSeg: 2.3,
        amplitudFlick: 1,
      });
      expect(s25.barras).toMatchObject({
        activas: 1,
        posicion: 1,
        animada: false,
      });

      const s28 = especificacionRacha(28);
      expect(s28.escalonOro?.escalon).toBe(1);
      expect(s28.barras).toMatchObject({
        activas: 4,
        posicion: 4,
        animada: true,
        amplitud: 0.75,
        duracionSeg: 0.8,
      });

      const s29 = especificacionRacha(29);
      expect(s29.escalonOro?.escalon).toBe(2);

      const s48 = especificacionRacha(48);
      expect(s48).toMatchObject({
        categoria: "oro",
        nivel: 3,
        porcentajeLlenado: 80,
      });
      expect(s48.escalonOro).toEqual({
        escalon: 6,
        duracionFlickSeg: 1.45,
        amplitudFlick: 2,
      });

      const s49 = especificacionRacha(49);
      expect(s49).toMatchObject({
        categoria: "diamante",
        nivel: 4,
        porcentajeLlenado: 0,
      });
      expect(s49.barras.activas).toBe(0);
      expect(s49.chispas).toEqual({ cantidad: 2, intensidad: 0.5, frecuencia: 0.4 });

      const s50 = especificacionRacha(50);
      expect(s50.porcentajeLlenado).toBe(33);
      expect(s50.chispas).toEqual({ cantidad: 5, intensidad: 1.17, frecuencia: 0.93 });

      const s51 = especificacionRacha(51);
      expect(s51.porcentajeLlenado).toBe(67);
      expect(s51.chispas).toEqual({ cantidad: 9, intensidad: 1.83, frecuencia: 1.47 });

      const s52 = especificacionRacha(52);
      expect(s52).toMatchObject({
        categoria: "diamante",
        nivel: 4,
        porcentajeLlenado: 100,
        esChipDual: false,
      });
      expect(s52.chispas).toEqual({ cantidad: 12, intensidad: 2.5, frecuencia: 2 });

      const s53 = especificacionRacha(53);
      expect(s53).toMatchObject({
        categoria: "hierro",
        nivel: 1,
        semanaCiclo: 1,
        cicloActual: 2,
        porcentajeLlenado: 0,
        esChipDual: true,
        diamantes: 1,
      });

      const s56 = especificacionRacha(56, 1);
      expect(s56).toMatchObject({
        categoria: "hierro",
        semanaCiclo: 4,
        porcentajeLlenado: 80,
        esChipDual: true,
        diamantes: 1,
      });

      const s104 = especificacionRacha(104, 1);
      expect(s104).toMatchObject({
        categoria: "diamante",
        semanaCiclo: 52,
        cicloActual: 2,
        porcentajeLlenado: 100,
        esChipDual: true,
        diamantes: 1,
      });

      const s105 = especificacionRacha(105, 0);
      expect(s105).toMatchObject({
        categoria: "hierro",
        semanaCiclo: 1,
        cicloActual: 3,
        esChipDual: true,
        diamantes: 2,
      });
    });

    it("expone las paletas claro/oscuro exactas del JSON", () => {
      expect(PALETAS_RACHA.hierro.claro.ic).toBe("#18181B");
      expect(PALETAS_RACHA.hierro.oscuro.ic).toBe("#FAFAFA");
      expect(PALETAS_RACHA.bronce.claro.ic).toBe("#7A6338");
      expect(PALETAS_RACHA.bronce.oscuro.ic).toBe("#C4A66B");
      expect(PALETAS_RACHA.oro.claro.ic).toBe("#BE8700");
      expect(PALETAS_RACHA.oro.oscuro.ic).toBe("#FACC15");
      expect(PALETAS_RACHA.diamante.claro.ic).toBe("#0369A1");
      expect(PALETAS_RACHA.diamante.oscuro.ic).toBe("#38BDF8");
      expect(PALETAS_RACHA.diamante.claro.tongue).toBe("#0284C7");
    });
  });

  describe("SVG RachaFlama (latido geométrico, Diamante 3 llamas y reduced-motion)", () => {
    it("barrita 1 nunca tiene <animate>; barrita 4 anima x/y/width/height/opacity a 0.80s sin transform:scale", () => {
      for (const w of [1, 5, 9, 25]) {
        const htmlBar1 = renderToStaticMarkup(<RachaFlama semanas={w} />);
        expect(htmlBar1, `Semana ${w} (barrita 1) no debe animar`).not.toContain("<animate");
      }

      const htmlBar4 = renderToStaticMarkup(<RachaFlama semanas={4} />);
      expect(htmlBar4).toContain('rx="1.2"');
      expect(htmlBar4).toContain('attributeName="x"');
      expect(htmlBar4).toContain('attributeName="y"');
      expect(htmlBar4).toContain('attributeName="width"');
      expect(htmlBar4).toContain('attributeName="height"');
      expect(htmlBar4).toContain('attributeName="opacity"');
      expect(htmlBar4).toContain('dur="0.80s"');
      expect(htmlBar4).toContain('values="0.65;1;0.65"');
      // Las barritas geométricas jamás usan transform: scale
      expect(htmlBar4).not.toMatch(/<rect[^>]*transform="scale/);

      // Bronce 5–8 sin latido en ninguna barrita
      for (const w of [5, 6, 7, 8]) {
        expect(renderToStaticMarkup(<RachaFlama semanas={w} />)).not.toContain("<animate");
      }
      // Bronce 10 (pos 2) late a 2.93s
      expect(renderToStaticMarkup(<RachaFlama semanas={10} />)).toContain('dur="2.93s"');
    });

    it("Diamante tiene 3 llamas independientes (principal + izq + der) y chispas 2/5/9/12 sin JS por frame", () => {
      const counts = [
        [49, 2],
        [50, 5],
        [51, 9],
        [52, 12],
      ] as const;

      for (const [sem, expectedCount] of counts) {
        const html = renderToStaticMarkup(<RachaFlama semanas={sem} />);
        expect(html).toContain('data-flame-part="left"');
        expect(html).toContain('data-flame-part="right"');
        expect(html).toContain('data-flame-part="main"');
        expect(html).toContain('dur="1.28s"');
        expect(html).toContain('dur="1.64s"');
        expect(html).toContain('dur="1.92s"');
        expect(html).toContain(`data-sparks="${expectedCount}"`);
        const sparkCircles = html.match(/class="a-racha-spark"/g) ?? [];
        expect(sparkCircles).toHaveLength(expectedCount);
      }
    });

    it("prefers-reduced-motion deja todo estático (sin <animate> ni clases animadas)", () => {
      for (const sem of [4, 12, 40, 52]) {
        const html = renderToStaticMarkup(<RachaFlama semanas={sem} reducedMotion={true} />);
        expect(html).not.toContain("<animate");
        expect(html).not.toContain("a-racha-flick");
        expect(html).not.toContain("a-racha-wave");
        expect(html).not.toContain("a-racha-spark\"");
      }
    });
  });

  describe("IndicadorRachaSemanas (chips, data-* y chip dual 53+) y TarjetaLogroDiamante", () => {
    it("renderiza atributos data-*, aria-label y chip dual en semana 53+", () => {
      const checks = [
        { sem: 4, cat: "hierro", level: "1", pct: "80", bars: "4" },
        { sem: 5, cat: "bronce", level: "2", pct: "0", bars: "1" },
        { sem: 24, cat: "bronce", level: "2", pct: "80", bars: "4" },
        { sem: 25, cat: "oro", level: "3", pct: "0", bars: "1" },
        { sem: 48, cat: "oro", level: "3", pct: "80", bars: "4" },
        { sem: 49, cat: "diamante", level: "4", pct: "0", bars: "0" },
        { sem: 52, cat: "diamante", level: "4", pct: "100", bars: "0" },
      ];

      for (const c of checks) {
        const html = renderToStaticMarkup(<IndicadorRachaSemanas semanas={c.sem} />);
        expect(html).toContain(`data-category="${c.cat}"`);
        expect(html).toContain(`data-level="${c.level}"`);
        expect(html).toContain(`data-fill-pct="${c.pct}"`);
        expect(html).toContain(`data-bars="${c.bars}"`);
        expect(html).toContain(`${c.sem} SEM`);
        expect(html).not.toContain('data-dual="true"');
      }

      const html53 = renderToStaticMarkup(<IndicadorRachaSemanas semanas={53} diamantes={1} />);
      expect(html53).toContain('data-dual="true"');
      expect(html53).toContain('data-testid="racha-diamante-chip"');
      expect(html53).toContain("×1");
      expect(html53).toContain('data-category="hierro"');
      expect(html53).toContain('data-cycle-week="1"');
      expect(html53).toContain("1 SEM");
      expect(html53).toContain("Categoría Hierro");
      expect(html53).toContain("Llama Diamante ×1");
    });

    it("TarjetaLogroDiamante y MiProgreso muestran 'Llama Diamante ×N' cuando hay logros", () => {
      expect(renderToStaticMarkup(<TarjetaLogroDiamante diamantes={0} />)).toBe("");

      const cardHtml = renderToStaticMarkup(
        <TarjetaLogroDiamante diamantes={2} semanas={54} />,
      );
      expect(cardHtml).toContain("Llama Diamante ×2");
      expect(cardHtml).toContain('data-testid="tarjeta-llama-diamante"');
      expect(cardHtml).toContain("Racha en curso · Ciclo 2");
      expect(cardHtml).toContain("2 SEM");

      const progresoHtml = renderToStaticMarkup(
        <MiProgreso
          estado="listo"
          vista="SIMPLE"
          data={{ sesiones_mes: 4, sesiones_mes_anterior: 3, volumen_mes_kg: 1000, ejercicios: [] }}
          diamantesRacha={1}
          rachaSemanas={53}
        />,
      );
      expect(progresoHtml).toContain("Llama Diamante ×1");
    });
  });

  describe("Contrato logros_racha (fallback 0 e idempotencia offline-first)", () => {
    it("leerCantidadDiamantes devuelve 0 como fallback si la tabla aún no existe o falla", async () => {
      const fromSpy = vi.spyOn(supabase, "from").mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ count: null, error: { code: "42P01", message: "relation does not exist" } }),
          }),
        }),
      }) as any);

      try {
        const count = await leerCantidadDiamantes(ALUMNO_UUID);
        expect(count).toBe(0);
      } finally {
        fromSpy.mockRestore();
      }
    });

    it("registrarLogroRachaIdempotente hace upsert con ignoreDuplicates y la cola offline sincroniza sin duplicar", async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      const fromSpy = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "logros_racha") {
          return { upsert: upsertMock } as any;
        }
        return {} as any;
      });

      try {
        const res = await registrarLogroRachaIdempotente({
          alumnoId: ALUMNO_UUID,
          numeroCiclo: 1,
        });
        expect(res.ok).toBe(true);
        expect(upsertMock).toHaveBeenCalledWith(
          { alumno_id: ALUMNO_UUID, numero_ciclo: 1, tipo: "diamante" },
          { onConflict: "alumno_id,numero_ciclo,tipo", ignoreDuplicates: true },
        );

        // Offline al completar semana 52 -> encola una sola vez y sincroniza al reconectar
        useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [], syncError: null });
        await useAthleteStore.getState().verificarYRegistrarLogroDiamante(52, ALUMNO_UUID);
        await useAthleteStore.getState().verificarYRegistrarLogroDiamante(52, ALUMNO_UUID);

        expect(useAthleteStore.getState().diamantesRacha).toBe(1);
        expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);
        expect(useOfflineQueueStore.getState().pendingEvents[0]?.action).toBe("REGISTRAR_LOGRO_RACHA");

        useOfflineQueueStore.getState().setOnlineStatus(true);
        await useOfflineQueueStore.getState().flushQueue();
        expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
        expect(useOfflineQueueStore.getState().syncError).toBeNull();
      } finally {
        fromSpy.mockRestore();
      }
    });
  });
});
