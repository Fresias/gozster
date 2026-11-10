"use client";

import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LandingSessionCapsule } from "@/components/landing-session-capsule";
import { useLandingSession } from "@/lib/use-landing-session";

/* Configuración única de contacto: cambiar acá el número de WhatsApp. */
const WHATSAPP_URL = `https://wa.me/5491100000000?text=${encodeURIComponent(
  "Hola Gonza, quiero comenzar a entrenar con vos. Me gustaría consultar por las modalidades disponibles."
)}`;

/* Recetas visuales compartidas con Coach Studio (tokens zinc, borde 1px, micro-etiquetas mono). */
const MICRO_LABEL = "font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const BADGE =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const BTN =
  "inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-3 text-sm font-bold transition-all duration-150 active:scale-[0.98] " +
  FOCUS_RING;

function ArrowIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function CrossIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SectionHeader({
  index,
  kicker,
  title,
  lead,
  display = false,
}: {
  index: string;
  kicker: string;
  title: string;
  lead: string;
  display?: boolean;
}) {
  return (
    <div className="max-w-3xl mb-10 sm:mb-14">
      <div className={`${MICRO_LABEL} mb-3 flex items-center gap-3`}>
        <span className="font-mono tabular-nums text-foreground">{index} /</span>
        <span>{kicker}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <h2
        className={
          display
            ? "text-3xl sm:text-5xl font-black tracking-tight text-foreground leading-[1.05]"
            : "text-2xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight"
        }
      >
        {title}
      </h2>
      <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-2xl">{lead}</p>
    </div>
  );
}

const METRICAS = [
  { valor: "+150", texto: "Alumnos acompañados en fuerza, hipertrofia y acondicionamiento" },
  { valor: "3", texto: "Modalidades de trabajo (Funcional, Boxeo y Rutinas online)" },
  { valor: "5+", texto: "Años de trayectoria profesional y formación docente continua" },
  { valor: "$0", texto: "Costo en licencias corporativas por mes (Software Soberano)" },
];

const CONTRASTE = [
  {
    codigo: "01",
    eje: "Rutina",
    categoria: "SOBRECARGA & PLANIFICACIÓN",
    comun: "Fotocopia arrugada y genérica que nadie mira ni actualiza.",
    metodo: "Plan individualizado según tus palancas y movilidad.",
  },
  {
    codigo: "02",
    eje: "Carga",
    categoria: "PROGRESIÓN MATEMÁTICA",
    comun: "Adivinar el peso y levantar la misma mancuerna hace 6 meses.",
    metodo: "Sobrecarga progresiva kilo por kilo registrado.",
  },
  {
    codigo: "03",
    eje: "Técnica",
    categoria: "SUPERVISIÓN CLÍNICA",
    comun: "Profesor en recepción mirando el celular mientras hacés sentadilla con la espalda doblada.",
    metodo: "Ojos de Director Técnico (Romero Brest, FAB, Halterofilia).",
  },
  {
    codigo: "04",
    eje: "Software",
    categoria: "TECNOLOGÍA SOBERANA",
    comun: "Apps comerciales lentas en dólares que se tildan y cobran por alumno.",
    metodo: "GOZSter, tecnología propia, offline y sin suscripción.",
  },
];

const CREDENCIALES = [
  {
    titulo: "Profesor Nacional de Educación Física",
    institucion: 'ISEF N°1 "Dr. Enrique Romero Brest"',
    area: "Docencia de Grado & Fisiología Humana",
    monograma: "ISEF",
    transferencia: "Tu plan se programa con bases fisiológicas reales, no con tendencias de redes sociales.",
  },
  {
    titulo: "Personal Trainer Certificado",
    institucion: "Centro Europeo de Educación Física",
    area: "Hipertrofia & Prescripción de Fuerza",
    monograma: "CEEF",
    transferencia: "Volumen de entrenamiento exacto para ganar masa muscular sin acumular fatiga basura ni lesiones.",
  },
  {
    titulo: "Entrenador en Halterofilia",
    institucion: "Grupo GPO Latam",
    area: "Levantamiento Olímpico & Potencia",
    monograma: "GPO",
    transferencia: "Trayectoria vertical de la barra, movilidad de cadera/tobillo y aceleración bajo tensión.",
  },
  {
    titulo: "Director Técnico de Boxeo",
    institucion: "Federación Argentina de Boxeo (FAB)",
    area: "Técnica Pugilística & Combate",
    monograma: "FAB",
    transferencia: "Mecánica de golpeo, velocidad de reacción y transferencia de potencia desde el piso sin coreografías.",
  },
];

