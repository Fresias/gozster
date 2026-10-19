"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";

export type AlertaEstado = "PENDIENTE" | "ATENDIDO" | "CERRADO" | "RESUELTO";
export type AlertaSeveridad = "BAJA" | "MEDIA" | "ALTA" | "CRITICA";

export interface CriticalAlert {
  id: string;
  type: "DOLOR";
  alumnoId: string;
  alumnoNombre: string;
  ejercicioNombre: string;
  ejercicioId?: string;
  ejercicioEnRutinaId?: string;
  setNumber: number;
  detalle: string;
  fecha: string;
  resolved: boolean;
  zona?: string;
  severidad?: AlertaSeveridad;
  estado?: AlertaEstado;
  sintomasAlarma?: string[];
  esSintomaAlarma?: boolean;
  reporteDolorId?: string;
  momentoAparicion?: string;
}

export interface CriticalAlertsInboxProps {
  onSelectAlumno?: (alumnoId: string) => void;
  onQuickSwap?: (alert: CriticalAlert) => void;
}

/**
 * Bandeja de Alertas Críticas Compacta (Exclusiva Dolor Articular y Red Flags).
 * Permite gestionar el ciclo de vida del reporte (PENDIENTE, ATENDIDO, CERRADO),
 * con visualización destacada de severidad CRÍTICA y Síntomas de Alarma.
 */
