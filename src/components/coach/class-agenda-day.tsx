"use client";

import * as React from "react";
import type { Clase, Reserva } from "@/types/database.types";
import { ocupaCupo } from "@/lib/clases";
import { ClaseBlock } from "@/components/coach/clase-block";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";

export interface ClassAgendaDayProps {
  diaClave: string;
  clases: Clase[];
  reservas: Array<Reserva & { alumno_nombre?: string }>;
  ahoraMs?: number;
  claseSeleccionada: Clase | null;
  onSelectClase: (clase: Clase) => void;
  onMarcarAusente: (reservaId: string) => void;
  onQuitarReserva: (reservaId: string) => void;
  onAbrirCancelar: () => void;
  onAbrirAnotar: () => void;
  onActualizarCupo: (nuevoCupo: number) => void;
  onActualizarHora: (nuevaHora: string) => void;
  className?: string;
}

const H = 64; // Altura de hora más cómoda para vista día
const PAD = 12;

export function ClassAgendaDay({
  diaClave,
  clases,
  reservas,
  ahoraMs = Date.now(),
  claseSeleccionada,
  onSelectClase,
  onMarcarAusente,
  onQuitarReserva,
  onAbrirCancelar,
  onAbrirAnotar,
  onActualizarCupo,
  onActualizarHora,
  className = "",
}: ClassAgendaDayProps) {
  const [editandoCupo, setEditandoCupo] = React.useState(false);
  const [nuevoCupoValor, setNuevoCupoValor] = React.useState(
    claseSeleccionada?.capacidad ?? 6
  );

  const [editandoHora, setEditandoHora] = React.useState(false);
  const [nuevaHoraValor, setNuevaHoraValor] = React.useState("18:00");

  React.useEffect(() => {
    if (claseSeleccionada) {
      setNuevoCupoValor(claseSeleccionada.capacidad ?? 6);
      const inicio = new Date(claseSeleccionada.inicio);
      setNuevaHoraValor(
        `${String(inicio.getHours()).padStart(2, "0")}:${String(inicio.getMinutes()).padStart(2, "0")}`
      );
    }
  }, [claseSeleccionada]);

  // Horas del día: 07 a 22
  const horas = Array.from({ length: 15 }, (_, i) => i + 7);

  const calcY = (h: number) => PAD + (h - 7) * H;
  const totalHeight = calcY(22) + PAD;

  const clasesDia = clases.filter((c) => c.inicio.slice(0, 10) === diaClave);

  // Ocupación
  const getOcupacion = (id: string) =>
    reservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length;
  const getEnEspera = (id: string) =>
    reservas.filter((r) => r.clase_id === id && r.estado === "EN_ESPERA").length;

  const anotados = claseSeleccionada
    ? reservas.filter((r) => r.clase_id === claseSeleccionada.id)
    : [];

  const ahoraDate = new Date(ahoraMs);
  const horaActualDec = ahoraDate.getHours() + ahoraDate.getMinutes() / 60;
  const esHoy = ahoraDate.toISOString().slice(0, 10) === diaClave;

  const claseIniciada = claseSeleccionada
    ? new Date(claseSeleccionada.inicio).getTime() <= ahoraMs
    : false;

  const diaDate = new Date(`${diaClave}T12:00:00-03:00`);
  const diaTitulo = diaDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-[1fr_320px] bg-card ${className}`}>
      {/* Columna izquierda: Grilla horaria de 1 columna */}
      <div className="border-r border-border flex flex-col">
        <div className="border-b border-border px-5 py-3 bg-muted/20">
          <h3 className="text-sm font-semibold capitalize text-foreground">{diaTitulo}</h3>
          <p className="text-xs text-muted-foreground font-mono tabular-nums">
            {clasesDia.length} {clasesDia.length === 1 ? "clase programada" : "clases programadas"}
          </p>
        </div>

        <div className="relative overflow-y-auto" style={{ height: `${totalHeight}px` }}>
          <div className="grid grid-cols-[56px_1fr] relative" style={{ height: `${totalHeight}px` }}>
            {/* Eje de Horas */}
            <div className="relative border-r border-border font-mono text-[11px] text-muted-foreground bg-card">
              {horas.map((h) => (
                <div
                  key={h}
                  style={{ top: `${calcY(h) - 7}px` }}
                  className="absolute right-2 leading-none tabular-nums text-[11px]"
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {/* Columna de eventos */}
            <div className="relative">
              {horas.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-border/50"
                  style={{ top: `${calcY(h)}px` }}
                />
              ))}

              {/* Línea de Ahora */}
              {esHoy && horaActualDec >= 7 && horaActualDec <= 22 && (
                <div
                  className="absolute left-0 right-0 z-30 h-0.5 bg-primary pointer-events-none"
                  style={{ top: `${calcY(horaActualDec)}px` }}
                >
                  <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                </div>
              )}

              {/* Bloques de clases */}
              {clasesDia.map((c) => {
                const inicioDate = new Date(c.inicio);
                const horaDec = inicioDate.getHours() + inicioDate.getMinutes() / 60;
                const duracionH = (c.duracion_minutos || 60) / 60;
                const top = calcY(horaDec) + 2;
                const bottom = calcY(horaDec + duracionH);
                const height = Math.max(48, bottom - top - 4);

                return (
                  <ClaseBlock
                    key={c.id}
                    clase={c}
                    ocupados={getOcupacion(c.id)}
                    enEspera={getEnEspera(c.id)}
                    activa={claseSeleccionada?.id === c.id}
                    ahoraMs={ahoraMs}
                    mostrarProgreso={true}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                    }}
                    onSelect={onSelectClase}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Columna derecha: Panel de Detalle y Gestión de la Clase */}
      <div className="p-4 sm:p-5 flex flex-col justify-between bg-card">
        {claseSeleccionada ? (
          <div className="space-y-5">
            {/* Header del detalle */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Detalle de Clase
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    claseSeleccionada.estado === "CANCELADA"
                      ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  }`}
                >
                  {claseSeleccionada.estado}
                </span>
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground mt-1">
                {NOMBRE_ACTIVIDAD[claseSeleccionada.actividad] || claseSeleccionada.actividad}
              </h3>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {new Date(claseSeleccionada.inicio).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })} · {claseSeleccionada.duracion_minutos} min
              </p>
            </div>

            {/* Cupos y Horario */}
            <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Capacidad / Cupos</span>
                {editandoCupo ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={nuevoCupoValor}
                      onChange={(e) => setNuevoCupoValor(Number(e.target.value))}
                      className="w-14 h-7 text-xs font-mono rounded border border-border px-1.5 text-foreground bg-background"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onActualizarCupo(nuevoCupoValor);
                        setEditandoCupo(false);
                      }}
                      className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoCupo(false)}
                      className="text-xs text-muted-foreground hover:text-foreground px-1"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-foreground">
                      {getOcupacion(claseSeleccionada.id)} / {claseSeleccionada.capacidad ?? "∞"} cupos
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditandoCupo(true)}
                      className="text-xs text-primary underline"
                    >
                      Editar
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Horario de inicio</span>
                {editandoHora ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={nuevaHoraValor}
                      onChange={(e) => setNuevaHoraValor(e.target.value)}
                      className="h-7 text-xs font-mono rounded border border-border px-1.5 text-foreground bg-background"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onActualizarHora(nuevaHoraValor);
                        setEditandoHora(false);
                      }}
                      className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoHora(false)}
                      className="text-xs text-muted-foreground hover:text-foreground px-1"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-foreground">
                      {new Date(claseSeleccionada.inicio).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditandoHora(true)}
                      className="text-xs text-primary underline"
                    >
                      Mover
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de Alumnos Anotados */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Anotados ({anotados.length})
                </h4>
                <button
                  type="button"
                  onClick={onAbrirAnotar}
                  className="text-xs font-medium text-primary hover:underline min-h-11 flex items-center"
                >
                  + Anotar alumno
                </button>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {anotados.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No hay alumnos anotados en esta sesión.
                  </p>
                ) : (
                  anotados.map((res) => (
                    <div
                      key={res.id}
                      className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-xs bg-card hover:bg-muted/30"
                    >
                      <div className="truncate">
                        <p className="font-semibold text-foreground truncate">
                          {res.alumno_nombre || "Alumno"}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {res.estado === "EN_ESPERA" ? "En lista de espera" : res.estado}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        {res.estado === "ANOTADO" && (
                          <button
                            type="button"
                            onClick={() => onMarcarAusente(res.id)}
                            disabled={!claseIniciada}
                            data-testid="mark-absent-btn"
                            title={
                              claseIniciada
                                ? "Marcar ausente"
                                : "Solo disponible una vez iniciada la clase"
                            }
                            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                              claseIniciada
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-100"
                                : "text-muted-foreground opacity-50 cursor-not-allowed"
                            }`}
                          >
                            Ausente
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onQuitarReserva(res.id)}
                          className="text-muted-foreground hover:text-foreground px-1"
                          title="Quitar"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Acciones de gestión */}
            {claseSeleccionada.estado !== "CANCELADA" && (
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={onAbrirCancelar}
                  className="w-full h-9 rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 transition-colors"
                >
                  Cancelar clase
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground text-xs">
            <p>Seleccioná una clase en el calendario para ver detalles y gestionar alumnos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