const MODALIDADES = [
  {
    codigo: "01",
    nombre: "Funcional",
    badge: "Presencial · Sala de Fuerza",
    foto: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=600&auto=format&fit=crop",
    fotoAlt: "Discos olímpicos y mancuernas en sala de fuerza",
    subtitulo: "Fuerza Útil y Blindaje Articular",
    descripcion:
      "Entrenamiento basado en movimientos humanos reales: empujar, traccionar, bisagras de cadera y acarreos. Ganás fuerza útil, corregís vicios posturales y aumentás tu capacidad de trabajo sin quemarte las articulaciones.",
    chips: ["Bisagras de cadera", "Acarreos pesados", "Anti-rotación"],
    puntos: [
      "Movilidad activa y blindaje articular contra lesiones cotidianas",
      "Cargas progresivas reguladas según tu rango de movimiento real",
      "Resistencia metabólica y potencia cardiovascular sin perder masa muscular",
    ],
  },
  {
    codigo: "02",
    nombre: "Boxeo",
    badge: "Presencial · Escuela FAB",
    foto: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?q=80&w=600&auto=format&fit=crop",
    fotoAlt: "Guantes de boxeo y ring de combate técnico",
    subtitulo: "Dirección Técnica Oficial FAB",
    descripcion:
      "Dirección técnica oficial FAB. Aprendés a pegar con la biomecánica correcta, mover las piernas con balance y defender con criterio. Sesiones intensas de manoplas, bolsa y reflejos donde cada round tiene un objetivo.",
    chips: ["Mecánica de golpe", "Defensa real", "Potencia de piernas"],
    puntos: [
      "Mecánica de golpeo y transferencia de potencia desde el piso",
      "Velocidad de reacción, distancia y coordinación bajo fatiga",
      "Condicionamiento físico de combate (opción de sparring técnico sólo para avanzados)",
    ],
  },
  {
    codigo: "03",
    nombre: "Rutinas online",
    badge: "100% Offline-First PWA",
    foto: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop",
    fotoAlt: "Barra olímpica cargada y registro de sesión",
    subtitulo: "Planificación Kilo a Kilo en tu Celular",
    descripcion:
      "Planificación kilo a kilo cargada en tu celular. No hay PDFs genéricos ni rutinas copiadas: cada serie tiene su carga, descanso cronometrado y auditoría de técnica por video para que progreses en cualquier gimnasio del mundo.",
    chips: ["100% Offline", "Timer inteligente", "Sobrecarga real"],
    puntos: [
      "App 100% Offline-First PWA para entrenar sin depender de la señal del gimnasio",
      "Cronómetro Inteligente de descansos automáticos y Calentamiento Específico",
      "Sobrecarga progresiva y ajustes de microciclos según tus sensaciones",
    ],
  },
];

