import type { Contratacion, Perfil, PlanEntrenamiento } from "@/types/database.types";
import type { CobroItem } from "@/store/use-cobros-store";
import { DEMO_PLANES_MEMBRESIA } from "@/services/coach-demo-dataset";

export interface ActividadFrecuenciaInfo {
  tipo: "FUNCIONAL" | "BOXEO" | "PASE_LIBRE" | "RUTINA";
  etiqueta: string;
  detalle: string;
  vecesPorSemana: number | null;
}

export interface EstadoPagoInfo {
  pago: boolean;
  estado: "PAGADO" | "VENCIDO" | "PENDIENTE";
  etiquetaPrincipal: "Pagó" | "No pagó";
  etiquetaDetalle: string;
}

export interface MontoSuscripcionInfo {
  monto: number;
  montoLista?: number;
  descuento?: number;
  formateado: string;
}

export function formatearDinero(valor: number): string {
  return `$ ${valor.toLocaleString("es-AR")}`;
}

export function derivarActividadFrecuencia(params: {
  contratacion?: Contratacion | null;
  rutinaActiva?: PlanEntrenamiento | null;
  cobroItem?: CobroItem | null;
  planMembresiaNombre?: string | null;
  limiteSemanal?: number | null;
}): ActividadFrecuenciaInfo {
  const { contratacion, rutinaActiva, cobroItem, planMembresiaNombre, limiteSemanal } = params;

  const servicio = (cobroItem?.servicioNombre ?? planMembresiaNombre ?? "").toLowerCase();
  const planId = (contratacion?.plan_membresia_id ?? "").toLowerCase();
  const actividadContratacion = contratacion?.actividad ?? cobroItem?.actividad ?? null;

  // 1. Pase libre (Funcional + Boxeo sin límite semanal)
  const esPaseLibre =
    servicio.includes("pase libre") ||
    servicio.includes("libre") ||
    planId.includes("libre") ||
    planId === "demo-plan-pase-libre" ||
    (contratacion?.plan_membresia_id && !actividadContratacion && contratacion.tipo_servicio === "PRESENCIAL");

  if (esPaseLibre) {
    return {
      tipo: "PASE_LIBRE",
      etiqueta: "Pase libre",
      detalle: "Funcional + Boxeo sin límite semanal",
      vecesPorSemana: null,
    };
  }

  // Helper para extraer veces por semana (ej. "2x", "3 veces", "1 clase")
  const extraerVeces = (str: string): number | null => {
    const match = str.match(/(\d+)\s*x/i) || str.match(/(\d+)\s*veces/i) || str.match(/(\d+)\s*clase/i);
    const numStr = match?.[1];
    return numStr ? parseInt(numStr, 10) : null;
  };

  const vecesDetectadas =
    limiteSemanal ??
    extraerVeces(servicio) ??
    extraerVeces(planId) ??
    (planId === "demo-plan-funcional-2x" ? 2 : null);

  // 2. Boxeo
  const esBoxeo =
    actividadContratacion === "BOXEO" ||
    servicio.includes("boxeo") ||
    planId.includes("boxeo");

  if (esBoxeo) {
    const veces = vecesDetectadas ?? 2;
    const etiquetaVeces = `${veces} ${veces === 1 ? "vez" : "veces"} por semana`;
    return {
      tipo: "BOXEO",
      etiqueta: `Boxeo (${etiquetaVeces})`,
      detalle: `${veces} clases semanales de Boxeo`,
      vecesPorSemana: veces,
    };
  }

  // 3. Funcional
  const esFuncional =
    actividadContratacion === "FUNCIONAL" ||
    servicio.includes("funcional") ||
    planId.includes("funcional") ||
    planId === "demo-plan-funcional-2x";

  if (esFuncional) {
    const veces = vecesDetectadas ?? 2;
    const etiquetaVeces = `${veces} ${veces === 1 ? "vez" : "veces"} por semana`;
    return {
      tipo: "FUNCIONAL",
      etiqueta: `Funcional (${etiquetaVeces})`,
      detalle: `${veces} clases semanales de Funcional`,
      vecesPorSemana: veces,
    };
  }

  // 4. Rutina / Asesoría Online
  return {
    tipo: "RUTINA",
    etiqueta: "Rutina",
    detalle: rutinaActiva ? `Rutina asignada: ${rutinaActiva.nombre}` : "Rutina de entrenamiento personalizada",
    vecesPorSemana: null,
  };
}

