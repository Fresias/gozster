import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { computeAnchoredRenewalDate, derivarEstadoContratacion } from "@/lib/contrataciones";
import { supabase } from "@/lib/supabase/client";
import {
  DEMO_ALUMNOS,
  DEMO_ALUMNOS_CLASES,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_GIMNASIO,
  DEMO_PLANES_MEMBRESIA,
} from "@/services/coach-demo-dataset";
import { safeStorage, useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import type { Contratacion, MedioPago, Pago } from "@/types/database.types";

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
}

export interface CobrosMetricas {
  ingresosMes: number;
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
  filtroEstado: FiltroCobros;
  busqueda: string;
  cargando: boolean;
  accionEnCurso: string | null;
  error: string | null;
  aviso: string | null;
  comprobanteActivo: ComprobanteInterno | null;

  setFiltroEstado: (filtro: FiltroCobros) => void;
  setBusqueda: (busqueda: string) => void;
  setComprobanteActivo: (comprobante: ComprobanteInterno | null) => void;
  limpiarMensajes: () => void;

  cargarCobros: () => Promise<void>;
  registrarPago: (params: {
    contratacionId: string;
    monto: number;
    montoLista?: number;
    medioPago: "TRANSFERENCIA" | "EFECTIVO";
    notas?: string;
  }) => Promise<ComprobanteInterno>;
  recuperarMontoOriginal: (contratacionId: string) => void;
  obtenerDescuentos: () => CobroItem[];
  obtenerComprobante: (contratacionId: string) => ComprobanteInterno | null;
  metricas: () => CobrosMetricas;
  resetDemoDataset: () => void;
}

