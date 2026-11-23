"use client";

import * as React from "react";
import { FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

/** Respuesta 200 de la Edge Function `resetear-password-alumno`. */
interface ResetExitoso {
  alumno_id: string;
  password_temporal: string;
  mensaje: string;
}

export type ResultadoReset =
  | { ok: true; passwordTemporal: string; mensaje: string }
  | { ok: false; error: string };

export type EstadoReset =
  | { fase: "inicial" }
  | { fase: "confirmando" }
  | { fase: "cargando" }
  | { fase: "exito"; passwordTemporal: string; mensaje: string }
  | { fase: "error"; error: string };

export function mensajeErrorReset(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return "No tenés permisos para resetear la contraseña de este alumno. Solo su entrenador asignado o un administrador puede hacerlo.";
    case 404:
      return "No encontramos a este alumno. Recargá la ficha e intentá de nuevo.";
    default:
      return "No se pudo resetear la contraseña. Intentá de nuevo en unos minutos.";
  }
}

/** Invoca la Edge Function y traduce la respuesta a un resultado de UI (sin persistir la clave). */
export async function resetearPasswordAlumno(
  client: Pick<SupabaseClient, "functions">,
  alumnoId: string,
): Promise<ResultadoReset> {
  try {
    const { data, error } = await client.functions.invoke<ResetExitoso>("resetear-password-alumno", {
      body: { alumno_id: alumnoId },
    });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        return { ok: false, error: mensajeErrorReset(error.context?.status ?? 0) };
      }
      return { ok: false, error: "No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez." };
    }
    if (!data?.password_temporal) {
      return { ok: false, error: mensajeErrorReset(0) };
    }
    return { ok: true, passwordTemporal: data.password_temporal, mensaje: data.mensaje };
  } catch {
    return { ok: false, error: "No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez." };
  }
}

export interface ResetPasswordPanelProps {
  estado: EstadoReset;
  nombre?: string;
  copiado?: boolean;
  onPedir: () => void;
  onConfirmar: () => void;
  onCancelar: () => void;
  onCopiar: () => void;
  onOcultar: () => void;
}

/** Vista pura por estado: botón → confirmación → clave temporal (una sola vez) o error. */
export function ResetPasswordPanel({
  estado,
  nombre,
  copiado = false,
  onPedir,
  onConfirmar,
  onCancelar,
  onCopiar,
  onOcultar,
}: ResetPasswordPanelProps) {
  const quien = nombre ? nombre : "el alumno";

  return (
    <div data-testid="reset-password-alumno" className="space-y-3 rounded-xl border border-border bg-background p-3.5">
      <div>
        <h3 className="text-sm font-bold text-foreground">Contraseña del alumno</h3>
        <p className="text-xs text-muted-foreground">
          Si {quien} olvidó su contraseña, generá una temporal y compartísela.
        </p>
      </div>

      {(estado.fase === "inicial" || estado.fase === "error") && (
        <>
          {estado.fase === "error" && (
            <div
              role="alert"
              data-testid="reset-password-error"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {estado.error}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onPedir}
            className="min-h-11 text-xs"
            data-testid="btn-resetear-password"
          >
            Resetear contraseña
          </Button>
        </>
      )}

      {(estado.fase === "confirmando" || estado.fase === "cargando") && (
        <div
          role="alertdialog"
          aria-labelledby="reset-password-confirm-title"
          data-testid="reset-password-confirmacion"
          className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
        >
          <p id="reset-password-confirm-title" className="text-xs font-medium text-foreground">
            ¿Resetear la contraseña de {quien}? Su contraseña actual dejará de funcionar.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancelar}
              disabled={estado.fase === "cargando"}
              className="min-h-11 text-xs"
              data-testid="reset-password-cancelar"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmar}
              disabled={estado.fase === "cargando"}
              className="min-h-11 text-xs"
              data-testid="reset-password-confirmar"
            >
              {estado.fase === "cargando" ? "Reseteando..." : "Sí, resetear"}
            </Button>
          </div>
        </div>
      )}

      {estado.fase === "exito" && (
        <div data-testid="reset-password-exito" className="space-y-3">
          <div
            role="status"
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            {estado.mensaje}
          </div>
          <div className="rounded-xl border border-border bg-card p-3.5">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Contraseña temporal
            </p>
            <p
              className="select-all break-all font-mono text-sm font-semibold text-foreground"
              data-testid="reset-password-temporal"
            >
              {estado.passwordTemporal}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Se muestra una sola vez. En su próximo ingreso, {quien} deberá elegir una contraseña nueva.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCopiar}
              className="min-h-11 text-xs"
              data-testid="reset-password-copiar"
            >
              {copiado ? "✓ Contraseña copiada" : "📋 Copiar contraseña"}
            </Button>
            <Button
              type="button"
              onClick={onOcultar}
              className="min-h-11 text-xs"
              data-testid="reset-password-listo"
            >
              Listo, ocultar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Botón "Resetear contraseña" de la ficha del alumno. La clave temporal vive solo en memoria. */
export function ResetPasswordAlumno({ alumnoId, nombre }: { alumnoId: string; nombre?: string }) {
  const [estado, setEstado] = React.useState<EstadoReset>({ fase: "inicial" });
  const [copiado, setCopiado] = React.useState(false);

  const confirmar = async () => {
    setEstado({ fase: "cargando" });
    const r = await resetearPasswordAlumno(createClient(), alumnoId);
    setEstado(r.ok ? { fase: "exito", passwordTemporal: r.passwordTemporal, mensaje: r.mensaje } : { fase: "error", error: r.error });
  };

  const copiar = async () => {
    if (estado.fase !== "exito") return;
    try {
      await navigator.clipboard.writeText(estado.passwordTemporal);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin portapapeles: la clave sigue visible y seleccionable para copiarla a mano.
    }
  };

  return (
    <ResetPasswordPanel
      estado={estado}
      nombre={nombre}
      copiado={copiado}
      onPedir={() => setEstado({ fase: "confirmando" })}
      onConfirmar={confirmar}
      onCancelar={() => setEstado({ fase: "inicial" })}
      onCopiar={copiar}
      onOcultar={() => {
        setCopiado(false);
        setEstado({ fase: "inicial" });
      }}
    />
  );
}
