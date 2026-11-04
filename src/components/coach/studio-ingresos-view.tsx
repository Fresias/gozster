"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CANONICAL_SANKEY_DATA, type SankeyFlowData } from "@/components/coach/studio-sankey-modal";

export type SankeyFilter = "TODOS" | "COBRADO" | "PENDIENTE" | "PRESENCIAL" | "ONLINE";

export interface StudioIngresosViewProps {
  data?: SankeyFlowData;
  initialFilter?: SankeyFilter;
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const money = (n: number) => `$${pesos.format(n)}`;

function createSankeyRibbon(
  x0: number,
  y0Top: number,
  y0Bottom: number,
  x1: number,
  y1Top: number,
  y1Bottom: number,
): string {
  const dx = (x1 - x0) * 0.5;
  return `M ${x0} ${y0Top} C ${x0 + dx} ${y0Top}, ${x1 - dx} ${y1Top}, ${x1} ${y1Top} L ${x1} ${y1Bottom} C ${x1 - dx} ${y1Bottom}, ${x0 + dx} ${y0Bottom}, ${x0} ${y0Bottom} Z`;
}

interface RibbonDetail {
  id: string;
  sourceNode: string;
  targetNode: string;
  category: "COBRADO" | "PENDIENTE";
  channel: "PRESENCIAL" | "ONLINE";
  activity: "FUNCIONAL" | "BOXEO" | "RUTINAS";
  amount: number;
  label: string;
  percentTotal: number;
  athletesDetail: string;
}

const RIBBON_POTENCIAL_COBRADO: RibbonDetail = {
  id: "potencial-cobrado",
  sourceNode: "potencial",
  targetNode: "cobrado",
  category: "COBRADO",
  channel: "PRESENCIAL",
  activity: "FUNCIONAL",
  amount: 80000,
  label: "Potencial Total → Efectivo Cobrado",
  percentTotal: 80,
  athletesDetail: "Cobranza realizada (80% tasa de efectividad)",
};

const RIBBON_POTENCIAL_PENDIENTE: RibbonDetail = {
  id: "potencial-pendiente",
  sourceNode: "potencial",
  targetNode: "pendiente",
  category: "PENDIENTE",
  channel: "PRESENCIAL",
  activity: "FUNCIONAL",
  amount: 20000,
  label: "Potencial Total → Cartera por Cobrar",
  percentTotal: 20,
  athletesDetail: "2 alumnos con cuotas pendientes en gestión",
};

const RIBBON_COBRADO_FUNCIONAL: RibbonDetail = {
  id: "cobrado-funcional",
  sourceNode: "cobrado",
  targetNode: "funcional",
  category: "COBRADO",
  channel: "PRESENCIAL",
  activity: "FUNCIONAL",
  amount: 50000,
  label: "Cobrado → Presencial Funcional",
  percentTotal: 50,
  athletesDetail: "28 atletas activos al día",
};

const RIBBON_COBRADO_BOXEO: RibbonDetail = {
  id: "cobrado-boxeo",
  sourceNode: "cobrado",
  targetNode: "boxeo",
  category: "COBRADO",
  channel: "PRESENCIAL",
  activity: "BOXEO",
  amount: 15000,
  label: "Cobrado → Presencial Boxeo",
  percentTotal: 15,
  athletesDetail: "8 atletas activos al día",
};

const RIBBON_COBRADO_RUTINAS: RibbonDetail = {
  id: "cobrado-rutinas",
  sourceNode: "cobrado",
  targetNode: "rutinas",
  category: "COBRADO",
  channel: "ONLINE",
  activity: "RUTINAS",
  amount: 15000,
  label: "Cobrado → Rutinas Online",
  percentTotal: 15,
  athletesDetail: "12 atletas remotos con plan activo",
};

const RIBBON_PENDIENTE_FUNCIONAL: RibbonDetail = {
  id: "pendiente-funcional",
  sourceNode: "pendiente",
  targetNode: "funcional",
  category: "PENDIENTE",
  channel: "PRESENCIAL",
  activity: "FUNCIONAL",
  amount: 10000,
  label: "Por Cobrar → Presencial Funcional",
  percentTotal: 10,
  athletesDetail: "Joaquín Paz · Cuota vencida (14 días)",
};

const RIBBON_PENDIENTE_BOXEO: RibbonDetail = {
  id: "pendiente-boxeo",
  sourceNode: "pendiente",
  targetNode: "boxeo",
  category: "PENDIENTE",
  channel: "PRESENCIAL",
  activity: "BOXEO",
  amount: 5000,
  label: "Por Cobrar → Presencial Boxeo",
  percentTotal: 5,
  athletesDetail: "Gonzalo Peralta · Cuota vencida (8 días)",
};

const RIBBON_PENDIENTE_RUTINAS: RibbonDetail = {
  id: "pendiente-rutinas",
  sourceNode: "pendiente",
  targetNode: "rutinas",
  category: "PENDIENTE",
  channel: "ONLINE",
  activity: "RUTINAS",
  amount: 5000,
  label: "Por Cobrar → Rutinas Online",
  percentTotal: 5,
  athletesDetail: "Facundo Medina · Cuota vencida (5 días)",
};

const RIBBONS_DATA: RibbonDetail[] = [
  RIBBON_POTENCIAL_COBRADO,
  RIBBON_POTENCIAL_PENDIENTE,
  RIBBON_COBRADO_FUNCIONAL,
  RIBBON_COBRADO_BOXEO,
  RIBBON_COBRADO_RUTINAS,
  RIBBON_PENDIENTE_FUNCIONAL,
  RIBBON_PENDIENTE_BOXEO,
  RIBBON_PENDIENTE_RUTINAS,
];

export function StudioIngresosView({
  data = CANONICAL_SANKEY_DATA,
  initialFilter = "TODOS",
}: StudioIngresosViewProps) {
  const [activeFilter, setActiveFilter] = React.useState<SankeyFilter>(initialFilter);
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);
  const [hoveredRibbon, setHoveredRibbon] = React.useState<RibbonDetail | null>(null);
  const [periodo, setPeriodo] = React.useState<string>("nov-2026");

