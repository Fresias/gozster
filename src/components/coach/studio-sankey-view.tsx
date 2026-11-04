"use client";

import * as React from "react";
import Link from "next/link";
import { CANONICAL_SANKEY_DATA, type SankeyFlowData } from "./studio-sankey-modal";

export interface StudioSankeyViewProps {
  initialData?: SankeyFlowData;
}

type FilterKey = "ALL" | "COBRADO" | "PENDIENTE" | "PRESENCIAL" | "ONLINE";

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const money = (n: number) => `$${pesos.format(n)}`;

// Curva Bézier cúbica para ribbons de flujo Sankey (estilo reui.io)
function createSankeyRibbon(
  x0: number,
  y0Top: number,
  y0Bottom: number,
  x1: number,
  y1Top: number,
  y1Bottom: number
): string {
  const dx = x1 - x0;
  const cx1 = x0 + dx * 0.45;
  const cx2 = x1 - dx * 0.45;

  return [
    `M ${x0} ${y0Top}`,
    `C ${cx1} ${y0Top}, ${cx2} ${y1Top}, ${x1} ${y1Top}`,
    `L ${x1} ${y1Bottom}`,
    `C ${cx2} ${y1Bottom}, ${cx1} ${y0Bottom}, ${x0} ${y0Bottom}`,
    "Z",
  ].join(" ");
}

