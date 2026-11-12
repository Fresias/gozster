import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "@/components/coach/icons";

export interface IslaCardShellProps {
  id: string;
  title: string;
  meta?: React.ReactNode;
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
  meta,
  icon: _icon,
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
  onHide: _onHide,
  canMoveUp = true,
  canMoveDown = true,
  canMoveLeft = false,
  canMoveRight = false,
}: IslaCardShellProps) {
  const handleHandleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" && canMoveUp && onMoveUp) {
      e.preventDefault();
      onMoveUp();
    } else if (e.key === "ArrowDown" && canMoveDown && onMoveDown) {
      e.preventDefault();
      onMoveDown();
    } else if (e.key === "ArrowLeft" && canMoveLeft && onMoveLeft) {
      e.preventDefault();
      onMoveLeft();
    } else if (e.key === "ArrowRight" && canMoveRight && onMoveRight) {
      e.preventDefault();
      onMoveRight();
    }
  };

  return (
    <div
      data-testid={dataTestId || `isla-${id}`}
      id={`isla-${id}`}
      draggable={isCanvasMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group relative rounded-xl border bg-card text-card-foreground shadow-none transition-colors ${
        isDragTarget
          ? "border-primary ring-2 ring-primary/40 bg-primary/5"
          : isCanvasMode
          ? "border-dashed border-subtle-foreground/60 cursor-grab active:cursor-grabbing"
          : "border-border"
      } ${className}`}
    >
      {/* Drop Zone Visual Indicator */}
      {isDragTarget && (
        <div
          data-testid={`isla-drop-zone-${id}`}
          className="absolute inset-x-0 -top-2 h-1 rounded bg-primary animate-pulse"
        />
      )}

      {/* Cabezal de la Isla */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isCanvasMode && (
            <button
              type="button"
              aria-label={`Arrastrar isla ${title}`}
              data-testid={`drag-handle-${id}`}
              title="Arrastrar isla o usar flechas del teclado para reordenar"
              onKeyDown={handleHandleKeyDown}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shrink-0"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="12" r="1" />
                <circle cx="9" cy="5" r="1" />
                <circle cx="9" cy="19" r="1" />
                <circle cx="15" cy="12" r="1" />
                <circle cx="15" cy="5" r="1" />
                <circle cx="15" cy="19" r="1" />
              </svg>
            </button>
          )}

          {/* Título en sentence case + meta 13 px (sin ícono delante del título) */}
          <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
            <h3 className="text-[15px] leading-[20px] font-semibold text-foreground truncate">
              {title}
            </h3>
            {meta && (
              <span className="text-[13px] text-muted-foreground shrink-0">
                {meta}
              </span>
            )}
            {badge && <div className="shrink-0 self-center">{badge}</div>}
          </div>
        </div>

        {/* Acciones del Cabezal: Badge + Resize en Personalizar + Chevron a la derecha */}
        <div className="flex items-center gap-1.5 shrink-0">

          {isCanvasMode && isSharedRow && onResizeWidth && (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-background px-1 py-0.5">
              <button
                type="button"
                onClick={() => onResizeWidth(-5)}
                disabled={(currentWidth ?? 50) <= 25}
                data-testid={`resize-dec-${id}`}
                className="h-5 w-4 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                title="Reducir ancho en la fila (-5%)"
              >
                -
              </button>
              <span className="font-mono text-xs font-medium text-foreground tabular-nums px-0.5 select-none">
                {currentWidth ?? 50}%
              </span>
              <button
                type="button"
                onClick={() => onResizeWidth(+5)}
                disabled={(currentWidth ?? 50) >= 75}
                data-testid={`resize-inc-${id}`}
                className="h-5 w-4 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                title="Aumentar ancho en la fila (+5%)"
              >
                +
              </button>
              {onSeparateRow && (
                <button
                  type="button"
                  onClick={onSeparateRow}
                  data-testid={`separate-row-${id}`}
                  className="ml-1 text-xs text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                  title="Expandir a fila propia completa (100%)"
                >
                  ⤢
                </button>
              )}
            </div>
          )}

          {/* Botón de Colapso Explícito */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? `Expandir isla ${title}` : `Colapsar isla ${title}`}
            data-testid={`collapse-btn-${id}`}
            className="size-8 rounded-lg p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
            title={isCollapsed ? "Expandir isla" : "Colapsar isla"}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            )}
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
          <span className="italic">Isla colapsada — hacé clic para ver detalles.</span>
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
