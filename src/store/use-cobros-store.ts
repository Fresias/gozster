import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { computeAnchoredRenewalDate, derivarEstadoContratacion } from "@/lib/contrataciones";
import {
  DEMO_ALUMNOS,
  DEMO_ALUMNOS_CLASES,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_GIMNASIO,
  DEMO_PLANES_MEMBRESIA,
} from "@/services/coach-demo-dataset";
import { safeStorage } from "@/store/use-offline-queue";
import type { Cobro, Contratacion, MedioPago, Pago, Perfil, PlanMembresia } from "@/types/database.types";
import {
  type ActividadPlanOpcion,
  type PlanMembresiaConVigencia,
  validarVigenciaFutura,
} from "@/lib/planes";
import { supabase } from "@/lib/supabase/client";
import {
  fetchCobrosDatasetFromSupabase,
  registrarPagoReal,
  type CobrosSupabaseDataset,
} from "@/services/cobros-service";
import {
  type ActividadKpi,
  type PagoMensualInput,
  type KpiAnualResultado,
  calcularKpiAnualIngresos,
} from "@/lib/kpi-anual";

// Store de Cobros y Pagos en Coach Studio (GOZS-184 / GOZS-181).
// Gestiona cobros pendientes, vencidos, registro manual de pagos (Transferencia/Efectivo)
// y comprobantes internos no fiscales, con persistencia y soporte Offline-First.

export type EstadoCobro = "PENDIENTE" | "VENCIDO" | "PAGADO";
export type FiltroCobros = "TODOS" | "PENDIENTES" | "VENCIDOS" | "PAGADOS" | "DESCUENTOS";

export interface CobroItem {
  id: string; // id de la contratación / cobro
  alumnoId: string;
  alumnoNombre: string;
  alumnoEmail: string;
  alumnoTelefono: string | null;
  contratacionId: string;
  planId?: string;
  servicioNombre: string;
  actividad: string | null;
  monto: number;
  montoLista?: number;
  descuento?: number;
  notaDescuento?: string;
  diaVencimiento: number;
  fechaVencimiento: string;
  estado: EstadoCobro;
  ultimoPago?: {
    id: string;
    monto: number;
    montoLista?: number;
    descuento?: number;
    medioPago: "TRANSFERENCIA" | "EFECTIVO";
    fechaPago: string;
    confirmadoPor: string;
    notas?: string;
  };
  pagos?: Array<PagoMensualInput>;
}

/** Una sola fila por alumno: su suscripción más reciente (mayor vencimiento). */
export function ultimaSuscripcionPorAlumno(items: CobroItem[]): CobroItem[] {
  const porAlumno = new Map<string, CobroItem>();
  for (const item of items) {
    const actual = porAlumno.get(item.alumnoId);
    if (!actual || item.fechaVencimiento > actual.fechaVencimiento) {
      porAlumno.set(item.alumnoId, item);
    }
  }
  return [...porAlumno.values()];
}

/** Una fila por contratación (último vencimiento), conservando adicionales del mismo alumno. */
export function ultimaSuscripcionPorContrato(items: CobroItem[]): CobroItem[] {
  const porContrato = new Map<string, CobroItem>();
  for (const item of items) {
    const clave = item.contratacionId || item.id;
    const actual = porContrato.get(clave);
    if (!actual || item.fechaVencimiento > actual.fechaVencimiento) {
      porContrato.set(clave, item);
    }
  }
  return [...porContrato.values()];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value?: string | null): boolean {
  return Boolean(value && UUID_RE.test(value));
}

function isDemoCobro(c: CobroItem): boolean {
  return (
    c.id.startsWith("demo-") ||
    c.id.startsWith("cobro-demo-") ||
    c.alumnoId.startsWith("demo-") ||
    c.contratacionId.startsWith("demo-")
  );
}

function inferirActividadPlan(p: PlanMembresia): ActividadPlanOpcion {
  const nombre = p.nombre.toLowerCase();
  if (p.cantidad_actividades === 2 || (nombre.includes("funcional") && nombre.includes("boxeo")) || nombre.includes("libre")) {
    return "FUNCIONAL_BOXEO";
  }
  if (nombre.includes("boxeo")) return "BOXEO";
  if (nombre.includes("rutina") || nombre.includes("online") || nombre.includes("asesor")) return "RUTINAS";
  return "FUNCIONAL";
}

export function mapearPlanesMembresia(planes: PlanMembresia[]): PlanMembresiaConVigencia[] {
  return planes.map((p) => ({
    ...p,
    actividad_tipo: inferirActividadPlan(p),
  }));
}

