"use client";

import * as React from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export interface InviteStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se invoca tras un alta exitosa (201) para recargar la lista de alumnos del entrenador. */
  onInvited: () => void | Promise<void>;
}

/** Respuesta 201 de la Edge Function `alta-alumno-directa`. */
interface AltaExitosa {
  alumno_id: string;
  email: string;
  password_temporal: string;
  email_enviado: boolean;
  mensaje: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Traduce el status de la Edge Function `alta-alumno-directa` a un mensaje para el entrenador. */
function mensajePorStatus(status: number, serverMsg?: string): string {
  switch (status) {
    case 400:
      return serverMsg || "Datos inválidos. Revisá el email del alumno.";
    case 401:
    case 403:
      return "No tenés permisos para dar de alta alumnos. Iniciá sesión como entrenador.";
    case 409:
      return "Ya existe un usuario registrado con ese email.";
    case 500:
    case 502:
      return "No se pudo crear el alumno por un error del servidor. Intentá de nuevo en unos minutos.";
    default:
      return serverMsg || "No se pudo completar el alta. Intentá de nuevo.";
  }
}

/** Arma el mensaje de WhatsApp con las credenciales listas para pegar al alumno. */
function mensajeWhatsApp(alta: AltaExitosa, nombre: string): string {
  const loginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/login` : "https://gozster.vercel.app/login";
  const saludo = nombre ? `Hola ${nombre}!` : "Hola!";
  return [
    saludo,
    "",
    "Te di de alta en GOZSter. Ingresá con estos datos:",
    `Email: ${alta.email}`,
    `Contraseña temporal: ${alta.password_temporal}`,
    "",
    `Entrá en ${loginUrl} y al ingresar vas a elegir tu contraseña definitiva.`,
  ].join("\n");
}

export function InviteStudentModal({ isOpen, onClose, onInvited }: InviteStudentModalProps) {
  const [nombreCompleto, setNombreCompleto] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [alta, setAlta] = React.useState<AltaExitosa | null>(null);
  const [copiado, setCopiado] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const reset = React.useCallback(() => {
    setNombreCompleto("");
    setEmail("");
    setTelefono("");
    setError(null);
    setAlta(null);
    setCopiado(false);
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
  // El nombre es opcional: basta un email válido para dar de alta.
  const esValido = EMAIL_RE.test(emailLimpio);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!esValido) {
      setError("Ingresá un email válido.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: fnError } = await supabase.functions.invoke<AltaExitosa>(
        "alta-alumno-directa",
        {
          body: {
            email: emailLimpio,
            nombre_completo: nombreLimpio || undefined,
            telefono: telefono.trim() || undefined,
          },
        },
      );

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

      if (!data?.password_temporal) {
        setError("El alta se procesó pero no recibimos las credenciales. Recargá la lista de alumnos.");
        setLoading(false);
        return;
      }

      setAlta(data);
      setLoading(false);
      await onInvited();
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
      setLoading(false);
    }
  };

  const handleCopiar = async () => {
    if (!alta) return;
    const texto = `Email: ${alta.email}\nContraseña temporal: ${alta.password_temporal}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        window.setTimeout(() => setCopiado(false), 2500);
      }
    } catch {
      setError("No pudimos copiar al portapapeles. Copiá las credenciales manualmente.");
    }
  };

  const whatsappHref = alta
    ? (() => {
        const digits = telefono.replace(/\D/g, "");
        const text = encodeURIComponent(mensajeWhatsApp(alta, nombreLimpio));
        return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
      })()
    : "#";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alta-alumno-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h2
              id="alta-alumno-modal-title"
              className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground"
            >
              <span aria-hidden="true">🏋️</span> Alta de alumno
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {alta
                ? "Compartí estas credenciales con tu alumno."
                : "Creá la cuenta al instante y compartí las credenciales por WhatsApp."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            aria-label="Cerrar alta de alumno"
            className="min-h-11 min-w-11 text-xs"
          >
            ✕
          </Button>
        </div>

        {alta ? (
          /* Tarjeta de contingencia: credenciales + copiado + WhatsApp en 1 toque */
          <div className="space-y-4 p-4 sm:p-5" data-testid="alta-alumno-success">
            <div
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {alta.mensaje}
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-background p-3.5">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </p>
                <p className="select-all break-all text-sm font-semibold text-foreground">
                  {alta.email}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Contraseña temporal
                </p>
                <p className="select-all break-all font-mono text-sm font-semibold text-foreground">
                  {alta.password_temporal}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopiar}
                className="min-h-12 text-xs"
                data-testid="alta-alumno-copiar"
              >
                {copiado ? "✓ Credenciales copiadas" : "📋 Copiar credenciales"}
              </Button>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="alta-alumno-whatsapp"
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-4 text-xs font-bold text-white transition-all hover:bg-[#1da851] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                💬 Enviar por WhatsApp
              </a>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={reset} className="min-h-11 text-xs">
                Dar de alta a otro
              </Button>
              <Button type="button" size="sm" onClick={handleClose} className="min-h-11 text-xs">
                Listo
              </Button>
            </div>
          </div>
        ) : (
          /* Formulario de alta directa */
          <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-5" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="alta-email" className="block text-xs font-semibold text-foreground">
                Email <span className="text-destructive">*</span>
              </label>
              <input
                id="alta-email"
                name="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="alumno@email.com"
                className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="alta-nombre" className="block text-xs font-semibold text-foreground">
                Nombre completo <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="alta-nombre"
                name="nombre_completo"
                type="text"
                value={nombreCompleto}
                onChange={(ev) => setNombreCompleto(ev.target.value)}
                placeholder="Ej. Juan Pérez"
                className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="alta-telefono" className="block text-xs font-semibold text-foreground">
                Teléfono{" "}
                <span className="font-normal text-muted-foreground">(opcional, para WhatsApp)</span>
              </label>
              <input
                id="alta-telefono"
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

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={handleClose} className="min-h-11 text-xs">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || !esValido}
                className="min-h-12 text-xs"
                data-testid="invite-student-submit"
              >
                {loading ? "Dando de alta..." : "Dar de alta"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
