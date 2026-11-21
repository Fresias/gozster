import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, ClipboardList, MessageSquare, Settings } from "@/components/coach/icons";
import type { KpisNegocio } from "@/lib/kpis-negocio";

export interface IslaAdministrativaProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  // Sub-bloques administrativos
  suscripcionNode?: React.ReactNode;
  historialPagosNode?: React.ReactNode;
  contratacionNode?: React.ReactNode;
  chatResponsableNode?: React.ReactNode;
  nivelVistaNode?: React.ReactNode;
  cuestionarioNode?: React.ReactNode;
  // Datos específicos de Membresía (alineados con KpisNegocio y visual del PDF pág. 5)
  planActivo?: string;
  monto?: number | string;
  fechaVencimiento?: string | Date;
  estadoCobro?: "AL_DIA" | "PAGADO" | "PENDIENTE" | "VENCIDO" | string;
  detalleCobro?: string;
  kpisNegocio?: KpisNegocio;
  onRegistrarPago?: () => void;
  onAsignarPlan?: () => void;
  onVerHistorialPagos?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onSeparateRow?: () => void;
  onResizeWidth?: (delta: number) => void;
  currentWidth?: number;
  isSharedRow?: boolean;
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

export function IslaAdministrativa({
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  suscripcionNode,
  historialPagosNode,
  contratacionNode,
  chatResponsableNode,
  nivelVistaNode,
  cuestionarioNode,
  planActivo,
  monto,
  fechaVencimiento,
  estadoCobro,
  detalleCobro,
  kpisNegocio,
  onRegistrarPago,
  onAsignarPlan,
  onVerHistorialPagos,
  onMoveUp,
  onMoveDown,
  onMoveLeft,
  onMoveRight,
  onSeparateRow,
  onResizeWidth,
  currentWidth,
  isSharedRow,
  onHide,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
}: IslaAdministrativaProps) {
  const [activeTab, setActiveTab] = React.useState<"pagos" | "contratacion" | "atencion" | "config">("pagos");

  const tienePlan = Boolean(planActivo && planActivo.trim().length > 0 && planActivo !== "Sin plan asignado");
  const displayPlanActivo = tienePlan ? planActivo! : "Sin plan asignado";

  const displayMonto = React.useMemo(() => {
    if (typeof monto === "number") {
      return `$${monto.toLocaleString("es-AR")}`;
    }
    if (monto && monto.trim().length > 0) {
      return monto;
    }
    return tienePlan ? "" : "—";
  }, [monto, tienePlan]);

  // Alineación con KpisNegocio: verificar si es mora, al día, pendiente o sin plan
  const estadoNormalizado = (estadoCobro || (tienePlan ? "PENDIENTE" : "SIN_PLAN")).toUpperCase();
  const esSinPlan = !tienePlan && estadoNormalizado === "SIN_PLAN";
  const esVencido = estadoNormalizado === "VENCIDO" || estadoNormalizado === "MOROSO";
  const esPendiente = estadoNormalizado === "PENDIENTE" || estadoNormalizado === "POR_VENCER";

  const displayDetalleCobro = React.useMemo(() => {
    if (detalleCobro) return detalleCobro;
    if (esSinPlan) {
      return "Sin cobros ni suscripción activa";
    }
    const vencStr = typeof fechaVencimiento === "string" && fechaVencimiento.trim().length > 0 ? fechaVencimiento : "";
    if (esVencido) {
      return vencStr ? `Cuota vencida · venció ${vencStr}` : "Cuota vencida";
    }
    if (esPendiente) {
      return vencStr ? `Pendiente de cobro · vence ${vencStr}` : "Pendiente de cobro";
    }
    return vencStr ? `Pagado · vence ${vencStr}` : "Cuota al día";
  }, [detalleCobro, fechaVencimiento, esSinPlan, esVencido, esPendiente]);

  const estadoBadge = React.useMemo(() => {
    if (esSinPlan) {
      return {
        texto: "Sin plan",
        className: "border-border text-muted-foreground bg-transparent",
      };
    }
    if (esVencido) {
      return {
        texto: "Vencido",
        className: "border-danger-soft-border text-danger-soft-foreground bg-danger-soft",
      };
    }
    if (esPendiente) {
      return {
        texto: "Pendiente",
        className: "border-warning-soft-border text-warning-soft-foreground bg-warning-soft",
      };
    }
    return {
      texto: "Al día",
      className: "border-success-soft-border text-success-soft-foreground bg-success-soft",
    };
  }, [esSinPlan, esVencido, esPendiente]);

  return (
    <IslaCardShell
      id="administracion"
      dataTestId="isla-administrativa"
      title="Membresía"
      icon={<CreditCard className="h-4 w-4 text-primary" aria-label="Membresía" />}
      badge={
        <Badge
          variant="outline"
          data-testid="badge-estado-cobro"
          className={estadoBadge.className}
        >
          {estadoBadge.texto}
        </Badge>
      }
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      isCanvasMode={isCanvasMode}
      isDragTarget={isDragTarget}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
      onSeparateRow={onSeparateRow}
      onResizeWidth={onResizeWidth}
      currentWidth={currentWidth}
      isSharedRow={isSharedRow}
      onHide={onHide}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      canMoveLeft={canMoveLeft}
      canMoveRight={canMoveRight}
      compactSummary={
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span className="truncate">{displayPlanActivo} • {estadoBadge.texto}</span>
          <span className="font-bold text-foreground shrink-0">{displayMonto}</span>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* Resumen de membresía (objetivo Ficha.html): plan y monto, detalle del último pago, acciones */}
        <div data-testid="isla-membresia-resumen" className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p
                className="m-0 text-sm font-medium text-foreground"
                data-testid="membresia-plan-activo"
              >
                {displayPlanActivo}
              </p>
              <p
                className="m-0 text-[13px] text-neutral-soft-foreground"
                data-testid="membresia-vencimiento-estado"
              >
                {displayDetalleCobro}
              </p>
            </div>
            {displayMonto && (
              <span
                className="font-mono text-sm text-foreground tabular-nums shrink-0"
                data-testid="membresia-monto"
              >
                {displayMonto}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 items-center gap-2.5">
            {esSinPlan && onAsignarPlan ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onAsignarPlan}
                data-testid="btn-asignar-plan-desde-membresia"
                className="h-9 text-sm font-medium"
              >
                Asignar plan
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRegistrarPago}
                data-testid="btn-registrar-pago"
                className="h-9 text-sm font-medium"
              >
                Registrar pago
              </Button>
            )}
            <button
              type="button"
              onClick={() => {
                if (onVerHistorialPagos) onVerHistorialPagos();
                setActiveTab("pagos");
              }}
              data-testid="btn-historial-pagos"
              className="text-[13px] text-foreground underline underline-offset-2 hover:text-muted-foreground cursor-pointer"
            >
              Historial
            </button>
          </div>
        </div>

        {/* Gestión ampliada (contratación, staff y nivel de vista) fuera de la vista principal */}
        <details className="group border-t border-border pt-3">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-[13px] text-neutral-soft-foreground hover:text-foreground">
            Más gestión de la membresía
          </summary>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-border pb-2.5">
          <button
            type="button"
            onClick={() => setActiveTab("pagos")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "pagos"
                ? "bg-secondary text-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 inline" aria-hidden="true" /> Cuota &amp; Historial
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contratacion")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "contratacion"
                ? "bg-secondary text-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 inline" aria-hidden="true" /> Contratación &amp; Renovación
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("atencion")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "atencion"
                ? "bg-secondary text-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 inline" aria-hidden="true" /> Staff &amp; Chat
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === "config"
                ? "bg-secondary text-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5 inline" aria-hidden="true" /> Nivel de Vista &amp; Anamnesis
            </span>
          </button>
        </div>

        {/* Tab 1: Pagos y Suscripción */}
        <div className={activeTab === "pagos" ? "space-y-4" : "hidden"}>
          {suscripcionNode}
          {historialPagosNode}
        </div>

        {/* Tab 2: Contratación */}
        <div className={activeTab === "contratacion" ? "space-y-4" : "hidden"}>
          {contratacionNode}
        </div>

        {/* Tab 3: Staff y Chat */}
        <div className={activeTab === "atencion" ? "space-y-4" : "hidden"}>
          {chatResponsableNode}
        </div>

        {/* Tab 4: Configuración y Cuestionario */}
        <div className={activeTab === "config" ? "space-y-4" : "hidden"}>
          {nivelVistaNode}
          {cuestionarioNode}
        </div>
        </details>
      </div>
    </IslaCardShell>
  );
}
