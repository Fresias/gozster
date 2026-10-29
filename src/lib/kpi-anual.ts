export type ActividadKpi = "TODAS" | "FUNCIONAL" | "BOXEO" | "RUTINAS";

export interface PagoMensualInput {
  id?: string;
  monto: number;
  montoCobrado?: number;
  fechaPago: string | Date;
  actividad?: string | null;
  servicioNombre?: string | null;
  tipoServicio?: string | null;
  notas?: string;
}

export interface MesKpiIngreso {
  mesNumero: number; // 1..12
  mesClave: string; // "ene" | "feb" | ... | "dic"
  mesNombre: string; // "Enero" | "Febrero" | ... | "Diciembre"
  mesCorto: string; // "Ene" | "Feb" | ... | "Dic"
  ingresos: number;
  desagregado: {
    funcional: number;
    boxeo: number;
    rutinas: number;
  };
  cantidadPagos: number;
}

export interface KpiAnualResultado {
  anio: number;
  actividadFiltro: ActividadKpi;
  totalAnual: number;
  meses: MesKpiIngreso[];
  desagregadoAnual: {
    funcional: number;
    boxeo: number;
    rutinas: number;
  };
}

export const MESES_CALENDARIO = [
  { numero: 1, clave: "ene", corto: "Ene", nombre: "Enero" },
  { numero: 2, clave: "feb", corto: "Feb", nombre: "Febrero" },
  { numero: 3, clave: "mar", corto: "Mar", nombre: "Marzo" },
  { numero: 4, clave: "abr", corto: "Abr", nombre: "Abril" },
  { numero: 5, clave: "may", corto: "May", nombre: "Mayo" },
  { numero: 6, clave: "jun", corto: "Jun", nombre: "Junio" },
  { numero: 7, clave: "jul", corto: "Jul", nombre: "Julio" },
  { numero: 8, clave: "ago", corto: "Ago", nombre: "Agosto" },
  { numero: 9, clave: "sep", corto: "Sep", nombre: "Septiembre" },
  { numero: 10, clave: "oct", corto: "Oct", nombre: "Octubre" },
  { numero: 11, clave: "nov", corto: "Nov", nombre: "Noviembre" },
  { numero: 12, clave: "dic", corto: "Dic", nombre: "Diciembre" },
] as const;

/**
 * Normaliza y clasifica la actividad de un pago entre las tres opciones clave del coach:
 * - FUNCIONAL
 * - BOXEO (box)
 * - RUTINAS (rutinas online / asesoría)
 */
export function categorizarActividad(
  actividad?: string | null,
  servicioNombre?: string | null,
  tipoServicio?: string | null,
): "FUNCIONAL" | "BOXEO" | "RUTINAS" {
  const act = (actividad ?? "").trim().toUpperCase();
  const serv = (servicioNombre ?? "").trim().toUpperCase();
  const tipo = (tipoServicio ?? "").trim().toUpperCase();

  if (
    act === "BOXEO" ||
    act === "BOX" ||
    serv.includes("BOXEO") ||
    serv.includes("BOX")
  ) {
    return "BOXEO";
  }

  if (act === "FUNCIONAL" || serv.includes("FUNCIONAL")) {
    return "FUNCIONAL";
  }

  if (
    act === "RUTINAS" ||
    act === "RUTINA" ||
    serv.includes("RUTINA") ||
    serv.includes("ONLINE") ||
    serv.includes("ASESORÍA") ||
    serv.includes("ASESORIA") ||
    tipo === "ASESORIA_ONLINE"
  ) {
    return "RUTINAS";
  }

  return "RUTINAS";
}

/**
 * Parsea año y mes (1-12) de una fecha ISO o string "YYYY-MM-DD" o Date.
 * Considera zona horaria de Argentina (UTC-3) para ISO strings con hora.
 */
