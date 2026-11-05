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
  onMenuClick,
  dataTestId,
}: IslaCardShellProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

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
            className={`inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors ${
              isCanvasMode
                ? "bg-primary/20 text-primary font-black hover:bg-primary/30"
                : "hover:bg-muted hover:text-foreground"
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

        {/* Acciones del Cabezal: Botón Colapso [-] y Menú ••• */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? `Expandir isla ${title}` : `Colapsar isla ${title}`}
            data-testid={`collapse-btn-${id}`}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
            title={isCollapsed ? "Expandir isla" : "Colapsar isla"}
          >
            <span className="font-mono text-sm font-bold">
              {isCollapsed ? "[+]" : "[-]"}
            </span>
          </Button>

          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setMenuOpen((prev) => !prev);
                onMenuClick?.();
              }}
              aria-label={`Menú de opciones de isla ${title}`}
              data-testid={`menu-btn-${id}`}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Opciones de la isla"
            >
              <span className="text-xs tracking-tighter">•••</span>
            </Button>

            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-20 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md text-xs"
                role="menu"
              >
                <button
                  type="button"
                  onClick={() => {
                    onToggleCollapse();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-muted font-medium"
                >
                  {isCollapsed ? "Expandir isla" : "Colapsar isla"}
                </button>
              </div>
            )}
          </div>
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
