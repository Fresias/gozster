"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export interface ForcePasswordChangeProps {
  /** Email del alumno, sólo para mostrarlo como contexto (no editable). */
  email?: string | null;
  /** Se invoca tras guardar la nueva contraseña con éxito (p. ej. redirigir a /athlete). */
  onSuccess: () => void | Promise<void>;
}

const MIN_LEN = 8;

/**
 * Pantalla bloqueante de "Primer inicio de sesión: elegí tu contraseña definitiva".
 * Se muestra cuando `perfiles.debe_cambiar_password === true` (o `must_change_password`
 * en el metadata del usuario). No tiene botón de cerrar a propósito: el alumno no puede
 * seguir navegando a /athlete ni a /studio hasta definir su clave definitiva.
 *
 * Al guardar: `supabase.auth.updateUser({ password, data: { must_change_password: false } })`
 * y `perfiles.debe_cambiar_password = false`, luego `onSuccess()`.
 */
export function ForcePasswordChange({ email, onSuccess }: ForcePasswordChangeProps) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Validación en vivo (sin mostrar el error antes de que el usuario escriba).
  const largoOk = password.length >= MIN_LEN;
  const coincide = confirm.length > 0 && password === confirm;
  const esValido = largoOk && coincide;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!largoOk) {
      setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden. Revisá ambos campos.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      const { data: userData, error: updateError } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });

      if (updateError || !userData.user) {
        setError(
          updateError?.message ||
            "No se pudo actualizar la contraseña. Intentá de nuevo en unos segundos.",
        );
        setLoading(false);
        return;
      }

      // Bajar la bandera también en el perfil (RLS permite al propio alumno este update).
      const { error: perfilError } = await supabase
        .from("perfiles")
        .update({ debe_cambiar_password: false })
        .eq("id", userData.user.id);

      if (perfilError) {
        setError(
          "Tu contraseña se guardó, pero no pudimos finalizar la configuración. Volvé a intentar.",
        );
        setLoading(false);
        return;
      }

      await onSuccess();
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
        <div className="border-b border-border p-5">
          <h2
            id="force-password-title"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground"
          >
            <span aria-hidden="true">🔐</span> Primer inicio de sesión
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Elegí tu contraseña definitiva para seguir. No vas a poder entrenar hasta reemplazar la
            contraseña temporal.
          </p>
          {email && (
            <p className="mt-2 text-xs text-muted-foreground">
              Cuenta: <span className="font-semibold text-foreground">{email}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5" noValidate>
          <div className="space-y-1.5">
            <label
              htmlFor="force-password"
              className="block text-xs font-semibold text-foreground"
            >
              Nueva contraseña <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <input
                id="force-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                aria-describedby="force-password-hint"
                className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 pr-12 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-lg text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <span aria-hidden="true">{showPassword ? "🙈" : "👁️"}</span>
              </button>
            </div>
            <p
              id="force-password-hint"
              className={`text-xs ${largoOk ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
            >
              {largoOk ? "✓ Largo suficiente" : `Debe tener al menos ${MIN_LEN} caracteres.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="force-password-confirm"
              className="block text-xs font-semibold text-foreground"
            >
              Repetir contraseña <span className="text-destructive">*</span>
            </label>
            <input
              id="force-password-confirm"
              name="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repetí la contraseña"
              aria-describedby="force-password-match"
              className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {confirm.length > 0 && (
              <p
                id="force-password-match"
                className={`text-xs ${coincide ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
              >
                {coincide ? "✓ Las contraseñas coinciden" : "Las contraseñas no coinciden."}
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={loading || !esValido}
            className="w-full"
            data-testid="force-password-submit"
          >
            {loading ? "Guardando..." : "Guardar contraseña"}
          </Button>
        </form>
      </div>
    </div>
  );
}
