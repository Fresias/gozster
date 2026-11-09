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
            <span>PREPARACIÓN FÍSICA DE FUERZA · TECNOLOGÍA PROPIA · 0 HUMO</span>
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
              Entrenar no es cansarse hasta transpirar. Es mover más peso con mejor técnica, semana a semana.
            </h1>
          </div>

          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-10">
            La mayoría de la gente pasa meses en el gimnasio levantando la misma mancuerna, siguiendo una rutina fotocopiada que nadie mira y adivinando si progresa. Con Gonzalo Salas cada serie tiene un número, la técnica se audita antes de subir los kilos y tu avance se mide con datos reales.
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

          {/* Abanico Escalonado de 3 Capas con Contraste Dramático (Spectup Style) */}
          <div className="relative max-w-6xl mx-auto perspective-1200 pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch transform-style-3d text-left">
              {/* Capa 1: Capa Posterior (Atmósfera y Fotografía Técnica B&N) */}
              <Card
                className="hero-3d-card group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col justify-between shadow-xl min-h-[420px] lg:[transform:rotateY(10deg)_rotateX(4deg)_translateZ(-20px)] lg:hover:[transform:rotateY(4deg)_rotateX(2deg)_translateZ(0px)] transition-all duration-300"
                data-testid="hero-card-layer-back"
              >
                {/* Fotografía B&N de alta resolución y contraste */}
                <img
                  src="https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1200&auto=format&fit=crop"
                  alt="Barra cargada con discos olímpicos de fuerza y magnesio"
                  className="absolute inset-0 w-full h-full object-cover grayscale contrast-150 brightness-[0.35] transition-transform duration-700 group-hover:scale-105 pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent pointer-events-none" />

                {/* Encabezado con Badge superior */}
                <div className="relative z-10">
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] tracking-wider uppercase border-white/20 bg-black/60 text-zinc-200 backdrop-blur-md px-2.5 py-1"
                    >
                      MÉTODO GONZALO SALAS · 2026
                    </Badge>
                    <span className="font-mono text-[10px] text-zinc-400">01 / ATMÓSFERA</span>
                  </div>
                  <div className="font-mono text-xs uppercase tracking-widest text-zinc-400 mb-1">
                    Fuerza Aplicada &amp; Rigor Técnico
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-white leading-snug">
                    Hierro pesado, técnica estricta y magnesio.
                  </h3>
                </div>

                {/* Pie técnico */}
                <div className="relative z-10 mt-6 pt-4 border-t border-white/10">
                  <p className="text-xs text-zinc-300 leading-relaxed mb-3">
                    Levantamientos olímpicos, sobrecarga progresiva y cero distracciones. Cada kilogramo en la barra tiene justificación biomecánica.
                  </p>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    <span>Auditoría de palancas y movilidad</span>
                  </div>
                </div>
              </Card>

              {/* Capa 2: Capa Intermedia (Tarjeta Blanca Nítida de Contraste) */}
              <Card
                className="hero-3d-card relative rounded-2xl bg-white text-zinc-950 p-6 sm:p-8 shadow-2xl border border-zinc-200 flex flex-col justify-between min-h-[420px] lg:[transform:translateZ(30px)_scale(1.02)] lg:hover:[transform:translateZ(45px)_scale(1.04)] z-20 transition-all duration-300"
                data-testid="hero-card-layer-middle"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 mb-6 border-b border-zinc-200">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-600">
                      02 · DIAGNÓSTICO SIN FILTRO
                    </span>
                    <span className="font-mono text-[10px] font-black uppercase bg-zinc-900 text-white px-2 py-0.5 rounded">
                      REALIDAD
                    </span>
                  </div>

                  <blockquote className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-zinc-950 mb-6">
                    &ldquo;El 90% de los que van al gimnasio no tienen un problema de voluntad. Tienen una rutina genérica y nadie que les mire la técnica.&rdquo;
                  </blockquote>

                  <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
                    Poner ganas no alcanza si estás haciendo ejercicios que no coinciden con tu anatomía o si levantás el mismo peso hace seis meses.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black text-zinc-950 uppercase tracking-wide">
                      Gonzalo Salas
                    </div>
                    <div className="text-[11px] text-zinc-600 font-mono">
                      Head Coach · Director Técnico
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-zinc-900 bg-zinc-100 border border-zinc-300 px-2.5 py-1 rounded-md">
                    0 Humo
                  </span>
                </div>
              </Card>

              {/* Capa 3: Capa Frontal (Tarjeta Técnica de Métricas y Autoridad) */}
              <Card
                className="hero-3d-card relative rounded-2xl bg-[#121214] border border-zinc-800 text-zinc-100 p-6 sm:p-8 shadow-2xl flex flex-col justify-between min-h-[420px] lg:[transform:rotateY(-10deg)_rotateX(4deg)_translateZ(50px)] lg:hover:[transform:rotateY(-4deg)_rotateX(2deg)_translateZ(65px)] z-30 transition-all duration-300"
                data-testid="hero-card-layer-front"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 mb-5 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-300">
                        03 · AUTORIDAD
                      </span>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] text-zinc-400 border-zinc-700">
                      AUDITADO
                    </Badge>
                  </div>

                  <div className="font-mono tabular-nums text-5xl sm:text-6xl font-black text-white tracking-tight mb-2">
                    +150
                  </div>
                  <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold mb-2">
                    Alumnos activos y graduados
                  </div>
                  <p className="text-sm text-zinc-300 leading-snug mb-5">
                    que dejaron de estancarse y hoy levantan con técnica impecable.
                  </p>

                  {/* Chips de especialidades */}
                  <div className="flex flex-wrap gap-1.5 mb-6">
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700">
                      Halterofilia
                    </span>
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700">
                      Fuerza
                    </span>
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700">
                      Boxeo
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  <a
                    href="#trayectoria"
                    className="inline-flex min-h-[48px] items-center justify-between w-full px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-xs sm:text-sm font-bold transition-all"
                  >
                    <span>Ver metodología auditada</span>
                    <span aria-hidden="true">→</span>
                  </a>
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

        {/* 4. Bloque de Contraste de Realidad (Estilo Tarascón) */}
        <section
          id="contraste"
          className="py-16 sm:py-24 border-t border-border/80 bg-background"
          data-testid="seccion-contraste-realidad"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center sm:text-left mb-10 sm:mb-14">
              <div className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
                01 / CRITERIO &amp; TRANSPARENCIA
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">
                Lo que pasa en un gimnasio común vs. Entrenar con Gonzalo Salas
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-2xl">
                Sin promesas vacías ni recetas mágicas. Compará lo que vivís todos los días con el método de trabajo riguroso de GOZSter.
              </p>
            </div>

            {/* Tabla / Grilla Comparativa Elegante en Zinc */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Columna A: Gimnasio Común */}
              <div className="rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border/60">
                    <span className="size-3 rounded-full bg-destructive/60" aria-hidden="true" />
                    <h3 className="font-mono text-sm sm:text-base font-bold uppercase tracking-wider text-muted-foreground">
                      Lo que pasa en un gimnasio común
                    </h3>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-muted-foreground uppercase">
                        Rutina
                      </div>
                      <p className="text-sm sm:text-base text-muted-foreground line-through decoration-muted-foreground/40">
                        Fotocopia arrugada y genérica que nadie mira ni actualiza.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-muted-foreground uppercase">
                        Carga
                      </div>
                      <p className="text-sm sm:text-base text-muted-foreground line-through decoration-muted-foreground/40">
                        Adivinar el peso y levantar la misma mancuerna hace 6 meses.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-muted-foreground uppercase">
                        Técnica
                      </div>
                      <p className="text-sm sm:text-base text-muted-foreground line-through decoration-muted-foreground/40">
                        Profesor en recepción mirando el celular mientras hacés sentadilla con la espalda doblada.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-muted-foreground uppercase">
                        Software
                      </div>
                      <p className="text-sm sm:text-base text-muted-foreground line-through decoration-muted-foreground/40">
                        Apps comerciales lentas en dólares que se tildan y cobran por alumno.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Columna B: Con Gonzalo Salas (GOZSter) */}
              <div className="rounded-2xl border-2 border-primary/50 bg-card p-6 sm:p-8 shadow-md flex flex-col justify-between relative">
                <div className="absolute top-4 right-4">
                  <Badge className="bg-primary text-primary-foreground font-mono text-[10px] font-bold uppercase">
                    EL MÉTODO
                  </Badge>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border/80">
                    <span className="size-3 rounded-full bg-emerald-500" aria-hidden="true" />
                    <h3 className="font-mono text-sm sm:text-base font-bold uppercase tracking-wider text-foreground">
                      Entrenar con Gonzalo Salas
                    </h3>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-primary uppercase">
                        Rutina
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-foreground">
                        Plan individualizado según tus palancas y movilidad.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-primary uppercase">
                        Carga
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-foreground">
                        Sobrecarga progresiva kilo por kilo registrado.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-primary uppercase">
                        Técnica
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-foreground">
                        Ojos de Director Técnico (Romero Brest, FAB, Halterofilia).
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold text-primary uppercase">
                        Software
                      </div>
                      <p className="text-sm sm:text-base font-semibold text-foreground">
                        GOZSter, tecnología propia, offline y sin suscripción.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Credenciales de Gonzalo Salas (Franjas GlyphsLabs) */}
        <section id="trayectoria" className="py-16 sm:py-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center sm:text-left mb-10 sm:mb-14">
            <div className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
              02 / ACREDITACIONES Y TRAYECTORIA
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

        {/* 6. Modalidades de Trabajo (Exactamente 3 Disciplinas con Copys Refinados) */}
        <section id="modalidades" className="py-16 sm:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
              03 / DISCIPLINAS DISPONIBLES
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
                  Entrenamiento basado en movimientos humanos reales: empujar, traccionar, bisagras de cadera y acarreos. Ganás fuerza útil, corregís vicios posturales y aumentás tu capacidad de trabajo sin quemarte las articulaciones.
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Movilidad activa y blindaje articular contra lesiones cotidianas</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Cargas progresivas reguladas según tu rango de movimiento real</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Resistencia metabólica y potencia cardiovascular sin perder masa muscular</span>
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
                  Dirección técnica oficial FAB. Aprendés a pegar con la biomecánica correcta, mover las piernas con balance y defender con criterio. Sesiones intensas de manoplas, bolsa y reflejos donde cada round tiene un objetivo.
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Mecánica de golpeo y transferencia de potencia desde el piso</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Velocidad de reacción, distancia y coordinación bajo fatiga</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Condicionamiento físico de combate (opción de sparring técnico sólo para avanzados)</span>
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
                  <span className="text-xs font-mono text-muted-foreground">100% Offline-First PWA</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-3">
                  Rutinas online
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  Planificación kilo a kilo cargada en tu celular. No hay PDFs genéricos ni rutinas copiadas: cada serie tiene su carga, descanso cronometrado y auditoría de técnica por video para que progreses en cualquier gimnasio del mundo.
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground mb-6">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>App 100% Offline-First PWA para entrenar sin depender de la señal del gimnasio</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Cronómetro Inteligente de descansos automáticos y Calentamiento Específico</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Sobrecarga progresiva y ajustes de microciclos según tus sensaciones</span>
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

        {/* 7. Sección para Entrenadores y Gimnasios (Infraestructura Tecnológica) */}
        <section
          id="infraestructura"
          className="py-16 sm:py-24 border-t border-border/80 bg-card/30"
          data-testid="seccion-entrenadores"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
              <div className="font-mono text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
                04 / PLATAFORMA PARA PROFESIONALES
              </div>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground leading-tight">
                ¿Sos entrenador o tenés un gimnasio? Dejá de perder 10 horas por semana con Excels y fotocopias.
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground mt-4 leading-relaxed">
                Las apps comerciales cobran en dólares por cada alumno que sumás y se tildan en el sótano del gimnasio. GOZSter es tecnología propia construida para entrenadores reales.
              </p>
            </div>

            {/* 4 Beneficios concretos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto mb-14">
              <Card className="p-6 border-border/80 bg-card rounded-2xl flex flex-col justify-between hover:border-primary/50 transition-colors">
                <div>
                  <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm mb-4">
                    01
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">
                    Constructor de rutinas con superseries en segundos.
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Armá bloques de entrenamiento, series piramidales y descansos automáticos con fluidez táctil instantánea.
                  </p>
                </div>
              </Card>

              <Card className="p-6 border-border/80 bg-card rounded-2xl flex flex-col justify-between hover:border-primary/50 transition-colors">
                <div>
                  <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm mb-4">
                    02
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">
                    Seguimiento de retención y alertas automáticas de sobrecarga.
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Semáforo de bajas potenciales, detección de fatiga aguda y control de alumnos sin plan al instante.
                  </p>
                </div>
              </Card>

              <Card className="p-6 border-border/80 bg-card rounded-2xl flex flex-col justify-between hover:border-primary/50 transition-colors">
                <div>
                  <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm mb-4">
                    03
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">
                    Funciona 100% offline en sótanos sin señal.
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Tus atletas registran series en modo avión sin caídas de UI, sincronizando en silencio al salir a la calle.
                  </p>
                </div>
              </Card>

              <Card className="p-6 border-border/80 bg-card rounded-2xl flex flex-col justify-between hover:border-primary/50 transition-colors">
                <div>
                  <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-sm mb-4">
                    04
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">
                    $0 en licencias comerciales (software libre y soberano).
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Cero comisiones, sin suscripciones mensuales abusivas y con total soberanía sobre la base de datos de tu gimnasio.
                  </p>
                </div>
              </Card>
            </div>

            {/* Banner CTA Destacado para Coach Studio */}
            <div className="rounded-2xl border border-border/80 bg-card p-8 sm:p-12 text-center max-w-3xl mx-auto shadow-sm">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3.5 py-1 font-mono text-xs text-muted-foreground mb-4">
                <span>ACCESO INMEDIATO</span>
                <span className="text-border" aria-hidden="true">•</span>
                <span className="text-foreground font-semibold">SIN INSTALADORES PESADOS</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                Comenzá a profesionalizar tu gimnasio hoy mismo
              </h3>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-8">
                Explorá el panel de control de Coach Studio con dataset de demostración cargado y experimentá la diferencia de trabajar con tecnología propia.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/studio"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm sm:text-base font-bold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  <span>Ingresar a Coach Studio Gratis (Sin tarjeta)</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/athlete"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-secondary/60 hover:bg-secondary text-foreground px-6 py-3 text-sm sm:text-base font-bold active:scale-[0.98] transition-all"
                >
                  <span>Probar Athlete App (PWA)</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 8. Footer Corporativo Sobrio Zinc */}
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
