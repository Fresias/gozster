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

/* Fichas Técnicas de Diagnóstico Biomecánico: Protocolo de Descarte */
const PROTOCOLO_DESCARTE = [
  {
    eje: "Sobrecarga",
    n: "01",
    titulo: "Sobrecarga Progresiva Kilo por Kilo",
    comun: "Adivinar el peso y levantar la misma mancuerna hace 6 meses.",
    metodo: "Sobrecarga progresiva kilo por kilo registrado.",
    detalle: "Cálculo aritmético de tonelaje acumulado, RPE objetivo y progresión microciclo a microciclo sin adivinanzas.",
    chip: "+2.5 kg / ciclo · Cero estancamiento",
  },
  {
    eje: "Técnica",
    n: "02",
    titulo: "Auditoría Biomecánica y Ojos de DT",
    comun: "Profesor en recepción mirando el celular mientras hacés sentadilla con la espalda doblada.",
    metodo: "Ojos de Director Técnico (Romero Brest, FAB, Halterofilia).",
    detalle: "Corrección milimétrica de palancas óseas, trayectoria vertical de la barra y estabilidad espinal bajo carga máxima.",
    chip: "Palancas anatómicas · Cero compensaciones",
  },
  {
    eje: "Individualización",
    n: "03",
    titulo: "Prescripción Antropométrica Real",
    comun: "Fotocopia arrugada y genérica que nadie mira ni actualiza.",
    metodo: "Plan individualizado según tus palancas y movilidad.",
    detalle: "Selección de variantes biomecánicas según fémur, dorsiflexión y morfología articular individual.",
    chip: "Antropometría aplicada · Individual real",
  },
  {
    eje: "Tecnología",
    n: "04",
    titulo: "Infraestructura Soberana Offline",
    comun: "Apps comerciales lentas en dólares que se tildan y cobran por alumno.",
    metodo: "GOZSter, tecnología propia, offline y sin suscripción.",
    detalle: "PWA instalable offline-first para registrar series en sótanos sin señal con sincronización silenciosa.",
    chip: "100% Offline · $0/mes licencias",
  },
];

/* 4 Insignias de Acreditación Oficial con monogramas y transferencia pragmática */
const ACREDITACIONES = [
  {
    sigla: "ISEF",
    institucion: 'ISEF N°1 "Dr. Enrique Romero Brest"',
    titulo: "Profesor Nacional de Educación Física",
    area: "Docencia de Grado & Fisiología Humana",
    beneficio:
      "Prescripción biomecánica con rigor pedagógico y fisiología del ejercicio. Cero modas lesivas.",
    testid: "franja-cv-1",
  },
  {
    sigla: "CEEF",
    institucion: "Centro Europeo de Educación Física",
    titulo: "Personal Trainer Certificado",
    area: "Hipertrofia & Prescripción de Fuerza",
    beneficio:
      "Dosificación exacta de volumen e intensidad para hipertrofia miofibrilar y reclutamiento de unidades motoras.",
    testid: "franja-cv-2",
  },
  {
    sigla: "GPO",
    institucion: "Grupo GPO Latam",
    titulo: "Entrenador en Halterofilia",
    area: "Levantamiento Olímpico & Potencia",
    beneficio:
      "Técnica en movimientos olímpicos, triple extensión y transferencia de potencia pura al rendimiento atlético.",
    testid: "franja-cv-3",
  },
  {
    sigla: "FAB",
    institucion: "Federación Argentina de Boxeo (FAB)",
    titulo: "Director Técnico de Boxeo",
    area: "Técnica Pugilística & Combate",
    beneficio:
      "Mecánica de golpeo desde el tren inferior, rotación de cadera y balance sin impactos a la cabeza innecesarios.",
    testid: "franja-cv-4",
  },
];

/* Tríptico de 3 disciplinas con fotografía B&N en duotono y chips biomecánicos */
const MODALIDADES = [
  {
    nombre: "Funcional",
    badge: "Presencial",
    foto: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=800&auto=format&fit=crop",
    alt: "Entrenamiento funcional con kettlebells y barras de fuerza",
    descripcion:
      "Entrenamiento basado en movimientos humanos reales: empujar, traccionar, bisagras de cadera y acarreos.",
    chips: ["Patrones Motores", "Blindaje Articular", "Capacidad Aeróbica"],
    cta: "Consultar por Funcional",
  },
  {
    nombre: "Boxeo",
    badge: "Escuela FAB",
    foto: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?q=80&w=800&auto=format&fit=crop",
    alt: "Guantes y bolsa de boxeo para técnica y golpeo",
    descripcion:
      "Dirección técnica oficial FAB. Aprendés a pegar con la biomecánica correcta y criterio de combate.",
    chips: ["Transferencia Cinética", "Potencia Rotacional", "Timing & Distancia"],
    cta: "Consultar por Boxeo",
  },
  {
    nombre: "Rutinas online",
    badge: "100% Offline-First PWA",
    foto: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800&auto=format&fit=crop",
    alt: "Atleta registrando series en la aplicación móvil de gimnasio",
    descripcion:
      "Planificación kilo a kilo cargada en tu celular.",
    chips: ["Sobrecarga Kilo a Kilo", "RPE 1-10", "100% Offline PWA"],
    cta: "Comenzar Rutina Online",
  },
];