export default function HomePage() {
  const { user } = useLandingSession();

  /* Selector único de 3 caminos: las etiquetas de acción se adaptan a la sesión activa. */
  const caminos = [
    {
      n: "01",
      kicker: "Para entrenar",
      titulo: "Entrenar con Gonzalo",
      detalle: "Funcional, boxeo o rutina online.",
      accion: user?.rol === "ALUMNO" ? "Consultar con Gonza" : "Comenzar a Entrenar con Gonza",
      href: WHATSAPP_URL,
      externo: true,
    },
    {
      n: "02",
      kicker: "Para entrenadores",
      titulo: "Coach Studio",
      detalle: "Dashboard y centro de monitoreo.",
      accion:
        user?.rol === "ADMIN"
          ? "Ingresar al Panel de Administrador"
          : user?.rol === "ALUMNO"
            ? "Explorar Coach Studio"
            : "Ingresar a Coach Studio",
      href: "/studio",
      externo: false,
    },
    {
      n: "03",
      kicker: "Para alumnos",
      titulo: "Athlete App",
      detalle: "Tu rutina en el celular, sin señal.",
      accion: user ? "Entrenar como Atleta (Mi Rutina)" : "Abrir mi rutina",
      href: "/athlete",
      externo: false,
    },
  ];
  /* El camino destacado es el que corresponde al rol de la sesión. */
  const destacado = user?.rol === "ADMIN" ? "02" : user?.rol === "ALUMNO" ? "03" : "01";

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200 flex flex-col antialiased overflow-x-hidden selection:bg-primary/20 selection:text-primary">
      {/* 1. Header fijo: anclas + dos accesos (Athlete App, Coach Studio) */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-md transition-colors duration-150">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 lg:gap-8">
            <Link href="/" className={`flex items-center gap-2.5 group rounded-lg ${FOCUS_RING}`} aria-label="Inicio GOZSter">
              <div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-base shadow-sm group-hover:opacity-90 transition-opacity">
                G
              </div>
              <span className="text-lg font-black tracking-tight text-foreground">GOZSter</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6" aria-label="Navegación principal">
              {[
                ["#trayectoria", "Trayectoria"],
                ["#modalidades", "Modalidades"],
                ["#infraestructura", "Infraestructura"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className={`text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded ${FOCUS_RING}`}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
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
            <Link
              href="/athlete"
              className={`hidden sm:inline-flex min-h-[48px] items-center px-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-lg ${FOCUS_RING}`}
            >
              Athlete App
            </Link>
            <Link href="/studio" className={`${BTN} bg-primary text-primary-foreground hover:opacity-90 shadow-xs !px-3 sm:!px-4 !py-2`}>
              <span>Coach Studio</span>
              <ArrowIcon />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* 2. Hero: escenario oscuro. Izquierda: mensaje contundente + selector táctil. Derecha: Athletic HUD Card sin rotaciones 3D rotas. */}
        <section
          className="dark relative isolate overflow-hidden bg-background text-foreground border-b border-border"
          data-testid="hero-impacto"
        >
          <div className="hero-grid absolute inset-0 -z-10 pointer-events-none" aria-hidden="true" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800/60 bg-surface-container/60 px-3.5 py-1 font-mono text-[10px] sm:text-xs text-emerald-300 mb-6 shadow-xs">
                  <span className="size-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  <span>PREPARACIÓN FÍSICA DE FUERZA · TECNOLOGÍA PROPIA · 0 HUMO</span>
                </div>

                <div className="mb-4">
                  <span
                    data-text="GONZALO SALAS"
                    className="glitch-hover inline-block font-black text-4xl sm:text-6xl xl:text-7xl leading-[0.9] tracking-tighter text-foreground uppercase cursor-default select-none"
                  >
                    GONZALO SALAS
                  </span>
                </div>
                <h1 className="text-2xl sm:text-4xl xl:text-5xl font-black tracking-tight text-foreground leading-[1.08] max-w-2xl mb-3">
                  La técnica no se negocia. El progreso se mide.
                </h1>
                <p className="text-base sm:text-lg font-semibold text-zinc-300 max-w-xl leading-snug mb-2">
                  Entrenar no es cansarse hasta transpirar. Es mover más peso con mejor técnica, semana a semana.
                </p>
                <p className="text-xs sm:text-sm font-mono text-emerald-400 font-semibold mb-3">
                  Biomecánica individual según tus palancas anatómicas. Cero fotocopias.
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-xl leading-relaxed mb-7">
                  La mayoría de la gente pasa meses en el gimnasio levantando la misma mancuerna, siguiendo una rutina fotocopiada que nadie mira y adivinando si progresa. Con Gonzalo Salas cada serie tiene un número, la técnica se audita antes de subir los kilos y tu avance se mide con datos reales.
                </p>

                {/* Selector de 3 caminos táctil */}
                <nav aria-label="Elegí tu camino">
                  <div className={`${MICRO_LABEL} mb-3`}>Elegí tu camino</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {caminos.map((c) => {
                      const activo = c.n === destacado;
                      const className = `group flex min-h-[48px] flex-col justify-between gap-4 rounded-xl border p-4 transition-all duration-150 active:scale-[0.98] ${FOCUS_RING} ${
                        activo
                          ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
                          : "border-border bg-card text-foreground hover:border-foreground/40 hover:bg-secondary"
                      }`;
                      const sub = activo ? "text-primary-foreground/70" : "text-muted-foreground";
                      const contenido = (
                        <>
                          <span>
                            <span className={`flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider ${sub}`}>
                              <span className="tabular-nums">{c.n}</span>
                              <span>{c.kicker}</span>
                            </span>
                            <span className="mt-1.5 block text-base font-black tracking-tight leading-snug">{c.titulo}</span>
                            <span className={`mt-1 block text-xs leading-relaxed ${sub}`}>{c.detalle}</span>
                          </span>
                          <span className="flex items-center justify-between gap-2 text-xs font-bold pt-1">
                            <span>{c.accion}</span>
                            <ArrowIcon className="size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                          </span>
                        </>
                      );
                      return c.externo ? (
                        <a key={c.n} href={c.href} target="_blank" rel="noopener noreferrer" className={className} data-testid={`hero-camino-${c.n}`}>
                          {contenido}
                        </a>
                      ) : (
                        <Link key={c.n} href={c.href} className={className} data-testid={`hero-camino-${c.n}`}>
                          {contenido}
                        </Link>
                      );
                    })}
                  </div>
                </nav>
              </div>

              {/* Composición Derecha: Athletic HUD Card sin rotaciones rotas */}
              <div className="lg:col-span-5 perspective-1200">
                <div className="space-y-4">
                  {/* Capa 1: Fotografía y atmósfera de método */}
                  <div
                    className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 shadow-xl"
                    data-testid="hero-card-layer-back"
                  >
                    <img
                      src="https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1200&auto=format&fit=crop"
                      alt="Barra cargada con discos olímpicos de fuerza y magnesio"
                      className="absolute inset-0 w-full h-full object-cover grayscale contrast-150 brightness-[0.3] pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent pointer-events-none" />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-200 backdrop-blur-md">
                          MÉTODO GONZALO SALAS · 2026 · SESIÓN AUDITADA #104 · SALA DE FUERZA
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 font-semibold">
                          <span className="size-1.5 rounded-full bg-emerald-400" /> EN VIVO
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg sm:text-xl font-black tracking-tight text-white leading-snug">
                        Hierro pesado, técnica estricta y magnesio.
                      </h3>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono tabular-nums text-4xl sm:text-5xl font-black text-white tracking-tight">140.0</span>
                        <span className="font-mono text-base font-bold text-zinc-400">kg</span>
                        <span className="ml-2 font-mono text-xs text-emerald-400 font-semibold border border-emerald-800/60 bg-emerald-950/40 px-2 py-0.5 rounded">RPE 8.5 · Serie 4/4 ✓</span>
                      </div>
                    </div>
                  </div>

                  {/* Capa 2: Tarjeta Blanca de Diagnóstico sin filtro */}
                  <figure
                    className="relative z-10 rounded-xl border border-zinc-200 bg-white text-zinc-950 p-5 shadow-xl"
                    data-testid="hero-card-layer-middle"
                  >
                    <span className="inline-flex rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                      Diagnóstico sin filtro
                    </span>
                    <blockquote className="mt-3 text-base sm:text-lg font-black tracking-tight leading-snug text-zinc-950">
                      &ldquo;El 90% de los que van al gimnasio no tienen un problema de voluntad. Tienen una rutina genérica y nadie que les mire la técnica.&rdquo;
                    </blockquote>
                    <figcaption className="mt-3 pt-3 border-t border-zinc-200 text-xs text-zinc-600">
                      <span className="font-black uppercase tracking-wide text-zinc-950">Gonzalo Salas</span>
                      <span className="font-mono"> · Head Coach · Director Técnico</span>
                    </figcaption>
                  </figure>

                  {/* Capa 3: Tarjeta Técnica de Métricas y Autoridad */}
                  <div
                    className="relative z-10 rounded-xl border border-zinc-800 bg-[#121214] text-zinc-100 p-4 shadow-xl"
                    data-testid="hero-card-layer-front"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums text-2xl font-black text-white">+150</span>
                      <p className="text-xs text-zinc-300 leading-snug">
                        que dejaron de estancarse y hoy levantan con técnica impecable.
                      </p>
                    </div>
                    <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {["Halterofilia", "Fuerza", "Boxeo"].map((e) => (
                          <span key={e} className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-200">
                            {e}
                          </span>
                        ))}
                      </div>
                      <a
                        href="#trayectoria"
                        className="inline-flex items-center gap-1 text-xs font-bold text-zinc-100 underline-offset-4 hover:underline rounded"
                      >
                        <span>Ver metodología auditada</span>
                        <ArrowIcon className="size-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Métricas de Impacto */}
        <section className="border-b border-border bg-card" aria-label="Métricas">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <dl className="grid grid-cols-2 lg:grid-cols-4">
              {METRICAS.map((m, i) => (
                <div
                  key={m.valor}
                  className={`px-4 py-8 sm:px-6 sm:py-10 border-border ${i % 2 === 1 ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
                >
                  <dd className="font-mono tabular-nums text-4xl sm:text-6xl font-black tracking-tighter text-foreground">{m.valor}</dd>
                  <dt className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed max-w-[16rem]">{m.texto}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* 4. Sección 01: 4 Fichas Técnicas de Diagnóstico Biomecánico */}
        <section id="contraste" className="py-16 sm:py-24" data-testid="seccion-contraste-realidad">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="01"
              kicker="Diagnóstico Biomecánico"
              title="Lo que pasa en un gimnasio común vs. Entrenar con Gonzalo Salas"
              lead="Sin promesas vacías ni recetas mágicas. Compará lo que vivís todos los días con el método de trabajo riguroso de GOZSter."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              {CONTRASTE.map((fila) => (
                <div
                  key={fila.eje}
                  className="rounded-xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between gap-5 hover:border-foreground/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <span className="tabular-nums text-foreground">{fila.codigo} /</span>
                      <span>{fila.categoria}</span>
                    </span>
                    <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                      El método
                    </span>
                  </div>

                  <div className="space-y-4">
                    {/* Lo que pasa en un gimnasio común */}
                    <div className="rounded-lg border border-danger-soft-border bg-danger-soft/30 p-3.5 flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-soft-foreground border border-danger-soft-border">
                        <CrossIcon className="size-3" />
                      </span>
                      <div>
                        <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-danger-soft-foreground mb-0.5">
                          Gimnasio Común
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {fila.comun}
                        </p>
                      </div>
                    </div>

                    {/* Entrenar con Gonzalo Salas */}
                    <div className="rounded-lg border border-success-soft-border bg-success-soft/30 p-3.5 flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground border border-success-soft-border">
                        <CheckIcon className="size-3" />
                      </span>
                      <div>
                        <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-success mb-0.5">
                          Método Gonzalo Salas
                        </div>
                        <p className="text-sm sm:text-base font-bold text-foreground leading-snug">
                          {fila.metodo}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Sección 02: Grilla de Sellos de Autoridad Técnica */}
        <section id="trayectoria" className="py-16 sm:py-24 border-t border-border bg-secondary/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="02"
              kicker="Acreditaciones y Trayectoria"
              title="Formación Académica y Dirección Técnica"
              lead="Respaldado por las instituciones de educación física, fuerza y deportes de combate de mayor rigor técnico de Argentina y Europa."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
              {CREDENCIALES.map((c, i) => (
                <div
                  key={c.titulo}
                  className="group rounded-xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between gap-4 hover:bg-foreground hover:text-background transition-colors duration-150"
                  data-testid={`franja-cv-${i + 1}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                      <span className="font-mono text-xl sm:text-2xl font-black text-foreground tracking-tight">
                        {c.monograma}
                      </span>
                      <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                        {c.institucion}
                      </span>
                    </div>

                    <h3 className="mt-4 text-lg font-bold tracking-tight text-foreground leading-snug">
                      {c.titulo}
                    </h3>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      {c.area}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/60 p-3 text-xs text-muted-foreground leading-relaxed">
                    <span className="font-bold text-foreground font-mono mr-1">Impacto atlético:</span>
                    {c.transferencia}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Sección 03: Tríptico Visual de Modalidades con Fotografía B&N */}
        <section id="modalidades" className="py-16 sm:py-24 border-t border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="03"
              kicker="Disciplinas Disponibles"
              title="Modalidades de Trabajo"
              lead="Entrenamiento adaptado a tus metas atléticas, con beneficio físico real y sin pérdida de tiempo."
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {MODALIDADES.map((m) => (
                <article
                  key={m.nombre}
                  className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-xs hover:border-foreground/30 transition-all duration-150"
                >
                  <div className="relative h-44 w-full overflow-hidden bg-zinc-950 border-b border-border">
                    <img
                      src={m.foto}
                      alt={m.fotoAlt}
                      className="w-full h-full object-cover grayscale contrast-125 brightness-90 group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                    <span className="absolute bottom-3 left-4 inline-flex items-center rounded-md border border-border/80 bg-background/90 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-foreground backdrop-blur-xs">
                      {m.badge}
                    </span>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                    <div>
                      <h3 className="text-xl font-black tracking-tight text-foreground">{m.nombre}</h3>
                      <p className="mt-2 text-xs font-semibold text-muted-foreground">{m.subtitulo}</p>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{m.descripcion}</p>

                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {m.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-md border border-border bg-secondary/80 px-2 py-0.5 font-mono text-[11px] font-medium text-foreground"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>

                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${BTN} w-full border border-border bg-secondary/60 text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary`}
                    >
                      <span>Consultar por {m.nombre}</span>
                      <ArrowIcon className="size-4" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Sección 04: Walkthrough en 3 Actos para Profesionales (Escenario Oscuro Zinc) */}
        <section
          id="infraestructura"
          className="dark relative isolate overflow-hidden py-16 sm:py-24 border-t border-border bg-background text-foreground"
          data-testid="seccion-entrenadores"
        >
          <div className="hero-grid absolute inset-0 -z-10 pointer-events-none" aria-hidden="true" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="04"
              kicker="Ecosistema de Software Soberano"
              title="¿Sos entrenador o tenés un gimnasio? Dejá de perder 10 horas por semana con Excels y fotocopias."
              lead="Las apps comerciales cobran en dólares por cada alumno que sumás y se tildan en el sótano del gimnasio. GOZSter es tecnología propia construida para entrenadores reales."
              display
            />

            {/* Walkthrough Lineal en 3 Actos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Acto 1: Creación */}
              <article className="flex flex-col justify-between gap-6 rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                    <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      PASO 01 · CREACIÓN
                    </span>
                    <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                      Coach Studio Web
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold tracking-tight text-white">
                    Constructor de rutinas con superseries en segundos.
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                    Armá bloques de entrenamiento, series piramidales y descansos automáticos con fluidez táctil instantánea.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3.5 space-y-2.5 font-mono text-xs" aria-hidden="true">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      Superserie
                    </span>
                    <span className="text-[11px] text-zinc-300">A1 Sentadilla 4x6-8</span>
                    <span className="text-zinc-600">──</span>
                    <span className="text-[11px] text-zinc-300">A2 Salto al Cajón 4x3</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                    <span className="rounded border border-zinc-700 px-1.5 py-0.5">Descanso 01:30</span>
                    <span className="rounded border border-zinc-700 px-1.5 py-0.5">Piramidal</span>
                  </div>
                </div>
              </article>

              {/* Acto 2: Ejecución */}
              <article className="flex flex-col justify-between gap-6 rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                    <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      PASO 02 · EJECUCIÓN
                    </span>
                    <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                      Athlete App PWA
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold tracking-tight text-white">
                    Funciona 100% offline en sótanos sin señal.
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                    Tus atletas registran series en modo avión sin caídas de UI, sincronizando en silencio al salir a la calle.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3.5 space-y-2.5 font-mono text-xs" aria-hidden="true">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">120 kg x 5 reps</span>
                    <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-400 text-[10px] font-bold">
                      ✓ Completada
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-zinc-400">Sin señal · guardado local</span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-emerald-400 font-semibold">Sincronizado</span>
                  </div>
                </div>
              </article>

              {/* Acto 3: Auditoría */}
              <article className="flex flex-col justify-between gap-6 rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                    <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      PASO 03 · AUDITORÍA
                    </span>
                    <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                      Métricas &amp; Retención
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold tracking-tight text-white">
                    Seguimiento de retención y alertas automáticas de sobrecarga.
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                    Semáforo de bajas potenciales, detección de fatiga aguda y control de alumnos sin plan al instante.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3.5 space-y-2.5 font-mono text-xs" aria-hidden="true">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-400 flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" />Al día</span>
                    <span className="text-zinc-400 flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-zinc-500" />En riesgo</span>
                    <span className="text-zinc-400 flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-zinc-500" />Sin plan</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 border-t border-zinc-800 pt-1.5">
                    ★ Notificación: Récord de sobrecarga en sentadilla
                  </div>
                </div>
              </article>

              {/* Cierre y Banner de Licencias */}
              <div className="lg:col-span-3 flex flex-col lg:flex-row lg:items-center justify-between gap-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-200 mb-3">
                    Acceso inmediato · $0 en licencias comerciales
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    $0 en licencias comerciales (software libre y soberano).
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                    Cero comisiones, sin suscripciones mensuales abusivas y con total soberanía sobre la base de datos de tu gimnasio.
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-mono tabular-nums text-4xl sm:text-5xl font-black text-white">$0</span>
                    <span className="font-mono text-xs text-zinc-400 uppercase">por alumno · por mes</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
                  <Link href="/studio" className={`${BTN} bg-primary text-primary-foreground hover:opacity-90 shadow-md`}>
                    <span>Ingresar a Coach Studio Gratis (Sin tarjeta)</span>
                    <ArrowIcon />
                  </Link>
                  <Link href="/athlete" className={`${BTN} border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700`}>
                    <span>Probar Athlete App (PWA)</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 8. Footer */}
      <footer className="border-t border-border/80 bg-background py-10 px-4 sm:px-6 lg:px-8 text-center sm:text-left text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-black text-xs">G</div>
            <span className="font-bold text-foreground">GOZSter</span>
            <span aria-hidden="true">•</span>
            <span>Gonzalo Salas &amp; Fresias</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Pie de página">
            <a href="#trayectoria" className="hover:text-foreground transition-colors">Trayectoria</a>
            <a href="#modalidades" className="hover:text-foreground transition-colors">Modalidades</a>
            <a href="#infraestructura" className="hover:text-foreground transition-colors">Infraestructura</a>
            <Link href="/studio" className="hover:text-foreground transition-colors">Coach Studio</Link>
            <Link href="/athlete" className="hover:text-foreground transition-colors">Athlete App</Link>
          </nav>
          <div className="font-mono text-[11px]">Plataforma libre y de código abierto • $0 licencias</div>
        </div>
      </footer>
    </div>
  );
}
