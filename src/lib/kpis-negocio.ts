import type { Database } from "@/types/database.types";

export interface PeriodoKpisNegocio {
  p_desde: string; // "YYYY-MM-DD"
  p_hasta: string; // "YYYY-MM-DD"
  mesAnteriorLabel: string; // ej. "sept."
}

/**
 * Período para la RPC obtener_kpis_negocio:
 * Del día 1 del mes en curso a hoy (hora de Argentina).
 * El período anterior es el mes previo completo.
 */
export function calcularPeriodoMesEnCurso(ahora: Date = new Date()): PeriodoKpisNegocio {
  const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hoyIso = formateador.format(ahora);
  const [anioStr, mesStr] = hoyIso.split("-");
  const anio = Number(anioStr);
  const mes = Number(mesStr);

  const p_desde = `${anioStr}-${mesStr}-01`;
  const p_hasta = hoyIso;

  // Mes previo completo (para el label de comparación)
  const mesAnterior = new Date(anio, mes - 2, 1);
  const mesAnteriorLabel = new Intl.DateTimeFormat("es-AR", { month: "short" }).format(mesAnterior);

  return { p_desde, p_hasta, mesAnteriorLabel };
}

export type RpcKpiRow = Database["public"]["Functions"]["obtener_kpis_negocio"]["Returns"][number];

export interface KpisNegocioDatos {
  ingresos_mes: number;
  ingresos_presencial?: number;
  ingresos_online?: number;
  a_cobrar?: number;
  ingresos_variacion_pct: number | null;
  ingresos_mes_anterior_label: string;
  ingresos_ultimos_6_meses: number[];
  cobranza_pct: number | null;
  cobranza_faltante: number;
  cobranza_vencidas: number;
  sin_entrenar_7d_ids: string[];
  alumnos_activos: number;
  altas_mes: number;
  bajas_mes: number;
}

export function mapearRpcAKpis(row: RpcKpiRow, mesAnteriorLabel: string): KpisNegocioDatos {
  const ingresos = Number(row.ingresos ?? 0);
  const anterior = Number(row.ingresos_periodo_anterior ?? 0);
  const esperada = Number(row.cobranza_esperada ?? 0);
  const pendiente = Number(row.cobranza_pendiente_monto ?? 0);
  const vencidas = Number(row.cobranza_vencidas_cant ?? 0);
  const sinEntrenarIds: string[] = row.sin_entrenar_7d_ids ?? [];
  const activosFin = Number(row.activos_fin ?? 0);
  const altas = Number(row.altas ?? 0);
  const bajas = Number(row.bajas ?? 0);
  const ultimos6 = Array.isArray(row.ingresos_6m) ? row.ingresos_6m.map(Number) : [];

  const rowAny = row as Record<string, unknown>;
  const presencial =
    rowAny.ingresos_presencial !== undefined ? Number(rowAny.ingresos_presencial) : undefined;
  const online =
    rowAny.ingresos_online !== undefined ? Number(rowAny.ingresos_online) : undefined;
  const aCobrar =
    rowAny.a_cobrar !== undefined ? Number(rowAny.a_cobrar) : Math.round(pendiente);

  // Variación de ingresos: (ingresos − anterior) / anterior. Si anterior = 0, mostrar "—".
  const ingresosVariacionPct =
    anterior > 0 ? Math.round(((ingresos - anterior) / anterior) * 100) : null;

  // Cobranza: (esperada − pendiente) / esperada. Si esperada = 0, mostrar "—".
  const cobranzaPct =
    esperada > 0 ? Math.round(((esperada - pendiente) / esperada) * 100) : null;

  return {
    ingresos_mes: ingresos,
    ingresos_presencial: presencial,
    ingresos_online: online,
    a_cobrar: aCobrar,
    ingresos_variacion_pct: ingresosVariacionPct,
    ingresos_mes_anterior_label: mesAnteriorLabel,
    ingresos_ultimos_6_meses: ultimos6,
    cobranza_pct: cobranzaPct,
    cobranza_faltante: Math.round(pendiente),
    cobranza_vencidas: vencidas,
    sin_entrenar_7d_ids: sinEntrenarIds,
    alumnos_activos: activosFin,
    altas_mes: altas,
    bajas_mes: bajas,
  };
}