export function CriticalAlertsInbox({
  onSelectAlumno,
  onQuickSwap,
}: CriticalAlertsInboxProps) {
  const { mode } = useWorkspaceModeStore();
  const [alerts, setAlerts] = React.useState<CriticalAlert[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<"PENDIENTE" | "ATENDIDO" | "CERRADO" | "TODAS">(
    "PENDIENTE"
  );

  const fetchAlerts = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Intentar consultar alertas_entrenador y alumno_historial_dolor
      const { data: dbAlerts } = await supabase
        .from("alertas_entrenador")
        .select(`
          id,
          alumno_id,
          profesor_id,
          ejercicio_id,
          serie_id,
          tipo_alerta,
          severidad,
          titulo,
          detalle,
          estado,
          accion_tomada,
          created_at,
          ejercicios (id, nombre),
          perfiles!alertas_entrenador_alumno_id_fkey (id, nombre_completo)
        `)
        .eq("tipo_alerta", "DOLOR_ARTICULAR")
        .order("created_at", { ascending: false })
        .limit(30);

      if (dbAlerts && dbAlerts.length > 0) {
        const mapped: CriticalAlert[] = dbAlerts.map((a: any) => {
          const alumno = a.perfiles?.nombre_completo || "Alumno GOZSter";
          const alumnoId = a.alumno_id || "";
          const ejNombre = a.ejercicios?.nombre || "Ejercicio de Fuerza";
          const notes = a.detalle || a.titulo || "Molestia articular informada";
          const isCritical = a.severidad === "CRITICA" || /RED FLAG/i.test(a.titulo || "");

          // Detectar zona articular
          let zona = "Articular";
          if (/rodilla/i.test(notes) || /rodilla/i.test(a.titulo || "")) zona = "Rodilla";
          else if (/hombro/i.test(notes) || /hombro/i.test(a.titulo || "")) zona = "Hombro";
          else if (/lumbar|espalda/i.test(notes) || /lumbar/i.test(a.titulo || "")) zona = "Lumbar";
          else if (/codo/i.test(notes)) zona = "Codo";
          else if (/muñeca/i.test(notes)) zona = "Muñeca";

          // Detectar síntomas de alarma en texto si existen
          const sintomas: string[] = [];
          if (/punzante|súbito/i.test(notes)) sintomas.push("Dolor punzante/súbito");
          if (/irradiación|adormecimiento/i.test(notes)) sintomas.push("Irradiación/adormecimiento");
          if (/mareo|aire/i.test(notes)) sintomas.push("Mareo/falta de aire");
          if (/inestabilidad/i.test(notes)) sintomas.push("Inestabilidad articular");

          const normalizedEstado: AlertaEstado =
            a.estado === "ATENDIDO"
              ? "ATENDIDO"
              : a.estado === "CERRADO" || a.estado === "RESUELTO"
              ? "CERRADO"
              : "PENDIENTE";

          return {
            id: a.id,
            type: "DOLOR",
            alumnoId,
            alumnoNombre: alumno,
            ejercicioNombre: ejNombre,
            ejercicioId: a.ejercicio_id || undefined,
            setNumber: 1,
            detalle: notes,
            fecha: new Date(a.created_at).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
            resolved: normalizedEstado === "CERRADO",
            zona,
            severidad: isCritical ? "CRITICA" : ((a.severidad as AlertaSeveridad) || "ALTA"),
            estado: normalizedEstado,
            esSintomaAlarma: isCritical || sintomas.length > 0,
            sintomasAlarma: sintomas,
          };
        });
        setAlerts(mapped);
        return;
      }

      // 2. Fallback a series con pain_reported
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
          ejercicios (id, nombre),
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
          const isCritical = /AGUDO/i.test(notes) || /RED FLAG/i.test(notes);

          let zona = "Articular";
          if (/rodilla/i.test(notes)) zona = "Rodilla";
          else if (/hombro/i.test(notes)) zona = "Hombro";
          else if (/lumbar|espalda/i.test(notes)) zona = "Lumbar";
          else if (/codo/i.test(notes)) zona = "Codo";
          else if (/muñeca/i.test(notes)) zona = "Muñeca";

          const sintomas: string[] = [];
          if (/punzante|súbito/i.test(notes)) sintomas.push("Dolor punzante/súbito");
          if (/irradiación|adormecimiento/i.test(notes)) sintomas.push("Irradiación/adormecimiento");
          if (/mareo|aire/i.test(notes)) sintomas.push("Mareo/falta de aire");
          if (/inestabilidad/i.test(notes)) sintomas.push("Inestabilidad articular");

          return {
            id: s.id,
            type: "DOLOR",
            alumnoId,
            alumnoNombre: alumno,
            ejercicioNombre: ejNombre,
            ejercicioId: s.ejercicio_id || undefined,
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
            severidad: isCritical ? "CRITICA" : "ALTA",
            estado: "PENDIENTE",
            esSintomaAlarma: isCritical || sintomas.length > 0,
            sintomasAlarma: sintomas,
          };
        });
        setAlerts(mapped);
      } else {
        // Fallback demo inicial enriquecido con estados y severidad
        setAlerts([
          {
            id: "alert-demo-dolor-1",
            type: "DOLOR",
            alumnoId: "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7",
            alumnoNombre: "Celeste Gerardi",
            ejercicioNombre: "Sentadilla Trasera con Barra",
            ejercicioId: "e1111111-1111-4111-8111-111111111101",
            setNumber: 3,
            detalle: "[Dolor: AGUDO] Rodilla - Pinchazo súbito e inestabilidad articular al subir",
            fecha: "Hoy, 10:45",
            resolved: false,
            zona: "Rodilla",
            severidad: "CRITICA",
            estado: "PENDIENTE",
            esSintomaAlarma: true,
            sintomasAlarma: ["Dolor punzante/súbito", "Inestabilidad articular"],
            momentoAparicion: "EN_SERIE",
          },
          {
            id: "alert-demo-dolor-2",
            type: "DOLOR",
            alumnoId: "a1111111-1111-4111-8111-111111111101",
            alumnoNombre: "Lucas Giménez",
            ejercicioNombre: "Press de Banca Plano",
            ejercicioId: "e2222222-2222-4222-8222-222222222202",
            setNumber: 2,
            detalle: "[Dolor: MODERADO] Hombro - Molestia anterior al descender la barra",
            fecha: "Hoy, 12:15",
            resolved: false,
            zona: "Hombro",
            severidad: "MEDIA",
            estado: "PENDIENTE",
            esSintomaAlarma: false,
            sintomasAlarma: [],
            momentoAparicion: "EN_SERIE",
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
      // Mapear dataset demo con compatibilidad de estados
      const mappedDemo: CriticalAlert[] = DEMO_CRITICAL_ALERTS.map((d, idx) => ({
        ...d,
        severidad: idx === 0 || idx === 4 ? "CRITICA" : "ALTA",
        estado: (d.estado as AlertaEstado) || "PENDIENTE",
        esSintomaAlarma: idx === 0 || idx === 4 || Boolean(d.esSintomaAlarma),
        sintomasAlarma:
          d.sintomasAlarma ||
          (idx === 0
            ? ["Dolor punzante/súbito", "Inestabilidad articular"]
            : idx === 4
            ? ["Irradiación/adormecimiento"]
            : []),
        zona: d.zona || (/rodilla/i.test(d.detalle) ? "Rodilla" : "Hombro"),
      }));
      setAlerts(mappedDemo);
      setIsLoading(false);
    } else {
      fetchAlerts();
    }
  }, [mode, fetchAlerts]);

  // Cambiar estado del reporte (PENDIENTE, ATENDIDO, CERRADO)
  const handleUpdateStatus = async (alertId: string, nuevoEstado: AlertaEstado) => {
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id !== alertId) return a;
        return {
          ...a,
          estado: nuevoEstado,
          resolved: nuevoEstado === "CERRADO" || nuevoEstado === "RESUELTO",
        };
      })
    );

    try {
      await supabase
        .from("alertas_entrenador")
        .update({
          estado: nuevoEstado,
          resuelto_at: nuevoEstado === "CERRADO" || nuevoEstado === "RESUELTO" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alertId);
    } catch {
      // Silencioso en modo local o mock
    }
  };

  // Contadores por estado
  const countPendientes = alerts.filter((a) => (a.estado || "PENDIENTE") === "PENDIENTE").length;
  const countAtendidos = alerts.filter((a) => a.estado === "ATENDIDO").length;
  const countCerrados = alerts.filter((a) => a.estado === "CERRADO" || a.estado === "RESUELTO").length;

  // Filtrado según la pestaña activa (estrictamente alertas rojas de dolor articular)
  const filteredAlerts = alerts.filter((a) => {
    if (a.type !== "DOLOR" && !(a.type === "DOLOR")) return false;
    const estado = a.estado || "PENDIENTE";
    if (statusFilter === "TODAS") return a.type === "DOLOR";
    if (statusFilter === "CERRADO")
      return (estado === "CERRADO" || estado === "RESUELTO") && a.type === "DOLOR";
    return estado === statusFilter && a.type === "DOLOR";
  });

  if (alerts.length === 0 && !isLoading) return null;

  return (
    <div
      className="max-w-4xl rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3 shadow-md backdrop-blur-sm"
      data-testid="critical-alerts-inbox"
    >
      {/* Header con conteo y botón colapsar */}
      <div className="flex items-center justify-between border-b border-destructive/20 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-black animate-pulse">
            {countPendientes}
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
              <span>Bandeja de Alertas Críticas (Dolor Articular &amp; Red Flags)</span>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-bold">
                Triage Biomecánico
              </Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Molestias reportadas por atletas. Protocolo de atención y sustitución trazable del Coach.
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

      {isExpanded && (
        <div className="space-y-3 pt-1">
          {/* Pestañas de Filtrado por Estado */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
            data-testid="alerts-status-filter-container"
          >
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mr-1">
              Estado:
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter("PENDIENTE")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-8 ${
                statusFilter === "PENDIENTE"
                  ? "bg-destructive text-destructive-foreground shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-pendientes"
            >
              <span>Pendientes</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-background/20 font-mono">
                {countPendientes}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("ATENDIDO")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-8 ${
                statusFilter === "ATENDIDO"
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-atendidos"
            >
              <span>Atendidos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-background/20 font-mono">
                {countAtendidos}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("CERRADO")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-8 ${
                statusFilter === "CERRADO"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-cerrados"
            >
              <span>Cerrados</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-background/20 font-mono">
                {countCerrados}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("TODAS")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all min-h-8 ${
                statusFilter === "TODAS"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-todas"
            >
              Todas ({alerts.length})
            </button>
          </div>

          {/* Lista de Alertas */}
          {filteredAlerts.length === 0 ? (
            <div className="p-4 rounded-xl border border-border/60 bg-card/60 text-center text-xs text-muted-foreground">
              No hay alertas en estado <strong>{statusFilter.toLowerCase()}</strong> en este momento.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAlerts.map((alert) => {
                const isCritical = alert.severidad === "CRITICA" || alert.esSintomaAlarma;
                const estado = alert.estado || "PENDIENTE";

                return (
                  <div
                    key={alert.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border text-xs transition-colors ${
                      isCritical
                        ? "border-destructive/50 bg-destructive/15 hover:bg-destructive/20"
                        : "border-border/80 bg-card hover:bg-secondary/30"
                    }`}
                    data-testid={`alert-card-${alert.id}`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-xl pt-0.5 select-none" aria-hidden="true">
                        {isCritical ? "🚨" : "⚠️"}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-foreground text-xs">
                            {alert.alumnoNombre}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="font-semibold text-foreground/90">
                            {alert.ejercicioNombre} (Serie {alert.setNumber})
                          </span>

                          {/* Badge de Zona */}
                          {alert.zona && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary text-secondary-foreground border border-border/60">
                              {alert.zona}
                            </span>
                          )}

                          {/* Badge de Severidad CRÍTICA / Red Flag */}
                          {isCritical && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-2 py-0.5 font-black uppercase tracking-wider bg-destructive text-destructive-foreground animate-pulse"
                              data-testid="red-flag-badge"
                            >
                              🚨 CRÍTICA / RED FLAG
                            </Badge>
                          )}

                          {/* Badge de Estado del Reporte */}
                          <Badge
                            className={`text-[10px] px-2 py-0.5 font-bold ${
                              estado === "PENDIENTE"
                                ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                                : estado === "ATENDIDO"
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            }`}
                            data-testid={`alert-estado-badge-${alert.id}`}
                          >
                            {estado}
                          </Badge>

                          <span className="text-[10px] text-muted-foreground ml-auto sm:ml-0">
                            {alert.fecha}
                          </span>
                        </div>

                        {/* Detalle y notas del atleta */}
                        <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                          {alert.detalle}
                        </p>

                        {/* Síntomas de alarma explícitos */}
                        {alert.sintomasAlarma && alert.sintomasAlarma.length > 0 && (
                          <div
                            className="p-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-bold flex items-center gap-1.5 flex-wrap"
                            data-testid="alert-red-flags-list"
                          >
                            <span>🚩 Síntomas de Alarma:</span>
                            <span className="font-semibold">{alert.sintomasAlarma.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acciones del Coach: Gestión de Estados y Quick Swap */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                      {/* Botón Sustituir Ejercicio (Quick Swap) */}
                      {onQuickSwap && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onQuickSwap(alert)}
                          className="min-h-10 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 rounded-lg shadow-xs gap-1"
                          title="Sustituir Ejercicio por alternativa biomecánica clasificada"
                          data-testid={`quick-swap-btn-${alert.id}`}
                        >
                          <span>🔄 Sustituir Ejercicio</span>
                        </Button>
                      )}

                      {/* Botón Ver Alumno */}
                      {onSelectAlumno && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-10 text-[11px] font-semibold border-border/80 px-2.5 rounded-lg"
                          onClick={() => onSelectAlumno(alert.alumnoId)}
                          data-testid={`view-student-btn-${alert.id}`}
                        >
                          Ver Alumno
                        </Button>
                      )}

                      {/* Selector de Estado del Reporte (PENDIENTE, ATENDIDO, CERRADO) */}
                      <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/60">
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(alert.id, "PENDIENTE")}
                          className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
                            estado === "PENDIENTE"
                              ? "bg-amber-500 text-slate-950 shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Marcar como Pendiente"
                          data-testid={`status-btn-pendiente-${alert.id}`}
                        >
                          Pendiente
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(alert.id, "ATENDIDO")}
                          className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
                            estado === "ATENDIDO"
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Marcar como Atendido"
                          data-testid={`status-btn-atendido-${alert.id}`}
                        >
                          Atendido
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(alert.id, "CERRADO")}
                          className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
                            estado === "CERRADO" || estado === "RESUELTO"
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Cerrar Reporte"
                          data-testid={`status-btn-cerrado-${alert.id}`}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
