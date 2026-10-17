"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";

export interface CriticalAlert {
  id: string;
  type: "DOLOR";
  alumnoId: string;
  alumnoNombre: string;
  ejercicioNombre: string;
  setNumber: number;
  detalle: string;
  fecha: string;
  resolved: boolean;
  zona?: string;
}

export interface CriticalAlertsInboxProps {
  onSelectAlumno?: (alumnoId: string) => void;
  onQuickSwap?: (alert: CriticalAlert) => void;
}

/**
 * Bandeja de Alertas Críticas Compacta (Exclusiva Dolor Articular).
 * Filtrado estricto de eventos de dolor muscular/articular (DOLOR).
 * Layout denso y contenido sin espacio muerto, con botón rápido para Sustituir Ejercicio (Quick Swap).
 */
export function CriticalAlertsInbox({
  onSelectAlumno,
  onQuickSwap,
}: CriticalAlertsInboxProps) {
  const { mode } = useWorkspaceModeStore();
  const [alerts, setAlerts] = React.useState<CriticalAlert[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(true);

  const fetchAlerts = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Filtrar estrictamente series con dolor articular reportado
      const { data: seriesData } = await supabase
        .from("registro_series")
        .select(`
          id,
          sesion_id,
          ejercicio_id,
          numero_serie,
          pain_reported,
          pain_notes,
          created_at,
          ejercicios (nombre),
          registro_sesiones (alumno_id, perfiles (nombre_completo))
        `)
        .eq("pain_reported", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (seriesData && seriesData.length > 0) {
        const mapped: CriticalAlert[] = seriesData.map((s: any) => {
          const alumno = s.registro_sesiones?.perfiles?.nombre_completo || "Alumno GOZSter";
          const alumnoId = s.registro_sesiones?.alumno_id || "";
          const ejNombre = s.ejercicios?.nombre || "Ejercicio de Fuerza";
          const notes = s.pain_notes || "Molestia articular informada en serie";

          // Detectar zona articular
          let zona = "Articular";
          if (/rodilla/i.test(notes)) zona = "Rodilla";
          else if (/hombro/i.test(notes)) zona = "Hombro";
          else if (/lumbar|espalda/i.test(notes)) zona = "Lumbar";
          else if (/codo/i.test(notes)) zona = "Codo";
          else if (/muñeca/i.test(notes)) zona = "Muñeca";

          return {
            id: s.id,
            type: "DOLOR",
            alumnoId,
            alumnoNombre: alumno,
            ejercicioNombre: ejNombre,
            setNumber: s.numero_serie,
            detalle: notes,
            fecha: new Date(s.created_at).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
            resolved: false,
            zona,
          };
        });
        setAlerts(mapped);
      } else {
        // Fallback demo inicial: estrictamente alertas rojas de dolor articular
        setAlerts([
          {
            id: "alert-demo-dolor-1",
            type: "DOLOR",
            alumnoId: "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7",
            alumnoNombre: "Celeste Gerardi",
            ejercicioNombre: "Sentadilla Trasera con Barra",
            setNumber: 3,
            detalle: "[Dolor: MODERADO] Rodilla - Pinchazo en la fase concéntrica al subir",
            fecha: "Hoy, 10:45",
            resolved: false,
            zona: "Rodilla",
          },
          {
            id: "alert-demo-dolor-2",
            type: "DOLOR",
            alumnoId: "a1111111-1111-4111-8111-111111111101",
            alumnoNombre: "Lucas Giménez",
            ejercicioNombre: "Press de Banca Plano",
            setNumber: 2,
            detalle: "[Dolor: LEVE] Hombro - Molestia en tendón anterior al descender la barra",
            fecha: "Hoy, 12:15",
            resolved: false,
            zona: "Hombro",
          },
        ]);
      }
    } catch (e) {
      console.warn("Fallo cargando alertas críticas de dolor:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (mode === "TESTEO") {
      setAlerts(DEMO_CRITICAL_ALERTS);
      setIsLoading(false);
    } else {
      fetchAlerts();
    }
  }, [mode, fetchAlerts]);

  // Filtrar estrictamente DOLOR y no resueltas
  const activeAlerts = alerts.filter((a) => !a.resolved && a.type === "DOLOR");

  if (activeAlerts.length === 0) return null;

  return (
    <div
      className="max-w-4xl rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3 shadow-md backdrop-blur-sm"
      data-testid="critical-alerts-inbox"
    >
      {/* Header compacto con ancho contenido */}
      <div className="flex items-center justify-between border-b border-destructive/20 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-black animate-pulse">
            {activeAlerts.length}
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span>Bandeja de Alertas Críticas (Dolor Articular)</span>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-bold">
                Exclusivo Dolor
              </Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Molestias articulares reportadas durante series efectivas de entrenamiento
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-1 rounded transition-colors"
        >
          {isExpanded ? "Ocultar ▲" : "Mostrar ▼"}
        </button>
      </div>

      {/* Lista de alertas compacta sin espacios muertos */}
      {isExpanded && (
        <div className="space-y-2 pt-1">
          {activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-xs transition-colors hover:bg-destructive/15"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="text-lg pt-0.5 select-none" aria-hidden="true">
                  🚨
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground text-xs">
                      {alert.alumnoNombre}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="font-semibold text-foreground/90">
                      {alert.ejercicioNombre} (Serie {alert.setNumber})
                    </span>
                    {alert.zona && (
                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-destructive/20 text-destructive border border-destructive/30">
                        {alert.zona}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {alert.fecha}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/90 mt-1 font-medium leading-relaxed">
                    {alert.detalle}
                  </p>
                </div>
              </div>

              {/* Botones de acción compactos y táctiles */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {onQuickSwap && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onQuickSwap(alert)}
                    className="min-h-10 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 rounded-lg shadow-xs gap-1"
                    title="Sustituir Ejercicio por alternativa biomecánica segura"
                  >
                    <span>🔄 Sustituir Ejercicio</span>
                  </Button>
                )}
                {onSelectAlumno && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-10 text-[11px] font-semibold border-border/80 px-3 rounded-lg"
                    onClick={() => onSelectAlumno(alert.alumnoId)}
                  >
                    Ver Alumno
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="min-h-10 text-[11px] bg-foreground text-background hover:bg-foreground/80 font-bold px-3 rounded-lg"
                  onClick={() =>
                    setAlerts((prev) =>
                      prev.map((a) => (a.id === alert.id ? { ...a, resolved: true } : a))
                    )
                  }
                >
                  ✓ Resolver
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
