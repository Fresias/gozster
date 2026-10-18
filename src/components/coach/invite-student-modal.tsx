"use client";

import * as React from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export interface InviteStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se invoca tras un alta exitosa (201) para recargar la lista de alumnos. */
  onInvited: () => void | Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Traduce el status de la Edge Function `invitar-alumno` a un mensaje para el entrenador. */
function mensajePorStatus(status: number, serverMsg?: string): string {
  switch (status) {
    case 400:
      return serverMsg || "Datos inválidos. Revisá el email y el nombre completo.";
    case 401:
    case 403:
      return "No tenés permisos para invitar alumnos. Iniciá sesión como entrenador.";
    case 409:
      return "Ya existe un usuario registrado con ese email.";
    case 500:
    case 502:
      return "No se pudo enviar la invitación por un error del servidor. Intentá de nuevo en unos minutos.";
    default:
      return serverMsg || "No se pudo completar la invitación. Intentá de nuevo.";
  }
}

export function InviteStudentModal({ isOpen, onClose, onInvited }: InviteStudentModalProps) {
  const [nombreCompleto, setNombreCompleto] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const reset = React.useCallback(() => {
    setNombreCompleto("");
    setEmail("");
    setTelefono("");
    setError(null);
    setSuccess(null);
    setLoading(false);
  }, []);

  const handleClose = React.useCallback(() => {
    if (loading) return;
    reset();
    onClose();
  }, [loading, reset, onClose]);

  if (!isOpen) return null;

  const emailLimpio = email.trim().toLowerCase();
  const nombreLimpio = nombreCompleto.trim();
  const esValido = Boolean(nombreLimpio) && EMAIL_RE.test(emailLimpio);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!esValido) {
      setError("Ingresá un nombre completo y un email válido.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: fnError } = await supabase.functions.invoke("invitar-alumno", {
        body: {
          email: emailLimpio,
          nombre_completo: nombreLimpio,
          telefono: telefono.trim() || undefined,
        },
      });

      if (fnError) {
        if (fnError instanceof FunctionsHttpError) {
          const status = fnError.context?.status ?? 0;
          let serverMsg: string | undefined;
          try {
            const body = await fnError.context.json();
            serverMsg = body?.error;
          } catch {
            // Respuesta sin JSON legible; usamos el mensaje por status.
          }
          setError(mensajePorStatus(status, serverMsg));
        } else {
          setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
        }
        setLoading(false);
        return;
      }

      setSuccess(`Invitación enviada a ${emailLimpio}. Recibirá un email para activar su cuenta.`);
      setNombreCompleto("");
      setEmail("");
      setTelefono("");
      setLoading(false);
      await onInvited();
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-student-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h2
              id="invite-student-modal-title"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground"
            >
              <span aria-hidden="true">✉️</span> Invitar alumno
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Le enviaremos un email para que active su cuenta y defina su contraseña.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            aria-label="Cerrar modal de invitación"
            className="min-h-11 min-w-11 text-xs"
          >
            ✕
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-5" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="invite-nombre" className="block text-xs font-semibold text-foreground">
              Nombre completo <span className="text-destructive">*</span>
            </label>
            <input
              id="invite-nombre"
              name="nombre_completo"
              type="text"
              required
              value={nombreCompleto}
              onChange={(ev) => setNombreCompleto(ev.target.value)}
              placeholder="Ej. Juan Pérez"
              className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-email" className="block text-xs font-semibold text-foreground">
              Email <span className="text-destructive">*</span>
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="alumno@email.com"
              className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-telefono" className="block text-xs font-semibold text-foreground">
              Teléfono <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              id="invite-telefono"
              name="telefono"
              type="tel"
              value={telefono}
              onChange={(ev) => setTelefono(ev.target.value)}
              placeholder="+54 9 11 ..."
              className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {success}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleClose} className="min-h-11 text-xs">
              {success ? "Cerrar" : "Cancelar"}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !esValido}
              className="min-h-11 text-xs"
              data-testid="invite-student-submit"
            >
              {loading ? "Enviando..." : "Enviar invitación"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
