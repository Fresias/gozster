import * as React from "react";
import type { Perfil } from "@/types/database.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface AssignPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  alumnosSinPlan: Perfil[];
  onAssignPlan: (alumnoId: string) => Promise<void>;
  onSelectAlumno: (alumnoId: string) => void;
  onOpenAssignRoutine?: (alumno: Perfil) => void;
}

export function AssignPlanModal({
  isOpen,
  onClose,
  alumnosSinPlan,
  onAssignPlan,
  onSelectAlumno,
  onOpenAssignRoutine,
}: AssignPlanModalProps) {
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleAssign = async (alumno: Perfil) => {
    if (onOpenAssignRoutine) {
      onOpenAssignRoutine(alumno);
      return;
    }
    setLoadingId(alumno.id);
    try {
      await onAssignPlan(alumno.id);
    } finally {
      setLoadingId(null);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-plan-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm transition-opacity"
    >
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h2
              id="assign-plan-modal-title"
              className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2"
            >
              <span>⚡</span> Asignación Urgente de Rutina
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Alumnos con membresía al día que necesitan plan activo para entrenar.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar modal de asignación"
            className="min-h-11 min-w-11 text-xs"
          >
            ✕
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4 sm:p-5">
          {alumnosSinPlan.length === 0 ? (
            <div className="rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
              <span className="text-2xl">🎉</span>
              <h3 className="mt-2 text-sm font-semibold text-emerald-400">
                ¡Todos los alumnos tienen plan activo!
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                No hay atletas con cuota activa pendientes de rutina.
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="min-h-11 text-xs"
                >
                  Entendido
                </Button>
              </div>
            </div>
          ) : (
            alumnosSinPlan.map((alumno) => (
              <div
                key={alumno.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-3 sm:p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
                    aria-hidden="true"
                  >
                    {getInitials(alumno.nombre_completo)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-foreground">
                      {alumno.nombre_completo}
                    </h4>
                    <p className="truncate text-xs text-muted-foreground">
                      {alumno.email ?? "Sin email registrado"}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="warning">Sin Plan Activo</Badge>
                      <Badge variant="success">Cuota al día</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={loadingId === alumno.id}
                    onClick={() => handleAssign(alumno)}
                    className="min-h-11 flex-1 sm:flex-none text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-black active:scale-95"
                  >
                    {loadingId === alumno.id ? "Asignando..." : "Asignar Rutina"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onSelectAlumno(alumno.id);
                    }}
                    className="min-h-11 flex-1 sm:flex-none text-xs"
                  >
                    Ver Ficha
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border p-4 bg-card/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="min-h-11 text-xs"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
