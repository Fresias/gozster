"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type Estado = "verificando" | "listo" | "invalido" | "guardado";

const MIN_PASSWORD = 8;

export default function InvitacionPage() {
  const [estado, setEstado] = React.useState<Estado>("verificando");
  const [email, setEmail] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    let activo = true;

    async function detectarSesionInvitacion() {
      // Flujo PKCE: el enlace puede traer ?code= para canjear por sesión.
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {
        // Si el canje falla, caemos al chequeo de sesión por hash (detectSessionInUrl).
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!activo) return;

      if (session?.user) {
        setEmail(session.user.email ?? null);
        setEstado("listo");
      } else {
        setEstado("invalido");
      }
    }

    // El cliente procesa el token del hash de forma asíncrona: escuchamos el evento y además chequeamos.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!activo) return;
      if (session?.user) {
        setEmail(session.user.email ?? null);
        setEstado((prev) => (prev === "guardado" ? prev : "listo"));
      }
    });

    void detectarSesionInvitacion();

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError("No pudimos guardar tu contraseña. El enlace pudo haber expirado; pedí una nueva invitación.");
        setSaving(false);
        return;
      }

      setEstado("guardado");
      // Navegación dura a la Athlete App: las cookies de sesión viajan a SSR y el middleware la valida.
      window.location.assign("/athlete");
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle showLabel />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="text-2xl font-black tracking-tight text-primary">GOZSter</span>
          <p className="mt-1 text-xs text-muted-foreground">Activá tu cuenta de atleta</p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Definí tu contraseña</CardTitle>
            <CardDescription>
              {estado === "listo" && email
                ? `Estás activando la cuenta de ${email}. Elegí una contraseña para entrar.`
                : "Creá tu contraseña para empezar a entrenar con GOZSter."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {estado === "verificando" && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Verificando tu invitación...
              </p>
            )}

            {estado === "invalido" && (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs font-medium text-destructive"
                >
                  El enlace de invitación es inválido o ya expiró. Pedile a tu entrenador que te
                  reenvíe la invitación.
                </div>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="w-full">
                    Ir a iniciar sesión
                  </Button>
                </Link>
              </div>
            )}

            {(estado === "listo" || estado === "guardado") && (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-foreground">
                    Nueva contraseña
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm" className="block text-xs font-semibold text-foreground">
                    Repetí la contraseña
                  </label>
                  <input
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(ev) => setConfirm(ev.target.value)}
                    placeholder="••••••••"
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

                <Button
                  type="submit"
                  size="lg"
                  disabled={saving || estado === "guardado" || !password || !confirm}
                  className="w-full"
                  data-testid="invitacion-submit"
                >
                  {estado === "guardado"
                    ? "¡Listo! Redirigiendo..."
                    : saving
                      ? "Guardando..."
                      : "Guardar y entrar"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
