"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  useCobrosStore,
  type CobroItem,
  type ComprobanteInterno,
  type FiltroCobros,
} from "@/store/use-cobros-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import {
  type ActividadPlanOpcion,
  type PlanMembresiaConVigencia,
  AVISO_VIGENCIA_FUTURA,
  formatearActividadPlan,
  formatearDuracionPlan,
  getMananaFechaString,
  validarVigenciaFutura,
} from "@/lib/planes";

export function CobrosPanel() {
  const {
    cobros,
    planes,
    filtroEstado,
    busqueda,
    cargando,
    accionEnCurso,
    error,
    aviso,
    comprobanteActivo,
    setFiltroEstado,
    setBusqueda,
    setComprobanteActivo,
    limpiarMensajes,
    cargarCobros,
    registrarPago,
    obtenerComprobante,
    metricas,
    crearPlan,
    modificarPlan,
  } = useCobrosStore();

  const isOnline = useOfflineQueueStore((s) => s.isOnline);
  const mode = useWorkspaceModeStore((s) => s.mode);
  const isTestMode = mode === "TESTEO";

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
  const [planFechaVigencia, setPlanFechaVigencia] = React.useState<string>("");
  const [errorFechaVigencia, setErrorFechaVigencia] = React.useState<string | null>(null);

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
    setPlanFechaVigencia(getMananaFechaString());
    setErrorFechaVigencia(null);
    planFormDialogRef.current?.showModal();
  };

  const abrirModalEditarPlan = (plan: PlanMembresiaConVigencia) => {
    setPlanEnEdicion(plan);
    setPlanNombre(plan.nombre);
    setPlanActividad(
      plan.actividad_tipo ?? (plan.cantidad_actividades === 2 ? "FUNCIONAL_BOXEO" : "FUNCIONAL")
    );
    setPlanDuracion((plan.duracion_meses as 1 | 3 | 6 | 12) || 1);
    setPlanLimiteSemanal(plan.limite_semanal);
    setPlanPrecio(plan.precio);
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
      if (planEnEdicion) {
        await modificarPlan({
          planId: planEnEdicion.id,
          nombre: planNombre.trim(),
          precio: Number(planPrecio),
          fechaVigencia: planFechaVigencia,
          duracionMeses: planDuracion,
          limiteSemanal: planLimiteSemanal,
        });
      } else {
        await crearPlan({
          nombre: planNombre.trim(),
          actividad: planActividad,
          duracionMeses: planDuracion,
          limiteSemanal: planLimiteSemanal,
          precio: Number(planPrecio),
          fechaVigencia: planFechaVigencia,
        });
      }
      planFormDialogRef.current?.close();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorFechaVigencia(err.message);
      }
    }
  };

  // Modal registrar pago
  const [cobroSeleccionado, setCobroSeleccionado] = React.useState<CobroItem | null>(null);
  const [pagoMonto, setPagoMonto] = React.useState<number>(25000);
  const [pagoMedio, setPagoMedio] = React.useState<"TRANSFERENCIA" | "EFECTIVO">("TRANSFERENCIA");
  const [pagoNotas, setPagoNotas] = React.useState("");
  const registrarDialogRef = React.useRef<HTMLDialogElement>(null);

  // Modal recibo
  const reciboDialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    void cargarCobros();
  }, [cargarCobros]);

  const kpis = metricas();

  const cobrosFiltrados = React.useMemo(() => {
    return cobros.filter((c) => {
      // Filtro de estado
      if (filtroEstado === "PENDIENTES" && c.estado !== "PENDIENTE") return false;
      if (filtroEstado === "VENCIDOS" && c.estado !== "VENCIDO") return false;
      if (filtroEstado === "PAGADOS" && c.estado !== "PAGADO") return false;

      // Filtro de búsqueda
      if (busqueda.trim()) {
        const query = busqueda.toLowerCase().trim();
        const coincideNombre = c.alumnoNombre.toLowerCase().includes(query);
        const coincideEmail = c.alumnoEmail.toLowerCase().includes(query);
        const coincideServicio = c.servicioNombre.toLowerCase().includes(query);
        if (!coincideNombre && !coincideEmail && !coincideServicio) return false;
      }

      return true;
    });
  }, [cobros, filtroEstado, busqueda]);

  const abrirModalPago = (item: CobroItem) => {
    setCobroSeleccionado(item);
    setPagoMonto(item.monto);
    setPagoMedio("TRANSFERENCIA");
    setPagoNotas("");
    registrarDialogRef.current?.showModal();
  };

  const handleConfirmarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cobroSeleccionado) return;

    try {
      const comprobante = await registrarPago({
        contratacionId: cobroSeleccionado.contratacionId,
        monto: pagoMonto,
        medioPago: pagoMedio,
        notas: pagoNotas.trim() || undefined,
      });
      registrarDialogRef.current?.close();
      setComprobanteActivo(comprobante);
      reciboDialogRef.current?.showModal();
    } catch {
      // Error manejado en store
    }
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

  return (
    <section className="space-y-6" aria-labelledby="cobros-titulo" data-testid="cobros-panel" suppressHydrationWarning>
      {/* Cabecera */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="cobros-titulo" className="text-2xl font-black tracking-tight">
            Panel de Cobros &amp; Pagos
          </h1>
          <p className="text-sm text-muted-foreground">
            Coach Studio · Control de cuotas, cobranza mensual y recibos internos (no fiscales).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isTestMode && (
            <span
              className="rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300"
              data-testid="demo-coach-badge"
            >
              Modo Testeo · Coach Lucía Ferraro
            </span>
          )}
          {!isOnline && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Sin conexión · cobros guardados
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={abrirModalGestionPlanes}
            data-testid="btn-gestionar-planes"
            className="min-h-[44px] gap-2 font-bold shadow-xs border-primary/30 hover:border-primary text-foreground"
          >
            <span>🏷️</span> Planes &amp; Precios
          </Button>
          <Button
            type="button"
            onClick={abrirModalCrearPlan}
            data-testid="btn-nuevo-plan"
            className="min-h-[44px] gap-2 font-bold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
          >
            <span>➕</span> Nuevo Plan
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

      {/* Franja de KPIs del mes */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-testid="cobros-kpis" suppressHydrationWarning>
        {/* Ingresos del mes */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Ingresos del Mes</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-black">
              $
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums" data-testid="kpi-ingresos-mes" suppressHydrationWarning>
            {formatearDinero(kpis.ingresosMes)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Recaudado en el ciclo actual
          </p>
        </div>

        {/* Cobranza Pendiente */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Cobranza Pendiente</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold">
              ⏳
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400 tabular-nums" data-testid="kpi-cobranza-pendiente" suppressHydrationWarning>
            {formatearDinero(kpis.cobranzaPendiente)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cuotas próximas a vencer
          </p>
        </div>

        {/* Morosos / Cuotas Vencidas */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Alumnos Morosos</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
              !
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400 tabular-nums" data-testid="kpi-alumnos-morosos" suppressHydrationWarning>
            {kpis.alumnosMorosos}{" "}
            <span className="text-xs font-semibold text-muted-foreground">
              ({formatearDinero(kpis.cobranzaVencida)})
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cuotas vencidas sin abonar
          </p>
        </div>

        {/* Tasa de Cobranza */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Tasa de Cobranza</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold">
              %
            </span>
          </div>
          <p className="mt-2 text-2xl font-black tracking-tight text-sky-600 dark:text-sky-400 tabular-nums" data-testid="kpi-tasa-cobranza" suppressHydrationWarning>
            {kpis.tasaCobranzaPct}%
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {kpis.alumnosAlDia} alumnos al día
          </p>
        </div>
      </div>

      {/* Controles de Filtros y Búsqueda */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Pestañas de estado */}
        <div
          className="flex items-center rounded-xl border border-border/80 bg-secondary/40 p-1"
          role="group"
          aria-label="Filtro de estados"
        >
          {(
            [
              { key: "TODOS", label: `Todos (${cobros.length})` },
              {
                key: "PENDIENTES",
                label: `Pendientes (${cobros.filter((c) => c.estado === "PENDIENTE").length})`,
              },
              {
                key: "VENCIDOS",
                label: `Vencidos (${cobros.filter((c) => c.estado === "VENCIDO").length})`,
              },
              {
                key: "PAGADOS",
                label: `Pagados (${cobros.filter((c) => c.estado === "PAGADO").length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFiltroEstado(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                filtroEstado === tab.key
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`filtro-${tab.key.toLowerCase()}-btn`}
              suppressHydrationWarning
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Input de búsqueda */}
        <div className="relative min-w-64 max-w-sm flex-1">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por alumno o servicio…"
            className="w-full rounded-xl border border-border/80 bg-background px-3.5 py-2 text-xs font-normal text-foreground placeholder:text-muted-foreground/70"
            data-testid="cobros-search-input"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabla de Cobros */}
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
        {cargando && cobros.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Cargando cobros…</p>
        ) : cobrosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">No se encontraron cobros</p>
            <p className="text-xs">
              {busqueda
                ? `No hay coincidencias para "${busqueda}".`
                : "No hay cuotas registradas bajo este filtro."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="cobros-table">
              <thead className="border-b border-border/60 bg-secondary/30 text-muted-foreground uppercase font-bold tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Alumno</th>
                  <th className="px-4 py-3.5">Servicio</th>
                  <th className="px-4 py-3.5">Vencimiento</th>
                  <th className="px-4 py-3.5">Monto</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-4 py-3.5">Último Pago</th>
                  <th className="px-4 py-3.5 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {cobrosFiltrados.map((item) => {
                  const esPagado = item.estado === "PAGADO";
                  const esVencido = item.estado === "VENCIDO";
                  const esPendiente = item.estado === "PENDIENTE";

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-secondary/20 transition-colors"
                      data-testid="cobro-row"
                    >
                      {/* Alumno */}
                      <td className="px-4 py-3">
                        <span className="font-bold text-foreground block text-sm">
                          {item.alumnoNombre}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {item.alumnoEmail}
                        </span>
                      </td>

                      {/* Servicio */}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground block">
                          {item.servicioNombre}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {item.actividad ? `Actividad: ${item.actividad}` : "Combinado"}
                        </span>
                      </td>

                      {/* Vencimiento */}
                      <td className="px-4 py-3">
                        <span className="tabular-nums font-semibold block">
                          {formatearFecha(item.fechaVencimiento)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Día {item.diaVencimiento} anclado
                        </span>
                      </td>

                      {/* Monto */}
                      <td className="px-4 py-3 tabular-nums font-black text-sm text-foreground">
                        {formatearDinero(item.monto)}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            esPagado
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                              : esVencido
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                          }`}
                          data-testid="estado-cobro-badge"
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              esPagado
                                ? "bg-emerald-500"
                                : esVencido
                                  ? "bg-rose-500"
                                  : "bg-amber-500"
                            }`}
                          />
                          {esPagado ? "Pagado" : esVencido ? "Vencido" : "Pendiente"}
                        </span>
                      </td>

                      {/* Último Pago */}
                      <td className="px-4 py-3">
                        {item.ultimoPago ? (
                          <div>
                            <span className="font-bold text-foreground">
                              {item.ultimoPago.medioPago === "TRANSFERENCIA"
                                ? "Transferencia"
                                : "Efectivo"}
                            </span>
                            <span className="text-[10px] text-muted-foreground block tabular-nums">
                              {formatearFecha(item.ultimoPago.fechaPago.slice(0, 10))}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic text-[11px]">
                            Sin pago registrado
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 text-right">
                        {esPagado ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => abrirComprobante(item.contratacionId)}
                            data-testid="ver-recibo-btn"
                          >
                            Ver recibo
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            disabled={accionEnCurso === item.contratacionId}
                            onClick={() => abrirModalPago(item)}
                            data-testid="registrar-pago-btn"
                          >
                            Registrar pago
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DIÁLOGO: REGISTRAR PAGO */}
      <dialog
        ref={registrarDialogRef}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        aria-labelledby="registrar-pago-titulo"
        data-testid="registrar-pago-dialog"
      >
        {cobroSeleccionado && (
          <form onSubmit={handleConfirmarPago} className="space-y-4">
            <h2 id="registrar-pago-titulo" className="text-lg font-black">
              Registrar Pago de Cuota
            </h2>

            <div className="rounded-xl bg-secondary/40 border border-border/60 p-3 text-xs space-y-1">
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

            <label className="block space-y-1.5 text-sm font-semibold">
              Monto a abonar ($ ARS)
              <input
                type="number"
                required
                min="0"
                step="100"
                value={pagoMonto}
                onChange={(e) => setPagoMonto(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-bold tabular-nums"
                data-testid="input-pago-monto"
              />
            </label>

            <div className="space-y-1.5 text-sm font-semibold">
              <span>Medio de Pago</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPagoMedio("TRANSFERENCIA")}
                  className={`rounded-xl border p-3 text-left transition-all ${
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
                  onClick={() => setPagoMedio("EFECTIVO")}
                  className={`rounded-xl border p-3 text-left transition-all ${
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

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => registrarDialogRef.current?.close()}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pagoMonto <= 0 || accionEnCurso === cobroSeleccionado.contratacionId}
                data-testid="confirmar-pago-submit-btn"
              >
                Confirmar Pago
              </Button>
            </div>
          </form>
        )}
      </dialog>

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
                      {p.nombre}
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
              onChange={(e) => setPlanActividad(e.target.value as ActividadPlanOpcion)}
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

          {/* Límite semanal */}
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

          {/* Precio */}
          <label className="block space-y-1.5 text-sm font-semibold">
            Precio de Lista ($ ARS)
            <input
              type="number"
              required
              min="1"
              step="500"
              value={planPrecio}
              onChange={(e) => setPlanPrecio(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-bold tabular-nums focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="input-plan-precio"
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
    </section>
  );
}