  const { potencialTotal, efectivoCobrado, potencialPendiente } = data;

  // Mix de negocio cobrado
  const mixPresencialPct = Math.round(
    (efectivoCobrado.presencial.total / efectivoCobrado.total) * 100,
  );
  const mixOnlinePct = 100 - mixPresencialPct;

  // Tasa de efectividad de cobranza
  const efectividadCobranzaPct = ((efectivoCobrado.total / potencialTotal) * 100).toFixed(1);

  // Determinar si un ribbon está destacado según filtros y selección activa
  const isRibbonActive = React.useCallback(
    (ribbon: RibbonDetail) => {
      // 1. Si hay un ribbon específico en hover
      if (hoveredRibbon) {
        return hoveredRibbon.id === ribbon.id;
      }

      // 2. Si hay un nodo interactivo activo (por hover o click persistente)
      const currentTarget = hoveredNode || selectedNode;
      if (currentTarget) {
        if (currentTarget === "potencial") return true;
        if (currentTarget === "cobrado") return ribbon.category === "COBRADO";
        if (currentTarget === "pendiente") return ribbon.category === "PENDIENTE";
        if (currentTarget === "funcional") return ribbon.activity === "FUNCIONAL";
        if (currentTarget === "boxeo") return ribbon.activity === "BOXEO";
        if (currentTarget === "rutinas") return ribbon.activity === "RUTINAS";
      }

      // 3. Si no hay nodo activo, aplicar la píldora de filtro seleccionada
      if (activeFilter === "TODOS") return true;
      if (activeFilter === "COBRADO") return ribbon.category === "COBRADO";
      if (activeFilter === "PENDIENTE") return ribbon.category === "PENDIENTE";
      if (activeFilter === "PRESENCIAL") return ribbon.channel === "PRESENCIAL";
      if (activeFilter === "ONLINE") return ribbon.channel === "ONLINE";

      return true;
    },
    [hoveredRibbon, hoveredNode, selectedNode, activeFilter],
  );

