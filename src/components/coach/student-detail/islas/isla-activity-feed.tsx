import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Button } from "@/components/ui/button";
import {
  Activity,
  CreditCard,
  Dumbbell,
  TriangleAlert,
  ArrowRightLeft,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "@/components/coach/icons";

export interface ActivityFeedItem {
  id: string;
  tipo: "pago" | "sesion" | "molestia" | "sustitucion" | "chat" | "rutina";
  titulo: string;
  detalle: string;
  fechaGrupo: "HOY" | "AYER" | "ESTA SEMANA" | "ANTERIORES";
  horaOFecha: string;
}

export interface IslaActivityFeedProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isRailCollapsed: boolean;
  onToggleRail: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  items?: ActivityFeedItem[];
  chatPanelNode?: React.ReactNode;
  historialPagosNode?: React.ReactNode;
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

const DEFAULT_FEED_ITEMS: ActivityFeedItem[] = [
  {
    id: "act-1",
    tipo: "sesion",
    titulo: "Sesión registrada",
    detalle: "Día 2 · sentadilla 120 kg × 3 (4 series)",
    fechaGrupo: "HOY",
    horaOFecha: "Hoy 10:30",
  },
  {
    id: "act-2",
    tipo: "chat",
    titulo: "Mensaje",
    detalle: "Preguntó por el descanso en sentadilla",
    fechaGrupo: "HOY",
    horaOFecha: "Hoy 09:15",
  },
  {
    id: "act-3",
    tipo: "pago",
    titulo: "Pago acreditado",
    detalle: "Cuota de noviembre · transferencia",
    fechaGrupo: "AYER",
    horaOFecha: "Ayer",
  },
  {
    id: "act-4",
    tipo: "sustitucion",
    titulo: "Ejercicio cambiado",
    detalle: "Press militar → elevaciones laterales",
    fechaGrupo: "ESTA SEMANA",
    horaOFecha: "Lun",
  },
  {
    id: "act-5",
    tipo: "molestia",
    titulo: "Reportó dolor",
    detalle: "Hombro anterior · EVA 5",
    fechaGrupo: "ESTA SEMANA",
    horaOFecha: "Dom",
  },
];

export function IslaActivityFeed({
  isCollapsed,
  onToggleCollapse,
  isRailCollapsed,
  onToggleRail,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  items = [],
  chatPanelNode,
  historialPagosNode,
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
}: IslaActivityFeedProps) {
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({});

  const toggleGroup = (grupo: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [grupo]: !prev[grupo],
    }));
  };

  // Agrupación por fecha
  const groups = React.useMemo(() => {
    const ordenGrupos: ("HOY" | "AYER" | "ESTA SEMANA" | "ANTERIORES")[] = [
      "HOY",
      "AYER",
      "ESTA SEMANA",
      "ANTERIORES",
    ];
    return ordenGrupos
      .map((g) => ({
        nombre: g,
        items: items.filter((item) => item.fechaGrupo === g),
      }))
      .filter((g) => g.items.length > 0);
  }, [items]);

  const getTipoIcon = (tipo: ActivityFeedItem["tipo"]) => {
    switch (tipo) {
      case "pago":
        return (
          <span
            role="img"
            aria-label="Pago confirmado"
            className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      case "sesion":
        return (
          <span
            role="img"
            aria-label="Sesión completada"
            className="h-6 w-6 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center"
          >
            <Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      case "molestia":
        return (
          <span
            role="img"
            aria-label="Alerta de dolor"
            className="h-6 w-6 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center"
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      case "sustitucion":
      case "rutina":
        return (
          <span
            role="img"
            aria-label="Cambio de rutina"
            className="h-6 w-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      case "chat":
        return (
          <span
            role="img"
            aria-label="Mensaje enviado"
            className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
    }
  };

  // Si está replegado a riel lateral de 56px:
  if (isRailCollapsed) {
    return (
      <div
        data-testid="activity-feed-rail"
        className="w-14 shrink-0 flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-2 py-4 shadow-sm transition-all duration-200"
      >
        <button
          type="button"
          onClick={onToggleRail}
          data-testid="toggle-collapse-feed"
          aria-label="Expandir Feed de Actividad"
          title="Expandir feed de actividad"
          className="h-8 w-8 rounded-md bg-secondary/80 hover:bg-secondary flex items-center justify-center text-xs font-bold text-foreground cursor-pointer"
        >
          ▶
        </button>

        <div className="h-px w-8 bg-border/80 my-1" />

        <div className="flex flex-col gap-2.5 items-center">
          {items.slice(0, 5).map((item) => (
            <div
              key={item.id}
              title={`${item.titulo}: ${item.detalle}`}
              className="cursor-pointer transition-transform hover:scale-110"
            >
              {getTipoIcon(item.tipo)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <IslaCardShell
      id="activity_feed"
      dataTestId="isla-activity-feed"
      title="Actividad"
      icon={<Activity className="h-4 w-4 text-primary" aria-label="Actividad" />}
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
        <div className="flex items-center justify-between">
          <span>Actividad ({items.length} eventos registrados)</span>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {items.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>
        ) : (
          /* Lista cronológica (objetivo Ficha.html): punto de color por tipo, título, detalle y hora */
          <div className="flex flex-col gap-3.5">
            {groups.map((group) => (
              <ul key={group.nombre} data-testid="activity-feed-date-group" className="m-0 flex list-none flex-col gap-3.5 p-0">
                {group.items.map((item) => (
                  <li key={item.id} data-testid="activity-feed-event-item" className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        item.tipo === "molestia"
                          ? "bg-warning-soft-foreground"
                          : item.tipo === "pago"
                          ? "bg-success-soft-foreground"
                          : item.tipo === "sesion"
                          ? "bg-foreground"
                          : "bg-subtle-foreground"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-sm font-medium text-foreground">{item.titulo}</p>
                      <p className="m-0 text-[13px] text-neutral-soft-foreground">{item.detalle}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.horaOFecha}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}

        {/* Repliegue a riel de 56 px */}
        <button
          type="button"
          onClick={onToggleRail}
          data-testid="toggle-collapse-feed"
          aria-label="Colapsar Feed"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground cursor-pointer"
        >
          Plegar al costado
        </button>

        {/* Historial de pagos embebido para preservar compatibilidad */}
        {historialPagosNode}

        {/* Atención y Chat GOZS embebido para preservar compatibilidad */}
        {chatPanelNode}
      </div>
    </IslaCardShell>
  );
}
