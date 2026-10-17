import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function HomePage() {
  return (
    <div className="relative min-h-dvh bg-background text-foreground selection:bg-primary/20 selection:text-primary transition-colors duration-150">
      <main className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-between px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Navigation Bar / Brand Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-lg shadow-sm">
              G
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-foreground">
                GOZSter <span className="text-primary font-semibold text-sm sm:text-base">Performance</span>
              </span>
              <p className="text-[11px] text-muted-foreground font-medium">
                Arquitectura Bimodal • Modo Día &amp; Modo Noche
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
            <ThemeToggle showLabel />
          </div>
        </header>

        {/* Hero Section */}
        <section className="my-8 space-y-4 text-center sm:my-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span>Potencia, Sobrecarga y Control Táctil Bimodal</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground max-w-4xl mx-auto">
            Plataforma de Fuerza y Rendimiento de Clase Mundial
          </h1>

          <p className="mx-auto max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            Diseñada con la ergonomía táctil de <strong>Material 3</strong> y las fórmulas científicas de sobrecarga progresiva. Interfaz refinada en <strong>Modo Día Suave</strong> y <strong>Modo Noche Pulido</strong>.
          </p>
        </section>

        {/* Primary Environments (Coach Studio & Athlete App) */}
        <section className="grid gap-6 md:grid-cols-2 my-4">
          {/* Coach Studio Card */}
          <Card className="flex flex-col justify-between border-border/80 hover:border-primary/50 transition-all duration-200 bg-card shadow-sm hover:shadow-md">
            <CardHeader className="space-y-3 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
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
                  Roster de Atletas INDEC
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  Sobrecarga Progresiva
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  Constructor Visual
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
          <Card className="flex flex-col justify-between border-border/80 hover:border-emerald-500/50 transition-all duration-200 bg-card shadow-sm hover:shadow-md">
            <CardHeader className="space-y-3 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 shadow-xs">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
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
                  Modo &quot;Entrenamiento en Vivo&quot; optimizado para el gimnasio con botones táctiles grandes, temporizador de descanso automático con alertas audibles y estimación de 1RM en tiempo real.
                </CardDescription>
              </div>

              {/* Feature Micro-pills */}
              <div className="flex flex-wrap gap-1.5 pt-2">
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  Cronómetro Inteligente
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  Calculadora de Discos
                </span>
                <span className="rounded-lg bg-secondary/80 px-2.5 py-1 text-[11px] font-semibold text-foreground border border-border/60">
                  Calentamiento Específico
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
                <span className="text-[11px] text-muted-foreground font-medium">
                  Compatible con Modo Avión / Sin Conexión
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 3 Pillars Showcase */}
        <section className="my-8 grid gap-4 sm:grid-cols-3 border-t border-border/80 pt-8">
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Offline-First Garantizado
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Estado local en Zustand con middleware de persistencia. Registra series completas sin señal de red.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Ciencia &amp; Métricas Reales
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Fórmulas Epley y Brzycki para 1RM, tonelaje efectivo excluyendo series de aproximación (Hevy Standard).
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Ergonomía Táctil Bimodal
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Zonas de toque mínimas de 48px, alto contraste equilibrado en modo día y noche, y controles accesibles con una mano.
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