const enLinea = () => useOfflineQueueStore.getState().isOnline;
const esModoTesteo = () => useWorkspaceModeStore.getState().mode === "TESTEO";

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

  for (const c of gimnasio.contrataciones) {
    if (idsYaAgregados.has(c.alumno_id)) continue;
    idsYaAgregados.add(c.alumno_id);

    const alumno = gimnasio.alumnos.find((a) => a.id === c.alumno_id);
    if (!alumno || alumno.rol !== "ALUMNO" || alumno.estado_membresia === "INACTIVA") continue;

    const plan = DEMO_PLANES_MEMBRESIA.find((p) => p.id === c.plan_membresia_id);
    const monto = plan?.precio ?? 28000;
    const servicioNombre = plan?.nombre ?? "Asesoría & Rutina";

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
      servicioNombre,
      actividad: c.actividad,
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

export const useCobrosStore = create<CobrosState>()(
  persist(
    (set, get) => ({
      cobros: generarDemoCobrosIniciales(),
      filtroEstado: "TODOS",
      busqueda: "",
      cargando: false,
      accionEnCurso: null,
      error: null,
      aviso: null,
      comprobanteActivo: null,

      setFiltroEstado: (filtroEstado) => set({ filtroEstado }),
      setBusqueda: (busqueda) => set({ busqueda }),
      setComprobanteActivo: (comprobanteActivo) => set({ comprobanteActivo }),
      limpiarMensajes: () => set({ error: null, aviso: null }),

      resetDemoDataset: () => {
        const demo = generarDemoCobrosIniciales();
        set({
          cobros: demo,
          filtroEstado: "TODOS",
          busqueda: "",
          error: null,
          aviso: null,
          comprobanteActivo: null,
        });
      },

      cargarCobros: async () => {
        if (esModoTesteo()) {
          if (get().cobros.length === 0) {
            set({ cobros: generarDemoCobrosIniciales(), cargando: false });
          }
          return;
        }

        if (!enLinea()) {
          set({ error: "Sin conexión: mostramos los cobros guardados localmente." });
          return;
        }

        set({ cargando: true, error: null });
        try {
          const { data: contrataciones, error: errC } = await supabase
            .from("contrataciones")
            .select("*, perfiles(id, nombre_completo, email, telefono), planes_membresia(nombre, precio)")
            .order("fecha_fin", { ascending: false });

          if (errC) throw errC;

          const hoyStr = new Date().toISOString().slice(0, 10);
          const { data: pagos } = await supabase
            .from("pagos")
            .select("*")
            .eq("estado", "CONFIRMADO")
            .order("created_at", { ascending: false });

          const items: CobroItem[] = (contrataciones ?? []).map((row: any) => {
            const perfil = row.perfiles;
            const plan = row.planes_membresia;
            const pago = pagos?.find((p) => p.contratacion_id === row.id);

            let estado: EstadoCobro = "PENDIENTE";
            let ultimoPago: CobroItem["ultimoPago"] | undefined = undefined;

            if (pago) {
              estado = "PAGADO";
              ultimoPago = {
                id: pago.id,
                monto: pago.monto,
                medioPago: pago.medio_pago === "EFECTIVO" ? "EFECTIVO" : "TRANSFERENCIA",
                fechaPago: pago.confirmado_at ?? pago.created_at,
                confirmadoPor: "Coach",
              };
            } else if (row.estado === "VENCIDA" || row.fecha_fin < hoyStr) {
              estado = "VENCIDO";
            }

            return {
              id: `cobro-${row.id}`,
              alumnoId: row.alumno_id,
              alumnoNombre: perfil?.nombre_completo ?? "Alumno",
              alumnoEmail: perfil?.email ?? "",
              alumnoTelefono: perfil?.telefono ?? null,
              contratacionId: row.id,
              servicioNombre: plan?.nombre ?? (row.actividad ? `Presencial ${row.actividad}` : "Servicio"),
              monto: plan?.precio ?? 25000,
              actividad: row.actividad,
              diaVencimiento: row.dia_vencimiento,
              fechaVencimiento: row.fecha_fin,
              estado,
              ultimoPago,
            };
          });

          set({ cobros: items, cargando: false });
        } catch {
          set({
            error: "No pudimos cargar los cobros desde el servidor. Mostramos datos locales.",
            cargando: false,
          });
        }
      },

      registrarPago: async ({ contratacionId, monto, montoLista, medioPago, notas }) => {
        const item = get().cobros.find((c) => c.contratacionId === contratacionId);
        if (!item) {
          throw new Error("Contratación no encontrada");
        }

        set({ accionEnCurso: contratacionId, error: null, aviso: null });

        const precioLista = montoLista ?? item.montoLista ?? item.monto;
        const descuento = precioLista > monto ? precioLista - monto : undefined;

        // Regla ADR-001: anclaje de fecha (vence 10/10, paga 18/10 -> vence 10/11)
        const nuevaFechaFin = computeAnchoredRenewalDate(item.fechaVencimiento, item.diaVencimiento);
        const pagoId = `pago-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const ahoraIso = new Date().toISOString();
        const reciboNumero = `REC-${pagoId.slice(-6).toUpperCase()}`;

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
          confirmadoPor: "Lucía Ferraro",
          proximoVencimiento: nuevaFechaFin,
          notas,
        };

        if (esModoTesteo()) {
          // Actualización en memoria y estado local
          const cobrosActualizados = get().cobros.map((c) => {
            if (c.contratacionId === contratacionId) {
              return {
                ...c,
                estado: "PAGADO" as const,
                monto,
                montoLista: precioLista,
                descuento,
                notaDescuento: notas,
                fechaVencimiento: nuevaFechaFin,
                ultimoPago: {
                  id: pagoId,
                  monto,
                  montoLista: precioLista,
                  descuento,
                  medioPago,
                  fechaPago: ahoraIso,
                  confirmadoPor: "Lucía Ferraro",
                  notas,
                },
              };
            }
            return c;
          });

          set({
            cobros: cobrosActualizados,
            accionEnCurso: null,
            comprobanteActivo: comprobante,
            aviso: `Pago de $${monto.toLocaleString("es-AR")} (${medioPago}) confirmado exitosamente.`,
          });

          return comprobante;
        }

        // Modo Producción
        try {
          if (enLinea()) {
            const idempotencyKey = `pago-${contratacionId}-${nuevaFechaFin}`;
            const { error: rpcErr } = await supabase.rpc("registrar_y_confirmar_renovacion", {
              p_contratacion_id: contratacionId,
              p_monto: monto,
              p_medio_pago: medioPago,
              p_idempotency_key: idempotencyKey,
            });
            if (rpcErr) throw rpcErr;
          } else {
            // Guardar en cola offline
            useOfflineQueueStore.getState().enqueueEvent({
              id: `offline-pago-${Date.now()}`,
              action: "registrar_pago",
              payload: { contratacionId, monto, medioPago, notas, nuevaFechaFin },
            });
          }

          const cobrosActualizados = get().cobros.map((c) => {
            if (c.contratacionId === contratacionId) {
              return {
                ...c,
                estado: "PAGADO" as const,
                monto,
                montoLista: precioLista,
                descuento,
                notaDescuento: notas,
                fechaVencimiento: nuevaFechaFin,
                ultimoPago: {
                  id: pagoId,
                  monto,
                  montoLista: precioLista,
                  descuento,
                  medioPago,
                  fechaPago: ahoraIso,
                  confirmadoPor: "Coach",
                  notas,
                },
              };
            }
            return c;
          });

          set({
            cobros: cobrosActualizados,
            accionEnCurso: null,
            comprobanteActivo: comprobante,
            aviso: `Pago registrado correctamente.`,
          });

          return comprobante;
        } catch (err: any) {
          set({
            accionEnCurso: null,
            error: err.message || "Error registrando pago en el servidor.",
          });
          throw err;
        }
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

      metricas: () => {
        const lista = get().cobros;
        let ingresosMes = 0;
        let cobranzaPendiente = 0;
        let cobranzaVencida = 0;
        let alumnosMorosos = 0;
        let alumnosAlDia = 0;
        let totalDescuentos = 0;
        let cobrosConDescuento = 0;

        for (const item of lista) {
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
            ingresosMes += item.ultimoPago?.monto ?? item.monto;
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
    }),
    {
      name: "gozster-cobros",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        cobros: s.cobros,
        filtroEstado: s.filtroEstado,
      }),
    },
  ),
);