export function mapearCobrosDataset(
  dataset: CobrosSupabaseDataset,
  perfiles: Array<Pick<Perfil, "id" | "nombre_completo" | "email" | "telefono">> = [],
): {
  cobros: CobroItem[];
  planes: PlanMembresiaConVigencia[];
  pagosHistorial: PagoMensualInput[];
} {
  const perfilesMap = new Map(perfiles.map((p) => [p.id, p]));
  const contratacionesMap = new Map(dataset.contrataciones.map((c) => [c.id, c]));
  const planesMapped = mapearPlanesMembresia(dataset.planesMembresia);
  const planesMap = new Map(planesMapped.map((p) => [p.id, p]));

  const pagosConfirmados = dataset.pagos.filter((p) => p.estado === "CONFIRMADO");
  const pagosPorContratacion = new Map<string, Pago[]>();
  for (const p of pagosConfirmados) {
    const arr = pagosPorContratacion.get(p.contratacion_id) ?? [];
    arr.push(p);
    pagosPorContratacion.set(p.contratacion_id, arr);
  }

  const cobros: CobroItem[] = dataset.cobros.map((c: Cobro) => {
    const perfil = perfilesMap.get(c.alumno_id);
    const contratacion = contratacionesMap.get(c.contratacion_id);
    const plan = contratacion?.plan_membresia_id ? planesMap.get(contratacion.plan_membresia_id) : undefined;
    const pagosContrato = (pagosPorContratacion.get(c.contratacion_id) ?? []).sort((a, b) =>
      (b.confirmado_at ?? b.created_at).localeCompare(a.confirmado_at ?? a.created_at),
    );
    const pagoConfirmado = c.estado === "PAGADO" ? pagosContrato[0] : undefined;

    const actividad =
      contratacion?.actividad ??
      (plan?.actividad_tipo && plan.actividad_tipo !== "FUNCIONAL_BOXEO" ? plan.actividad_tipo : null) ??
      (contratacion?.tipo_servicio === "ASESORIA_ONLINE" ? "RUTINAS" : null);

    const servicioNombre =
      c.concepto ||
      plan?.nombre ||
      (actividad === "FUNCIONAL"
        ? "Funcional"
        : actividad === "BOXEO"
        ? "Boxeo"
        : actividad === "RUTINAS" || contratacion?.tipo_servicio === "ASESORIA_ONLINE"
        ? "Rutinas Online"
        : "Membresía");

    const monto = Number(c.monto);
    const montoLista = contratacion?.precio_pactado
      ? Number(contratacion.precio_pactado)
      : plan?.precio
      ? Number(plan.precio)
      : monto;
    const descuento = montoLista > monto ? montoLista - monto : undefined;
    const diaVencimiento =
      contratacion?.dia_vencimiento ??
      (Number.isNaN(new Date(`${c.fecha_vencimiento}T12:00:00Z`).getUTCDate())
        ? 10
        : new Date(`${c.fecha_vencimiento}T12:00:00Z`).getUTCDate());

    return {
      id: c.id,
      alumnoId: c.alumno_id,
      alumnoNombre: perfil?.nombre_completo ?? "Alumno",
      alumnoEmail: perfil?.email ?? "",
      alumnoTelefono: perfil?.telefono ?? null,
      contratacionId: c.contratacion_id,
      planId: contratacion?.plan_membresia_id ?? plan?.id,
      servicioNombre,
      actividad,
      monto,
      montoLista,
      descuento,
      notaDescuento: c.notas ?? pagoConfirmado?.nota ?? undefined,
      diaVencimiento,
      fechaVencimiento: c.fecha_vencimiento,
      estado: c.estado,
      ultimoPago: pagoConfirmado
        ? {
            id: pagoConfirmado.id,
            monto: Number(pagoConfirmado.monto_cobrado ?? pagoConfirmado.monto),
            montoLista: Number(pagoConfirmado.monto),
            descuento:
              Number(pagoConfirmado.monto) > Number(pagoConfirmado.monto_cobrado ?? pagoConfirmado.monto)
                ? Number(pagoConfirmado.monto) - Number(pagoConfirmado.monto_cobrado ?? pagoConfirmado.monto)
                : undefined,
            medioPago: pagoConfirmado.medio_pago === "EFECTIVO" ? "EFECTIVO" : "TRANSFERENCIA",
            fechaPago: pagoConfirmado.confirmado_at ?? pagoConfirmado.created_at,
            confirmadoPor: "Coach",
            notas: pagoConfirmado.nota ?? c.notas ?? undefined,
          }
        : undefined,
    };
  });

  const pagosHistorial: PagoMensualInput[] = pagosConfirmados.map((p) => {
    const contratacion = contratacionesMap.get(p.contratacion_id);
    const plan = contratacion?.plan_membresia_id ? planesMap.get(contratacion.plan_membresia_id) : undefined;
    const montoCobrado = Number(p.monto_cobrado ?? p.monto);
    return {
      id: p.id,
      monto: Number(p.monto),
      montoCobrado,
      fechaPago: p.confirmado_at ?? p.created_at,
      actividad: contratacion?.actividad ?? (contratacion?.tipo_servicio === "ASESORIA_ONLINE" ? "RUTINAS" : null),
      servicioNombre: plan?.nombre ?? "Membresía",
      tipoServicio: contratacion?.tipo_servicio ?? "PRESENCIAL",
      notas: p.nota ?? undefined,
    };
  });

  return { cobros, planes: planesMapped, pagosHistorial };
}

export interface CobrosMetricas {
  ingresosMes: number;
  ingresosPresencial?: number;
  ingresosOnline?: number;
  cobranzaPendiente: number;
  cobranzaVencida: number;
  alumnosMorosos: number;
  alumnosAlDia: number;
  totalCobros: number;
  tasaCobranzaPct: number;
  totalDescuentos: number;
  cobrosConDescuento: number;
}

export interface ComprobanteInterno {
  reciboNumero: string;
  fechaEmision: string;
  alumnoNombre: string;
  alumnoEmail: string;
  servicio: string;
  monto: number;
  montoLista?: number;
  descuento?: number;
  medioPago: "TRANSFERENCIA" | "EFECTIVO";
  fechaPago: string;
  confirmadoPor: string;
  proximoVencimiento: string;
  notas?: string;
}

interface CobrosState {
  cobros: CobroItem[];
  planes: PlanMembresiaConVigencia[];
  pagosHistorial?: PagoMensualInput[];
  filtroEstado: FiltroCobros;
  filtroActividadKpiAnual: ActividadKpi;
  kpiAnualAbierto: boolean;
  busqueda: string;
  cargando: boolean;
  isLiveMode: boolean;
  accionEnCurso: string | null;
  error: string | null;
  aviso: string | null;
  comprobanteActivo: ComprobanteInterno | null;

  setFiltroEstado: (filtro: FiltroCobros) => void;
  setFiltroActividadKpiAnual: (filtro: ActividadKpi) => void;
  setKpiAnualAbierto: (abierto: boolean) => void;
  setBusqueda: (busqueda: string) => void;
  setComprobanteActivo: (comprobante: ComprobanteInterno | null) => void;
  limpiarMensajes: () => void;
  syncWithLiveAlumnos: (alumnos: { id: string }[]) => void;
  hydrateFromLiveDataset: (dataset: {
    alumnos?: Perfil[];
    cobros?: Cobro[];
    contrataciones?: Contratacion[];
    planesMembresia?: PlanMembresia[];
  }) => void;

  cargarCobros: () => Promise<void>;
  registrarPago: (params: {
    contratacionId: string;
    monto: number;
    montoLista?: number;
    medioPago: "TRANSFERENCIA" | "EFECTIVO";
    notas?: string;
    fechaPago?: string;
  }) => Promise<ComprobanteInterno>;
  registrarCobroInicial: (params: {
    alumnoId: string;
    alumnoNombre: string;
    alumnoEmail: string;
    alumnoTelefono?: string | null;
    monto: number;
    pagado: boolean;
    medioPago?: "TRANSFERENCIA" | "EFECTIVO";
    notas?: string;
    actividad?: string;
  }) => Promise<CobroItem>;
  recuperarMontoOriginal: (contratacionId: string) => void;
  obtenerDescuentos: () => CobroItem[];
  obtenerComprobante: (contratacionId: string) => ComprobanteInterno | null;
  obtenerPagosAnuales: () => PagoMensualInput[];
  kpiIngresosAnual: (anio?: number, actividad?: ActividadKpi) => KpiAnualResultado;
  metricas: () => CobrosMetricas;
  resetDemoDataset: () => void;

