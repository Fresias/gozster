"use client";

import * as React from "react";
import Link from "next/link";
import { useLandingSession } from "@/lib/use-landing-session";
import { CharacterReveal } from "@/components/landing/character-reveal";
import { NosotrosInteraction } from "@/components/landing/nosotros-badge";
import { useHorizontalStorytelling } from "@/components/landing/use-horizontal-storytelling";
import {
  ArrowIcon,
  BTN,
  BTN_GHOST,
  BTN_PRIMARY,
  BTN_XL,
  Capitulo,
  CheckIcon,
  CONTAINER,
  Contador,
  CUERPO,
  DOLORES_COACH,
  EnlaceSiguiente,
  FILA,
  FILA_ITEM,
  FOCUS_RING,
  FOTO_GONZALO,
  H2,
  LandingFooter,
  LandingHeader,
  LEAD,
  MICRO_LABEL,
  Preguntas,
  SECCION,
  Siguiente,
  Tachados,
  Tilt,
  useScrollReveal,
  whatsapp,
  WHATSAPP_ALUMNO,
  WHATSAPP_COACH,
} from "@/components/landing/kit";
import { useModalidadesDeal } from "@/components/landing/use-modalidades-deal";

const FOTO_FELIPE = "/images/coaches/Felipe.jfif";
const FOTO_LLESET = "/images/coaches/Lleset.jfif";

const EQUIPO_COACHES = [
  {
    nombre: "Gonzalo Salas",
    cargo: "Head Coach",
    foto: FOTO_GONZALO,
    alt: "Retrato de Gonzalo Salas, Head Coach",
    formacion: 'Profesor Nacional de Educación Física · ISEF N°1 "Dr. Enrique Romero Brest"',
    detalle: "Director Técnico de Boxeo (FAB) y entrenador con más de 5 años guiando atletas.",
  },
  {
    nombre: "Felipe Leites",
    cargo: "Online Coach",
    foto: FOTO_FELIPE,
    alt: "Retrato de Felipe Leites, Online Coach",
    formacion: "Licenciado en Educación Física IURP",
    detalle: "Especialista en planificación, seguimiento continuo y planes a distancia.",
  },
  {
    nombre: "Leonel Lleset",
    cargo: "Boxing Coach",
    foto: FOTO_LLESET,
    alt: "Retrato de Leonel Lleset, Boxing Coach",
    formacion: "Licenciado en Educación Física IURP",
    detalle: "A cargo de clases presenciales de Funcional y Boxeo.",
  },
];

/* Las "tendencias" que el relato tacha: el dolor contado con las palabras del alumno. */
const TENDENCIAS = [
  "El reto de 30 días",
  "La rutina del influencer",
  "Entrenar hasta no dar más",
  "El ejercicio de moda",
  "Resultados en dos semanas",
  "La rutina de tu amigo",
  "Empezar de cero cada lunes",
];

const DOLORES = [
  {
    n: "01",
    titulo: "Hace meses que vas. Hace meses que levantás lo mismo.",
    detalle: "Cumplís, transpirás, volvés. Pero si mirás para atrás, no sabés decir en qué mejoraste.",
  },
  {
    n: "02",
    titulo: "Tu rutina es una fotocopia.",
    detalle: "La misma hoja que le dieron a todos, sin importar tu cuerpo, tu historia ni lo que querés lograr.",
  },
  {
    n: "03",
    titulo: "Nadie te mira entrenar.",
    detalle: "Si lo estás haciendo mal, te enterás tarde: cuando algo empieza a doler.",
  },
];

const CONTRASTE = [
  {
    tendencia: "La rutina que le sirve a todo el mundo",
    evidencia: "Un plan pensado para tu cuerpo, tu historia y tu objetivo.",
  },
  {
    tendencia: "Si no terminás destruido, no sirvió",
    evidencia: "Entrenar de verdad exige planificación, técnica e intensidad adecuada.",
  },
  {
    tendencia: "Cambiar todos los ejercicios cada semana",
    evidencia: "Repetir lo que funciona y mejorarlo un poco cada vez.",
  },
  {
    tendencia: "“Creo que estoy progresando”",
    evidencia: "Todo queda anotado: sabés cuánto avanzaste y qué toca hoy.",
  },
];

const PASOS = [
  {
    n: "1",
    titulo: "Charlamos",
    donde: "Por WhatsApp",
    detalle: "El equipo de GOZS te escucha: qué querés lograr, qué hiciste hasta ahora y si algo te molesta.",
  },
  {
    n: "2",
    titulo: "Recibís tu plan",
    donde: "En tu celular",
    detalle: "Hecho para vos, en tu celular. Abrís la app y sabés exactamente qué te toca hoy.",
  },
  {
    n: "3",
    titulo: "Te acompañamos",
    donde: "Semana a semana",
    detalle: "Vemos lo que hiciste, te corregimos y ajustamos el plan cuando hace falta. No entrenás solo.",
  },
];

