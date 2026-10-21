"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { COLOR_ACTIVIDAD, DaysStrip, NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";
import { claveDia, diasDeLaSemana, horaLocal, ocupaCupo } from "@/lib/clases";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const MOTIVO_MINIMO = 5;

// Coach Studio · Agenda (#113): clases por día y horario, anotados, ocupación,
// ausente en un toque y cancelación con motivo.
export function ClassAgenda() {
  const {
    clases, agendaReservas, cargando, accionEnCurso, error,
    cargarAgenda, marcarAusente, cancelarClase, limpiarMensajes,
  } = useClasesStore();
  const isOnline = useOfflineQueueStore((s) => s.isOnline);

  const hoy = claveDia(new Date());
  const dias = React.useMemo(() => diasDeLaSemana(), []);
  const [dia, setDia] = React.useState(hoy);
  const [claseId, setClaseId] = React.useState<string | null>(null);
  const [motivo, setMotivo] = React.useState("");
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    if (isOnline) void cargarAgenda();
  }, [isOnline, cargarAgenda]);

  const delDia = clases.filter((c) => claveDia(c.inicio) === dia);
  const seleccionada = delDia.find((c) => c.id === claseId) ?? delDia[0] ?? null;
  const anotados = seleccionada ? agendaReservas.filter((r) => r.clase_id === seleccionada.id) : [];

  const ocupacion = (id: string) => agendaReservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length;

  const confirmarCancelacion = async () => {
    if (!seleccionada) return;
    if (await cancelarClase(seleccionada.id, motivo.trim())) {
      setMotivo("");
      dialogRef.current?.close();
    }
  };

  return (
    <section className="space-y-6" aria-labelledby="agenda-titulo" data-testid="class-agenda">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="agenda-titulo" className="text-2xl font-black tracking-tight">Agenda de clases</h1>
          <p className="text-sm text-muted-foreground">Semana en curso · lunes a domingo, hora de Buenos Aires.</p>
        </div>
        {!isOnline && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Sin conexión · agenda guardada, acciones en pausa
          </span>
        )}
      </header>

      <div className="max-w-xl">
        <DaysStrip dias={dias} seleccionado={dia} hoy={hoy} onSeleccionar={(c) => { setDia(c); setClaseId(null); }} />
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={limpiarMensajes} className="min-h-8 px-1 font-bold" aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {cargando && clases.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando agenda…</p>
      ) : delDia.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay clases este día.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className="space-y-2" aria-label="Clases del día">
            {delDia.map((clase) => {
              const ocupados = ocupacion(clase.id);
              const activa = seleccionada?.id === clase.id;
              const cancelada = clase.estado === "CANCELADA";
              return (
                <li key={clase.id}>
                  <button
                    type="button"
                    onClick={() => setClaseId(clase.id)}
                    aria-pressed={activa}
                    className={`w-full rounded-2xl border bg-card p-4 text-left transition-all ${
                      activa ? "border-primary ring-2 ring-primary/30" : "border-border/80 hover:border-primary/40"
                    } ${cancelada ? "opacity-60" : ""}`}
                    data-testid="class-block-card"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xl font-black tabular-nums">{horaLocal(clase.inicio)}</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLOR_ACTIVIDAD[clase.actividad]}`}>
                        {NOMBRE_ACTIVIDAD[clase.actividad]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {cancelada
                        ? "Cancelada"
                        : clase.capacidad
                          ? `${ocupados}/${clase.capacidad} cupos${ocupados >= clase.capacidad ? " · Lleno" : ""}`
                          : `${ocupados} anotados · sin límite de cupo`}
                    </p>
                    {!cancelada && clase.capacidad ? (
                      <div className="mt-2 h-1.5 rounded-full bg-secondary" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (ocupados / clase.capacidad) * 100)}%` }} />
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {seleccionada && (
            <div className="rounded-2xl border border-border/80 bg-card p-5" data-testid="class-detail">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">
                    {NOMBRE_ACTIVIDAD[seleccionada.actividad]} · {horaLocal(seleccionada.inicio)}
                  </h2>
                  <p className="text-xs text-muted-foreground">{seleccionada.duracion_minutos} min</p>
                </div>
                {seleccionada.estado === "PROGRAMADA" && (
                  <Button variant="outline" size="sm" disabled={!isOnline} onClick={() => dialogRef.current?.showModal()}>
                    Cancelar clase
                  </Button>
                )}
              </div>

              {seleccionada.estado === "CANCELADA" && (
                <p className="mt-3 rounded-xl bg-secondary/60 p-3 text-sm">
                  Clase cancelada{seleccionada.motivo_cancelacion ? `: ${seleccionada.motivo_cancelacion}` : ""}.
                </p>
              )}

              {anotados.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Todavía no hay anotados.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border/60" aria-label="Anotados">
                  {anotados.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm font-semibold">{r.alumno_nombre}</span>
                      {r.estado === "ANOTADO" ? (
                        <div className="flex rounded-xl border border-border/80 p-0.5" role="group" aria-label={`Asistencia de ${r.alumno_nombre}`}>
                          <span className="flex min-h-11 items-center rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white">Presente</span>
                          <button
                            type="button"
                            disabled={!isOnline || accionEnCurso === r.id}
                            onClick={() => void marcarAusente(r.id)}
                            className="min-h-11 rounded-lg px-3 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-600 hover:text-white disabled:opacity-50 dark:text-rose-400"
                            data-testid="mark-absent-btn"
                          >
                            Ausente
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            r.estado === "AUSENTE" ? "bg-rose-600/15 text-rose-600 dark:text-rose-400" : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {r.estado === "AUSENTE" ? "Ausente · consume cupo semanal" : "Anulada"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setMotivo("")}
        className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-card p-6 text-foreground backdrop:bg-black/60"
        aria-labelledby="cancelar-clase-titulo"
      >
        <form method="dialog" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void confirmarCancelacion(); }}>
          <h2 id="cancelar-clase-titulo" className="text-lg font-black">¿Cancelar la clase?</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Se anulan las reservas activas ({seleccionada ? ocupacion(seleccionada.id) : 0}).</li>
            <li>A los alumnos no les cuenta en el límite semanal.</li>
          </ul>
          <label className="block space-y-1.5 text-sm font-semibold">
            Motivo
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              minLength={MOTIVO_MINIMO}
              rows={3}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm font-normal"
              placeholder="Ej.: corte de luz en el gimnasio"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>Volver</Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={motivo.trim().length < MOTIVO_MINIMO || accionEnCurso === seleccionada?.id}
            >
              Cancelar clase
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