  crearPlan: (params: {
    nombre: string;
    actividad: ActividadPlanOpcion;
    duracionMeses: 1 | 3 | 6 | 12;
    limiteSemanal: number | null;
    precio: number;
    fechaVigencia: string;
    notas?: string | null;
  }) => Promise<PlanMembresiaConVigencia>;

  modificarPlan: (params: {
    planId: string;
    nombre?: string;
    precio: number;
    fechaVigencia: string;
    duracionMeses?: 1 | 3 | 6 | 12;
    limiteSemanal?: number | null;
    notas?: string | null;
  }) => Promise<PlanMembresiaConVigencia>;

  eliminarPlan: (planId: string) => Promise<void>;
  tieneContratacionesActivas: (
    planId: string,
    contratacionesExternas?: Array<{ plan_membresia_id?: string | null; estado?: string }>
  ) => boolean;
  obtenerPlanesActivos: () => PlanMembresiaConVigencia[];

  vincularCobroPlan: (params: {
    cobroId?: string;
    contratacionId: string;
    alumnoId: string;
    alumnoNombre: string;
    alumnoEmail: string;
    alumnoTelefono?: string | null;
    servicioNombre: string;
    actividad?: string | null;
    monto: number;
    pagado?: boolean;
    medioPago?: "TRANSFERENCIA" | "EFECTIVO";
    diaVencimiento: number;
    fechaVencimiento: string;
    esAdicional?: boolean;
    notas?: string | null;
    planId?: string;
  }) => void;
}


export function generarDemoPlanesIniciales(): PlanMembresiaConVigencia[] {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-plan-funcional-2x",
      nombre: "Funcional 2x semana",
      limite_semanal: 2,
      cantidad_actividades: 1,
      duracion_meses: 1,
      precio: 25000,
      activo: true,
      actividad_tipo: "FUNCIONAL",
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-plan-pase-libre",
      nombre: "Pase libre Funcional + Boxeo",
      limite_semanal: null,
      cantidad_actividades: 2,
      duracion_meses: 1,
      precio: 40000,
      activo: true,
      actividad_tipo: "FUNCIONAL_BOXEO",
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-plan-boxeo-3x",
      nombre: "Boxeo 3x semana",
      limite_semanal: 3,
      cantidad_actividades: 1,
      duracion_meses: 1,
      precio: 30000,
      activo: true,
      actividad_tipo: "BOXEO",
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-plan-rutinas-online",
      nombre: "Rutinas Online (Asesoría)",
      limite_semanal: null,
      cantidad_actividades: 1,
      duracion_meses: 1,
      precio: 28000,
      activo: true,
      actividad_tipo: "RUTINAS",
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-plan-funcional-trimestral",
      nombre: "Funcional Trimestral (3x)",
      limite_semanal: 3,
      cantidad_actividades: 1,
      duracion_meses: 3,
      precio: 75000,
      activo: true,
      actividad_tipo: "FUNCIONAL",
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-plan-boxeo-semestral",
      nombre: "Boxeo Semestral Pase Libre",
      limite_semanal: null,
      cantidad_actividades: 1,
      duracion_meses: 6,
      precio: 160000,
      activo: true,
      actividad_tipo: "BOXEO",
      created_at: now,
      updated_at: now,
    },
    {
      id: "demo-plan-rutinas-anual",
      nombre: "Rutinas Online Anual",
      limite_semanal: null,
      cantidad_actividades: 1,
      duracion_meses: 12,
      precio: 280000,
      activo: true,
      actividad_tipo: "RUTINAS",
      created_at: now,
      updated_at: now,
    },
  ];
}

