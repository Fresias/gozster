import * as React from "react";
import type { AlertaSobrecargaProgresiva } from "@/store/use-coach-studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export interface ProgressiveOverloadFeedProps {
  alertas: AlertaSobrecargaProgresiva[];
  onSelectAlumno: (alumnoId: string) => void;
  onOpenHistoricalLoads: (alumnoId: string) => void;
  className?: string;
}

export type OverloadFilter = "ALL" | "RECORD_1RM" | "CARGA" | "VOLUMEN";

export function ProgressiveOverloadFeed({
  alertas,
  onSelectAlumno,
  onOpenHistoricalLoads,
  className,
}: ProgressiveOverloadFeedProps) {
  const [filter, setFilter] = React.useState<OverloadFilter>("ALL");

  const recordsCount = alertas.filter((a) => a.esNuevoRecord1RM).length;
  const loadCount = alertas.filter((a) => (a.deltaPesoKg ?? 0) > 0).length;
  const volumeCount = alertas.filter((a) => (a.deltaVolumenKg ?? 0) > 0).length;

  const filteredAlertas = alertas.filter((a) => {
    if (filter === "RECORD_1RM") return a.esNuevoRecord1RM;
    if (filter === "CARGA") return (a.deltaPesoKg ?? 0) > 0;
    if (filter === "VOLUMEN") return (a.deltaVolumenKg ?? 0) > 0;
    return true;
  });

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  const getWhatsAppCongratsUrl = (alerta: AlertaSobrecargaProgresiva) => {
    const primerNombre = alerta.alumnoNombre.split(" ")[0] ?? "Atleta";
    const deltaMsg = alerta.deltaPesoKg && alerta.deltaPesoKg > 0
      ? ` con un aumento de +${alerta.deltaPesoKg}kg (alcanzaste ${alerta.pesoMaxKg}kg)`
      : ` alcanzando ${alerta.pesoMaxKg}kg`;
    const recordMsg = alerta.esNuevoRecord1RM
      ? ` ¡Además lograste un NUEVO RÉCORD de 1RM estimado en ${alerta.mejor1rmEpley}kg!`
      : ` (1RM estimado: ${alerta.mejor1rmEpley}kg).`;

    const texto = `¡Felicitaciones ${primerNombre}! Detectamos una sobrecarga progresiva en ${alerta.ejercicioNombre}${deltaMsg}.${recordMsg} ¡A seguir metiéndole con todo! 💪🚀`;
    return `https://wa.me/?text=${encodeURIComponent(texto)}`;
  };

  return (
    <div className={`space-y-4 ${className ?? ""}`} data-testid="progressive-overload-feed">
      {/* Header and Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Feed de Alertas de Sobrecarga Progresiva
            </h2>
            <Badge variant="success" className="text-[10px]">
              RPC Activa
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Detección automática de progresión en cargas, volumen y estimación de 1RM (Epley / Brzycki).
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Filtros de sobrecarga">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
              filter === "ALL"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            Todas ({alertas.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("RECORD_1RM")}
            className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
              filter === "RECORD_1RM"
                ? "bg-amber-500/20 text-amber-400"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            🏆 Récords 1RM ({recordsCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("CARGA")}
            className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
              filter === "CARGA"
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            🔥 Carga ({loadCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("VOLUMEN")}
            className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
              filter === "VOLUMEN"
                ? "bg-sky-500/20 text-sky-400"
                : "text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            📈 Volumen ({volumeCount})
          </button>
        </div>
      </div>

      {/* Feed List */}
      {filteredAlertas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No se registraron sobrecargas progresivas con el filtro seleccionado.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilter("ALL")}
              className="min-h-11 text-xs"
            >
              Restablecer filtros
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlertas.map((alerta) => {
            const fechaStr = new Date(alerta.fecha).toLocaleDateString("es-AR", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <Card
                key={alerta.id}
                data-testid={`alert-card-${alerta.id}`}
                className="w-full max-w-full overflow-hidden border-border/80 bg-card/95 shadow-sm transition-all hover:border-primary/50"
              >
                <CardHeader className="p-4 sm:p-5 pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
                        aria-hidden="true"
                      >
                        {getInitials(alerta.alumnoNombre)}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onSelectAlumno(alerta.alumnoId)}
                          className="truncate text-left text-sm font-bold text-foreground hover:text-primary transition-colors focus:outline-none"
                        >
                          {alerta.alumnoNombre}
                        </button>
                        <p className="text-xs font-medium text-primary">
                          {alerta.ejercicioNombre}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {alerta.esNuevoRecord1RM && (
                        <Badge variant="warning">🏆 Nuevo Récord 1RM</Badge>
                      )}
                      {alerta.deltaPesoKg && alerta.deltaPesoKg > 0 && (
                        <Badge variant="success">+{alerta.deltaPesoKg} kg Carga</Badge>
                      )}
                      {alerta.deltaVolumenKg && alerta.deltaVolumenKg > 0 && (
                        <Badge variant="secondary">+{alerta.deltaVolumenKg} kg Volumen</Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground ml-1">
                        {fechaStr}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 pt-0 space-y-3">
                  {/* Comparativa Metrics Box */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
                    {/* Carga Máxima */}
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Carga Máxima
                      </span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-bold text-foreground">
                          {alerta.pesoMaxKg} kg
                        </span>
                        {alerta.pesoPrevioKg !== null && (
                          <span className="text-[11px] text-muted-foreground">
                            (ant: {alerta.pesoPrevioKg} kg)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Volumen del Ejercicio */}
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Volumen del Ejercicio
                      </span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-bold text-foreground">
                          {alerta.volumenEjercicioKg.toLocaleString()} kg
                        </span>
                        {alerta.volumenPrevioKg !== null && (
                          <span className="text-[11px] text-muted-foreground">
                            (ant: {alerta.volumenPrevioKg.toLocaleString()} kg)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 1RM Estimado */}
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        1RM Estimado (Epley / Brzycki)
                      </span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-bold text-amber-400">
                          {alerta.mejor1rmEpley} kg
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          / {alerta.mejor1rmBrzycki} kg
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenHistoricalLoads(alerta.alumnoId)}
                      className="min-h-11 text-xs"
                    >
                      📊 Ver Cargas Históricas
                    </Button>
                    <a
                      href={getWhatsAppCongratsUrl(alerta)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center justify-center rounded-md font-medium text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 active:scale-95 transition-all"
                    >
                      💬 Felicitar por WhatsApp
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
