import * as React from "react";
import type { KpisNegocio } from "@/services/coach-demo-dataset";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import { useCobrosStore } from "@/store/use-cobros-store";
import type { KpisNegocioDatos } from "@/lib/kpis-negocio";

export interface BusinessKpiStripProps {
  kpis?: KpisNegocio | KpisNegocioDatos;
  /** Nombres de los alumnos sin entrenar +7 días (para la pila de avatares). */
  sinEntrenarNombres?: string[];
  /** Alumnos activos sin rutina (línea de apoyo de la tarjeta Activos). */
  sinRutina?: number;
  onSinEntrenarClick?: () => void;
  onAsignarClick?: () => void;
  onIngresosClick?: () => void;
  className?: string;
  /** Permite forzar estado de error (para tests o fallos) */
  error?: boolean;
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

/** Franja de 4 KPIs de negocio (Material 3 elevated cards), solo para ADMIN. Un único acento: primary. */
export function BusinessKpiStrip({
  kpis: propKpis,
  sinEntrenarNombres: propSinEntrenarNombres = [],
  sinRutina = 0,
  onSinEntrenarClick,
  onAsignarClick,
  onIngresosClick,
  className,
  error: propError,
}: BusinessKpiStripProps) {
  const error = propError;
  const kpis: KpisNegocio | KpisNegocioDatos = propKpis ?? DEMO_KPIS_NEGOCIO;

  const sinEntrenarNombres = propSinEntrenarNombres;
  const sinEntrenarTotal =
    sinEntrenarNombres.length > 0
      ? sinEntrenarNombres.length
      : kpis.sin_entrenar_7d_ids?.length ?? 0;

  const storeCobros = useCobrosStore((s) => s.cobros);

  let storePresencial = 0;
  let storeOnline = 0;
  let storeVencidosMonto = 0;
  let storeVencidosCant = 0;

  if (Array.isArray(storeCobros) && storeCobros.length > 0) {
    for (const item of storeCobros) {
      const monto = item.ultimoPago?.monto ?? item.monto;
      const esPresencial =
        item.actividad === "FUNCIONAL" ||
        item.actividad === "BOXEO" ||
        (item.servicioNombre && /funcional|boxeo|presencial/i.test(item.servicioNombre));

      if (item.estado === "PAGADO") {
        if (esPresencial) {
          storePresencial += monto;
        } else {
          storeOnline += monto;
        }
      } else if (item.estado === "VENCIDO") {
        storeVencidosMonto += item.monto;
        storeVencidosCant++;
      }
    }
  }

  const kpisAny = kpis as any;

  const isCustomPropKpis = propKpis !== undefined && propKpis !== DEMO_KPIS_NEGOCIO;

  const ingresosPresencial =
    typeof kpisAny.ingresos_presencial === "number"
      ? kpisAny.ingresos_presencial
      : !isCustomPropKpis && (storePresencial > 0 || storeOnline > 0)
      ? storePresencial
      : Math.round(kpis.ingresos_mes * 0.65);

  const ingresosOnline =
    typeof kpisAny.ingresos_online === "number"
      ? kpisAny.ingresos_online
      : !isCustomPropKpis && (storePresencial > 0 || storeOnline > 0)
      ? storeOnline
      : kpis.ingresos_mes - ingresosPresencial;

  const totalACobrar =
    typeof kpisAny.a_cobrar === "number"
      ? kpisAny.a_cobrar
      : !isCustomPropKpis && storeVencidosMonto > 0
      ? storeVencidosMonto
      : typeof kpis.cobranza_faltante === "number"
      ? kpis.cobranza_faltante
      : 0;

  const cuotasRojasCant =
    typeof kpisAny.cuotas_en_rojo === "number"
      ? kpisAny.cuotas_en_rojo
      : !isCustomPropKpis && storeVencidosCant > 0
      ? storeVencidosCant
      : typeof kpis.cobranza_vencidas === "number"
      ? kpis.cobranza_vencidas
      : 0;

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
      <button
        type="button"
        onClick={error ? undefined : onIngresosClick}
        data-testid="kpi-ingresos"
        className={`${CARD} text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group cursor-pointer`}
      >
        <Header label="Ingresos del mes" icon={<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />} />
        <div className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground" data-testid="kpi-ingresos-total">
          {error ? "—" : money(kpis.ingresos_mes)}
        </div>
        {error ? (
          <p className="mt-3 text-xs text-muted-foreground">No se pudieron cargar los datos</p>
        ) : (
          <>
            <div data-testid="kpi-ingresos-desagregado" className="sr-only">
              <span data-testid="kpi-ingresos-presencial">
                {money(ingresosPresencial)} presencial
              </span>
              <span>(funcional + boxeo)</span>
              <span>·</span>
              <span data-testid="kpi-ingresos-online">
                {money(ingresosOnline)} online
              </span>
              <span>(rutinas)</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
              <div
                data-testid="kpi-ingresos-a-cobrar"
                className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <span>A cobrar:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {money(totalACobrar)}
                </span>
                {cuotasRojasCant > 0 && (
                  <span className="text-[10px]">
                    ({cuotasRojasCant} {cuotasRojasCant === 1 ? "cuota en rojo" : "cuotas en rojo"})
                  </span>
                )}
              </div>

              <span className="inline-block rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {variacion === null
                  ? "—"
                  : `${sube ? "▲" : "▼"} ${Math.abs(variacion)}% vs ${kpis.ingresos_mes_anterior_label}`}
              </span>
            </div>

            <p className="mt-2.5 text-xs font-semibold text-primary flex items-center gap-1 group-hover:underline">
              Ver flujo Sankey →
            </p>
          </>
        )}
      </button>

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
