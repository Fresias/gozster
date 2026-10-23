// Ejemplos numéricos de la sección Documentación (GOZS-142).
// Cada número sale de llamar a las funciones reales: si cambia una fórmula, cambia la guía.
import { esAlumnoNuevo } from "@/lib/alumno-nuevo";
import { computeAnchoredRenewalDate, derivarEstadoContratacion } from "@/lib/contrataciones";
import { esSinEntrenar7d } from "@/lib/sin-entrenar";
import {
  calculateBrzycki1RM,
  calculateEffectiveVolume,
  calculateEpley1RM,
  calculateStudentHealthScore,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";

const DIA = 86_400_000;
const ARS = new Intl.NumberFormat("es-AR");

/** Pesos argentinos con separador de miles: `$ 25.000`. */
export const formatoPesos = (n: number) => `$ ${ARS.format(Math.round(n))}`;
const un = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** Pagos confirmados de ejemplo (monto en $) para ingresos del mes y del mes anterior. */
const PAGOS_MES = [25_000, 25_000, 40_000, 40_000, 40_000];
const PAGOS_MES_ANTERIOR = [25_000, 40_000, 40_000, 40_000];
const suma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function calcularEjemplosDocumentacion(ahora: number = Date.parse("2026-10-20T12:00:00Z")) {
  const hoy = new Date(ahora).toISOString().slice(0, 10);

  // Contrataciones y ciclo fijo: vence el 10, paga el 18, vuelve a vencer el 10 del mes siguiente.
  const proximoVencimiento = computeAnchoredRenewalDate("2026-10-10", 10);
  const estados = {
    vigente: derivarEstadoContratacion("2026-10-10", 5, "2026-09-20"),
    porVencer: derivarEstadoContratacion("2026-10-10", 5, "2026-10-05"),
    vencida: derivarEstadoContratacion("2026-10-10", 5, "2026-10-11"),
  };

  // Ingresos y cobranza (la cuenta vive en la base; acá se repite con los pagos de ejemplo).
  const ingresos = suma(PAGOS_MES);
  const ingresosAnterior = suma(PAGOS_MES_ANTERIOR);
  const variacionPct = Math.round(((ingresos - ingresosAnterior) / ingresosAnterior) * 100);
  const cuotasPendientes = [25_000, 40_000]; // cuotas con fecha de cobro cumplida y sin pagar
  const pendiente = suma(cuotasPendientes);
  const vencidas = [
    derivarEstadoContratacion("2026-10-10", 5, hoy),
    derivarEstadoContratacion("2026-10-15", 5, hoy),
    derivarEstadoContratacion("2026-10-28", 5, hoy),
  ].filter((e) => e === "VENCIDA").length;

  // Actividad
  const celeste = { estado_membresia: "ACTIVA", ultimo_entreno_at: new Date(ahora - 3 * 3_600_000).toISOString() };
  const facundo = { estado_membresia: "ACTIVA", ultimo_entreno_at: new Date(ahora - 9 * DIA).toISOString() };
  const nuevo = esAlumnoNuevo(new Date(ahora - 30 * DIA).toISOString(), ahora);
  const noNuevo = esAlumnoNuevo(new Date(ahora - 120 * DIA).toISOString(), ahora);

  // Fuerza
  const epley = calculateEpley1RM(80, 5);
  const brzycki = calculateBrzycki1RM(80, 5);
  const tonelaje = calculateTotalTonnage([
    { series: 3, reps: 10, peso: 60 },
    { series: 4, reps: 8, peso: 80 },
  ]);
  const volumenEfectivo = calculateEffectiveVolume([
    { peso_kg: 40, reps_hechas: 10, set_type: "WARMUP" },
    { peso_kg: 80, reps_hechas: 5, set_type: "NORMAL" },
    { peso_kg: 80, reps_hechas: 5, set_type: "NORMAL" },
  ]);
  const salud = calculateStudentHealthScore({ adherencia: 80, frecuencia: 75, interaccionChat: 70, estadoCuota: 100 });
  const pesoPrevio = 70;
  const pesoHoy = 75;

  return {
    ciclo: { proximoVencimiento },
    estados,
    ingresos: { mes: formatoPesos(ingresos), anterior: formatoPesos(ingresosAnterior), variacionPct },
    cobranza: {
      esperada: formatoPesos(ingresos + pendiente),
      pendiente: formatoPesos(pendiente),
      vencidas,
    },
    actividad: { celesteSinEntrenar: esSinEntrenar7d(celeste, ahora), facundoSinEntrenar: esSinEntrenar7d(facundo, ahora), nuevo, noNuevo },
    fuerza: {
      epley: un(epley),
      brzycki: un(brzycki),
      tonelaje: `${ARS.format(tonelaje)} kg`,
      volumenEfectivo: `${ARS.format(volumenEfectivo)} kg`,
      saludPuntaje: un(salud.score),
      saludEstado: salud.badgeLabel,
      sobrecargaDelta: `+${pesoHoy - pesoPrevio} kg`,
    },
  };
}

export type EjemplosDocumentacion = ReturnType<typeof calcularEjemplosDocumentacion>;
