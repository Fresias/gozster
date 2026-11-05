import * as React from "react";
import { Button } from "@/components/ui/button";

export interface IslaCardShellProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  compactSummary?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onMenuClick?: () => void;
  dataTestId?: string;
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

export function IslaCardShell({
  id,
  title,
  icon,
  badge,
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  compactSummary,
  children,
  className = "",
  dataTestId,
  onMoveUp,
  onMoveDown,
  onMoveLeft,
  onMoveRight,
  onSeparateRow,
  onResizeWidth,
  currentWidth,
  isSharedRow = false,
  onHide,
  canMoveUp = true,
  canMoveDown = true,
  canMoveLeft = false,
  canMoveRight = false,
}: IslaCardShellProps) {

  return (
    <div
      data-testid={dataTestId || `isla-${id}`}
      id={`isla-${id}`}
      draggable={isCanvasMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200 ${
        isDragTarget
          ? "border-primary ring-2 ring-primary/40 bg-primary/5 scale-[1.01]"
          : "border-border/80 hover:border-border"
      } ${isCanvasMode ? "cursor-grab active:cursor-grabbing border-dashed border-primary/50" : ""} ${className}`}
    >
      {/* Drop Zone Visual Indicator */}
      {isDragTarget && (
        <div
          data-testid={`isla-drop-zone-${id}`}
          className="absolute inset-x-0 -top-2 h-1 rounded bg-primary animate-pulse"
        />
      )}

      {/* Cabezal de la Isla */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag Handle ⠿ */}
          <button
            type="button"
            aria-label={`Arrastrar isla ${title}`}
            data-testid={`drag-handle-${id}`}
            title="Arrastrar isla para reordenar en la grilla"
            className={`inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-all ${
              isCanvasMode
                ? "bg-primary/20 text-primary font-black hover:bg-primary/30"
                : "opacity-30 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="text-base leading-none select-none">⠿</span>
          </button>

          {/* Icono + Título */}
          <div className="flex items-center gap-2 truncate">
            {icon && <span className="text-sm shrink-0">{icon}</span>}
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground truncate">
              {title}
            </h3>
          </div>

          {/* Badge opcional */}
          {badge && <div className="shrink-0">{badge}</div>}
        </div>

        {/* Acciones del Cabezal: Controles de Posición, Resize y Colapso (Sin '...') */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Controles de Layout contextuales (Canvas Mode o Hover) */}
          <div
            className={`items-center gap-1 ${
              isCanvasMode
                ? "flex"
                : "hidden sm:inline-flex opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            }`}
          >
            {/* Controles de Posicionamiento Relativo */}
            {onMoveLeft && canMoveLeft && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onMoveLeft}
                aria-label={`Mover a la izquierda ${title}`}
                data-testid={`move-left-${id}`}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                title="Mover a la izquierda / compartir fila"
              >
                <span className="text-xs select-none">⬅️</span>
              </Button>
            )}

            {onMoveRight && canMoveRight && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onMoveRight}
                aria-label={`Mover a la derecha ${title}`}
                data-testid={`move-right-${id}`}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                title="Mover a la derecha / compartir fila"
              >
                <span className="text-xs select-none">➡️</span>
              </Button>
            )}

            {onMoveUp && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                aria-label={`Mover arriba ${title}`}
                data-testid={`move-up-${id}`}
                className={`h-7 w-7 p-0 ${
                  canMoveUp
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                    : "text-muted-foreground/30 cursor-not-allowed"
                }`}
                title="Mover arriba"
              >
                <span className="text-xs select-none">⬆️</span>
              </Button>
            )}

            {onMoveDown && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                aria-label={`Mover abajo ${title}`}
                data-testid={`move-down-${id}`}
                className={`h-7 w-7 p-0 ${
                  canMoveDown
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                    : "text-muted-foreground/30 cursor-not-allowed"
                }`}
                title="Mover abajo"
              >
                <span className="text-xs select-none">⬇️</span>
              </Button>
            )}

            {/* Controles de Resize Horizontal cuando comparte fila */}
            {isSharedRow && onResizeWidth && (
              <div className="flex items-center gap-0.5 rounded-md border border-border/80 bg-background/80 px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => onResizeWidth(-5)}
                  disabled={(currentWidth ?? 50) <= 25}
                  data-testid={`resize-dec-${id}`}
                  className="h-5 w-4 text-[11px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                  title="Reducir ancho en la fila (-5%)"
                >
                  -
                </button>
                <span className="font-mono text-[9px] font-bold text-foreground tabular-nums px-0.5 select-none">
                  {currentWidth ?? 50}%
                </span>
                <button
                  type="button"
                  onClick={() => onResizeWidth(+5)}
                  disabled={(currentWidth ?? 50) >= 75}
                  data-testid={`resize-inc-${id}`}
                  className="h-5 w-4 text-[11px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                  title="Aumentar ancho en la fila (+5%)"
                >
                  +
                </button>
                {onSeparateRow && (
                  <button
                    type="button"
                    onClick={onSeparateRow}
                    data-testid={`separate-row-${id}`}
                    className="ml-1 text-[10px] text-muted-foreground hover:text-primary font-bold cursor-pointer"
                    title="Expandir a fila propia completa (100%)"
                  >
                    ⤢
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Botón de Colapso Explícito [-] / [+] */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? `Expandir isla ${title}` : `Colapsar isla ${title}`}
            data-testid={`collapse-btn-${id}`}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted font-mono"
            title={isCollapsed ? "Expandir isla [+]" : "Colapsar isla [-]"}
          >
            <span className="font-mono text-xs font-black select-none">
              {isCollapsed ? "[+]" : "[-]"}
            </span>
          </Button>
        </div>
      </div>

      {/* Resumen Compacto cuando está colapsada (sin desmontar estado) */}
      <div
        className={`px-3 py-2 text-xs text-muted-foreground bg-muted/10 transition-all ${
          isCollapsed ? "block" : "hidden"
        }`}
        data-testid={`isla-collapsed-summary-${id}`}
      >
        {compactSummary || (
          <span className="italic">Isla colapsada — hacé clic en [+] para ver detalles.</span>
        )}
      </div>

      {/* Cuerpo principal de la Isla */}
      <div
        className={`transition-all duration-200 ${
          isCollapsed ? "hidden" : "block"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
