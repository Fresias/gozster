import * as React from "react";
import type { DiaRutina, MotivoCambioDia, Perfil } from "@/types/database.types";
import { type HistoricalLoadEntry } from "@/services/coach-mock-data";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
} from "@/lib/strength-metrics";
import {
  calcularPuntosGrafico,
  formatearFechaDashboard,
  obtenerEjerciciosDisponibles,
  obtenerIdPlan,
  obtenerNombrePlan,
} from "@/lib/cambio-plan";

export const MOTIVOS_CAMBIO_DIA_MAP: Record<MotivoCambioDia, string> = {
  CANSANCIO_DEPORTE: "Cansancio / otro deporte",
  MOLESTIA: "Molestia",
  POCO_TIEMPO: "Poco tiempo",
  EQUIPO_OCUPADO: "Máquina ocupada",
};

export function formatCambioDia(
  diaSugeridoId: string | null | undefined,
  diaId: string | null | undefined,
  motivo: MotivoCambioDia | null | undefined,
  dias: DiaRutina[] = [],
): string | null {
  if (!diaSugeridoId && !motivo) return null;

  const resolveLabel = (id: string | null | undefined): string => {
    if (!id) return "Día";
    const found = dias.find((d) => d.id === id);
    if (found) return `Día ${found.orden}`;
    const match = id.match(/\d+/);
    if (match) return `Día ${match[0]}`;
    return id;
  };

  const sugeridoLabel = resolveLabel(diaSugeridoId);
  const hechoLabel = resolveLabel(diaId);
  const motivoTexto = motivo ? MOTIVOS_CAMBIO_DIA_MAP[motivo] || motivo : null;

  if (motivoTexto) {
    return `Cambió ${sugeridoLabel} → ${hechoLabel} · ${motivoTexto}`;
  }
  return `Cambió ${sugeridoLabel} → ${hechoLabel}`;
}

export interface HistoricalLoadsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alumno: Perfil | null;
  historial?: HistoricalLoadEntry[];
  dias?: DiaRutina[];
}