const BENEFICIOS_ALUMNO = [
  "Abrís la app y ya sabés qué toca hoy.",
  "Cada entrenamiento queda guardado: ves tu avance semana a semana.",
  "Anda aunque el gimnasio no tenga señal.",
  "Calentamiento Específico con videos y Cronómetro Inteligente para tus descansos.",
];

/* Tríptico de modalidades con fotografía en blanco y negro. */
const MODALIDADES = [
  {
    nombre: "Funcional",
    badge: "Presencial",
    foto: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=800&auto=format&fit=crop",
    alt: "Persona entrenando con pesas en un gimnasio",
    descripcion: "Fuerza y movimiento para la vida real: clases presenciales con el equipo de GOZS para sentirte ágil, fuerte y sin dolores.",
    cta: "QUIERO entrenar",
  },
  {
    nombre: "Boxeo",
    badge: "Presencial",
    foto: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?q=80&w=800&auto=format&fit=crop",
    alt: "Guantes de boxeo junto a una bolsa de entrenamiento",
    descripcion: "Aprendé los fundamentos del boxeo mientras mejorás tu resistencia, tu coordinación y bajás el estrés.",
    cta: "PONERME los guantes",
  },
  {
    nombre: "Planes online",
    badge: "Desde donde estés",
    foto: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800&auto=format&fit=crop",
    alt: "Sala de gimnasio con mancuernas y máquinas",
    descripcion: "Tu plan en el celular y el equipo de GOZS siguiendo tu progreso, entrenes donde entrenes.",
    cta: "PEDIR mi plan",
  },
];

/* Testimonios reales de alumnos, tal como están publicados en gozsteam.com. */
const TESTIMONIOS = [
  {
    nombre: "Mirko",
    contexto: "Entrenamiento funcional · Squash",
    cita: "Con Gonza entrenamos la parte física para llegar bien alto en mi deporte. Es extremadamente responsable conmigo y llevamos un trabajo planeado con mis otros entrenadores, es parte de mi equipo para el deportista que sueño ser.",
  },
  {
    nombre: "Franco",
    contexto: "Entrenamiento funcional",
    cita: "Las clases de GOZS me ayudaron a recuperarme física y mentalmente. Arranqué con 53 kg y hoy superé los 70 kg ganando mucha masa muscular. Las clases son muy dinámicas y divertidas.",
  },
  {
    nombre: "German",
    contexto: "Boxeo",
    cita: "Las clases de box son intensas pero cuidadas. El compañerismo, el respeto y la supervisión nos ayudan a mejorar clase a clase en pequeños detalles.",
  },
];

const CREDENCIALES = [
  {
    titulo: "Profesor Nacional de Educación Física",
    institucion: 'ISEF N°1 "Dr. Enrique Romero Brest"',
    paraVos: "Sabe enseñar: no solo qué hacer, también cómo aprenderlo.",
  },
  {
    titulo: "Personal Trainer Certificado",
    institucion: "Centro Europeo de Educación Física",
    paraVos: "Planes a tu medida, no recetas para todos.",
  },
  {
    titulo: "Entrenador de Levantamiento Olímpico",
    institucion: "Grupo GPO Latam",
    paraVos: "Técnica cuidada para levantar con seguridad.",
  },
  {
    titulo: "Director Técnico de Boxeo",
    institucion: "Federación Argentina de Boxeo (FAB)",
    paraVos: "Boxeo bien enseñado, desde la primera clase.",
  },
];

const FAQ_ALUMNOS = [
  {
    q: "¿Necesito experiencia para empezar?",
    a: "No. El plan arranca desde tu nivel de hoy, sea tu primera vez o vuelvas después de años.",
  },
  {
    q: "¿Cómo es el primer paso?",
    a: "Le escribís al equipo de GOZS por WhatsApp. Te preguntamos qué querés lograr, qué hiciste hasta ahora y si algo te molesta. Sin compromiso.",
  },
  {
    q: "¿Qué diferencia hay entre presencial y online?",
    a: "Presencial entrenás en grupo con el equipo de GOZS: funcional o boxeo. Online recibís tu plan en la app y el equipo sigue tu progreso a distancia. También se pueden coordinar clases personalizadas.",
  },
  {
    q: "¿Realizan clases presenciales personalizadas?",
    a: "Sí, se acuerda día, horario y lugar con los profesores disponibles.",
  },
  {
    q: "¿El boxeo es con contacto?",
    a: "No es necesario participar de situaciones de contacto; se trabaja con manoplas, bolsa y técnica.",
  },
  {
    q: "¿Cuánto cuesta?",
    a: "Depende de la modalidad y del nivel de seguimiento que elijas. Escribinos y te pasamos los valores actualizados.",
  },
  {
    q: "Tengo una lesión o una molestia, ¿puedo entrenar?",
    a: "Contalo en la primera charla: el plan se adapta a tu situación. Si estás en tratamiento, seguí siempre la indicación de tu médico.",
  },
];

const NAV = [
  ["#gonzalo", "Equipo GOZS"],
  ["#problema", "Método GOZS"],
  ["#modalidades", "Modalidades"],
  ["#faq", "Preguntas"],
] as const;

function XIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function TrofeoIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v4M8.5 20h7" />
    </svg>
  );
}

/* Ejemplo ilustrativo de la app del alumno: la rutina de hoy y un récord recién logrado. */
function TelefonoEjemplo() {
  const ejercicios = [
    { nombre: "Sentadilla", estado: "Listo", hecho: true },
    { nombre: "Peso muerto", estado: "Listo", hecho: true },
    { nombre: "Estocadas", estado: "Vas 2 de 3", hecho: false },
  ];
  return (
    <div
      role="img"
      aria-label="Ejemplo ilustrativo de la app: la rutina de hoy con los ejercicios hechos y el aviso de un nuevo récord en sentadilla"
      className="dark landing-float mx-auto w-full max-w-[270px] rounded-[2.4rem] border border-zinc-700 bg-zinc-950 p-2.5 shadow-2xl sm:max-w-[290px]"
    >
      <div className="rounded-[1.9rem] bg-background p-4 text-foreground" aria-hidden="true">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-secondary" />
        <div className={MICRO_LABEL}>Hoy · Miércoles</div>
        <div className="mt-1 text-2xl font-black tracking-tight">Piernas</div>
        <div className="mt-2 hidden items-center gap-2.5 sm:flex">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="landing-linea h-full w-2/3 rounded-full bg-foreground" />
          </div>
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">2 de 3</span>
        </div>

        <ul className="mt-4 hidden space-y-2 sm:block">
          {ejercicios.map((e) => (
            <li key={e.nombre} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/70 px-3.5 py-2.5">
              <span className="flex items-center gap-2.5">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                    e.hecho ? "bg-foreground text-background" : "border border-muted-foreground/50"
                  }`}
                >
                  {e.hecho ? <CheckIcon className="size-3" /> : null}
                </span>
                <span className="text-sm font-semibold">{e.nombre}</span>
              </span>
              <span className="text-xs text-muted-foreground">{e.estado}</span>
            </li>
          ))}
        </ul>

        <div className="landing-pop mt-3 rounded-xl bg-foreground p-3 text-background sm:p-3.5" style={{ "--pop-delay": "500ms" } as React.CSSProperties}>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background/15">
              <TrofeoIcon className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-black leading-tight">¡Nuevo récord!</span>
              <span className="block text-xs opacity-70">Sentadilla</span>
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-sm tabular-nums line-through opacity-60">60 kg</span>
            <ArrowIcon className="size-3.5 opacity-60" />
            <span className="font-mono text-2xl font-black tabular-nums tracking-tighter sm:text-3xl">62,5 kg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useLandingSession();
  useScrollReveal();
  const deal = useModalidadesDeal();
  const { containerRef, trackRef, progressBarRef } = useHorizontalStorytelling();

  /* Quien ya tiene cuenta entra desde el header; el relato siempre invita a empezar. */
  const accionCorta = (className: string, tabIndex?: number) =>
    user?.rol === "ADMIN" ? (
      <Link href="/studio" className={className} tabIndex={tabIndex}>
        <span>Ir a Coach Studio</span>
        <ArrowIcon />
      </Link>
    ) : user?.rol === "ALUMNO" ? (
      <Link href="/athlete" className={className} tabIndex={tabIndex}>
        <span>Abrir mi rutina</span>
        <ArrowIcon />
      </Link>
    ) : (
      <a href={WHATSAPP_ALUMNO} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
        <span>Quiero entrenar</span>
        <ArrowIcon />
      </a>
    );

  const retraso = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as React.CSSProperties;

  return (
    <div className="landing-root flex min-h-screen flex-col overflow-x-clip bg-background text-foreground antialiased">
      {/* Progreso de lectura del relato */}
      <div className="landing-progress pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-foreground" aria-hidden="true" />

      <LandingHeader publico="alumnos" user={user} accion={accionCorta(`${BTN_PRIMARY} !hidden !min-h-[40px] !px-4 !py-2 md:!inline-flex`)} />

      <main className="flex-1">
        {/* Hero: la promesa, en una frase, y quién la sostiene */}
        <section
          className="landing-section dark relative isolate flex min-h-landing-chapter flex-col overflow-hidden bg-background text-foreground"
          data-testid="hero-impacto"
        >
          <div className="hero-grid pointer-events-none absolute inset-0 -z-20" aria-hidden="true" />
          {/* Retrato de Gonzalo: presencia humana en el primer pantallazo (desktop) */}
          <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full opacity-35 lg:w-[46%] lg:opacity-100" aria-hidden="true">
            <img src={FOTO_GONZALO} alt="" className="size-full object-cover object-top grayscale contrast-125" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>

          <div className={`${CONTAINER} flex flex-1 flex-col justify-between gap-6 pb-6 pt-8 sm:gap-8 sm:pb-8 sm:pt-14`}>
            <div>
              <p className={`${MICRO_LABEL} landing-rise flex items-center gap-3`}>
                <span className="landing-dot size-2 rounded-full bg-foreground text-foreground" aria-hidden="true" />
                <span>Gonzalo Salas · Head Coach</span>
              </p>

              <h1 className="mt-4 max-w-4xl text-[clamp(2.6rem,6.6vw,5.25rem)] font-black leading-[0.92] tracking-tighter sm:mt-6">
                <span className="landing-rise block" style={{ animationDelay: "80ms" }}>
                  Entrenamiento basado en evidencia,
                </span>
                <span className="landing-rise block text-muted-foreground" style={{ animationDelay: "200ms" }}>
                  <s className="landing-strike no-underline">no tendencias</s>.
                </span>
              </h1>

              <p className="landing-rise mt-5 max-w-xl text-pretty text-base leading-relaxed text-foreground/85 sm:mt-7 sm:text-xl" style={{ animationDelay: "320ms" }}>
                <span className="hidden sm:inline">Dejá de adivinar en el gimnasio. </span>Un plan hecho para vos, alguien que te mira entrenar y un progreso que se nota semana a semana.
              </p>

              <div
                className="landing-rise mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center"
                style={{ animationDelay: "440ms" }}
                data-testid="hero-cta"
              >
                <a href={WHATSAPP_ALUMNO} target="_blank" rel="noopener noreferrer" className={`${BTN_PRIMARY} ${BTN_XL}`}>
                  <span>Quiero empezar a entrenar</span>
                  <ArrowIcon className="size-5" />
                </a>
                <Link
                  href="/entrenadores"
                  className={`${BTN} ${BTN_XL} border-2 border-foreground/80 bg-background/50 text-foreground backdrop-blur-sm hover:bg-foreground hover:text-background`}
                >
                  <span>Soy entrenador: ver Coach Studio</span>
                  <ArrowIcon className="size-5" />
                </Link>
              </div>
              <p className="landing-rise mt-3 hidden text-xs text-muted-foreground sm:mt-4 sm:block sm:text-sm" style={{ animationDelay: "520ms" }}>
                Sin compromiso: le escribís por WhatsApp y te cuenta cómo trabaja.
              </p>
            </div>

            <div className="landing-rise flex flex-col gap-5 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between sm:pt-6" style={{ animationDelay: "600ms" }}>
              <dl className="flex items-end gap-8 sm:gap-14" data-testid="hero-metricas">
                <div>
                  <dd className="font-mono text-5xl font-black leading-none tracking-tighter tabular-nums sm:text-7xl">
                    <Contador valor={150} prefijo="+" />
                  </dd>
                  <dt className="mt-2 text-sm font-semibold leading-snug text-foreground/80 sm:text-base">alumnos acompañados</dt>
                </div>
                <div>
                  <dd className="font-mono text-5xl font-black leading-none tracking-tighter tabular-nums sm:text-7xl">
                    <Contador valor={5} sufijo="+" duracion={900} />
                  </dd>
                  <dt className="mt-2 text-sm font-semibold leading-snug text-foreground/80 sm:text-base">años entrenando personas</dt>
                </div>
              </dl>
              <EnlaceSiguiente href="#gonzalo">Conocé a quien te va a entrenar</EnlaceSiguiente>
            </div>
          </div>

          {/* Las tendencias, tachadas */}
          <Tachados items={TENDENCIAS} intro="Lo que dejamos afuera" testid="tendencias-tachadas" />
        </section>

        {/* 01 · Quién te entrena: la autoridad, apenas termina la promesa */}
        <section id="gonzalo" className={SECCION}>
          <div className={CUERPO}>
            <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-12 md:gap-10 lg:gap-12">
              <figure className="landing-media dark group relative isolate overflow-hidden rounded-2xl bg-background md:col-span-4" data-reveal>
                <img
                  src={FOTO_GONZALO}
                  alt="Retrato de Gonzalo Salas, Head Coach"
                  loading="lazy"
                  className="aspect-[2/1] w-full object-cover object-top grayscale contrast-125 transition-transform duration-700 group-hover:scale-105 md:aspect-[3/4]"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent p-5 pt-16 text-foreground">
                  <span className="block text-3xl font-black leading-none tracking-tighter">Gonzalo Salas</span>
                  <span className="mt-2 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="landing-dot size-1.5 rounded-full bg-foreground text-foreground" aria-hidden="true" />
                    Head Coach
                  </span>
                </figcaption>
              </figure>

              <div className="md:col-span-8">
                <Capitulo n="01">Quién te entrena</Capitulo>
                <h2 className="sr-only">Quién te entrena</h2>
                <blockquote className="text-balance text-xl font-black leading-[1.05] tracking-tighter sm:text-4xl lg:text-[2.75rem]" data-reveal>
                  &ldquo;No tenés un problema de voluntad. Tenés una <span className="landing-tachar text-muted-foreground">rutina genérica</span> y nadie que te mire entrenar.&rdquo;
                </blockquote>
                <p className={`${LEAD} mt-4 hidden max-w-2xl sm:block`} data-reveal>
                  Profesor de Educación Física, entrenador y director técnico de boxeo. Lleva más de cinco años acompañando a personas reales a entrenar mejor, sin atajos y sin humo.
                </p>

                <ul className="mt-6 border-t border-border" id="trayectoria">
                  {CREDENCIALES.map((c, i) => (
                    <li
                      key={c.titulo}
                      className="group grid grid-cols-1 gap-1 border-b border-border px-0 py-2.5 transition-all duration-200 hover:bg-foreground hover:text-background sm:grid-cols-12 sm:gap-6 sm:px-4 sm:py-3.5 sm:hover:pl-6"
                      data-testid={`franja-cv-${i + 1}`}
                      data-reveal
                      style={retraso(i * 70)}
                    >
                      <span className="hidden font-mono text-sm font-semibold tabular-nums text-muted-foreground transition-colors group-hover:text-background/70 sm:col-span-1 sm:block sm:pt-0.5">
                        0{i + 1}
                      </span>
                      <div className="sm:col-span-6">
                        <h3 className="text-base font-black leading-snug tracking-tight sm:text-lg">{c.titulo}</h3>
                        <p className="text-sm text-muted-foreground transition-colors group-hover:text-background/70">{c.institucion}</p>
                      </div>
                      <p className="hidden text-sm font-medium leading-relaxed sm:col-span-5 sm:block sm:pt-0.5">{c.paraVos}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Staff Técnico GOZS: debajo de Gonzalo, mismo estilo de tipografía, fuentes y tamaños */}
            <div className="mt-12 border-t border-border pt-8" data-testid="equipo-gozs">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
                <div className="flex items-center gap-2">
                  <span className="landing-dot size-1.5 rounded-full bg-foreground" aria-hidden="true" />
                  <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Staff Técnico GOZS · Licenciados en Educación Física IURP
                  </h3>
                </div>
                <span className="font-mono text-xs text-muted-foreground">Equipo operativo</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Felipe Leites */}
                <div className="landing-card group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/40">
                  <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-background">
                    <img
                      src={FOTO_FELIPE}
                      alt="Retrato de Felipe Leites, Online Coach"
                      loading="lazy"
                      className="size-full object-cover grayscale contrast-125"
                    />
                  </div>
                  <div>
                    <span className={MICRO_LABEL}>
                      Online Coach
                    </span>
                    <h4 className="text-base font-black leading-snug tracking-tight text-foreground">
                      Felipe Leites
                    </h4>
                    <p className="text-xs text-muted-foreground">Licenciado en Educación Física IURP</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      Especialista en planificación, seguimiento continuo y planes a distancia.
                    </p>
                  </div>
                </div>

                {/* Leonel Lleset */}
                <div className="landing-card group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/40">
                  <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-background">
                    <img
                      src={FOTO_LLESET}
                      alt="Retrato de Leonel Lleset, Boxing Coach"
                      loading="lazy"
                      className="size-full object-cover grayscale contrast-125"
                    />
                  </div>
                  <div>
                    <span className={MICRO_LABEL}>
                      Boxing Coach
                    </span>
                    <h4 className="text-base font-black leading-snug tracking-tight text-foreground">
                      Leonel Lleset
                    </h4>
                    <p className="text-xs text-muted-foreground">Licenciado en Educación Física IURP</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      A cargo de clases presenciales de Funcional y Boxeo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Siguiente href="#problema">¿Te suena esto?</Siguiente>
        </section>

        {/* 02 · ¿Te suena? (Storytelling con Scroll Horizontal en 1 Solo Viewport) */}
        <section
          id="problema"
          ref={containerRef}
          className="landing-section relative min-h-landing-chapter h-[220vh] bg-secondary/40 text-foreground"
        >
          <div id="metodo" className="sr-only" />

          {/* Elemento Sticky de 100vh exacto (1 solo viewport) */}
          <div
            id="problema-sticky-viewport"
            className="sticky top-landing-header flex h-landing-chapter w-full flex-col justify-between overflow-hidden py-4"
          >
            {/* Barra superior de estado y progreso narrativo monocromático */}
            <div className={`${CONTAINER} flex items-center justify-between border-b border-border pb-3`}>
              <Capitulo n="02">¿Te suena?</Capitulo>
              <div className="w-24 sm:w-36 h-1 rounded-full bg-border/60 overflow-hidden">
                <div
                  ref={progressBarRef}
                  className="h-full bg-foreground origin-left will-change-transform"
                  style={{ transform: "scaleX(0)" }}
                />
              </div>
            </div>

            {/* TRACK HORIZONTAL: Contiene Panel 1 (El Dolor) y Panel 2 (El Método) */}
            <div className={`${CONTAINER} my-auto overflow-hidden`}>
              <div
                ref={trackRef}
                id="story-track"
                className="flex items-center w-[200%] transition-transform duration-75 ease-out will-change-transform"
              >
                {/* PANEL 1: EL DOLOR */}
                <div className="w-1/2 shrink-0 pr-4 md:pr-10">
                  <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black leading-[0.95] tracking-tighter mb-6">
                      <span className="block text-muted-foreground">Vas al gimnasio,</span>{" "}
                      <span className="block text-muted-foreground">cumplís</span>{" "}
                      <span className="block text-foreground">
                        y aun así{" "}
                        <span className="relative inline-block">
                          no avanzás
                          <span className="landing-linea absolute inset-x-0 -bottom-1 h-[0.09em] bg-foreground" aria-hidden="true" />
                        </span>
                        .
                      </span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {DOLORES.map((d) => (
                        <div
                          key={d.n}
                          className="landing-card rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground"
                        >
                          <span
                            aria-hidden="true"
                            className="block font-mono text-2xl font-black leading-none tabular-nums tracking-tighter text-foreground/15 sm:text-5xl"
                          >
                            {d.n}
                          </span>
                          <h3 className="mt-2 text-balance text-base sm:text-lg font-black leading-tight tracking-tight text-foreground">
                            {d.titulo}
                          </h3>
                          <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                            {d.detalle}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* PANEL 2: EL MÉTODO (CERO EFECTOS EN NOVEDAD, 100% MONOCROMÁTICO) */}
                <div className="w-1/2 shrink-0 pl-4 md:pl-10">
                  <div className="max-w-5xl mx-auto" data-testid="contraste-tendencia-evidencia">
                    <Capitulo n="02">El método</Capitulo>
                    <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black leading-tight tracking-tight mt-1 mb-2">
                      Lo que funciona no es novedad. Es método.
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-4 max-w-2xl">
                      Las modas cambian cada mes. Lo que hace progresar a una persona se sabe hace años. Gonzalo trabaja con eso.
                    </p>

                    <div className="space-y-2">
                      {CONTRASTE.map((c) => (
                        <div
                          key={c.tendencia}
                          className="landing-card group grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2"
                        >
                          <p className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold leading-snug text-muted-foreground sm:px-4 sm:py-2.5 sm:text-sm">
                            <span className="hidden sm:inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border">
                              <XIcon className="size-2.5" />
                            </span>
                            <span>
                              <span className="sr-only">Tendencia: </span>
                              <span className="landing-tachar">{c.tendencia}</span>
                            </span>
                          </p>
                          <p className="flex items-center gap-2.5 bg-secondary/50 px-3.5 py-2 text-xs font-semibold leading-snug text-foreground transition-colors group-hover:bg-foreground group-hover:text-background sm:border-l sm:border-border sm:px-4 sm:py-2.5 sm:text-sm">
                            <span className="hidden sm:inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-colors group-hover:bg-background group-hover:text-foreground">
                              <CheckIcon className="size-2.5" />
                            </span>
                            <span>
                              <span className="sr-only">Evidencia: </span>
                              {c.evidencia}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pie del Viewport Sticky con enlace a la siguiente sección */}
            <div className={`${CONTAINER} flex items-center justify-end border-t border-border pt-3`}>
              <Siguiente href="#alumnos" className="!mt-0 !p-0">
                Mirá cómo se ve tu plan
              </Siguiente>
            </div>
          </div>
        </section>

        {/* 03 · Para vos, que querés entrenar */}
        <section id="alumnos" className={SECCION}>
          <div className={`${CUERPO}`}>
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-12 md:gap-10 lg:gap-12">
              <div className="md:col-span-7">
                <Capitulo n="03">Para vos, que querés entrenar</Capitulo>
                <h2 className={H2} data-reveal>
                  Tu plan en el bolsillo. Tu entrenador del otro lado.
                </h2>
                <p className={`${LEAD} mt-4 hidden max-w-xl sm:block`} data-reveal>
                  Nada de hojas sueltas ni capturas perdidas en el chat. Tu rutina vive en una app hecha a medida de cómo entrena el equipo de GOZS.
                </p>
                <ul className="mt-6 hidden space-y-3 sm:block">
                  {BENEFICIOS_ALUMNO.map((b, i) => (
                    <li key={b} className="flex items-start gap-3 text-base font-medium" data-reveal style={retraso(i * 70)}>
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                        <CheckIcon className="size-3" />
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center" data-reveal>
                  <a href={WHATSAPP_ALUMNO} target="_blank" rel="noopener noreferrer" className={`${BTN_PRIMARY} ${BTN_XL} w-full sm:w-auto`}>
                    <span>Quiero mi plan</span>
                    <ArrowIcon className="size-5" />
                  </a>
                  <span className="hidden text-sm text-muted-foreground sm:inline">El equipo de GOZS te lo arma después de la primera charla.</span>
                </div>
              </div>
              <div className="md:col-span-5" data-reveal>
                <TelefonoEjemplo />
                {/* Del otro lado, una persona: el seguimiento contado como conversación */}
                <div className="mx-auto mt-3 max-w-[270px] space-y-2 text-sm sm:mt-4 sm:max-w-[290px]" data-testid="mensaje-coach">
                  <p className="landing-pop w-fit max-w-[88%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-2.5 shadow-sm" style={{ "--pop-delay": "1100ms" } as React.CSSProperties}>
                    <span className="block text-[11px] font-bold text-muted-foreground">Equipo GOZS</span>
                    ¡Récord en sentadilla! La próxima, bajá más lento.
                  </p>
                  <p
                    className="landing-pop ml-auto hidden w-fit max-w-[88%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background sm:block"
                    style={{ "--pop-delay": "1900ms" } as React.CSSProperties}
                  >
                    ¡Dale! Sentí la diferencia.
                  </p>
                </div>
                <p className="mt-2 text-center text-[11px] text-muted-foreground sm:mt-3 sm:text-xs">Ejemplo ilustrativo de la app.</p>
              </div>
            </div>
          </div>
          <Siguiente href="#modalidades">Elegí cómo querés entrenar</Siguiente>
        </section>

        {/* 04 · Modalidades */}
        <section id="modalidades" ref={deal.sectionRef} className={`${SECCION} bg-secondary/40`}>
          <div className={CUERPO}>
            <Capitulo n="04">Modalidades</Capitulo>
            <h2 className={H2} data-reveal>
              Tres formas de empezar.
            </h2>
            <div
              ref={deal.gridRef}
              className={`${FILA} mt-8 md:gap-5`}
              style={{ perspective: "1400px" }}
              tabIndex={0}
              role="group"
              aria-label="Modalidades de entrenamiento"
            >
              {MODALIDADES.map((m, i) => (
                <div
                  key={m.nombre}
                  ref={(el) => {
                    deal.wrapperRefs.current[i] = el;
                  }}
                  className={FILA_ITEM}
                  data-modalidad-wrapper={i}
                >
                  <article
                    ref={(el) => {
                      deal.cardRefs.current[i] = el;
                    }}
                    className="landing-card dark group relative isolate flex min-h-[380px] w-full flex-col justify-end overflow-hidden rounded-2xl bg-background p-6 text-foreground lg:min-h-[400px]"
                    data-modalidad-card={i}
                  >
                    <img
                      src={m.foto}
                      alt={m.alt}
                      loading="lazy"
                      className="absolute inset-0 -z-20 size-full object-cover grayscale transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/70 to-background/20" aria-hidden="true" />
                    <span className="mb-auto self-start rounded-full border border-foreground/30 bg-background/60 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider">
                      {m.badge}
                    </span>
                    <h3 className="text-3xl font-black tracking-tighter lg:text-4xl">{m.nombre}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.descripcion}</p>
                    <a
                      href={whatsapp(`Hola equipo de GOZS, quiero consultar por ${m.nombre}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${BTN} mt-5 w-full bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring focus-visible:ring-offset-background`}
                    >
                      <span>{m.cta}</span>
                      <ArrowIcon />
                    </a>
                  </article>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-center" data-reveal>
              <a
                href={whatsapp("Hola equipo de GOZS, quiero conocer más de su comunidad y entrenamientos.")}
                target="_blank"
                rel="noopener noreferrer"
                className={`${BTN_GHOST} ${BTN_XL}`}
              >
                <span>Nuestra comunidad</span>
                <ArrowIcon className="size-5" />
              </a>
            </div>
          </div>
          <Siguiente href="#como">¿Y cómo se lleva a la práctica?</Siguiente>
        </section>

        {/* 05 · Cómo se trabaja */}
        <section id="como" className={SECCION}>
          <div className={CUERPO}>
            <Capitulo n="05">Cómo se trabaja</Capitulo>
            <h2 className={`${H2} max-w-4xl`} data-reveal>
              Tres pasos, <CharacterReveal text="CERO" className="font-black text-foreground" /> adivinanzas.
            </h2>
            <div className="relative mt-8 lg:mt-12" data-reveal>
              {/* Línea de tiempo: se dibuja al entrar y une los tres pasos */}
              <div className="landing-linea absolute inset-x-0 top-7 hidden h-0.5 bg-foreground md:block" aria-hidden="true" />
              <ol className={`${FILA} md:gap-6`} tabIndex={0} role="group" aria-label="Pasos de trabajo">
                {PASOS.map((p, i) => (
                  <li key={p.n} className={`${FILA_ITEM} group relative`}>
                    <span
                      className="landing-pop relative flex size-14 items-center justify-center rounded-full bg-foreground font-mono text-2xl font-black tabular-nums text-background ring-8 ring-background transition-transform duration-300 group-hover:scale-110"
                      style={{ "--pop-delay": `${200 + i * 300}ms` } as React.CSSProperties}
                    >
                      {p.n}
                    </span>
                    <div className="landing-card mt-5 rounded-2xl border border-border bg-card p-6 group-hover:border-foreground">
                      <span className={MICRO_LABEL}>{p.donde}</span>
                      <h3 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">{p.titulo}</h3>
                      <p className="mt-2 text-base leading-relaxed text-muted-foreground">{p.detalle}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-10" data-reveal>
              <a href={WHATSAPP_ALUMNO} target="_blank" rel="noopener noreferrer" className={`${BTN_PRIMARY} ${BTN_XL}`}>
                <span>Empezá hoy</span>
                <ArrowIcon className="size-5" />
              </a>
              <span className="text-sm text-muted-foreground">Una charla por WhatsApp, sin compromiso.</span>
            </div>
          </div>
          <Siguiente href="#testimonios">Lo que dicen quienes ya entrenan</Siguiente>
        </section>

        {/* 06 · Testimonios */}
        <section id="testimonios" className={`${SECCION} bg-secondary/40`}>
          <div className={CUERPO}>
            <Capitulo n="06">Quienes ya entrenan</Capitulo>
            <h2 className={`${H2} max-w-4xl`} data-reveal>
              No lo decimos <NosotrosInteraction>nosotros</NosotrosInteraction>.
            </h2>
            <div className={`${FILA} mt-8 md:gap-5 lg:mt-12`} tabIndex={0} role="group" aria-label="Testimonios de quienes ya entrenan">
              {TESTIMONIOS.map((t, i) => (
                <figure
                  key={t.nombre}
                  className={`${FILA_ITEM} landing-card flex flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-6 hover:border-foreground`}
                  data-reveal
                  style={retraso(i * 80)}
                >
                  <blockquote className="text-pretty text-base font-medium leading-relaxed">
                    <span className="mb-1 block font-mono text-5xl font-black leading-[0.6] text-foreground/20" aria-hidden="true">
                      &ldquo;
                    </span>
                    {t.cita}
                  </blockquote>
                  <figcaption className="flex items-center gap-3 border-t border-border pt-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-black text-background" aria-hidden="true">
                      {t.nombre[0]}
                    </span>
                    <span>
                      <span className="block text-sm font-black">{t.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{t.contexto}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
          <Siguiente href="#puente-entrenadores">¿Entrenás a otros? Esto es para vos</Siguiente>
        </section>

        {/* 07 · Coach Studio */}
        <section id="puente-entrenadores" className={`${SECCION} dark overflow-hidden bg-background text-foreground`} data-testid="puente-entrenadores">
          <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className={CUERPO}>
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-6">
                <Capitulo n="07">Coach Studio</Capitulo>
                <h2 className="text-balance text-[clamp(2.6rem,6vw,5rem)] font-black leading-[0.92] tracking-tighter" data-reveal>
                  ¿Entrenás a otros?
                </h2>
                <p className="mt-4 max-w-xl text-pretty text-xl font-bold leading-snug tracking-tight sm:text-2xl" data-reveal>
                  La herramienta con la que el equipo de GOZS planifica, sigue a sus alumnos y ordena sus clases, ahora también es tuya.
                </p>
                <ul className="mt-5 hidden space-y-1.5 sm:block" aria-label="Lo que dejás atrás">
                  {DOLORES_COACH.map((d, i) => (
                    <li key={d} className="text-base font-semibold text-muted-foreground" data-reveal style={retraso(i * 120)}>
                      <span className="landing-tachar">{d}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center" data-reveal>
                  <Link href="/entrenadores" className={`${BTN_PRIMARY} ${BTN_XL}`}>
                    <span>Conocer Coach Studio</span>
                    <ArrowIcon className="size-5" />
                  </Link>
                  <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={`${BTN_GHOST} ${BTN_XL} !hidden sm:!inline-flex`}>
                    Pedir una demo
                  </a>
                </div>
              </div>
              <figure className="landing-media lg:col-span-6" data-reveal>
                <Tilt className="lg:-mr-[30%]">
                  <Link href="/entrenadores" className={`block overflow-hidden rounded-xl border border-border bg-white shadow-2xl lg:rounded-2xl ${FOCUS_RING}`} aria-label="Conocer Coach Studio">
                    <div className="max-h-[180px] overflow-hidden sm:max-h-none">
                      <img
                        src="/landing/studio-inicio.jpg"
                        alt="Pantalla de inicio de Coach Studio: avisos para revisar hoy, clases del día y lista de alumnos"
                        width={2560}
                        height={1600}
                        loading="lazy"
                        className="h-auto w-[165%] max-w-none sm:w-full"
                      />
                    </div>
                  </Link>
                </Tilt>
                <figcaption className="mt-3 text-xs text-muted-foreground">Pantalla de Coach Studio con datos de ejemplo.</figcaption>
              </figure>
            </div>
          </div>
          <Siguiente href="#faq">¿Te quedaron dudas?</Siguiente>
        </section>

        {/* 08 · Preguntas frecuentes */}
        <section id="faq" className={SECCION} data-testid="seccion-faq">
          <div className={CUERPO}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-5">
                <Capitulo n="08">Preguntas frecuentes</Capitulo>
                <h2 className={H2} data-reveal>
                  Lo que todos preguntan antes de empezar.
                </h2>
                <p className={`${LEAD} mt-4 max-w-md`} data-reveal>
                  ¿No está tu duda? Escribile al equipo de GOZS y te respondemos.
                </p>
                <a
                  href={whatsapp("Hola equipo de GOZS, tengo una pregunta antes de empezar.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${BTN_GHOST} mt-5`}
                  data-reveal
                >
                  <span>Hacer mi pregunta</span>
                  <ArrowIcon className="size-5" />
                </a>
              </div>
              <div className="lg:col-span-7">
                <Preguntas titulo="Si querés entrenar" items={FAQ_ALUMNOS} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter nav={NAV} />
    </div>
  );
}