/* Walkthrough Lineal en 3 Actos para la plataforma de profesionales */
const WALKTHROUGH_ACTOS = [
  {
    acto: "Acto 01",
    etiqueta: "Planificación",
    titulo: "Constructor de rutinas con superseries en segundos.",
    descripcion:
      "Armá bloques de entrenamiento, series piramidales y descansos automáticos con fluidez táctil instantánea.",
    metrica: "Constructor",
    badges: ["Superserie A1/A2", "Descanso 01:30", "Piramidal"],
  },
  {
    acto: "Acto 02",
    etiqueta: "Ejecución Offline",
    titulo: "Funciona 100% offline en sótanos sin señal.",
    descripcion:
      "Tus atletas registran series en modo avión sin caídas de UI, sincronizando en silencio al salir a la calle.",
    metrica: "Offline",
    badges: ["Modo Avión 100%", "Guardado local", "Sync Silenciosa"],
  },
  {
    acto: "Acto 03",
    etiqueta: "Auditoría & Récords",
    titulo: "Seguimiento de retención y alertas automáticas de sobrecarga.",
    descripcion:
      "Semáforo de bajas potenciales, detección de fatiga aguda y control de alumnos sin plan al instante.",
    metrica: "Retención",
    badges: ["Al día / En riesgo / Sin plan", "Alertas 1RM", "Control de Churn"],
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
        {/* 2. Hero Section: Titular axiomático, WhatsApp CTA directo y Tarjeta de Telemetría Plana */}
        <section
          className="dark relative isolate overflow-hidden bg-background text-foreground border-b border-border"
          data-testid="hero-impacto"
        >
          <div className="hero-grid absolute inset-0 -z-10 pointer-events-none" aria-hidden="true" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 sm:pt-14 sm:pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
              {/* Columna Izquierda: Mensaje y Conversión */}
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container/60 px-3.5 py-1 font-mono text-[10px] sm:text-xs text-muted-foreground mb-5 shadow-xs">
                  <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                  <span>PREPARACIÓN FÍSICA DE FUERZA · TECNOLOGÍA PROPIA · 0 HUMO</span>
                </div>

                <div className="mb-3">
                  <span
                    data-text="GONZALO SALAS"
                    className="glitch-hover inline-block font-mono text-xs sm:text-sm font-bold tracking-widest text-muted-foreground uppercase cursor-default select-none"
                  >
                    GONZALO SALAS
                  </span>
                </div>

                {/* Titular axiomático exigido por Dirección de Arte */}
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground leading-[1.05] max-w-2xl mb-4">
                  La técnica no se negocia. El progreso se mide.
                </h1>

                {/* Bajada ultra-sintética */}
                <p className="text-base sm:text-lg font-medium text-foreground/90 max-w-2xl leading-snug mb-3">
                  Entrenar no es cansarse hasta transpirar. Es mover más peso con mejor técnica, semana a semana.
                </p>
                <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed mb-6">
                  La mayoría de la gente pasa meses en el gimnasio levantando la misma mancuerna, siguiendo una rutina fotocopiada que nadie mira y adivinando si progresa. Con Gonzalo Salas cada serie tiene un número, la técnica se audita antes de subir los kilos y tu avance se mide con datos reales.
                </p>

                {/* CTA primario directo a WhatsApp */}
                <div className="flex flex-wrap items-center gap-3 mb-8">
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${BTN} bg-primary text-primary-foreground hover:opacity-90 shadow-md !px-6 !py-3.5 text-base font-black`}
                  >
                    <span>Consultar por WhatsApp</span>
                    <ArrowIcon className="size-4" />
                  </a>
                  <a
                    href="#contraste"
                    className={`${BTN} border border-border bg-card text-foreground hover:bg-secondary text-sm font-semibold`}
                  >
                    <span>Ver Protocolo de Descarte</span>
                  </a>
                </div>

                {/* Selector único de 3 caminos adaptativo */}
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
                            <span className="mt-2 block text-base font-black tracking-tight leading-snug">{c.titulo}</span>
                            <span className={`mt-1 block text-xs leading-relaxed ${sub}`}>{c.detalle}</span>
                          </span>
                          <span className="flex items-center justify-between gap-2 text-xs font-bold">
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

              {/* Columna Derecha: Tarjeta de telemetría de sesión plana (sin desbordes ni rotaciones 3D rotas) */}
              <div className="lg:col-span-5 w-full perspective-1200">
                <div className="space-y-4">
                  {/* Tarjeta de Telemetría de Sesión Plana */}
                  <div
                    className="rounded-2xl border border-zinc-800 bg-[#121214] p-5 sm:p-6 shadow-xl text-zinc-100"
                    data-testid="hero-card-layer-front"
                  >
                    {/* Encabezado de telemetría */}
                    <div className="flex items-center justify-between gap-2 pb-4 border-b border-zinc-800">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                          TELEMETRÍA DE SESIÓN
                        </span>
                      </div>
                      <span className="rounded border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-300">
                        SERIE 3 / 4
                      </span>
                    </div>

                    {/* Métrica principal plana: 140.0 kg y RPE 8.5 */}
                    <div className="mt-5 grid grid-cols-2 gap-4 items-end">
                      <div>
                        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 block mb-1">
                          Carga Efectiva
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono tabular-nums text-4xl sm:text-5xl font-black tracking-tight text-white">
                            140.0
                          </span>
                          <span className="font-mono text-sm font-bold text-zinc-400">kg</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 block mb-1">
                          Esfuerzo Real
                        </span>
                        <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-300 font-mono text-xl sm:text-2xl font-black">
                          <span>RPE</span>
                          <span className="tabular-nums">8.5</span>
                        </div>
                      </div>
                    </div>

                    {/* Parámetros de la serie actual */}
                    <div className="mt-5 grid grid-cols-3 gap-2 py-3 px-3.5 rounded-lg border border-zinc-800/80 bg-zinc-900/60 font-mono text-xs">
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase">Reps</span>
                        <span className="text-zinc-200 font-bold tabular-nums">5 efectivas</span>
                      </div>
                      <div className="border-l border-zinc-800 pl-3">
                        <span className="text-zinc-500 block text-[10px] uppercase">Descanso</span>
                        <span className="text-zinc-200 font-bold tabular-nums">02:30</span>
                      </div>
                      <div className="border-l border-zinc-800 pl-3">
                        <span className="text-zinc-500 block text-[10px] uppercase">Cadencia</span>
                        <span className="text-zinc-200 font-bold tabular-nums">3-1-X-0</span>
                      </div>
                    </div>

                    {/* Alumnos y validación técnica */}
                    <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between gap-3 text-xs">
                      <p className="text-zinc-300 leading-snug">
                        <span className="font-mono font-bold text-white tabular-nums">+150</span> alumnos que dejaron de estancarse y hoy levantan con técnica impecable.
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {["Halterofilia", "Fuerza", "Boxeo"].map((e) => (
                          <span key={e} className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-200">
                            {e}
                          </span>
                        ))}
                      </div>
                      <a
                        href="#trayectoria"
                        className="inline-flex min-h-[48px] items-center gap-1.5 text-xs font-bold text-zinc-100 underline-offset-4 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                      >
                        <span>Ver metodología auditada</span>
                        <ArrowIcon className="size-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Ficha Diagnóstica Plana de Apoyo */}
                  <div
                    className="rounded-xl border border-zinc-200 bg-white text-zinc-950 p-4 sm:p-5 shadow-sm"
                    data-testid="hero-card-layer-middle"
                  >
                    <span className="inline-flex rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                      Diagnóstico sin filtro
                    </span>
                    <blockquote className="mt-2.5 text-sm sm:text-base font-black tracking-tight leading-snug text-zinc-950">
                      &ldquo;El 90% de los que van al gimnasio no tienen un problema de voluntad. Tienen una rutina genérica y nadie que les mire la técnica.&rdquo;
                    </blockquote>
                    <figcaption className="mt-2 pt-2 border-t border-zinc-200 text-xs text-zinc-600">
                      <span className="font-black uppercase tracking-wide text-zinc-950">Gonzalo Salas</span>
                      <span className="font-mono"> · Head Coach · Director Técnico</span>
                    </figcaption>
                  </div>

                  {/* Atmósfera B&N Técnica */}
                  <div
                    className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm"
                    data-testid="hero-card-layer-back"
                  >
                    <img
                      src="https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1200&auto=format&fit=crop"
                      alt="Barra cargada con discos olímpicos de fuerza y magnesio"
                      className="absolute inset-0 w-full h-full object-cover grayscale contrast-150 brightness-[0.25] pointer-events-none"
                    />
                    <div className="relative z-10 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                        MÉTODO GONZALO SALAS · 2026
                      </span>
                      <span className="font-mono text-xs text-white font-bold">
                        Hierro pesado, técnica estricta y magnesio.
                      </span>
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

        {/* 4. Sección 01: Fichas Técnicas de Diagnóstico Biomecánico (Protocolo de Descarte) */}
        <section id="contraste" className="py-16 sm:py-24" data-testid="seccion-contraste-realidad">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="01"
              kicker="Protocolo de Descarte"
              title="Fichas Técnicas de Diagnóstico Biomecánico"
              lead="Lo que pasa en un gimnasio común vs. Entrenar con Gonzalo Salas. Erradicamos los 4 puntos ciegos que frenan tu progreso físico y te provocan lesiones."
            />

            {/* Grilla 2x2 de Fichas Técnicas: Erradica el formato de tabla genérica SaaS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
              {PROTOCOLO_DESCARTE.map((ficha) => (
                <article
                  key={ficha.eje}
                  className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-xs hover:border-foreground/30 transition-colors duration-150"
                >
                  <div>
                    {/* Header de la Ficha */}
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        FICHA {ficha.n} · {ficha.eje}
                      </span>
                      <span className="rounded-md border border-border bg-secondary/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                        {ficha.chip}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold tracking-tight text-foreground mb-4">
                      {ficha.titulo}
                    </h3>

                    {/* Descarte: Gimnasio Común */}
                    <div className="rounded-lg border border-danger-soft-border bg-danger-soft/40 p-3.5 mb-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-soft-foreground border border-danger-soft-border">
                          <CrossIcon className="size-2.5" />
                        </span>
                        <div>
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-destructive block mb-0.5">
                            Práctica Común Descartada
                          </span>
                          <p className="text-xs sm:text-sm text-muted-foreground line-through decoration-muted-foreground/40 leading-relaxed">
                            {ficha.comun}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Protocolo GOZSter */}
                    <div className="rounded-lg border border-success-soft-border bg-success-soft/30 p-3.5">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground border border-success-soft-border">
                          <CheckIcon className="size-2.5" />
                        </span>
                        <div>
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-success block mb-0.5">
                            Protocolo Biomecánico GOZSter
                          </span>
                          <p className="text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                            {ficha.metodo}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground leading-relaxed">
                    {ficha.detalle}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Sección 02: Insignias de Acreditación Oficial con monogramas y transferencia */}
        <section id="trayectoria" className="py-16 sm:py-24 border-t border-border bg-secondary/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="02"
              kicker="Acreditación Oficial"
              title="Formación Académica y Dirección Técnica"
              lead="Respaldado por las instituciones de educación física, fuerza y deportes de combate de mayor rigor técnico de Argentina y Europa."
            />

            {/* Grilla de Insignias de Acreditación Oficial con Monogramas y Transferencia Pragmática */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
              {ACREDITACIONES.map((c, i) => (
                <div
                  key={c.titulo}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 sm:p-6 hover:bg-foreground hover:text-background transition-colors duration-150 shadow-xs"
                  data-testid={c.testid}
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      {/* Monograma oficial en caja cuadrada monoespaciada */}
                      <div className="size-11 sm:size-12 rounded-lg bg-secondary border border-border flex items-center justify-center font-mono font-black text-sm sm:text-base tracking-tight text-foreground group-hover:bg-background group-hover:text-foreground transition-colors duration-150">
                        {c.sigla}
                      </div>
                      <span className="font-mono text-xs font-semibold text-muted-foreground group-hover:text-background/70 transition-colors">
                        0{i + 1}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold tracking-tight mb-1">
                      {c.titulo}
                    </h3>

                    <div className="mb-3">
                      <span className="inline-flex items-center rounded-md border border-border bg-secondary/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground group-hover:border-background/30 group-hover:bg-background/10 group-hover:text-background transition-colors duration-150">
                        {c.institucion}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-muted-foreground group-hover:text-background/70 mb-3 transition-colors">
                      {c.area}
                    </div>
                  </div>

                  {/* Transferencia pragmática del beneficio al alumno */}
                  <div className="pt-3 border-t border-border group-hover:border-background/20 transition-colors">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider block mb-1 text-muted-foreground group-hover:text-background/70 transition-colors">
                      Transferencia al Alumno
                    </span>
                    <p className="text-xs leading-relaxed text-muted-foreground group-hover:text-background/90 transition-colors">
                      {c.beneficio}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Sección 03: Tríptico de Modalidades con Fotografía B&N en Duotono */}
        <section id="modalidades" className="py-16 sm:py-24 border-t border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="03"
              kicker="Disciplinas Disponibles"
              title="Modalidades de Trabajo"
              lead="Entrenamiento adaptado a tus metas atléticas, ya sea presencial o a distancia mediante software dedicado."
            />

            {/* Tríptico visual de 3 disciplinas: fotografía B&N, reducción del 75% y chips */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {MODALIDADES.map((m) => (
                <article
                  key={m.nombre}
                  className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-xs hover:border-foreground/40 transition-colors duration-150"
                >
                  {/* Fotografía B&N en duotono */}
                  <div className="relative h-44 sm:h-48 w-full overflow-hidden bg-zinc-950 border-b border-border">
                    <img
                      src={m.foto}
                      alt={m.alt}
                      className="h-full w-full object-cover grayscale contrast-125 brightness-75 transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                    />
                    <div className="absolute inset-0 bg-zinc-950/40 mix-blend-multiply pointer-events-none" />
                    <div className="absolute top-3 left-3 z-10">
                      <span className={`${BADGE} bg-zinc-900/90 text-zinc-100 border-zinc-700/80 backdrop-blur-xs`}>
                        {m.badge}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col flex-1 p-5 sm:p-6">
                    <h3 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                      {m.nombre}
                    </h3>

                    {/* Reducción de texto del 75%: conciso y directo */}
                    <p className="mt-2.5 text-xs sm:text-sm text-muted-foreground leading-relaxed flex-1">
                      {m.descripcion}
                    </p>

                    {/* Chips biomecánicos */}
                    <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-1.5">
                      {m.chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-md border border-border bg-secondary/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>

                    {/* CTA contextual */}
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${BTN} mt-5 w-full border border-border bg-secondary/60 text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary`}
                    >
                      <span>{m.cta}</span>
                      <ArrowIcon />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Sección 04: Walkthrough Lineal en 3 Actos para Profesionales (Paleta Zinc Coach Studio) */}
        <section
          id="infraestructura"
          className="dark relative isolate overflow-hidden py-16 sm:py-24 border-t border-border bg-background text-foreground"
          data-testid="seccion-entrenadores"
        >
          <div className="hero-grid absolute inset-0 -z-10 pointer-events-none" aria-hidden="true" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeader
              index="04"
              kicker="Plataforma para Profesionales"
              title="¿Sos entrenador o tenés un gimnasio? Dejá de perder 10 horas por semana con Excels y fotocopias."
              lead="Las apps comerciales cobran en dólares por cada alumno que sumás y se tildan en el sótano del gimnasio. GOZSter es tecnología propia construida para entrenadores reales."
              display
            />

            {/* Walkthrough Lineal en 3 Actos: Creación -> Ejecución Offline -> Auditoría & Récords */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {WALKTHROUGH_ACTOS.map((paso, idx) => (
                <div
                  key={paso.acto}
                  className="flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-sm relative"
                >
                  <div>
                    {/* Indicador de Acto */}
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {paso.acto} · {paso.etiqueta}
                      </span>
                      <span className="size-6 rounded-full bg-secondary border border-border font-mono text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold tracking-tight text-foreground mb-2">
                      {paso.titulo}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      {paso.descripcion}
                    </p>
                  </div>

                  {/* Badges de soporte del acto */}
                  <div className="pt-4 border-t border-border flex flex-wrap gap-1.5">
                    {paso.badges.map((b) => (
                      <span
                        key={b}
                        className="rounded-md border border-border bg-secondary/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Cierre: Soberanía $0 en Licencias + Acceso Inmediato */}
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-sm">
              <div className="max-w-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono tabular-nums text-4xl sm:text-5xl font-black tracking-tight text-foreground">
                    $0
                  </span>
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    <div>por alumno · por mes</div>
                    <div className="text-foreground font-bold">Software Libre & Soberano</div>
                  </div>
                </div>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                  $0 en licencias comerciales (software libre y soberano).
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Cero comisiones, sin suscripciones mensuales abusivas y con total soberanía sobre la base de datos de tu gimnasio.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
                <Link href="/studio" className={`${BTN} bg-primary text-primary-foreground hover:opacity-90 shadow-sm`}>
                  <span>Ingresar a Coach Studio Gratis (Sin tarjeta)</span>
                  <ArrowIcon />
                </Link>
                <Link href="/athlete" className={`${BTN} border border-border bg-secondary/60 text-foreground hover:bg-secondary`}>
                  <span>Probar Athlete App (PWA)</span>
                </Link>
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
