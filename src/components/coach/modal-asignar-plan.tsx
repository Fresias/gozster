import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type PlanMembresiaConVigencia } from "@/lib/planes";
import type { ActividadAlumno } from "@/types/database.types";

export const ACTIVIDAD_DIRECTA_ID = "__actividad_directa__";

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
    actividad?: ActividadAlumno | null;
    esAdicional: boolean;
    monto: number;
    pagado: boolean;
    medioPago: "TRANSFERENCIA" | "EFECTIVO";
    concepto?: string;
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

  const planesActivos = React.useMemo(
    () => planesDisponibles.filter((p) => p.activo !== false),
    [planesDisponibles],
  );

  const [planSeleccionadoId, setPlanSeleccionadoId] = React.useState<string>(
    planesActivos[0]?.id ?? ACTIVIDAD_DIRECTA_ID,
  );
  const [actividadDirecta, setActividadDirecta] = React.useState<ActividadAlumno>("BOXEO");
  const [esAdicional, setEsAdicional] = React.useState<boolean>(true);
  const [montoEditable, setMontoEditable] = React.useState<string>(
    planesActivos[0]?.precio != null ? String(planesActivos[0].precio) : "",
  );
  const [montoEditadoManual, setMontoEditadoManual] = React.useState(false);
  const [pagado, setPagado] = React.useState<boolean>(false);
  const [medioPago, setMedioPago] = React.useState<"TRANSFERENCIA" | "EFECTIVO">("TRANSFERENCIA");
  const [notas, setNotas] = React.useState<string>("");
  const [guardando, setGuardando] = React.useState(false);
  const submittingRef = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  const planSeleccionado = React.useMemo(
    () =>
      planSeleccionadoId === ACTIVIDAD_DIRECTA_ID
        ? undefined
        : planesActivos.find((p) => p.id === planSeleccionadoId) ?? planesActivos[0],
    [planesActivos, planSeleccionadoId],
  );

  const precioEstandar = React.useMemo<number | null>(() => {
    if (planSeleccionado && planSeleccionadoId !== ACTIVIDAD_DIRECTA_ID) {
      return planSeleccionado.precio;
    }
    const planPorAct = planesActivos.find((p) => p.actividad_tipo === actividadDirecta);
    return planPorAct ? planPorAct.precio : null;
  }, [planSeleccionado, planSeleccionadoId, planesActivos, actividadDirecta]);

  // Sincronizar apertura/cierre nativo del <dialog>
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (abierto) {
      if (!dialog.open) {
        dialog.showModal?.();
      }
      if (
        planesActivos.length > 0 &&
        planSeleccionadoId !== ACTIVIDAD_DIRECTA_ID &&
        (!planSeleccionadoId || !planesActivos.some((p) => p.id === planSeleccionadoId))
      ) {
        setPlanSeleccionadoId(planesActivos[0]!.id);
      } else if (planesActivos.length === 0 && planSeleccionadoId !== ACTIVIDAD_DIRECTA_ID) {
        setPlanSeleccionadoId(ACTIVIDAD_DIRECTA_ID);
      }
      setMontoEditadoManual(false);
      setPagado(false);
      setMedioPago("TRANSFERENCIA");
      setError(null);
    } else {
      if (dialog.open) {
        dialog.close?.();
      }
    }
  }, [abierto, planesActivos, planSeleccionadoId]);

  React.useEffect(() => {
    if (abierto && !montoEditadoManual) {
      setMontoEditable(precioEstandar !== null ? String(precioEstandar) : "");
    }
  }, [abierto, precioEstandar, montoEditadoManual]);

  const handleSeleccionPlan = (nextId: string) => {
    setPlanSeleccionadoId(nextId);
    setMontoEditadoManual(false);
    if (nextId !== ACTIVIDAD_DIRECTA_ID) {
      const elegido = planesActivos.find((p) => p.id === nextId);
      setMontoEditable(elegido ? String(elegido.precio) : "");
    } else {
      const planPorAct = planesActivos.find((p) => p.actividad_tipo === actividadDirecta);
      setMontoEditable(planPorAct ? String(planPorAct.precio) : "");
    }
  };

  const handleSeleccionActividadDirecta = (act: ActividadAlumno) => {
    setActividadDirecta(act);
    setMontoEditadoManual(false);
    const planPorAct = planesActivos.find((p) => p.actividad_tipo === act);
    setMontoEditable(planPorAct ? String(planPorAct.precio) : "");
  };

  const montoValido =
    montoEditable.trim() !== "" &&
    !Number.isNaN(Number(montoEditable)) &&
    Number(montoEditable) >= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || submittingRef.current) return;
    const esDirecta = planSeleccionadoId === ACTIVIDAD_DIRECTA_ID || !planSeleccionado;
    if (!esDirecta && !planSeleccionadoId) {
      setError("Por favor, seleccioná un plan o actividad.");
      return;
    }

    if (!montoValido) {
      setError("Ingresá un monto válido mayor o igual a $0.");
      return;
    }
    const montoNum = Number(montoEditable);

    const actividadParam: ActividadAlumno | null = esDirecta
      ? actividadDirecta
      : planSeleccionado?.actividad_tipo && planSeleccionado.actividad_tipo !== "FUNCIONAL_BOXEO"
      ? (planSeleccionado.actividad_tipo as ActividadAlumno)
      : null;

    const etiquetaAct =
      actividadDirecta === "BOXEO"
        ? "Boxeo"
        : actividadDirecta === "FUNCIONAL"
        ? "Funcional"
        : "Rutinas Online";
    const concepto = esDirecta
      ? esAdicional
        ? `${etiquetaAct} (adicional)`
        : etiquetaAct
      : planSeleccionado?.nombre;

    submittingRef.current = true;
    try {
      setGuardando(true);
      setError(null);
      await onConfirmar({
        alumnoId,
        planId: esDirecta ? "" : planSeleccionadoId,
        actividad: actividadParam,
        esAdicional,
        monto: montoNum,
        pagado,
        medioPago,
        concepto,
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
      submittingRef.current = false;
      setGuardando(false);
    }
  };

  if (!abierto) return null;

  const esActividadDirecta = planSeleccionadoId === ACTIVIDAD_DIRECTA_ID || !planSeleccionado;

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
              Asignar Plan o Actividad
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Alumno: <strong className="text-foreground">{alumnoNombre}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-muted-foreground hover:text-foreground text-sm font-bold px-2 py-1 rounded-md cursor-pointer"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Selector de Plan o Actividad adicional */}
        <label className="block space-y-1.5 text-sm font-semibold">
          Seleccionar Plan o Actividad
          <select
            value={planSeleccionadoId}
            onChange={(e) => handleSeleccionPlan(e.target.value)}
            className="w-full rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
            data-testid="select-plan-asignar"
            required
          >
            {planesActivos.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre} — {plan.precio === 0 ? "CORPO $0" : `$${plan.precio.toLocaleString("es-AR")}`} (
                {plan.actividad_tipo ?? "General"})
              </option>
            ))}
            <option value={ACTIVIDAD_DIRECTA_ID}>
              + Actividad puntual / adicional (Boxeo, Funcional o Rutina)
            </option>
          </select>
        </label>

        {esActividadDirecta && (
          <div className="space-y-1.5" data-testid="selector-actividad-directa">
            <span className="text-xs font-semibold text-muted-foreground block">
              Actividad
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(["BOXEO", "FUNCIONAL", "RUTINAS"] as ActividadAlumno[]).map((act) => (
                <button
                  key={act}
                  type="button"
                  onClick={() => handleSeleccionActividadDirecta(act)}
                  data-testid={`btn-actividad-directa-${act}`}
                  className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    actividadDirecta === act
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {act === "BOXEO" ? "Boxeo" : act === "FUNCIONAL" ? "Funcional" : "Rutinas"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Detalle visual del plan seleccionado */}
        {planSeleccionado && !esActividadDirecta && (
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
                className="font-bold"
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
          </div>
        )}

        {/* Precio editable + Estado de cobro (Pendiente vs Pagó) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm font-semibold">
            <span>
              Monto a cobrar ($){" "}
              {precioEstandar !== null && (
                <span className="text-[11px] font-normal text-muted-foreground">
                  (estándar: ${precioEstandar.toLocaleString("es-AR")})
                </span>
              )}
            </span>
            <input
              type="number"
              min={0}
              step="100"
              value={montoEditable}
              onChange={(e) => {
                setMontoEditadoManual(true);
                setMontoEditable(e.target.value);
              }}
              placeholder="Ingresá un monto"
              className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-semibold focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="input-asignar-monto"
              required
            />
          </label>

          <div className="space-y-1.5">
            <span className="block text-sm font-semibold">Estado del cobro</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/30 p-1 min-h-11 items-center">
              <button
                type="button"
                onClick={() => setPagado(false)}
                data-testid="toggle-asignar-pendiente"
                aria-pressed={!pagado}
                className={`h-9 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  !pagado
                    ? "bg-foreground text-background shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pendiente de cobro
              </button>
              <button
                type="button"
                onClick={() => setPagado(true)}
                data-testid="toggle-asignar-pago"
                aria-pressed={pagado}
                className={`h-9 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  pagado
                    ? "bg-foreground text-background shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pagó
              </button>
            </div>
          </div>
        </div>

        {pagado && (
          <label className="block space-y-1.5 text-sm font-semibold">
            Medio de pago
            <select
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value as "TRANSFERENCIA" | "EFECTIVO")}
              className="w-full min-h-11 rounded-xl border border-border bg-background p-2.5 text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-primary"
              data-testid="select-asignar-medio-pago"
            >
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="EFECTIVO">Efectivo</option>
            </select>
          </label>
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
                    Mantiene activos sus planes actuales y suma este cobro adicional (ej. sumar Boxeo a Funcional).
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
            placeholder="Ej: Mitad de mes, diferencia por sumar Boxeo, convenio $0"
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
            disabled={guardando || !montoValido}
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
