import * as React from "react";
import type { KpisNegocio } from "@/services/coach-demo-dataset";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import { useCobrosStore } from "@/store/use-cobros-store";
import { puedeVerMontos, type KpisNegocioDatos, type TipoRangoPeriodo } from "@/lib/kpis-negocio";

export interface BusinessKpiStripProps {
  kpis?: KpisNegocio | KpisNegocioDatos;
  /** Nombres de los alumnos sin entrenar +7 días (para la pila de avatares). */
  sinEntrenarNombres?: string[];
  /** Cuántos de los alumnos sin entrenar tienen la cuota al día (subtítulo "{n} con cuota al día"). */
  sinEntrenarAlDia?: number;
  /** Alumnos activos sin rutina (línea de apoyo o tarjeta Sin rutina). */
  sinRutina?: number;
  onSinEntrenarClick?: () => void;
  onAsignarClick?: () => void;
  onIngresosClick?: () => void;
  className?: string;
  /** Permite forzar estado de error (para tests o fallos) */
  error?: boolean;
  /** Rol del usuario autenticado (para control de montos) */
  rol?: string | null;
  /** Selector de período activo ('semana' | 'mes' | 'trimestre') */
  periodo?: TipoRangoPeriodo;
  onPeriodoChange?: (periodo: TipoRangoPeriodo) => void;
  /** Callback para reintentar la carga en caso de error (FIX-06) */
  onRetry?: () => void;
  /** Total de alumnos para el indicador "X de Y" */
  totalAlumnos?: number;
  /** Control explícito de visibilidad de montos */
  puedeVer?: boolean;
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const money = (n: number) => `$${pesos.format(n)}`;

const CARD = "p-3 sm:p-4 rounded-xl border bg-card text-card-foreground shadow-none min-w-0";

function Header({
  label,
  badge,
}: {
  label: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-normal text-muted-foreground">{label}</span>
      {badge && (
        <span className="text-xs text-subtle-foreground">{badge}</span>
      )}
    </div>
  );
}

const iniciales = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Franja de 4 KPIs de negocio según PDF Página 4: Cobrado, Alumnos al día, Sin rutina y Sin entrenar +7 días. */
export function BusinessKpiStrip({
  kpis: propKpis,
  sinEntrenarNombres: propSinEntrenarNombres = [],
  sinEntrenarAlDia,
  sinRutina = 0,
  onSinEntrenarClick,
  onAsignarClick,
  onIngresosClick,
  className,
  error: propError,
  rol,
  periodo = "mes",
  onRetry,
  totalAlumnos,
  puedeVer: propPuedeVer,
}: BusinessKpiStripProps) {
  const error = propError;
  const kpis: KpisNegocio | KpisNegocioDatos = propKpis ?? DEMO_KPIS_NEGOCIO;

  const puedeVer =
    propPuedeVer !== undefined
      ? propPuedeVer
      : puedeVerMontos(rol ?? (kpis.cobrado === null ? "ENTRENADOR" : "ADMIN")) &&
        kpis.cobrado !== null;

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

  const cobradoMonto =
    isCustomPropKpis && typeof propKpis?.ingresos_mes === "number"
      ? propKpis.ingresos_mes
      : typeof kpis.cobrado === "number"
      ? kpis.cobrado
      : typeof kpis.ingresos_mes === "number"
      ? kpis.ingresos_mes
      : 0;

  const ingresosPresencial =
    typeof kpisAny.ingresos_presencial === "number"
      ? kpisAny.ingresos_presencial
      : !isCustomPropKpis && (storePresencial > 0 || storeOnline > 0)
      ? storePresencial
      : Math.round(cobradoMonto * 0.65);

  const ingresosOnline =
    typeof kpisAny.ingresos_online === "number"
      ? kpisAny.ingresos_online
      : !isCustomPropKpis && (storePresencial > 0 || storeOnline > 0)
      ? storeOnline
      : cobradoMonto - ingresosPresencial;

  const totalACobrar =
    typeof kpisAny.a_cobrar === "number"
      ? kpisAny.a_cobrar
      : typeof kpis.porCobrar === "number" && typeof kpis.vencido === "number"
      ? kpis.porCobrar + kpis.vencido
      : !isCustomPropKpis && storeVencidosMonto > 0
      ? storeVencidosMonto
      : typeof kpis.cobranza_faltante === "number"
      ? kpis.cobranza_faltante
      : 0;

  const cuotasRojasCant =
    typeof kpisAny.cuotas_en_rojo === "number"
      ? kpisAny.cuotas_en_rojo
      : typeof kpis.cobranza_vencidas === "number"
      ? kpis.cobranza_vencidas
      : !isCustomPropKpis && storeVencidosCant > 0
      ? storeVencidosCant
      : 0;

  const visibles = sinEntrenarNombres.slice(0, 3);
  const extra = sinEntrenarNombres.length - visibles.length;
  const nuevos = kpis.alumnos_activos > 0 ? (kpis.altas_mes / kpis.alumnos_activos) * 100 : 0;
  const variacion = kpis.ingresos_variacion_pct;
  const sube = variacion !== null && variacion >= 0;

  const altas = kpis.altas_mes ?? 0;
  const bajas = kpis.bajas_mes ?? 0;
  const activosCount = kpis.alumnos_activos ?? 0;

  const displayActivos =
    totalAlumnos && totalAlumnos > 0 ? `${activosCount} de ${totalAlumnos}` : `${activosCount}`;

  return (
    <div
      data-testid="business-kpi-strip"
      className={`grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] sm:gap-3 ${className ?? ""}`}
    >
      {/* 1. Tarjeta 'Cobrado' (con por cobrar y cuotas) */}
      <div
        role={error ? undefined : "button"}
        tabIndex={error ? undefined : 0}
        onClick={error ? undefined : onIngresosClick}
        onKeyDown={(e) => {
          if (!error && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onIngresosClick?.();
          }
        }}
        data-testid="kpi-ingresos"
        className={`${CARD} text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group cursor-pointer`}
      >
        <Header
          label="Cobrado"
          badge={periodo === "semana" ? "semana" : periodo === "trimestre" ? "trimestre" : "nov"}
        />
        <div
          className="mt-1.5 text-xl leading-7 sm:text-[28px] sm:leading-[32px] font-semibold tracking-[-0.02em] tabular-nums text-foreground"
          data-testid="kpi-cobrado"
        >
          <span data-testid="kpi-ingresos-total">
            {error ? "—" : !puedeVer ? "—" : money(cobradoMonto)}
          </span>
        </div>
        {error ? (
          <p className="mt-1 text-xs sm:mt-1.5 sm:text-[13px] text-muted-foreground flex items-center justify-between gap-1">
            <span>No se pudieron cargar los datos</span>
            {onRetry ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                data-testid="kpi-retry-btn"
                className="font-medium text-foreground underline cursor-pointer"
              >
                Reintentar
              </button>
            ) : (
              <span>Reintentar</span>
            )}
          </p>
        ) : (
          <>
            {puedeVer && (
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
            )}

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 text-[13px] text-muted-foreground">
              <div
                data-testid="kpi-ingresos-a-cobrar"
                className="inline-flex items-center gap-1 text-[13px] text-muted-foreground"
              >
                {puedeVer ? (
                  <span>
                    <span className="tabular-nums">{money(totalACobrar)}</span> por cobrar
                    {cuotasRojasCant > 0 && (
                      <> · {cuotasRojasCant} {cuotasRojasCant === 1 ? "cuota" : "cuotas"}</>
                    )}
                  </span>
                ) : (
                  <span>
                    {cuotasRojasCant > 0
                      ? `${cuotasRojasCant} ${cuotasRojasCant === 1 ? "cuota en mora" : "cuotas en mora"}`
                      : "Operativo atletas"}
                  </span>
                )}
              </div>

              {puedeVer && (
                <span className="sr-only bg-foreground/[0.06]">
                  {variacion === null
                    ? "—"
                    : `${sube ? "▲" : "▼"} ${Math.abs(variacion)}% vs ${kpis.ingresos_mes_anterior_label}`}
                </span>
              )}
              <span className="sr-only">Ver flujo Sankey →</span>
            </div>

            {visibles.length > 0 && (
              <span className="sr-only">
                {visibles.map((n) => iniciales(n)).join(" ")}
                {extra > 0 ? ` +${extra}` : ""}
              </span>
            )}
          </>
        )}
      </div>

      {/* 2. Tarjeta 'Alumnos al día' (con altas/bajas del período) */}
      <div className={CARD} data-testid="kpi-activos">
        <Header
          label="Alumnos al día"
          badge="hoy"
        />
        <div
          className="mt-1.5 text-xl leading-7 sm:text-[28px] sm:leading-[32px] font-semibold tracking-[-0.02em] tabular-nums text-foreground"
          data-testid="kpi-alumnos-al-dia"
        >
          {error ? "—" : displayActivos}
        </div>
        {error ? (
          <p className="mt-1 text-xs sm:mt-1.5 sm:text-[13px] text-muted-foreground flex items-center justify-between gap-1">
            <span>No se pudieron cargar los datos</span>
            {onRetry ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                data-testid="kpi-retry-btn"
                className="font-medium text-foreground underline cursor-pointer"
              >
                Reintentar
              </button>
            ) : (
              <span>Reintentar</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs sm:mt-1.5 sm:text-[13px] text-muted-foreground">
            +{altas} altas, −{bajas} {bajas === 1 ? "baja" : "bajas"} este mes
          </p>
        )}
      </div>

      {/* 3. Tarjeta 'Sin rutina' */}
      <div className={CARD} data-testid="kpi-sin-rutina">
        <Header
          label="Sin rutina"
          badge="hoy"
        />
        <div className="mt-1.5 text-xl leading-7 sm:text-[28px] sm:leading-[32px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
          {error ? "—" : sinRutina}
        </div>
        {error ? (
          <p className="mt-1 text-xs sm:mt-1.5 sm:text-[13px] text-muted-foreground flex items-center justify-between gap-1">
            <span>No se pudieron cargar los datos</span>
            {onRetry ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                data-testid="kpi-retry-btn"
                className="font-medium text-foreground underline cursor-pointer"
              >
                Reintentar
              </button>
            ) : (
              <span>Reintentar</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs sm:mt-1.5 sm:text-[13px] text-muted-foreground">
            {sinRutina > 0 ? (
              <>
                <span className="sr-only">{sinRutina} sin rutina · </span>
                <button
                  type="button"
                  onClick={onAsignarClick}
                  className="text-left text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                  aria-label="Asignar rutina a alumnos sin plan"
                >
                  Asignales una desde Rutinas
                </button>
              </>
            ) : (
              <span>Todos los alumnos con rutina asignada</span>
            )}
          </p>
        )}
      </div>

      {/* 4. Tarjeta 'Sin entrenar +7 días' */}
      <button
        type="button"
        onClick={error ? undefined : onSinEntrenarClick}
        data-testid="kpi-sin-entrenar"
        className={`${CARD} text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
      >
        <Header
          label="Sin entrenar"
          badge="+7 días"
        />
        <div className="mt-1.5 text-xl leading-7 sm:text-[28px] sm:leading-[32px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
          {error ? "—" : sinEntrenarTotal}
        </div>
        {error ? (
          <p className="mt-1 text-xs sm:mt-1.5 sm:text-[13px] text-muted-foreground flex items-center justify-between gap-1">
            <span>No se pudieron cargar los datos</span>
            {onRetry ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                data-testid="kpi-retry-btn"
                className="font-medium text-foreground underline cursor-pointer"
              >
                Reintentar
              </button>
            ) : (
              <span>Reintentar</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-xs sm:mt-1.5 sm:text-[13px] text-muted-foreground">
            {sinEntrenarAlDia !== undefined
              ? `${sinEntrenarAlDia} con cuota al día`
              : "Ver quiénes →"}
          </p>
        )}
      </button>
    </div>
  );
}
