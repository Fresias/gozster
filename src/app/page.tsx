import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
  return (
    <div className="relative min-h-dvh bg-background selection:bg-primary/20 selection:text-primary">
      {/* Background ambient gradient glow */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        aria-hidden="true"
      >
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary/30 to-emerald-500/10 opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
        />
      </div>

      <main className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-between px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Navigation Bar / Brand Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-lg shadow-sm">
              G
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-foreground">
                GOZSter <span className="text-primary font-normal text-sm sm:text-base">Performance</span>
              </span>
              <p className="text-[11px] text-muted-foreground">
                Material Design 3 • UI/UX Pro Max Edition
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="success" className="px-3 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-1" />
              100% Offline-First PWA
            </Badge>
            <Badge variant="secondary" className="px-3 py-1 text-xs">
              Hevy &amp; Mynter Protocol
            </Badge>
          </div>
        </header>

        {/* Hero Section */}
        <section className="my-8 space-y-4 text-center sm:my-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
            <span>⚡ Potencia, Sobrecarga y Control Táctil</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground max-w-4xl mx-auto">
            Plataforma de Fuerza y Rendimiento de Clase Mundial
          </h1>

          <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Diseñada con la ergonomía táctil de <strong>Material 3</strong> y las fórmulas científicas de sobrecarga progresiva. Funciona sin interrupciones en el gimnasio con o sin conexión a internet.
          </p>
        </section>

        {/* Primary Environments (Coach Studio & Athlete App) */}
        <section className="grid gap-6 md:grid-cols-2 my-4">
          {/* Coach Studio Card */}
          <Card className="flex flex-col justify-between border-border/80 hover:border-primary/50 transition-all duration-200 bg-card/90 shadow-m3-1 hover:shadow-m3-2">
            <CardHeader className="space-y-3 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary text-2xl font-bold">
                  📊
                </span>
                <Badge variant="outline" className="text-xs">
                  Desktop &amp; Tablet
                </Badge>
              </div>

              <div>
                <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
                  Coach Studio
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Panel ejecutivo de retención de alumnos (KPIs de activos, sin plan y churn rate), catálogo con videos de técnica de YouTube, y constructor visual de rutinas con superseries.
                </CardDescription>
              </div>

              {/* Feature Micro-pills */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  👥 Roster de Atletas
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  📈 Sobrecarga Progresiva
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  🛠️ Constructor Visual
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 pt-0 space-y-3">
              <Link
                href="/studio"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
              >
                Abrir Coach Studio →
              </Link>
              <Link
                href="/studio/dashboard"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border/80 bg-secondary/60 px-4 py-2 text-xs font-semibold text-secondary-foreground hover:bg-secondary active:scale-[0.98] transition-all cursor-pointer"
              >
                Ver Dashboard de Analíticas y Retención
              </Link>
            </CardContent>
          </Card>

          {/* Athlete App Card */}
          <Card className="flex flex-col justify-between border-border/80 hover:border-emerald-500/50 transition-all duration-200 bg-card/90 shadow-m3-1 hover:shadow-m3-2">
            <CardHeader className="space-y-3 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 text-2xl font-bold">
                  📱
                </span>
                <Badge variant="success" className="text-xs">
                  Mobile-First PWA
                </Badge>
              </div>

              <div>
                <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
                  Athlete App
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Modo "Entrenamiento en Vivo" optimizado para el gimnasio con botones táctiles grandes, temporizador de descanso automático con alertas audibles y estimación de 1RM en tiempo real.
                </CardDescription>
              </div>

              {/* Feature Micro-pills */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  ⏱️ Cronómetro Inteligente
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  🏋️ Calculadora de Discos
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  🔥 Calentamiento Específico
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 pt-0 space-y-3">
              <Link
                href="/athlete"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 active:scale-[0.98] transition-all cursor-pointer"
              >
                Abrir Athlete App (PWA) →
              </Link>
              <div className="text-center">
                <span className="text-[11px] text-muted-foreground">
                  Compatible con Modo Avión / Sin Conexión
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 3 Pillars Showcase */}
        <section className="my-8 grid gap-4 sm:grid-cols-3 border-t border-border/80 pt-8">
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-1.5">
            <div className="text-lg">🛡️</div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Offline-First Garantizado
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Estado local en Zustand con middleware de persistencia. Registra series completas sin señal de red.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-1.5">
            <div className="text-lg">📐</div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Ciencia &amp; Métricas Reales
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Fórmulas Epley y Brzycki para 1RM, tonelaje efectivo excluyendo series de aproximación (Hevy Standard).
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-1.5">
            <div className="text-lg">✨</div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Ergonomía Táctil M3
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Zonas de toque mínimas de 48px, alto contraste en modo oscuro deportivo y controles accesibles con una mano.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          <p>© 2026 GOZSter Strength &amp; Performance. Todos los derechos reservados.</p>
        </footer>
      </main>
    </div>
  );
}

