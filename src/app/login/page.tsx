"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ForcePasswordChange } from "@/components/auth/force-password-change";

/** Un alumno recién dado de alta debe cambiar su contraseña temporal en el primer login. */
function debeCambiarPassword(
  perfilFlag: boolean | null | undefined,
  metadata: Record<string, unknown> | undefined,
): boolean {
  return perfilFlag === true || metadata?.must_change_password === true;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/studio";
  // El middleware redirige a /login?forceChange=1 a quien ya tiene sesión pero aún no cambió su clave.
  const forceChangeParam = searchParams.get("forceChange");

  // Calentar la ruta de destino para compilación en dev y transiciones rápidas
  React.useEffect(() => {
    router.prefetch(redirectTo);
    fetch(redirectTo).catch(() => {});
  }, [router, redirectTo]);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  // Cuando se activa, se despliega la pantalla bloqueante de cambio de contraseña.
  const [cambioObligatorio, setCambioObligatorio] = React.useState<{ email: string | null } | null>(
    null,
  );

  // Caso "ya logueado pero con contraseña temporal": el middleware mandó a /login?forceChange=1.
  React.useEffect(() => {
    if (!forceChangeParam) return;
    let activo = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (activo && data.user) {
        setCambioObligatorio({ email: data.user.email ?? null });
      }
    })();
    return () => {
      activo = false;
    };
  }, [forceChangeParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError || !data.user) {
        setError("Email o contraseña incorrectos. Verificá tus datos e intentá de nuevo.");
        setLoading(false);
        return;
      }

      // Enrutar según rol: un ALUMNO va a su app aunque el destino pedido sea Coach Studio.
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("rol, debe_cambiar_password")
        .eq("id", data.user.id)
        .maybeSingle();

      // Primer login: si la clave es temporal, bloquear hasta que elija una definitiva.
      if (debeCambiarPassword(perfil?.debe_cambiar_password, data.user.user_metadata)) {
        setCambioObligatorio({ email: data.user.email ?? null });
        setLoading(false);
        return;
      }

      const destino = perfil?.rol === "ALUMNO" ? "/athlete" : redirectTo;

      // Navegación dura: garantiza que las cookies de sesión viajen a SSR y el middleware valide el rol.
      // Usa replace para que el botón "Atrás" del navegador no vuelva a la pantalla de login (D-L4).
      window.location.replace(destino);
    } catch {
      setError("No pudimos conectar con el servidor. Revisá tu conexión e intentá otra vez.");
      setLoading(false);
    }
  };

  if (cambioObligatorio) {
    return (
      <ForcePasswordChange
        email={cambioObligatorio.email}
        // Con la clave definitiva ya activa, el alumno entra directo a su app.
        onSuccess={() => window.location.assign("/athlete")}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-semibold text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          className="min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-semibold text-foreground">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        disabled={loading || !email || !password}
        className="w-full"
        data-testid="login-submit"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle showLabel />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="text-2xl font-black tracking-tight text-primary">GOZSter</span>
          <p className="mt-1 text-xs text-muted-foreground">Strength &amp; Coaching Platform</p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Iniciá sesión</CardTitle>
            <CardDescription>
              Accedé a Coach Studio o a tu app de entrenamiento con tu email y contraseña.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <React.Suspense fallback={null}>
              <LoginForm />
            </React.Suspense>
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Tu entrenador te da de alta y te comparte tus credenciales. Al ingresar por primera vez vas
          a elegir tu contraseña definitiva.
        </p>
      </div>
    </main>
  );
}
