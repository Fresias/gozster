import * as React from "react";
import type { KpisNegocio } from "@/services/coach-demo-dataset";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { supabase as defaultSupabase } from "@/lib/supabase/client";
import {
  calcularPeriodoMesEnCurso,
  mapearRpcAKpis,
  type KpisNegocioDatos,
} from "@/lib/kpis-negocio";

export interface BusinessKpiStripProps {
  kpis?: KpisNegocio | KpisNegocioDatos;
  /** Nombres de los alumnos sin entrenar +7 días (para la pila de avatares). */
  sinEntrenarNombres?: string[];
  /** Alumnos activos sin rutina (línea de apoyo de la tarjeta Activos). */
  sinRutina?: number;
  onSinEntrenarClick?: () => void;
  onAsignarClick?: () => void;
  className?: string;
  alumnos?: { id: string; nombre_completo: string }[];
  /** Permite forzar modo testeo explícito */
  isTestMode?: boolean;
  /** Permite forzar estado de error (para tests o fallos) */
  error?: boolean;
  /** Cliente opcional para tests o inyección de dependencias */
  supabaseClient?: any;
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const money = (n: number) => `$${pesos.format(n)}`;

const CARD =
  "rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.4),0_2px_6px_rgba(0,0,0,.25)] hover:shadow-[0_2px_4px_rgba(0,0,0,.45),0_6px_14px_rgba(0,0,0,.3)] transition-shadow";

function Header({ label, icon, warn }: { label: string; icon: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-10 w-10 rounded-xl grid place-items-center ${
          warn ? "bg-amber-400/10 text-amber-300" : "bg-primary/10 text-primary"
        }`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {icon}
        </svg>
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full text-primary" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const iniciales = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function BusinessKpiStripSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-testid="business-kpi-strip"
      className={`grid grid-cols-2 min-[1700px]:grid-cols-4 gap-4 ${className ?? ""}`}
    >
      <div className={CARD} data-testid="kpi-skeleton-ingresos">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-foreground/10 animate-pulse" />
          <div className="h-4 w-28 rounded bg-foreground/10 animate-pulse" />
        </div>
        <div className="mt-3 h-7 w-32 rounded bg-foreground/10 animate-pulse" />
        <div className="mt-3 h-8 w-full rounded bg-foreground/10 animate-pulse" />
        <div className="mt-2 h-4 w-24 rounded-full bg-foreground/10 animate-pulse" />
      </div>

      <div className={CARD} data-testid="kpi-skeleton-cobranza">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-foreground/10 animate-pulse" />
          <div className="h-4 w-28 rounded bg-foreground/10 animate-pulse" />
        </div>
        <div className="mt-3 h-7 w-28 rounded bg-foreground/10 animate-pulse" />
        <div className="mt-4 h-1.5 w-full rounded-full bg-foreground/10 animate-pulse" />
        <div className="mt-2 h-4 w-36 rounded bg-foreground/10 animate-pulse" />
      </div>

      <div className={CARD} data-testid="kpi-skeleton-sin-entrenar">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-foreground/10 animate-pulse" />
          <div className="h-4 w-32 rounded bg-foreground/10 animate-pulse" />
        </div>
        <div className="mt-3 h-7 w-12 rounded bg-foreground/10 animate-pulse" />
        <div className="mt-3 flex items-center -space-x-2">
          <div className="h-7 w-7 rounded-full bg-foreground/10 ring-2 ring-card animate-pulse" />
          <div className="h-7 w-7 rounded-full bg-foreground/10 ring-2 ring-card animate-pulse" />
          <div className="h-7 w-7 rounded-full bg-foreground/10 ring-2 ring-card animate-pulse" />
        </div>
        <div className="mt-2 h-4 w-20 rounded bg-foreground/10 animate-pulse" />
      </div>

      <div className={CARD} data-testid="kpi-skeleton-activos">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-foreground/10 animate-pulse" />
          <div className="h-4 w-28 rounded bg-foreground/10 animate-pulse" />
        </div>
        <div className="mt-3 h-7 w-16 rounded bg-foreground/10 animate-pulse" />
        <div className="mt-4 h-1.5 w-full rounded-full bg-foreground/10 animate-pulse" />
        <div className="mt-2 h-4 w-40 rounded bg-foreground/10 animate-pulse" />
      </div>
    </div>
  );
}

/** Franja de 4 KPIs de negocio (Material 3 elevated cards), solo para ADMIN. Un único acento: primary. */
export function BusinessKpiStrip({
  kpis: propKpis,
  sinEntrenarNombres: propSinEntrenarNombres = [],
  sinRutina = 0,
  onSinEntrenarClick,
  onAsignarClick,
  className,
  alumnos = [],
  isTestMode: propIsTestMode,
  error: propError,
  supabaseClient,
}: BusinessKpiStripProps) {
  const storeMode =
    typeof window === "undefined"
      ? useWorkspaceModeStore.getState().mode
      : useWorkspaceModeStore((s) => s.mode);
  const isTestMode = propIsTestMode ?? storeMode === "TESTEO";

  const hasRealPropKpis = propKpis !== undefined && propKpis !== DEMO_KPIS_NEGOCIO;
  const initialLoading = !isTestMode && !hasRealPropKpis && !propError;

  const [loading, setLoading] = React.useState(initialLoading);
  const [hasError, setHasError] = React.useState(false);
  const [realKpis, setRealKpis] = React.useState<KpisNegocioDatos | null>(null);
  const [realSinEntrenarNombres, setRealSinEntrenarNombres] =
    React.useState<string[]>(propSinEntrenarNombres);

  React.useEffect(() => {
    if (isTestMode || hasRealPropKpis || propError) {
      setLoading(false);
      setHasError(false);
      return;
    }

    let activo = true;
    setLoading(true);
    setHasError(false);

    (async () => {
      try {
        const client = supabaseClient ?? defaultSupabase;
        const { p_desde, p_hasta, mesAnteriorLabel } = calcularPeriodoMesEnCurso();
        const { data, error: rpcError } = await client.rpc("obtener_kpis_negocio", {
          p_desde,
          p_hasta,
        });

        if (!activo) return;

        if (rpcError || !data || data.length === 0) {
          setHasError(true);
          setLoading(false);
          return;
        }

        const mapeados = mapearRpcAKpis(data[0], mesAnteriorLabel);

        let nombresSinEntrenar = propSinEntrenarNombres;
        if (nombresSinEntrenar.length === 0 && alumnos.length > 0) {
          const idSet = new Set(mapeados.sin_entrenar_7d_ids);
          nombresSinEntrenar = alumnos
            .filter((a) => idSet.has(a.id))
            .map((a) => a.nombre_completo);
        }

        setRealSinEntrenarNombres(nombresSinEntrenar);
        setRealKpis(mapeados);
        setLoading(false);
      } catch {
        if (activo) {
          setHasError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      activo = false;
    };
  }, [isTestMode, hasRealPropKpis, propError, supabaseClient]);

  if (loading) {
    return <BusinessKpiStripSkeleton className={className} />;
  }

  const error = propError || hasError;

  const kpis: KpisNegocio | KpisNegocioDatos = isTestMode
    ? propKpis ?? DEMO_KPIS_NEGOCIO
    : realKpis ?? (hasRealPropKpis ? (propKpis as KpisNegocioDatos) : {
        ingresos_mes: 0,
        ingresos_variacion_pct: null,
        ingresos_mes_anterior_label: "",
        ingresos_ultimos_6_meses: [0, 0, 0, 0, 0, 0],
        cobranza_pct: null,
        cobranza_faltante: 0,
        cobranza_vencidas: 0,
        sin_entrenar_7d_ids: [],
        alumnos_activos: 0,
        altas_mes: 0,
        bajas_mes: 0,
      });

  const sinEntrenarNombres = isTestMode ? propSinEntrenarNombres : realSinEntrenarNombres;
  const sinEntrenarTotal =
    sinEntrenarNombres.length > 0
      ? sinEntrenarNombres.length
      : kpis.sin_entrenar_7d_ids?.length ?? 0;

  const visibles = sinEntrenarNombres.slice(0, 3);
  const extra = sinEntrenarNombres.length - visibles.length;
  const nuevos = kpis.alumnos_activos > 0 ? (kpis.altas_mes / kpis.alumnos_activos) * 100 : 0;
  const variacion = kpis.ingresos_variacion_pct;
  const sube = variacion !== null && variacion >= 0;

  return (
    <div
      data-testid="business-kpi-strip"
      className={`grid grid-cols-2 min-[1700px]:grid-cols-4 gap-4 ${className ?? ""}`}
    >
      <div className={CARD} data-testid="kpi-ingresos">
        <Header label="Ingresos del mes" icon={<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />} />
        <div className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground">
          {error ? "—" : money(kpis.ingresos_mes)}
        </div>
        {error ? (
          <p className="mt-3 text-xs text-muted-foreground">No se pudieron cargar los datos</p>
        ) : (
          <>
            <div className="mt-3">
              <Sparkline values={kpis.ingresos_ultimos_6_meses} />
            </div>
            <span className="mt-2 inline-block rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-foreground">
              {variacion === null
                ? "—"
                : `${sube ? "▲" : "▼"} ${Math.abs(variacion)}% vs ${kpis.ingresos_mes_anterior_label}`}
            </span>
          </>
        )}
      </div>

      <div className={CARD} data-testid="kpi-cobranza">
        <Header label="Cobranza del mes" icon={<path d="M3 7h18v12H3zM3 11h18M7 15h3" />} />
        <div className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground">
          {error
            ? "—"
            : kpis.cobranza_pct === null
            ? "—"
            : `${kpis.cobranza_pct}% `}
          {!error && kpis.cobranza_pct !== null && (
            <span className="text-sm font-semibold text-muted-foreground">cobrado</span>
          )}
        </div>
        {error ? (
          <p className="mt-3 text-xs text-muted-foreground">No se pudieron cargar los datos</p>
        ) : (
          <>
            <div className="mt-4">
              <Bar pct={kpis.cobranza_pct ?? 0} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Faltan {money(kpis.cobranza_faltante)} · {kpis.cobranza_vencidas} vencidas
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={error ? undefined : onSinEntrenarClick}
        data-testid="kpi-sin-entrenar"
        className={`${CARD} text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
      >
        <Header
          warn
          label="Sin entrenar +7 días"
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </>
          }
        />
        <div className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground">
          {error ? "—" : sinEntrenarTotal}
        </div>
        {error ? (
          <p className="mt-3 text-xs text-muted-foreground">No se pudieron cargar los datos</p>
        ) : (
          <>
            <div className="mt-3 flex items-center min-h-7">
              {visibles.map((n, i) => (
                <span
                  key={`${n}-${i}`}
                  className="-ml-2 first:ml-0 h-7 w-7 rounded-full bg-secondary text-[10px] font-bold text-foreground grid place-items-center ring-2 ring-card"
                >
                  {iniciales(n)}
                </span>
              ))}
              {extra > 0 && <span className="ml-2 text-xs font-semibold text-muted-foreground">+{extra}</span>}
            </div>
            <p className="mt-2 text-xs font-semibold text-primary">Ver quiénes →</p>
          </>
        )}
      </button>

      <div className={CARD} data-testid="kpi-activos">
        <Header
          label="Alumnos activos"
          icon={<path d="M17 20h5v-2a3 3 0 00-4-2.8M9 11a4 4 0 100-8 4 4 0 000 8zM2 20v-2a4 4 0 014-4h6a4 4 0 014 4v2" />}
        />
        <div className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground">
          {error ? "—" : kpis.alumnos_activos}
        </div>
        {error ? (
          <p className="mt-3 text-xs text-muted-foreground">No se pudieron cargar los datos</p>
        ) : (
          <>
            <div className="mt-4 flex h-1.5 gap-0.5 rounded-full overflow-hidden bg-foreground/10">
              <div className="h-full bg-primary" style={{ width: `${100 - nuevos}%` }} />
              <div className="h-full bg-primary/50" style={{ width: `${nuevos}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              +{kpis.altas_mes} altas · −{kpis.bajas_mes} baja este mes
            </p>
            {sinRutina > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {sinRutina} sin rutina ·{" "}
                <button
                  type="button"
                  onClick={onAsignarClick}
                  className="font-semibold text-primary min-h-6 hover:underline"
                  aria-label="Asignar rutina a alumnos sin plan"
                >
                  Asignar
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
