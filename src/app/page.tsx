"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LandingSessionCapsule } from "@/components/landing-session-capsule";
import { useLandingSession } from "@/lib/use-landing-session";

export default function HomePage() {
  const { user } = useLandingSession();
  const [activeRpe, setActiveRpe] = React.useState<number>(8.5);

  const whatsappMessage = encodeURIComponent(
    "Hola Gonza, quiero comenzar a entrenar con vos. Me gustaría consultar por las modalidades disponibles."
  );
  const whatsappUrl = `https://wa.me/5491100000000?text=${whatsappMessage}`;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200 flex flex-col antialiased overflow-x-hidden selection:bg-primary/20 selection:text-primary">
      {/* 1. Header / Barra de Navegación Fija */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-md transition-colors duration-150">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo Zinc "G" y Enlaces Técnicos */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              aria-label="Inicio GOZSter"
            >
              <div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-base shadow-sm group-hover:opacity-90 transition-opacity">
                G
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-foreground">
                  GOZSter
                </span>
                <span className="hidden sm:inline-block font-mono text-[10px] tracking-wider uppercase font-semibold text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                  HEAD COACH
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-6" aria-label="Navegación principal">
              <a
                href="#trayectoria"
                className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Trayectoria
              </a>
              <a
                href="#modalidades"
                className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Modalidades
              </a>
              <a
                href="#infraestructura"
                className="text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Infraestructura
              </a>
            </nav>
          </div>

          {/* Acciones de Cabecera: Sesión, Acceso a Portales y ThemeToggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Cápsula de Sesión Inteligente con Botón de Logout */}
            <LandingSessionCapsule
              initialUser={
                user
                  ? {
                      email: user.email,
                      nombre: `${user.displayName} (${user.rol === "ADMIN" ? "Admin" : "Atleta"})`,
                    }
                  : null
              }
            />

            {/* Portal Alumnos (Athlete App) */}
            <Link
              href="/athlete"
              className="hidden sm:inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border/80 bg-secondary/60 hover:bg-secondary text-secondary-foreground px-3.5 py-2 text-xs sm:text-sm font-semibold shadow-xs active:scale-[0.98] transition-all"
            >
              <svg
                className="size-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
              className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-xs sm:text-sm font-bold shadow-xs active:scale-[0.98] transition-all"
            >
              <span>Coach Studio</span>
              <span aria-hidden="true">→</span>
            </Link>

            {/* Selector de Tema */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1">
        {/* 2. Hero Section (Composición 3D Spectup) */}
        <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
          {/* Badge superior técnico en monoespaciado */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container/60 px-3.5 py-1 font-mono text-xs text-muted-foreground mb-6 shadow-xs">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            <span>DIRECTOR TÉCNICO &amp; INFRAESTRUCTURA DE FUERZA</span>
            <span className="text-border" aria-hidden="true">•</span>
            <span className="text-foreground font-semibold">$0 LICENCIAS</span>
          </div>

          {/* Título editorial sobrio y de impacto atlético con micro-glitch */}
          <div className="max-w-4xl mx-auto mb-6">
            <div className="mb-2">
              <span
                data-text="GONZALO SALAS"
                className="glitch-hover inline-block font-black text-3xl sm:text-5xl lg:text-6xl tracking-tight text-foreground uppercase cursor-default select-none"
              >
                GONZALO SALAS
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.12]">
              Entrenamiento de élite e infraestructura tecnológica soberana.
            </h1>
          </div>

          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            Preparación física de fuerza, levantamiento olímpico y boxeo técnico. Planificación biomecánica respaldada por un sistema de software libre, autónomo y sin costos de suscripción mensual.
          </p>

          {/* Conversión Bivalente (CTAs del Hero adaptados dinámicamente a la sesión) */}
          <div className="flex flex-wrap justify-center items-center gap-3.5 sm:gap-4 mb-16">
            {user?.rol === "ALUMNO" ? (
              <>
                <Link
                  href="/athlete"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm sm:text-base font-bold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <svg
                    className="size-4"
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
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-secondary text-foreground px-6 py-3 text-sm sm:text-base font-bold shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span>Explorar Coach Studio</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl border border-border/80 bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground px-4 py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer"
                >
                  <span>Consultar con Gonza</span>
                </a>
              </>
            ) : user?.rol === "ADMIN" ? (
              <>
                <Link
                  href="/studio"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm sm:text-base font-bold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span>Ingresar al Panel de Administrador</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/athlete"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-secondary text-foreground px-6 py-3 text-sm sm:text-base font-bold shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                >
                  <svg
                    className="size-4"
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
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl border border-border/80 bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground px-4 py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer"
                >
                  <span>Comenzar a Entrenar con Gonza</span>
                </a>
              </>
            ) : (
              <>
                {/* CTA Primario Atleta: Entrenar con Gonza */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm sm:text-base font-bold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  <span>Comenzar a Entrenar con Gonza</span>
                  <span aria-hidden="true">→</span>
                </a>

                {/* CTA Secundario Coach: Ingresar al Panel de Administrador / Coach Studio */}
                <Link
                  href="/studio"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-secondary text-foreground px-6 py-3 text-sm sm:text-base font-bold shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span>Ingresar a Coach Studio</span>
                  <span aria-hidden="true">→</span>
                </Link>

                {/* CTA Atleta directo */}
                <Link
                  href="/athlete"
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-2 rounded-xl border border-border/80 bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground px-4 py-3 text-xs sm:text-sm font-semibold transition-all cursor-pointer"
                >
                  <span>Athlete App (PWA)</span>
                </Link>
              </>
            )}
          </div>

          {/* Abanico de 3 Tarjetas en Perspectiva 3D (Desktop >= 1024px) */}
          <div className="relative max-w-6xl mx-auto perspective-1200 pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch transform-style-3d text-left">
              {/* Tarjeta 1: Planificación de Rutinas */}
              <Card
                className="hero-3d-card p-5 sm:p-6 border-border/80 bg-card/95 shadow-lg flex flex-col justify-between lg:[transform:rotateY(10deg)_rotateX(4deg)_translateZ(-20px)] lg:hover:[transform:rotateY(4deg)_rotateX(2deg)_translateZ(0px)] transition-all duration-300"
                data-testid="hero-card-rutinas"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/80">
                    <span className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      01 · PLANIFICACIÓN TÉCNICA
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                      MICROCICLO 4
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">
                    Sentadilla Trasera (Back Squat)
                  </h3>
                  <div className="font-mono tabular-nums text-sm font-semibold text-primary mb-3">
                    4 series × 5 reps @ 80% (140 kg)
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span>Tempo excéntrico</span>
                      <span className="font-mono font-bold text-foreground">3-1-X-1</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span>Descanso entre series</span>
                      <span className="font-mono font-bold text-foreground">180s</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Intensidad programada</span>
                      <span className="font-mono font-bold text-foreground">RPE 8.5 (RIR 2)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/70 text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Nota biomecánica:</span> Mantener bracing intraabdominal firme y verticalidad del torso sin rebote en paralelo.
                </div>
              </Card>

              {/* Tarjeta 2: Registro en Vivo (Focal Point / Centro) */}
              <Card
                className="hero-3d-card p-5 sm:p-6 border-primary/40 bg-card shadow-2xl flex flex-col justify-between lg:[transform:translateZ(30px)_scale(1.02)] lg:hover:[transform:translateZ(45px)_scale(1.04)] z-20 transition-all duration-300"
                data-testid="hero-card-live"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/80">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                      <span className="font-mono text-xs font-bold text-foreground uppercase tracking-wider">
                        02 · REGISTRO EN VIVO
                      </span>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px] font-bold">
                      100% Offline-First PWA
                    </Badge>
                  </div>

                  {/* Cronómetro de Descanso Automático */}
                  <div className="rounded-xl border border-border/80 bg-secondary/40 p-3 mb-4 text-center">
                    <div className="text-[11px] font-mono uppercase text-muted-foreground mb-1">
                      Cronómetro Inteligente de Descanso Automático
                    </div>
                    <div className="font-mono tabular-nums text-4xl font-black tracking-wider text-foreground">
                      01:45
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-primary" />
                      <span>Calentamiento Específico, alerta audible y vibración sincronizada</span>
                    </div>
                  </div>

                  {/* Selector Interactivo RPE 1-10 */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-foreground">Esfuerzo Percibido (RPE)</span>
                      <span className="font-mono font-bold text-primary tabular-nums">
                        RPE {activeRpe}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[7, 7.5, 8, 8.5, 9].map((rpeVal) => (
                        <button
                          key={rpeVal}
                          type="button"
                          onClick={() => setActiveRpe(rpeVal)}
                          className={`min-h-[48px] rounded-lg border font-mono text-xs font-bold transition-all ${
                            activeRpe === rpeVal
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "border-border/80 bg-background hover:bg-secondary text-foreground"
                          }`}
                          aria-label={`Seleccionar RPE ${rpeVal}`}
                        >
                          {rpeVal}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Checkbox de Serie Completada */}
                  <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="size-4 rounded border border-primary bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
                        ✓
                      </div>
                      <span className="font-medium text-foreground">
                        Serie 2: 140 kg × 5 reps
                      </span>
                    </div>
                    <span className="font-mono font-bold text-muted-foreground">RPE 8.0</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/70 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Serie actual: 3 de 4</span>
                  <span className="font-mono font-semibold text-foreground">Carga activa: 140 kg</span>
                </div>
              </Card>

              {/* Tarjeta 3: Progresión 1RM y Analítica */}
              <Card
                className="hero-3d-card p-5 sm:p-6 border-border/80 bg-card/95 shadow-lg flex flex-col justify-between lg:[transform:rotateY(-10deg)_rotateX(4deg)_translateZ(-20px)] lg:hover:[transform:rotateY(-4deg)_rotateX(2deg)_translateZ(0px)] transition-all duration-300"
                data-testid="hero-card-1rm"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/80">
                    <span className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      03 · PROGRESIÓN Y 1RM
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                      FÓRMULAS AUDITADAS
                    </Badge>
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">
                    Cálculo Biomecánico de Fuerza
                  </h3>
                  <div className="space-y-3 mt-3">
                    <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
                      <div className="text-[11px] text-muted-foreground">1RM Estimado (Fórmula Epley)</div>
                      <div className="font-mono tabular-nums text-xl font-bold text-foreground">
                        185.0 kg <span className="text-xs font-normal text-muted-foreground">(+12.5 kg)</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
                      <div className="text-[11px] text-muted-foreground">1RM Estimado (Fórmula Brzycki)</div>
                      <div className="font-mono tabular-nums text-xl font-bold text-foreground">
                        183.4 kg
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
                      <div className="text-[11px] text-muted-foreground">Tonelaje Semanal Acumulado</div>
                      <div className="font-mono tabular-nums text-xl font-bold text-foreground">
                        14,250 kg
                      </div>
                    </div>
                  </div>
                </div>

                {/* Micro barra visual de sobrecarga progresiva */}
                <div className="mt-4 pt-3 border-t border-border/70">
                  <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                    <span>Sobrecarga en 4 semanas</span>
                    <span className="font-mono font-bold text-foreground">+16.6%</span>
                  </div>
                  <div className="flex items-end gap-1.5 h-8">
                    <div className="flex-1 bg-muted rounded-xs h-4" title="Semana 1: 120 kg" />
                    <div className="flex-1 bg-muted rounded-xs h-5" title="Semana 2: 127.5 kg" />
                    <div className="flex-1 bg-muted rounded-xs h-6.5" title="Semana 3: 135 kg" />
                    <div className="flex-1 bg-primary rounded-xs h-8" title="Semana 4: 140 kg" />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* 3. Métricas de Impacto */}
        <section className="border-y border-border/80 bg-card/40 py-10 my-10 sm:my-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/80 text-center">
              <div className="p-4 sm:p-6">
                <div className="font-mono tabular-nums text-3xl sm:text-5xl font-black text-foreground">
                  +150
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                  Alumnos acompañados en fuerza, hipertrofia y acondicionamiento
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="font-mono tabular-nums text-3xl sm:text-5xl font-black text-foreground">
                  3
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                  Modalidades de trabajo (Funcional, Boxeo y Rutinas online)
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="font-mono tabular-nums text-3xl sm:text-5xl font-black text-foreground">
                  5+
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                  Años de trayectoria profesional y formación docente continua
                </div>
              </div>
              <div className="p-4 sm:p-6">
                <div className="font-mono tabular-nums text-3xl sm:text-5xl font-black text-foreground">
                  $0
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                  Costo en licencias corporativas por mes (Software Soberano)
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Credenciales de Gonzalo Salas (Franjas GlyphsLabs) */}
        <section id="trayectoria" className="py-16 sm:py-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center sm:text-left mb-10 sm:mb-14">
            <div className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
              01 / ACREDITACIONES Y TRAYECTORIA
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
              Formación Académica y Dirección Técnica
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl">
              Respaldado por las instituciones de educación física, fuerza y deportes de combate de mayor rigor técnico de Argentina y Europa.
            </p>
          </div>

          {/* 4 Franjas Apiladas con Inversión Nítida de Color al Hover */}
          <div className="border-t border-border/80">
            {/* Franja 01 */}
            <div
              className="group border-b border-border/80 px-4 sm:px-8 py-6 sm:py-7 transition-colors duration-150 hover:bg-foreground hover:text-background cursor-default flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              data-testid="franja-cv-1"
            >
              <div className="flex items-start sm:items-center gap-4 sm:gap-6">
                <span className="font-mono text-xl sm:text-2xl font-bold text-muted-foreground group-hover:text-background transition-colors duration-150">
                  01
                </span>
                <div>
                  <h3 className="text-base sm:text-xl font-bold tracking-tight text-foreground group-hover:text-background transition-colors duration-150">
                    Profesor Nacional de Educación Física
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground group-hover:text-background/80 transition-colors duration-150">
                    ISEF N°1 &quot;Dr. Enrique Romero Brest&quot;
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono text-muted-foreground group-hover:text-background/80 transition-colors duration-150 sm:text-right">
                Docencia de Grado &amp; Fisiología Humana
              </div>
            </div>

            {/* Franja 02 */}
            <div
              className="group border-b border-border/80 px-4 sm:px-8 py-6 sm:py-7 transition-colors duration-150 hover:bg-foreground hover:text-background cursor-default flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              data-testid="franja-cv-2"
            >
              <div className="flex items-start sm:items-center gap-4 sm:gap-6">
                <span className="font-mono text-xl sm:text-2xl font-bold text-muted-foreground group-hover:text-background transition-colors duration-150">
                  02
                </span>
                <div>
                  <h3 className="text-base sm:text-xl font-bold tracking-tight text-foreground group-hover:text-background transition-colors duration-150">
                    Personal Trainer Certificado
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground group-hover:text-background/80 transition-colors duration-150">
                    Centro Europeo de Educación Física
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono text-muted-foreground group-hover:text-background/80 transition-colors duration-150 sm:text-right">
                Hipertrofia &amp; Prescripción de Fuerza
              </div>
            </div>

            {/* Franja 03 */}
            <div
              className="group border-b border-border/80 px-4 sm:px-8 py-6 sm:py-7 transition-colors duration-150 hover:bg-foreground hover:text-background cursor-default flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              data-testid="franja-cv-3"
            >
              <div className="flex items-start sm:items-center gap-4 sm:gap-6">
                <span className="font-mono text-xl sm:text-2xl font-bold text-muted-foreground group-hover:text-background transition-colors duration-150">
                  03
                </span>
                <div>
                  <h3 className="text-base sm:text-xl font-bold tracking-tight text-foreground group-hover:text-background transition-colors duration-150">
                    Entrenador en Halterofilia
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground group-hover:text-background/80 transition-colors duration-150">
                    Grupo GPO Latam
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono text-muted-foreground group-hover:text-background/80 transition-colors duration-150 sm:text-right">
                Levantamiento Olímpico &amp; Potencia
              </div>
            </div>

            {/* Franja 04 */}
            <div
              className="group border-b border-border/80 px-4 sm:px-8 py-6 sm:py-7 transition-colors duration-150 hover:bg-foreground hover:text-background cursor-default flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              data-testid="franja-cv-4"
            >
              <div className="flex items-start sm:items-center gap-4 sm:gap-6">
                <span className="font-mono text-xl sm:text-2xl font-bold text-muted-foreground group-hover:text-background transition-colors duration-150">
                  04
                </span>
                <div>
                  <h3 className="text-base sm:text-xl font-bold tracking-tight text-foreground group-hover:text-background transition-colors duration-150">
                    Director Técnico de Boxeo
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground group-hover:text-background/80 transition-colors duration-150">
                    Federación Argentina de Boxeo (FAB)
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono text-muted-foreground group-hover:text-background/80 transition-colors duration-150 sm:text-right">
                Técnica Pugilística &amp; Combate
              </div>
            </div>
          </div>
        </section>

        {/* 5. Modalidades de Trabajo (Exactamente 3 Disciplinas) */}
        <section id="modalidades" className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
              02 / DISCIPLINAS DISPONIBLES
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Modalidades de Trabajo
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              Entrenamiento adaptado a tus metas atléticas, ya sea presencial o a distancia mediante software dedicado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Modalidad 1: Funcional */}
            <Card className="p-6 sm:p-8 border-border/80 bg-card rounded-2xl flex flex-col justify-between hover:border-primary/60 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                    MODALIDAD 01
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">PRESENCIAL</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-3">
                  Funcional
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  Desarrollo de fuerza integral, control postural y acondicionamiento cardiovascular mediante patrones motores básicos: empujes, tracciones, bisagras de cadera y traslaciones.
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Movilidad articular y prevención de lesiones</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Cargas reguladas según test de aptitud</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Densidad de trabajo y resistencia metabólica</span>
                  </li>
                </ul>
              </div>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-foreground text-xs sm:text-sm font-bold transition-all"
              >
                <span>Consultar por Funcional</span>
                <span aria-hidden="true">→</span>
              </a>
            </Card>

            {/* Modalidad 2: Boxeo */}
            <Card className="p-6 sm:p-8 border-border/80 bg-card rounded-2xl flex flex-col justify-between hover:border-primary/60 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                    MODALIDAD 02
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">ESCUELA FAB</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-3">
                  Boxeo
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  Escuela técnica avalada por la Federación Argentina de Boxeo. Trabajo de desplazamientos, combinaciones en manoplas, bolsa pesada, reflejos defensivos y acondicionamiento específico de combate.
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Fundamentos biomecánicos del golpeo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Coordinación óculo-manual y juego de pies</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Sparring técnico controlado y optativo</span>
                  </li>
                </ul>
              </div>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-foreground text-xs sm:text-sm font-bold transition-all"
              >
                <span>Consultar por Boxeo</span>
                <span aria-hidden="true">→</span>
              </a>
            </Card>

            {/* Modalidad 3: Rutinas online */}
            <Card className="p-6 sm:p-8 border-border/80 bg-card rounded-2xl flex flex-col justify-between hover:border-primary/60 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
                    MODALIDAD 03
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">REMOTO / PWA</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-3">
                  Rutinas online
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  Planificación personalizada e individualizada cargada directamente en la Athlete App. Registro de series, cargas, RPE, descansos automáticos y feedback continuado para entrenar en cualquier gimnasio del mundo.
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Modo avión con tolerancia total sin señal</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Cálculo automático de 1RM y sobrecarga</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Actualización periódica de microciclos</span>
                  </li>
                </ul>
              </div>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-foreground text-xs sm:text-sm font-bold transition-all"
              >
                <span>Consultar por Rutinas online</span>
                <span aria-hidden="true">→</span>
              </a>
            </Card>
          </div>
        </section>

        {/* 6. Infraestructura Tecnológica & Conversión Bivalente */}
        <section id="infraestructura" className="py-16 sm:py-24 border-t border-border/80 bg-card/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <div className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
                03 / TECNOLOGÍA PROPIA Y SOBERANA
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                Infraestructura GOZSter
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground mt-2">
                Arquitectura de alto rendimiento para entrenadores y atletas. Sin intermediarios, sin comisiones y con $0 costo en licencias mensuales comerciales.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-14">
              {/* Bloque Coach Studio */}
              <Card className="p-6 sm:p-8 border-border/80 bg-card rounded-2xl">
                <div className="font-mono text-xs text-muted-foreground uppercase mb-2">
                  PLATAFORMA WEB
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Coach Studio (Desktop &amp; Tablet)
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                  Panel de control de alumnos, constructor visual de rutinas, superseries, analítica de bajas y gestión de cobros en tiempo real.
                </p>
                <Link
                  href="/studio"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-xs sm:text-sm font-bold hover:opacity-90 transition-all w-full"
                >
                  <span>Ingresar a Coach Studio</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </Card>

              {/* Bloque Athlete App */}
              <Card className="p-6 sm:p-8 border-border/80 bg-card rounded-2xl">
                <div className="font-mono text-xs text-muted-foreground uppercase mb-2">
                  MOBILE FIRST &amp; PWA
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Athlete App (Entrenamiento en Vivo)
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                  App instalable y liviana, optimizada para el gimnasio con botones grandes, cronómetro audible con vibración y 100% Offline-First.
                </p>
                <Link
                  href="/athlete"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-foreground px-5 py-2.5 text-xs sm:text-sm font-bold transition-all w-full"
                >
                  <span>Abrir Athlete App</span>
                  <span aria-hidden="true">→</span>
                </Link>
              </Card>
            </div>

            {/* Banner Final de Conversión Bivalente */}
            <div className="rounded-2xl border border-border/80 bg-card p-8 sm:p-12 text-center max-w-3xl mx-auto shadow-sm">
              <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                ¿Listo para elevar tu estándar de entrenamiento?
              </h3>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-8">
                Coordiná tu entrevista inicial con Gonzalo Salas para definir tus objetivos y comenzar tu plan de fuerza o boxeo.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <span>Comenzar a Entrenar con Gonza</span>
                  <span aria-hidden="true">→</span>
                </a>
                <Link
                  href="/studio"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-secondary/60 hover:bg-secondary text-foreground px-6 py-3 text-sm font-bold active:scale-[0.98] transition-all"
                >
                  <span>Ingresar a Coach Studio</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 7. Footer Corporativo Sobrio Zinc */}
      <footer className="border-t border-border/80 bg-background py-10 px-4 sm:px-6 lg:px-8 text-center sm:text-left text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-black text-xs">
              G
            </div>
            <span className="font-bold text-foreground">GOZSter</span>
            <span>•</span>
            <span>Gonzalo Salas &amp; Fresias</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#trayectoria" className="hover:text-foreground transition-colors">
              Trayectoria
            </a>
            <a href="#modalidades" className="hover:text-foreground transition-colors">
              Modalidades
            </a>
            <a href="#infraestructura" className="hover:text-foreground transition-colors">
              Infraestructura
            </a>
            <Link href="/studio" className="hover:text-foreground transition-colors">
              Coach Studio
            </Link>
            <Link href="/athlete" className="hover:text-foreground transition-colors">
              Athlete App
            </Link>
          </div>

          <div className="font-mono text-[11px] text-muted-foreground">
            Plataforma libre y de código abierto • $0 licencias
          </div>
        </div>
      </footer>
    </div>
  );
}
