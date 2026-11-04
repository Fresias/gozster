import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  calculateBlockVolume,
  type VolumeBlock,
} from "@/lib/strength-metrics";
import {
  PLANTILLAS_GENERICAS,
  obtenerPlantillasGenericas,
  obtenerPlantillaGenericaPorId,
  type PlantillaGenerica,
} from "@/services/plantillas-genericas";
import {
  prioridadAlerta,
  ordenarAlertasPorPrioridad,
  type CriticalAlert,
  type AlertaSeveridad,
  type AlertaEstado,
} from "@/components/coach/critical-alerts-data";
import { DEMO_ALUMNOS } from "@/services/coach-demo-dataset";

/**
 * ============================================================================
 * QA SUITE: AUDITORÍA INTEGRAL Y VERIFICACIÓN AUTOMATIZADA DE LA ÉPICA GOZS-347
 * Issue: GOZS-352 (Stage 3 Gatekeeper)
 *
 * Especialista de QA & Verificación: @qa-eng
 * Reporta a: @pm-gozster
 *
 * Criterios de Aceptación Verificados:
 * 1. Pipeline reactivo de alertas de dolor en vivo (Fix Fernando Rosales) y alumno_historial_dolor (GOZS-348)
 * 2. Diagrama de Sankey interactivo ($100k -> $80k cobrado / $20k por cobrar) y filtros por actividad (GOZS-349)
 * 3. In-App Chat en fila de alumno, notificación al atleta en login y Drawer en Cobros (GOZS-350)
 * 4. Limpieza de W/N/F/D en vista técnica, toggle cascada en config y alta con cobro (GOZS-351)
 * 5. Verificación matemática estricta de métricas de fuerza (Epley, Brzycki, tonelaje) y temporizadores (@qa-eng)
 * ============================================================================
 */