function generarDemoCobrosIniciales(): CobroItem[] {
  const hoyStr = new Date().toISOString().slice(0, 10);
  const items: CobroItem[] = [];

  // 1. Alumnos de Clases presenciales (Valentina, Sofía, Joaquín, Tomás)
  const alumnosClases = DEMO_ALUMNOS_CLASES;
  for (const c of DEMO_CONTRATACIONES_CLASES) {
    const alumno = alumnosClases.find((a) => a.id === c.alumno_id);
    const plan = DEMO_PLANES_MEMBRESIA.find((p) => p.id === c.plan_membresia_id);
    const monto = plan?.precio ?? 25000;
    const servicioNombre = plan?.nombre ?? (c.actividad ? `Presencial ${c.actividad}` : "Presencial General");

    let estado: EstadoCobro = "PENDIENTE";
    let ultimoPago: CobroItem["ultimoPago"] | undefined = undefined;
    let montoCobrado = monto;
    let montoLista = monto;
    let descuento: number | undefined = undefined;
    let notaDescuento: string | undefined = undefined;

    if (c.estado === "VENCIDA" || (c.fecha_fin && c.fecha_fin < hoyStr)) {
      estado = "VENCIDO";
    } else if (c.alumno_id === "demo-alumno-valentina") {
      // Valentina tiene pago registrado este mes
      estado = "PAGADO";
      ultimoPago = {
        id: `pago-demo-val-${c.id}`,
        monto,
        montoLista: monto,
        medioPago: "TRANSFERENCIA",
        fechaPago: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        confirmadoPor: "Lucía Ferraro",
        notas: "Transferencia Banco Galicia",
      };
    } else if (c.alumno_id === "demo-alumno-sofia") {
      // GOZS-253: El pago de Sofía (40k lista, 32k cobrado) cuenta 32k y muestra 'N' con la nota
      estado = "PAGADO";
      montoCobrado = 32000;
      montoLista = 40000;
      descuento = 8000;
      notaDescuento = "Descuento 20% acordado con el coach";
      ultimoPago = {
        id: `pago-demo-sofia-${c.id}`,
        monto: 32000,
        montoLista: 40000,
        descuento: 8000,
        medioPago: "TRANSFERENCIA",
        fechaPago: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        confirmadoPor: "Lucía Ferraro",
        notas: "Descuento 20% acordado con el coach",
      };
    }

    items.push({
      id: `cobro-${c.id}`,
      alumnoId: c.alumno_id,
      alumnoNombre: alumno?.nombre_completo ?? "Alumno Presencial",
      alumnoEmail: alumno?.email ?? "alumno@gozster.test",
      alumnoTelefono: alumno?.telefono ?? null,
      contratacionId: c.id,
      planId: c.plan_membresia_id ?? plan?.id,
      servicioNombre,
      actividad: c.actividad,
      monto: montoCobrado,
      montoLista,
      descuento,
      notaDescuento,
      diaVencimiento: c.dia_vencimiento,
      fechaVencimiento: c.fecha_fin ?? hoyStr,
      estado,
      ultimoPago,
    });
  }

  // 2. Alumnos de DEMO_GIMNASIO (con historia y cuotas del mes)
  const gimnasio = DEMO_GIMNASIO;
  const idsYaAgregados = new Set(items.map((i) => i.alumnoId));

  for (let i = 0; i < gimnasio.contrataciones.length; i++) {
    const c = gimnasio.contrataciones[i]!;
    if (idsYaAgregados.has(c.alumno_id)) continue;
    idsYaAgregados.add(c.alumno_id);

    const alumno = gimnasio.alumnos.find((a) => a.id === c.alumno_id);
    if (!alumno || alumno.rol !== "ALUMNO" || alumno.estado_membresia === "INACTIVA") continue;

    // Distribuir entre presencial (funcional + boxeo) y online (rutinas)
    const esOnline = i % 3 === 0;
    const plan = esOnline ? null : DEMO_PLANES_MEMBRESIA.find((p) => p.id === c.plan_membresia_id);
    const monto = esOnline ? 20000 : (plan?.precio ?? 28000);
    const servicioNombre = esOnline ? "Rutina online" : (plan?.nombre ?? "Funcional 2x semana");
    const actividad = esOnline ? null : c.actividad;

    // Buscar si hay pago confirmado en los últimos 30 días
    const pagoReciente = gimnasio.pagos.find(
      (p) => p.contratacion_id === c.id && p.estado === "CONFIRMADO",
    );

    let estado: EstadoCobro = "PENDIENTE";
    let ultimoPago: CobroItem["ultimoPago"] | undefined = undefined;

    if (pagoReciente) {
      estado = "PAGADO";
      ultimoPago = {
        id: pagoReciente.id,
        monto: pagoReciente.monto,
        montoLista: monto,
        medioPago: pagoReciente.medio_pago === "EFECTIVO" ? "EFECTIVO" : "TRANSFERENCIA",
        fechaPago: pagoReciente.confirmado_at ?? pagoReciente.created_at,
        confirmadoPor: "Lucía Ferraro",
      };
    } else if (c.estado === "VENCIDA" || (c.fecha_fin && c.fecha_fin < hoyStr)) {
      estado = "VENCIDO";
    }

    items.push({
      id: `cobro-${c.id}`,
      alumnoId: c.alumno_id,
      alumnoNombre: alumno.nombre_completo,
      alumnoEmail: alumno.email ?? "",
      alumnoTelefono: alumno.telefono ?? null,
      contratacionId: c.id,
      planId: c.plan_membresia_id ?? plan?.id,
      servicioNombre,
      actividad,
      monto,
      montoLista: monto,
      diaVencimiento: c.dia_vencimiento,
      fechaVencimiento: c.fecha_fin ?? hoyStr,
      estado,
      ultimoPago,
    });
  }

  return items;
}

function generarDemoPagosHistorial(): PagoMensualInput[] {
  const anio = 2026;
  const meses = [
    { mes: "01", func: 25000, box: 30000, rut: 18000 },
    { mes: "02", func: 25000, box: 30000, rut: 18000 },
    { mes: "03", func: 25000, box: 32000, rut: 18000 },
    { mes: "04", func: 28000, box: 32000, rut: 20000 },
    { mes: "05", func: 28000, box: 35000, rut: 20000 },
    { mes: "06", func: 28000, box: 35000, rut: 20000 },
    { mes: "07", func: 30000, box: 35000, rut: 22000 },
    { mes: "08", func: 30000, box: 38000, rut: 22000 },
    { mes: "09", func: 30000, box: 38000, rut: 22000 },
    { mes: "10", func: 32000, box: 38000, rut: 22000 },
  ];

  const pagos: PagoMensualInput[] = [];
  for (const m of meses) {
    pagos.push({
      id: `demo-pago-func-${m.mes}`,
      monto: m.func,
      montoCobrado: m.func,
      fechaPago: `${anio}-${m.mes}-10T10:00:00Z`,
      actividad: "FUNCIONAL",
      servicioNombre: "Funcional 2x semana",
    });
    pagos.push({
      id: `demo-pago-box-${m.mes}`,
      monto: m.box,
      montoCobrado: m.box,
      fechaPago: `${anio}-${m.mes}-15T12:00:00Z`,
      actividad: "BOXEO",
      servicioNombre: "Boxeo recreativo",
    });
    pagos.push({
      id: `demo-pago-rut-${m.mes}`,
      monto: m.rut,
      montoCobrado: m.rut,
      fechaPago: `${anio}-${m.mes}-05T14:00:00Z`,
      actividad: "RUTINAS",
      servicioNombre: "Rutina online personalizada",
    });
  }
  return pagos;
}