  // Determinar si un nodo está activo
  const isNodeActive = React.useCallback(
    (nodeId: string) => {
      const currentTarget = hoveredNode || selectedNode;
      if (!currentTarget && activeFilter === "TODOS" && !hoveredRibbon) return true;

      if (hoveredRibbon) {
        return (
          nodeId === hoveredRibbon.sourceNode ||
          nodeId === hoveredRibbon.targetNode ||
          (nodeId === "potencial" && hoveredRibbon.sourceNode === "cobrado") ||
          (nodeId === "potencial" && hoveredRibbon.sourceNode === "pendiente")
        );
      }

      if (currentTarget) {
        if (currentTarget === nodeId) return true;
        if (currentTarget === "potencial") return true;
        if (currentTarget === "cobrado") {
          return nodeId === "potencial" || nodeId === "cobrado" || ["funcional", "boxeo", "rutinas"].includes(nodeId);
        }
        if (currentTarget === "pendiente") {
          return nodeId === "potencial" || nodeId === "pendiente" || ["funcional", "boxeo", "rutinas"].includes(nodeId);
        }
        if (["funcional", "boxeo", "rutinas"].includes(currentTarget)) {
          return nodeId === "potencial" || nodeId === "cobrado" || nodeId === "pendiente" || nodeId === currentTarget;
        }
      }

      if (activeFilter === "COBRADO") {
        return nodeId === "potencial" || nodeId === "cobrado" || ["funcional", "boxeo", "rutinas"].includes(nodeId);
      }
      if (activeFilter === "PENDIENTE") {
        return nodeId === "potencial" || nodeId === "pendiente" || ["funcional", "boxeo", "rutinas"].includes(nodeId);
      }
      if (activeFilter === "PRESENCIAL") {
        return nodeId === "potencial" || nodeId === "cobrado" || nodeId === "pendiente" || nodeId === "funcional" || nodeId === "boxeo";
      }
      if (activeFilter === "ONLINE") {
        return nodeId === "potencial" || nodeId === "cobrado" || nodeId === "pendiente" || nodeId === "rutinas";
      }

      return true;
    },
    [hoveredRibbon, hoveredNode, selectedNode, activeFilter],
  );

  // Manejar click en nodo (toggle)
  const handleNodeClick = (nodeId: string) => {
    setSelectedNode((prev) => (prev === nodeId ? null : nodeId));
  };

  // Detalle para tooltip o barra flotante informativa
  const activeDetailText = React.useMemo(() => {
    if (hoveredRibbon) {
      return {
        title: hoveredRibbon.label,
        monto: money(hoveredRibbon.amount),
        pct: `${hoveredRibbon.percentTotal}% del total`,
        desc: hoveredRibbon.athletesDetail,
      };
    }
    const target = hoveredNode || selectedNode;
    if (target === "potencial") {
      return {
        title: "Facturación Potencial Total",
        monto: money(potencialTotal),
        pct: "100% potencial activo",
        desc: "Universo total de cuotas y planes contratados para el período.",
      };
    }
    if (target === "cobrado") {
      return {
        title: "Cobranza Efectiva Total",
        monto: money(efectivoCobrado.total),
        pct: `${efectividadCobranzaPct}% tasa de efectividad`,
        desc: `Presencial: ${money(efectivoCobrado.presencial.total)} · Online: ${money(efectivoCobrado.online.total)}`,
      };
    }
    if (target === "pendiente") {
      return {
        title: "Cartera por Cobrar (Deuda)",
        monto: money(potencialPendiente.total),
        pct: `${Math.round((potencialPendiente.total / potencialTotal) * 100)}% de cartera pendiente`,
        desc: "3 cuotas vencidas distribuidas en Funcional, Boxeo y Rutinas.",
      };
    }
    if (target === "funcional") {
      return {
        title: "Actividad: Funcional Presencial",
        monto: money(efectivoCobrado.presencial.funcional + potencialPendiente.desgloseActividad.funcional),
        pct: "60% del negocio global",
        desc: `${money(efectivoCobrado.presencial.funcional)} cobrado + ${money(potencialPendiente.desgloseActividad.funcional)} por cobrar.`,
      };
    }
    if (target === "boxeo") {
      return {
        title: "Actividad: Boxeo Recreativo & Sparring",
        monto: money(efectivoCobrado.presencial.boxeo + potencialPendiente.desgloseActividad.boxeo),
        pct: "20% del negocio global",
        desc: `${money(efectivoCobrado.presencial.boxeo)} cobrado + ${money(potencialPendiente.desgloseActividad.boxeo)} por cobrar.`,
      };
    }
    if (target === "rutinas") {
      return {
        title: "Canal: Rutinas Online & App",
        monto: money(efectivoCobrado.online.rutinas + potencialPendiente.desgloseActividad.rutinas),
        pct: "20% del negocio global",
        desc: `${money(efectivoCobrado.online.rutinas)} cobrado + ${money(potencialPendiente.desgloseActividad.rutinas)} por cobrar.`,
      };
    }
    return null;
  }, [hoveredRibbon, hoveredNode, selectedNode, data, efectividadCobranzaPct]);

