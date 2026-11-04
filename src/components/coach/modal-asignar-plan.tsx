import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatearActividadPlan, type PlanMembresiaConVigencia } from "@/lib/planes";
import { formatearDinero } from "@/lib/alumno-ficha";

export interface ModalAsignarPlanProps {
  abierto: boolean;
  onCerrar: () => void;
  alumnoId: string;
  alumnoNombre: string;
  planesDisponibles: PlanMembresiaConVigencia[];
  tienePlanesActivos?: boolean;
  onConfirmar: (params: {
    alumnoId: string;
    planId: string;
    esAdicional: boolean;
    notas?: string;
  }) => Promise<void> | void;
}

export function ModalAsignarPlan({
  abierto,
  onCerrar,
  alumnoId,
  alumnoNombre,
  planesDisponibles,
  tienePlanesActivos = false,
  onConfirmar,
}: ModalAsignarPlanProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  const [planSeleccionadoId, setPlanSeleccionadoId] = React.useState<string>(
    planesDisponibles[0]?.id ?? ""
  );
  const [esAdicional, setEsAdicional] = React.useState<boolean>(true);
  const [notas, setNotas] = React.useState<string>("");
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sincronizar apertura/cierre nativo del <dialog>
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierto) {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (planesDisponibles.length > 0 && !planSeleccionadoId && planesDisponibles[0]) {
        setPlanSeleccionadoId(planesDisponibles[0].id);
      }
      setError(null);
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [abierto, planesDisponibles, planSeleccionadoId]);

  const planSeleccionado = React.useMemo(
    () => planesDisponibles.find((p) => p.id === planSeleccionadoId) ?? planesDisponibles[0],
    [planesDisponibles, planSeleccionadoId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planSeleccionadoId) {
      setError("Por favor, seleccioná un plan de membresía.");
      return;
    }

    try {
      setGuardando(true);
      setError(null);
      await onConfirmar({
        alumnoId,
        planId: planSeleccionadoId,
        esAdicional,
        notas: notas.trim() || undefined,
      });
      onCerrar();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error al asignar el plan.");
      }
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCerrar}
      data-testid="modal-asignar-plan"
      className="m-auto w-full max-w-lg rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs"
    >
      <div className="border-b border-border p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Asignar Plan de Membresía
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Alumno: <strong className="text-foreground">{alumnoNombre}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-muted-foreground hover:text-foreground text-sm font-bold px-2 py-1 rounded-md"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Selector de Plan */}
        <label className="block space-y-1.5 text-sm font-semibold">
          Seleccionar Plan
          <select
            value={planSeleccionadoId}
            onChange={(e) => setPlanSeleccionadoId(e.target.value)}
            className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
            data-testid="select-plan-asignar"
            required
          >
            {planesDisponibles.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre} — {plan.precio === 0 ? "CORPO $0" : `$${plan.precio.toLocaleString("es-AR")}`} (
                {plan.actividad_tipo ?? "General"})
              </option>
            ))}
          </select>
        </label>

        {/* Detalle visual del plan seleccionado */}
        {planSeleccionado && (
          <div
            className="rounded-xl border border-border/80 bg-secondary/40 p-3.5 space-y-2 text-xs"
            data-testid="preview-plan-seleccionado"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-foreground">
                {planSeleccionado.nombre}
              </span>
              <Badge
                variant={planSeleccionado.precio === 0 ? "default" : "outline"}
                className={
                  planSeleccionado.precio === 0
                    ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40 font-bold"
                    : "font-bold"
                }
              >
                {planSeleccionado.precio === 0
                  ? "Convenio $0"
                  : `$${planSeleccionado.precio.toLocaleString("es-AR")}/mes`}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground text-[11px]">
              <div>
                <span className="block font-medium">Actividad:</span>
                <span className="font-semibold text-foreground">
                  {planSeleccionado.actividad_tipo === "RUTINAS"
                    ? "Rutinas Online (Asesoría)"
                    : planSeleccionado.actividad_tipo === "FUNCIONAL_BOXEO"
                    ? "Pase Libre (Funcional + Boxeo)"
                    : planSeleccionado.actividad_tipo ?? "General"}
                </span>
              </div>
              <div>
                <span className="block font-medium">Límite semanal:</span>
                <span className="font-semibold text-foreground">
                  {planSeleccionado.actividad_tipo === "RUTINAS"
                    ? "No aplica (Online)"
                    : planSeleccionado.limite_semanal
                    ? `${planSeleccionado.limite_semanal} clases/sem`
                    : "Pase Libre"}
                </span>
              </div>
            </div>
            {planSeleccionado.notas && (
              <div className="pt-1 border-t border-border/50 text-muted-foreground italic text-[11px]">
                📝 {planSeleccionado.notas}
              </div>
            )}
          </div>
        )}

        {/* Modo de asignación (Multiactividad vs Reemplazo) */}
        {tienePlanesActivos && (
          <div className="space-y-2 pt-1" data-testid="seccion-modo-asignacion">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              Tipo de Asignación (Multiactividad)
            </span>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 cursor-pointer hover:bg-secondary/30 transition-colors">
                <input
                  type="radio"
                  name="modo-asignacion"
                  checked={esAdicional}
                  onChange={() => setEsAdicional(true)}
                  className="mt-0.5 text-primary focus:ring-primary"
                  data-testid="radio-plan-adicional"
                />
                <div className="text-xs">
                  <span className="font-bold text-foreground block">
                    Vincular como plan adicional (Multiactividad)
                  </span>
                  <span className="text-muted-foreground block text-[11px] mt-0.5">
                    Permite que el alumno mantenga activos sus planes actuales simultáneamente (ej. Gimnasio + Rutinas Online CORPO).
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 rounded-xl border border-border p-3 cursor-pointer hover:bg-secondary/30 transition-colors">
                <input
                  type="radio"
                  name="modo-asignacion"
                  checked={!esAdicional}
                  onChange={() => setEsAdicional(false)}
                  className="mt-0.5 text-primary focus:ring-primary"
                  data-testid="radio-plan-reemplazar"
                />
                <div className="text-xs">
                  <span className="font-bold text-foreground block">
                    Reemplazar plan principal existente
                  </span>
                  <span className="text-muted-foreground block text-[11px] mt-0.5">
                    Actualiza la membresía principal del atleta hacia el nuevo plan seleccionado.
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Notas / Observaciones opcionales */}
        <label className="block space-y-1.5 text-sm font-semibold">
          Notas / Observaciones de la Asignación
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: Convenio empresa Tech Corp, beca deportiva, acuerdo $0"
            className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
            data-testid="input-asignar-notas"
          />
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300"
            data-testid="error-asignar-plan"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onCerrar}
            disabled={guardando}
            data-testid="btn-cancelar-asignar-plan"
            className="min-h-[44px]"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={guardando}
            data-testid="btn-confirmar-asignar-plan"
            className="min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {guardando ? "Vinculando..." : esAdicional ? "Vincular Plan Adicional" : "Guardar Cambio de Plan"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
