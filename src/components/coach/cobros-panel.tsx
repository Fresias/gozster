"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  useCobrosStore,
  type CobroItem,
  type ComprobanteInterno,
  type FiltroCobros,
  ultimaSuscripcionPorAlumno,
} from "@/store/use-cobros-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { type ActividadKpi } from "@/lib/kpi-anual";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  type ActividadPlanOpcion,
  type PlanMembresiaConVigencia,
  AVISO_VIGENCIA_FUTURA,
  formatearActividadPlan,
  formatearDuracionPlan,
  getMananaFechaString,
  validarVigenciaFutura,
} from "@/lib/planes";
import { HistorialCobrosDrawer } from "@/components/coach/historial-cobros-drawer";
import { ModalAsignarPlan } from "@/components/coach/modal-asignar-plan";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { MoreHorizontal, Search } from "@/components/ui/icons";
import type { KpisNegocio } from "@/lib/kpis-negocio";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";

export interface CobrosPanelProps {
  initialKpiAnualAbierto?: boolean;
  initialFiltroActividad?: ActividadKpi;
  initialFiltroEstado?: FiltroCobros;
  initialSheetPagoOpen?: boolean;
  initialCobroSeleccionado?: CobroItem;
  initialRowMenuOpen?: boolean;
  kpis?: KpisNegocio;
}

