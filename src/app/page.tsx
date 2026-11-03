"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useLandingSession } from "@/lib/use-landing-session";
import { cn } from "@/lib/utils";

type PreviewTab = "coach" | "athlete";

export default function HomePage() {
  const { user, loading } = useLandingSession();
  const [activeTab, setActiveTab] = React.useState<PreviewTab>("coach");

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200 flex flex-col antialiased">
      {/* 1. Barra de navegación corporativa fija */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-card/90 backdrop-blur-md transition-colors duration-150">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo y Enlaces de Navegación */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-lg shadow-sm">
                G
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-foreground">
                  GOZSter
                </span>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] tracking-wider uppercase font-bold text-primary border-primary/30 bg-primary/10 px-1.5 py-0"
                >
                  ENTERPRISE
                </Badge>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-6">
              <a
                href="#features"
                className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Gimnasios &amp; Sedes
              </a>
              <a
                href="#demo"
                className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Constructor de Rutinas
              </a>
              <a
                href="#athlete"
                className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                App de Alumnos
              </a>
              <a
                href="#pricing"
                className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Open Source ($0/mes)
              </a>
            </nav>
          </div>

          {/* Acciones del Cabezal: Sesión, CTAs y Toggle de Tema */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Cápsula de Sesión Inteligente */}
            {!loading && user ? (
              <div
                data-testid="session-capsule"
                className="flex items-center gap-2 rounded-full border border-border/90 bg-surface-container/60 px-3 py-1 text-xs"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[11px] font-semibold text-foreground">
                  {user.displayName} (
                  {user.rol === "ADMIN"
                    ? "Admin"
                    : user.rol === "ENTRENADOR"
                    ? "Coach"
                    : "Atleta"}
                  )
                </span>
              </div>
            ) : !loading ? (
              <Link
                href="/login"
                data-testid="session-capsule"
                className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface-container/50 hover:bg-surface-container px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                <span className="font-mono text-[11px] font-semibold">
                  Iniciar Sesión
                </span>
              </Link>
            ) : null}

            {/* Botón destacado: Portal Alumnos */}
            <Link
              href="/athlete"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold shadow-sm active:scale-[0.98] transition-all"
            >
              <svg
                className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                <path d="M12 18h.01" />
              </svg>
              <span>Portal Alumnos</span>
            </Link>

            {/* Acceso a Coach Studio */}
            <Link
              href="/studio"
              className="hidden xs:inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary hover:brightness-105 text-primary-foreground px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold shadow-sm active:scale-[0.98] transition-all"
            >
              <span>Coach Studio</span>
              <span aria-hidden="true">→</span>
            </Link>

            {/* Conmutador Bimodal */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1">
        {/* 2. Hero Corporativo B2B enfocado en retención y $0 costo */}
        <section className="pt-12 pb-16 sm:pt-20 sm:pb-24 text-center max-w-5xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container/60 px-4 py-1.5 text-xs font-mono font-semibold text-muted-foreground mb-6 shadow-xs">
            <span>INFRAESTRUCTURA DE FUERZA</span>
            <span className="text-border" aria-hidden="true">
              •
            </span>
            <strong className="text-primary font-bold">
              $0 COSTO EN LICENCIAS MENSUALES
            </strong>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-foreground leading-[1.08] mb-6">
            La plataforma de entrenamiento y retención que{" "}
            <span className="text-primary">potencia tu negocio</span>{" "}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-400 bg-clip-text text-transparent">
              sin pagar licencias
            </span>
            .
          </h1>

          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-10">
            Reemplazá plataformas de gimnasio comerciales por una suite de fuerza de alto rendimiento. Control centralizado de entrenadores, analítica de bajas y la app offline que tus atletas realmente van a usar.
          </p>

          {/* CTAs Dinámicos Adaptados a Sesión */}
          <div className="flex flex-wrap justify-center gap-3.5 mb-14">
            {user?.rol === "ALUMNO" ? (
              <>
                <Link
                  href="/athlete"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3 text-sm sm:text-base font-bold text-white shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12" />
                  </svg>
                  <span>Entrenar como Atleta (Mi Rutina)</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/studio"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card hover:bg-secondary/80 px-6 py-3 text-sm sm:text-base font-bold text-foreground shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span>Explorar Coach Studio</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/studio"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm sm:text-base font-bold text-primary-foreground shadow-sm hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span>Ingresar al Panel de Administrador</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/athlete"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border/80 bg-card hover:bg-secondary/80 px-6 py-3 text-sm sm:text-base font-bold text-foreground shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                >
                  <svg
                    className="h-4 w-4 text-emerald-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12" />
                  </svg>
                  <span>Entrenar como Atleta (Mi Rutina)</span>
                </Link>
              </>
            )}
          </div>

          {/* Grilla de Métricas Reales de Producción (No-AI Slop) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
            <Card className="p-4 sm:p-5 border-border/80 bg-card shadow-xs">
              <div className="font-mono text-2xl sm:text-3xl font-bold text-primary">
                13
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 leading-snug">
                Atletas y alumnos con membresía activa
              </div>
            </Card>

            <Card className="p-4 sm:p-5 border-border/80 bg-card shadow-xs">
              <div className="font-mono text-2xl sm:text-3xl font-bold text-emerald-500">
                100%
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 leading-snug">
                Tolerancia a sótanos sin señal (Offline-First)
              </div>
            </Card>

            <Card className="p-4 sm:p-5 border-border/80 bg-card shadow-xs">
              <div className="font-mono text-2xl sm:text-3xl font-bold text-sky-400">
                $0
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 leading-snug">
                Gasto en licencias corporativas por mes
              </div>
            </Card>

            <Card className="p-4 sm:p-5 border-border/80 bg-card shadow-xs">
              <div className="font-mono text-2xl sm:text-3xl font-bold text-foreground">
                1RM
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 leading-snug">
                Fórmulas científicas Epley y Brzycki auditadas
              </div>
            </Card>
          </div>
        </section>

        {/* 3. Módulo Interactivo de Previsualización: Coach Studio vs Athlete App */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20" id="demo">
          <div className="flex justify-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab("coach")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                activeTab === "coach"
                  ? "bg-card text-foreground border-primary shadow-sm"
                  : "bg-surface-container/60 text-muted-foreground border-border hover:bg-surface-container hover:text-foreground"
              )}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
              </svg>
              <span>Vista Coach Studio (Desktop)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("athlete")}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer",
                activeTab === "athlete"
                  ? "bg-card text-foreground border-emerald-500 shadow-sm"
                  : "bg-surface-container/60 text-muted-foreground border-border hover:bg-surface-container hover:text-foreground"
              )}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span>Vista Athlete App (Mobile PWA)</span>
            </button>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-lg">
            {/* Topbar de la ventana simulada */}
            <div className="flex items-center justify-between border-b border-border/80 bg-surface-container/50 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
                <span className="h-2.5 w-2.5 rounded-full bg-border" />
              </div>
              <div className="font-mono text-xs text-muted-foreground truncate px-2">
                {activeTab === "coach"
                  ? "gozster.vercel.app/studio • Panel General de Alumnos y Retención"
                  : "gozster.vercel.app/athlete • Modo Entrenamiento en Vivo"}
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline">PRODUCCIÓN ACTIVA</span>
              </div>
            </div>

            {/* Cuerpo de la Previsualización */}
            <div className="p-4 sm:p-8">
              {activeTab === "coach" ? (
                /* Previsualización: Coach Studio */
                <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 text-left">
                  {/* Barra lateral de alumnos */}
                  <div className="rounded-xl border border-border/70 bg-surface-container/40 p-4 space-y-3">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                      Alumnos Asignados (13)
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/25 px-3 py-2 text-xs font-semibold text-primary">
                        <span>Gabriel Sanchez</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/20">
                          GABI AGOSTO
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2 text-xs font-medium text-foreground">
                        <span>Celeste Gerardi</span>
                        <span className="font-mono text-[10px] text-emerald-500 font-bold">
                          ACTIVA
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2 text-xs font-medium text-foreground">
                        <span>Esteban Papic</span>
                        <span className="font-mono text-[10px] text-emerald-500 font-bold">
                          ACTIVO
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2 text-xs font-medium text-foreground">
                        <span>Michelle Roach</span>
                        <span className="font-mono text-[10px] text-emerald-500 font-bold">
                          ACTIVA
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Panel Principal con KPIs y Resumen de Rutinas */}
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-border/70 bg-surface-container/40 p-4">
                        <div className="text-[11px] uppercase font-bold text-muted-foreground">
                          Retención
                        </div>
                        <div className="font-mono text-2xl font-bold text-emerald-500 mt-1">
                          100%
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          0 clientes perdidos este mes
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-surface-container/40 p-4">
                        <div className="text-[11px] uppercase font-bold text-muted-foreground">
                          Sobrecarga
                        </div>
                        <div className="font-mono text-2xl font-bold text-primary mt-1">
                          +4.8%
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Incremento de tonelaje medio
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-surface-container/40 p-4">
                        <div className="text-[11px] uppercase font-bold text-muted-foreground">
                          Estado de Cuenta
                        </div>
                        <div className="font-mono text-2xl font-bold text-foreground mt-1">
                          ADMIN
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Control total de profesores
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-surface-container/40 p-4 sm:p-5">
                      <h4 className="font-bold text-sm text-foreground mb-1">
                        Constructor Visual de Rutinas y Superseries
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Editor de días de entrenamiento con cálculo automático de descansos, tempo de ejecución (ej. 3-0-1-0) y agrupación de biseries con un solo clic.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Previsualización: Athlete App */
                <div className="max-w-md mx-auto rounded-2xl border border-border/80 bg-surface-container/40 p-5 sm:p-6 text-left space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-500 tracking-wide">
                      DÍA 1 • TORSO PESADO
                    </span>
                    <span className="font-mono text-[11px] font-semibold bg-emerald-500/15 text-emerald-500 px-2 py-0.5 rounded">
                      OFFLINE OK
                    </span>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
                    <div>
                      <div className="font-bold text-sm sm:text-base text-foreground">
                        Press Plano con Barra
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        4 series x 8-10 reps • Descanso: 120s
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/60">
                      <div>
                        <div className="text-[11px] text-muted-foreground">
                          Serie 1 (Efectiva)
                        </div>
                        <div className="font-mono font-bold text-sm sm:text-base text-foreground">
                          80 kg x 10 reps
                        </div>
                      </div>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-bold text-sm shadow-xs">
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 p-4 text-center">
                    <div className="font-mono text-[11px] font-bold text-sky-400 tracking-wider">
                      CRONÓMETRO DE DESCANSO AUTOMÁTICO
                    </div>
                    <div className="font-mono text-3xl font-extrabold text-sky-400 my-1">
                      01:45
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Alerta audible y vibración al llegar a cero
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 4. Banner de acceso exclusivo para socios y atletas de fuerza */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 my-16 sm:my-20" id="athlete">
          <Card className="relative overflow-hidden border-emerald-500/30 bg-card p-6 sm:p-10 shadow-md">
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500"
              aria-hidden="true"
            />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 text-left">
                <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-emerald-500">
                  <span>ACCESO EXCLUSIVO ALUMNOS</span>
                  <span aria-hidden="true">•</span>
                  <span>MODO OFFLINE PWA</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                  ¿Sos socio, alumno o atleta de GOZSter?
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed">
                  Abrí tu rutina en vivo directamente en tu celular. Registrá series, consultá videos de técnica de YouTube y descansá con el temporizador automático sonoro.
                </p>
              </div>

              <Link
                href="/athlete"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 text-sm font-bold shadow-sm active:scale-[0.98] transition-all whitespace-nowrap self-start md:self-center"
              >
                <span>Abrir mi Entrenamiento en Vivo</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Card>
        </section>

        {/* 5. Grilla de pilares biomecánicos y gobernanza multi-entrenador */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20" id="features">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              Diseñado para la Gestión Real de Fuerza
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl mx-auto">
              Ingeniería de software deportiva para reemplazar licencias comerciales obsoletas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <Card className="p-6 sm:p-7 border-border/80 bg-card shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 shadow-xs">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-foreground mb-2">
                  Estructura Multi-Entrenador
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Gobernanza por roles: Administrador general, Profesores de sala y Alumnos. Cada profesor gestiona su cupo y el administrador audita la retención global.
                </p>
              </div>
            </Card>

            <Card className="p-6 sm:p-7 border-border/80 bg-card shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 mb-4 shadow-xs">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-foreground mb-2">
                  Alertas de Sobrecarga y Récords
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Notificaciones automáticas cuando un atleta supera su récord de carga (PR) o reporta dolor articular agudo, protegiendo la salud física del alumno.
                </p>
              </div>
            </Card>

            <Card className="p-6 sm:p-7 border-border/80 bg-card shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-400 mb-4 shadow-xs">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-foreground mb-2">
                  Arquitectura Bimodal Ergonométrica
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Modo Día Suave optimizado para horas de trabajo de escritorio frente a la computadora y Modo Noche Pulido para la penumbra del gimnasio sin fatiga visual.
                </p>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* 6. Footer Corporativo */}
      <footer className="border-t border-border/80 bg-card py-10 px-4 sm:px-6 lg:px-8" id="pricing">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <span className="font-black text-base text-foreground tracking-tight">
              GOZSter Platform
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Plataforma libre y de código abierto para entrenadores, gimnasios y atletas de fuerza.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Desarrollado para el rendimiento deportivo • Fresias / GOZSter
          </p>
        </div>
      </footer>
    </div>
  );
}