export function HistoricalLoadsDrawer({
  isOpen,
  onClose,
  alumno,
  historial,
  dias: diasProp,
}: HistoricalLoadsDrawerProps) {
  const storeDias = useCoachStudioStore((state) => state.dias);
  const storePlanes = useCoachStudioStore((state) => state.planes);
  const diasList = diasProp || storeDias || [];

  const [selectedEjercicioId, setSelectedEjercicioId] = React.useState<string | null>(null);

  // Normalizar historial con plan si no venía precargado
  const historialConPlanes = React.useMemo(() => {
    if (!historial) return [];
    return historial.map((entry) => {
      if (entry.plan !== undefined) {
        return entry;
      }
      if (!entry.sesion.dia_id) {
        return { ...entry, plan: null };
      }
      const dia = diasList.find((d) => d.id === entry.sesion.dia_id);
      if (!dia || !dia.plan_id) {
        return { ...entry, plan: null };
      }
      const plan = storePlanes.find((p) => p.id === dia.plan_id);
      return {
        ...entry,
        plan: plan ? { id: plan.id, nombre: plan.nombre } : null,
      };
    });
  }, [historial, diasList, storePlanes]);

  const ejerciciosDisponibles = React.useMemo(
    () => obtenerEjerciciosDisponibles(historialConPlanes),
    [historialConPlanes],
  );

  const datosGrafico = React.useMemo(
    () => calcularPuntosGrafico(historialConPlanes, selectedEjercicioId),
    [historialConPlanes, selectedEjercicioId],
  );

  if (!isOpen || !alumno) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="historical-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm transition-opacity"
    >
      <div className="flex h-full w-full max-w-lg flex-col bg-card text-card-foreground shadow-2xl transition-transform duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h2
              id="historical-drawer-title"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              Cargas y RPE Históricos
            </h2>
            <p className="text-xs text-muted-foreground">
              Atleta:{" "}
              <span className="font-semibold text-foreground">
                {alumno.nombre_completo}
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar panel de historial"
            className="min-h-11 min-w-11 text-xs"
          >
            ✕ Cerrar
          </Button>
        </div>

        {/* Estado cargando (spec §6.6): esqueleto en lugar del gráfico */}
        {historial === undefined && (
          <div className="border-b border-border p-4 sm:p-5">
            <div
              className="h-28 rounded-md bg-muted animate-pulse motion-reduce:animate-none"
              data-testid="cargas-historicas-skeleton"
            />
          </div>
        )}

        {/* Gráfico mínimo arriba de la lista con marcas de cambio de plan (spec §6.2, §6.4) */}
        {historial && historial.length > 0 && (
          <div className="border-b border-border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                CARGA MÁXIMA POR SESIÓN [{datosGrafico.unidad}]
              </span>
              {ejerciciosDisponibles.length > 0 && (
                <select
                  aria-label="Ejercicio del gráfico"
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={datosGrafico.ejercicioId ?? ""}
                  onChange={(e) => setSelectedEjercicioId(e.target.value)}
                >
                  {ejerciciosDisponibles.map((ej) => (
                    <option key={ej.id} value={ej.id}>
                      {ej.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {datosGrafico.puntos.length <= 1 ? (
              <div className="flex h-28 w-full items-center justify-center text-xs text-muted-foreground">
                Con 2 sesiones de este ejercicio se dibuja la evolución.
              </div>
            ) : (
              <div className="relative h-28 w-full pt-5">
                {/* Etiqueta del primer plan en left: 0 */}
                <span
                  title={datosGrafico.etiquetaPrimerPlan}
                  style={{ left: "0%" }}
                  className={`absolute top-0 max-w-[30%] truncate pl-1 text-[10px] font-semibold text-muted-foreground ${
                    datosGrafico.primerPlanOculto ? "sr-only" : ""
                  }`}
                >
                  {!datosGrafico.primerPlanOculto && datosGrafico.etiquetaPrimerPlan}
                </span>

                {/* Marcas de plan */}
                {datosGrafico.marcas.map((m) => (
                  <span
                    key={`etiqueta-${m.sesionId}-${m.indice}`}
                    title={m.planNuevo}
                    style={{ left: `${m.x}%` }}
                    className={`absolute top-0 max-w-[30%] truncate pl-1 text-[10px] font-semibold text-muted-foreground ${
                      m.ocultarEtiqueta ? "sr-only" : ""
                    }`}
                  >
                    {!m.ocultarEtiqueta && m.planNuevo}
                  </span>
                ))}

                {/* SVG inline */}
                <svg
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  className="h-full w-full"
                  role="img"
                  aria-label={datosGrafico.ariaLabel}
                >
                  {datosGrafico.marcas.map((m) => (
                    <line
                      key={`line-${m.sesionId}-${m.indice}`}
                      x1={m.x}
                      y1="0"
                      x2={m.x}
                      y2="40"
                      stroke="currentColor"
                      className="text-muted-foreground"
                      strokeDasharray="2 2"
                      vectorEffect="non-scaling-stroke"
                      data-testid="cambio-plan-linea"
                    />
                  ))}
                  <polyline
                    points={datosGrafico.polylinePoints}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
            )}

            {/* Pie del gráfico (spec §6.4): valor máx, sesiones y fuente INDEC */}
            {datosGrafico.puntos.length > 0 && (
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <span className="font-mono tabular-nums text-foreground">
                    {datosGrafico.maxValor}
                  </span>{" "}
                  {datosGrafico.unidad} máx ·{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {datosGrafico.puntos.length}
                  </span>{" "}
                  {datosGrafico.puntos.length === 1 ? "sesión" : "sesiones"}
                </span>
                <span>Fuente: Registro GOZSter</span>
              </div>
            )}
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {!historial || historial.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay registros de cargas previas para este alumno.
              </p>
            </div>
          ) : (
            historialConPlanes.map((entry, idx) => {
              const fechaFormatted = new Date(entry.sesion.fecha).toLocaleDateString(
                "es-AR",
                {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                },
              );

              // Separador de cambio de plan (spec §6.5):
              // La lista va de más nueva a más vieja. Si la sesión anterior cronológica (idx + 1)
              // tenía un plan distinto, esta sesión (idx) es la primera sesión del plan nuevo.
              const sesionAnteriorCronologica = historialConPlanes[idx + 1];
              const hayCambioDePlan =
                sesionAnteriorCronologica &&
                obtenerIdPlan(entry.plan) !== obtenerIdPlan(sesionAnteriorCronologica.plan);

              return (
                <React.Fragment key={entry.sesion.id}>
                  <div className="rounded-lg border border-border bg-background/50 p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div>
                        <span className="text-xs font-bold uppercase text-primary">
                          Sesión #{historialConPlanes.length - idx}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {fechaFormatted}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-foreground">
                          Volumen: {entry.sesion.volumen_total_kg} kg
                        </span>
                        {entry.sesion.duracion_minutos && (
                          <p className="text-[11px] text-muted-foreground">
                            {entry.sesion.duracion_minutos} min
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Línea discreta de cambio de día (GOZS-149) */}
                    {(() => {
                      const cambioTexto = formatCambioDia(
                        entry.sesion.dia_sugerido_id,
                        entry.sesion.dia_id,
                        entry.sesion.motivo_cambio_dia,
                        diasList,
                      );
                      if (!cambioTexto) return null;
                      return (
                        <div
                          className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400"
                          data-testid="sesion-cambio-dia-info"
                        >
                          {cambioTexto}
                        </div>
                      );
                    })()}

                    {/* Series del entrenamiento */}
                    <div className="mt-3 space-y-2.5">
                      {entry.series.map((serie) => {
                        const epley1rm = calculateEpley1RM(
                          serie.peso_kg,
                          serie.reps_hechas,
                        );
                        const brzycki1rm = calculateBrzycki1RM(
                          serie.peso_kg,
                          serie.reps_hechas,
                        );
                        const volumenSerie = calculateBlockVolume(
                          1,
                          serie.reps_hechas,
                          serie.peso_kg,
                        );

                        return (
                          <div
                            key={serie.id}
                            className="rounded-md border border-border/40 bg-secondary/30 p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground">
                                {serie.ejercicioNombre}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                Serie {serie.numero_serie}
                              </Badge>
                            </div>

                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="rounded bg-background/80 p-1.5 text-center">
                                <span className="block text-[10px] text-muted-foreground">
                                  Carga
                                </span>
                                <span className="font-bold text-foreground">
                                  {serie.peso_kg} kg
                                </span>
                              </div>
                              <div className="rounded bg-background/80 p-1.5 text-center">
                                <span className="block text-[10px] text-muted-foreground">
                                  Reps
                                </span>
                                <span className="font-bold text-foreground">
                                  {serie.reps_hechas}
                                </span>
                              </div>
                              <div className="rounded bg-background/80 p-1.5 text-center">
                                <span className="block text-[10px] text-muted-foreground">
                                  RPE Real
                                </span>
                                <span className="font-bold text-primary">
                                  @{serie.rpe_real ?? "N/A"}
                                </span>
                              </div>
                              <div className="rounded bg-background/80 p-1.5 text-center">
                                <span className="block text-[10px] text-muted-foreground">
                                  1RM Est.
                                </span>
                                <span className="font-bold text-foreground">
                                  {epley1rm.toFixed(0)} kg
                                </span>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Volumen serie: {volumenSerie} kg</span>
                              <span>Brzycki 1RM: {brzycki1rm.toFixed(1)} kg</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Separador de cambio de plan (spec §6.5) */}
                  {hayCambioDePlan && (
                    <div
                      role="separator"
                      className="flex items-center gap-2 py-1 text-[11px] font-semibold text-muted-foreground"
                      data-testid="cambio-plan-separador"
                    >
                      <span className="h-px flex-1 bg-border" />
                      <span>
                        Cambio de plan:{" "}
                        <span className="text-foreground">
                          {obtenerNombrePlan(sesionAnteriorCronologica.plan)}
                        </span>{" "}
                        →{" "}
                        <span className="text-foreground">
                          {obtenerNombrePlan(entry.plan)}
                        </span>{" "}
                        · {formatearFechaDashboard(entry.sesion.fecha)}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <Button
            variant="secondary"
            size="touch"
            className="w-full text-xs font-semibold"
            onClick={onClose}
          >
            Entendido, volver a rutina
          </Button>
        </div>
      </div>
    </div>
  );
}
