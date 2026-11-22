"use client";

import * as React from "react";
import Link from "next/link";
import { Calendar, CloudOff, History } from "@/components/athlete/icons";
import { TarjetaLogroDiamante } from "@/components/athlete/tarjeta-logro-diamante";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";
import { formatearFechaCorta } from "@/lib/historial-ejercicio";
import {
  ACTIVIDAD_LABEL,
  ETIQUETA_SENSACION,
  agruparAsistenciasPorSemana,
  formatearFechaClaseAsistencia,
  type AsistenciaClaseItem,
} from "@/lib/clases";
import {
  ariaProgreso,
  etiquetaEpley,
  etiquetaValor,
  etiquetaVolumen,
  formatearDelta,
  valorPunto,
  type EjercicioProgreso,
  type MiProgresoData,
} from "@/lib/mi-progreso";
import type { NivelVistaAlumno } from "@/types/database.types";

// Estados de la pantalla (§4.5). "listo" se refina según haya o no sesiones.
export type EstadoMiProgreso = "cargando" | "offline-sin-datos" | "listo";

export interface MiProgresoProps {
  estado: EstadoMiProgreso;
  vista: NivelVistaAlumno;
  data: MiProgresoData | null;
  offline?: boolean; // hay datos guardados pero sin conexión
  fechaDescarga?: string | null; // ISO de la última descarga, para el aviso offline
  asistenciasClases?: AsistenciaClaseItem[];
  diamantesRacha?: number;
  rachaSemanas?: number;
}

// 02-pantallas §6: gráfico SVG 300 × 96 (+18 de fechas), sin librerías. Misma geometría que la referencia.
const W = 300;
const H = 96;
const PD = 8;

