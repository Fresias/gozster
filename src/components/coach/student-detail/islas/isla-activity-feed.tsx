import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Button } from "@/components/ui/button";

export interface ActivityFeedItem {
  id: string;
  tipo: "pago" | "sesion" | "molestia" | "sustitucion" | "chat";
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
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

const DEFAULT_FEED_ITEMS: ActivityFeedItem[] = [
  {
    id: "act-1",
    tipo: "sesion",
    titulo: "Sesión de Entrenamiento Registrada",
    detalle: "Completó Día 1 Piernas: Sentadilla 120 kg × 3 reps (4 series) y Prensa 180 kg.",
    fechaGrupo: "HOY",
    horaOFecha: "10:30 hs",
  },
  {
    id: "act-2",
    tipo: "chat",
    titulo: "Mensaje en Chat GOZS",
    detalle: "Consultó sobre descanso entre series de sentadilla.",
    fechaGrupo: "HOY",
    horaOFecha: "09:15 hs",
  },
  {
    id: "act-3",
    tipo: "pago",
    titulo: "Cobro / Pago Registrado",
    detalle: "Pago de suscripción mensual vía transferencia acreditado.",
    fechaGrupo: "AYER",
    horaOFecha: "18:45 hs",
  },
  {
    id: "act-4",
    tipo: "sustitucion",
    titulo: "Sustitución Biomecánica (ADR-002)",
    detalle: "Press Militar sustituido por Elevaciones Laterales con Mancuerna.",
    fechaGrupo: "ESTA SEMANA",
    horaOFecha: "Lun 14:20 hs",
  },
  {
    id: "act-5",
    tipo: "molestia",
    titulo: "Alerta de Molestia Articular",
    detalle: "Reportó dolor leve en hombro derecho (EVA 3).",
    fechaGrupo: "ESTA SEMANA",
    horaOFecha: "Dom 19:10 hs",
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
  items = DEFAULT_FEED_ITEMS,
  chatPanelNode,
  historialPagosNode,
  onMoveUp,
  onMoveDown,
  onHide,
  canMoveUp,
  canMoveDown,
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
        return <span className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-xs">💳</span>;
      case "sesion":
        return <span className="h-6 w-6 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center text-xs">🏋️</span>;
      case "molestia":
        return <span className="h-6 w-6 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center text-xs">🚨</span>;
      case "sustitucion":
        return <span className="h-6 w-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs">🔄</span>;
      case "chat":
        return <span className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">💬</span>;
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
          title="Expandir bitácora omnicanal"
          className="h-8 w-8 rounded-md bg-secondary/80 hover:bg-secondary flex items-center justify-center text-xs font-bold text-foreground"
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
      title="Bitácora Omnicanal (Feed)"
      icon={<span>📋</span>}
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
      onHide={onHide}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      compactSummary={
        <div className="flex items-center justify-between">
          <span>Bitácora compactada ({items.length} eventos registrados)</span>
        </div>
      }
    >
      <div className="p-3 sm:p-4 space-y-4">
        {/* Botón de repliegue a riel de 56px */}
        <div className="flex items-center justify-between pb-1 border-b border-border/40">
          <span className="text-[11px] font-semibold text-muted-foreground">
            Actividad en tiempo real
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleRail}
            data-testid="toggle-collapse-feed"
            className="h-7 text-[11px] px-2 font-medium"
          >
            ◀ Colapsar Feed
          </Button>
        </div>

        {/* Feed vertical clasificado por fecha */}
        <div className="space-y-3">
          {groups.map((group) => {
            const isGroupCollapsed = !!collapsedGroups[group.nombre];
            return (
              <div
                key={group.nombre}
                data-testid="activity-feed-date-group"
                className="space-y-1.5"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.nombre)}
                  className="flex w-full items-center justify-between text-[11px] font-bold text-muted-foreground hover:text-foreground"
                >
                  <span className="tracking-wider">{group.nombre}</span>
                  <span className="text-[10px] font-mono">
                    {isGroupCollapsed ? "[+]" : "[-]"}
                  </span>
                </button>

                {!isGroupCollapsed && (
                  <div className="space-y-1.5 border-l-2 border-border/60 pl-2.5 ml-1">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        data-testid="activity-feed-event-item"
                        className="flex items-start gap-2.5 rounded-lg bg-secondary/20 p-2 text-xs hover:bg-secondary/40 transition-colors"
                      >
                        <div className="shrink-0 pt-0.5">{getTipoIcon(item.tipo)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-semibold text-foreground text-[11px] truncate">
                              {item.titulo}
                            </p>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                              {item.horaOFecha}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                            {item.detalle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Historial de pagos embebido para preservar compatibilidad */}
        {historialPagosNode}

        {/* Atención y Chat GOZS embebido para preservar compatibilidad */}
        {chatPanelNode}
      </div>
    </IslaCardShell>
  );
}