export function extraerAnioYMes(fechaInput: string | Date): { anio: number; mes: number } | null {
  if (fechaInput instanceof Date) {
    if (isNaN(fechaInput.getTime())) return null;
    return {
      anio: fechaInput.getFullYear(),
      mes: fechaInput.getMonth() + 1,
    };
  }

  if (typeof fechaInput !== "string") return null;
  const str = fechaInput.trim();
  if (!str) return null;

  // Formato simple YYYY-MM o YYYY-MM-DD
  const matchSimple = str.match(/^(\d{4})-(\d{1,2})/);
  if (matchSimple && !str.includes("T")) {
    return {
      anio: parseInt(matchSimple[1]!, 10),
      mes: parseInt(matchSimple[2]!, 10),
    };
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;

  try {
    const formateador = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
    });
    const partes = formateador.format(d).split("-");
    return {
      anio: parseInt(partes[0]!, 10),
      mes: parseInt(partes[1]!, 10),
    };
  } catch {
    return {
      anio: d.getFullYear(),
      mes: d.getMonth() + 1,
    };
  }
}

/**
 * Calcula los ingresos mensuales de enero a diciembre (12 meses)
 * y el desglose por actividad (funcional / box / rutinas).
 */
export function calcularKpiAnualIngresos(
  pagos: PagoMensualInput[],
  anioObjetivo?: number,
  filtroActividad: ActividadKpi = "TODAS",
): KpiAnualResultado {
  // Determinar año objetivo: si no se pasa, extraer del primer pago con fecha válida o año actual
  let anio = anioObjetivo;
  if (!anio) {
    for (const p of pagos) {
      const fecha = extraerAnioYMes(p.fechaPago);
      if (fecha) {
        anio = fecha.anio;
        break;
      }
    }
  }
  if (!anio) {
    anio = new Date().getFullYear();
  }

  // Inicializar los 12 meses (enero a diciembre)
  const meses: MesKpiIngreso[] = MESES_CALENDARIO.map((m) => ({
    mesNumero: m.numero,
    mesClave: m.clave,
    mesNombre: m.nombre,
    mesCorto: m.corto,
    ingresos: 0,
    desagregado: {
      funcional: 0,
      boxeo: 0,
      rutinas: 0,
    },
    cantidadPagos: 0,
  }));

  const desagregadoAnual = {
    funcional: 0,
    boxeo: 0,
    rutinas: 0,
  };

  let totalAnual = 0;

  for (const pago of pagos) {
    const fecha = extraerAnioYMes(pago.fechaPago);
    if (!fecha) continue;
    if (fecha.anio !== anio) continue;
    if (fecha.mes < 1 || fecha.mes > 12) continue;

    const monto = Number(pago.montoCobrado ?? pago.monto ?? 0);
    if (isNaN(monto) || monto <= 0) continue;

    const categoria = categorizarActividad(
      pago.actividad,
      pago.servicioNombre,
      pago.tipoServicio,
    );

    const mesItem = meses[fecha.mes - 1]!;

    // Sumar siempre al desagregado general del mes y anual
    if (categoria === "FUNCIONAL") {
      mesItem.desagregado.funcional += monto;
      desagregadoAnual.funcional += monto;
    } else if (categoria === "BOXEO") {
      mesItem.desagregado.boxeo += monto;
      desagregadoAnual.boxeo += monto;
    } else {
      mesItem.desagregado.rutinas += monto;
      desagregadoAnual.rutinas += monto;
    }

    // Aplicar filtro de actividad al ingreso visualizado del mes y total
    const coincideFiltro =
      filtroActividad === "TODAS" ||
      filtroActividad === categoria ||
      (filtroActividad === ("BOX" as any) && categoria === "BOXEO") ||
      (filtroActividad === ("RUTINA" as any) && categoria === "RUTINAS");

    if (coincideFiltro) {
      mesItem.ingresos += monto;
      mesItem.cantidadPagos += 1;
      totalAnual += monto;
    }
  }

  return {
    anio,
    actividadFiltro: filtroActividad,
    totalAnual,
    meses,
    desagregadoAnual,
  };
}
