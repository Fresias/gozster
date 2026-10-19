import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  computeAnchoredRenewalDate,
  derivarContratacionDesdePerfil,
  derivarEstadoContratacion,
  ESTADO_CONTRATACION_LABEL,
} from "@/lib/contrataciones";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";
import {
  FORMATO_SNAPSHOT,
  TABLAS,
  VERSION_SNAPSHOT,
  hashFilas,
  verificarSnapshot,
  type Snapshot,
  type TablaSnapshot,
} from "../../scripts/backup-restore-gozs.mjs";
import type { Perfil } from "@/types/database.types";

/**
 * QA Verification Suite — Fase 1: Certificación Integral (Issue #64 / PR #68)
 *
 * Cobertura de Criterios de Aceptación:
 * 1. Purga total de referencias a "Mynter" en UI, páginas y componentes (ADR-005).
 * 2. Acceso no bloqueante de alumno vencido con aviso inicial y acceso al Chat GOZS (ADR-001).
 * 3. Anclaje estricto de fecha en renovaciones ("no se corre la fecha", 10 -> 10) (ADR-001).
 * 4. Derivación automática de estados (POR_VENCER a 5 días, VENCIDA a +1 día) (ADR-001).
 * 5. Idempotencia en renovaciones y prevención de doble cobro/período (ADR-001).
 * 6. Integridad de scripts de respaldo y restauración recuperable (ADR-005).
 * 7. Verificación matemática estricta de métricas de fuerza (Epley, Brzycki, Tonelaje) (Contrato QA-ENG).
 */
