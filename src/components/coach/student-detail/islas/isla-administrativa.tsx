import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ClipboardList, MessageSquare, Settings } from "@/components/coach/icons";

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
  suscripcionNode: React.ReactNode;
  historialPagosNode: React.ReactNode;
  contratacionNode: React.ReactNode;
  chatResponsableNode: React.ReactNode;
  nivelVistaNode: React.ReactNode;
  cuestionarioNode: React.ReactNode;
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

  return (
    <IslaCardShell
      id="administracion"
      dataTestId="isla-administrativa"
      title="Gestión Comercial, Membresía & Configuración"
      icon={<CreditCard className="h-4 w-4 text-primary" aria-label="Administración" />}
      badge={
        <Badge variant="outline" className="text-[10px] font-mono border-border/80 text-muted-foreground">
          Administración
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
          <span className="inline-flex items-center gap-1">
            <CreditCard className="h-3 w-3 inline" aria-hidden="true" /> Cuota y Pagos
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <ClipboardList className="h-3 w-3 inline" aria-hidden="true" /> Contratos y Membresía
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3 inline" aria-hidden="true" /> Atención
          </span>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-4">
        {/* Navegación interna por tabs estilo Zen (sobria, sin saturación) */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2.5">
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
      </div>
    </IslaCardShell>
  );
}