export function CobrosPanel({
  initialKpiAnualAbierto,
  initialFiltroActividad,
  initialFiltroEstado,
  initialSheetPagoOpen,
  initialCobroSeleccionado,
  initialRowMenuOpen,
  kpis: propKpis,
}: CobrosPanelProps = {}): React.JSX.Element {
  const {
    cobros,
    planes,
    filtroEstado: storeFiltroEstado,
    filtroActividadKpiAnual,
    kpiAnualAbierto: storeKpiAnualAbierto,
    setFiltroActividadKpiAnual,
    setKpiAnualAbierto: storeSetKpiAnualAbierto,
    kpiIngresosAnual,
    busqueda,
    cargando,
    accionEnCurso,
    error,
    aviso,
    comprobanteActivo,
    setFiltroEstado: storeSetFiltroEstado,
    setBusqueda,
    setComprobanteActivo,
    limpiarMensajes,
    cargarCobros,
    registrarPago,
    recuperarMontoOriginal,
    obtenerComprobante,
    metricas,
    crearPlan,
    modificarPlan,
  } = useCobrosStore();
  const cobrosSearchRef = React.useRef<HTMLInputElement>(null);

  const [localFiltroEstado, setLocalFiltroEstado] = React.useState<FiltroCobros | undefined>(
    initialFiltroEstado
  );
  const filtroEstado = localFiltroEstado ?? storeFiltroEstado;
  const setFiltroEstado = (val: FiltroCobros) => {
    setLocalFiltroEstado(val);
    storeSetFiltroEstado(val);
  };

  const router = useRouter();
  const selectAlumno = useCoachStudioStore((s) => s.selectAlumno);

  const isOnline = useOfflineQueueStore((s) => s.isOnline);

  // Modales de planes
  const planesDialogRef = React.useRef<HTMLDialogElement>(null);
  const planFormDialogRef = React.useRef<HTMLDialogElement>(null);

  // Formulario crear/editar plan
  const [planEnEdicion, setPlanEnEdicion] = React.useState<PlanMembresiaConVigencia | null>(null);
  const [planNombre, setPlanNombre] = React.useState("");
  const [planActividad, setPlanActividad] = React.useState<ActividadPlanOpcion>("FUNCIONAL");
  const [planDuracion, setPlanDuracion] = React.useState<1 | 3 | 6 | 12>(1);
  const [planLimiteSemanal, setPlanLimiteSemanal] = React.useState<number | null>(null);
  const [planPrecio, setPlanPrecio] = React.useState<number>(30000);
  const [planNotas, setPlanNotas] = React.useState<string>("");
  const [planFechaVigencia, setPlanFechaVigencia] = React.useState<string>("");
  const [errorFechaVigencia, setErrorFechaVigencia] = React.useState<string | null>(null);

  // Modal rápido de asignación / cambio de plan desde la tabla de cobros
  const [alumnoParaAsignar, setAlumnoParaAsignar] = React.useState<CobroItem | null>(null);

  const fechaMinimaManana = React.useMemo(() => getMananaFechaString(), []);

  const abrirModalGestionPlanes = () => {
    planesDialogRef.current?.showModal();
  };

  const abrirModalCrearPlan = () => {
    setPlanEnEdicion(null);
    setPlanNombre("");
    setPlanActividad("FUNCIONAL");
    setPlanDuracion(1);
    setPlanLimiteSemanal(null);
    setPlanPrecio(30000);
    setPlanNotas("");
    setPlanFechaVigencia(getMananaFechaString());
    setErrorFechaVigencia(null);
    planFormDialogRef.current?.showModal();
  };

  const abrirModalEditarPlan = (plan: PlanMembresiaConVigencia) => {
    setPlanEnEdicion(plan);
    setPlanNombre(plan.nombre);
    const act =
      plan.actividad_tipo ?? (plan.cantidad_actividades === 2 ? "FUNCIONAL_BOXEO" : "FUNCIONAL");
    setPlanActividad(act);
    setPlanDuracion((plan.duracion_meses as 1 | 3 | 6 | 12) || 1);
    setPlanLimiteSemanal(act === "RUTINAS" ? null : plan.limite_semanal);
    setPlanPrecio(plan.precio);
    setPlanNotas(plan.notas ?? "");
    setPlanFechaVigencia(getMananaFechaString());
    setErrorFechaVigencia(null);
    planFormDialogRef.current?.showModal();
  };

  const handleGuardarPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const validacion = validarVigenciaFutura(planFechaVigencia);
    if (!validacion.valida) {
      setErrorFechaVigencia(validacion.error ?? "La fecha de vigencia debe ser posterior a hoy.");
      return;
    }

    try {
      const limite = planActividad === "RUTINAS" ? null : planLimiteSemanal;
      if (planEnEdicion) {
        await modificarPlan({
          planId: planEnEdicion.id,
          nombre: planNombre.trim(),
          precio: Number(planPrecio),
          fechaVigencia: planFechaVigencia,
          duracionMeses: planDuracion,
          limiteSemanal: limite,
          notas: planNotas.trim() || null,
        });
      } else {
        await crearPlan({
          nombre: planNombre.trim(),
          actividad: planActividad,
          duracionMeses: planDuracion,
          limiteSemanal: limite,
          precio: Number(planPrecio),
          fechaVigencia: planFechaVigencia,
          notas: planNotas.trim() || null,
        });
      }
      planFormDialogRef.current?.close();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorFechaVigencia(err.message);
      }
    }
  };

  // Sheet lateral registrar pago (GOZS-398)
  const [sheetPagoAbierto, setSheetPagoAbierto] = React.useState<boolean>(
    initialSheetPagoOpen ?? false
  );
  const [cobroSeleccionado, setCobroSeleccionado] = React.useState<CobroItem | null>(() => {
    if (initialCobroSeleccionado) return initialCobroSeleccionado;
    return cobros.find((c) => c.estado === "VENCIDO" || c.estado === "PENDIENTE") ?? cobros[0] ?? null;
  });
  const [pagoMonto, setPagoMonto] = React.useState<number | "">(() => {
    if (initialCobroSeleccionado) return initialCobroSeleccionado.monto;
    const initialItem = cobros.find((c) => c.estado === "VENCIDO" || c.estado === "PENDIENTE") ?? cobros[0];
    return initialItem?.monto ?? 25000;
  });
  const [pagoMedio, setPagoMedio] = React.useState<"TRANSFERENCIA" | "EFECTIVO" | "">("TRANSFERENCIA");
  const [pagoFecha, setPagoFecha] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [pagoNotas, setPagoNotas] = React.useState("");
  const [formEnviado, setFormEnviado] = React.useState(false);
  const ultimoTriggerRef = React.useRef<HTMLElement | null>(null);
  const registrarDialogRef = React.useRef<HTMLDialogElement>(null);

  // Optimistic deltas para actualización reactiva inmediata de KPIs superiores
  const [optimisticCobradoDelta, setOptimisticCobradoDelta] = React.useState(0);
  const [optimisticVencidoDelta, setOptimisticVencidoDelta] = React.useState(0);
  const [optimisticPorCobrarDelta, setOptimisticPorCobrarDelta] = React.useState(0);
  const [optimisticAlumnosAlDiaDelta, setOptimisticAlumnosAlDiaDelta] = React.useState(0);
  const [optimisticAlumnosMorososDelta, setOptimisticAlumnosMorososDelta] = React.useState(0);

  // Modal recibo
  const reciboDialogRef = React.useRef<HTMLDialogElement>(null);

  // Modal KPI Anual (Enero a Diciembre y desagregado por actividad)
  const [localKpiAnualAbierto, setLocalKpiAnualAbierto] = React.useState<boolean>(
    initialKpiAnualAbierto ?? false
  );
  const kpiAnualAbierto = localKpiAnualAbierto || Boolean(storeKpiAnualAbierto);
  const setKpiAnualAbierto = (val: boolean) => {
    setLocalKpiAnualAbierto(val);
    storeSetKpiAnualAbierto(val);
  };

  const [filtroActividad, setFiltroActividad] = React.useState<ActividadKpi>(
    initialFiltroActividad ?? filtroActividadKpiAnual ?? "TODAS"
  );
  const handleCambiarFiltroActividad = (act: ActividadKpi) => {
    setFiltroActividad(act);
    setFiltroActividadKpiAnual(act);
  };

  const kpiAnualDialogRef = React.useRef<HTMLDialogElement>(null);

  // Estado de colapso de descuentos en Cobros & Pagos (persistido en localStorage)
  const [descuentosColapsados, setDescuentosColapsados] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("gozster:cobros:descuentos-colapsados") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  const toggleColapsarDescuentos = React.useCallback(() => {
    setDescuentosColapsados((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("gozster:cobros:descuentos-colapsados", String(next));
        } catch {}
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (kpiAnualAbierto) {
      if (kpiAnualDialogRef.current && !kpiAnualDialogRef.current.open) {
        try {
          kpiAnualDialogRef.current.showModal();
        } catch {
          // Fallback para entornos donde showModal no esté implementado
        }
      }
    } else {
      if (kpiAnualDialogRef.current?.open) {
        try {
          kpiAnualDialogRef.current.close();
        } catch {}
      }
    }
  }, [kpiAnualAbierto]);

  const kpiAnualResultado = React.useMemo(() => {
    return kpiIngresosAnual(undefined, filtroActividad);
  }, [kpiIngresosAnual, filtroActividad, cobros]);

  React.useEffect(() => {
    void cargarCobros();
  }, [cargarCobros]);

  const kpis = metricas();
  const kpisNegocio = propKpis ?? DEMO_KPIS_NEGOCIO;
  const cobradoValor =
    (propKpis ? (propKpis.cobrado ?? 0) : kpis.ingresosMes) +
    (propKpis ? optimisticCobradoDelta : 0);
  const porCobrarValor = Math.max(
    0,
    (propKpis ? (propKpis.porCobrar ?? 0) : kpis.cobranzaPendiente) -
      (propKpis ? optimisticPorCobrarDelta : 0)
  );
  const vencidoValor = Math.max(
    0,
    (propKpis ? (propKpis.vencido ?? 0) : kpis.cobranzaVencida) -
      (propKpis ? optimisticVencidoDelta : 0)
  );
  const tasaCobroPctValor = propKpis
    ? Math.round(
        (((propKpis.cobrado ?? 0) + optimisticCobradoDelta) /
          Math.max(
            1,
            (propKpis.cobrado ?? 0) +
              optimisticCobradoDelta +
              Math.max(0, (propKpis.porCobrar ?? 0) - optimisticPorCobrarDelta) +
              Math.max(0, (propKpis.vencido ?? 0) - optimisticVencidoDelta)
          )) *
          100
      )
    : kpis.tasaCobranzaPct;
  const alumnosAlDiaValor =
    (propKpis ? (propKpis.alumnos_al_dia ?? propKpis.alumnosAlDia ?? 0) : kpis.alumnosAlDia) +
    (propKpis ? optimisticAlumnosAlDiaDelta : 0);
  const alumnosMorososValor = Math.max(
    0,
    (propKpis ? (propKpis.alumnos_morosos ?? propKpis.alumnosMorosos ?? 0) : kpis.alumnosMorosos) -
      (propKpis ? optimisticAlumnosMorososDelta : 0)
  );

  const hoyIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const cobrosConDescuento = React.useMemo(() => {
    return cobros.filter(
      (c) =>
        (c.montoLista && c.monto < c.montoLista) ||
        (c.ultimoPago?.montoLista && c.ultimoPago.monto < c.ultimoPago.montoLista) ||
        Boolean(c.descuento && c.descuento > 0) ||
        Boolean(c.ultimoPago?.descuento && c.ultimoPago.descuento > 0),
    );
  }, [cobros]);

  const cobrosFiltrados = React.useMemo(() => {
    return ultimaSuscripcionPorAlumno(cobros).filter((c) => {
      // Filtro de estado
      if (filtroEstado === "PENDIENTES" && c.estado !== "PENDIENTE") return false;
      if (filtroEstado === "VENCIDOS") {
        const esVencido =
          c.estado === "VENCIDO" ||
          (Boolean(c.fechaVencimiento) && c.fechaVencimiento < hoyIso && c.estado !== "PAGADO");
        if (!esVencido) return false;
      }
      if (filtroEstado === "PAGADOS" && c.estado !== "PAGADO") return false;
      if (filtroEstado === "DESCUENTOS") {
        const tieneDesc =
          (c.montoLista && c.monto < c.montoLista) ||
          (c.ultimoPago?.montoLista && c.ultimoPago.monto < c.ultimoPago.montoLista) ||
          Boolean(c.descuento && c.descuento > 0) ||
          Boolean(c.ultimoPago?.descuento && c.ultimoPago.descuento > 0);
        if (!tieneDesc) return false;
      }

      // Filtro de búsqueda
      if (busqueda.trim()) {
        const query = busqueda.toLowerCase().trim();
        const coincideNombre = c.alumnoNombre.toLowerCase().includes(query);
        const coincideEmail = c.alumnoEmail.toLowerCase().includes(query);
        const coincideServicio = c.servicioNombre.toLowerCase().includes(query);
        const coincideContrato =
          c.contratacionId.toLowerCase().includes(query) || c.id.toLowerCase().includes(query);
        if (!coincideNombre && !coincideEmail && !coincideServicio && !coincideContrato) return false;
      }

      return true;
    });
  }, [cobros, filtroEstado, busqueda, hoyIso]);

  const cobrosOrdenados = React.useMemo(() => {
    const esVencido = (c: CobroItem) =>
      c.estado === "VENCIDO" ||
      (Boolean(c.fechaVencimiento) && c.fechaVencimiento < hoyIso && c.estado !== "PAGADO");

    return [...cobrosFiltrados].sort((a, b) => {
      const aVencido = esVencido(a);
      const bVencido = esVencido(b);

      // Contratos vencidos al tope (primer orden)
      if (aVencido && !bVencido) return -1;
      if (!aVencido && bVencido) return 1;

      // Si ambos son vencidos, ordenar por vencimiento ascendente
      if (aVencido && bVencido) {
        return a.fechaVencimiento.localeCompare(b.fechaVencimiento);
      }

      // Pendientes antes de pagados
      if (a.estado === "PENDIENTE" && b.estado === "PAGADO") return -1;
      if (a.estado === "PAGADO" && b.estado === "PENDIENTE") return 1;

      return a.fechaVencimiento.localeCompare(b.fechaVencimiento);
    });
  }, [cobrosFiltrados, hoyIso]);

  const abrirModalPago = (item: CobroItem, triggerEl?: HTMLElement | null) => {
    if (triggerEl) {
      ultimoTriggerRef.current = triggerEl;
    }
    setCobroSeleccionado(item);
    setPagoMonto(item.monto);
    setPagoMedio("TRANSFERENCIA");
    setPagoFecha(new Date().toISOString().slice(0, 10));
    setPagoNotas(item.notaDescuento || "");
    setFormEnviado(false);
    setSheetPagoAbierto(true);
  };

  const retornarFocoAFila = React.useCallback((contratacionId: string) => {
    if (typeof window === "undefined") return;
    setTimeout(() => {
      if (
        ultimoTriggerRef.current &&
        document.body.contains(ultimoTriggerRef.current) &&
        !ultimoTriggerRef.current.hasAttribute("disabled")
      ) {
        ultimoTriggerRef.current.focus();
        return;
      }
      const contenedorFila = document.querySelector<HTMLElement>(
        `[data-contratacion-id="${contratacionId}"]`
      );
      if (contenedorFila) {
        const botonFila = contenedorFila.querySelector<HTMLElement>("button:not([disabled])");
        if (botonFila) {
          botonFila.focus();
          return;
        }
        contenedorFila.focus();
        return;
      }
      const fila = document.getElementById(`cobro-row-${contratacionId}`);
      fila?.focus();
    }, 50);
  }, []);

  const handleSheetPagoOpenChange = (open: boolean) => {
    setSheetPagoAbierto(open);
    if (!open && cobroSeleccionado) {
      retornarFocoAFila(cobroSeleccionado.contratacionId);
    }
  };

  const handleConfirmarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormEnviado(true);
    if (!cobroSeleccionado) return;

    const montoNum = Number(pagoMonto);
    if (montoNum <= 0 || isNaN(montoNum) || !pagoMedio || !pagoFecha) {
      return;
    }

    try {
      const contratacionId = cobroSeleccionado.contratacionId;
      const estadoAnterior = cobroSeleccionado.estado;

      const comprobante = await registrarPago({
        contratacionId,
        monto: montoNum,
        montoLista: cobroSeleccionado.montoLista ?? cobroSeleccionado.monto,
        medioPago: pagoMedio,
        notas: pagoNotas.trim() || undefined,
        fechaPago: pagoFecha,
      });

      // Mutación optimista reactiva de KPIs
      if (estadoAnterior === "VENCIDO") {
        setOptimisticVencidoDelta((prev) => prev + montoNum);
        setOptimisticAlumnosMorososDelta((prev) => prev + 1);
        setOptimisticAlumnosAlDiaDelta((prev) => prev + 1);
      } else if (estadoAnterior === "PENDIENTE") {
        setOptimisticPorCobrarDelta((prev) => prev + montoNum);
      }
      setOptimisticCobradoDelta((prev) => prev + montoNum);

      setSheetPagoAbierto(false);
      setComprobanteActivo(comprobante);
      retornarFocoAFila(contratacionId);
      reciboDialogRef.current?.showModal();
    } catch {
      // Error manejado en store
    }
  };

  // Drawer lateral de Historial de Cobros y Pagos (GOZS-350)
  const [historialAlumnoId, setHistorialAlumnoId] = React.useState<string | null>(null);
  const [historialDrawerOpen, setHistorialDrawerOpen] = React.useState(false);

  const verHistorial = (alumnoId: string) => {
    selectAlumno(alumnoId);
    setHistorialAlumnoId(alumnoId);
    setHistorialDrawerOpen(true);
  };

  const cerrarHistorial = () => {
    setHistorialDrawerOpen(false);
    setHistorialAlumnoId(null);
  };

  const abrirComprobante = (contratacionId: string) => {
    const rec = obtenerComprobante(contratacionId);
    if (rec) {
      setComprobanteActivo(rec);
      reciboDialogRef.current?.showModal();
    }
  };

  const formatearDinero = (monto: number) =>
    `$${monto.toLocaleString("es-AR")}`;

  const formatearFecha = (fechaStr: string) => {
    if (!fechaStr) return "—";
    const [anio, mes, dia] = fechaStr.split("-");
    return `${dia}/${mes}/${anio}`;
  };

  const diasRelativos = (fechaStr: string) => {
    if (!fechaStr) return "";
    const f = new Date(`${fechaStr.slice(0, 10)}T12:00:00`);
    const hoy = new Date(`${hoyIso}T12:00:00`);
    const dias = Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
    if (dias === 0) return "hoy";
    if (dias > 0) return dias === 1 ? "mañana" : `en ${dias} días`;
    return dias === -1 ? "ayer" : `hace ${Math.abs(dias)} días`;
  };

  const fechaCortaPago = (iso: string) => {
    const f = new Date(iso);
    if (Number.isNaN(f.getTime())) return iso;
    return `${f.getDate()} ${f.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}`;
  };

  // Columnas del objetivo Cobros.html: Alumno · Plan · Vence · Monto · Estado · Último pago · acciones
  const columns: ColumnDef<CobroItem>[] = React.useMemo(
    () => [
      {
        id: "alumno",
        accessorKey: "alumnoNombre",
        header: "Alumno",
        sortable: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{row.alumnoNombre}</span>
            <span className="block truncate text-xs text-neutral-soft-foreground">{row.alumnoEmail}</span>
          </div>
        ),
      },
      {
        id: "servicio",
        accessorKey: "servicioNombre",
        header: "Plan",
        sortable: true,
        cell: ({ row }) => {
          // P08: el descuento va junto al plan ("Pase libre −20%") y el monto final en una línea
          const pctDescuento =
            row.montoLista && row.montoLista > row.monto
              ? Math.round(((row.montoLista - row.monto) / row.montoLista) * 100)
              : 0;
          const nota = row.ultimoPago?.notas || row.notaDescuento;
          return (
            <span className="text-sm text-foreground" title={nota ? `Nota: ${nota}` : undefined}>
              {row.servicioNombre}
              {pctDescuento > 0 && <span className="text-neutral-soft-foreground"> −{pctDescuento}%</span>}
              {nota && (
                <span className="sr-only" data-testid="cobro-nota-texto">
                  Nota: {nota}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: "vencimiento",
        accessorKey: "fechaVencimiento",
        header: "Vence",
        sortable: true,
        cell: ({ row }) => (
          <div title={`Día ${row.diaVencimiento} anclado`}>
            <span className="block text-sm tabular-nums text-foreground">{formatearFecha(row.fechaVencimiento)}</span>
            <span className="block text-xs text-neutral-soft-foreground">{diasRelativos(row.fechaVencimiento)}</span>
          </div>
        ),
      },
      {
        id: "monto",
        accessorKey: "monto",
        header: "Monto",
        sortable: true,
        className: "text-right",
        headerClassName: "text-right",
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums text-foreground" data-testid="cobro-monto">
            {formatearDinero(row.monto)}
          </span>
        ),
      },
      {
        id: "estado",
        accessorKey: "estado",
        header: "Estado",
        sortable: true,
        cell: ({ row }) => {
          const esPagado = row.estado === "PAGADO";
          const esVencido = row.estado === "VENCIDO";
          return (
            <StatusBadge
              variant={esPagado ? "success" : esVencido ? "destructive" : "warning"}
              size="sm"
              data-testid="estado-cobro-badge"
            >
              {esPagado ? "Pagado" : esVencido ? "Vencido" : "Pendiente"}
            </StatusBadge>
          );
        },
      },
      {
        id: "ultimoPago",
        header: "Último pago",
        cell: ({ row }) =>
          row.ultimoPago ? (
            <span className="text-sm text-foreground">
              {row.ultimoPago.medioPago === "TRANSFERENCIA" ? "Transferencia" : "Efectivo"} ·{" "}
              {fechaCortaPago(row.ultimoPago.fechaPago)}
            </span>
          ) : (
            <span className="text-sm text-neutral-soft-foreground">Sin pagos</span>
          ),
      },
      {
        id: "acciones",
        header: <span className="sr-only">Acciones</span>,
        className: "text-right",
        headerClassName: "text-right",
        cell: ({ row }) => {
          const esPagado = row.estado === "PAGADO";
          return (
            <div
              className="flex items-center justify-end gap-1.5"
              data-contratacion-id={row.contratacionId}
              id={`cobro-row-${row.contratacionId}`}
              tabIndex={-1}
            >
              {esPagado ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirComprobante(row.contratacionId)}
                  data-testid="ver-recibo-btn"
                  aria-label="Ver comprobante"
                  className="h-8 px-3 text-sm font-medium"
                >
                  Ver recibo
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={accionEnCurso === row.contratacionId}
                  onClick={(e) => abrirModalPago(row, e.currentTarget)}
                  data-testid="registrar-pago-btn"
                  className="h-8 px-3 text-sm font-medium"
                >
                  Registrar pago
                </Button>
              )}

              <DropdownMenu open={initialRowMenuOpen}>
                <DropdownMenuTrigger
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label={`Más acciones para ${row.alumnoNombre}`}
                  data-testid="cobro-acciones-menu-btn"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {esPagado ? (
                    <DropdownMenuItem
                      onClick={() => abrirComprobante(row.contratacionId)}
                      data-testid="menu-item-ver-comprobante"
                      aria-label="Ver comprobante"
                    >
                      Ver comprobante
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={(e) => abrirModalPago(row, e.currentTarget)}
                      disabled={accionEnCurso === row.contratacionId}
                      data-testid="menu-item-registrar-pago"
                    >
                      Registrar pago
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => verHistorial(row.alumnoId)}
                    data-testid="ver-historial-btn"
                  >
                    Historial de cobros
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setAlumnoParaAsignar(row)}
                    data-testid="btn-cambiar-plan-cobros"
                  >
                    Cambiar o asignar plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [accionEnCurso],
  );

  return (
    <section className="space-y-6" aria-labelledby="cobros-titulo" data-testid="cobros-panel" suppressHydrationWarning>
      {/* Cabecera (objetivo Cobros.html): título, período y dos acciones */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 id="cobros-titulo" className="m-0 text-2xl font-semibold tracking-[-0.02em]">
            Cobros
          </h1>
          <p className="m-0 text-sm text-neutral-soft-foreground" suppressHydrationWarning>
            {(() => {
              const t = new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" });
              return t.charAt(0).toUpperCase() + t.slice(1);
            })()}{" "}
            · recibos internos, no fiscales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isOnline && (
            <span className="rounded-full border border-warning-soft-border bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning-soft-foreground">
              Sin conexión · cobros guardados
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={abrirModalGestionPlanes}
            data-testid="btn-gestionar-planes"
            className="h-9 px-3.5 text-sm font-medium"
          >
            Planes y precios
          </Button>
          <Button
            type="button"
            onClick={() => {
              // Registrar pago: se elige el alumno desde la tabla (vencidos primero)
              setFiltroEstado("VENCIDOS");
              cobrosSearchRef.current?.focus();
            }}
            data-testid="btn-registrar-pago-cabecera"
            className="h-9 px-3.5 text-sm font-medium"
          >
            Registrar pago
          </Button>
        </div>
      </header>

      {/* Avisos y Errores */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
          data-testid="cobros-error-alert"
        >
          <span>{error}</span>
          <button type="button" onClick={limpiarMensajes} className="min-h-8 px-1 font-bold" aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
          data-testid="cobros-aviso-alert"
        >
          <span>{aviso}</span>
          <button type="button" onClick={limpiarMensajes} className="min-h-8 px-1 font-bold" aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {/* KPIs con la misma tarjeta que Inicio (P08): etiqueta, cifra 28/600 y detalle */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="cobros-kpis" suppressHydrationWarning>
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          <span className="text-[13px] text-neutral-soft-foreground">Cobrado</span>
          <p
            className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground"
            data-testid="kpi-ingresos-mes"
            suppressHydrationWarning
          >
            {formatearDinero(cobradoValor)}
          </p>
          <p className="m-0 flex flex-wrap items-center gap-x-1 text-[13px] text-neutral-soft-foreground">
            <span>{cobros.filter((c) => c.estado === "PAGADO").length} pagos este mes ·</span>
            <button
              type="button"
              onClick={() => setKpiAnualAbierto(true)}
              className="underline underline-offset-2 hover:text-foreground cursor-pointer"
              data-testid="btn-abrir-kpi-anual"
              aria-label="Ver KPI anual"
            >
              <span data-testid="abrir-kpi-anual">ver año</span>
              <span data-testid="kpi-anual-trigger" className="sr-only"> anual</span>
            </button>
          </p>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          <span className="text-[13px] text-neutral-soft-foreground">Por cobrar</span>
          <p
            className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground"
            data-testid="kpi-cobranza-pendiente"
            suppressHydrationWarning
          >
            {formatearDinero(porCobrarValor)}
          </p>
          <p className="m-0 text-[13px] text-neutral-soft-foreground">
            {cobros.filter((c) => c.estado === "PENDIENTE").length} cuotas próximas a vencer
          </p>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          <span className="text-[13px] text-neutral-soft-foreground">Vencido</span>
          <p
            className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-danger-soft-foreground"
            data-testid="kpi-vencido"
            suppressHydrationWarning
          >
            {formatearDinero(vencidoValor)}
          </p>
          <p className="m-0 text-[13px] text-neutral-soft-foreground" data-testid="kpi-alumnos-morosos" suppressHydrationWarning>
            {alumnosMorososValor} {alumnosMorososValor === 1 ? "alumno" : "alumnos"} con cuota vencida
          </p>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
          <span className="text-[13px] text-neutral-soft-foreground">Tasa de cobro</span>
          <p
            className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground"
            data-testid="kpi-tasa-cobranza"
            suppressHydrationWarning
          >
            {tasaCobroPctValor}%
          </p>
          <p className="m-0 text-[13px] text-neutral-soft-foreground" suppressHydrationWarning>
            {cobros.filter((c) => c.estado === "PAGADO").length} de {cobros.length} contratos pagos ·{" "}
            {alumnosAlDiaValor} alumnos al día
          </p>
        </div>
      </div>

      {/* VISTA PARA RECUPERAR DESCUENTOS / MONTOS MENORES A LA SUB (solo visible bajo filtro DESCUENTOS) */}
      {filtroEstado === "DESCUENTOS" && cobrosConDescuento.length > 0 && (
        <div
          className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
          data-testid="vista-recuperar-descuentos"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-black font-black text-xs shadow-xs">
                N
              </span>
              <div>
                <h3 className="text-sm font-black text-foreground">
                  Descuentos y Montos Menores a la Suscripción
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Consulta de cuotas con monto menor a la suscripción con opción para recuperar el valor de lista.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <div className="rounded-lg bg-background/90 border border-border/60 px-2.5 py-1">
                <span className="text-muted-foreground mr-1 text-[11px]">Total descuentos:</span>
                <span className="font-black text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatearDinero(kpis.totalDescuentos)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleColapsarDescuentos}
                data-testid="btn-colapso-descuentos"
                className="h-7 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 px-2.5"
              >
                {descuentosColapsados ? "Expandir" : "Minimizar"}
              </Button>
            </div>
          </div>

          {!descuentosColapsados && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cobrosConDescuento.map((itemDesc) => {
                const lista = itemDesc.montoLista ?? itemDesc.monto;
                const cobrado = itemDesc.monto;
                const diferencia = lista > cobrado ? lista - cobrado : (itemDesc.descuento ?? 0);
                const nota = itemDesc.ultimoPago?.notas ?? itemDesc.notaDescuento ?? "Descuento acordado";

                return (
                  <div
                    key={itemDesc.id}
                    className="rounded-xl border border-border/60 bg-card p-3 space-y-2 text-xs shadow-xs hover:border-amber-500/40 transition-colors"
                    data-testid="item-descuento-recuperable"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-foreground text-sm">{itemDesc.alumnoNombre}</p>
                        <p className="text-[11px] text-muted-foreground">{itemDesc.servicioNombre}</p>
                      </div>
                      <span
                        className="inline-flex items-center gap-1 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-black"
                        title={nota}
                      >
                        N
                      </span>
                    </div>

                    <div className="rounded-lg bg-secondary/40 p-2 space-y-1 tabular-nums">
                      <div className="flex justify-between text-muted-foreground text-[11px]">
                        <span>Monto de lista:</span>
                        <span className="line-through">{formatearDinero(lista)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-foreground">
                        <span>Monto cobrado:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-black">
                          {formatearDinero(cobrado)}
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                        <span>Descuento:</span>
                        <span>-{formatearDinero(diferencia)}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">Nota: </span>
                      <span className="italic">{nota}</span>
                    </div>

                    <div className="pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-7 font-bold border-amber-500/40 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        onClick={() => recuperarMontoOriginal(itemDesc.contratacionId)}
                        data-testid="recuperar-monto-btn"
                      >
                        Recuperar monto lista ({formatearDinero(lista)})
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tabla de Cobros con DataTable paginada */}
      {cargando && cobros.length === 0 ? (
        <div className="rounded-2xl border border-border/80 bg-card p-12 text-center text-sm text-muted-foreground">
          Cargando cobros…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {/* Toolbar dentro de la tabla (objetivo Cobros.html): búsqueda + chips de estado */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <label className="flex h-9 w-[260px] max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                ref={cobrosSearchRef}
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar alumno o servicio"
                aria-label="Buscar alumno o servicio"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                data-testid="cobros-search-input"
              />
            </label>

            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtro de estados">
              {(
                [
                  { key: "TODOS", label: "Todos", count: cobros.length, testId: "filtro-todos-btn" },
                  {
                    key: "VENCIDOS",
                    label: "Vencidos",
                    count: cobros.filter((c) => c.estado === "VENCIDO" || (Boolean(c.fechaVencimiento) && c.fechaVencimiento < hoyIso && c.estado !== "PAGADO")).length,
                    testId: "filtro-vencidos-btn",
                  },
                  {
                    key: "PENDIENTES",
                    label: "Por vencer",
                    count: cobros.filter((c) => c.estado === "PENDIENTE").length,
                    testId: "filtro-pendientes-btn",
                  },
                  {
                    key: "PAGADOS",
                    label: "Pagados",
                    count: cobros.filter((c) => c.estado === "PAGADO").length,
                    testId: "filtro-pagados-btn",
                  },
                  {
                    key: "DESCUENTOS",
                    label: "Con descuento",
                    count: cobrosConDescuento.length,
                    testId: "filtro-descuentos-btn",
                  },
                ] as const
              ).map((tab) => {
                const activo = filtroEstado === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() =>
                      setFiltroEstado(tab.key === "DESCUENTOS" && activo ? "TODOS" : tab.key)
                    }
                    aria-pressed={activo}
                    className={`h-8 rounded-lg border px-2.5 text-[13px] transition-colors cursor-pointer ${
                      activo
                        ? "border-border bg-muted text-foreground font-medium"
                        : "border-transparent text-neutral-soft-foreground hover:bg-muted/60"
                    }`}
                    data-testid={tab.testId}
                    suppressHydrationWarning
                  >
                    {tab.label} <span className="text-subtle-foreground tabular-nums">{tab.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        <DataTable
          columns={columns}
          data={cobrosOrdenados}
          pageSize={15}
          showPagination={true}
          containerClassName="border-0 shadow-none rounded-none"
          headerRowClassName="border-b border-border text-[13px] font-medium text-muted-foreground"
          tableTestId="cobros-table"
          rowTestId="cobro-row"
          emptyTitle="No se encontraron cobros"
          emptyDescription={
            busqueda
              ? `No hay coincidencias para "${busqueda}".`
              : "No hay cuotas registradas bajo este filtro."
          }
        />
        </div>
      )}

      {/* SHEET LATERAL: REGISTRAR PAGO (GOZS-398) */}
      <Sheet open={sheetPagoAbierto} onOpenChange={handleSheetPagoOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
          data-testid="registrar-pago-dialog"
          aria-labelledby="registrar-pago-titulo"
        >
          {cobroSeleccionado && (
            <form onSubmit={handleConfirmarPago} className="space-y-4" data-testid="sheet-registrar-pago-form" noValidate>
              <SheetHeader>
                <SheetTitle id="registrar-pago-titulo" className="text-lg font-black text-foreground">
                  Registrar Pago de Cuota
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Formulario lateral para registrar cobro y actualizar estado y métricas.
                </SheetDescription>
              </SheetHeader>

              <div className="rounded-xl bg-secondary/40 border border-border/60 p-3 text-xs space-y-1" data-testid="pago-alumno-resumen">
                <p>
                  <span className="font-bold">Alumno:</span> {cobroSeleccionado.alumnoNombre}
                </p>
                <p>
                  <span className="font-bold">Servicio:</span> {cobroSeleccionado.servicioNombre}
                </p>
                <p className="text-muted-foreground">
                  Ciclo anclado al día {cobroSeleccionado.diaVencimiento} de cada mes.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-pago-monto" className="block text-sm font-semibold">
                  Monto a abonar ($ ARS) <span className="text-destructive">*</span>
                </label>
                <input
                  id="input-pago-monto"
                  type="number"
                  required
                  min="1"
                  step="100"
                  value={pagoMonto}
                  onChange={(e) => setPagoMonto(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-invalid={pagoMonto === "" || Number(pagoMonto) <= 0}
                  aria-describedby={
                    pagoMonto === "" || Number(pagoMonto) <= 0 ? "error-pago-monto" : undefined
                  }
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-bold tabular-nums"
                  data-testid="input-pago-monto"
                  autoFocus
                />
                {(pagoMonto === "" || Number(pagoMonto) <= 0) && (
                  <p
                    id="error-pago-monto"
                    role="alert"
                    aria-live="polite"
                    className="text-xs font-semibold text-destructive mt-1 flex items-center gap-1"
                    data-testid="error-pago-monto"
                  >
                    <span>⚠️</span>
                    <span>El monto debe ser mayor a 0</span>
                  </p>
                )}
              </div>

              {Number(pagoMonto) > 0 &&
                Number(pagoMonto) < (cobroSeleccionado.montoLista ?? cobroSeleccionado.monto) && (
                  <div
                    className="rounded-xl bg-amber-500/15 border border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-200 space-y-1"
                    data-testid="aviso-descuento-detectado"
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500 text-black font-black text-[10px]">
                        N
                      </span>
                      <span>
                        Descuento detectado: -{formatearDinero((cobroSeleccionado.montoLista ?? cobroSeleccionado.monto) - Number(pagoMonto))}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      El monto a abonar es menor al precio de lista ({formatearDinero(cobroSeleccionado.montoLista ?? cobroSeleccionado.monto)}). Se registrará con indicador &apos;N&apos; y la nota en el listado.
                    </p>
                  </div>
                )}

              <div className="space-y-1.5">
                <span className="block text-sm font-semibold">
                  Medio de Pago <span className="text-destructive">*</span>
                </span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de Pago">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pagoMedio === "TRANSFERENCIA"}
                    onClick={() => setPagoMedio(pagoMedio === "TRANSFERENCIA" ? "" : "TRANSFERENCIA")}
                    className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      pagoMedio === "TRANSFERENCIA"
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : "border-border/80 hover:bg-secondary/40"
                    }`}
                    data-testid="medio-transferencia-btn"
                  >
                    <p className="text-xs font-bold text-foreground">Transferencia</p>
                    <p className="text-[10px] text-muted-foreground">CBU / Alias / MP</p>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={pagoMedio === "EFECTIVO"}
                    onClick={() => setPagoMedio(pagoMedio === "EFECTIVO" ? "" : "EFECTIVO")}
                    className={`rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      pagoMedio === "EFECTIVO"
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : "border-border/80 hover:bg-secondary/40"
                    }`}
                    data-testid="medio-efectivo-btn"
                  >
                    <p className="text-xs font-bold text-foreground">Efectivo</p>
                    <p className="text-[10px] text-muted-foreground">En gimnasio</p>
                  </button>
                </div>
                {!pagoMedio && (
                  <p
                    id="error-pago-medio"
                    role="alert"
                    aria-live="polite"
                    className="text-xs font-semibold text-destructive mt-1 flex items-center gap-1"
                    data-testid="error-pago-medio"
                  >
                    <span>⚠️</span>
                    <span>Debe seleccionar un método de pago</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-pago-fecha" className="block text-sm font-semibold">
                  Fecha de cobro <span className="text-destructive">*</span>
                </label>
                <input
                  id="input-pago-fecha"
                  type="date"
                  required
                  value={pagoFecha}
                  onChange={(e) => setPagoFecha(e.target.value)}
                  aria-invalid={!pagoFecha}
                  aria-describedby={!pagoFecha ? "error-pago-fecha" : undefined}
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  data-testid="input-pago-fecha"
                />
                {!pagoFecha && (
                  <p
                    id="error-pago-fecha"
                    role="alert"
                    aria-live="polite"
                    className="text-xs font-semibold text-destructive mt-1 flex items-center gap-1"
                    data-testid="error-pago-fecha"
                  >
                    <span>⚠️</span>
                    <span>Debe seleccionar la fecha de cobro</span>
                  </p>
                )}
              </div>

              <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
                Notas / Referencia interna (opcional)
                <input
                  type="text"
                  value={pagoNotas}
                  onChange={(e) => setPagoNotas(e.target.value)}
                  placeholder="Ej.: Banco Galicia, comprobante #84912"
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-normal text-foreground"
                  data-testid="input-pago-notas"
                />
              </label>

              <p className="text-[11px] text-muted-foreground italic">
                ℹ️ Al confirmar, el entrenador valida manualmente el pago. Se renovará la
                cuota conservando el día {cobroSeleccionado.diaVencimiento} de corte.
              </p>

              <SheetFooter className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => handleSheetPagoOpenChange(false)}
                  data-testid="cancelar-pago-btn"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    pagoMonto === "" ||
                    Number(pagoMonto) <= 0 ||
                    !pagoMedio ||
                    !pagoFecha ||
                    accionEnCurso === cobroSeleccionado.contratacionId
                  }
                  data-testid="confirmar-pago-submit-btn"
                >
                  Confirmar Pago
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>

      {/* DIÁLOGO: COMPROBANTE / RECIBO INTERNO (NO FISCAL) */}
      <dialog
        ref={reciboDialogRef}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60 shadow-xl"
        aria-labelledby="recibo-titulo"
        data-testid="comprobante-dialog"
      >
        {comprobanteActivo && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  GOZSter Studio
                </span>
                <h2 id="recibo-titulo" className="text-lg font-black tracking-tight">
                  Recibo Interno de Pago
                </h2>
              </div>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                Confirmado
              </span>
            </div>

            <div className="rounded-xl bg-secondary/30 border border-border/60 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">N° Recibo:</span>
                <span className="font-mono font-bold">{comprobanteActivo.reciboNumero}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alumno:</span>
                <span className="font-bold">{comprobanteActivo.alumnoNombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Servicio / Membresía:</span>
                <span className="font-semibold">{comprobanteActivo.servicio}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Medio de Pago:</span>
                <span className="font-bold">{comprobanteActivo.medioPago}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha y Hora:</span>
                <span className="tabular-nums">
                  {new Date(comprobanteActivo.fechaPago).toLocaleString("es-AR")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmado por:</span>
                <span className="font-semibold">{comprobanteActivo.confirmadoPor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Próximo Vencimiento:</span>
                <span className="font-bold tabular-nums">
                  {formatearFecha(comprobanteActivo.proximoVencimiento)}
                </span>
              </div>
              {comprobanteActivo.montoLista && comprobanteActivo.montoLista > comprobanteActivo.monto && (
                <div className="flex justify-between border-t border-border/40 pt-2 text-[11px]">
                  <span className="text-muted-foreground">Precio de lista:</span>
                  <span className="line-through tabular-nums">{formatearDinero(comprobanteActivo.montoLista)}</span>
                </div>
              )}
              {comprobanteActivo.descuento && comprobanteActivo.descuento > 0 && (
                <div className="flex justify-between text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                  <span>Descuento aplicado:</span>
                  <span className="tabular-nums">-{formatearDinero(comprobanteActivo.descuento)}</span>
                </div>
              )}
              {comprobanteActivo.notas && (
                <div className="flex justify-between border-t border-border/40 pt-2 text-[11px]">
                  <span className="text-muted-foreground">Notas:</span>
                  <span className="italic">{comprobanteActivo.notas}</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between">
              <span className="text-xs font-bold">Total Abonado:</span>
              <span className="text-xl font-black text-primary tabular-nums">
                {formatearDinero(comprobanteActivo.monto)}
              </span>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              * Documento interno de control administrativo. No tiene validez fiscal.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
              >
                Imprimir recibo
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setComprobanteActivo(null);
                  reciboDialogRef.current?.close();
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </dialog>

      {/* DIÁLOGO: GESTIÓN DE PLANES */}
      <dialog
        ref={planesDialogRef}
        className="m-auto w-[min(94vw,52rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60 shadow-2xl"
        aria-labelledby="gestion-planes-titulo"
        data-testid="gestion-planes-dialog"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <h2 id="gestion-planes-titulo" className="text-xl font-black">
                Planes de Membresía &amp; Precios
              </h2>
              <p className="text-xs text-muted-foreground">
                Configuración de aranceles por actividad (Funcional, Boxeo, Rutinas) y períodos (Mensual, Trimestral, Semestral, Anual).
              </p>
            </div>
            <Button
              type="button"
              onClick={abrirModalCrearPlan}
              data-testid="btn-crear-plan"
              className="min-h-[44px] gap-1.5 font-bold bg-primary text-primary-foreground shadow-xs"
            >
              <span>➕</span> Crear Nuevo Plan
            </Button>
          </div>

          {/* Aviso regla vigencia futura */}
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1"
            data-testid="aviso-vigencia-futura-banner"
          >
            <p className="font-bold flex items-center gap-1.5">
              <span>⚠️</span> Regla de vigencia futura
            </p>
            <p>
              {AVISO_VIGENCIA_FUTURA}
            </p>
          </div>

          {/* Tabla de planes */}
          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border/70">
            <table className="w-full text-left text-xs" data-testid="planes-table">
              <thead className="sticky top-0 bg-secondary/80 backdrop-blur-xs text-muted-foreground font-semibold border-b border-border/60">
                <tr>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Actividad</th>
                  <th className="p-3">Duración</th>
                  <th className="p-3">Límite</th>
                  <th className="p-3">Precio Vigente</th>
                  <th className="p-3">Vigencia</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {planes.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors" data-testid={`plan-row-${p.id}`}>
                    <td className="p-3 font-bold text-foreground">
                      <div>{p.nombre}</div>
                      {p.notas && (
                        <div className="text-[11px] text-muted-foreground font-normal italic mt-0.5">
                          📝 {p.notas}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                        {formatearActividadPlan(p.actividad_tipo)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-bold">
                        {formatearDuracionPlan(p.duracion_meses)}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {p.limite_semanal ? `${p.limite_semanal}x/sem` : "Pase Libre"}
                    </td>
                    <td className="p-3 font-black text-foreground tabular-nums">
                      {formatearDinero(p.precio)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {p.vigente_desde ? `Desde ${formatearFecha(p.vigente_desde)}` : "Actual"}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => abrirModalEditarPlan(p)}
                        data-testid={`btn-editar-plan-${p.id}`}
                        className="min-h-[36px] px-2.5 text-xs font-semibold hover:border-primary"
                      >
                        Modificar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => planesDialogRef.current?.close()}
              className="min-h-[44px]"
            >
              Cerrar
            </Button>
          </div>
        </div>
      </dialog>

      {/* DIÁLOGO: CREAR O MODIFICAR PLAN */}
      <dialog
        ref={planFormDialogRef}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60 shadow-2xl"
        aria-labelledby="plan-form-titulo"
        data-testid="plan-form-dialog"
      >
        <form onSubmit={handleGuardarPlan} className="space-y-4">
          <h2 id="plan-form-titulo" className="text-lg font-black">
            {planEnEdicion ? `Modificar Plan: ${planEnEdicion.nombre}` : "Crear Nuevo Plan de Membresía"}
          </h2>

          {/* Cartel de aviso de vigencia futura */}
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1"
            data-testid="aviso-vigencia-futura"
          >
            <p className="font-bold flex items-center gap-1.5">
              <span>⚠️</span> Regla de vigencia futura
            </p>
            <p>
              El nuevo precio solo se aplicará a cuotas generadas a partir de la fecha de vigencia. <strong>No altera pagos ya cobrados ni cuotas vencidas.</strong>
            </p>
          </div>

          {/* Nombre */}
          <label className="block space-y-1.5 text-sm font-semibold">
            Nombre del Plan
            <input
              type="text"
              required
              value={planNombre}
              onChange={(e) => setPlanNombre(e.target.value)}
              placeholder="Ej: Funcional Trimestral, Boxeo 3x, Rutinas Anual"
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="input-plan-nombre"
            />
          </label>

          {/* Actividad / Disciplina */}
          <label className="block space-y-1.5 text-sm font-semibold">
            Actividad / Disciplina
            <select
              value={planActividad}
              onChange={(e) => {
                const act = e.target.value as ActividadPlanOpcion;
                setPlanActividad(act);
                if (act === "RUTINAS") {
                  setPlanLimiteSemanal(null);
                }
              }}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="select-plan-actividad"
            >
              <option value="FUNCIONAL">Funcional</option>
              <option value="BOXEO">Boxeo</option>
              <option value="RUTINAS">Rutinas Online (Asesoría)</option>
              <option value="FUNCIONAL_BOXEO">Funcional + Boxeo (Pase Libre 2 actividades)</option>
            </select>
          </label>

          {/* Duración (Mensual, Trimestral, Semestral, Anual) */}
          <label className="block space-y-1.5 text-sm font-semibold">
            Duración del Plan
            <select
              value={planDuracion}
              onChange={(e) => setPlanDuracion(Number(e.target.value) as 1 | 3 | 6 | 12)}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="select-plan-duracion"
            >
              <option value={1}>Mensual (1 mes)</option>
              <option value={3}>Trimestral (3 meses)</option>
              <option value={6}>Semestral (6 meses)</option>
              <option value={12}>Anual (12 meses)</option>
            </select>
          </label>

          {/* Límite semanal de clases */}
          {planActividad === "RUTINAS" ? (
            <div className="space-y-1.5 text-sm font-semibold text-muted-foreground" data-testid="limite-semanal-no-aplica">
              <span>Límite Semanal de Clases</span>
              <div className="w-full rounded-xl border border-dashed border-border bg-muted/40 p-2.5 text-sm font-medium text-muted-foreground flex items-center justify-between">
                <span>No aplica (Rutinas Online / Asesoría)</span>
                <span className="text-[11px] bg-secondary px-2 py-0.5 rounded text-foreground font-bold">100% Online</span>
              </div>
            </div>
          ) : (
            <label className="block space-y-1.5 text-sm font-semibold">
              Límite Semanal de Clases
              <select
                value={planLimiteSemanal === null ? "LIBRE" : String(planLimiteSemanal)}
                onChange={(e) => setPlanLimiteSemanal(e.target.value === "LIBRE" ? null : Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
                data-testid="select-plan-limite"
              >
                <option value="LIBRE">Pase Libre (sin límite semanal)</option>
                <option value="1">1 vez por semana</option>
                <option value="2">2 veces por semana</option>
                <option value="3">3 veces por semana</option>
                <option value="4">4 veces por semana</option>
                <option value="5">5 veces por semana</option>
              </select>
            </label>
          )}

          {/* Precio */}
          <label className="block space-y-1.5 text-sm font-semibold">
            Precio de Lista ($ ARS)
            <input
              type="number"
              required
              min="0"
              step="any"
              value={planPrecio}
              onChange={(e) => setPlanPrecio(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-bold tabular-nums focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="input-plan-precio"
            />
            <span className="block text-[11px] text-muted-foreground">
              Permite $0 para planes corporativos CORPO, becas o convenios.
            </span>
          </label>

          {/* Notas / Observaciones opcionales */}
          <label className="block space-y-1.5 text-sm font-semibold">
            Notas / Observaciones (opcional)
            <textarea
              rows={2}
              value={planNotas}
              onChange={(e) => setPlanNotas(e.target.value)}
              placeholder="Ej: Convenio empresa Tech Corp, beca deportiva, acuerdo $0"
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary resize-none"
              data-testid="input-plan-notas"
            />
          </label>

          {/* Fecha de vigencia futura */}
          <label className="block space-y-1.5 text-sm font-semibold">
            Fecha de Vigencia Futura
            <input
              type="date"
              required
              min={fechaMinimaManana}
              value={planFechaVigencia}
              onChange={(e) => {
                setPlanFechaVigencia(e.target.value);
                setErrorFechaVigencia(null);
              }}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-bold tabular-nums focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="input-plan-fecha-vigencia"
            />
            <span className="block text-[11px] text-muted-foreground">
              Solo se aceptan fechas posteriores a hoy (mínimo: {formatearFecha(fechaMinimaManana)}).
            </span>
          </label>

          {errorFechaVigencia && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300"
              data-testid="error-plan-fecha-vigencia"
            >
              {errorFechaVigencia}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => planFormDialogRef.current?.close()}
              data-testid="btn-cancelar-plan"
              className="min-h-[44px]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              data-testid="btn-guardar-plan"
              className="min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Guardar Plan
            </Button>
          </div>
        </form>
      </dialog>

      {/* DIÁLOGO: KPI ANUAL DE INGRESOS (Enero a Diciembre y desagregado por actividad) */}
      <dialog
        ref={kpiAnualDialogRef}
        open={kpiAnualAbierto}
        className="m-auto w-[min(96vw,56rem)] max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60 shadow-2xl"
        aria-labelledby="kpi-anual-titulo"
        data-testid="kpi-anual-dialog"
      >
        {kpiAnualAbierto && (
          <div className="space-y-6" data-testid="kpi-anual-contenedor">
            {/* Header del modal */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black text-sm">
                    $
                  </span>
                  <h2
                    id="kpi-anual-titulo"
                    className="text-xl font-black tracking-tight"
                    data-testid="kpi-anual-titulo"
                  >
                    KPI Ingresos Anuales ({kpiAnualResultado.anio})
                  </h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ingresos cobrados de enero a diciembre y desagregado por actividad (funcional, boxeo, rutinas)
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Total Facturado
                  </span>
                  <span
                    className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums"
                    data-testid="kpi-anual-total"
                  >
                    {formatearDinero(kpiAnualResultado.totalAnual)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setKpiAnualAbierto(false)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                  data-testid="btn-cerrar-kpi-anual"
                  aria-label="Cerrar KPI anual"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Selector de Filtro por Actividad */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/30 rounded-2xl p-3 border border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  Filtrar por actividad:
                </span>
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Filtro de actividades anual"
                >
                  <button
                    type="button"
                    onClick={() => handleCambiarFiltroActividad("TODAS")}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      filtroActividad === "TODAS"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="filtro-actividad-todas"
                  >
                    Todas ({formatearDinero(kpiAnualResultado.totalAnual)})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCambiarFiltroActividad("FUNCIONAL")}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      filtroActividad === "FUNCIONAL"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="filtro-actividad-funcional"
                  >
                    Funcional ({formatearDinero(kpiAnualResultado.desagregadoAnual.funcional)})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCambiarFiltroActividad("BOXEO")}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      filtroActividad === "BOXEO"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="filtro-actividad-boxeo"
                  >
                    <span data-testid="filtro-actividad-box" className="sr-only">Box</span>
                    Boxeo ({formatearDinero(kpiAnualResultado.desagregadoAnual.boxeo)})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCambiarFiltroActividad("RUTINAS")}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      filtroActividad === "RUTINAS"
                        ? "bg-sky-600 text-white shadow-xs"
                        : "bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="filtro-actividad-rutinas"
                  >
                    <span data-testid="filtro-actividad-rutina" className="sr-only">Rutinas</span>
                    Rutinas ({formatearDinero(kpiAnualResultado.desagregadoAnual.rutinas)})
                  </button>
                </div>
              </div>

              {/* Select nativo accesible sincronizado */}
              <select
                value={filtroActividad}
                onChange={(e) => handleCambiarFiltroActividad(e.target.value as any)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                data-testid="select-filtro-actividad"
                aria-label="Seleccionar actividad"
              >
                <option value="TODAS">Todas las actividades</option>
                <option value="FUNCIONAL">Funcional</option>
                <option value="BOXEO">Boxeo</option>
                <option value="RUTINAS">Rutinas online</option>
              </select>
            </div>

            {/* Grilla de Enero a Diciembre (12 meses) */}
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
              data-testid="kpi-anual-meses"
            >
              {kpiAnualResultado.meses.map((mes) => {
                const maxIngreso = Math.max(...kpiAnualResultado.meses.map((m) => m.ingresos), 1);
                const porcentaje = Math.round((mes.ingresos / maxIngreso) * 100);

                return (
                  <div
                    key={mes.mesNumero}
                    className="rounded-2xl border border-border/70 bg-card/60 p-3 flex flex-col justify-between transition-all hover:border-primary/40 hover:bg-card shadow-2xs"
                    data-testid={`kpi-mes-${mes.mesNumero}`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span className="font-bold text-foreground" data-testid={`kpi-mes-${mes.mesNombre.toLowerCase()}`}>
                          {mes.mesNombre}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase" data-testid={`kpi-mes-${mes.mesClave}`}>
                          {mes.mesCorto}
                        </span>
                      </div>
                      <p
                        className="mt-2 text-base font-black tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums"
                        data-testid={`kpi-ingreso-${mes.mesClave}`}
                      >
                        {formatearDinero(mes.ingresos)}
                      </p>
                    </div>

                    <div
                      className="mt-3 space-y-1.5 pt-2 border-t border-border/40 text-[10px] text-muted-foreground"
                      data-testid={`kpi-desagregado-${mes.mesClave}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Func:</span>
                        <span className="tabular-nums font-semibold">
                          {formatearDinero(mes.desagregado.funcional)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Box:</span>
                        <span className="tabular-nums font-semibold">
                          {formatearDinero(mes.desagregado.boxeo)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sky-600 dark:text-sky-400 font-medium">Rut:</span>
                        <span className="tabular-nums font-semibold">
                          {formatearDinero(mes.desagregado.rutinas)}
                        </span>
                      </div>

                      {/* Mini barra de progreso relativa */}
                      <div className="w-full bg-secondary rounded-full h-1 mt-1 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-1 rounded-full transition-all"
                          style={{ width: `${porcentaje}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desglose resumido por actividad al pie */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                    Total Funcional
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Clases presenciales
                  </span>
                </div>
                <span
                  className="text-lg font-black text-emerald-700 dark:text-emerald-300 tabular-nums"
                  data-testid="total-actividad-funcional"
                >
                  {formatearDinero(kpiAnualResultado.desagregadoAnual.funcional)}
                </span>
              </div>

              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300 block">
                    Total Boxeo
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Clases presenciales
                  </span>
                </div>
                <span
                  className="text-lg font-black text-amber-700 dark:text-amber-300 tabular-nums"
                  data-testid="total-actividad-boxeo"
                >
                  <span data-testid="total-actividad-box" className="sr-only">Box</span>
                  {formatearDinero(kpiAnualResultado.desagregadoAnual.boxeo)}
                </span>
              </div>

              <div className="rounded-2xl bg-sky-500/10 border border-sky-500/20 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-sky-800 dark:text-sky-300 block">
                    Total Rutinas
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Asesoría y entrenamiento online
                  </span>
                </div>
                <span
                  className="text-lg font-black text-sky-700 dark:text-sky-300 tabular-nums"
                  data-testid="total-actividad-rutinas"
                >
                  <span data-testid="total-actividad-rutina" className="sr-only">Rutina</span>
                  {formatearDinero(kpiAnualResultado.desagregadoAnual.rutinas)}
                </span>
              </div>
            </div>

            {/* Botón cerrar modal */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() => setKpiAnualAbierto(false)}
                className="rounded-xl px-6"
                data-testid="btn-cerrar-modal-kpi-anual"
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </dialog>

      {/* Drawer lateral de Historial de Cobros y Pagos del Alumno (GOZS-350) */}
      <HistorialCobrosDrawer
        isOpen={historialDrawerOpen}
        onClose={cerrarHistorial}
        alumnoId={historialAlumnoId}
        cobros={cobros}
        onAbrirComprobante={abrirComprobante}
        onRegistrarPago={(cobro) => {
          abrirModalPago(cobro);
        }}
      />

      {/* Modal Asignar / Cambiar Plan de Membresía */}
      {alumnoParaAsignar && (
        <ModalAsignarPlan
          abierto={Boolean(alumnoParaAsignar)}
          onCerrar={() => setAlumnoParaAsignar(null)}
          alumnoId={alumnoParaAsignar.alumnoId}
          alumnoNombre={alumnoParaAsignar.alumnoNombre}
          planesDisponibles={planes}
          tienePlanesActivos={true}
          onConfirmar={async ({ alumnoId, planId, esAdicional, notas }) => {
            await useCoachStudioStore.getState().vincularPlanMembresiaAlumno({
              alumnoId,
              planId,
              esAdicional,
              notas,
            });
            setAlumnoParaAsignar(null);
          }}
        />
      )}
    </section>
  );
}
