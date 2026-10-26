import { describe, it, expect } from "vitest";
import {
  formatearFechaSesion,
  obtenerNombreDiaRutina,
  formatearEncabezadoSesion,
  agruparSeriesPorEjercicio,
  normalizarSesionesDetalladas,
  editarSerieEnHistorial,
  generarContratoMiniDashboard,
} from "@/lib/historial-sesiones";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import type { DiaRutina, RegistroSesion, RegistroSerie } from "@/types/database.types";

describe("Historial de Sesiones — Lógica Pura y Contratos de Datos (GH #181, GOZS-175)", () => {
  const MOCK_DIAS: DiaRutina[] = [
    {
      id: "dia-torso-1",
      plan_id: "plan-1",
      nombre: "Torso",
      orden: 1,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "dia-pierna-2",
      plan_id: "plan-1",
      nombre: "Pierna",
      orden: 2,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
  ];

  const MOCK_ENTRADAS: HistoricalLoadEntry[] = [
    {
      sesion: {
        id: "ses-1",
        alumno_id: "alumno-1",
        dia_id: "dia-torso-1",
        fecha: "2026-10-26T18:00:00.000Z",
        duracion_minutos: 60,
        volumen_total_kg: 2400,
        effective_volume_kg: 2400,
        created_at: "2026-10-26T18:00:00.000Z",
        updated_at: "2026-10-26T19:00:00.000Z",
      },
      series: [
        {
          id: "ser-1-1",
          sesion_id: "ses-1",
          ejercicio_id: "ej-press-banca",
          ejercicioNombre: "Press de Banca Plano",
          numero_serie: 1,
          peso_kg: 80,
          reps_hechas: 10,
          rpe_real: 8,
          completada: true,
          set_type: "NORMAL",
          created_at: "2026-10-26T18:10:00Z",
          updated_at: "2026-10-26T18:10:00Z",
        },
        {
          id: "ser-1-2",
          sesion_id: "ses-1",
          ejercicio_id: "ej-press-banca",
          ejercicioNombre: "Press de Banca Plano",
          numero_serie: 2,
          peso_kg: 85,
          reps_hechas: 8,
          rpe_real: 8.5,
          completada: true,
          set_type: "NORMAL",
          created_at: "2026-10-26T18:15:00Z",
          updated_at: "2026-10-26T18:15:00Z",
        },
        {
          id: "ser-1-3",
          sesion_id: "ses-1",
          ejercicio_id: "ej-remo-barra",
          ejercicioNombre: "Remo con Barra",
          numero_serie: 1,
          peso_kg: 70,
          reps_hechas: 10,
          rpe_real: 7.5,
          completada: true,
          set_type: "NORMAL",
          created_at: "2026-10-26T18:25:00Z",
          updated_at: "2026-10-26T18:25:00Z",
        },
      ],
    },
    {
      sesion: {
        id: "ses-2",
        alumno_id: "alumno-1",
        dia_id: "dia-pierna-2",
        fecha: "2026-10-24T18:00:00.000Z",
        duracion_minutos: 55,
        volumen_total_kg: 3200,
        effective_volume_kg: 3200,
        created_at: "2026-10-24T18:00:00.000Z",
        updated_at: "2026-10-24T18:55:00.000Z",
      },
      series: [
        {
          id: "ser-2-1",
          sesion_id: "ses-2",
          ejercicio_id: "ej-sentadilla",
          ejercicioNombre: "Sentadilla Trasera",
          numero_serie: 1,
          peso_kg: 100,
          reps_hechas: 8,
          rpe_real: 8,
          completada: true,
          set_type: "NORMAL",
          created_at: "2026-10-24T18:10:00Z",
          updated_at: "2026-10-24T18:10:00Z",
        },
      ],
    },
  ];

  describe("1. Formateo y visualización de encabezados", () => {
    it("formatea la fecha en español correctamente", () => {
      const fecha = formatearFechaSesion("2026-10-26T18:00:00.000Z", false);
      expect(fecha).toContain("26 de Octubre");
    });

    it("resuelve el nombre del día a partir de los días de rutina", () => {
      const nombreDia = obtenerNombreDiaRutina("dia-torso-1", MOCK_DIAS);
      expect(nombreDia).toBe("Día 1: Torso");
    });

    it("arma el encabezado estándar: '26 de Octubre — Día 1: Torso'", () => {
      const encabezado = formatearEncabezadoSesion("2026-10-26T18:00:00.000Z", "Día 1: Torso");
      expect(encabezado).toBe("26 de Octubre — Día 1: Torso");
    });
  });

  describe("2. Agrupación y normalización cronológica", () => {
    it("normaliza las sesiones ordenándolas de la más reciente a la más antigua", () => {
      const resultado = normalizarSesionesDetalladas(MOCK_ENTRADAS, MOCK_DIAS);
      expect(resultado).toHaveLength(2);
      expect(resultado[0]!.id).toBe("ses-1"); // 26 de Octubre primero
      expect(resultado[1]!.id).toBe("ses-2"); // 24 de Octubre segundo
      expect(resultado[0]!.encabezado).toBe("26 de Octubre — Día 1: Torso");
    });

    it("agrupa las series por ejercicio dentro de cada sesión", () => {
      const resultado = normalizarSesionesDetalladas(MOCK_ENTRADAS, MOCK_DIAS);
      const sesion1 = resultado[0]!;
      expect(sesion1.ejercicios).toHaveLength(2); // Press de banca y Remo con barra
      expect(sesion1.ejercicios[0]!.ejercicioNombre).toBe("Press de Banca Plano");
      expect(sesion1.ejercicios[0]!.series).toHaveLength(2);
      expect(sesion1.ejercicios[1]!.ejercicioNombre).toBe("Remo con Barra");
      expect(sesion1.ejercicios[1]!.series).toHaveLength(1);
    });

    it("calcula el 1RM estimado por Epley para cada serie", () => {
      const seriesAgrupadas = agruparSeriesPorEjercicio(MOCK_ENTRADAS[0]!.series);
      const pressBanca = seriesAgrupadas.find((e) => e.ejercicioId === "ej-press-banca")!;
      // Serie 1: 80 kg x 10 reps -> Epley: 80 * (1 + 10/30) = 80 * 1.3333 = 106.7 kg
      expect(pressBanca.series[0]!.estimated1RM).toBeCloseTo(106.7, 0);
    });
  });

  describe("3. Edición en línea con guardado optimista (Inmutabilidad total)", () => {
    it("actualiza peso y repeticiones de una serie específica sin mutar el original", () => {
      const editadas = editarSerieEnHistorial(MOCK_ENTRADAS, "ses-1", "ser-1-1", 90, 8);
      expect(editadas).not.toBe(MOCK_ENTRADAS);

      const sesionOriginal = MOCK_ENTRADAS.find((s) => s.sesion.id === "ses-1")!;
      const serieOriginal = sesionOriginal.series.find((s) => s.id === "ser-1-1")!;
      expect(serieOriginal.peso_kg).toBe(80);
      expect(serieOriginal.reps_hechas).toBe(10);

      const sesionEditada = editadas.find((s) => s.sesion.id === "ses-1")!;
      const serieEditada = sesionEditada.series.find((s) => s.id === "ser-1-1")!;
      expect(serieEditada.peso_kg).toBe(90);
      expect(serieEditada.reps_hechas).toBe(8);
    });

    it("recalcula el volumen total de la sesión tras la edición", () => {
      // Original: 80*10 (800) + 85*8 (680) + 70*10 (700) = 2180
      // Editado: 100*10 (1000) + 85*8 (680) + 70*10 (700) = 2380
      const editadas = editarSerieEnHistorial(MOCK_ENTRADAS, "ses-1", "ser-1-1", 100, 10);
      const sesionEditada = editadas.find((s) => s.sesion.id === "ses-1")!;
      expect(sesionEditada.sesion.volumen_total_kg).toBe(2380);
    });
  });

  describe("4. Contrato analítico estructurado para futuro mini-dashboard", () => {
    it("genera el contrato con métricas agregadas y progresión cronológica por ejercicio", () => {
      const contrato = generarContratoMiniDashboard(MOCK_ENTRADAS, "alumno-1", MOCK_DIAS);

      expect(contrato.alumnoId).toBe("alumno-1");
      expect(contrato.totalSesiones).toBe(2);
      expect(contrato.listaEjercicios.length).toBeGreaterThan(0);

      const pressBancaResumen = contrato.ejercicios["ej-press-banca"];
      expect(pressBancaResumen).toBeDefined();
      expect(pressBancaResumen!.ejercicioNombre).toBe("Press de Banca Plano");
      expect(pressBancaResumen!.recordPesoKg).toBe(85);
      expect(pressBancaResumen!.puntos).toHaveLength(1);
      expect(pressBancaResumen!.puntos[0]!.maxPesoKg).toBe(85);
      expect(pressBancaResumen!.puntos[0]!.bestEstimated1RM).toBeGreaterThan(100);
    });
  });
});