export const useCobrosStore = create<CobrosState>()(
  persist(
    (set, get) => ({
      cobros: generarDemoCobrosIniciales(),
      planes: generarDemoPlanesIniciales(),
      pagosHistorial: generarDemoPagosHistorial(),
      filtroEstado: "TODOS",
      filtroActividadKpiAnual: "TODAS",
      kpiAnualAbierto: false,
      busqueda: "",
      cargando: false,
      isLiveMode: false,
      accionEnCurso: null,
      error: null,
      aviso: null,
      comprobanteActivo: null,

      setFiltroEstado: (filtroEstado) => set({ filtroEstado }),
      setFiltroActividadKpiAnual: (filtroActividadKpiAnual) => set({ filtroActividadKpiAnual }),
      setKpiAnualAbierto: (kpiAnualAbierto) => set({ kpiAnualAbierto }),
      setBusqueda: (busqueda) => set({ busqueda }),
      setComprobanteActivo: (comprobanteActivo) => set({ comprobanteActivo }),
      limpiarMensajes: () => set({ error: null, aviso: null }),
      syncWithLiveAlumnos: (alumnos) => {
        const ids = new Set(alumnos.map((a) => a.id));
        const tieneReales = alumnos.some((a) => !a.id.startsWith("demo-"));
        set((state) => ({
          isLiveMode: tieneReales ? true : state.isLiveMode,
          cobros: state.cobros.filter((c) => {
            if (!isDemoCobro(c)) return true;
            return !tieneReales && ids.has(c.alumnoId);
          }),
        }));
      },

      hydrateFromLiveDataset: (dataset) => {
        const alumnos = dataset.alumnos ?? [];
        const hasLiveCobros = Array.isArray(dataset.cobros);
        const hasLivePlanes = Array.isArray(dataset.planesMembresia);
        if (!hasLiveCobros && !hasLivePlanes) {
          get().syncWithLiveAlumnos(alumnos);
          return;
        }
        const mapped = mapearCobrosDataset(
          {
            cobros: dataset.cobros ?? [],
            contrataciones: dataset.contrataciones ?? [],
            planesMembresia: dataset.planesMembresia ?? [],
            pagos: [],
            alumnoActividades: [],
          },
          alumnos,
        );
        set((state) => ({
          isLiveMode: true,
          cobros: hasLiveCobros ? mapped.cobros : state.cobros.filter((c) => !isDemoCobro(c)),
          planes:
            hasLivePlanes && (dataset.planesMembresia?.length ?? 0) > 0
              ? mapped.planes
              : state.planes.filter((p) => !p.id.startsWith("demo-")),
        }));
      },

      resetDemoDataset: () => {
        const demo = generarDemoCobrosIniciales();
        const demoPlanes = generarDemoPlanesIniciales();
        const demoPagos = generarDemoPagosHistorial();
        set({
          cobros: demo,
          planes: demoPlanes,
          pagosHistorial: demoPagos,
          isLiveMode: false,
          filtroEstado: "TODOS",
          filtroActividadKpiAnual: "TODAS",
          kpiAnualAbierto: false,
          busqueda: "",
          error: null,
          aviso: null,
          comprobanteActivo: null,
        });
      },

      cargarCobros: async () => {
        let user: { id: string } | null = null;
        try {
          const authRes = await supabase.auth.getUser();
          user = authRes.data?.user ?? null;
        } catch {
          user = null;
        }

        if (!user) {
          if (!get().isLiveMode && get().cobros.length === 0) {
            set({ cobros: generarDemoCobrosIniciales(), cargando: false });
          }
          return;
        }

        set({ cargando: true, error: null, isLiveMode: true });
        try {
          const [dataset, perfilesRes] = await Promise.all([
            fetchCobrosDatasetFromSupabase(supabase),
            supabase.from("perfiles").select("id, nombre_completo, email, telefono"),
          ]);
          const perfiles = (perfilesRes.data as Array<Pick<Perfil, "id" | "nombre_completo" | "email" | "telefono">>) ?? [];
          const mapped = mapearCobrosDataset(dataset, perfiles);
          set({
            cobros: mapped.cobros,
            planes: mapped.planes,
            pagosHistorial: mapped.pagosHistorial,
            cargando: false,
            isLiveMode: true,
            error: null,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "No se pudieron cargar los cobros desde Supabase.";
          set({ cargando: false, error: msg, isLiveMode: true });
        }
      },

      registrarPago: async ({ contratacionId, monto, montoLista, medioPago, notas, fechaPago }) => {
        const item = get().cobros.find((c) => c.contratacionId === contratacionId || c.id === contratacionId);
        if (!item) {
          throw new Error("Contratación no encontrada");
        }

        set({ accionEnCurso: contratacionId, error: null, aviso: null });

        let user: { id: string } | null = null;
        try {
          const authRes = await supabase.auth.getUser();
          user = authRes.data?.user ?? null;
        } catch {
          user = null;
        }

        let cobroRemoto: Cobro | null = null;
        if (user && isUuid(item.id)) {
          try {
            cobroRemoto = await registrarPagoReal(
              {
                cobroId: item.id,
                monto,
                metodo: medioPago,
                nota: notas?.trim() || null,
              },
              supabase,
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "No se pudo registrar el pago en Supabase.";
            set({ accionEnCurso: null, error: msg });
            throw err;
          }
        }

        const precioLista = montoLista ?? item.montoLista ?? item.monto;
        const descuento = precioLista > monto ? precioLista - monto : undefined;

        // Regla ADR-001: anclaje de fecha (vence 10/10, paga 18/10 -> vence 10/11)
        const nuevaFechaFin = cobroRemoto?.fecha_vencimiento ?? computeAnchoredRenewalDate(item.fechaVencimiento, item.diaVencimiento);
        const pagoId = `pago-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const ahoraIso = fechaPago
          ? (fechaPago.includes("T") ? fechaPago : `${fechaPago}T12:00:00.000Z`)
          : new Date().toISOString();
        const reciboNumero = `REC-${pagoId.slice(-6).toUpperCase()}`;

        const confirmadoPor = user ? "Coach" : "Lucía Ferraro";
        const comprobante: ComprobanteInterno = {
          reciboNumero,
          fechaEmision: ahoraIso,
          alumnoNombre: item.alumnoNombre,
          alumnoEmail: item.alumnoEmail,
          servicio: item.servicioNombre,
          monto,
          montoLista: precioLista,
          descuento,
          medioPago,
          fechaPago: ahoraIso,
          confirmadoPor,
          proximoVencimiento: nuevaFechaFin,
          notas,
        };

        // Actualización en memoria y estado local
        const cobrosActualizados = get().cobros.map((c) => {
          if (c.id === item.id || c.contratacionId === contratacionId) {
            return {
              ...c,
              estado: (cobroRemoto?.estado ?? "PAGADO") as EstadoCobro,
              monto: cobroRemoto ? Number(cobroRemoto.monto) : monto,
              montoLista: precioLista,
              descuento,
              notaDescuento: notas ?? cobroRemoto?.notas ?? undefined,
              fechaVencimiento: nuevaFechaFin,
              ultimoPago: {
                id: pagoId,
                monto,
                montoLista: precioLista,
                descuento,
                medioPago,
                fechaPago: ahoraIso,
                confirmadoPor,
                notas,
              },
            };
          }
          return c;
        });

        const nuevoPagoRegistro: PagoMensualInput = {
          id: pagoId,
          monto,
          montoCobrado: monto,
          fechaPago: ahoraIso,
          actividad: item.actividad,
          servicioNombre: item.servicioNombre,
          tipoServicio: item.actividad ? "PRESENCIAL" : "ASESORIA_ONLINE",
          notas,
        };

        set({
          cobros: cobrosActualizados,
          pagosHistorial: [...(get().pagosHistorial ?? []), nuevoPagoRegistro],
          accionEnCurso: null,
          comprobanteActivo: comprobante,
          aviso: `Pago de $${monto.toLocaleString("es-AR")} (${medioPago}) confirmado exitosamente.`,
        });

        return comprobante;
      },

      registrarCobroInicial: async ({
        alumnoId,
        alumnoNombre,
        alumnoEmail,
        alumnoTelefono,
        monto,
        pagado,
        medioPago = "TRANSFERENCIA",
        notas,
        actividad,
      }) => {
        const contratacionId = `cont-alta-${alumnoId}`;
        const cobroId = `cobro-alta-${alumnoId}`;
        const ahoraIso = new Date().toISOString();
        const diaVencimiento = new Date().getDate();
        const fechaVencimiento = computeAnchoredRenewalDate(ahoraIso, diaVencimiento);
        const pagoId = `pago-alta-${Date.now()}`;

        const nuevoItem: CobroItem = {
          id: cobroId,
          alumnoId,
          alumnoNombre,
          alumnoEmail,
          alumnoTelefono: alumnoTelefono ?? null,
          contratacionId,
          servicioNombre: actividad ? `Pase ${actividad}` : "Asesoría Online / Rutina",
          actividad: actividad ?? null,
          monto,
          montoLista: monto,
          diaVencimiento,
          fechaVencimiento,
          estado: pagado ? "PAGADO" : "PENDIENTE",
          ...(pagado
            ? {
                ultimoPago: {
                  id: pagoId,
                  monto,
                  montoLista: monto,
                  medioPago,
                  fechaPago: ahoraIso,
                  confirmadoPor: "Coach",
                  notas,
                },
              }
            : {}),
        };

        const nuevoPago: PagoMensualInput | undefined = pagado
          ? {
              id: pagoId,
              monto,
              montoCobrado: monto,
              fechaPago: ahoraIso,
              actividad: actividad ?? null,
              servicioNombre: nuevoItem.servicioNombre,
              tipoServicio: actividad ? "PRESENCIAL" : "ASESORIA_ONLINE",
              notas,
            }
          : undefined;

        set((state) => ({
          cobros: [nuevoItem, ...state.cobros.filter((c) => c.alumnoId !== alumnoId)],
          pagosHistorial: nuevoPago
            ? [...(state.pagosHistorial ?? []), nuevoPago]
            : state.pagosHistorial,
          aviso: `Cobro inicial de $${monto.toLocaleString("es-AR")} (${pagado ? "Liquidado" : "Pendiente"}) registrado para ${alumnoNombre}.`,
        }));

        return nuevoItem;
      },

      recuperarMontoOriginal: (contratacionId: string) => {
        const item = get().cobros.find((c) => c.contratacionId === contratacionId);
        if (!item) return;

        const precioLista = item.montoLista ?? item.monto;
        const cobrosActualizados = get().cobros.map((c) => {
          if (c.contratacionId === contratacionId) {
            return {
              ...c,
              monto: precioLista,
              descuento: 0,
              notaDescuento: undefined,
              ultimoPago: c.ultimoPago
                ? {
                    ...c.ultimoPago,
                    monto: precioLista,
                    descuento: 0,
                  }
                : undefined,
            };
          }
          return c;
        });

        set({
          cobros: cobrosActualizados,
          aviso: `Monto de suscripción ($${precioLista.toLocaleString("es-AR")}) recuperado para ${item.alumnoNombre}.`,
        });
      },

      obtenerDescuentos: () => {
        return get().cobros.filter(
          (c) =>
            (c.montoLista && c.monto < c.montoLista) ||
            (c.ultimoPago?.montoLista && c.ultimoPago.monto < c.ultimoPago.montoLista) ||
            Boolean(c.descuento && c.descuento > 0) ||
            Boolean(c.ultimoPago?.descuento && c.ultimoPago.descuento > 0),
        );
      },

      obtenerComprobante: (contratacionId) => {
        const item = get().cobros.find((c) => c.contratacionId === contratacionId);
        if (!item || !item.ultimoPago) return null;

        return {
          reciboNumero: `REC-${item.ultimoPago.id.slice(-6).toUpperCase()}`,
          fechaEmision: item.ultimoPago.fechaPago,
          alumnoNombre: item.alumnoNombre,
          alumnoEmail: item.alumnoEmail,
          servicio: item.servicioNombre,
          monto: item.ultimoPago.monto,
          montoLista: item.ultimoPago.montoLista ?? item.montoLista,
          descuento: item.ultimoPago.descuento ?? item.descuento,
          medioPago: item.ultimoPago.medioPago,
          fechaPago: item.ultimoPago.fechaPago,
          confirmadoPor: item.ultimoPago.confirmadoPor,
          proximoVencimiento: item.fechaVencimiento,
          notas: item.ultimoPago.notas,
        };
      },

      obtenerPagosAnuales: () => {
        const pagos: PagoMensualInput[] = [];
        const idsVistos = new Set<string>();

        // 1. Pagos del historial
        if (get().pagosHistorial && get().pagosHistorial!.length > 0) {
          for (const p of get().pagosHistorial!) {
            if (p.id) idsVistos.add(p.id);
            pagos.push(p);
          }
        }

        // 2. Pagos anidados en cobros
        for (const cobro of get().cobros) {
          if (cobro.pagos && cobro.pagos.length > 0) {
            for (const p of cobro.pagos) {
              const pid = p.id ?? `pago-${cobro.id}-${p.fechaPago}`;
              if (idsVistos.has(pid)) continue;
              idsVistos.add(pid);
              pagos.push({
                id: pid,
                monto: p.monto,
                montoCobrado: p.montoCobrado ?? p.monto,
                fechaPago: p.fechaPago,
                actividad: p.actividad ?? cobro.actividad,
                servicioNombre: p.servicioNombre ?? cobro.servicioNombre,
                notas: p.notas,
              });
            }
          }

          if (cobro.ultimoPago) {
            const up = cobro.ultimoPago;
            if (!idsVistos.has(up.id)) {
              idsVistos.add(up.id);
              pagos.push({
                id: up.id,
                monto: up.monto,
                montoCobrado: up.monto,
                fechaPago: up.fechaPago,
                actividad: cobro.actividad,
                servicioNombre: cobro.servicioNombre,
                notas: up.notas,
              });
            }
          } else if (cobro.estado === "PAGADO") {
            const fauxId = `pago-auto-${cobro.id}`;
            if (!idsVistos.has(fauxId)) {
              idsVistos.add(fauxId);
              pagos.push({
                id: fauxId,
                monto: cobro.monto,
                montoCobrado: cobro.monto,
                fechaPago: cobro.fechaVencimiento,
                actividad: cobro.actividad,
                servicioNombre: cobro.servicioNombre,
              });
            }
          }
        }

        return pagos;
      },

      kpiIngresosAnual: (anio?: number, actividad?: ActividadKpi) => {
        const pagos = get().obtenerPagosAnuales();
        const filtro = actividad ?? get().filtroActividadKpiAnual ?? "TODAS";
        return calcularKpiAnualIngresos(pagos, anio, filtro);
      },

      metricas: () => {
        const lista = get().cobros;
        let ingresosMes = 0;
        let ingresosPresencial = 0;
        let ingresosOnline = 0;
        let cobranzaPendiente = 0;
        let cobranzaVencida = 0;
        let alumnosMorosos = 0;
        let alumnosAlDia = 0;
        let totalDescuentos = 0;
        let cobrosConDescuento = 0;

        for (const item of lista) {
          const monto = item.ultimoPago?.monto ?? item.monto;
          const esPresencial =
            item.actividad === "FUNCIONAL" ||
            item.actividad === "BOXEO" ||
            (item.servicioNombre && /funcional|boxeo|presencial/i.test(item.servicioNombre));
          const tieneDescuento =
            (item.montoLista && item.monto < item.montoLista) ||
            (item.ultimoPago?.montoLista && item.ultimoPago.monto < item.ultimoPago.montoLista) ||
            Boolean(item.descuento && item.descuento > 0) ||
            Boolean(item.ultimoPago?.descuento && item.ultimoPago.descuento > 0);

          if (tieneDescuento) {
            cobrosConDescuento++;
            const desc =
              item.descuento ??
              (item.montoLista && item.montoLista > item.monto
                ? item.montoLista - item.monto
                : (item.ultimoPago?.descuento ?? 0));
            totalDescuentos += desc;
          }

          if (item.estado === "PAGADO") {
            ingresosMes += monto;
            if (esPresencial) {
              ingresosPresencial += monto;
            } else {
              ingresosOnline += monto;
            }
            alumnosAlDia++;
          } else if (item.estado === "PENDIENTE") {
            cobranzaPendiente += item.monto;
            alumnosAlDia++;
          } else if (item.estado === "VENCIDO") {
            cobranzaVencida += item.monto;
            alumnosMorosos++;
          }
        }

        const totalEsperado = ingresosMes + cobranzaPendiente + cobranzaVencida;
        const tasaCobranzaPct = totalEsperado > 0 ? Math.round((ingresosMes / totalEsperado) * 100) : 0;

        return {
          ingresosMes,
          ingresosPresencial,
          ingresosOnline,
          cobranzaPendiente,
          cobranzaVencida,
          alumnosMorosos,
          alumnosAlDia,
          totalCobros: lista.length,
          tasaCobranzaPct,
          totalDescuentos,
          cobrosConDescuento,
        };
      },

      crearPlan: async (params) => {
        const { nombre, actividad, duracionMeses, limiteSemanal, precio, fechaVigencia, notas } = params;
        const validacion = validarVigenciaFutura(fechaVigencia);
        if (!validacion.valida) {
          const errorMsg = validacion.error ?? "La fecha de vigencia debe ser posterior a hoy (fecha futura)";
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }

        const cantidadActividades = actividad === "FUNCIONAL_BOXEO" ? 2 : 1;
        const nuevoPlanId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `plan-${Date.now()}`;
        const now = new Date().toISOString();

        const nuevoPlan: PlanMembresiaConVigencia = {
          id: nuevoPlanId,
          nombre: nombre.trim(),
          limite_semanal: actividad === "RUTINAS" ? null : limiteSemanal,
          cantidad_actividades: cantidadActividades,
          duracion_meses: duracionMeses,
          precio,
          notas: notas ? notas.trim() : null,
          activo: true,
          actividad_tipo: actividad,
          vigente_desde: fechaVigencia,
          created_at: now,
          updated_at: now,
        };


        const aviso = `Plan '${nuevoPlan.nombre}' creado con éxito con vigencia desde ${fechaVigencia}. No altera cobros realizados ni cuotas vencidas.`;
        set((state) => ({
          planes: [nuevoPlan, ...state.planes],
          aviso,
          error: null,
        }));

        return nuevoPlan;
      },

      modificarPlan: async (params) => {
        const { planId, nombre, precio, fechaVigencia, duracionMeses, limiteSemanal, notas } = params;
        const validacion = validarVigenciaFutura(fechaVigencia);
        if (!validacion.valida) {
          const errorMsg = validacion.error ?? "La fecha de vigencia debe ser posterior a hoy (fecha futura)";
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }

        const planExistente = get().planes.find((p) => p.id === planId);
        if (!planExistente) {
          const errorMsg = `Plan con id ${planId} no encontrado`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }

        const precioAnterior = planExistente.precio;
        const planActualizado: PlanMembresiaConVigencia = {
          ...planExistente,
          nombre: nombre ? nombre.trim() : planExistente.nombre,
          precio,
          vigente_desde: fechaVigencia,
          precio_anterior: precioAnterior,
          duracion_meses: duracionMeses ?? planExistente.duracion_meses,
          limite_semanal:
            planExistente.actividad_tipo === "RUTINAS"
              ? null
              : limiteSemanal !== undefined
                ? limiteSemanal
                : planExistente.limite_semanal,
          notas: notas !== undefined ? (notas ? notas.trim() : null) : planExistente.notas,
          updated_at: new Date().toISOString(),
        };


        const aviso = `Plan '${planActualizado.nombre}' modificado ($${precio.toLocaleString("es-AR")}) con vigencia desde ${fechaVigencia}. Los cobros anteriores y cuotas vencidas no se modifican.`;
        set((state) => ({
          planes: state.planes.map((p) => (p.id === planId ? planActualizado : p)),
          aviso,
          error: null,
        }));

        return planActualizado;
      },

      tieneContratacionesActivas: (planId, contratacionesExternas) => {
        const plan = get().planes.find((p) => p.id === planId);
        const nombrePlan = plan?.nombre.toLowerCase().trim();

        // 1. Contrataciones provistas explícitamente (ej. desde useCoachStudioStore)
        if (contratacionesExternas && Array.isArray(contratacionesExternas)) {
          const enExternas = contratacionesExternas.some(
            (c) =>
              c.plan_membresia_id === planId &&
              (c.estado === "VIGENTE" || c.estado === "POR_VENCER")
          );
          if (enExternas) return true;
        }

        // 2. Revisar useCoachStudioStore si está registrado globalmente
        try {
          const globalStudio = (globalThis as any).__coachStudioStore?.getState?.();
          if (globalStudio && Array.isArray(globalStudio.contrataciones)) {
            const enGlobal = globalStudio.contrataciones.some(
              (c: any) =>
                c.plan_membresia_id === planId &&
                (c.estado === "VIGENTE" || c.estado === "POR_VENCER")
            );
            if (enGlobal) return true;
          }
        } catch {}

        // 3. Revisar cobros en el store de cobros
        const enCobros = get().cobros.some((c) => {
          const coincideId = c.planId && c.planId === planId;
          const coincideNombre = Boolean(
            nombrePlan && c.servicioNombre.toLowerCase().trim() === nombrePlan
          );
          return (coincideId || coincideNombre) && c.estado !== "VENCIDO";
        });
        if (enCobros) return true;

        // 4. Fallback sobre DEMO_CONTRATACIONES_CLASES
        const enDemoClases = DEMO_CONTRATACIONES_CLASES.some(
          (c) => c.plan_membresia_id === planId && c.estado === "VIGENTE"
        );
        if (enDemoClases) return true;

        // 5. Fallback sobre DEMO_GIMNASIO
        const enDemoGimnasio = DEMO_GIMNASIO.contrataciones.some(
          (c) => c.plan_membresia_id === planId && c.estado === "VIGENTE"
        );
        if (enDemoGimnasio) return true;

        return false;
      },

      obtenerPlanesActivos: () => {
        return get().planes.filter((p) => p.activo !== false);
      },

      eliminarPlan: async (planId: string) => {
        const planExistente = get().planes.find((p) => p.id === planId);
        if (!planExistente) {
          const errorMsg = `Plan con id ${planId} no encontrado`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }

        if (get().tieneContratacionesActivas(planId)) {
          const errorMsg = `No se puede eliminar el plan '${planExistente.nombre}' porque tiene alumnos con contrataciones activas.`;
          set({ error: errorMsg });
          throw new Error(errorMsg);
        }

        // Intento de actualización en Supabase (soft delete activo: false)
        try {
          if (supabase) {
            await supabase
              .from("planes_membresia")
              .update({ activo: false, updated_at: new Date().toISOString() })
              .eq("id", planId);
          }
        } catch (err) {
          console.warn("Aviso al desactivar plan en Supabase:", err);
        }

        const aviso = `Plan '${planExistente.nombre}' eliminado correctamente.`;
        set((state) => ({
          planes: state.planes.map((p) =>
            p.id === planId ? { ...p, activo: false, updated_at: new Date().toISOString() } : p
          ),
          aviso,
          error: null,
        }));
      },

      vincularCobroPlan: (params) => {
        const {
          cobroId,
          contratacionId,
          alumnoId,
          alumnoNombre,
          alumnoEmail,
          alumnoTelefono,
          servicioNombre,
          actividad,
          monto,
          pagado = monto === 0,
          medioPago = "TRANSFERENCIA",
          diaVencimiento,
          fechaVencimiento,
          esAdicional = true,
          notas,
          planId,
        } = params;

        const estaPagado = pagado || monto === 0;
        const ahoraIso = new Date().toISOString();
        const pagoId = `pago-${contratacionId}`;
        const nuevoCobroId = cobroId ?? `cobro-${contratacionId}`;

        const nuevoCobro: CobroItem = {
          id: nuevoCobroId,
          alumnoId,
          alumnoNombre,
          alumnoEmail,
          alumnoTelefono: alumnoTelefono ?? null,
          contratacionId,
          planId: planId ?? undefined,
          servicioNombre,
          actividad: actividad ?? null,
          monto,
          montoLista: monto,
          notaDescuento: notas ?? undefined,
          diaVencimiento,
          fechaVencimiento,
          estado: estaPagado ? "PAGADO" : "PENDIENTE",
          ultimoPago: estaPagado
            ? {
                id: pagoId,
                monto,
                montoLista: monto,
                medioPago,
                fechaPago: ahoraIso,
                confirmadoPor: monto === 0 ? "Convenio $0" : "Coach",
                notas: notas ?? (monto === 0 ? "Plan $0" : undefined),
              }
            : undefined,
        };

        const nuevoPago: PagoMensualInput | undefined = estaPagado
          ? {
              id: pagoId,
              monto,
              montoCobrado: monto,
              fechaPago: ahoraIso,
              actividad: actividad ?? null,
              servicioNombre,
              tipoServicio: actividad === "RUTINAS" ? "ASESORIA_ONLINE" : "PRESENCIAL",
              notas: notas ?? undefined,
            }
          : undefined;

        set((state) => {
          const base = esAdicional
            ? state.cobros.filter((c) => c.id !== nuevoCobroId && c.contratacionId !== contratacionId)
            : state.cobros.filter((c) => c.alumnoId !== alumnoId);
          return {
            cobros: [nuevoCobro, ...base],
            pagosHistorial: nuevoPago
              ? [...(state.pagosHistorial ?? []), nuevoPago]
              : state.pagosHistorial,
          };
        });
      },
    }),
    {
      name: "gozster-cobros",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        cobros: s.cobros,
        filtroEstado: s.filtroEstado,
        planes: s.planes,
      }),
    },
  ),
);