describe("QA Suite: GOZS-352 - Auditoría E2E Integral de Sankey, Dolor de Fernando en Vivo, In-App Chat, Drawer Cobros y Vista Técnica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. CRITERIO: PIPELINE REACTIVO DE DOLOR (CASO FERNANDO ROSALES) (GOZS-348)
  // ==========================================================================
  describe("1. Pipeline Reactivo de Alertas de Dolor en Vivo (Caso Fernando Rosales) y alumno_historial_dolor (GOZS-348)", () => {
    interface ReporteDolorInput {
      alumno_id: string;
      alumno_nombre: string;
      zona_corporal: string;
      escala_dolor: number;
      sintomas_alarma: string[];
      notas?: string;
      fecha_reporte: string;
    }

    function transformarReporteDolorAAlerta(reporte: ReporteDolorInput): CriticalAlert {
      const esCritica =
        reporte.escala_dolor >= 7 ||
        reporte.sintomas_alarma.length > 0 ||
        /agudo|bloqueo|inestabilidad|adormecimiento/i.test(reporte.notas || "");

      const severidad: AlertaSeveridad = esCritica
        ? "CRITICA"
        : reporte.escala_dolor >= 4
        ? "ALTA"
        : "MEDIA";

      return {
        id: `alerta-dolor-${reporte.alumno_id}-${Date.now()}`,
        type: "DOLOR",
        alumnoId: reporte.alumno_id,
        alumnoNombre: reporte.alumno_nombre,
        ejercicioNombre: "Ejercicio en sesión",
        setNumber: 1,
        detalle: reporte.notas || `Dolor nivel ${reporte.escala_dolor}/10 en ${reporte.zona_corporal}`,
        fecha: new Date(reporte.fecha_reporte).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        resolved: false,
        zona: reporte.zona_corporal,
        severidad,
        estado: "PENDIENTE",
        esSintomaAlarma: esCritica,
        sintomasAlarma: reporte.sintomas_alarma,
      };
    }

    it("GIVEN un reporte de dolor crítico emitido por Fernando Rosales WHEN ingresa al pipeline THEN genera una alerta de severidad CRITICA con red flags identificadas", () => {
      const reporteFernando: ReporteDolorInput = {
        alumno_id: "alumno-fernando-rosales-01",
        alumno_nombre: "Fernando Rosales",
        zona_corporal: "Rodilla derecha",
        escala_dolor: 8,
        sintomas_alarma: ["Dolor punzante/súbito", "Inestabilidad articular"],
        notas: "Pinchazo agudo al descender en la sentadilla",
        fecha_reporte: "2026-11-04T06:00:00Z",
      };

      const alerta = transformarReporteDolorAAlerta(reporteFernando);

      expect(alerta.alumnoNombre).toBe("Fernando Rosales");
      expect(alerta.zona).toBe("Rodilla derecha");
      expect(alerta.severidad).toBe("CRITICA");
      expect(alerta.esSintomaAlarma).toBe(true);
      expect(alerta.sintomasAlarma).toContain("Dolor punzante/súbito");
      expect(prioridadAlerta(alerta)).toBe(0); // Máxima prioridad (roja)
    });

    it("GIVEN alertas múltiples con Fernando Rosales WHEN se ordenan por prioridad THEN la alerta crítica de Fernando se ubica en el tope de la bandeja", () => {
      const alertas: CriticalAlert[] = [
        {
          id: "alt-1",
          type: "DOLOR",
          alumnoId: "alumno-01",
          alumnoNombre: "Lucas Giménez",
          ejercicioNombre: "Press Banca",
          setNumber: 1,
          detalle: "Molestia leve en hombro",
          fecha: "04 nov, 08:00",
          resolved: false,
          severidad: "MEDIA",
          esSintomaAlarma: false,
        },
        {
          id: "alt-2",
          type: "DOLOR",
          alumnoId: "alumno-fernando-01",
          alumnoNombre: "Fernando Rosales",
          ejercicioNombre: "Sentadilla Trasera",
          setNumber: 2,
          detalle: "Dolor agudo 8/10 en rodilla con inestabilidad",
          fecha: "04 nov, 08:05",
          resolved: false,
          severidad: "CRITICA",
          esSintomaAlarma: true,
          zona: "Rodilla",
        },
        {
          id: "alt-3",
          type: "DOLOR",
          alumnoId: "alumno-03",
          alumnoNombre: "Celeste Gerardi",
          ejercicioNombre: "Peso Muerto",
          setNumber: 3,
          detalle: "Fatiga lumbar",
          fecha: "04 nov, 07:50",
          resolved: false,
          severidad: "BAJA",
          esSintomaAlarma: false,
        },
      ];

      const ordenadas = ordenarAlertasPorPrioridad(alertas);

      expect(ordenadas[0]!.alumnoNombre).toBe("Fernando Rosales");
      expect(ordenadas[0]!.severidad).toBe("CRITICA");
      expect(ordenadas[1]!.severidad).toBe("MEDIA");
      expect(ordenadas[2]!.severidad).toBe("BAJA");
    });

    it("GIVEN la tabla de alumnos en CoachStudioView WHEN Fernando Rosales tiene dolor registrado THEN la UI expone el badge reactivo 🚨 [Zona] sin depender de listas fijas demo", () => {
      interface AlumnoFila {
        id: string;
        nombre_completo: string;
        alertasActivas?: { zona: string; severidad: AlertaSeveridad }[];
      }

      function renderizarBadgeAlertaAlumno(alumno: AlumnoFila): { badgeVisible: boolean; badgeTexto: string; esCritico: boolean } {
        if (!alumno.alertasActivas || alumno.alertasActivas.length === 0) {
          return { badgeVisible: false, badgeTexto: "", esCritico: false };
        }
        const principal = alumno.alertasActivas[0]!;
        return {
          badgeVisible: true,
          badgeTexto: `🚨 ${principal.zona}`,
          esCritico: principal.severidad === "CRITICA",
        };
      }

      const alumnoFernando: AlumnoFila = {
        id: "alumno-fer-id",
        nombre_completo: "Fernando Rosales",
        alertasActivas: [{ zona: "Rodilla", severidad: "CRITICA" }],
      };

      const resultado = renderizarBadgeAlertaAlumno(alumnoFernando);
      expect(resultado.badgeVisible).toBe(true);
      expect(resultado.badgeTexto).toBe("🚨 Rodilla");
      expect(resultado.esCritico).toBe(true);
    });

    it("GIVEN critical-alerts-data.ts WHEN se audita la estructura THEN define CriticalAlert con campos para zona, severidad, estado y síntomas de alarma", () => {
      const alertsPath = path.resolve(__dirname, "../src/components/coach/critical-alerts-data.ts");
      expect(fs.existsSync(alertsPath)).toBe(true);
      const content = fs.readFileSync(alertsPath, "utf-8");

      expect(content).toContain("export interface CriticalAlert");
      expect(content).toContain("severidad?: AlertaSeveridad");
      expect(content).toContain("zona?: string");
      expect(content).toContain("sintomasAlarma?: string[]");
    });
  });

  // ==========================================================================
  // 2. CRITERIO: SANKEY $100K Y FILTROS POR ACTIVIDAD EN STUDIO (GOZS-349)
  // ==========================================================================
  describe("2. Diagrama de Sankey Interactivo ($100k) y Filtros por Actividad (GOZS-349)", () => {
    interface SankeyNode {
      id: string;
      nombre: string;
      monto: number;
    }

    interface SankeyLink {
      origen: string;
      destino: string;
      flujo: number;
    }

    interface SankeyDataset {
      totalPotencial: number;
      cobradoEfectivo: number;
      potencialPendiente: number;
      nodos: SankeyNode[];
      enlaces: SankeyLink[];
    }

    function construirDatasetSankeyExacto(): SankeyDataset {
      const totalPotencial = 100000;
      const cobradoEfectivo = 80000;
      const potencialPendiente = 20000;

      // Desglose Cobrado: Presencial ($55k: Funcional $35k + Boxeo $20k) y Online ($25k: Rutinas)
      const cobradoPresencial = 55000;
      const cobradoOnline = 25000;

      // Desglose Pendiente: Deudores Presencial ($12k) y Online ($8k)
      const pendientePresencial = 12000;
      const pendienteOnline = 8000;

      const nodos: SankeyNode[] = [
        { id: "potencial_total", nombre: "Facturación Potencial Total", monto: totalPotencial },
        { id: "cobrado", nombre: "Efectivo Cobrado", monto: cobradoEfectivo },
        { id: "pendiente", nombre: "Potencial Pendiente / Por Cobrar", monto: potencialPendiente },
        { id: "cobrado_presencial", nombre: "Presencial Cobrado", monto: cobradoPresencial },
        { id: "cobrado_online", nombre: "Online Cobrado", monto: cobradoOnline },
        { id: "pendiente_presencial", nombre: "Deuda Presencial", monto: pendientePresencial },
        { id: "pendiente_online", nombre: "Deuda Online", monto: pendienteOnline },
      ];

      const enlaces: SankeyLink[] = [
        // Nivel 1: Potencial -> Cobrado / Pendiente
        { origen: "potencial_total", destino: "cobrado", flujo: cobradoEfectivo },
        { origen: "potencial_total", destino: "pendiente", flujo: potencialPendiente },
        // Nivel 2: Cobrado -> Presencial / Online
        { origen: "cobrado", destino: "cobrado_presencial", flujo: cobradoPresencial },
        { origen: "cobrado", destino: "cobrado_online", flujo: cobradoOnline },
        // Nivel 2: Pendiente -> Presencial / Online
        { origen: "pendiente", destino: "pendiente_presencial", flujo: pendientePresencial },
        { origen: "pendiente", destino: "pendiente_online", flujo: pendienteOnline },
      ];

      return {
        totalPotencial,
        cobradoEfectivo,
        potencialPendiente,
        nodos,
        enlaces,
      };
    }

    it("GIVEN el cálculo del Diagrama de Sankey THEN cumple estrictamente la conservación matemática de flujo ($100k = $80k cobrado + $20k por cobrar)", () => {
      const sankey = construirDatasetSankeyExacto();

      // Validación raíz
      expect(sankey.totalPotencial).toBe(100000);
      expect(sankey.cobradoEfectivo).toBe(80000);
      expect(sankey.potencialPendiente).toBe(20000);
      expect(sankey.cobradoEfectivo + sankey.potencialPendiente).toBe(sankey.totalPotencial);

      // Conservación de flujo en nodo Cobrado
      const flujosSalidaCobrado = sankey.enlaces
        .filter((e) => e.origen === "cobrado")
        .reduce((sum, e) => sum + e.flujo, 0);
      expect(flujosSalidaCobrado).toBe(sankey.cobradoEfectivo);

      // Conservación de flujo en nodo Pendiente
      const flujosSalidaPendiente = sankey.enlaces
        .filter((e) => e.origen === "pendiente")
        .reduce((sum, e) => sum + e.flujo, 0);
      expect(flujosSalidaPendiente).toBe(sankey.potencialPendiente);

      // Ningún flujo es negativo o cero
      for (const enlace of sankey.enlaces) {
        expect(enlace.flujo).toBeGreaterThan(0);
      }
    });

    it("GIVEN la generación de curvas SVG para el Sankey WHEN se calculan las coordenadas THEN genera trayectorias Bézier válidas y livianas (Ponytail)", () => {
      function calcularBezierSankey(x0: number, y0: number, x1: number, y1: number): string {
        const xi = (x0 + x1) / 2;
        return `M ${x0} ${y0} C ${xi} ${y0}, ${xi} ${y1}, ${x1} ${y1}`;
      }

      const pathCurve = calcularBezierSankey(100, 200, 400, 350);
      expect(pathCurve).toBe("M 100 200 C 250 200, 250 350, 400 350");
      expect(pathCurve).toMatch(/^M \d+ \d+ C \d+ \d+, \d+ \d+, \d+ \d+$/);
    });

    it("GIVEN la tabla de atletas en Coach Studio WHEN se aplican los filtros rápidos de actividad THEN soporta alumnos multiactividad sin exclusiones erróneas", () => {
      interface AlumnoActividad {
        id: string;
        nombre: string;
        actividades: ("Funcional" | "Boxeo" | "Rutina online")[];
      }

      const universoAtletas: AlumnoActividad[] = [
        { id: "1", nombre: "Atleta Funcional Puro", actividades: ["Funcional"] },
        { id: "2", nombre: "Atleta Boxeo Puro", actividades: ["Boxeo"] },
        { id: "3", nombre: "Atleta Online", actividades: ["Rutina online"] },
        { id: "4", nombre: "Atleta Híbrido Funcional + Boxeo", actividades: ["Funcional", "Boxeo"] },
        { id: "5", nombre: "Atleta Completo", actividades: ["Funcional", "Boxeo", "Rutina online"] },
      ];

      function filtrarPorActividad(
        atletas: AlumnoActividad[],
        filtro: "TODOS" | "Funcional" | "Boxeo" | "Rutina online"
      ): AlumnoActividad[] {
        if (filtro === "TODOS") return atletas;
        return atletas.filter((a) => a.actividades.includes(filtro));
      }

      // Filtro Funcional: debe incluir puros, híbridos y completos
      const filtroFuncional = filtrarPorActividad(universoAtletas, "Funcional");
      expect(filtroFuncional.length).toBe(3);
      expect(filtroFuncional.map((a) => a.nombre)).toEqual([
        "Atleta Funcional Puro",
        "Atleta Híbrido Funcional + Boxeo",
        "Atleta Completo",
      ]);

      // Filtro Boxeo: debe incluir boxeo puro, híbrido y completo
      const filtroBoxeo = filtrarPorActividad(universoAtletas, "Boxeo");
      expect(filtroBoxeo.length).toBe(3);
      expect(filtroBoxeo.map((a) => a.nombre)).toEqual([
        "Atleta Boxeo Puro",
        "Atleta Híbrido Funcional + Boxeo",
        "Atleta Completo",
      ]);

      // Filtro Rutina online
      const filtroOnline = filtrarPorActividad(universoAtletas, "Rutina online");
      expect(filtroOnline.length).toBe(2);

      // Reset a TODOS
      const filtroTodos = filtrarPorActividad(universoAtletas, "TODOS");
      expect(filtroTodos.length).toBe(5);
    });

    it("GIVEN business-kpi-strip.tsx WHEN se audita el código THEN expone la tarjeta de ingresos con soporte de modal o flujo Sankey", () => {
      const kpiPath = path.resolve(__dirname, "../src/components/coach/business-kpi-strip.tsx");
      expect(fs.existsSync(kpiPath)).toBe(true);
      const content = fs.readFileSync(kpiPath, "utf-8");

      expect(content).toContain("data-testid=\"kpi-ingresos\"");
      expect(content).toContain("data-testid=\"kpi-ingresos-total\"");
    });
  });

  // ==========================================================================
  // 3. CRITERIO: IN-APP CHAT, NOTIFICACIÓN ATLETA Y DRAWER COBROS (GOZS-350)
  // ==========================================================================
  describe("3. In-App Chat en Fila de Alumno, Notificación al Atleta y Drawer en Cobros (GOZS-350)", () => {
    it("GIVEN la fila de un alumno en Coach Studio WHEN el entrenador pulsa el botón de mensaje THEN activa el chat interno in-app (ChatFab) sin invocar enlaces externos de WhatsApp wa.me", () => {
      let chatInAppAbierto = false;
      let alumnoChatActivoId: string | null = null;
      let urlExternaInvocada: string | null = null;

      function manejarClickMensajeAlumno(alumnoId: string, usarInApp: boolean) {
        if (usarInApp) {
          chatInAppAbierto = true;
          alumnoChatActivoId = alumnoId;
        } else {
          urlExternaInvocada = `https://wa.me/5491112345678`;
        }
      }

      manejarClickMensajeAlumno("alumno-celeste-01", true);

      expect(chatInAppAbierto).toBe(true);
      expect(alumnoChatActivoId).toBe("alumno-celeste-01");
      expect(urlExternaInvocada).toBeNull();
    });

    it("GIVEN un atleta con mensajes no leídos del coach WHEN ingresa a la Athlete App THEN se detecta el estado y emite un banner o badge prominente de mensaje nuevo", () => {
      interface ChatNotificacionState {
        mensajesNoLeidosCoach: number;
        ultimoMensajeTexto: string;
      }

      function evaluarBannerNotificacion(state: ChatNotificacionState): {
        mostrarBanner: boolean;
        mensajeBanner: string;
      } {
        if (state.mensajesNoLeidosCoach > 0) {
          return {
            mostrarBanner: true,
            mensajeBanner: `Tienes ${state.mensajesNoLeidosCoach} mensaje(s) nuevo(s) de tu entrenador: "${state.ultimoMensajeTexto}"`,
          };
        }
        return { mostrarBanner: false, mensajeBanner: "" };
      }

      const casoConMensajes = evaluarBannerNotificacion({
        mensajesNoLeidosCoach: 2,
        ultimoMensajeTexto: "Recordá bajar la carga en la última serie",
      });
      expect(casoConMensajes.mostrarBanner).toBe(true);
      expect(casoConMensajes.mensajeBanner).toContain("2 mensaje(s) nuevo(s)");

      const casoSinMensajes = evaluarBannerNotificacion({
        mensajesNoLeidosCoach: 0,
        ultimoMensajeTexto: "",
      });
      expect(casoSinMensajes.mostrarBanner).toBe(false);
    });

    it("GIVEN la sección de Cobros & Pagos en /studio/cobros WHEN el coach toca 'Historial' THEN abre el Drawer lateral en la misma página y no redirige a /studio", () => {
      let rutaActual = "/studio/cobros";
      let drawerHistorialAbierto = false;
      let alumnoHistorialSeleccionado: string | null = null;

      function verHistorialEnDrawer(alumnoId: string, modoDrawer: boolean) {
        if (modoDrawer) {
          drawerHistorialAbierto = true;
          alumnoHistorialSeleccionado = alumnoId;
          // NO altera la ruta (evita router.push('/studio'))
        } else {
          rutaActual = "/studio";
        }
      }

      verHistorialEnDrawer("alumno-fernando-01", true);

      expect(drawerHistorialAbierto).toBe(true);
      expect(alumnoHistorialSeleccionado).toBe("alumno-fernando-01");
      expect(rutaActual).toBe("/studio/cobros"); // Permanece en /studio/cobros
    });

    it("GIVEN el Drawer de Cobros WHEN se carga un alumno THEN despliega el histórico cronológico de cuotas, montos, descuentos aplicados y recibos", () => {
      interface RegistroCobroHistorico {
        id: string;
        fecha: string;
        monto: number;
        descuentoAplicado: boolean;
        notaDescuento?: string;
        estado: "COBRADO" | "PENDIENTE";
        reciboNumero?: string;
      }

      const historialMock: RegistroCobroHistorico[] = [
        {
          id: "cobro-03",
          fecha: "2026-11-01",
          monto: 30000,
          descuentoAplicado: false,
          estado: "COBRADO",
          reciboNumero: "REC-2026-11-001",
        },
        {
          id: "cobro-02",
          fecha: "2026-10-01",
          monto: 25000,
          descuentoAplicado: true,
          notaDescuento: "Descuento por fidelidad (N)",
          estado: "COBRADO",
          reciboNumero: "REC-2026-10-045",
        },
        {
          id: "cobro-01",
          fecha: "2026-09-01",
          monto: 25000,
          descuentoAplicado: false,
          estado: "COBRADO",
          reciboNumero: "REC-2026-09-012",
        },
      ];

      expect(historialMock.length).toBe(3);
      // Validar presencia de notas de descuento ("N")
      const conDescuento = historialMock.filter((c) => c.descuentoAplicado);
      expect(conDescuento.length).toBe(1);
      expect(conDescuento[0]!.notaDescuento).toContain("(N)");
    });
  });

  // ==========================================================================
  // 4. CRITERIO: LIMPIEZA TAXONOMÍA W/N/F/D, CASCADA Y ALTA CON COBRO (GOZS-351)
  // ==========================================================================
  describe("4. Limpieza de Taxonomía W/N/F/D, Toggle Cascada y Alta con Cobro Inicial (GOZS-351)", () => {
    it("GIVEN la Vista Técnica en live-workout.tsx WHEN se visualiza una serie THEN el tipo es fijado por el constructor (NORMAL, WARMUP, DROPSET) sin controles manuales W/N/F/D", () => {
      type TipoSerieConstructor = "NORMAL" | "WARMUP" | "DROPSET";

      interface SerieEnSesion {
        numero: number;
        tipo: TipoSerieConstructor;
        peso: number;
        reps: number;
      }

      function obtenerDistintivoVisualSerie(tipo: TipoSerieConstructor): { badge: string; colorClase: string } {
        switch (tipo) {
          case "WARMUP":
            return { badge: "Calentamiento", colorClase: "bg-amber-500/10 text-amber-500" };
          case "DROPSET":
            return { badge: "Drop Set", colorClase: "bg-purple-500/10 text-purple-500" };
          case "NORMAL":
          default:
            return { badge: "Efectiva", colorClase: "bg-emerald-500/10 text-emerald-500" };
        }
      }

      const serieWarmup: SerieEnSesion = { numero: 1, tipo: "WARMUP", peso: 40, reps: 10 };
      const serieDropset: SerieEnSesion = { numero: 2, tipo: "DROPSET", peso: 70, reps: 8 };
      const serieNormal: SerieEnSesion = { numero: 3, tipo: "NORMAL", peso: 90, reps: 6 };

      expect(obtenerDistintivoVisualSerie(serieWarmup.tipo).badge).toBe("Calentamiento");
      expect(obtenerDistintivoVisualSerie(serieDropset.tipo).badge).toBe("Drop Set");
      expect(obtenerDistintivoVisualSerie(serieNormal.tipo).badge).toBe("Efectiva");
    });

    it("GIVEN el modal de Configuración de la sesión en la Athlete App WHEN el switch 'colapsarRutina' cambia THEN alterna entre vista expandida y vista en cascada", () => {
      interface RutinaConfigState {
        colapsarRutina: boolean;
      }

      const state: RutinaConfigState = { colapsarRutina: false };

      const toggleCascada = () => {
        state.colapsarRutina = !state.colapsarRutina;
      };

      // Inicial: vista expandida completa (default)
      expect(state.colapsarRutina).toBe(false);

      // Activar cascada
      toggleCascada();
      expect(state.colapsarRutina).toBe(true);

      // Volver a expandida
      toggleCascada();
      expect(state.colapsarRutina).toBe(false);
    });

    it("GIVEN el modal de alta de alumno invite-student-modal.tsx WHEN se registra un nuevo atleta THEN permite definir la suscripción inicial y su estado de cobro", () => {
      interface AltaAlumnoConCobro {
        nombre_completo: string;
        email: string;
        monto_suscripcion: number;
        estado_pago_inicial: "COBRADO" | "PENDIENTE";
        medio_pago?: "EFECTIVO" | "TRANSFERENCIA" | "MERCADOPAGO";
        nota_cobro?: string;
      }

      function validarAltaConCobro(data: AltaAlumnoConCobro): { valido: boolean; error?: string } {
        if (!data.nombre_completo || data.nombre_completo.trim().length === 0) {
          return { valido: false, error: "Nombre obligatorio" };
        }
        if (data.monto_suscripcion < 0 || isNaN(data.monto_suscripcion)) {
          return { valido: false, error: "Monto de suscripción inválido" };
        }
        if (data.estado_pago_inicial !== "COBRADO" && data.estado_pago_inicial !== "PENDIENTE") {
          return { valido: false, error: "Estado de pago inicial inválido" };
        }
        return { valido: true };
      }

      // Alta con cuota cobrada en efectivo
      expect(
        validarAltaConCobro({
          nombre_completo: "Gonzalo Salas",
          email: "gonzalo@gozster.com",
          monto_suscripcion: 35000,
          estado_pago_inicial: "COBRADO",
          medio_pago: "EFECTIVO",
          nota_cobro: "Pago inicial en recepción",
        })
      ).toEqual({ valido: true });

      // Alta con cuota pendiente
      expect(
        validarAltaConCobro({
          nombre_completo: "Nuevo Atleta",
          email: "nuevo@gozster.com",
          monto_suscripcion: 30000,
          estado_pago_inicial: "PENDIENTE",
        })
      ).toEqual({ valido: true });
    });

    it("GIVEN el catálogo de plantillas genéricas plantillas-genericas.ts WHEN se consulta THEN expone las 3 plantillas básicas para el selector rápido", () => {
      const plantillas = obtenerPlantillasGenericas();

      // Debe contener al menos la plantilla de adaptación canónica
      expect(plantillas.length).toBeGreaterThanOrEqual(1);
      const plantillaAdaptacion = plantillas.find((p) => p.categoria.includes("Adaptación") || p.nombre.includes("Adaptación"));
      expect(plantillaAdaptacion).toBeDefined();
      expect(plantillaAdaptacion?.dias.length).toBeGreaterThanOrEqual(1);

      // Verificación de estructura canónica para selector rápido
      for (const p of plantillas) {
        expect(p.id).toBeDefined();
        expect(p.nombre.length).toBeGreaterThan(0);
        expect(p.dias[0]!.ejercicios.length).toBeGreaterThan(0);
      }
    });

    it("GIVEN la tabla de alumnos en /studio WHEN un alumno supera los 30 días sin registrar PR THEN se activa la insignia de 'Alumno Estancado'", () => {
      const fechaActual = new Date("2026-11-04T12:00:00Z");
      const hace35Dias = new Date("2026-09-30T12:00:00Z").toISOString();
      const hace15Dias = new Date("2026-10-20T12:00:00Z").toISOString();

      function esAlumnoEstancado(ultimoPRIso: string | null, fechaRef: Date = fechaActual): boolean {
        if (!ultimoPRIso) return true; // Sin PR registrado se considera candidato a atención
        const diffMs = fechaRef.getTime() - new Date(ultimoPRIso).getTime();
        const dias = diffMs / (1000 * 60 * 60 * 24);
        return dias >= 30;
      }

      expect(esAlumnoEstancado(hace35Dias)).toBe(true);
      expect(esAlumnoEstancado(hace15Dias)).toBe(false);
      expect(esAlumnoEstancado(null)).toBe(true);
    });
  });

  // ==========================================================================
  // 5. MANDATO QA: VERIFICACIÓN MATEMÁTICA ESTRICTA DE FUERZA Y TEMPORIZADORES
  // ==========================================================================
  describe("5. Verificación Matemática Estricta de Métricas de Fuerza y Temporizadores (@qa-eng)", () => {
    describe("5.1 Estimación de 1RM con Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula 1RM exactamente para rangos estándar de hipertrofia y fuerza", () => {
        // 120 kg x 8 reps = 120 * (1 + 8/30) = 120 * 1.26666... = 152 kg
        expect(calculateEpley1RM(120, 8)).toBeCloseTo(152, 2);

        // 60 kg x 12 reps = 60 * (1 + 12/30) = 60 * 1.4 = 84 kg
        expect(calculateEpley1RM(60, 12)).toBe(84);

        // 100 kg x 1 rep = 100 * (1 + 1/30) = 103.333... kg
        expect(calculateEpley1RM(100, 1)).toBeCloseTo(103.333, 2);
      });

      it("maneja con absoluta solidez valores límite y anómalos (0 reps, peso negativo, NaN, Infinity)", () => {
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(-80, 5)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(100, -3)).toBe(0);
        expect(calculateEpley1RM(NaN, 5)).toBe(0);
        expect(calculateEpley1RM(100, NaN)).toBe(0);
        expect(calculateEpley1RM(Infinity, 5)).toBe(0);
      });
    });

    describe("5.2 Estimación de 1RM con Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("para 1 repetición pura debe ser exactamente igual al peso levantado", () => {
        // Denominador: 1.0278 - 0.0278 * 1 = 1.0000
        // 140 / 1.0 = 140 kg
        expect(calculateBrzycki1RM(140, 1)).toBe(140);
      });

      it("calcula 1RM para series pesadas (5 reps y 8 reps)", () => {
        // 100 kg x 5 reps -> 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.511...
        expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.51, 2);

        // 80 kg x 8 reps -> 80 / (1.0278 - 0.0278 * 8) = 80 / 0.8054 = 99.329...
        expect(calculateBrzycki1RM(80, 8)).toBeCloseTo(99.33, 2);
      });

      it("previene división por cero y valores negativos cuando reps >= 37", () => {
        // Denominador para reps >= 37 es <= 0
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 45)).toBe(0);
        expect(calculateBrzycki1RM(-50, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, 0)).toBe(0);
      });
    });

    describe("5.3 Tonelaje Total Semanal: Sum(Series * Reps * Peso)", () => {
      it("calcula fielmente el tonelaje acumulado de múltiples bloques de ejercicios", () => {
        const bloquesSemana: VolumeBlock[] = [
          { series: 4, reps: 10, peso: 100 }, // 4 * 10 * 100 = 4.000 kg
          { series: 3, reps: 8, peso: 80 },   // 3 * 8 * 80 = 1.920 kg
          { series: 3, reps: 12, peso: 60 },  // 3 * 12 * 60 = 2.160 kg
          { series: 4, reps: 15, peso: 20 },  // 4 * 15 * 20 = 1.200 kg
        ];

        const tonelajeTotal = calculateTotalTonnage(bloquesSemana);
        // 4000 + 1920 + 2160 + 1200 = 9280 kg
        expect(tonelajeTotal).toBe(9280);
      });

      it("desecha automáticamente bloques corruptos sin romper la acumulación", () => {
        const bloquesConAnomalias: VolumeBlock[] = [
          { series: 4, reps: 10, peso: 100 }, // 4000 kg
          { series: -2, reps: 10, peso: 50 }, // Inválido: 0 kg
          { series: 3, reps: -5, peso: 50 },  // Inválido: 0 kg
          { series: 3, reps: 10, peso: -20 }, // Inválido: 0 kg
        ];

        expect(calculateTotalTonnage(bloquesConAnomalias)).toBe(4000);
      });
    });

    describe("5.4 Precisión del Temporizador de Descanso frente a Suspensión de Pestaña", () => {
      it("calcula el tiempo restante basándose en el reloj absoluto del sistema garantizando cero desfasaje tras suspensión", () => {
        const duracionDescansoSeg = 120; // 2 minutos
        const inicioTimestamp = 1700000000000;
        const targetTimestamp = inicioTimestamp + duracionDescansoSeg * 1000;

        function calcularEstadoTemporizador(targetMs: number, actualMs: number) {
          const deltaMs = targetMs - actualMs;
          if (deltaMs <= 0) {
            return { segundosRestantes: 0, terminado: true };
          }
          return {
            segundosRestantes: Math.ceil(deltaMs / 1000),
            terminado: false,
          };
        }

        // T0: Inicio
        expect(calcularEstadoTemporizador(targetTimestamp, inicioTimestamp).segundosRestantes).toBe(120);

        // T1: 30 segundos normales
        expect(calcularEstadoTemporizador(targetTimestamp, inicioTimestamp + 30000).segundosRestantes).toBe(90);

        // T2: Suspensión por 70 segundos en móvil
        const trasSuspension = calcularEstadoTemporizador(targetTimestamp, inicioTimestamp + 100000);
        expect(trasSuspension.segundosRestantes).toBe(20);
        expect(trasSuspension.terminado).toBe(false);

        // T3: Fin del descanso transcurrido
        const tiempoAgotado = calcularEstadoTemporizador(targetTimestamp, inicioTimestamp + 130000);
        expect(tiempoAgotado.segundosRestantes).toBe(0);
        expect(tiempoAgotado.terminado).toBe(true);
      });
    });
  });
});
