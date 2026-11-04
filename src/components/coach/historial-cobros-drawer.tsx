"use client";

import * as React from "react";
import type { CobroItem } from "@/store/use-cobros-store";
import { Button } from "@/components/ui/button";

export interface HistorialCobrosDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alumnoId: string | null;
  cobros: CobroItem[];
  onAbrirComprobante: (contratacionId: string) => void;
  onRegistrarPago?: (cobro: CobroItem) => void;
}

export function HistorialCobrosDrawer({
  isOpen,
  onClose,
  alumnoId,
  cobros,
  onAbrirComprobante,
  onRegistrarPago,
}: HistorialCobrosDrawerProps) {
  // Manejar tecla Escape para cerrar el drawer
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const studentCobros = React.useMemo(() => {
    if (!alumnoId) return [];
    return cobros
      .filter((c) => c.alumnoId === alumnoId)
      .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento));
  }, [cobros, alumnoId]);

  if (!isOpen || !alumnoId) return null;

  const currentAlumno = studentCobros[0];
  const alumnoNombre = currentAlumno?.alumnoNombre ?? "Alumno";
  const alumnoEmail = currentAlumno?.alumnoEmail ?? "";
  const alumnoTelefono = currentAlumno?.alumnoTelefono ?? null;

  const formatearDinero = (monto: number) =>
    `$${monto.toLocaleString("es-AR")}`;

  const formatearFecha = (fechaStr: string) => {
    if (!fechaStr) return "—";
    const parte = fechaStr.includes("T") ? fechaStr.split("T")[0]! : fechaStr;
    const [anio, mes, dia] = parte.split("-");
    if (!anio || !mes || !dia) return fechaStr;
    return `${dia}/${mes}/${anio}`;
  };

  const totalCobrado = studentCobros.reduce((acc, c) => {
    if (c.estado === "PAGADO" && c.ultimoPago) {
      return acc + c.ultimoPago.monto;
    }
    return acc;
  }, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="historial-cobros-drawer-title"
      data-testid="historial-cobros-drawer"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full max-w-lg flex-col bg-card text-card-foreground shadow-2xl transition-transform duration-300 animate-in slide-in-from-right border-l border-border/80">
        {/* Cabecera del Drawer */}
        <div className="flex items-start justify-between border-b border-border/80 p-5 bg-secondary/20">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs border border-primary/20">
                💳
              </span>
              <h2
                id="historial-cobros-drawer-title"
                className="text-base font-bold text-foreground truncate"
              >
                Historial de Cobros y Pagos
              </h2>
            </div>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {alumnoNombre}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>{alumnoEmail}</span>
              {alumnoTelefono && (
                <>
                  <span>•</span>
                  <span>{alumnoTelefono}</span>
                </>
              )}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar historial"
            data-testid="cerrar-historial-drawer"
            className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground text-sm rounded-xl font-bold"
          >
            ✕
          </Button>
        </div>

        {/* Resumen rápido de métricas del alumno */}
        <div className="grid grid-cols-2 gap-2 border-b border-border/60 bg-secondary/10 p-4 text-xs">
          <div className="rounded-xl border border-border/60 bg-card p-3 shadow-2xs">
            <span className="text-[11px] text-muted-foreground block font-medium">
              Cuotas registradas
            </span>
            <span className="text-base font-bold text-foreground tabular-nums">
              {studentCobros.length}
            </span>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-3 shadow-2xs">
            <span className="text-[11px] text-muted-foreground block font-medium">
              Total abonado histórico
            </span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatearDinero(totalCobrado)}
            </span>
          </div>
        </div>

        {/* Listado cronológico de cuotas y recibos */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3.5"
          data-testid="historial-cobros-lista"
        >
          {studentCobros.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No hay cobros ni pagos registrados para este alumno.
            </div>
          ) : (
            studentCobros.map((item) => {
              const esPagado = item.estado === "PAGADO";
              const esVencido = item.estado === "VENCIDO";
              const esPendiente = item.estado === "PENDIENTE";

              const montoEfectivo = item.ultimoPago?.monto ?? item.monto;
              const precioLista =
                item.montoLista ?? item.ultimoPago?.montoLista ?? item.monto;
              const montoDescuento =
                item.descuento ??
                item.ultimoPago?.descuento ??
                (precioLista > montoEfectivo ? precioLista - montoEfectivo : 0);
              const tieneDescuento =
                montoDescuento > 0 ||
                Boolean(item.notaDescuento) ||
                (precioLista > montoEfectivo);

              const notaDescuento =
                item.notaDescuento ||
                (tieneDescuento && item.ultimoPago?.notas?.toLowerCase().includes("descuento")
                  ? item.ultimoPago?.notas
                  : undefined);

              return (
                <div
                  key={item.id}
                  data-testid="historial-cobro-card"
                  className="rounded-2xl border border-border/80 bg-card p-4 text-xs space-y-3 shadow-2xs transition-all hover:border-primary/40"
                >
                  {/* Fila 1: Servicio, Actividad y Estado */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-bold text-foreground text-sm block">
                        {item.servicioNombre}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-block rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {item.actividad ? `Actividad: ${item.actividad}` : "Combinado / General"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          · Día {item.diaVencimiento}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold border shrink-0 ${
                        esPagado
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          : esVencido
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {esPagado ? "✓ Pagado" : esVencido ? "⚠ Vencido" : "⏳ Pendiente"}
                    </span>
                  </div>

                  {/* Fila 2: Fechas y Cronología */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground border-t border-border/40 pt-2.5">
                    <div>
                      <span className="block font-medium">Vencimiento:</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatearFecha(item.fechaVencimiento)}
                      </span>
                    </div>

                    {item.ultimoPago ? (
                      <div>
                        <span className="block font-medium">Fecha de pago:</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatearFecha(item.ultimoPago.fechaPago)} ({item.ultimoPago.medioPago})
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="block font-medium">Fecha de pago:</span>
                        <span className="italic">Sin pago registrado</span>
                      </div>
                    )}
                  </div>

                  {/* Fila 3: Montos y Descuento "N" */}
                  <div className="rounded-xl bg-secondary/30 p-2.5 flex items-center justify-between gap-2 border border-border/50">
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-medium">
                        Monto cobrado
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {formatearDinero(montoEfectivo)}
                        </span>
                        {tieneDescuento && precioLista > montoEfectivo && (
                          <span className="text-[11px] text-muted-foreground line-through tabular-nums">
                            {formatearDinero(precioLista)}
                          </span>
                        )}
                      </div>
                    </div>

                    {tieneDescuento && (
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1">
                          <span
                            data-testid="descuento-n-badge"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-black text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                            title={notaDescuento || "Descuento aplicado"}
                            aria-label={`Descuento aplicado: ${formatearDinero(montoDescuento)}`}
                          >
                            N
                          </span>
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            -{formatearDinero(montoDescuento)}
                          </span>
                        </div>
                        {notaDescuento && (
                          <span
                            className="text-[10px] text-muted-foreground italic truncate max-w-[170px]"
                            title={notaDescuento}
                          >
                            {notaDescuento}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Fila 4: Comprobante y Acciones */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {esPagado ? (
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11px] text-muted-foreground">
                          Recibo:{" "}
                          <strong className="text-foreground">
                            REC-{item.ultimoPago?.id.slice(-6).toUpperCase() || "OK"}
                          </strong>
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onAbrirComprobante(item.contratacionId)}
                          data-testid="ver-recibo-historial-btn"
                          className="min-h-11 px-3 text-xs font-bold rounded-xl border-primary/40 hover:bg-primary/10 text-primary gap-1"
                        >
                          <span>🧾 Ver recibo</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11px] text-muted-foreground italic">
                          Sin recibo emitido (pendiente)
                        </span>
                        {onRegistrarPago && (
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={() => onRegistrarPago(item)}
                            data-testid="btn-cobrar-historial"
                            className="min-h-11 px-3 text-xs font-bold rounded-xl"
                          >
                            Cobrar cuota
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