  return (
    <div className="space-y-6 pb-12" data-testid="studio-ingresos-view">
      {/* 1. Breadcrumb y Botón de Retorno ágil */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/studio"
            className="hover:text-foreground transition-colors flex items-center gap-1 font-medium"
          >
            Coach Studio
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">Flujo de Facturación</span>
        </nav>

        <Link
          href="/studio"
          data-testid="btn-volver-studio"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/60 transition-colors"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Volver a Studio</span>
        </Link>
      </div>

      {/* 2. Cabecera Ejecutiva y Selector de Período estilo reui.io */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Flujo de Facturación &amp; Cobranza
            </h1>
            <Badge variant="secondary" className="font-semibold text-xs px-2.5 py-0.5">
              Noviembre 2026
            </Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Distribución visual del potencial de facturación, efectividad de cobranza y cartera por cobrar en GOZSter.
          </p>
        </div>

        {/* Selector de Período */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div
            data-testid="period-selector"
            className="inline-flex items-center rounded-lg border border-border bg-card p-1 shadow-xs text-xs font-medium"
          >
            <button
              type="button"
              onClick={() => setPeriodo("nov-2026")}
              className={`rounded-md px-3 py-1 transition-all ${
                periodo === "nov-2026"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Noviembre 2026
            </button>
            <button
              type="button"
              onClick={() => setPeriodo("q4-2026")}
              className={`rounded-md px-3 py-1 transition-all ${
                periodo === "q4-2026"
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Q4 2026 (Trimestre)
            </button>
          </div>
        </div>
      </div>

      {/* 3. Franja Superior de Métricas Clave (Top Metrics Strip estilo reui.io) */}
      <section
        aria-label="Franja Superior de Métricas Clave"
        data-testid="top-metrics-strip"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Card 1: Facturación Potencial */}
        <div
          data-testid="kpi-facturacion-potencial"
          className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-foreground" aria-hidden="true" />
            <span>Facturación Potencial</span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground">
            {money(potencialTotal)}
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              +15.2% vs mes anterior
            </span>
          </div>
        </div>

        {/* Card 2: Cobranza Efectiva */}
        <div
          data-testid="kpi-cobranza-efectiva"
          className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>Cobranza Efectiva</span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground">
            {money(efectivoCobrado.total)}
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {`${efectividadCobranzaPct}% tasa de efectividad`}
            </span>
          </div>
        </div>

        {/* Card 3: Cartera por Cobrar */}
        <div
          data-testid="kpi-cartera-por-cobrar"
          className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
            <span>Cartera por Cobrar</span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground">
            {money(potencialPendiente.total)}
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
              2 alumnos con cuotas pendientes
            </span>
          </div>
        </div>

        {/* Card 4: Mix de Negocio */}
        <div
          data-testid="kpi-mix-negocio"
          className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
            <span>Mix de Negocio</span>
          </div>
          <div className="mt-2.5 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground">
            {`${mixPresencialPct}% Presencial`}
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              {`${mixOnlinePct}% Online`}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Bloque Principal: Lienzo Sankey Bézier Trazable estilo reui.io (SaaS Revenue Flow) */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        {/* Barra de Filtros con Pills de Color y Guía de Interacción */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border/50">
          <div
            data-testid="sankey-filter-bar"
            className="flex flex-wrap items-center gap-1.5"
            role="toolbar"
            aria-label="Filtros de flujo Sankey"
          >
            <button
              type="button"
              data-testid="filter-pill-todos"
              onClick={() => {
                setActiveFilter("TODOS");
                setSelectedNode(null);
              }}
              className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeFilter === "TODOS" && !selectedNode
                  ? "bg-foreground text-background shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              Todos
            </button>

            <button
              type="button"
              data-testid="filter-pill-cobrado"
              onClick={() => {
                setActiveFilter("COBRADO");
                setSelectedNode(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeFilter === "COBRADO" && !selectedNode
                  ? "bg-emerald-500 text-white shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Cobrado</span>
            </button>

            <button
              type="button"
              data-testid="filter-pill-pendiente"
              onClick={() => {
                setActiveFilter("PENDIENTE");
                setSelectedNode(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeFilter === "PENDIENTE" && !selectedNode
                  ? "bg-amber-500 text-white shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              <span>Por Cobrar</span>
            </button>

            <button
              type="button"
              data-testid="filter-pill-presencial"
              onClick={() => {
                setActiveFilter("PRESENCIAL");
                setSelectedNode(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeFilter === "PRESENCIAL" && !selectedNode
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />
              <span>Presencial</span>
            </button>

            <button
              type="button"
              data-testid="filter-pill-online"
              onClick={() => {
                setActiveFilter("ONLINE");
                setSelectedNode(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeFilter === "ONLINE" && !selectedNode
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
              <span>Online</span>
            </button>

            {selectedNode && (
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="ml-2 text-xs text-primary underline hover:text-primary/80 font-medium"
              >
                Limpiar trazado ({selectedNode})
              </button>
            )}
          </div>

          <div
            data-testid="sankey-guide-text"
            className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium self-end sm:self-auto"
          >
            <svg
              className="h-3.5 w-3.5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              />
            </svg>
            <span>Haz clic en un nodo para trazar su flujo</span>
          </div>
        </div>

        {/* Detalle flotante/contextual dinámico cuando hay hover o selección */}
        <div className="my-3 min-h-[44px] flex items-center justify-between rounded-lg bg-secondary/30 px-3.5 py-2 text-xs border border-border/40">
          {activeDetailText ? (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{activeDetailText.title}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-extrabold text-primary tabular-nums">{activeDetailText.monto}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {activeDetailText.pct}
                </span>
              </div>
              <p className="text-muted-foreground text-[11px]">{activeDetailText.desc}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Explorador de flujo financiero activo: haz clic en cualquier barra o cinta para aislar su trayectoria.</span>
            </div>
          )}
        </div>

        {/* Lienzo SVG Responsivo de Sankey */}
        <div
          data-testid="sankey-canvas"
          className="relative w-full overflow-hidden rounded-xl bg-background/50 border border-border/40 p-2 sm:p-4 select-none"
        >
          <svg
            viewBox="0 0 960 420"
            className="w-full h-auto max-h-[520px]"
            role="img"
            aria-label="Diagrama de Sankey de flujo de ingresos"
          >
            <defs>
              {/* Gradientes Lineales Horizontales para Ribbons Bézier */}
              <linearGradient id="grad-potencial-cobrado" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#475569" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.6" />
              </linearGradient>

              <linearGradient id="grad-potencial-pendiente" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#475569" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
              </linearGradient>

              <linearGradient id="grad-cobrado-funcional" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.65" />
              </linearGradient>

              <linearGradient id="grad-cobrado-boxeo" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#0d9488" stopOpacity="0.65" />
              </linearGradient>

              <linearGradient id="grad-cobrado-rutinas" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.65" />
              </linearGradient>

              <linearGradient id="grad-pendiente-funcional" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#d97706" stopOpacity="0.65" />
              </linearGradient>

              <linearGradient id="grad-pendiente-boxeo" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#ea580c" stopOpacity="0.65" />
              </linearGradient>

              <linearGradient id="grad-pendiente-rutinas" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.65" />
              </linearGradient>
            </defs>

            {/* RIBBONS (Cintas Bézier Fluidas) */}
            <g id="sankey-ribbons">
              {/* 1. Potencial -> Cobrado ($80k) */}
              <path
                id="ribbon-potencial-cobrado"
                d={createSankeyRibbon(124, 40, 296, 450, 40, 280)}
                fill="url(#grad-potencial-cobrado)"
                style={{
                  opacity: isRibbonActive(RIBBON_POTENCIAL_COBRADO) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_POTENCIAL_COBRADO)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("cobrado")}
              >
                <title>{`Flujo: Potencial Total → Cobrado (${money(80000)})`}</title>
              </path>

              {/* 2. Potencial -> Por Cobrar ($20k) */}
              <path
                id="ribbon-potencial-pendiente"
                d={createSankeyRibbon(124, 296, 360, 450, 300, 360)}
                fill="url(#grad-potencial-pendiente)"
                style={{
                  opacity: isRibbonActive(RIBBON_POTENCIAL_PENDIENTE) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_POTENCIAL_PENDIENTE)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("pendiente")}
              >
                <title>{`Flujo: Potencial Total → Por Cobrar (${money(20000)})`}</title>
              </path>

              {/* 3. Cobrado -> Funcional ($50k) */}
              <path
                id="ribbon-cobrado-funcional"
                d={createSankeyRibbon(464, 40, 190, 780, 44, 184)}
                fill="url(#grad-cobrado-funcional)"
                style={{
                  opacity: isRibbonActive(RIBBON_COBRADO_FUNCIONAL) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_COBRADO_FUNCIONAL)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("funcional")}
              >
                <title>{`Cobrado → Funcional (${money(50000)})`}</title>
              </path>

              {/* 4. Cobrado -> Boxeo ($15k) */}
              <path
                id="ribbon-cobrado-boxeo"
                d={createSankeyRibbon(464, 190, 235, 780, 228, 270)}
                fill="url(#grad-cobrado-boxeo)"
                style={{
                  opacity: isRibbonActive(RIBBON_COBRADO_BOXEO) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_COBRADO_BOXEO)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("boxeo")}
              >
                <title>{`Cobrado → Boxeo (${money(15000)})`}</title>
              </path>

              {/* 5. Cobrado -> Rutinas ($15k) */}
              <path
                id="ribbon-cobrado-rutinas"
                d={createSankeyRibbon(464, 235, 280, 780, 300, 342)}
                fill="url(#grad-cobrado-rutinas)"
                style={{
                  opacity: isRibbonActive(RIBBON_COBRADO_RUTINAS) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_COBRADO_RUTINAS)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("rutinas")}
              >
                <title>{`Cobrado → Rutinas (${money(15000)})`}</title>
              </path>

              {/* 6. Por Cobrar -> Funcional ($10k) */}
              <path
                id="ribbon-pendiente-funcional"
                d={createSankeyRibbon(464, 300, 330, 780, 184, 212)}
                fill="url(#grad-pendiente-funcional)"
                style={{
                  opacity: isRibbonActive(RIBBON_PENDIENTE_FUNCIONAL) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_PENDIENTE_FUNCIONAL)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("funcional")}
              >
                <title>{`Por Cobrar → Funcional (${money(10000)})`}</title>
              </path>

              {/* 7. Por Cobrar -> Boxeo ($5k) */}
              <path
                id="ribbon-pendiente-boxeo"
                d={createSankeyRibbon(464, 330, 345, 780, 270, 284)}
                fill="url(#grad-pendiente-boxeo)"
                style={{
                  opacity: isRibbonActive(RIBBON_PENDIENTE_BOXEO) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_PENDIENTE_BOXEO)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("boxeo")}
              >
                <title>{`Por Cobrar → Boxeo (${money(5000)})`}</title>
              </path>

              {/* 8. Por Cobrar -> Rutinas ($5k) */}
              <path
                id="ribbon-pendiente-rutinas"
                d={createSankeyRibbon(464, 345, 360, 780, 342, 356)}
                fill="url(#grad-pendiente-rutinas)"
                style={{
                  opacity: isRibbonActive(RIBBON_PENDIENTE_RUTINAS) ? 0.85 : 0.15,
                  transition: "opacity 0.25s ease-in-out",
                }}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRibbon(RIBBON_PENDIENTE_RUTINAS)}
                onMouseLeave={() => setHoveredRibbon(null)}
                onClick={() => setSelectedNode("rutinas")}
              >
                <title>{`Por Cobrar → Rutinas (${money(5000)})`}</title>
              </path>
            </g>

            {/* NODOS (Barras Verticales y Etiquetas reui.io) */}
            <g id="sankey-nodes">
              {/* COLUMNA 1: Facturación Potencial Total */}
              <g
                id="node-potencial"
                data-testid="sankey-node-potencial"
                className="cursor-pointer"
                style={{
                  opacity: isNodeActive("potencial") ? 1 : 0.25,
                  transition: "opacity 0.2s ease-in-out",
                }}
                onClick={() => handleNodeClick("potencial")}
                onMouseEnter={() => setHoveredNode("potencial")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect x="110" y="40" width="14" height="320" rx="3" className="fill-foreground" />
                <text x="96" y="190" textAnchor="end" className="text-xs font-bold fill-foreground">
                  Facturación Potencial
                </text>
                <text x="96" y="210" textAnchor="end" className="text-[11px] font-semibold fill-muted-foreground tabular-nums">
                  {`${money(potencialTotal)} · 100%`}
                </text>
              </g>

              {/* COLUMNA 2: Bifurcación Cobrado vs Por Cobrar */}
              {/* Nodo Cobrado */}
              <g
                id="node-cobrado"
                data-testid="sankey-node-cobrado"
                className="cursor-pointer"
                style={{
                  opacity: isNodeActive("cobrado") ? 1 : 0.25,
                  transition: "opacity 0.2s ease-in-out",
                }}
                onClick={() => handleNodeClick("cobrado")}
                onMouseEnter={() => setHoveredNode("cobrado")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect x="450" y="40" width="14" height="240" rx="3" className="fill-emerald-500" />
                <text x="474" y="150" textAnchor="start" className="text-xs font-bold fill-foreground">
                  Efectivo Cobrado
                </text>
                <text x="474" y="170" textAnchor="start" className="text-[11px] font-semibold fill-emerald-600 dark:fill-emerald-400 tabular-nums">
                  {`${money(efectivoCobrado.total)} · ${efectividadCobranzaPct}%`}
                </text>
              </g>

              {/* Nodo Por Cobrar */}
              <g
                id="node-pendiente"
                data-testid="sankey-node-pendiente"
                className="cursor-pointer"
                style={{
                  opacity: isNodeActive("pendiente") ? 1 : 0.25,
                  transition: "opacity 0.2s ease-in-out",
                }}
                onClick={() => handleNodeClick("pendiente")}
                onMouseEnter={() => setHoveredNode("pendiente")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect x="450" y="300" width="14" height="60" rx="3" className="fill-amber-500" />
                <text x="474" y="324" textAnchor="start" className="text-xs font-bold fill-foreground">
                  Cartera por Cobrar
                </text>
                <text x="474" y="344" textAnchor="start" className="text-[11px] font-semibold fill-amber-600 dark:fill-amber-400 tabular-nums">
                  {`${money(potencialPendiente.total)} · 20%`}
                </text>
              </g>

              {/* COLUMNA 3: Actividades y Canales Finales */}
              {/* Nodo Funcional */}
              <g
                id="node-funcional"
                data-testid="sankey-node-funcional"
                className="cursor-pointer"
                style={{
                  opacity: isNodeActive("funcional") ? 1 : 0.25,
                  transition: "opacity 0.2s ease-in-out",
                }}
                onClick={() => handleNodeClick("funcional")}
                onMouseEnter={() => setHoveredNode("funcional")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Segmento Cobrado */}
                <rect x="780" y="44" width="14" height="140" rx="3" className="fill-emerald-600" />
                {/* Segmento Pendiente */}
                <rect x="780" y="184" width="14" height="28" rx="2" className="fill-amber-500" />

                <text x="804" y="115" textAnchor="start" className="text-xs font-bold fill-foreground">
                  Funcional Presencial
                </text>
                <text x="804" y="133" textAnchor="start" className="text-[11px] font-bold fill-foreground tabular-nums">
                  $60.000 · 60%
                </text>
                <text x="804" y="150" textAnchor="start" className="text-[10px] fill-muted-foreground tabular-nums">
                  $50k cobrado · $10k por cobrar
                </text>
              </g>

              {/* Nodo Boxeo */}
              <g
                id="node-boxeo"
                data-testid="sankey-node-boxeo"
                className="cursor-pointer"
                style={{
                  opacity: isNodeActive("boxeo") ? 1 : 0.25,
                  transition: "opacity 0.2s ease-in-out",
                }}
                onClick={() => handleNodeClick("boxeo")}
                onMouseEnter={() => setHoveredNode("boxeo")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Segmento Cobrado */}
                <rect x="780" y="228" width="14" height="42" rx="3" className="fill-teal-600" />
                {/* Segmento Pendiente */}
                <rect x="780" y="270" width="14" height="14" rx="2" className="fill-amber-500" />

                <text x="804" y="248" textAnchor="start" className="text-xs font-bold fill-foreground">
                  Boxeo Recreativo
                </text>
                <text x="804" y="266" textAnchor="start" className="text-[11px] font-bold fill-foreground tabular-nums">
                  $20.000 · 20%
                </text>
                <text x="804" y="282" textAnchor="start" className="text-[10px] fill-muted-foreground tabular-nums">
                  $15k cobrado · $5k por cobrar
                </text>
              </g>

              {/* Nodo Rutinas Online */}
              <g
                id="node-rutinas"
                data-testid="sankey-node-rutinas"
                className="cursor-pointer"
                style={{
                  opacity: isNodeActive("rutinas") ? 1 : 0.25,
                  transition: "opacity 0.2s ease-in-out",
                }}
                onClick={() => handleNodeClick("rutinas")}
                onMouseEnter={() => setHoveredNode("rutinas")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Segmento Cobrado */}
                <rect x="780" y="300" width="14" height="42" rx="3" className="fill-indigo-600" />
                {/* Segmento Pendiente */}
                <rect x="780" y="342" width="14" height="14" rx="2" className="fill-amber-500" />

                <text x="804" y="320" textAnchor="start" className="text-xs font-bold fill-foreground">
                  Rutinas Online App
                </text>
                <text x="804" y="338" textAnchor="start" className="text-[11px] font-bold fill-foreground tabular-nums">
                  $20.000 · 20%
                </text>
                <text x="804" y="354" textAnchor="start" className="text-[10px] fill-muted-foreground tabular-nums">
                  $15k cobrado · $5k por cobrar
                </text>
              </g>
            </g>
          </svg>
        </div>

        {/* Pie de Página del Bloque Sankey (Estilo reui.io) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground border-t border-border/40 pt-3">
          <span>Cifras expresadas en ARS • Actualizado Noviembre 2026 • Cifras de gestión interna</span>
          <span>GOZSter Coach Studio • Revenue Flow SaaS</span>
        </div>
      </div>
    </div>
  );
}
