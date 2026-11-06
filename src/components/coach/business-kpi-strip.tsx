import * as React from "react";
import type { KpisNegocio } from "@/services/coach-demo-dataset";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import { useCobrosStore } from "@/store/use-cobros-store";
import { puedeVerMontos, type KpisNegocioDatos, type TipoRangoPeriodo } from "@/lib/kpis-negocio";

export interface BusinessKpiStripProps {
  kpis?: KpisNegocio | KpisNegocioDatos;
  /** Nombres de los alumnos sin entrenar +7 días (para la pila de avatares). */
  sinEntrenarNombres?: string[];
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
  /** Total de alumnos para el indicador "X de Y" */
  totalAlumnos?: number;
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const money = (n: number) => `$${pesos.format(n)}`;

const CARD =
  "rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.4),0_2px_6px_rgba(0,0,0,.25)] hover:shadow-[0_2px_4px_rgba(0,0,0,.45),0_6px_14px_rgba(0,0,0,.3)] transition-shadow";

function Header({
  label,
  icon,
  warn,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  warn?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
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
      {badge && (
        <span className="text-[11px] font-medium text-muted-foreground/80 px-1.5 py-0.5 rounded-md bg-muted/50">
          {badge}
        </span>
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
  sinRutina = 0,
  onSinEntrenarClick,
  onAsignarClick,
  onIngresosClick,
  className,
  error: propError,
  rol,
  periodo = "mes",
  totalAlumnos,
}: BusinessKpiStripProps) {
  const error = propError;
  const kpis: KpisNegocio | KpisNegocioDatos = propKpis ?? DEMO_KPIS_NEGOCIO;

  const puedeVer =
    puedeVerMontos(rol ?? (kpis.cobrado === null ? "ENTRENADOR" : "ADMIN")) &&
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
      className={`grid grid-cols-2 min-[1700px]:grid-cols-4 gap-4 ${className ?? ""}`}
    >
      {/* 1. Tarjeta 'Cobrado' (con por cobrar y cuotas) */}
      <button
        type="button"
        onClick={error ? undefined : onIngresosClick}
        data-testid="kpi-ingresos"
        className={`${CARD} text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group cursor-pointer`}
      >
        <Header
          label="Cobrado"
          badge={periodo === "semana" ? "semana" : periodo === "trimestre" ? "trimestre" : "nov"}
          icon={<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />}
        />
        <div
          className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground"
          data-testid="kpi-cobrado"
        >
          <span data-testid="kpi-ingresos-total">
            {error ? "—" : !puedeVer ? "—" : money(cobradoMonto)}
          </span>
        </div>
        {error ? (
          <p className="mt-3 text-xs text-muted-foreground">No se pudieron cargar los datos</p>
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

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
              <div
                data-testid="kpi-ingresos-a-cobrar"
                className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {puedeVer ? (
                  <>
                    <span>A cobrar:</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {money(totalACobrar)}
                    </span>
                    {cuotasRojasCant > 0 && (
                      <span className="text-[10px]">
                        ({cuotasRojasCant} {cuotasRojasCant === 1 ? "cuota en rojo" : "cuotas en rojo"})
                      </span>
                    )}
                  </>
                ) : (
                  <span>
                    {cuotasRojasCant > 0
                      ? `${cuotasRojasCant} ${cuotasRojasCant === 1 ? "cuota en mora" : "cuotas en mora"}`
                      : "Operativo atletas"}
                  </span>
                )}
              </div>

              {puedeVer && (
                <span className="inline-block rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold text-foreground">
                  {variacion === null
                    ? "—"
                    : `${sube ? "▲" : "▼"} ${Math.abs(variacion)}% vs ${kpis.ingresos_mes_anterior_label}`}
                </span>
              )}
            </div>

            <p className="mt-2.5 text-xs font-semibold text-primary flex items-center gap-1 group-hover:underline">
              Ver flujo Sankey →
            </p>
          </>
        )}
      </button>

      {/* 2. Tarjeta 'Alumnos al día' (con altas/bajas del período) */}
      <div className={CARD} data-testid="kpi-activos">
        <Header
          label="Alumnos al día"
          badge="hoy"
          icon={<path d="M17 20h5v-2a3 3 0 00-4-2.8M9 11a4 4 0 100-8 4 4 0 000 8zM2 20v-2a4 4 0 014-4h6a4 4 0 014 4v2" />}
        />
        <div
          className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground"
          data-testid="kpi-alumnos-al-dia"
        >
          {error ? "—" : displayActivos}
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
              +{altas} altas · −{bajas} {bajas === 1 ? "baja" : "bajas"} este mes
            </p>
          </>
        )}
      </div>

      {/* 3. Tarjeta 'Sin rutina' */}
      <div className={CARD} data-testid="kpi-sin-rutina">
        <Header
          label="Sin rutina"
          badge="hoy"
          icon={<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />}
        />
        <div className="mt-3 text-[28px] leading-none font-black tabular-nums text-foreground">
          {error ? "—" : sinRutina}
        </div>
        {error ? (
          <p className="mt-3 text-xs text-muted-foreground">No se pudieron cargar los datos</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {sinRutina > 0 ? (
              <>
                <span>{sinRutina} sin rutina · </span>
                <button
                  type="button"
                  onClick={onAsignarClick}
                  className="font-semibold text-primary min-h-6 hover:underline"
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
          warn
          label="Sin entrenar +7 días"
          badge="+7 días"
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
    </div>
  );
}