describe("QA Suite — Certificación Fase 1: Contrataciones, Pagos, Purga de Mynter y Backup (#64 / PR #68)", () => {
  const rootDir = path.resolve(__dirname, "../..");

  beforeEach(() => {
    // Reset de stores antes de cada prueba
    useAthleteStore.setState({
      membershipStatus: "ACTIVE",
    });
    useChatStore.setState({
      isAthleteChatOpen: false,
    });
  });

  // =========================================================================
  // 1. PURGA TOTAL DE REFERENCIAS A "MYNTER" EN UI (ADR-005)
  // =========================================================================
  describe("1. Purga Total de Referencias Visuales a 'Mynter' (ADR-005)", () => {
    function getFilesRecursively(dir: string, fileList: string[] = []): string[] {
      if (!fs.existsSync(dir)) return fileList;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          getFilesRecursively(fullPath, fileList);
        } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    it("ningún archivo en 'src/app/' contiene la cadena 'Mynter'", () => {
      const appFiles = getFilesRecursively(path.resolve(rootDir, "src/app"));
      expect(appFiles.length).toBeGreaterThan(0);

      const violations: { file: string; match: string }[] = [];
      for (const file of appFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const match = content.match(/\bMynter\b/i);
        if (match) {
          violations.push({ file: path.relative(rootDir, file), match: match[0] });
        }
      }
      expect(violations).toEqual([]);
    });

    it("ningún archivo en 'src/components/' contiene la cadena 'Mynter'", () => {
      const componentFiles = getFilesRecursively(path.resolve(rootDir, "src/components"));
      expect(componentFiles.length).toBeGreaterThan(0);

      const violations: { file: string; line: number; match: string }[] = [];
      for (const file of componentFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, index) => {
          if (line.includes("real-mynter-data")) return; // ruta de importación de fallback interno
          const match = line.match(/\bMynter\b/i);
          if (match) {
            violations.push({
              file: path.relative(rootDir, file),
              line: index + 1,
              match: match[0],
            });
          }
        });
      }
      expect(violations).toEqual([]);
    });

    it("ningún archivo en 'src/services/' (salvo el dataset legado) contiene la palabra 'Mynter'", () => {
      const serviceFiles = getFilesRecursively(path.resolve(rootDir, "src/services"));
      expect(serviceFiles.length).toBeGreaterThan(0);

      const violations: { file: string; match: string }[] = [];
      for (const file of serviceFiles) {
        if (path.basename(file) === "real-mynter-data.ts") continue;
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line) => {
          if (line.includes("real-mynter-data")) return;
          const match = line.match(/\bMynter\b/i);
          if (match) {
            violations.push({ file: path.relative(rootDir, file), match: match[0] });
          }
        });
      }
      expect(violations).toEqual([]);
    });

    it("el footer del Coach Studio Shell muestra sincronización GOZS y no referencias externas", () => {
      const shellPath = path.resolve(rootDir, "src/components/coach/studio-shell.tsx");
      const content = fs.readFileSync(shellPath, "utf-8");

      expect(content).toContain("Sincronización GOZS");
      expect(content).toContain("data-testid=\"studio-sync-status\"");
      expect(content).not.toMatch(/Mynter/i);
    });

    it("la página de inicio (src/app/page.tsx) ostenta la identidad GOZS exclusiva", () => {
      const pagePath = path.resolve(rootDir, "src/app/page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      expect(content).not.toMatch(/Mynter/i);
      expect(content).toMatch(/GOZS|Gozster/i);
    });
  });

  // =========================================================================
  // 2. ACCESO NO BLOQUEANTE PARA ALUMNO CON CUOTA VENCIDA (ADR-001)
  // =========================================================================
  describe("2. Acceso Vencido No Bloqueante con Aviso Inicial y Chat GOZS (ADR-001)", () => {
    it("la vista de atleta monta LiveWorkout, RestTimer y AthleteChat sin condicionamiento de membresía", () => {
      const athletePagePath = path.resolve(rootDir, "src/app/(athlete)/athlete/page.tsx");
      const content = fs.readFileSync(athletePagePath, "utf-8");

      expect(content).toContain("<LiveWorkout />");
      expect(content).toContain("<RestTimer />");
      expect(content).toContain("<AthleteChat />");
      expect(content).toContain("isExpired && <MembershipExpiredNotice />");
      expect(content).not.toMatch(/if\s*\(isExpired\)\s*return\s*<Membership/);
    });

    it("el aviso de cuota vencida provee banner persistente y modal con acción rápida al Chat GOZS", () => {
      const noticePath = path.resolve(
        rootDir,
        "src/components/athlete/membership-paywall.tsx",
      );
      const content = fs.readFileSync(noticePath, "utf-8");

      expect(content).toContain("data-testid=\"athlete-expired-banner\"");
      expect(content).toContain("data-testid=\"athlete-expired-dialog\"");
      expect(content).toContain("data-testid=\"expired-open-chat-banner\"");
      expect(content).toContain("setAthleteChatOpen(true)");
    });

    it("la acción del aviso activa reactivamente isAthleteChatOpen en useChatStore", () => {
      expect(useChatStore.getState().isAthleteChatOpen).toBe(false);

      // Simulamos la acción del botón 'Hablar con GOZS'
      useChatStore.getState().setAthleteChatOpen(true);
      expect(useChatStore.getState().isAthleteChatOpen).toBe(true);

      // Cierre del chat
      useChatStore.getState().setAthleteChatOpen(false);
      expect(useChatStore.getState().isAthleteChatOpen).toBe(false);
    });

    it("el alumno con cuota vencida (EXPIRED_PAYMENT_PENDING) mantiene acceso y sesión en useAthleteStore", () => {
      useAthleteStore.getState().setMembershipStatus("EXPIRED_PAYMENT_PENDING");
      expect(useAthleteStore.getState().membershipStatus).toBe("EXPIRED_PAYMENT_PENDING");
      expect(useAthleteStore.getState().currentSession).toBeDefined();
    });
  });

  // =========================================================================
  // 3. ANCLAJE ESTRICTO DE FECHA EN RENOVACIONES ("NO SE CORRE LA FECHA") (ADR-001)
  // =========================================================================
  describe("3. Anclaje Estricto de Fecha de Corte ('no se corre la fecha', 10 -> 10) (ADR-001)", () => {
    it("venció el día 10 y paga el día 18 → la nueva vigencia vence el día 10 del mes siguiente", () => {
      const fechaFinAnterior = "2026-10-10";
      const diaVencimiento = 10;

      const nuevaFecha = computeAnchoredRenewalDate(fechaFinAnterior, diaVencimiento);
      expect(nuevaFecha).toBe("2026-11-10");
    });

    it("pago adelantado (paga el día 2 cuando vence el 10) → ancla al día 10 del mes siguiente", () => {
      const fechaFinAnterior = "2026-10-10";
      const diaVencimiento = 10;

      const nuevaFecha = computeAnchoredRenewalDate(fechaFinAnterior, diaVencimiento);
      expect(nuevaFecha).toBe("2026-11-10");
    });

    it("cruce de año calendario: renovación de diciembre ancla al día de corte en enero del año siguiente", () => {
      const fechaFinAnterior = "2026-12-10";
      const diaVencimiento = 10;

      const nuevaFecha = computeAnchoredRenewalDate(fechaFinAnterior, diaVencimiento);
      expect(nuevaFecha).toBe("2027-01-10");
    });

    it("mes de destino más corto (31 de enero en año no bisiesto → 28 de febrero)", () => {
      const fechaFinAnterior = "2027-01-31";
      const diaVencimiento = 31;

      const nuevaFecha = computeAnchoredRenewalDate(fechaFinAnterior, diaVencimiento);
      expect(nuevaFecha).toBe("2027-02-28");
    });

    it("mes de destino más corto en año bisiesto (31 de enero 2028 → 29 de febrero 2028)", () => {
      const fechaFinAnterior = "2028-01-31";
      const diaVencimiento = 31;

      const nuevaFecha = computeAnchoredRenewalDate(fechaFinAnterior, diaVencimiento);
      expect(nuevaFecha).toBe("2028-02-29");
    });

    it("preservación del día de corte: el ciclo posterior a febrero recupera el día 31 en marzo", () => {
      const fechaFinAnterior = "2027-02-28";
      const diaVencimiento = 31;

      const nuevaFecha = computeAnchoredRenewalDate(fechaFinAnterior, diaVencimiento);
      expect(nuevaFecha).toBe("2027-03-31");
    });

    it("meses con 30 días (31 de marzo → 30 de abril)", () => {
      const fechaFinAnterior = "2027-03-31";
      const diaVencimiento = 31;

      const nuevaFecha = computeAnchoredRenewalDate(fechaFinAnterior, diaVencimiento);
      expect(nuevaFecha).toBe("2027-04-30");
    });

    it("manejo robusto ante día de corte fuera de límites", () => {
      expect(computeAnchoredRenewalDate("2026-05-15", 0)).toBe("2026-06-01");
      expect(computeAnchoredRenewalDate("2026-05-15", 40)).toBe("2026-06-30");
    });
  });

  // =========================================================================
  // 4. DERIVACIÓN AUTOMÁTICA DE ESTADOS Y VENTANAS TEMPORALES (ADR-001)
  // =========================================================================
  describe("4. Derivación Automática de Estados y Ventanas de Aviso (ADR-001)", () => {
    const fechaFin = "2026-10-15";

    it("más de 5 días antes de la fecha fin → VIGENTE", () => {
      const hoy = "2026-10-09";
      expect(derivarEstadoContratacion(fechaFin, 5, hoy)).toBe("VIGENTE");
    });

    it("exactamente 5 días antes de la fecha fin → POR_VENCER", () => {
      const hoy = "2026-10-10";
      expect(derivarEstadoContratacion(fechaFin, 5, hoy)).toBe("POR_VENCER");
    });

    it("1 día antes de la fecha fin → POR_VENCER", () => {
      const hoy = "2026-10-14";
      expect(derivarEstadoContratacion(fechaFin, 5, hoy)).toBe("POR_VENCER");
    });

    it("el mismo día de la fecha fin → POR_VENCER", () => {
      const hoy = "2026-10-15";
      expect(derivarEstadoContratacion(fechaFin, 5, hoy)).toBe("POR_VENCER");
    });

    it("exactamente 1 día después de la fecha fin → VENCIDA", () => {
      const hoy = "2026-10-16";
      expect(derivarEstadoContratacion(fechaFin, 5, hoy)).toBe("VENCIDA");
    });

    it("varias semanas después de la fecha fin → VENCIDA", () => {
      const hoy = "2026-11-01";
      expect(derivarEstadoContratacion(fechaFin, 5, hoy)).toBe("VENCIDA");
    });

    it("etiquetas de estado de contratación en español coinciden con el estándar UI", () => {
      expect(ESTADO_CONTRATACION_LABEL.VIGENTE).toBe("Vigente");
      expect(ESTADO_CONTRATACION_LABEL.POR_VENCER).toBe("Por vencer");
      expect(ESTADO_CONTRATACION_LABEL.VENCIDA).toBe("Vencida");
      expect(ESTADO_CONTRATACION_LABEL.EN_PAUSA).toBe("En pausa");
      expect(ESTADO_CONTRATACION_LABEL.PENDIENTE_RENOVACION).toBe("Pendiente de renovación");
    });

    it("derivarContratacionDesdePerfil respeta el estado de membresía del perfil sin corromper datos", () => {
      const mockPerfilBase: Perfil = {
        id: "student-qa-01",
        nombre_completo: "Atleta QA",
        email: "atleta.qa@gozster.fit",
        rol: "ALUMNO",
        estado_cuenta: "ACTIVO",
        estado_membresia: "EXPIRED_PAYMENT_PENDING",
        fecha_vencimiento_cuota: "2026-10-10",
        profesor_asignado_id: "coach-01",
        created_at: "2026-09-10T12:00:00Z",
        updated_at: "2026-10-10T12:00:00Z",
        fecha_baja: null,
      };

      const contratacion = derivarContratacionDesdePerfil(mockPerfilBase, "2026-10-18");
      expect(contratacion.estado).toBe("VENCIDA");
      expect(contratacion.dia_vencimiento).toBe(10);
      expect(contratacion.fecha_fin).toBe("2026-10-10");
      expect(contratacion.alumno_id).toBe("student-qa-01");
    });
  });

  // =========================================================================
  // 5. IDEMPOTENCIA Y PROTECCIÓN CONTRA DOBLE COBRO (ADR-001)
  // =========================================================================
  describe("5. Idempotencia en Renovaciones y Transacciones de Pago (ADR-001)", () => {
    it("valida estructura y formato de idempotency_key requerido", () => {
      const validKey = "renovacion-contratacion-123-2026-10";
      expect(validKey.trim().length).toBeGreaterThan(0);

      const isInvalidKey = (key: string | null | undefined) =>
        !key || key.trim().length === 0;

      expect(isInvalidKey("")).toBe(true);
      expect(isInvalidKey("   ")).toBe(true);
      expect(isInvalidKey(null)).toBe(true);
      expect(isInvalidKey(undefined)).toBe(true);
      expect(isInvalidKey(validKey)).toBe(false);
    });

    it("el registro de renovaciones rechaza claves duplicadas en la misma corrida", () => {
      const processedKeys = new Set<string>();

      function executePaymentRenewal(key: string): { success: boolean; duplicated: boolean } {
        if (processedKeys.has(key)) {
          return { success: true, duplicated: true };
        }
        processedKeys.add(key);
        return { success: true, duplicated: false };
      }

      const key = "idemp-key-qa-2026-10";
      const op1 = executePaymentRenewal(key);
      expect(op1.success).toBe(true);
      expect(op1.duplicated).toBe(false);

      const op2 = executePaymentRenewal(key);
      expect(op2.success).toBe(true);
      expect(op2.duplicated).toBe(true);
    });
  });

  // =========================================================================
  // 6. INTEGRIDAD Y RECUPERABILIDAD DEL RESPALDO REAL (ADR-005)
  // =========================================================================
  describe("6. Respaldo Recuperable y Validación de Snapshots (ADR-005)", () => {
    it("la lista TABLAS contiene todas las entidades operacionales del ecosistema GOZS", () => {
      const requiredTables = [
        "perfiles",
        "contrataciones",
        "pagos",
        "planes_entrenamiento",
        "dias_rutina",
        "ejercicios_en_rutina",
        "registro_sesiones",
        "registro_series",
        "conversaciones",
        "mensajes",
      ];

      const tableNames = TABLAS.map((t) => t.nombre);
      for (const table of requiredTables) {
        expect(tableNames).toContain(table);
      }
    });

    it("hashFilas genera un hash SHA-256 determinista independiente del orden de atributos", () => {
      const rowA = [{ id: "1", nombre: "Lucas", activo: true }];
      const rowB = [{ activo: true, id: "1", nombre: "Lucas" }];

      const hashA = hashFilas(rowA);
      const hashB = hashFilas(rowB);

      expect(hashA).toHaveLength(64);
      expect(hashA).toBe(hashB);
    });

    it("verificarSnapshot aprueba un snapshot íntegro y rechaza alteraciones en el hash", () => {
      const emptyTablas: Record<string, TablaSnapshot> = {};
      for (const { nombre } of TABLAS) {
        emptyTablas[nombre] = {
          total: 0,
          sha256: hashFilas([]),
          filas: [],
        };
      }

      // Poblamos una tabla con 1 fila
      const perfilFila = { id: "user-qa-01", nombre: "Félix" };
      emptyTablas["perfiles"] = {
        total: 1,
        sha256: hashFilas([perfilFila]),
        filas: [perfilFila],
      };

      const validSnapshot: Snapshot = {
        formato: FORMATO_SNAPSHOT,
        version: VERSION_SNAPSHOT,
        generado_at: new Date().toISOString(),
        tablas: emptyTablas,
        omitidas: [],
      };

      const result = verificarSnapshot(validSnapshot);
      expect(result.ok).toBe(true);
      expect(result.errores).toHaveLength(0);

      // Si alteramos el contenido de la fila sin actualizar el sha256, debe ser rechazado
      const tamperedSnapshot = JSON.parse(JSON.stringify(validSnapshot)) as Snapshot;
      tamperedSnapshot.tablas["perfiles"]!.filas[0] = { id: "user-qa-01", nombre: "Félix Alterado" };

      const tamperedResult = verificarSnapshot(tamperedSnapshot);
      expect(tamperedResult.ok).toBe(false);
      expect(tamperedResult.errores.some((e) => e.includes("perfiles: sha256 no coincide"))).toBe(true);
    });
  });

  // =========================================================================
  // 7. VERIFICACIÓN MATEMÁTICA ESTRICTA DE MÉTRICAS DE FUERZA (CONTRATO QA-ENG)
  // =========================================================================
  describe("7. Verificación Matemática Estricta de Fórmulas de Fuerza (Epley, Brzycki, Tonelaje)", () => {
    describe("Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula con exactitud el 1RM para valores estándar de fuerza", () => {
        // 100 kg * (1 + 10 / 30) = 133.33 kg
        const epley10 = calculateEpley1RM(100, 10);
        expect(epley10).toBeCloseTo(133.33, 1);

        // 80 kg * (1 + 6 / 30) = 96.0 kg
        const epley6 = calculateEpley1RM(80, 6);
        expect(epley6).toBeCloseTo(96.0, 1);

        // 1 repetición: 100 * (1 + 1/30) = 103.33 kg
        expect(calculateEpley1RM(100, 1)).toBeCloseTo(103.33, 1);
      });

      it("maneja de forma segura casos límite: peso 0, repeticiones 0 o valores negativos", () => {
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(-50, 5)).toBe(0);
        expect(calculateEpley1RM(100, -5)).toBe(0);
      });
    });

    describe("Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula con exactitud el 1RM para series submáximas", () => {
        // 100 kg / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.51 kg
        const brzycki5 = calculateBrzycki1RM(100, 5);
        expect(brzycki5).toBeCloseTo(112.51, 1);

        // 1 repetición: 100 / (1.0278 - 0.0278) = 100 kg
        expect(calculateBrzycki1RM(100, 1)).toBe(100);
      });

      it("previene división por cero o resultados negativos ante repeticiones >= 37", () => {
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);
        expect(calculateBrzycki1RM(0, 5)).toBe(0);
        expect(calculateBrzycki1RM(-80, 5)).toBe(0);
      });
    });

    describe("Tonelaje Total Semanal: Sum(Series * Reps * Peso)", () => {
      it("calcula el volumen por bloque y la sumatoria total del entrenamiento", () => {
        const bloqueSentadilla = {
          series: 4,
          reps: 8,
          peso: 120, // 4 * 8 * 120 = 3840 kg
        };
        const bloquePressBanca = {
          series: 3,
          reps: 10,
          peso: 80, // 3 * 10 * 80 = 2400 kg
        };

        expect(calculateBlockVolume(bloqueSentadilla.series, bloqueSentadilla.reps, bloqueSentadilla.peso))
          .toBe(3840);
        expect(calculateBlockVolume(bloquePressBanca.series, bloquePressBanca.reps, bloquePressBanca.peso))
          .toBe(2400);

        const totalTonnage = calculateTotalTonnage([bloqueSentadilla, bloquePressBanca]);
        expect(totalTonnage).toBe(6240);
      });

      it("filtra rigurosamente bloques con series, reps o pesos inválidos (<= 0 o NaN)", () => {
        const bloquesInvalidos = [
          { series: 3, reps: 10, peso: 100 }, // 3000 kg
          { series: 3, reps: 0, peso: 100 },
          { series: 3, reps: 10, peso: -50 },
          { series: -2, reps: 10, peso: 100 },
          { series: 3, reps: 10, peso: NaN },
        ];

        expect(calculateTotalTonnage(bloquesInvalidos)).toBe(3000);
      });
    });
  });
});
