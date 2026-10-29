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

export function CobrosPanel() {
  const {
    cobros,
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
    recuperarMontoOriginal,
    obtenerComprobante,
    metricas,
  } = useCobrosStore();

  const isOnline = useOfflineQueueStore((s) => s.isOnline);
  const mode = useWorkspaceModeStore((s) => s.mode);
  const isTestMode = mode === "TESTEO";

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
    return cobros.filter((c) => {
      // Filtro de estado
      if (filtroEstado === "PENDIENTES" && c.estado !== "PENDIENTE") return false;
      if (filtroEstado === "VENCIDOS" && c.estado !== "VENCIDO") return false;
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
        montoLista: cobroSeleccionado.montoLista ?? cobroSeleccionado.monto,
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

        <div className="flex items-center gap-2">
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
        <div className="flex flex-wrap items-center gap-2">
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

          {/* Botón de Filtro / Vista de Descuentos */}
          <button
            type="button"
            onClick={() => setFiltroEstado(filtroEstado === "DESCUENTOS" ? "TODOS" : "DESCUENTOS")}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
              filtroEstado === "DESCUENTOS"
                ? "border-amber-500/80 bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/40"
                : "border-border/80 bg-secondary/40 text-muted-foreground hover:text-foreground"
            }`}
            data-testid="filtro-descuentos-btn"
            title="Consultar y recuperar montos menores a la suscripción"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500 text-black font-black text-[10px]">
              N
            </span>
            <span>Descuentos ({cobrosConDescuento.length})</span>
          </button>
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

      {/* VISTA PARA RECUPERAR DESCUENTOS / MONTOS MENORES A LA SUB */}
      {cobrosConDescuento.length > 0 && (
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
            </div>
          </div>

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
        </div>
      )}

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
                      <td className="px-4 py-3 tabular-nums text-sm text-foreground">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-foreground" data-testid="cobro-monto">
                            {formatearDinero(item.monto)}
                          </span>
                          {(item.ultimoPago?.notas || item.notaDescuento) && (
                            <span
                              className="inline-flex items-center justify-center rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black px-1.5 py-0.5 text-[11px] border border-amber-500/40 cursor-help"
                              title={`Nota: ${item.ultimoPago?.notas || item.notaDescuento}`}
                              data-testid="cobro-nota-n"
                              aria-label={`Nota: ${item.ultimoPago?.notas || item.notaDescuento}`}
                            >
                              N
                            </span>
                          )}
                        </div>

                        {item.montoLista && item.montoLista > item.monto && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                            <span className="line-through">{formatearDinero(item.montoLista)}</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                              (-{formatearDinero(item.montoLista - item.monto)})
                            </span>
                          </div>
                        )}

                        {(item.ultimoPago?.notas || item.notaDescuento) && (
                          <p
                            className="text-[11px] text-muted-foreground font-medium italic mt-0.5 max-w-[200px] truncate"
                            title={item.ultimoPago?.notas || item.notaDescuento}
                            data-testid="cobro-nota-texto"
                          >
                            Nota: {item.ultimoPago?.notas || item.notaDescuento}
                          </p>
                        )}
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

            {pagoMonto > 0 && pagoMonto < (cobroSeleccionado.montoLista ?? cobroSeleccionado.monto) && (
              <div
                className="rounded-xl bg-amber-500/15 border border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-200 space-y-1"
                data-testid="aviso-descuento-detectado"
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500 text-black font-black text-[10px]">
                    N
                  </span>
                  <span>
                    Descuento detectado: -{formatearDinero((cobroSeleccionado.montoLista ?? cobroSeleccionado.monto) - pagoMonto)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  El monto a abonar es menor al precio de lista ({formatearDinero(cobroSeleccionado.montoLista ?? cobroSeleccionado.monto)}). Se registrará con indicador &apos;N&apos; y la nota en el listado.
                </p>
              </div>
            )}

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
    </section>
  );
}
