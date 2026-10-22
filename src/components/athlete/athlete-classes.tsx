"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { COLOR_ACTIVIDAD, DaysStrip, NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";
import {
  claveDia,
  clasesUsadas,
  diasDeLaSemana,
  estadoTarjetaClase,
  horaLocal,
  inicioPeriodoRenovacion,
  ocupaCupo,
} from "@/lib/clases";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { DEMO_ALUMNOS_CLASES } from "@/services/coach-demo-dataset";
import type { Clase, Reserva } from "@/types/database.types";

// Athlete App · Clases (#113 / GH #122): semana en curso, contador semanal y anotarse/cancelar.
export function AthleteClasses() {
  const {
    clases,
    misReservas,
    agendaReservas,
    membresia,
    plan,
    sinCupo,
    actualizadoAt,
    cargando,
    accionEnCurso,
    error,
    aviso,
    demoAlumnoId,
    setDemoAlumnoId,
    cargarClasesAlumno,
    reservar,
    cancelarReserva,
    limpiarMensajes,
  } = useClasesStore();

  const isOnline = useOfflineQueueStore((s) => s.isOnline);
  const mode = useWorkspaceModeStore((s) => s.mode);
  const isTestMode = mode === "TESTEO";

  const hoy = claveDia(new Date());
  const dias = React.useMemo(() => diasDeLaSemana(), []);
  const [dia, setDia] = React.useState(hoy);
  const [porCancelar, setPorCancelar] = React.useState<{ clase: Clase; reserva: Reserva } | null>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    if (isOnline || isTestMode) void cargarClasesAlumno();
  }, [isOnline, isTestMode, cargarClasesAlumno]);

  React.useEffect(() => {
    if (porCancelar) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [porCancelar]);

  const reservaPorClase = new Map(
    misReservas.filter((r) => r.estado !== "CANCELADO").map((r) => [r.clase_id, r]),
  );
  const usadas = clasesUsadas(misReservas, clases);
  const limite = plan?.limite_semanal ?? null;

  const diasConReserva = new Set(
    clases.filter((c) => reservaPorClase.get(c.id)?.estado === "ANOTADO").map((c) => claveDia(c.inicio)),
  );

  // Filtrado por las actividades que habilita su plan (GH #122)
  const actividadPlan = plan?.cantidad_actividades === 1 ? membresia?.actividad ?? null : null;
  const [mostrarTodas, setMostrarTodas] = React.useState(false);

  const delDia = React.useMemo(() => {
    const todos = clases.filter((c) => claveDia(c.inicio) === dia);
    if (!mostrarTodas && actividadPlan) {
      return todos.filter((c) => c.actividad === actividadPlan);
    }
    return todos;
  }, [clases, dia, mostrarTodas, actividadPlan]);

  const ocupacionClase = (claseId: string) =>
    agendaReservas.filter((r) => r.clase_id === claseId && ocupaCupo(r)).length;

  return (
    <section className="space-y-4" aria-labelledby="clases-titulo" data-testid="athlete-classes">
      <div className="flex items-center justify-between">
        <h1 id="clases-titulo" className="text-xl font-black tracking-tight">Clases</h1>
        {!isOnline && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Sin conexión · datos guardados
          </span>
        )}
      </div>

      {/* Selector de alumno demo en modo testeo (GH #122) */}
      {isTestMode && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 space-y-2" data-testid="demo-athlete-selector">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground">
              Modo Testeo · Alumno activo
            </p>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Dataset Demo
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ALUMNOS_CLASES.map((a) => {
              const activo = demoAlumnoId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setDemoAlumnoId(a.id);
                    void cargarClasesAlumno();
                  }}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all touch-manipulation ${
                    activo
                      ? "bg-primary text-primary-foreground shadow-xs font-bold"
                      : "bg-background/80 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/60"
                  }`}
                  data-testid={`select-demo-${a.id}`}
                >
                  {a.nombre_completo}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contador semanal o Pase Libre */}
      <div className="rounded-2xl border border-border/80 bg-card p-4" data-testid="weekly-allowance">
        {limite === null ? (
          <p className="text-lg font-black">{plan ? "Pase libre esta semana" : "Sin membresía de clases"}</p>
        ) : (
          <>
            <p className="text-lg font-black tabular-nums">
              {usadas} de {limite} clases usadas esta semana
            </p>
            <div className="mt-2 flex gap-1.5" aria-hidden="true">
              {Array.from({ length: limite }, (_, i) => (
                <span
                  key={i}
                  className={`h-2.5 flex-1 rounded-full ${i < usadas ? "bg-primary" : "border border-dashed border-border"}`}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {Math.max(limite - usadas, 0) === 1 ? "Te queda 1 clase" : `Te quedan ${Math.max(limite - usadas, 0)} clases`} · la semana va de lunes a domingo.
            </p>
          </>
        )}
      </div>

      <DaysStrip dias={dias} seleccionado={dia} hoy={hoy} conMarca={diasConReserva} onSeleccionar={setDia} />

      {/* Filtro por actividad de plan */}
      {actividadPlan && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1" data-testid="plan-activity-filter">
          <span>Plan habilitado para: <strong className="text-foreground">{NOMBRE_ACTIVIDAD[actividadPlan]}</strong></span>
          <button
            type="button"
            onClick={() => setMostrarTodas(!mostrarTodas)}
            className="font-semibold text-primary hover:underline text-[11px]"
            data-testid="toggle-filter-actividades"
          >
            {mostrarTodas ? "Ver solo mi actividad" : "Ver todas las actividades"}
          </button>
        </div>
      )}

      {(error || aviso) && (
        <div
          role="alert"
          className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm ${
            error
              ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          }`}
          data-testid="alert-message"
        >
          <span>{error ?? aviso}</span>
          <button type="button" onClick={limpiarMensajes} className="min-h-8 px-1 font-bold" aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {cargando && clases.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando clases…</p>
      ) : delDia.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {actualizadoAt ? "No hay clases este día." : "Todavía no hay clases cargadas."}
        </p>
      ) : (
        <ul className="space-y-3">
          {delDia.map((clase) => {
            const reserva = reservaPorClase.get(clase.id) ?? null;
            const ocupados = ocupacionClase(clase.id);
            const cuposLibres = clase.capacidad !== null ? Math.max(0, clase.capacidad - ocupados) : null;
            const claseLlena = sinCupo.includes(clase.id) || (clase.capacidad !== null && cuposLibres === 0);

            const estado = estadoTarjetaClase({
              clase,
              reserva,
              usadas,
              limiteSemanal: limite,
              sinCupo: claseLlena,
            });
            const renovacion = inicioPeriodoRenovacion(clase, membresia);
            const ocupado = accionEnCurso === clase.id || (reserva !== null && accionEnCurso === reserva.id);

            return (
              <li
                key={clase.id}
                className={`rounded-2xl border bg-card p-4 transition-all ${
                  estado === "RESERVADA" ? "border-emerald-500/60 ring-1 ring-emerald-500/30" : "border-border/80"
                }`}
                data-testid="class-booking-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black tabular-nums">{horaLocal(clase.inicio)}</p>
                    <p className="text-xs text-muted-foreground font-medium" data-testid="class-spots">
                      {clase.duracion_minutos} min
                      {clase.capacidad !== null ? ` · ${cuposLibres} de ${clase.capacidad} cupos libres` : " · Cupo libre"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLOR_ACTIVIDAD[clase.actividad]}`}>
                      {NOMBRE_ACTIVIDAD[clase.actividad]}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        estado === "RESERVADA" || estado === "RESERVADA_INICIADA"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : estado === "CANCELADA"
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                          : estado === "INICIADA"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : "bg-secondary text-muted-foreground"
                      }`}
                      data-testid="class-status"
                    >
                      {estado === "RESERVADA" || estado === "RESERVADA_INICIADA"
                        ? "Anotado"
                        : estado === "CANCELADA"
                        ? "Cancelada"
                        : estado === "INICIADA"
                        ? "Comenzada"
                        : estado === "SIN_CUPO"
                        ? "Sin cupo"
                        : "Disponible"}
                    </span>
                  </div>
                </div>

                {renovacion && estado === "DISPONIBLE" && (
                  <p className="mt-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-sky-700 dark:text-sky-300" data-testid="renewal-period-banner">
                    Esta clase corresponde a tu período de renovación a partir del {renovacion}.
                  </p>
                )}

                <div className="mt-3">
                  {estado === "DISPONIBLE" && (
                    <Button
                      size="touch"
                      className="w-full"
                      disabled={(!isOnline && !isTestMode) || ocupado}
                      onClick={() => void reservar(clase.id)}
                      data-testid="book-class-btn"
                    >
                      {ocupado ? "Reservando…" : isOnline || isTestMode ? "Reservar cupo" : "Reservá al reconectar"}
                    </Button>
                  )}
                  {estado === "RESERVADA" && reserva && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">✓ Tu reserva está confirmada</p>
                      <Button
                        variant="outline"
                        size="touch"
                        className="w-full"
                        disabled={(!isOnline && !isTestMode) || ocupado}
                        onClick={() => setPorCancelar({ clase, reserva })}
                        data-testid="cancel-booking-btn"
                      >
                        {ocupado ? "Cancelando…" : "Cancelar mi reserva"}
                      </Button>
                    </div>
                  )}
                  {estado === "RESERVADA_INICIADA" && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">✓ Estás anotado</p>
                      <Button variant="outline" size="touch" className="w-full" disabled>
                        La clase ya comenzó: venció el plazo para cancelar
                      </Button>
                    </div>
                  )}
                  {estado === "AUSENTE" && <EstadoFijo>Quedaste ausente · la clase cuenta en tu semana</EstadoFijo>}
                  {estado === "CANCELADA" && (
                    <EstadoFijo>Clase cancelada{clase.motivo_cancelacion ? `: ${clase.motivo_cancelacion}` : ""}</EstadoFijo>
                  )}
                  {estado === "INICIADA" && <EstadoFijo>La clase ya comenzó</EstadoFijo>}
                  {estado === "SIN_CUPO" && (
                    <div className="space-y-2">
                      <EstadoFijo>Cupo agotado</EstadoFijo>
                      {/* En modo testeo permitir click para verificar mensaje de error GZ001 */}
                      {isTestMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => void reservar(clase.id)}
                          data-testid="attempt-booked-class-btn"
                        >
                          Intentar reservar (probar regla)
                        </Button>
                      )}
                    </div>
                  )}
                  {estado === "LIMITE" && (
                    <div className="space-y-2">
                      <EstadoFijo>Límite semanal alcanzado ({usadas}/{limite})</EstadoFijo>
                      {isTestMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => void reservar(clase.id)}
                          data-testid="attempt-limit-class-btn"
                        >
                          Intentar reservar (probar límite)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setPorCancelar(null)}
        className="m-auto w-[min(92vw,24rem)] rounded-2xl border border-border bg-card p-5 text-foreground backdrop:bg-black/60"
        aria-labelledby="cancelar-reserva-titulo"
      >
        {porCancelar && (
          <div className="space-y-4">
            <h2 id="cancelar-reserva-titulo" className="text-lg font-black">¿Cancelar tu reserva?</h2>
            <p className="text-sm text-muted-foreground">
              {NOMBRE_ACTIVIDAD[porCancelar.clase.actividad]} a las {horaLocal(porCancelar.clase.inicio)}. Liberás el cupo y
              la clase deja de contar en tu semana. Podés cancelar hasta que empiece.
            </p>
            <div className="grid gap-2">
              <Button
                variant="destructive"
                size="touch"
                onClick={() => {
                  const { reserva } = porCancelar;
                  setPorCancelar(null);
                  void cancelarReserva(reserva.id);
                }}
                data-testid="confirm-cancel-reserva-btn"
              >
                Sí, cancelar
              </Button>
              <Button variant="ghost" size="touch" onClick={() => setPorCancelar(null)}>
                Mantener reserva
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

function EstadoFijo({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-12 items-center justify-center rounded-xl border border-border/70 bg-secondary/50 px-3 text-center text-sm font-semibold text-muted-foreground">
      {children}
    </p>
  );
}