export function StudioSankeyView({ initialData = CANONICAL_SANKEY_DATA }: StudioSankeyViewProps) {
  const data = initialData;
  const [selectedFilter, setSelectedFilter] = React.useState<FilterKey>("ALL");
  const [activeNode, setActiveNode] = React.useState<string | null>(null);
  const [periodo, setPeriodo] = React.useState<"mes" | "trimestre">("mes");
  const [hoveredRibbon, setHoveredRibbon] = React.useState<{
    title: string;
    monto: number;
    pct: number;
    x: number;
    y: number;
  } | null>(null);

  // Totales calculados
  const totalPotencial = data.potencialTotal;
  const totalCobrado = data.efectivoCobrado.total;
  const totalPendiente = data.potencialPendiente.total;
  const pctCobrado = totalPotencial > 0 ? (totalCobrado / totalPotencial) * 100 : 0;
  const pctPendiente = totalPotencial > 0 ? (totalPendiente / totalPotencial) * 100 : 0;

  const presencialTotal =
    data.efectivoCobrado.presencial.total +
    data.potencialPendiente.desgloseActividad.funcional +
    data.potencialPendiente.desgloseActividad.boxeo;
  const onlineTotal =
    data.efectivoCobrado.online.total + data.potencialPendiente.desgloseActividad.rutinas;

  const pctPresencial = totalPotencial > 0 ? Math.round((presencialTotal / totalPotencial) * 100) : 0;
  const pctOnline = totalPotencial > 0 ? Math.round((onlineTotal / totalPotencial) * 100) : 0;

  // Determinar si un ribbon está resaltado o atenuado según activeNode y selectedFilter
  const isRibbonActive = (tags: string[]): boolean => {
    if (selectedFilter !== "ALL") {
      if (selectedFilter === "COBRADO" && !tags.includes("cobrado")) return false;
      if (selectedFilter === "PENDIENTE" && !tags.includes("pendiente")) return false;
      if (selectedFilter === "PRESENCIAL" && !tags.includes("presencial")) return false;
      if (selectedFilter === "ONLINE" && !tags.includes("online")) return false;
    }
    if (!activeNode) return true;
    return tags.includes(activeNode);
  };

  const getRibbonOpacity = (tags: string[]): number => {
    if (isRibbonActive(tags)) return 0.78;
    return 0.12;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6" data-testid="studio-sankey-view">
      {/* Cabecera & Selector de Período estilo reui.io */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Link href="/studio" className="hover:text-foreground transition-colors">
              Coach Studio
            </Link>
            <span>/</span>
            <span className="text-foreground">Flujo de Ingresos</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              Q4 FY26 · Noviembre
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Flujo de Facturación & Cobranza
          </h1>
          <p className="text-sm text-muted-foreground">
            Mapeo interactivo de facturación potencial, efectividad de cobranza y cartera en mora.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Selector de Período */}
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setPeriodo("mes")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                periodo === "mes"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Noviembre 2026
            </button>
            <button
              type="button"
              onClick={() => setPeriodo("trimestre")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                periodo === "trimestre"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Q4 FY26
            </button>
          </div>

          {/* Botón de Retorno a Studio */}
          <Link
            href="/studio"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors shadow-xs"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Volver a Studio
          </Link>
        </div>
      </div>

      {/* Franja Superior de Métricas Clave (Top Metrics Strip estilo reui.io) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="sankey-metrics-strip">
        {/* Card 1: Facturación Potencial */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all hover:border-primary/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Facturación Potencial</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              +15.2% vs Q3
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-foreground tabular-nums">
            {money(totalPotencial)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            100% de contratos activos y cuotas proyectadas
          </p>
        </div>

        {/* Card 2: Cobranza Efectiva */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all hover:border-emerald-500/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Cobranza Efectiva</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {pctCobrado.toFixed(1)}% tasa cobro
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
            {money(totalCobrado)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ingreso cobrado en término (bancarizado y efectivo)
          </p>
        </div>

        {/* Card 3: Cartera por Cobrar (Deuda) */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all hover:border-amber-500/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Por Cobrar / Deuda</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {pctPendiente.toFixed(1)}% pendiente
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">
            {money(totalPendiente)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {data.potencialPendiente.deudores.length} alumnos con mora activa o cuota impaga
          </p>
        </div>

        {/* Card 4: Mix de Negocio */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all hover:border-indigo-500/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Mix Canales</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              {pctPresencial}% Presencial
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-foreground tabular-nums">
            {money(presencialTotal)}{" "}
            <span className="text-xs font-semibold text-muted-foreground font-normal">
              / {money(onlineTotal)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Presencial (Funcional + Boxeo) vs Online (Rutinas)
          </p>
        </div>
      </div>

      {/* Barra de Filtros con Pills & Guía de Interacción */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-border/60">
        <div className="flex flex-wrap items-center gap-1.5" data-testid="sankey-filter-bar">
          <button
            type="button"
            onClick={() => {
              setSelectedFilter("ALL");
              setActiveNode(null);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedFilter === "ALL" && !activeNode
                ? "bg-foreground text-background shadow-xs"
                : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            Todos
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedFilter("COBRADO");
              setActiveNode("cobrado");
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedFilter === "COBRADO"
                ? "bg-emerald-500 text-white shadow-xs"
                : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
            Cobrado (${pesos.format(totalCobrado)})
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedFilter("PENDIENTE");
              setActiveNode("pendiente");
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedFilter === "PENDIENTE"
                ? "bg-amber-500 text-white shadow-xs"
                : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
            Por Cobrar (${pesos.format(totalPendiente)})
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedFilter("PRESENCIAL");
              setActiveNode("presencial");
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedFilter === "PRESENCIAL"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-indigo-400 inline-block" />
            Presencial (${pesos.format(presencialTotal)})
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedFilter("ONLINE");
              setActiveNode("online");
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedFilter === "ONLINE"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" />
            Online (${pesos.format(onlineTotal)})
          </button>
        </div>

        {/* Guía de Interacción reui.io */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium pl-1">
          <svg
            className="w-4 h-4 text-primary animate-pulse"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834 1.341l-1.591 1.591M20.25 10.5H18M4.5 10.5H2.25m2.841-4.659L6.682 7.432" />
          </svg>
          <span>Haz clic en un nodo o cinta para trazar su flujo</span>
        </div>
      </div>

      {/* Lienzo Sankey SVG Responsivo & Panorámico */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm overflow-hidden relative">
        {/* Cabecera de Columnas */}
        <div className="grid grid-cols-3 pb-3 mb-2 border-b border-border/40 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <span>1. Canales de Ingreso</span>
          <span className="text-center">2. Facturación Potencial</span>
          <span className="text-right">3. Efectividad de Cobro</span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 960 420"
            className="w-full min-w-[760px] h-auto max-h-[480px] select-none"
            role="img"
            aria-label="Diagrama de Sankey interactivo de facturación y cobranza"
          >
            <defs>
              {/* Gradientes horizontales para ribbons */}
              <linearGradient id="flow-pres-pot" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.75" />
              </linearGradient>

              <linearGradient id="flow-onl-pot" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.75" />
              </linearGradient>

              <linearGradient id="flow-pot-cob" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>

              <linearGradient id="flow-pot-pen" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Cintas de Flujo (Ribbons Bézier) */}
            {/* 1. Presencial -> Potencial Total ($81.000) */}
            <path
              d={createSankeyRibbon(200, 45, 290, 400, 45, 290)}
              fill="url(#flow-pres-pot)"
              opacity={getRibbonOpacity(["presencial", "potencial"])}
              className="transition-all duration-300 cursor-pointer hover:brightness-110"
              onClick={() => setActiveNode(activeNode === "presencial" ? null : "presencial")}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredRibbon({
                  title: "Presencial → Potencial Total",
                  monto: presencialTotal,
                  pct: pctPresencial,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => setHoveredRibbon(null)}
            >
              <title>{`Presencial → Potencial Total: ${money(presencialTotal)} (${pctPresencial}%)`}</title>
            </path>

            {/* 2. Online -> Potencial Total ($19.000) */}
            <path
              d={createSankeyRibbon(200, 315, 385, 400, 290, 360)}
              fill="url(#flow-onl-pot)"
              opacity={getRibbonOpacity(["online", "potencial"])}
              className="transition-all duration-300 cursor-pointer hover:brightness-110"
              onClick={() => setActiveNode(activeNode === "online" ? null : "online")}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredRibbon({
                  title: "Online (Rutinas) → Potencial Total",
                  monto: onlineTotal,
                  pct: pctOnline,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => setHoveredRibbon(null)}
            >
              <title>{`Online → Potencial Total: ${money(onlineTotal)} (${pctOnline}%)`}</title>
            </path>

            {/* 3. Potencial Total -> Cobrado Efectivo ($80.000) */}
            <path
              d={createSankeyRibbon(560, 45, 297, 760, 45, 297)}
              fill="url(#flow-pot-cob)"
              opacity={getRibbonOpacity(["cobrado", "potencial"])}
              className="transition-all duration-300 cursor-pointer hover:brightness-110"
              onClick={() => setActiveNode(activeNode === "cobrado" ? null : "cobrado")}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredRibbon({
                  title: "Potencial Total → Cobrado Efectivo",
                  monto: totalCobrado,
                  pct: pctCobrado,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => setHoveredRibbon(null)}
            >
              <title>{`Potencial Total → Cobrado Efectivo: ${money(totalCobrado)} (${pctCobrado.toFixed(1)}%)`}</title>
            </path>

            {/* 4. Potencial Total -> Por Cobrar / Deuda ($20.000) */}
            <path
              d={createSankeyRibbon(560, 297, 360, 760, 315, 385)}
              fill="url(#flow-pot-pen)"
              opacity={getRibbonOpacity(["pendiente", "potencial"])}
              className="transition-all duration-300 cursor-pointer hover:brightness-110"
              onClick={() => setActiveNode(activeNode === "pendiente" ? null : "pendiente")}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredRibbon({
                  title: "Potencial Total → Por Cobrar / Deuda",
                  monto: totalPendiente,
                  pct: pctPendiente,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => setHoveredRibbon(null)}
            >
              <title>{`Potencial Total → Por Cobrar: ${money(totalPendiente)} (${pctPendiente.toFixed(1)}%)`}</title>
            </path>

            {/* Nodos Columna 1 (Canales) */}
            {/* Nodo Presencial */}
            <g
              className="cursor-pointer transition-transform hover:scale-[1.01]"
              onClick={() => setActiveNode(activeNode === "presencial" ? null : "presencial")}
              data-testid="sankey-node-presencial"
            >
              <rect
                x="20"
                y="45"
                width="180"
                height="245"
                rx="8"
                fill="#312e81"
                stroke="#6366f1"
                strokeWidth={activeNode === "presencial" ? 2.5 : 1}
              />
              <text x="32" y="75" fill="#e0e7ff" fontSize="13" fontWeight="800">
                Presencial
              </text>
              <text x="32" y="98" fill="#a5b4fc" fontSize="15" fontWeight="900" fontFamily="monospace">
                {money(presencialTotal)}
              </text>
              <text x="32" y="118" fill="#c7d2fe" fontSize="10.5" fontWeight="500">
                {pctPresencial}% de la facturación
              </text>
              {/* Desglose funcional / boxeo */}
              <line x1="32" y1="135" x2="188" y2="135" stroke="#4338ca" strokeWidth="1" />
              <text x="32" y="155" fill="#e0e7ff" fontSize="11" fontWeight="600">
                Funcional: {money(data.efectivoCobrado.presencial.funcional + data.potencialPendiente.desgloseActividad.funcional)}
              </text>
              <text x="32" y="175" fill="#a5b4fc" fontSize="10">
                • Cobrado: {money(data.efectivoCobrado.presencial.funcional)}
              </text>
              <text x="32" y="193" fill="#fde68a" fontSize="10">
                • Pendiente: {money(data.potencialPendiente.desgloseActividad.funcional)}
              </text>

              <line x1="32" y1="210" x2="188" y2="210" stroke="#4338ca" strokeWidth="1" />
              <text x="32" y="230" fill="#e0e7ff" fontSize="11" fontWeight="600">
                Boxeo: {money(data.efectivoCobrado.presencial.boxeo + data.potencialPendiente.desgloseActividad.boxeo)}
              </text>
              <text x="32" y="250" fill="#a5b4fc" fontSize="10">
                • Cobrado: {money(data.efectivoCobrado.presencial.boxeo)}
              </text>
              <text x="32" y="268" fill="#fde68a" fontSize="10">
                • Pendiente: {money(data.potencialPendiente.desgloseActividad.boxeo)}
              </text>
            </g>

            {/* Nodo Online */}
            <g
              className="cursor-pointer transition-transform hover:scale-[1.01]"
              onClick={() => setActiveNode(activeNode === "online" ? null : "online")}
              data-testid="sankey-node-online"
            >
              <rect
                x="20"
                y="315"
                width="180"
                height="70"
                rx="8"
                fill="#0c4a6e"
                stroke="#0284c7"
                strokeWidth={activeNode === "online" ? 2.5 : 1}
              />
              <text x="32" y="340" fill="#e0f2fe" fontSize="13" fontWeight="800">
                Online (Rutinas)
              </text>
              <text x="32" y="362" fill="#7dd3fc" fontSize="15" fontWeight="900" fontFamily="monospace">
                {money(onlineTotal)}
              </text>
              <text x="32" y="378" fill="#bae6fd" fontSize="10.5" fontWeight="500">
                {pctOnline}% del total ({money(data.efectivoCobrado.online.rutinas)} cobrado)
              </text>
            </g>

            {/* Nodos Columna 2 (Facturación Consolidada) */}
            <g
              className="cursor-pointer transition-transform hover:scale-[1.01]"
              onClick={() => setActiveNode(activeNode === "potencial" ? null : "potencial")}
              data-testid="sankey-node-potencial"
            >
              <rect
                x="400"
                y="45"
                width="160"
                height="315"
                rx="8"
                fill="#1e1b4b"
                stroke="#6366f1"
                strokeWidth={activeNode === "potencial" ? 2.5 : 1.5}
              />
              <text x="415" y="80" fill="#e0e7ff" fontSize="14" fontWeight="800">
                Facturación Potencial
              </text>
              <text x="415" y="110" fill="#a5b4fc" fontSize="20" fontWeight="900" fontFamily="monospace">
                {money(totalPotencial)}
              </text>
              <text x="415" y="132" fill="#c7d2fe" fontSize="11" fontWeight="500">
                100% Contratos Activos
              </text>

              <line x1="415" y1="160" x2="545" y2="160" stroke="#4338ca" strokeWidth="1" />
              <text x="415" y="185" fill="#34d399" fontSize="12" fontWeight="700">
                Efectivizado: {pctCobrado.toFixed(0)}%
              </text>
              <text x="415" y="205" fill="#a7f3d0" fontSize="11" fontFamily="monospace">
                {money(totalCobrado)}
              </text>

              <line x1="415" y1="230" x2="545" y2="230" stroke="#4338ca" strokeWidth="1" />
              <text x="415" y="255" fill="#fbbf24" fontSize="12" fontWeight="700">
                En Mora: {pctPendiente.toFixed(0)}%
              </text>
              <text x="415" y="275" fill="#fde68a" fontSize="11" fontFamily="monospace">
                {money(totalPendiente)}
              </text>
            </g>

            {/* Nodos Columna 3 (Efectividad de Cobro) */}
            {/* Nodo Cobrado Efectivo */}
            <g
              className="cursor-pointer transition-transform hover:scale-[1.01]"
              onClick={() => setActiveNode(activeNode === "cobrado" ? null : "cobrado")}
              data-testid="sankey-node-cobrado"
            >
              <rect
                x="760"
                y="45"
                width="180"
                height="252"
                rx="8"
                fill="#064e3b"
                stroke="#10b981"
                strokeWidth={activeNode === "cobrado" ? 2.5 : 1}
              />
              <text x="775" y="75" fill="#d1fae5" fontSize="13" fontWeight="800">
                Cobrado Efectivo
              </text>
              <text x="775" y="100" fill="#6ee7b7" fontSize="18" fontWeight="900" fontFamily="monospace">
                {money(totalCobrado)}
              </text>
              <text x="775" y="120" fill="#a7f3d0" fontSize="11" fontWeight="600">
                {pctCobrado.toFixed(1)}% tasa efectividad
              </text>

              <line x1="775" y1="140" x2="925" y2="140" stroke="#047857" strokeWidth="1" />
              <text x="775" y="162" fill="#d1fae5" fontSize="11" fontWeight="600">
                • Funcional: {money(data.efectivoCobrado.presencial.funcional)}
              </text>
              <text x="775" y="184" fill="#d1fae5" fontSize="11" fontWeight="600">
                • Boxeo: {money(data.efectivoCobrado.presencial.boxeo)}
              </text>
              <text x="775" y="206" fill="#d1fae5" fontSize="11" fontWeight="600">
                • Rutinas: {money(data.efectivoCobrado.online.rutinas)}
              </text>
              <text x="775" y="235" fill="#6ee7b7" fontSize="10.5" fontWeight="500">
                Fondos acreditados
              </text>
            </g>

            {/* Nodo Por Cobrar (Deuda) */}
            <g
              className="cursor-pointer transition-transform hover:scale-[1.01]"
              onClick={() => setActiveNode(activeNode === "pendiente" ? null : "pendiente")}
              data-testid="sankey-node-pendiente"
            >
              <rect
                x="760"
                y="315"
                width="180"
                height="70"
                rx="8"
                fill="#78350f"
                stroke="#f59e0b"
                strokeWidth={activeNode === "pendiente" ? 2.5 : 1}
              />
              <text x="775" y="340" fill="#fef3c7" fontSize="13" fontWeight="800">
                Por Cobrar (Deuda)
              </text>
              <text x="775" y="362" fill="#fde68a" fontSize="16" fontWeight="900" fontFamily="monospace">
                {money(totalPendiente)}
              </text>
              <text x="775" y="378" fill="#fef08a" fontSize="10.5" fontWeight="500">
                {data.potencialPendiente.deudores.length} alumnos pendientes ({pctPendiente.toFixed(1)}%)
              </text>
            </g>
          </svg>
        </div>
      </div>

      {/* Barra de Acciones Rápidas (Cero info duplicada) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
          <span>Datos sincronizados con la cartera activa de Coach Studio.</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/studio/cobros"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
          >
            <span>Gestionar Cobros y Deudores</span>
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
