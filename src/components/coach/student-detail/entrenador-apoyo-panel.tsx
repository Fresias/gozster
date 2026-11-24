"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  filtrarCandidatosEntrenadorApoyo,
  type CoachCandidato,
} from "@/lib/entrenador-apoyo";
import type { Perfil } from "@/types/database.types";

export interface EntrenadorApoyoPanelProps {
  alumno: Perfil;
  coaches: CoachCandidato[];
  puedeGestionar: boolean;
  esViewerApoyo?: boolean;
  onAsignarApoyo: (profesorApoyoId: string) => Promise<{ ok: boolean; error?: string }>;
  onQuitarApoyo: () => Promise<{ ok: boolean; error?: string }>;
  onCambiarAccesoFinanciero: (acceso: boolean) => Promise<{ ok: boolean; error?: string }>;
  /** Permite renderizar el diálogo de confirmación abierto en tests deterministas. */
  initialConfirmDialogOpen?: boolean;
}

export function EntrenadorApoyoPanel({
  alumno,
  coaches,
  puedeGestionar,
  esViewerApoyo = false,
  onAsignarApoyo,
  onQuitarApoyo,
  onCambiarAccesoFinanciero,
  initialConfirmDialogOpen = false,
}: EntrenadorApoyoPanelProps) {
  const candidatos = React.useMemo(
    () => filtrarCandidatosEntrenadorApoyo(coaches, alumno),
    [coaches, alumno],
  );

  const [selectedCoachId, setSelectedCoachId] = React.useState<string>("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(initialConfirmDialogOpen);
  const confirmDialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    if (!selectedCoachId && candidatos.length > 0) {
      setSelectedCoachId(candidatos[0]!.id);
    } else if (
      selectedCoachId &&
      candidatos.length > 0 &&
      !candidatos.some((c) => c.id === selectedCoachId)
    ) {
      setSelectedCoachId(candidatos[0]!.id);
    }
  }, [candidatos, selectedCoachId]);

  const apoyoId = alumno.profesor_apoyo_id ?? null;
  const accesoFinanciero = Boolean(apoyoId && alumno.apoyo_acceso_financiero);

  const apoyoActual = React.useMemo(
    () => (apoyoId ? coaches.find((c) => c.id === apoyoId) ?? null : null),
    [apoyoId, coaches],
  );
  const apoyoNombre = apoyoActual?.nombre ?? "Entrenador asignado";

  const abrirConfirmacionFinanciera = () => {
    setErrorMsg(null);
    setConfirmOpen(true);
    if (typeof confirmDialogRef.current?.showModal === "function") {
      try {
        if (!confirmDialogRef.current.open) {
          confirmDialogRef.current.showModal();
        }
      } catch {
        // En entornos sin showModal real (jsdom) el atributo open mantiene la visibilidad.
      }
    }
  };

  const cerrarConfirmacionFinanciera = () => {
    setConfirmOpen(false);
    if (typeof confirmDialogRef.current?.close === "function") {
      try {
        if (confirmDialogRef.current.open) {
          confirmDialogRef.current.close();
        }
      } catch {
        // noop
      }
    }
  };

  const handleAsignar = async () => {
    if (!selectedCoachId || isSaving) return;
    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await onAsignarApoyo(selectedCoachId);
      if (!res.ok) {
        setErrorMsg(res.error ?? "No se pudo asignar el entrenador de apoyo.");
      } else {
        setStatusMsg("Entrenador de apoyo asignado sin acceso financiero ($).");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuitar = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await onQuitarApoyo();
      if (!res.ok) {
        setErrorMsg(res.error ?? "No se pudo dar de baja al entrenador de apoyo.");
      } else {
        cerrarConfirmacionFinanciera();
        setStatusMsg("Entrenador de apoyo dado de baja manualmente.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFinancieroClick = async () => {
    if (isSaving || !apoyoId) return;
    if (!accesoFinanciero) {
      // Habilitar permiso financiero ($) siempre exige confirmación explícita.
      abrirConfirmacionFinanciera();
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await onCambiarAccesoFinanciero(false);
      if (!res.ok) {
        setErrorMsg(res.error ?? "No se pudo revocar el acceso financiero ($).");
      } else {
        setStatusMsg("Acceso financiero ($) revocado.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmarAccesoFinanciero = async () => {
    if (isSaving || !apoyoId) return;
    setIsSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await onCambiarAccesoFinanciero(true);
      if (!res.ok) {
        setErrorMsg(res.error ?? "No se pudo habilitar el acceso financiero ($).");
      } else {
        cerrarConfirmacionFinanciera();
        setStatusMsg("Acceso financiero ($) habilitado para el entrenador de apoyo.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-lg border border-border bg-secondary/20 p-3.5 space-y-3"
      data-testid="entrenador-apoyo-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Entrenador de apoyo
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Colaboración manual sin fecha de vencimiento.
          </p>
        </div>
        {apoyoId ? (
          accesoFinanciero ? (
            <Badge
              variant="warning"
              data-testid="badge-apoyo-acceso-financiero"
              className="text-xs font-semibold"
            >
              Acceso financiero ($)
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              data-testid="badge-apoyo-solo-entrenamiento"
              className="text-xs font-semibold"
            >
              Solo entrenamiento
            </Badge>
          )
        ) : (
          <Badge variant="outline" data-testid="badge-sin-apoyo" className="text-xs">
            Sin apoyo
          </Badge>
        )}
      </div>

      {apoyoId ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/80 p-2.5">
            <div className="min-w-0">
              <p
                className="text-sm font-semibold text-foreground truncate"
                data-testid="entrenador-apoyo-nombre"
              >
                {apoyoNombre}
              </p>
              <p className="text-xs text-muted-foreground">
                {accesoFinanciero
                  ? "Puede gestionar entrenamiento y finanzas ($) de este alumno."
                  : "Solo entrenamiento, rutinas y seguimiento (sin acceso a $)."}
              </p>
            </div>

            {puedeGestionar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleQuitar}
                disabled={isSaving}
                data-testid="btn-quitar-entrenador-apoyo"
                className="h-9 text-xs font-semibold text-destructive hover:text-destructive"
              >
                {isSaving ? "Guardando…" : "Dar de baja apoyo"}
              </Button>
            )}
          </div>

          {puedeGestionar ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/80 bg-background/60 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  Acceso financiero ($)
                </p>
                <p className="text-xs text-muted-foreground">
                  Permite ver y gestionar dinero, membresías, cobros y pagos de este alumno.
                </p>
              </div>
              <Button
                type="button"
                variant={accesoFinanciero ? "default" : "outline"}
                size="sm"
                role="switch"
                aria-checked={accesoFinanciero}
                aria-label="Acceso financiero ($)"
                onClick={handleToggleFinancieroClick}
                disabled={isSaving}
                data-testid="toggle-acceso-financiero-apoyo"
                className="h-9 px-3 text-xs font-semibold shrink-0"
              >
                {accesoFinanciero ? "$ Activo · Revocar" : "Habilitar acceso ($)"}
              </Button>
            </div>
          ) : esViewerApoyo ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="aviso-rol-entrenador-apoyo"
            >
              {accesoFinanciero
                ? "Operás como entrenador de apoyo con acceso financiero ($) habilitado por el titular."
                : "Operás como entrenador de apoyo: podés gestionar entrenamiento, rutinas y seguimiento sin acceso a dinero, membresías, cobros ni pagos."}
            </p>
          ) : null}
        </div>
      ) : puedeGestionar ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-semibold text-muted-foreground">
              Seleccionar entrenador de apoyo
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value)}
                disabled={isSaving || candidatos.length === 0}
                className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground"
                data-testid="select-entrenador-apoyo"
              >
                {candidatos.length === 0 ? (
                  <option value="">Sin otros entrenadores disponibles</option>
                ) : (
                  candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.rol})
                    </option>
                  ))
                )}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAsignar}
              disabled={isSaving || !selectedCoachId || candidatos.length === 0}
              data-testid="btn-asignar-entrenador-apoyo"
              className="min-h-10 px-4 text-xs font-semibold shrink-0"
            >
              {isSaving ? "Asignando…" : "Asignar apoyo"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Se guarda con acceso financiero ($) desactivado por defecto y queda activo hasta darlo de baja manualmente.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin entrenador de apoyo asignado.
        </p>
      )}

      {errorMsg && (
        <p
          role="alert"
          data-testid="error-entrenador-apoyo"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs font-medium text-destructive"
        >
          {errorMsg}
        </p>
      )}

      {statusMsg && (
        <p
          role="status"
          data-testid="aviso-entrenador-apoyo"
          className="rounded-md border border-success-soft-border bg-success-soft px-2.5 py-2 text-xs font-medium text-success-soft-foreground"
        >
          {statusMsg}
        </p>
      )}

      {/* Cartel / confirmación explícita al activar Acceso financiero ($) (native <dialog>, regla Ponytail) */}
      <dialog
        ref={confirmDialogRef}
        open={confirmOpen || undefined}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-acceso-financiero-titulo"
        data-testid="dialog-confirmar-acceso-financiero"
        onCancel={(e) => {
          e.preventDefault();
          if (!isSaving) cerrarConfirmacionFinanciera();
        }}
        className="w-[min(92vw,28rem)] rounded-2xl border border-warning-soft-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60"
      >
        {confirmOpen && (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-warning-soft-border bg-warning-soft text-sm font-black text-warning-soft-foreground"
              >
                $
              </span>
              <div className="space-y-1">
                <h3
                  id="dialog-acceso-financiero-titulo"
                  className="text-base font-bold text-foreground"
                >
                  Confirmar acceso financiero ($)
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Estás por habilitar el permiso financiero ($) para{" "}
                  <strong className="text-foreground">{apoyoNombre}</strong> sobre{" "}
                  <strong className="text-foreground">{alumno.nombre_completo}</strong>.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-warning-soft-border bg-warning-soft/50 p-3 text-xs text-warning-soft-foreground">
              Este entrenador podrá ver y gestionar <strong>dinero, membresías, cobros y pagos</strong>{" "}
              de {alumno.nombre_completo} hasta que revoques este permiso o des de baja al entrenador de apoyo.
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cerrarConfirmacionFinanciera}
                disabled={isSaving}
                data-testid="btn-cancelar-acceso-financiero"
                className="min-h-10 px-4 text-xs font-semibold"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleConfirmarAccesoFinanciero}
                disabled={isSaving}
                data-testid="btn-confirmar-acceso-financiero"
                className="min-h-10 px-4 text-xs font-semibold"
              >
                {isSaving ? "Habilitando…" : "Confirmar acceso ($)"}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
