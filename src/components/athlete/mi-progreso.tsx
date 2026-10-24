"use client";

import * as React from "react";
import Link from "next/link";
import { CloudOff, History } from "@/components/athlete/icons";
import { formatearFechaCorta } from "@/lib/historial-ejercicio";
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
}

// §4.4: línea de progreso en SVG inline, sin librerías (derivada del Sparkline).
// El eje Y va de min − 5 % a max + 5 % para que una mejora chica se note.
function ProgresoLinea({ ejercicio, vista }: { ejercicio: EjercicioProgreso; vista: NivelVistaAlumno }) {
  const { puntos, a_peso_corporal } = ejercicio;
  const valores = puntos.map((p) => valorPunto(p, a_peso_corporal));
  const conEpley = vista === "TECNICA" && !a_peso_corporal && puntos.some((p) => p.epley_max_kg > 0);
  const epley = puntos.map((p) => p.epley_max_kg);

  const dominio = conEpley ? [...valores, ...epley] : valores;
  const max = Math.max(...dominio);
  const min = Math.min(...dominio);
  const span = max - min || Math.abs(max) || 1;
  const lo = min - span * 0.05;
  const rango = span * 1.1 || 1;

  const x = (i: number) => (puntos.length === 1 ? 0 : (i / (puntos.length - 1)) * 100);
  const y = (v: number) => 40 - ((v - lo) / rango) * 40;
  const linea = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const ultimoY = (y(valores[valores.length - 1]!) / 40) * 100;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox="0 0 100 40"
          className="h-20 w-full text-primary"
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaProgreso(ejercicio)}
        >
          <polyline
            points={linea(valores)}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {conEpley && (
            <polyline
              points={linea(epley)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="3 3"
              className="text-muted-foreground"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {/* Punto final como span absoluto: el svg se estira y deformaría un <circle> (§4.4). */}
        <span
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: "100%", top: `${ultimoY.toFixed(2)}%` }}
          aria-hidden="true"
        />
      </div>
      {conEpley && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span aria-hidden="true">— </span>Peso máx<span aria-hidden="true">  ··· </span>
          <span className="ml-2">1RM estimado</span>
        </p>
      )}
    </div>
  );
}

function TarjetaEjercicio({ ejercicio, vista }: { ejercicio: EjercicioProgreso; vista: NivelVistaAlumno }) {
  const { puntos, a_peso_corporal } = ejercicio;
  const ultimo = puntos[puntos.length - 1];
  const delta = formatearDelta(ejercicio);
  const colorDelta = delta?.signo === "positivo" ? "text-emerald-700 dark:text-success" : "text-muted-foreground";

  return (
    <article className="rounded-2xl border border-border bg-card p-4 space-y-2" data-testid="progreso-ejercicio">
      <h3 className="text-base font-bold text-foreground">{ejercicio.nombre}</h3>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="font-mono text-3xl font-extrabold tabular-nums text-foreground">
            {ultimo ? etiquetaValor(ultimo, a_peso_corporal) : "—"}
          </span>
          {vista === "TECNICA" && !a_peso_corporal && ultimo && ultimo.epley_max_kg > 0 && (
            <span className="mt-0.5 block font-mono text-xs tabular-nums text-muted-foreground">
              {etiquetaEpley(ultimo)}
            </span>
          )}
        </div>
        {delta && <span className={`text-sm font-semibold ${colorDelta}`}>{delta.texto}</span>}
      </div>
      {puntos.length >= 2 ? (
        <ProgresoLinea ejercicio={ejercicio} vista={vista} />
      ) : (
        <p className="text-sm text-muted-foreground">Con 2 sesiones vas a ver tu línea de progreso.</p>
      )}
    </article>
  );
}

function EstadoVacio() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <History className="h-10 w-10 text-muted-foreground" />
      <h2 className="text-lg font-bold text-foreground">Todavía no hay entrenamientos</h2>
      <p className="text-sm text-muted-foreground">Tu progreso aparece acá después de tu primera sesión.</p>
      <Link
        href="/athlete"
        className="mt-2 flex h-14 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:opacity-90"
      >
        Ir a entrenar
      </Link>
    </div>
  );
}

function Esqueleto() {
  return (
    <div data-testid="mi-progreso-cargando" className="space-y-4">
      <div className="h-24 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function MiProgreso({ estado, vista, data, offline, fechaDescarga }: MiProgresoProps) {
  if (estado === "cargando") return <Esqueleto />;

  if (estado === "offline-sin-datos") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
        <CloudOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Sin conexión. Conectate para ver tu progreso.</p>
      </div>
    );
  }

  const sinHistorial =
    !data || (data.ejercicios.length === 0 && data.sesiones_mes === 0 && data.sesiones_mes_anterior === 0);

  return (
    <section className="space-y-4" aria-labelledby="mi-progreso-titulo">
      {offline && fechaDescarga && (
        <p className="text-xs text-muted-foreground">Sin conexión · datos del {formatearFechaCorta(fechaDescarga)}</p>
      )}
      <h1 id="mi-progreso-titulo" className="text-xl font-black text-foreground">
        Mi progreso
      </h1>

      {sinHistorial ? (
        <EstadoVacio />
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="sesiones-mes">
            <h2 id="sesiones-mes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sesiones este mes
            </h2>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-5xl font-extrabold tabular-nums text-foreground">
                {data!.sesiones_mes}
              </span>
              <span className="text-sm text-muted-foreground">
                el mes pasado:{" "}
                <span className="font-mono font-bold text-foreground">{data!.sesiones_mes_anterior}</span>
              </span>
            </div>
            {vista === "TECNICA" && (
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">{etiquetaVolumen(data!.volumen_mes_kg)}</span>
              </p>
            )}
          </section>

          {data!.ejercicios.map((ej) => (
            <TarjetaEjercicio key={ej.ejercicio_id} ejercicio={ej} vista={vista} />
          ))}
        </>
      )}
    </section>
  );
}
