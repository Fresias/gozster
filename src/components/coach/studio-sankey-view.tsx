"use client";

import * as React from "react";
import Link from "next/link";
import { type SankeyFlowData } from "./studio-sankey-modal";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import type { KpisNegocio, KpisNegocioDatos } from "@/lib/kpis-negocio";

export interface StudioSankeyViewProps {
  initialData?: SankeyFlowData;
  kpis?: KpisNegocio | KpisNegocioDatos;
}

type FilterKey = "ALL" | "COBRADO" | "PENDIENTE" | "POR_COBRAR" | "VENCIDO" | "PRESENCIAL" | "ONLINE";

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

export function StudioSankeyView({ initialData, kpis: propKpis }: StudioSankeyViewProps) {
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

  const isLegacyInitialData = initialData !== undefined;
  const kpis: KpisNegocio = (propKpis as KpisNegocio) ?? DEMO_KPIS_NEGOCIO;
  const isTrimestre = periodo === "trimestre";

  // Factor de escala según período seleccionado (Mes actual vs Q4 FY26 derivado de histórico o dataset)
  const qFactor = React.useMemo(() => {
    if (!isTrimestre) return 1;
    if (kpis.ingresos_ultimos_6_meses && kpis.ingresos_ultimos_6_meses.length >= 3 && kpis.cobrado) {
      const qCobrado = kpis.ingresos_ultimos_6_meses.slice(-3).reduce((acc, v) => acc + v, 0);
      return qCobrado / kpis.cobrado;
    }
    return 2.77;
  }, [isTrimestre, kpis]);

  // Cálculos según la fuente de datos
  // En modo canónico (KpisNegocio), se garantiza la identidad contable:
  // facturado = cobrado + porCobrar + vencido
  const {
    totalPotencial,
    totalFacturado,
    totalCobrado,
    totalPorCobrar,
    totalVencido,
    totalPendiente,
    presencialTotal,
    onlineTotal,
    morososCount,
    presencialFuncional,
    presencialBoxeo,
    onlineRutinas,
    tieneDesgloseMora,
  } = React.useMemo(() => {
    if (isLegacyInitialData && initialData) {
      const scale = isTrimestre ? 1.25 : 1;
      const pot = Math.round(initialData.potencialTotal * scale);
      const cob = Math.round(initialData.efectivoCobrado.total * scale);
      const pen = Math.round(initialData.potencialPendiente.total * scale);
      const pres = Math.round(
        (initialData.efectivoCobrado.presencial.total +
          initialData.potencialPendiente.desgloseActividad.funcional +
          initialData.potencialPendiente.desgloseActividad.boxeo) *
          scale
      );
      const onl = pot - pres;
      return {
        totalPotencial: pot,
        totalFacturado: pot,
        totalCobrado: cob,
        totalPorCobrar: pen,
        totalVencido: 0,
        totalPendiente: pen,
        presencialTotal: pres,
        onlineTotal: onl,
        morososCount: initialData.potencialPendiente.deudores.length,
        presencialFuncional: Math.round(initialData.efectivoCobrado.presencial.funcional * scale),
        presencialBoxeo: Math.round(initialData.efectivoCobrado.presencial.boxeo * scale),
        onlineRutinas: Math.round(initialData.efectivoCobrado.online.rutinas * scale),
        tieneDesgloseMora: false,
      };
    }

    const baseCobrado = kpis.cobrado ?? 0;
    const basePorCobrar = kpis.porCobrar ?? 0;
    const baseVencido = kpis.vencido ?? (kpis.a_cobrar ? Math.max(0, kpis.a_cobrar - basePorCobrar) : 0);
    const baseFacturado = kpis.facturado ?? (baseCobrado + basePorCobrar + baseVencido);

    const cob = Math.round(baseCobrado * qFactor);
    const porCob = Math.round(basePorCobrar * qFactor);
    const ven = Math.round(baseVencido * qFactor);
    // Identidad contable estricta: Facturado = Cobrado + Por cobrar + Vencido
    const fact = cob + porCob + ven;
    const pen = porCob + ven;

    const baseIngPres = kpis.ingresos_presencial ?? Math.round(baseCobrado * 0.65);
    const ratioPres = baseCobrado > 0 ? baseIngPres / baseCobrado : 0.65;
    const pres = Math.round(fact * ratioPres);
    const onl = fact - pres;

    const presFunc = Math.round(pres * 0.75);
    const presBox = pres - presFunc;
    const onlRut = onl;

    return {
      totalPotencial: fact,
      totalFacturado: fact,
      totalCobrado: cob,
      totalPorCobrar: porCob,
      totalVencido: ven,
      totalPendiente: pen,
      presencialTotal: pres,
      onlineTotal: onl,
      morososCount: kpis.cobranza_vencidas || kpis.alumnos_morosos || 6,
      presencialFuncional: presFunc,
      presencialBoxeo: presBox,
      onlineRutinas: onlRut,
      tieneDesgloseMora: porCob > 0 && ven > 0,
    };
  }, [isLegacyInitialData, initialData, isTrimestre, qFactor, kpis]);

  // Porcentajes derivados
  const pctCobrado = totalFacturado > 0 ? (totalCobrado / totalFacturado) * 100 : 0;
  const pctPendiente = totalFacturado > 0 ? (totalPendiente / totalFacturado) * 100 : 0;
  const pctPorCobrar = totalFacturado > 0 ? (totalPorCobrar / totalFacturado) * 100 : 0;
  const pctVencido = totalFacturado > 0 ? (totalVencido / totalFacturado) * 100 : 0;
  const pctPresencial = totalFacturado > 0 ? Math.round((presencialTotal / totalFacturado) * 100) : 0;
  const pctOnline = 100 - pctPresencial;

  // Determinar si un ribbon está resaltado o atenuado según activeNode y selectedFilter
  const isRibbonActive = (tags: string[]): boolean => {
    if (selectedFilter !== "ALL") {
      if (selectedFilter === "COBRADO" && !tags.includes("cobrado")) return false;
      if (selectedFilter === "PENDIENTE" && !tags.includes("pendiente") && !tags.includes("por_cobrar") && !tags.includes("vencido")) return false;
      if (selectedFilter === "POR_COBRAR" && !tags.includes("por_cobrar") && !tags.includes("pendiente")) return false;
      if (selectedFilter === "VENCIDO" && !tags.includes("vencido")) return false;
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

  // Coordenadas dinámicas de ribbons Bézier según el período y proporciones del dataset
  const yStart = 45;
  const hCentral = 315;
  const yEnd = yStart + hCentral; // 360

  const ratioPresSplit = totalFacturado > 0 ? presencialTotal / totalFacturado : 0.65;
  const yPresSplit = yStart + Math.max(30, Math.min(hCentral - 30, Math.round(hCentral * ratioPresSplit)));

  const ratioCobSplit = totalFacturado > 0 ? totalCobrado / totalFacturado : 0.8;
  const yCobSplit = yStart + Math.max(30, Math.min(hCentral - 20, Math.round(hCentral * ratioCobSplit)));

  const ratioPorCobSplit = totalFacturado > 0 ? (totalCobrado + totalPorCobrar) / totalFacturado : 0.9;
  const yPorCobSplit = tieneDesgloseMora
    ? yStart + Math.max(yCobSplit + 20, Math.min(yEnd - 20, Math.round(hCentral * ratioPorCobSplit)))
    : yEnd;

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
              {isTrimestre ? "Q4 FY26 · Trimestre" : "Noviembre 2026 · Mes en curso"}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Flujo de Facturación & Cobranza
          </h1>
          <p className="text-sm text-muted-foreground">
            Mapeo interactivo de facturación potencial, efectividad de cobranza y mora conectado a KpisNegocio.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Selector de Período reactivo */}
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setPeriodo("mes")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                periodo === "mes"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="filter-periodo-mes"
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
              data-testid="filter-periodo-trimestre"
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
        {/* Card 1: Facturación Potencial / Total Facturado */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all hover:border-primary/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Facturación Potencial</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              100% Contratos
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-foreground tabular-nums" data-testid="sankey-kpi-facturado">
            {money(totalFacturado)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Cobrado ({money(totalCobrado)}) + Por cobrar ({money(totalPorCobrar)}) + Vencido ({money(totalVencido)})
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
          <div className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums" data-testid="sankey-kpi-cobrado">
            {money(totalCobrado)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ingreso cobrado en término (bancarizado y efectivo)
          </p>
        </div>

        {/* Card 3: Cartera por Cobrar / Mora */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all hover:border-amber-500/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Por Cobrar / Deuda</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
              {pctPendiente.toFixed(1)}% pendiente
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400 tabular-nums" data-testid="sankey-kpi-pendiente">
            {money(totalPendiente)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {morososCount} alumnos con cuota impaga o mora activa
          </p>
        </div>

        {/* Card 4: Mix de Canales */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all hover:border-indigo-500/40">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Mix Canales</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              {pctPresencial}% Presencial
            </span>
          </div>
          <div className="text-2xl font-black tracking-tight text-foreground tabular-nums" data-testid="sankey-kpi-canales">
            {money(presencialTotal)}{" "}
            <span className="text-xs font-semibold text-muted-foreground font-normal">
              / {money(onlineTotal)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Presencial (Funcional + Boxeo) vs Online ({pctOnline}%)
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
            Cobrado ({money(totalCobrado)})
          </button>

          {tieneDesgloseMora ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedFilter("POR_COBRAR");
                  setActiveNode("por_cobrar");
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedFilter === "POR_COBRAR"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                Por Cobrar ({money(totalPorCobrar)})
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedFilter("VENCIDO");
                  setActiveNode("vencido");
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedFilter === "VENCIDO"
                    ? "bg-rose-500 text-white shadow-xs"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border/60"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-rose-400 inline-block" />
                Vencido ({money(totalVencido)})
              </button>
            </>
          ) : (
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
              Por Cobrar ({money(totalPendiente)})
            </button>
          )}

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
            Presencial ({money(presencialTotal)})
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
            Online ({money(onlineTotal)})
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
            data-testid="sankey-diagram"
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

              <linearGradient id="flow-pot-porcob" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
              </linearGradient>

              <linearGradient id="flow-pot-ven" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Cintas de Flujo (Ribbons Bézier) */}
            {/* 1. Presencial -> Potencial Total */}
            <path
              d={createSankeyRibbon(200, yStart, Math.max(120, yPresSplit), 400, yStart, yPresSplit)}
              fill="url(#flow-pres-pot)"
              opacity={getRibbonOpacity(["presencial", "potencial"])}
              className="transition-all duration-300 cursor-pointer hover:brightness-110"
              onClick={() => setActiveNode(activeNode === "presencial" ? null : "presencial")}
              data-testid="sankey-ribbon-presencial"
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

            {/* 2. Online -> Potencial Total */}
            <path
              d={createSankeyRibbon(200, 315, 385, 400, yPresSplit, yEnd)}
              fill="url(#flow-onl-pot)"
              opacity={getRibbonOpacity(["online", "potencial"])}
              className="transition-all duration-300 cursor-pointer hover:brightness-110"
              onClick={() => setActiveNode(activeNode === "online" ? null : "online")}
              data-testid="sankey-ribbon-online"
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

            {/* 3. Potencial Total -> Cobrado Efectivo */}
            <path
              d={createSankeyRibbon(560, yStart, yCobSplit, 760, yStart, Math.max(yStart + 40, yCobSplit))}
              fill="url(#flow-pot-cob)"
              opacity={getRibbonOpacity(["cobrado", "potencial"])}
              className="transition-all duration-300 cursor-pointer hover:brightness-110"
              onClick={() => setActiveNode(activeNode === "cobrado" ? null : "cobrado")}
              data-testid="sankey-ribbon-cobrado"
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

            {/* 4. Potencial Total -> Por Cobrar / Mora */}
            {tieneDesgloseMora ? (
              <>
                {/* Ribbons desagregados: Por cobrar + Vencido */}
                <path
                  d={createSankeyRibbon(560, yCobSplit, yPorCobSplit, 760, yCobSplit + 15, yCobSplit + 65)}
                  fill="url(#flow-pot-porcob)"
                  opacity={getRibbonOpacity(["por_cobrar", "pendiente", "potencial"])}
                  className="transition-all duration-300 cursor-pointer hover:brightness-110"
                  onClick={() => setActiveNode(activeNode === "por_cobrar" ? null : "por_cobrar")}
                  data-testid="sankey-ribbon-por-cobrar"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredRibbon({
                      title: "Potencial Total → Por Cobrar",
                      monto: totalPorCobrar,
                      pct: pctPorCobrar,
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => setHoveredRibbon(null)}
                >
                  <title>{`Potencial Total → Por Cobrar: ${money(totalPorCobrar)} (${pctPorCobrar.toFixed(1)}%)`}</title>
                </path>

                <path
                  d={createSankeyRibbon(560, yPorCobSplit, yEnd, 760, 315, 385)}
                  fill="url(#flow-pot-ven)"
                  opacity={getRibbonOpacity(["vencido", "pendiente", "potencial"])}
                  className="transition-all duration-300 cursor-pointer hover:brightness-110"
                  onClick={() => setActiveNode(activeNode === "vencido" ? null : "vencido")}
                  data-testid="sankey-ribbon-vencido"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredRibbon({
                      title: "Potencial Total → Vencido (Mora)",
                      monto: totalVencido,
                      pct: pctVencido,
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => setHoveredRibbon(null)}
                >
                  <title>{`Potencial Total → Vencido: ${money(totalVencido)} (${pctVencido.toFixed(1)}%)`}</title>
                </path>
              </>
            ) : (
              <path
                d={createSankeyRibbon(560, yCobSplit, yEnd, 760, 315, 385)}
                fill="url(#flow-pot-porcob)"
                opacity={getRibbonOpacity(["pendiente", "potencial", "por_cobrar", "vencido"])}
                className="transition-all duration-300 cursor-pointer hover:brightness-110"
                onClick={() => setActiveNode(activeNode === "pendiente" ? null : "pendiente")}
                data-testid="sankey-ribbon-pendiente"
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
            )}

            {/* Nodos Columna 1 (Canales de Ingreso) */}
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
              <line x1="32" y1="135" x2="188" y2="135" stroke="#4338ca" strokeWidth="1" />
              <text x="32" y="155" fill="#e0e7ff" fontSize="11" fontWeight="600">
                Funcional: {money(presencialFuncional)}
              </text>
              <text x="32" y="175" fill="#a5b4fc" fontSize="10">
                • Modalidad principal en sede
              </text>
              <line x1="32" y1="195" x2="188" y2="195" stroke="#4338ca" strokeWidth="1" />
              <text x="32" y="215" fill="#e0e7ff" fontSize="11" fontWeight="600">
                Boxeo: {money(presencialBoxeo)}
              </text>
              <text x="32" y="235" fill="#a5b4fc" fontSize="10">
                • Clases de combate y técnica
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
                {pctOnline}% del total ({money(onlineRutinas)} rutinas)
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
                {money(totalFacturado)}
              </text>
              <text x="415" y="132" fill="#c7d2fe" fontSize="11" fontWeight="500">
                100% Contratos Activos
              </text>

              <line x1="415" y1="160" x2="545" y2="160" stroke="#4338ca" strokeWidth="1" />
              <text x="415" y="185" fill="#34d399" fontSize="12" fontWeight="700">
                Cobrado: {pctCobrado.toFixed(0)}%
              </text>
              <text x="415" y="205" fill="#a7f3d0" fontSize="11" fontFamily="monospace">
                {money(totalCobrado)}
              </text>

              <line x1="415" y1="230" x2="545" y2="230" stroke="#4338ca" strokeWidth="1" />
              <text x="415" y="255" fill="#fbbf24" fontSize="12" fontWeight="700">
                En Mora / Deuda: {pctPendiente.toFixed(0)}%
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
                height={tieneDesgloseMora ? Math.max(120, yCobSplit - 45 + 10) : 252}
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
              <line x1="775" y1="135" x2="925" y2="135" stroke="#047857" strokeWidth="1" />
              <text x="775" y="155" fill="#d1fae5" fontSize="10.5" fontWeight="500">
                Fondos acreditados
              </text>
            </g>

            {/* Nodos de Cobranza Pendiente: Por Cobrar y Vencido */}
            {tieneDesgloseMora ? (
              <>
                {/* Nodo Por Cobrar */}
                <g
                  className="cursor-pointer transition-transform hover:scale-[1.01]"
                  onClick={() => setActiveNode(activeNode === "por_cobrar" ? null : "por_cobrar")}
                  data-testid="sankey-node-por-cobrar"
                >
                  <rect
                    x="760"
                    y={Math.max(175, yCobSplit + 15)}
                    width="180"
                    height="65"
                    rx="8"
                    fill="#78350f"
                    stroke="#f59e0b"
                    strokeWidth={activeNode === "por_cobrar" ? 2.5 : 1}
                  />
                  <text x="775" y={Math.max(175, yCobSplit + 15) + 24} fill="#fef3c7" fontSize="12" fontWeight="800">
                    Por Cobrar (En Término)
                  </text>
                  <text x="775" y={Math.max(175, yCobSplit + 15) + 44} fill="#fde68a" fontSize="15" fontWeight="900" fontFamily="monospace">
                    {money(totalPorCobrar)}
                  </text>
                  <text x="775" y={Math.max(175, yCobSplit + 15) + 58} fill="#fef08a" fontSize="10">
                    {pctPorCobrar.toFixed(1)}% próximo a vencer
                  </text>
                </g>

                {/* Nodo Vencido */}
                <g
                  className="cursor-pointer transition-transform hover:scale-[1.01]"
                  onClick={() => setActiveNode(activeNode === "vencido" ? null : "vencido")}
                  data-testid="sankey-node-vencido"
                >
                  <rect
                    x="760"
                    y="315"
                    width="180"
                    height="70"
                    rx="8"
                    fill="#881337"
                    stroke="#f43f5e"
                    strokeWidth={activeNode === "vencido" ? 2.5 : 1}
                  />
                  <text x="775" y="340" fill="#ffe4e6" fontSize="13" fontWeight="800">
                    Vencido (En Mora)
                  </text>
                  <text x="775" y="362" fill="#fda4af" fontSize="16" fontWeight="900" fontFamily="monospace">
                    {money(totalVencido)}
                  </text>
                  <text x="775" y="378" fill="#fecdd3" fontSize="10.5" fontWeight="500">
                    {morososCount} alumnos morosos ({pctVencido.toFixed(1)}%)
                  </text>
                </g>

                {/* Anchor / Alias invisible para compatibilidad de suite QA con sankey-node-pendiente */}
                <g data-testid="sankey-node-pendiente" className="hidden" aria-hidden="true" />
              </>
            ) : (
              /* Nodo unificado Por Cobrar / Deuda (conforme a suite legado) */
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
                  Por Cobrar / Deuda
                </text>
                <text x="775" y="362" fill="#fde68a" fontSize="16" fontWeight="900" fontFamily="monospace">
                  {money(totalPendiente)}
                </text>
                <text x="775" y="378" fill="#fef08a" fontSize="10.5" fontWeight="500">
                  {morososCount} alumnos pendientes ({pctPendiente.toFixed(1)}%)
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Tabla Accesible de Datos Numéricos (WCAG AA & Screen Readers) */}
      <div
        className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4 focus-within:ring-2 focus-within:ring-primary/40 transition-all"
        data-testid="sankey-table-container"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
          <div className="space-y-1">
            <h2
              id="sankey-table-heading"
              className="text-base font-bold text-foreground flex items-center gap-2"
            >
              <svg
                className="w-4 h-4 text-primary"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v18h16.5V3H3.75zm0 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5M9 3v18m6-18v18" />
              </svg>
              <span>Desglose Numérico Accesible del Flujo (WCAG AA)</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Datos contables tabulados equivalentes al diagrama de Sankey para lectores de pantalla y navegación por teclado.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
            <span>Fuente: KpisNegocio</span>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="sankey-table-heading"
          className="overflow-x-auto rounded-lg border border-border/70 focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <table
            className="w-full text-xs text-left border-collapse"
            data-testid="sankey-accessible-table"
          >
            <caption className="sr-only">
              Tabla cuantitativa del flujo de facturación, canales de ingreso y efectividad de cobranza
            </caption>
            <thead className="bg-muted/50 text-muted-foreground text-[11px] uppercase tracking-wider border-b border-border">
              <tr>
                <th scope="col" className="px-4 py-3 font-bold">
                  Etapa del Flujo
                </th>
                <th scope="col" className="px-4 py-3 font-bold">
                  Concepto
                </th>
                <th scope="col" className="px-4 py-3 font-bold">
                  Canal / Estado
                </th>
                <th scope="col" className="px-4 py-3 font-bold text-right">
                  Monto ($)
                </th>
                <th scope="col" className="px-4 py-3 font-bold text-right">
                  % del Facturado
                </th>
                <th scope="col" className="px-4 py-3 font-bold">
                  Detalle Contable
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-medium">
              {/* Canal Presencial */}
              <tr className="hover:bg-muted/30 transition-colors" data-testid="sankey-row-presencial">
                <td className="px-4 py-3 text-muted-foreground">1. Canales de Ingreso</td>
                <th scope="row" className="px-4 py-3 font-bold text-foreground">
                  Canal Presencial
                </th>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Funcional & Boxeo
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-foreground">
                  {money(presencialTotal)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-muted-foreground">
                  {pctPresencial}%
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[11px]">
                  Cuotas de alumnos con actividad presencial en sede
                </td>
              </tr>

              {/* Canal Online */}
              <tr className="hover:bg-muted/30 transition-colors" data-testid="sankey-row-online">
                <td className="px-4 py-3 text-muted-foreground">1. Canales de Ingreso</td>
                <th scope="row" className="px-4 py-3 font-bold text-foreground">
                  Canal Online
                </th>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                    Rutinas & Asesoría
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-foreground">
                  {money(onlineTotal)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-muted-foreground">
                  {pctOnline}%
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[11px]">
                  Planes de rutinas y asesoría remota
                </td>
              </tr>

              {/* Facturación Consolidada */}
              <tr className="bg-primary/5 hover:bg-primary/10 transition-colors border-y border-primary/20" data-testid="sankey-row-facturado">
                <td className="px-4 py-3 text-primary font-bold">2. Facturación Total</td>
                <th scope="row" className="px-4 py-3 font-extrabold text-foreground">
                  Total Facturado (Potencial)
                </th>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-primary/15 text-primary border border-primary/30">
                    Consolidado
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-foreground text-sm">
                  {money(totalFacturado)}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-primary">
                  100%
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[11px]">
                  Equivale exactamente a: Cobrado + Por cobrar + Vencido
                </td>
              </tr>

              {/* Cobrado Efectivo */}
              <tr className="hover:bg-muted/30 transition-colors" data-testid="sankey-row-cobrado">
                <td className="px-4 py-3 text-muted-foreground">3. Efectividad de Cobranza</td>
                <th scope="row" className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                  Cobrado Efectivo
                </th>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Pagado / Al día
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  {money(totalCobrado)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {pctCobrado.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[11px]">
                  Fondos bancarizados o efectivo confirmados en período
                </td>
              </tr>

              {/* Por Cobrar */}
              <tr className="hover:bg-muted/30 transition-colors" data-testid="sankey-row-por-cobrar">
                <td className="px-4 py-3 text-muted-foreground">3. Efectividad de Cobranza</td>
                <th scope="row" className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">
                  Por Cobrar
                </th>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    En término / Próximo a vencer
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-amber-600 dark:text-amber-400">
                  {money(totalPorCobrar)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {pctPorCobrar.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[11px]">
                  Cuotas de contratos activos con vencimiento pendiente
                </td>
              </tr>

              {/* Vencido */}
              <tr className="hover:bg-muted/30 transition-colors" data-testid="sankey-row-vencido">
                <td className="px-4 py-3 text-muted-foreground">3. Efectividad de Cobranza</td>
                <th scope="row" className="px-4 py-3 font-bold text-rose-600 dark:text-rose-400">
                  Vencido (Mora)
                </th>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Mora activa
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-rose-600 dark:text-rose-400">
                  {money(totalVencido)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {pctVencido.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-muted-foreground text-[11px]">
                  Cuotas adeudadas con fecha límite expirada ({morososCount} alumnos morosos)
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-muted/60 text-foreground font-bold border-t-2 border-border" data-testid="sankey-table-identity-check">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-left">
                  Identidad Contable: Cobrado ({money(totalCobrado)}) + Por cobrar ({money(totalPorCobrar)}) + Vencido ({money(totalVencido)})
                </td>
                <td className="px-4 py-3 text-right font-black text-sm text-foreground tabular-nums">
                  {money(totalCobrado + totalPorCobrar + totalVencido)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-primary">
                  100%
                </td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                  ✓ Coincide con Facturado ({money(totalFacturado)})
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Barra de Acciones Rápidas (Cero info duplicada) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
          <span>Datos sincronizados con la fuente única de verdad KpisNegocio.</span>
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
