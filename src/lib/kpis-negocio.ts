import type { Database } from "@/types/database.types";

export interface PeriodoKpisNegocio {
  p_desde: string; // "YYYY-MM-DD"
  p_hasta: string; // "YYYY-MM-DD"
  mesAnteriorLabel: string; // ej. "sept."
}

export type TipoRangoPeriodo = "mes" | "semana" | "anio" | "hoy" | "trimestre";

export interface RangoPeriodoResultado {
  desde: string; // "YYYY-MM-DD"
  hasta: string; // "YYYY-MM-DD"
}

/**
 * Delimita el rango de fechas en hora de Argentina (America/Argentina/Buenos_Aires).
 * Para 'mes': desde el 1 del mes hasta el último día del mes.
 * Para 'semana': lunes a domingo de la semana civil en hora de Argentina.
 * Para 'trimestre': primer día del trimestre calendario (Q1..Q4) al último día del trimestre.
 */
export function rangoPeriodo(
  tipo: TipoRangoPeriodo | string = "mes",
  fecha: Date = new Date(),
): RangoPeriodoResultado {
  const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fechaIso = formateador.format(fecha);
  const [anioStr, mesStr, diaStr] = fechaIso.split("-");
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);

  if (tipo === "mes") {
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const desde = `${anioStr}-${mesStr}-01`;
    const hasta = `${anioStr}-${mesStr}-${String(ultimoDia).padStart(2, "0")}`;
    return { desde, hasta };
  }

  if (tipo === "anio" || tipo === "año") {
    return {
      desde: `${anioStr}-01-01`,
      hasta: `${anioStr}-12-31`,
    };
  }

  if (tipo === "trimestre") {
    const startMonth = Math.floor((mes - 1) / 3) * 3 + 1;
    const endMonth = startMonth + 2;
    const ultimoDia = new Date(Date.UTC(anio, endMonth, 0)).getUTCDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const desde = `${anioStr}-${pad(startMonth)}-01`;
    const hasta = `${anioStr}-${pad(endMonth)}-${pad(ultimoDia)}`;
    return { desde, hasta };
  }

  if (tipo === "semana") {
    const fechaCivil = new Date(Date.UTC(anio, mes - 1, dia));
    const dayOfWeek = fechaCivil.getUTCDay();
    const diffLunes = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const lunesUtc = new Date(fechaCivil.getTime() + diffLunes * 86_400_000);
    const domingoUtc = new Date(lunesUtc.getTime() + 6 * 86_400_000);

    const pad = (n: number) => String(n).padStart(2, "0");
    const desde = `${lunesUtc.getUTCFullYear()}-${pad(lunesUtc.getUTCMonth() + 1)}-${pad(lunesUtc.getUTCDate())}`;
    const hasta = `${domingoUtc.getUTCFullYear()}-${pad(domingoUtc.getUTCMonth() + 1)}-${pad(domingoUtc.getUTCDate())}`;
    return { desde, hasta };
  }

  if (tipo === "hoy") {
    return {
      desde: fechaIso,
      hasta: fechaIso,
    };
  }

  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    desde: `${anioStr}-${mesStr}-01`,
    hasta: `${anioStr}-${mesStr}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

/**
 * Valida si el rol tiene visibilidad de montos monetarios (solo ADMIN).
 */
export function puedeVerMontos(rol?: string | null): boolean {
  if (!rol) return false;
  return rol.toUpperCase() === "ADMIN";
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

export interface KpisNegocio {
  // Canónicos requeridos por Gherkin:
  cobrado: number | null;
  porCobrar: number | null;
  vencido: number | null;
  facturado: number | null;
  tasaCobroPct: number | null;

  // Desglose por canal:
  ingresos_presencial: number | null;
  ingresos_online: number | null;

  // Alumnos y estados:
  alumnos_activos: number;
  cantActivas?: number;
  alumnos_al_dia: number;
  alumnosAlDia: number;
  alumnos_morosos: number;
  alumnosMorosos: number;

  // Métricas operativas y retención:
  sin_entrenar_7d_ids: string[];
  altas_mes: number;
  bajas_mes: number;

  // Histórico y compatibilidad business-kpi-strip:
  ingresos_mes: number;
  ingresos_variacion_pct: number | null;
  ingresos_mes_anterior_label: string;
  ingresos_ultimos_6_meses: number[];
  a_cobrar: number | null;
  cobranza_pct: number | null;
  cobranza_faltante: number;
  cobranza_vencidas: number;
}

export type KpisNegocioDatos = KpisNegocio;

export function mapearRpcAKpis(
  row: RpcKpiRow | Record<string, unknown>,
  mesAnteriorLabel: string,
  rol: string = "ADMIN",
): KpisNegocio {
  const rowAny = row as Record<string, unknown>;
  const rolPermitido = puedeVerMontos(rol);

  const activos = Number(rowAny.activos_fin ?? rowAny.alumnos_activos ?? 0);
  const vencidasCant = Number(rowAny.cobranza_vencidas_cant ?? rowAny.cobranza_vencidas ?? 0);
  const morosos = Number(rowAny.alumnos_morosos ?? rowAny.alumnosMorosos ?? vencidasCant);
  const alDia = Number(rowAny.alumnos_al_dia ?? rowAny.alumnosAlDia ?? Math.max(0, activos - morosos));
  const altas = Number(rowAny.altas ?? rowAny.altas_mes ?? 0);
  const bajas = Number(rowAny.bajas ?? rowAny.bajas_mes ?? 0);
  const sinEntrenar: string[] = Array.isArray(rowAny.sin_entrenar_7d_ids)
    ? (rowAny.sin_entrenar_7d_ids as string[])
    : [];

  if (!rolPermitido || rowAny.ingresos === null) {
    return {
      cobrado: null,
      porCobrar: null,
      vencido: null,
      facturado: null,
      tasaCobroPct: null,

      ingresos_presencial: null,
      ingresos_online: null,

      alumnos_activos: activos,
      cantActivas: activos,
      alumnos_al_dia: alDia,
      alumnosAlDia: alDia,
      alumnos_morosos: morosos,
      alumnosMorosos: morosos,

      sin_entrenar_7d_ids: sinEntrenar,
      altas_mes: altas,
      bajas_mes: bajas,

      ingresos_mes: (null as unknown) as number,
      ingresos_variacion_pct: null,
      ingresos_mes_anterior_label: mesAnteriorLabel,
      ingresos_ultimos_6_meses: [],
      a_cobrar: null,
      cobranza_pct: null,
      cobranza_faltante: (null as unknown) as number,
      cobranza_vencidas: vencidasCant,
    };
  }

  const ingresos = Number(rowAny.ingresos ?? 0);
  const anterior = Number(rowAny.ingresos_periodo_anterior ?? 0);
  const pendiente = Number(rowAny.cobranza_pendiente_monto ?? 0);
  const ultimos6 = Array.isArray(rowAny.ingresos_6m) ? (rowAny.ingresos_6m as any[]).map(Number) : [];

  const vencido = rowAny.cobranza_vencida_monto !== undefined && rowAny.cobranza_vencida_monto !== null
    ? Number(rowAny.cobranza_vencida_monto)
    : Number(rowAny.vencido ?? (vencidasCant > 0 && pendiente > 0 ? pendiente : 0));

  const porCobrar = rowAny.cobranza_por_vencer_monto !== undefined && rowAny.cobranza_por_vencer_monto !== null
    ? Number(rowAny.cobranza_por_vencer_monto)
    : Number(rowAny.porCobrar ?? Math.max(0, pendiente - vencido));

  const cobrado = rowAny.cobrado !== undefined && rowAny.cobrado !== null
    ? Number(rowAny.cobrado)
    : ingresos;

  const facturado = rowAny.facturado !== undefined && rowAny.facturado !== null
    ? Number(rowAny.facturado)
    : cobrado + porCobrar + vencido;

  const tasaCobroPct = facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0;

  const presencial = rowAny.ingresos_presencial !== undefined && rowAny.ingresos_presencial !== null
    ? Number(rowAny.ingresos_presencial)
    : (rowAny.ingresosPresencial !== undefined ? Number(rowAny.ingresosPresencial) : ingresos);

  const online = rowAny.ingresos_online !== undefined && rowAny.ingresos_online !== null
    ? Number(rowAny.ingresos_online)
    : (rowAny.ingresosOnline !== undefined ? Number(rowAny.ingresosOnline) : 0);

  const aCobrar = rowAny.a_cobrar !== undefined && rowAny.a_cobrar !== null
    ? Number(rowAny.a_cobrar)
    : Math.round(pendiente > 0 ? pendiente : vencido + porCobrar);

  const ingresosVariacionPct =
    anterior > 0 ? Math.round(((ingresos - anterior) / anterior) * 100) : null;

  const esperada = rowAny.cobranza_esperada !== undefined && rowAny.cobranza_esperada !== null
    ? Number(rowAny.cobranza_esperada)
    : facturado;
  const cobranzaPct =
    esperada > 0 ? Math.round(((esperada - pendiente) / esperada) * 100) : null;

  return {
    cobrado,
    porCobrar,
    vencido,
    facturado,
    tasaCobroPct,

    ingresos_presencial: presencial,
    ingresos_online: online,

    alumnos_activos: activos,
    cantActivas: activos,
    alumnos_al_dia: alDia,
    alumnosAlDia: alDia,
    alumnos_morosos: morosos,
    alumnosMorosos: morosos,

    sin_entrenar_7d_ids: sinEntrenar,
    altas_mes: altas,
    bajas_mes: bajas,

    ingresos_mes: ingresos,
    ingresos_variacion_pct: ingresosVariacionPct,
    ingresos_mes_anterior_label: mesAnteriorLabel,
    ingresos_ultimos_6_meses: ultimos6,
    a_cobrar: aCobrar,
    cobranza_pct: cobranzaPct,
    cobranza_faltante: Math.round(pendiente > 0 ? pendiente : vencido + porCobrar),
    cobranza_vencidas: vencidasCant,
  };
}

export interface ObtenerKpisNegocioOptions {
  supabase?: any;
  rol?: string | null;
  desde?: string;
  hasta?: string;
  fecha?: Date;
  mesAnteriorLabel?: string;
  row?: RpcKpiRow | Record<string, unknown>;
}

export async function obtenerKpisNegocio(
  clientOrOptions?: any,
  maybeOptions?: ObtenerKpisNegocioOptions,
): Promise<KpisNegocio> {
  let client: any = null;
  let opts: ObtenerKpisNegocioOptions = {};

  if (clientOrOptions && typeof clientOrOptions.rpc === "function") {
    client = clientOrOptions;
    opts = maybeOptions ?? {};
  } else if (clientOrOptions && typeof clientOrOptions === "object") {
    opts = clientOrOptions;
    client = opts.supabase ?? null;
  }

  const rol = opts.rol ?? "ADMIN";
  const fecha = opts.fecha ?? new Date();
  const periodo = calcularPeriodoMesEnCurso(fecha);
  const mesAnteriorLabel = opts.mesAnteriorLabel ?? periodo.mesAnteriorLabel;

  if (opts.row) {
    return mapearRpcAKpis(opts.row, mesAnteriorLabel, rol);
  }

  if (!client) {
    if (!puedeVerMontos(rol)) {
      return mapearRpcAKpis(
        {
          ingresos: null,
          ingresos_6m: null,
          ingresos_periodo_anterior: null,
          cobranza_esperada: null,
          cobranza_pendiente_monto: null,
          cobranza_vencidas_cant: 0,
          sin_entrenar_7d_ids: [],
          activos_fin: 0,
          altas: 0,
          bajas: 0,
          ingresos_presencial: null,
          ingresos_online: null,
          cobranza_vencida_monto: null,
          cobranza_por_vencer_monto: null,
          alumnos_al_dia: 0,
          alumnos_morosos: 0,
        },
        mesAnteriorLabel,
        rol,
      );
    }
    throw new Error("Cliente Supabase requerido para obtener KPIs de negocio");
  }

  const rango = rangoPeriodo("mes", fecha);
  const p_desde = opts.desde ?? periodo.p_desde ?? rango.desde;
  const p_hasta = opts.hasta ?? periodo.p_hasta ?? rango.hasta;

  const { data, error } = await client.rpc("obtener_kpis_negocio", { p_desde, p_hasta });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return mapearRpcAKpis(row, mesAnteriorLabel, rol);
}
