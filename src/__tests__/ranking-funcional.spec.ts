import { beforeEach, describe, expect, it } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  calcularRankingRelativo,
  useRankingStore,
  type ResultadoRanking,
} from "@/store/use-ranking-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { RankingFuncional } from "@/components/coach/ranking-funcional";
import type { Perfil, RankingPR } from "@/types/database.types";

describe("FE Studio: Ranking Funcional Relativo al Peso Corporal (GOZS-262 / GH #262)", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useClasesStore.getState().resetDemoDataset();
  });

  const claseIdMock = "clase-funcional-test-01";
  const ejercicioIdMock = "ej-dominadas-lastre";

  const alumnosMock: Perfil[] = [
    {
      id: "alumno-h1-lucas",
      nombre_completo: "Lucas Giménez",
      email: "lucas@test.com",
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      peso_corporal_kg: 80.0,
      sexo: "M",
      profesor_asignado_id: null,
      fecha_baja: null,
      fecha_vencimiento_cuota: null,
      ultimo_entreno_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "alumno-h2-mateo",
      nombre_completo: "Mateo Rossi",
      email: "mateo@test.com",
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      peso_corporal_kg: 100.0,
      sexo: "M",
      profesor_asignado_id: null,
      fecha_baja: null,
      fecha_vencimiento_cuota: null,
      ultimo_entreno_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "alumno-m1-camila",
      nombre_completo: "Camila Navarro",
      email: "camila@test.com",
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      peso_corporal_kg: 50.0,
      sexo: "F",
      profesor_asignado_id: null,
      fecha_baja: null,
      fecha_vencimiento_cuota: null,
      ultimo_entreno_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "alumno-m2-sofia",
      nombre_completo: "Sofía Albarracín",
      email: "sofia@test.com",
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      peso_corporal_kg: 60.0,
      sexo: "F",
      profesor_asignado_id: null,
      fecha_baja: null,
      fecha_vencimiento_cuota: null,
      ultimo_entreno_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  describe("Criterio de Aceptación Gherkin principal", () => {
    it("GIVEN alumnos con peso y sexo, WHEN el coach registra PRs, THEN el ranking se ordena por PR/peso corporal en tablas separadas por sexo", () => {
      // Lucas: 40 kg en 80 kg de peso -> ratio 0.50
      // Mateo: 45 kg en 100 kg de peso -> ratio 0.45 (aunque levantó más peso absoluto, su ratio es menor)
      // Camila: 20 kg en 50 kg de peso -> ratio 0.40
      // Sofía: 27 kg en 60 kg de peso -> ratio 0.45
      const prsMock: RankingPR[] = [
        {
          id: "pr-1",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-h1-lucas",
          peso_kg: 40,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "coach-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-2",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-h2-mateo",
          peso_kg: 45,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "coach-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-3",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-m1-camila",
          peso_kg: 20,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "coach-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-4",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-m2-sofia",
          peso_kg: 27,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "coach-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const resultado: ResultadoRanking = calcularRankingRelativo({
        prs: prsMock,
        claseId: claseIdMock,
        ejercicioId: ejercicioIdMock,
        alumnos: alumnosMock,
      });

      // 1. Tablas separadas por sexo
      expect(resultado.hombres.length).toBe(2);
      expect(resultado.mujeres.length).toBe(2);
      expect(resultado.sinClasificar.length).toBe(0);

      // 2. Orden en Hombres: Lucas (ratio 0.50) debe estar primero que Mateo (ratio 0.45)
      expect(resultado.hombres[0]!.alumno_id).toBe("alumno-h1-lucas");
      expect(resultado.hombres[0]!.ratio).toBe(0.5);
      expect(resultado.hombres[0]!.posicion).toBe(1);

      expect(resultado.hombres[1]!.alumno_id).toBe("alumno-h2-mateo");
      expect(resultado.hombres[1]!.ratio).toBe(0.45);
      expect(resultado.hombres[1]!.posicion).toBe(2);

      // 3. Orden en Mujeres: Sofía (ratio 0.45) debe estar primera que Camila (ratio 0.40)
      expect(resultado.mujeres[0]!.alumno_id).toBe("alumno-m2-sofia");
      expect(resultado.mujeres[0]!.ratio).toBe(0.45);
      expect(resultado.mujeres[0]!.posicion).toBe(1);

      expect(resultado.mujeres[1]!.alumno_id).toBe("alumno-m1-camila");
      expect(resultado.mujeres[1]!.ratio).toBe(0.4);
      expect(resultado.mujeres[1]!.posicion).toBe(2);
    });
  });

  describe("Casos de borde: Alumnos sin peso corporal o sin sexo", () => {
    it("GIVEN alumnos sin peso corporal o sin sexo, WHEN se calcula el ranking, THEN quedan excluidos del ranking relativo con su motivo correspondiente", () => {
      const alumnosConFaltantes: Perfil[] = [
        {
          ...alumnosMock[0]!,
          id: "alumno-sin-peso",
          nombre_completo: "Alumno Sin Peso",
          peso_corporal_kg: null,
          sexo: "M",
        },
        {
          ...alumnosMock[1]!,
          id: "alumno-sin-sexo",
          nombre_completo: "Alumno Sin Sexo",
          peso_corporal_kg: 75.0,
          sexo: null,
        },
        {
          ...alumnosMock[2]!,
          id: "alumno-sin-ambos",
          nombre_completo: "Alumno Sin Ambos",
          peso_corporal_kg: null,
          sexo: null,
        },
        alumnosMock[3]!, // Sofía con datos completos (60kg, F)
      ];

      const prs: RankingPR[] = [
        {
          id: "pr-sin-peso",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-sin-peso",
          peso_kg: 30,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-sin-sexo",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-sin-sexo",
          peso_kg: 40,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-sin-ambos",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-sin-ambos",
          peso_kg: 25,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-sofia",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-m2-sofia",
          peso_kg: 30,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const resultado = calcularRankingRelativo({
        prs,
        claseId: claseIdMock,
        ejercicioId: ejercicioIdMock,
        alumnos: alumnosConFaltantes,
      });

      // Sofía clasifica normalmente
      expect(resultado.mujeres.length).toBe(1);
      expect(resultado.mujeres[0]!.alumno_id).toBe("alumno-m2-sofia");
      expect(resultado.mujeres[0]!.ratio).toBe(0.5);

      // Los 3 incompletos van a sinClasificar
      expect(resultado.sinClasificar.length).toBe(3);

      const sinPeso = resultado.sinClasificar.find((x) => x.alumno_id === "alumno-sin-peso");
      expect(sinPeso).toBeDefined();
      expect(sinPeso?.motivo_exclusion).toBe("SIN_PESO_CORPORAL");

      const sinSexo = resultado.sinClasificar.find((x) => x.alumno_id === "alumno-sin-sexo");
      expect(sinSexo).toBeDefined();
      expect(sinSexo?.motivo_exclusion).toBe("SIN_SEXO");

      const sinAmbos = resultado.sinClasificar.find((x) => x.alumno_id === "alumno-sin-ambos");
      expect(sinAmbos).toBeDefined();
      expect(sinAmbos?.motivo_exclusion).toBe("SIN_PESO_Y_SEXO");
    });
  });

  describe("Desempate y Múltiples PRs", () => {
    it("GIVEN un alumno con múltiples registros en la misma clase, THEN se computa únicamente su mejor PR", () => {
      const prs: RankingPR[] = [
        {
          id: "pr-lucas-1",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-h1-lucas",
          peso_kg: 20, // Primer intento
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-lucas-2",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-h1-lucas",
          peso_kg: 40, // Mejor intento
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const resultado = calcularRankingRelativo({
        prs,
        claseId: claseIdMock,
        ejercicioId: ejercicioIdMock,
        alumnos: alumnosMock,
      });

      expect(resultado.hombres.length).toBe(1);
      expect(resultado.hombres[0]!.peso_kg).toBe(40);
      expect(resultado.hombres[0]!.ratio).toBe(0.5);
    });

    it("GIVEN dos atletas con el mismo ratio relativo, THEN desempata el mayor peso absoluto levantado", () => {
      // Lucas: 40kg en 80kg peso -> ratio 0.50
      // Mateo: 50kg en 100kg peso -> ratio 0.50
      // Mismo ratio, pero Mateo levantó 50kg vs Lucas 40kg
      const prs: RankingPR[] = [
        {
          id: "pr-lucas",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-h1-lucas",
          peso_kg: 40,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "pr-mateo",
          clase_id: claseIdMock,
          ejercicio_id: ejercicioIdMock,
          alumno_id: "alumno-h2-mateo",
          peso_kg: 50,
          reps: 1,
          fecha: "2026-10-29",
          registrado_por: "c-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const resultado = calcularRankingRelativo({
        prs,
        claseId: claseIdMock,
        ejercicioId: ejercicioIdMock,
        alumnos: alumnosMock,
      });

      expect(resultado.hombres.length).toBe(2);
      expect(resultado.hombres[0]!.alumno_id).toBe("alumno-h2-mateo");
      expect(resultado.hombres[0]!.posicion).toBe(1);
      expect(resultado.hombres[1]!.alumno_id).toBe("alumno-h1-lucas");
      expect(resultado.hombres[1]!.posicion).toBe(2);
    });
  });

  describe("Store useRankingStore: registro y validaciones", () => {
    it("permite registrar un nuevo PR en modo testeo y actualiza la lista", async () => {
      const store = useRankingStore.getState();

      const res = await store.registrarPr({
        clase_id: claseIdMock,
        alumno_id: "alumno-h1-lucas",
        ejercicio_id: ejercicioIdMock,
        peso_kg: 42.5,
        reps: 2,
      });

      expect(res.ok).toBe(true);
      expect(res.pr).toBeDefined();
      expect(res.pr?.peso_kg).toBe(42.5);
      expect(res.pr?.reps).toBe(2);

      const prsActuales = useRankingStore.getState().prs;
      const guardado = prsActuales.find((p) => p.alumno_id === "alumno-h1-lucas" && p.clase_id === claseIdMock);
      expect(guardado).toBeDefined();
      expect(guardado?.peso_kg).toBe(42.5);
    });

    it("valida límites de peso y sexo en actualizarPerfilAlumno", async () => {
      const store = useRankingStore.getState();

      const pesoInvalido1 = await store.actualizarPerfilAlumno("a1", -5, "M");
      expect(pesoInvalido1.ok).toBe(false);

      const pesoInvalido2 = await store.actualizarPerfilAlumno("a1", 600, "M");
      expect(pesoInvalido2.ok).toBe(false);

      const sexoInvalido = await store.actualizarPerfilAlumno("a1", 70, "X" as any);
      expect(sexoInvalido.ok).toBe(false);

      const valido = await store.actualizarPerfilAlumno("a1", 72.5, "M");
      expect(valido.ok).toBe(true);
    });
  });

  describe("Componente RankingFuncional: renderizado visual y ergonomía táctil", () => {
    it("renderiza la vista de Ranking Funcional con selectores, tablas separadas y medallas", () => {
      const html = renderToString(
        React.createElement(RankingFuncional, {
          initialClaseId: "demo-clase-func-miercoles",
          initialEjercicioId: "ej-dominadas-c-carga",
          alumnosDisponibles: alumnosMock,
        }),
      );

      // Título y badges
      expect(html).toContain("Ranking Funcional");
      expect(html).toContain("PR / Peso Corporal");

      // Selectores de clase y ejercicio
      expect(html).toContain("data-testid=\"clase-select\"");
      expect(html).toContain("data-testid=\"ejercicio-select\"");

      // Tablas separadas por sexo
      expect(html).toContain("Ranking Masculino (Hombres)");
      expect(html).toContain("Ranking Femenino (Mujeres)");
      expect(html).toContain("data-testid=\"ranking-hombres-card\"");
      expect(html).toContain("data-testid=\"ranking-mujeres-card\"");
    });

    it("verifica integración en navegación: sidebar y botón en detalle de clase", () => {
      const fs = require("fs");
      const path = require("path");

      const shellCode = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/studio-shell.tsx"),
        "utf-8",
      );
      expect(shellCode).toContain("/studio/ranking-funcional");
      expect(shellCode).toContain("sidebar-ranking-link");

      const agendaCode = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/class-agenda.tsx"),
        "utf-8",
      );
      expect(agendaCode).toContain("/studio/ranking-funcional?claseId=");
      expect(agendaCode).toContain("class-ranking-btn");
    });
  });
});
