import * as React from "react";
import { Button } from "@/components/ui/button";

export interface SankeyDeudor {
  id: string;
  nombre: string;
  actividad: "FUNCIONAL" | "BOXEO" | "RUTINAS";
  monto: number;
  diasAtraso?: number;
}

export interface SankeyFlowData {
  potencialTotal: number;
  efectivoCobrado: {
    total: number;
    presencial: {
      total: number;
      funcional: number;
      boxeo: number;
    };
    online: {
      total: number;
      rutinas: number;
    };
  };
  potencialPendiente: {
    total: number;
    desgloseActividad: {
      funcional: number;
      boxeo: number;
      rutinas: number;
    };
    deudores: SankeyDeudor[];
  };
}

export const CANONICAL_SANKEY_DATA: SankeyFlowData = {
  potencialTotal: 100000,
  efectivoCobrado: {
    total: 80000,
    presencial: {
      total: 65000,
      funcional: 50000,
      boxeo: 15000,
    },
    online: {
      total: 15000,
      rutinas: 15000,
    },
  },
  potencialPendiente: {
    total: 20000,
    desgloseActividad: {
      funcional: 10000,
      boxeo: 5000,
      rutinas: 5000,
    },
    deudores: [
      { id: "deu-1", nombre: "Joaquín Paz", actividad: "FUNCIONAL", monto: 10000, diasAtraso: 14 },
      { id: "deu-2", nombre: "Gonzalo Peralta", actividad: "BOXEO", monto: 5000, diasAtraso: 8 },
      { id: "deu-3", nombre: "Facundo Medina", actividad: "RUTINAS", monto: 5000, diasAtraso: 5 },
    ],
  },
};

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

export interface StudioSankeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  data?: SankeyFlowData;
}