export function derivarEstadoPagoAlumno(params: {
  cobroItem?: CobroItem | null;
  contratacion?: Contratacion | null;
  alumno?: Perfil | null;
  pagoRegistradoEnSesion?: boolean;
}): EstadoPagoInfo {
  const { cobroItem, contratacion, alumno, pagoRegistradoEnSesion } = params;

  if (pagoRegistradoEnSesion) {
    return {
      pago: true,
      estado: "PAGADO",
      etiquetaPrincipal: "Pagó",
      etiquetaDetalle: "Al día",
    };
  }

  if (cobroItem) {
    if (cobroItem.estado === "PAGADO") {
      return {
        pago: true,
        estado: "PAGADO",
        etiquetaPrincipal: "Pagó",
        etiquetaDetalle: "Al día",
      };
    }
    if (cobroItem.estado === "VENCIDO") {
      return {
        pago: false,
        estado: "VENCIDO",
        etiquetaPrincipal: "No pagó",
        etiquetaDetalle: "Vencido",
      };
    }
    return {
      pago: false,
      estado: "PENDIENTE",
      etiquetaPrincipal: "No pagó",
      etiquetaDetalle: "Pendiente de pago",
    };
  }

  // Sin cobroItem en el store de cobros, inferir desde contratación / perfil
  if (contratacion?.estado === "VENCIDA" || alumno?.estado_membresia === "EXPIRED_PAYMENT_PENDING") {
    return {
      pago: false,
      estado: "VENCIDO",
      etiquetaPrincipal: "No pagó",
      etiquetaDetalle: "Vencido",
    };
  }

  if (contratacion?.estado === "PENDIENTE_RENOVACION" || alumno?.estado_membresia === "PENDIENTE") {
    return {
      pago: false,
      estado: "PENDIENTE",
      etiquetaPrincipal: "No pagó",
      etiquetaDetalle: "Pendiente de pago",
    };
  }

  if (contratacion?.estado === "VIGENTE" || alumno?.estado_membresia === "ACTIVA") {
    return {
      pago: true,
      estado: "PAGADO",
      etiquetaPrincipal: "Pagó",
      etiquetaDetalle: "Al día",
    };
  }

  return {
    pago: false,
    estado: "PENDIENTE",
    etiquetaPrincipal: "No pagó",
    etiquetaDetalle: "Sin registro de pago",
  };
}

export function derivarMontoSuscripcion(params: {
  cobroItem?: CobroItem | null;
  contratacion?: Contratacion | null;
}): MontoSuscripcionInfo {
  const { cobroItem, contratacion } = params;

  if (cobroItem) {
    return {
      monto: cobroItem.monto,
      montoLista: cobroItem.montoLista,
      descuento: cobroItem.descuento,
      formateado: formatearDinero(cobroItem.monto),
    };
  }

  if (contratacion?.precio_pactado && contratacion.precio_pactado > 0) {
    return {
      monto: contratacion.precio_pactado,
      formateado: formatearDinero(contratacion.precio_pactado),
    };
  }

  if (contratacion?.plan_membresia_id) {
    const plan = DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id);
    if (plan) {
      return {
        monto: plan.precio,
        formateado: formatearDinero(plan.precio),
      };
    }
  }

  const defaultMonto = contratacion?.tipo_servicio === "PRESENCIAL" ? 25000 : 20000;
  return {
    monto: defaultMonto,
    formateado: formatearDinero(defaultMonto),
  };
}