function ProgresoLinea({ ejercicio, vista }: { ejercicio: EjercicioProgreso; vista: NivelVistaAlumno }) {
  const gradId = React.useId();
  const { puntos, a_peso_corporal } = ejercicio;
  const valores = puntos.map((p) => valorPunto(p, a_peso_corporal));
  const conEpley = vista === "TECNICA" && !a_peso_corporal && puntos.some((p) => p.epley_max_kg > 0);
  const epley = puntos.map((p) => p.epley_max_kg);

  const dominio = conEpley ? [...valores, ...epley] : valores;
  const min = Math.min(...dominio) - 2.5;
  const max = Math.max(...dominio) + 2.5;
  const x = (i: number) => PD + (i * (W - 2 * PD)) / (valores.length - 1);
  const y = (v: number) => H - PD - ((v - min) / (max - min)) * (H - 2 * PD);
  const trazo = (vals: number[]) => "M" + vals.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" L ");
  const linea = trazo(valores);
  const ultimo = valores.length - 1;
  const area = `${linea} L ${x(ultimo).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;

  return (
    <div>
      <svg className="a-chart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={ariaProgreso(ejercicio)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="a-stop-a" />
            <stop offset="1" className="a-stop-b" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} className="a-ch-grid" x1="0" x2={W} y1={(H * t).toFixed(1)} y2={(H * t).toFixed(1)} />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        {conEpley && <path className="a-ch-rm" d={trazo(epley)} />}
        <path className="a-ch-line" d={linea} />
        {valores.slice(0, -1).map((v, i) => (
          <circle key={i} className="a-ch-pt" cx={x(i).toFixed(1)} cy={y(v).toFixed(1)} r="3.2" />
        ))}
        <circle className="a-ch-end" cx={x(ultimo).toFixed(1)} cy={y(valores[ultimo]!).toFixed(1)} r="5" />
        <text className="a-ch-lbl" x={PD} y={H + 14}>
          {formatearFechaCorta(puntos[0]!.fecha)}
        </text>
        <text className="a-ch-lbl" x={W - PD} y={H + 14} textAnchor="end">
          {formatearFechaCorta(puntos[ultimo]!.fecha)}
        </text>
      </svg>
      {conEpley && (
        <div className="a-legend a-t-sec">
          <span>
            <i className="a-lg-line" />
            Peso máx.
          </span>
          <span>
            <i className="a-lg-dash" />
            1RM estimado
            <Tooltip1RM size="sm" />
          </span>
        </div>
      )}
    </div>
  );
}

function TarjetaEjercicio({ ejercicio, vista }: { ejercicio: EjercicioProgreso; vista: NivelVistaAlumno }) {
  const { puntos, a_peso_corporal } = ejercicio;
  const ultimo = puntos[puntos.length - 1];
  const delta = formatearDelta(ejercicio);
  const [valor, unidad] = ultimo ? etiquetaValor(ultimo, a_peso_corporal).split(" ") : ["—", ""];

  return (
    <section className="a-card a-ccard" data-testid="progreso-ejercicio">
      <div className="a-top">
        <h3 className="a-t-bs">{ejercicio.nombre}</h3>
        {delta && <span className="a-delta a-t-label">{delta.texto}</span>}
      </div>
      <div>
        <span className="a-t-mm">{valor}</span> <span className="a-t-sec a-muted">{unidad}</span>
      </div>
      {vista === "TECNICA" && !a_peso_corporal && ultimo && ultimo.epley_max_kg > 0 && (
        <span className="a-t-sec a-muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {etiquetaEpley(ultimo).replace("1RM est.", "1RM estimado")}
          <Tooltip1RM size="sm" />
        </span>
      )}
      {puntos.length >= 2 ? (
        <ProgresoLinea ejercicio={ejercicio} vista={vista} />
      ) : (
        <p className="a-t-sec a-muted">Con 2 sesiones vas a ver tu línea de progreso.</p>
      )}
    </section>
  );
}

function EstadoVacio() {
  return (
    <section className="a-card a-state" data-testid="progreso-vacio">
      <span className="a-ic">
        <History width={24} height={24} aria-hidden="true" />
      </span>
      <h2 className="a-t-title">Todavía no hay entrenamientos</h2>
      <p className="a-t-sec">Tu progreso aparece acá después de tu primera sesión.</p>
      <Link href="/athlete" className="a-btn">
        Ir a entrenar
      </Link>
    </section>
  );
}

function EstadoVacioClases() {
  return (
    <section className="a-card a-state" data-testid="historial-clases-vacio">
      <span className="a-ic">
        <Calendar width={24} height={24} aria-hidden="true" />
      </span>
      <h3 className="a-t-title">Todavía no registraste asistencias</h3>
      <p className="a-t-sec">
        Cuando asistas a una clase vas a ver acá tu historial semana a semana.
      </p>
      <Link href="/athlete/clases" className="a-btn">
        Ver clases
      </Link>
    </section>
  );
}

function SeccionHistorialClases({ asistencias }: { asistencias: AsistenciaClaseItem[] }) {
  const semanas = React.useMemo(
    () => agruparAsistenciasPorSemana(asistencias),
    [asistencias],
  );

  return (
    <section
      className="grid gap-3"
      aria-labelledby="historial-clases-titulo"
      data-testid="historial-clases-section"
    >
      <h2 id="historial-clases-titulo" className="a-eb a-t-label">
        Historial de clases
      </h2>
      {asistencias.length === 0 ? (
        <EstadoVacioClases />
      ) : (
        semanas.map((sem) => (
          <div key={sem.semanaInicioClave} className="grid gap-2" data-testid="historial-clases-semana">
            <p className="a-t-label a-muted px-1">{sem.etiquetaSemana}</p>
            <div className="a-card a-days">
              {sem.items.map((item) => (
                <div
                  key={item.reserva_id}
                  className="a-row"
                  data-testid="historial-clase-item"
                >
                  <span className="a-rt">
                    <b className="a-t-bs">{ACTIVIDAD_LABEL[item.actividad] || item.actividad}</b>
                    <small className="a-t-sec">{formatearFechaClaseAsistencia(item.inicio)}</small>
                    {item.nota?.trim() && (
                      <small className="a-t-sec a-muted mt-1" data-testid="historial-clase-nota">
                        {item.nota.trim()}
                      </small>
                    )}
                  </span>
                  {item.sensacion !== null && (
                    <span className="a-chip a-t-label" data-testid="historial-clase-sensacion">
                      {ETIQUETA_SENSACION[item.sensacion]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Esqueleto() {
  return (
    <div data-testid="mi-progreso-cargando" className="grid gap-4">
      <div className="h-24 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function MiProgreso({
  estado,
  vista,
  data,
  offline,
  fechaDescarga,
  asistenciasClases,
  diamantesRacha = 0,
  rachaSemanas = 0,
}: MiProgresoProps) {
  if (estado === "cargando") return <Esqueleto />;

  if (estado === "offline-sin-datos") {
    return (
      <section className="a-card a-state" data-testid="progreso-offline-sin-datos">
        <span className="a-ic">
          <CloudOff width={24} height={24} aria-hidden="true" />
        </span>
        <p className="a-t-sec">Sin conexión. Conectate para ver tu progreso.</p>
      </section>
    );
  }

  const sinHistorial =
    !data || (data.ejercicios.length === 0 && data.sesiones_mes === 0 && data.sesiones_mes_anterior === 0);
  const mostrarClases = asistenciasClases !== undefined;
  const tieneAsistenciasClases = Boolean(asistenciasClases && asistenciasClases.length > 0);
  const ciclosCompletados = rachaSemanas >= 53 ? Math.floor((rachaSemanas - 1) / 52) : 0;
  const diamantesVisibles = Math.max(diamantesRacha, ciclosCompletados);

  return (
    <section className="grid gap-4" aria-labelledby="mi-progreso-titulo">
      <h1 id="mi-progreso-titulo" className="a-t-d">
        Mi progreso
      </h1>
      {offline && fechaDescarga && (
        <p className="a-eb a-t-label a-offnote" data-testid="progreso-sin-conexion" style={{ justifySelf: "start" }}>
          <CloudOff width={12} height={12} aria-hidden="true" />
          Sin conexión · datos del {formatearFechaCorta(fechaDescarga)}
        </p>
      )}

      {diamantesVisibles >= 1 && (
        <TarjetaLogroDiamante diamantes={diamantesVisibles} semanas={rachaSemanas} />
      )}

      {sinHistorial && !mostrarClases ? (
        <EstadoVacio />
      ) : (
        <>
          {!sinHistorial && (
            <>
              <section className="a-hhero" aria-labelledby="sesiones-mes">
                <span id="sesiones-mes" className="a-t-label" style={{ color: "var(--a-hero-2)" }}>
                  Sesiones este mes
                </span>
                <div className="a-t-ml">{data!.sesiones_mes}</div>
                <small className="a-t-sec">el mes pasado: {data!.sesiones_mes_anterior}</small>
                {vista === "TECNICA" && <small className="a-t-sec">{etiquetaVolumen(data!.volumen_mes_kg)}</small>}
              </section>

              {data!.ejercicios.map((ej) => (
                <TarjetaEjercicio key={ej.ejercicio_id} ejercicio={ej} vista={vista} />
              ))}
            </>
          )}

          {mostrarClases && (!sinHistorial || tieneAsistenciasClases || asistenciasClases!.length === 0) && (
            <SeccionHistorialClases asistencias={asistenciasClases!} />
          )}
        </>
      )}
    </section>
  );
}