export function StudioSankeyModal({
  isOpen,
  onClose,
  data = CANONICAL_SANKEY_DATA,
}: StudioSankeyModalProps) {
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { potencialTotal, efectivoCobrado, potencialPendiente } = data;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sankey-modal-title"
      data-testid="sankey-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-4xl flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl my-auto overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-4 bg-muted/20">
          <div>
            <h2
              id="sankey-modal-title"
              className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
            >
              <span className="text-primary text-xl">🌊</span>
              <span>Diagrama de Sankey — Flujo de Ingresos</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Modelado de facturación potencial, efectivización y deudores por actividad
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cerrar modal de Sankey"
            data-testid="close-sankey-modal"
          >
            ✕
          </Button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-4 sm:p-6 space-y-6 overflow-x-auto">
          {/* Tarjetas de Resumen Rápido Superior */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/80 bg-background/50 p-3 shadow-xs">
              <span className="text-[11px] font-semibold text-muted-foreground block">
                Facturación Potencial Total
              </span>
              <span
                className="text-xl font-black text-foreground tabular-nums mt-1 block"
                data-testid="sankey-stat-potencial"
              >
                {money(potencialTotal)}
              </span>
              <span className="text-[10px] text-muted-foreground">100% de la cartera proyectada</span>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 shadow-xs">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                Efectivo Cobrado
              </span>
              <span
                className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-1 block"
                data-testid="sankey-stat-cobrado"
              >
                {money(efectivoCobrado.total)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {Math.round((efectivoCobrado.total / potencialTotal) * 100)}% de efectivización real
              </span>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 shadow-xs">
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block">
                Potencial Pendiente (Deudores)
              </span>
              <span
                className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums mt-1 block"
                data-testid="sankey-stat-pendiente"
              >
                {money(potencialPendiente.total)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {Math.round((potencialPendiente.total / potencialTotal) * 100)}% por cobrar en cartera
              </span>
            </div>
          </div>

          {/* Diagrama de Sankey en SVG Nativo Liviano */}
          <div
            className="rounded-xl border border-border bg-background p-4 shadow-inner overflow-hidden"
            data-testid="sankey-diagram"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <span>1. Origen</span>
              <span className="text-center">2. Bifurcación Estado</span>
              <span className="text-right">3. Desglose por Actividad</span>
            </div>

            <svg
              viewBox="0 0 760 350"
              className="w-full h-auto max-h-[360px] select-none"
              role="img"
              aria-label="Diagrama de Sankey de ingresos"
            >
              <defs>
                <linearGradient id="flow-potencial-cobrado" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.55" />
                </linearGradient>
                <linearGradient id="flow-potencial-pendiente" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.55" />
                </linearGradient>
                <linearGradient id="flow-cobrado-funcional" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.6" />
                </linearGradient>
                <linearGradient id="flow-cobrado-boxeo" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity="0.6" />
                </linearGradient>
                <linearGradient id="flow-cobrado-rutinas" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.6" />
                </linearGradient>
                <linearGradient id="flow-pendiente-funcional" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.6" />
                </linearGradient>
                <linearGradient id="flow-pendiente-boxeo" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity="0.6" />
                </linearGradient>
                <linearGradient id="flow-pendiente-rutinas" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#e11d48" stopOpacity="0.6" />
                </linearGradient>
              </defs>

              {/* Cintas de Flujo (Ribbons) */}
              {/* Nivel 1 -> Nivel 2 */}
              <path
                d={createSankeyRibbon(175, 40, 252, 285, 40, 252)}
                fill="url(#flow-potencial-cobrado)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Flujo: Potencial Total → Efectivo Cobrado (${money(efectivoCobrado.total)})`}</title>
              </path>

              <path
                d={createSankeyRibbon(175, 252, 310, 285, 266, 320)}
                fill="url(#flow-potencial-pendiente)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Flujo: Potencial Total → Potencial Pendiente (${money(potencialPendiente.total)})`}</title>
              </path>

              {/* Nivel 2 -> Nivel 3 (Desde Cobrado) */}
              <path
                d={createSankeyRibbon(445, 40, 168, 555, 40, 168)}
                fill="url(#flow-cobrado-funcional)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Cobrado → Presencial Funcional (${money(efectivoCobrado.presencial.funcional)})`}</title>
              </path>

              <path
                d={createSankeyRibbon(445, 168, 210, 555, 174, 216)}
                fill="url(#flow-cobrado-boxeo)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Cobrado → Presencial Boxeo (${money(efectivoCobrado.presencial.boxeo)})`}</title>
              </path>

              <path
                d={createSankeyRibbon(445, 210, 252, 555, 222, 260)}
                fill="url(#flow-cobrado-rutinas)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Cobrado → Online Rutinas (${money(efectivoCobrado.online.rutinas)})`}</title>
              </path>

              {/* Nivel 2 -> Nivel 3 (Desde Pendiente) */}
              <path
                d={createSankeyRibbon(445, 266, 294, 555, 268, 290)}
                fill="url(#flow-pendiente-funcional)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Pendiente → Deudores Funcional (${money(potencialPendiente.desgloseActividad.funcional)})`}</title>
              </path>

              <path
                d={createSankeyRibbon(445, 294, 307, 555, 294, 305)}
                fill="url(#flow-pendiente-boxeo)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Pendiente → Deudores Boxeo (${money(potencialPendiente.desgloseActividad.boxeo)})`}</title>
              </path>

              <path
                d={createSankeyRibbon(445, 307, 320, 555, 309, 320)}
                fill="url(#flow-pendiente-rutinas)"
                className="transition-opacity hover:opacity-85 cursor-pointer"
              >
                <title>{`Pendiente → Deudores Rutinas (${money(potencialPendiente.desgloseActividad.rutinas)})`}</title>
              </path>

              {/* NODOS (Columnas de Bloques) */}

              {/* Columna 1: Potencial Total */}
              <g
                data-testid="sankey-node-potencial"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode("potencial")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect
                  x="20"
                  y="40"
                  width="155"
                  height="270"
                  rx="10"
                  fill="#1e1b4b"
                  stroke="#6366f1"
                  strokeWidth="2"
                  className="transition-colors"
                />
                <text x="32" y="70" fill="#a5b4fc" fontSize="12" fontWeight="700">
                  Potencial Total
                </text>
                <text x="32" y="98" fill="#ffffff" fontSize="20" fontWeight="900" fontFamily="monospace">
                  {money(potencialTotal)}
                </text>
                <text x="32" y="122" fill="#94a3b8" fontSize="11">
                  100% Facturación
                </text>
                <text x="32" y="140" fill="#64748b" fontSize="10">
                  Cartera activa completa
                </text>
              </g>

              {/* Columna 2: Efectivo Cobrado */}
              <g
                data-testid="sankey-node-cobrado"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode("cobrado")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect
                  x="285"
                  y="40"
                  width="160"
                  height="212"
                  rx="10"
                  fill="#064e3b"
                  stroke="#10b981"
                  strokeWidth="2"
                />
                <text x="297" y="70" fill="#6ee7b7" fontSize="12" fontWeight="700">
                  Efectivo Cobrado
                </text>
                <text x="297" y="98" fill="#ffffff" fontSize="20" fontWeight="900" fontFamily="monospace">
                  {money(efectivoCobrado.total)}
                </text>
                <text x="297" y="122" fill="#a7f3d0" fontSize="11">
                  80% del Potencial
                </text>
                <text x="297" y="142" fill="#6ee7b7" fontSize="10">
                  Presencial + Online
                </text>
              </g>

              {/* Columna 2: Potencial Pendiente */}
              <g
                data-testid="sankey-node-pendiente"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredNode("pendiente")}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <rect
                  x="285"
                  y="266"
                  width="160"
                  height="54"
                  rx="8"
                  fill="#451a03"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                />
                <text x="297" y="286" fill="#fde68a" fontSize="11" fontWeight="700">
                  Potencial Pendiente
                </text>
                <text x="297" y="306" fill="#ffffff" fontSize="15" fontWeight="900" fontFamily="monospace">
                  {money(potencialPendiente.total)}
                </text>
              </g>

              {/* Columna 3: Desglose Cobrado */}
              {/* Presencial Funcional */}
              <g data-testid="sankey-node-presencial-funcional">
                <rect
                  x="555"
                  y="40"
                  width="185"
                  height="128"
                  rx="8"
                  fill="#065f46"
                  stroke="#34d399"
                  strokeWidth="1.5"
                />
                <text x="567" y="65" fill="#a7f3d0" fontSize="11" fontWeight="700">
                  Presencial · Funcional
                </text>
                <text x="567" y="90" fill="#ffffff" fontSize="16" fontWeight="900" fontFamily="monospace">
                  {money(efectivoCobrado.presencial.funcional)}
                </text>
                <text x="567" y="110" fill="#6ee7b7" fontSize="10">
                  Cuotas pagadas presenciales
                </text>
              </g>

              {/* Presencial Boxeo */}
              <g data-testid="sankey-node-presencial-boxeo">
                <rect
                  x="555"
                  y="174"
                  width="185"
                  height="42"
                  rx="6"
                  fill="#115e59"
                  stroke="#2dd4bf"
                  strokeWidth="1.5"
                />
                <text x="567" y="192" fill="#99f6e4" fontSize="10" fontWeight="700">
                  Presencial · Boxeo
                </text>
                <text x="567" y="208" fill="#ffffff" fontSize="13" fontWeight="800" fontFamily="monospace">
                  {money(efectivoCobrado.presencial.boxeo)}
                </text>
              </g>

              {/* Online Rutinas */}
              <g data-testid="sankey-node-online-rutinas">
                <rect
                  x="555"
                  y="222"
                  width="185"
                  height="38"
                  rx="6"
                  fill="#075985"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <text x="567" y="238" fill="#bae6fd" fontSize="10" fontWeight="700">
                  Online · Rutinas
                </text>
                <text x="567" y="253" fill="#ffffff" fontSize="13" fontWeight="800" fontFamily="monospace">
                  {money(efectivoCobrado.online.rutinas)}
                </text>
              </g>

              {/* Columna 3: Desglose Deudores Pendientes por Actividad */}
              {/* Deudores Funcional */}
              <g data-testid="sankey-node-pendiente-funcional">
                <rect
                  x="555"
                  y="268"
                  width="185"
                  height="22"
                  rx="4"
                  fill="#78350f"
                  stroke="#fbbf24"
                  strokeWidth="1"
                />
                <text x="563" y="283" fill="#fef3c7" fontSize="9.5" fontWeight="600">
                  Deudores Funcional: {money(potencialPendiente.desgloseActividad.funcional)}
                </text>
              </g>

              {/* Deudores Boxeo */}
              <g data-testid="sankey-node-pendiente-boxeo">
                <rect
                  x="555"
                  y="294"
                  width="185"
                  height="11"
                  rx="3"
                  fill="#7c2d12"
                  stroke="#fb923c"
                  strokeWidth="1"
                />
                <text x="563" y="303" fill="#ffedd5" fontSize="8.5" fontWeight="600">
                  Deudores Boxeo: {money(potencialPendiente.desgloseActividad.boxeo)}
                </text>
              </g>

              {/* Deudores Rutinas */}
              <g data-testid="sankey-node-pendiente-rutinas">
                <rect
                  x="555"
                  y="309"
                  width="185"
                  height="11"
                  rx="3"
                  fill="#881337"
                  stroke="#fb7185"
                  strokeWidth="1"
                />
                <text x="563" y="318" fill="#ffe4e6" fontSize="8.5" fontWeight="600">
                  Deudores Rutinas: {money(potencialPendiente.desgloseActividad.rutinas)}
                </text>
              </g>
            </svg>
          </div>

          {/* Bloque Detallado Inferior: Cobrado Desagregado & Deudores por Actividad */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="sankey-summary">
            {/* Bloque Cobrado Desagregado */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
                  Efectivo Cobrado: {money(efectivoCobrado.total)}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Cobranza Efectivizada
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {/* Presencial */}
                <div className="rounded-lg bg-muted/40 p-2.5 space-y-1.5">
                  <div className="flex justify-between items-center font-bold text-foreground">
                    <span>Presencial</span>
                    <span className="tabular-nums">{money(efectivoCobrado.presencial.total)}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-[11px] pl-2 border-l-2 border-emerald-500/40">
                    <span>Funcional</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {money(efectivoCobrado.presencial.funcional)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-[11px] pl-2 border-l-2 border-emerald-500/40">
                    <span>Boxeo</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {money(efectivoCobrado.presencial.boxeo)}
                    </span>
                  </div>
                </div>

                {/* Online */}
                <div className="rounded-lg bg-muted/40 p-2.5 space-y-1.5">
                  <div className="flex justify-between items-center font-bold text-foreground">
                    <span>Online</span>
                    <span className="tabular-nums">{money(efectivoCobrado.online.total)}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-[11px] pl-2 border-l-2 border-sky-500/40">
                    <span>Rutinas</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {money(efectivoCobrado.online.rutinas)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque Pendiente: Desglose de Deudores por Actividad */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />
                  Potencial Pendiente: {money(potencialPendiente.total)}
                </span>
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Desglose de Deudores
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {/* Desglose de deudores por actividad */}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-1.5">
                    <span className="text-[10px] text-muted-foreground block">Funcional</span>
                    <span className="font-bold text-foreground text-xs tabular-nums">
                      {money(potencialPendiente.desgloseActividad.funcional)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-1.5">
                    <span className="text-[10px] text-muted-foreground block">Boxeo</span>
                    <span className="font-bold text-foreground text-xs tabular-nums">
                      {money(potencialPendiente.desgloseActividad.boxeo)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-1.5">
                    <span className="text-[10px] text-muted-foreground block">Rutinas</span>
                    <span className="font-bold text-foreground text-xs tabular-nums">
                      {money(potencialPendiente.desgloseActividad.rutinas)}
                    </span>
                  </div>
                </div>

                {/* Lista de deudores */}
                <div className="rounded-lg bg-muted/40 p-2 space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Atletas con saldo vencido o cuota en mora:
                  </span>
                  {potencialPendiente.deudores.map((deudor) => (
                    <div
                      key={deudor.id}
                      className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-background/60 text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{deudor.nombre}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-muted-foreground">
                          {deudor.actividad === "RUTINAS" ? "Rutina online" : deudor.actividad}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-foreground tabular-nums">
                          {money(deudor.monto)}
                        </span>
                        {deudor.diasAtraso && (
                          <span className="text-[10px] text-amber-500 ml-1">
                            ({deudor.diasAtraso}d)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border/80 px-5 py-3 bg-muted/20">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-semibold"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
