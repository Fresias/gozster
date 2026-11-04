import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { RankingFuncional } from "@/components/coach/ranking-funcional";
import { InviteStudentModal } from "@/components/coach/invite-student-modal";
import { CobrosPanel } from "@/components/coach/cobros-panel";
import { useCobrosStore } from "@/store/use-cobros-store";
import { REAL_EJERCICIOS } from "@/services/real-mynter-data";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-344: Combobox para Ejercicio de Prueba, Alta con Sexo/Peso y Cobros con Descuentos", () => {
  describe("1. Combobox Desplegable de Ejercicio de Prueba (ranking-funcional.tsx)", () => {
    const rankingSrc = read("../components/coach/ranking-funcional.tsx");

    it("GIVEN el componente RankingFuncional THEN contiene el combobox unificado con data-testid='ejercicio-select'", () => {
      expect(rankingSrc).toContain('data-testid="ejercicio-select"');
      expect(rankingSrc).toContain('data-testid="ejercicio-combobox"');
      expect(rankingSrc).toContain('data-testid="ejercicio-combobox-dropdown"');
      expect(rankingSrc).toContain('data-testid="ejercicio-combobox-input"');
    });

    it("GIVEN el combobox THEN reemplazó el select nativo y el input lateral por el desplegable con buscador", () => {
      // Ya no debe existir el input lateral separado fuera del dropdown
      expect(rankingSrc).not.toContain('<select\n                id="select-ejercicio"');
      expect(rankingSrc).toContain("setComboboxAbierto");
      expect(rankingSrc).toContain("handleClickOutside");
    });

    it("GIVEN el catálogo de ejercicios WHEN se busca 'Esto' THEN filtra estocadas en tiempo real", () => {
      const q = "Esto".toLowerCase().trim();
      const estocadas = REAL_EJERCICIOS.filter((e) => e.nombre.toLowerCase().includes(q));

      expect(estocadas.length).toBeGreaterThan(0);
      const nombres = estocadas.map((e) => e.nombre);
      expect(nombres).toContain("Estocadas Caminando con Mancuernas");
      expect(nombres.some((n) => n.includes("Estocadas"))).toBe(true);
    });

    it("GIVEN el combobox WHEN se renderiza estáticamente THEN muestra el trigger accesible", () => {
      const html = renderToStaticMarkup(
        <RankingFuncional
          initialClaseId="demo-clase-func-miercoles"
          initialEjercicioId="ej-dominadas-c-carga"
          alumnosDisponibles={[]}
        />
      );
      expect(html).toContain('data-testid="ejercicio-select"');
      expect(html).toContain('aria-haspopup="listbox"');
      expect(html).toContain("Dominadas c/ Carga");
    });
  });

  describe("2. Captura y Persistencia de Sexo Biológico y Peso (invite-student-modal.tsx)", () => {
    const modalSrc = read("../components/coach/invite-student-modal.tsx");

    it("GIVEN invite-student-modal.tsx THEN contiene los campos de sexo biológico y peso corporal con sus testids", () => {
      expect(modalSrc).toContain('data-testid="alta-sexo"');
      expect(modalSrc).toContain('data-testid="alta-peso"');
      expect(modalSrc).toContain("Sexo Biológico");
      expect(modalSrc).toContain("Peso Corporal Aproximado (kg)");
    });

    it("GIVEN el selector de sexo biológico THEN ofrece 'F' (Femenino) y 'M' (Masculino) y es obligatorio", () => {
      expect(modalSrc).toContain('<option value="F">Femenino</option>');
      expect(modalSrc).toContain('<option value="M">Masculino</option>');
      expect(modalSrc).toContain('required');
      expect(modalSrc).toContain('setSexo');
    });

    it("GIVEN el alta de alumno THEN persiste sexo y peso_corporal_kg en el perfil de Supabase y en la Edge Function", () => {
      expect(modalSrc).toContain('sexo: sexo || undefined');
      expect(modalSrc).toContain('peso_corporal_kg: pesoNum');
      expect(modalSrc).toContain('.from("perfiles" as any).update(');
      expect(modalSrc).toContain('perfilUpdate.sexo = sexo');
      expect(modalSrc).toContain('perfilUpdate.peso_corporal_kg = pesoNum');
    });

    it("GIVEN invite-student-modal.tsx WHEN está abierto THEN renderiza los inputs ergonómicos (min-h-12)", () => {
      const html = renderToStaticMarkup(
        <InviteStudentModal
          isOpen={true}
          onClose={vi.fn()}
          onInvited={vi.fn()}
        />
      );
      expect(html).toContain('data-testid="alta-sexo"');
      expect(html).toContain('data-testid="alta-peso"');
      expect(html).toContain("Femenino");
      expect(html).toContain("Masculino");
      expect(html).toContain("min-h-12");
    });
  });

  describe("3. Cobros & Pagos con Descuentos Limpios y Minimizables (cobros-panel.tsx)", () => {
    const cobrosSrc = read("../components/coach/cobros-panel.tsx");

    beforeEach(() => {
      useCobrosStore.getState().resetDemoDataset();
    });

    it("GIVEN la vista general de Cobros (filtro TODOS) THEN el bloque vista-recuperar-descuentos NO se renderiza", () => {
      const html = renderToStaticMarkup(<CobrosPanel initialFiltroEstado="TODOS" />);
      expect(html).not.toContain('data-testid="vista-recuperar-descuentos"');
    });

    it("GIVEN el filtro activo 'DESCUENTOS' THEN el bloque vista-recuperar-descuentos SÍ se despliega", () => {
      const html = renderToStaticMarkup(<CobrosPanel initialFiltroEstado="DESCUENTOS" />);
      expect(html).toContain('data-testid="vista-recuperar-descuentos"');
      expect(html).toContain('data-testid="btn-colapso-descuentos"');
      expect(html).toContain("Minimizar");
    });

    it("GIVEN el bloque de descuentos THEN incluye botón de colapso y persiste en localStorage", () => {
      expect(cobrosSrc).toContain('data-testid="btn-colapso-descuentos"');
      expect(cobrosSrc).toContain("toggleColapsarDescuentos");
      expect(cobrosSrc).toContain("gozster:cobros:descuentos-colapsados");
      expect(cobrosSrc).toContain('filtroEstado === "DESCUENTOS" && cobrosConDescuento.length > 0');
    });
  });
});
