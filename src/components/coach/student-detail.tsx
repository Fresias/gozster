import * as React from "react";
import type {
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachStudioTab } from "@/store/use-coach-studio";
import {
  calculateStudentHealthScore,
  generateWhatsAppReactivationUrl,
} from "@/lib/strength-metrics";

export interface StudentDetailProps {
  alumno: Perfil;
  activeTab: CoachStudioTab;
  onTabChange: (tab: CoachStudioTab) => void;
  onBack: () => void;
  rutinaActiva: PlanEntrenamiento | null;
  historialPlanes: PlanEntrenamiento[];
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejerciciosCatalogo: Ejercicio[];
  onOpenHistoricalLoads: () => void;
  onClonarUltimaRutina: (alumnoId: string) => Promise<unknown>;
  onExtenderVigencia: (planId: string) => Promise<unknown>;
  isOffline: boolean;
}

export function StudentDetail({
  alumno,
  activeTab,
  onTabChange,
  onBack,
  rutinaActiva,
  historialPlanes,
  dias,
  ejerciciosEnRutina,
  ejerciciosCatalogo,
  onOpenHistoricalLoads,
  onClonarUltimaRutina,
  onExtenderVigencia,
  isOffline,
}: StudentDetailProps) {
  const [isCloning, setIsCloning] = React.useState(false);
  const [isExtending, setIsExtending] = React.useState(false);

  const getPaymentBadge = (estado: Perfil["estado_membresia"]) => {
    switch (estado) {
      case "ACTIVA":
        return <Badge variant="success">Al día</Badge>;
      case "PENDIENTE":
        return <Badge variant="warning">Pago pendiente</Badge>;
      case "INACTIVA":
        return <Badge variant="secondary">Inactivo</Badge>;
      case "BAJA":
        return <Badge variant="destructive">Baja</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const getPlanBadge = (estado: PlanEntrenamiento["estado"]) => {
    switch (estado) {
      case "ACTIVO":
        return <Badge variant="success">ACTIVO</Badge>;
      case "INACTIVO":
        return <Badge variant="secondary">INACTIVO</Badge>;
      case "BORRADOR":
        return <Badge variant="warning">BORRADOR</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const handleClonar = async () => {
    setIsCloning(true);
    try {
      await onClonarUltimaRutina(alumno.id);
    } finally {
      setIsCloning(false);
    }
  };

  const handleExtender = async () => {
    if (!rutinaActiva) return;
    setIsExtending(true);
    try {
      await onExtenderVigencia(rutinaActiva.id);
    } finally {
      setIsExtending(false);
    }
  };

  const cuotaScore =
    alumno.estado_membresia === "ACTIVA"
      ? 100
      : alumno.estado_membresia === "PENDIENTE"
      ? 50
      : 15;
  const healthScore = calculateStudentHealthScore({
    adherencia: rutinaActiva ? 90 : 35,
    frecuencia: rutinaActiva ? 85 : 40,
    interaccionChat: 75,
    estadoCuota: cuotaScore,
  });

  const whatsappUrl = generateWhatsAppReactivationUrl({
    phone: alumno.telefono,
    studentName: alumno.nombre_completo,
    daysInactive: rutinaActiva ? 4 : 8,
    routineName: rutinaActiva?.nombre,
  });

  const currentPlanDias = rutinaActiva
    ? dias.filter((d) => d.plan_id === rutinaActiva.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Top Bar / Back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="default"
          onClick={onBack}
          className="min-h-11 gap-2 text-xs font-semibold"
        >
          <span>← Volver a Alumnos</span>
        </Button>
        <div className="flex items-center gap-2">
          {isOffline && (
            <Badge variant="warning" className="text-[11px]">
              Modo Offline • Acciones en cola
            </Badge>
          )}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp con ${alumno.nombre_completo}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 active:scale-[0.99]"
            data-testid="whatsapp-direct-btn"
          >
            <span>💬 WhatsApp 1-Clic</span>
          </a>
        </div>
      </div>

      {/* Ficha Header */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-bold text-secondary-foreground">
                {alumno.nombre_completo
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    {alumno.nombre_completo}
                  </h2>
                  {getPaymentBadge(alumno.estado_membresia)}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${healthScore.colorClass}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Semáforo de Salud: {healthScore.score}/100 ({healthScore.badgeLabel})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {alumno.email ?? "Sin email"} • Cliente desde{" "}
                  {new Date(alumno.created_at).toLocaleDateString("es-AR", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={onOpenHistoricalLoads}
                className="min-h-11 w-full gap-2 text-xs font-semibold sm:w-auto"
                aria-label="Revisar cargas y RPE históricos"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
                <span>Cargas y RPE Históricos</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Selector (Pestañas de Planes) */}
      <div
        role="tablist"
        aria-label="Pestañas de la Ficha del Alumno"
        className="flex w-full rounded-lg border border-border bg-card p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "rutina_actual"}
          onClick={() => onTabChange("rutina_actual")}
          className={`flex-1 rounded-md py-2.5 text-center text-xs font-semibold transition-all min-h-11 ${
            activeTab === "rutina_actual"
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Rutina Actual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "historial_rutinas"}
          onClick={() => onTabChange("historial_rutinas")}
          className={`flex-1 rounded-md py-2.5 text-center text-xs font-semibold transition-all min-h-11 ${
            activeTab === "historial_rutinas"
              ? "bg-secondary text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Historial de Rutinas ({historialPlanes.length})
        </button>
      </div>

      {/* TAB 1: Rutina Actual */}
      {activeTab === "rutina_actual" && (
        <div className="space-y-4">
          {rutinaActiva ? (
            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">
                      {rutinaActiva.nombre}
                    </CardTitle>
                    {getPlanBadge(rutinaActiva.estado)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creado el{" "}
                    {new Date(rutinaActiva.created_at).toLocaleDateString(
                      "es-AR",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenHistoricalLoads}
                    className="min-h-11 text-xs font-medium"
                  >
                    Ver Cargas &amp; RPE
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {rutinaActiva.comentarios && (
                  <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Notas del Entrenador:{" "}
                    </span>
                    {rutinaActiva.comentarios}
                  </div>
                )}

                {/* Días y ejercicios */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Estructura del Plan ({currentPlanDias.length} Días)
                  </h4>

                  {currentPlanDias.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin días cargados en este plan.
                    </p>
                  ) : (
                    currentPlanDias.map((dia) => {
                      const ejerciciosDelDia = ejerciciosEnRutina.filter(
                        (er) => er.dia_id === dia.id,
                      );

                      return (
                        <div
                          key={dia.id}
                          className="rounded-lg border border-border bg-background/50 p-4"
                        >
                          <h5 className="text-sm font-semibold text-foreground">
                            {dia.nombre}
                          </h5>

                          <div className="mt-3 divide-y divide-border/40">
                            {ejerciciosDelDia.map((item) => {
                              const ejercicioInfo = ejerciciosCatalogo.find(
                                (e) => e.id === item.ejercicio_id,
                              );

                              return (
                                <div
                                  key={item.id}
                                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs first:pt-0 last:pb-0"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-foreground">
                                        {ejercicioInfo?.nombre ??
                                          "Ejercicio personalizado"}
                                      </span>
                                      {item.es_superserie && (
                                        <Badge
                                          variant="warning"
                                          className="text-[10px]"
                                        >
                                          Superserie G{item.grupo_superserie}
                                        </Badge>
                                      )}
                                    </div>
                                    {item.notas && (
                                      <p className="text-[11px] text-muted-foreground">
                                        {item.notas}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 font-mono text-[11px]">
                                    <span className="rounded bg-secondary px-2 py-1">
                                      {item.series} × {item.repeticiones}
                                    </span>
                                    {item.rpe_objetivo && (
                                      <span className="text-primary font-bold">
                                        RPE {item.rpe_objetivo}
                                      </span>
                                    )}
                                    <span className="text-muted-foreground">
                                      {item.descanso_segundos}s desc.
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  El alumno no tiene una rutina activa actualmente.
                </p>
                <div className="mt-4">
                  <Button
                    variant="default"
                    size="default"
                    onClick={handleClonar}
                    disabled={isCloning}
                    className="min-h-11 text-xs font-semibold"
                  >
                    Clonar última rutina ahora
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: Historial de Rutinas */}
      {activeTab === "historial_rutinas" && (
        <div className="space-y-4">
          {/* Quick Action Bar for Cloning and Extending */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Acciones Rápidas de Planificación
              </h3>
              <p className="text-xs text-muted-foreground">
                Invocación RPC optimista con soporte offline-first.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="default"
                onClick={handleClonar}
                disabled={isCloning}
                className="min-h-11 flex-1 sm:flex-none text-xs font-semibold"
                aria-label="Clonar última rutina"
              >
                {isCloning ? "Clonando..." : "[Clonar última rutina]"}
              </Button>
              <Button
                variant="secondary"
                size="default"
                onClick={handleExtender}
                disabled={isExtending || !rutinaActiva}
                className="min-h-11 flex-1 sm:flex-none text-xs font-semibold"
                aria-label="Extender vigencia"
              >
                {isExtending ? "Extendiendo..." : "[Extender vigencia]"}
              </Button>
            </div>
          </div>

          {/* Chronological List of All Previous Plans */}
          <div className="space-y-3">
            {historialPlanes.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No se encontraron planes anteriores registrados.
                </CardContent>
              </Card>
            ) : (
              historialPlanes.map((plan, index) => {
                const planDias = dias.filter((d) => d.plan_id === plan.id);
                const fechaCreacion = new Date(plan.created_at).toLocaleDateString(
                  "es-AR",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  },
                );

                return (
                  <Card
                    key={plan.id}
                    className="transition-colors hover:border-primary/40"
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-foreground">
                              {plan.nombre}
                            </h4>
                            {getPlanBadge(plan.estado)}
                            {index === 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                Más Reciente
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Creado: {fechaCreacion} • {planDias.length} días
                            configurados
                          </p>
                        </div>

                        <div className="text-xs font-mono text-muted-foreground">
                          ID: {plan.id.slice(0, 8)}...
                        </div>
                      </div>

                      {plan.comentarios && (
                        <p className="mt-3 text-xs text-muted-foreground rounded bg-secondary/40 p-2.5">
                          {plan.comentarios}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
