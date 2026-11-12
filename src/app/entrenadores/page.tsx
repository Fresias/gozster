"use client";

import * as React from "react";
import Link from "next/link";
import { useLandingSession } from "@/lib/use-landing-session";
import {
  ArrowIcon,
  BarraMovil,
  BTN_GHOST,
  BTN_PRIMARY,
  BTN_XL,
  Capitulo,
  CheckIcon,
  CONTAINER,
  CUERPO,
  DOLORES_COACH,
  FOCUS_RING,
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
  useBarraMovil,
  useScrollReveal,
  WHATSAPP_COACH,
} from "@/components/landing/kit";

/* Recorrido por Coach Studio. Las imágenes salen de las pantallas canónicas del producto
   (docs/ux-ui-review/objetivo/html), con datos de ejemplo. */
const STUDIO_PANTALLAS = [
  {
    id: "studio-hoy",
    n: "01",
    etiqueta: "Tu día",
    titulo: "Abrís y sabés quién te necesita hoy.",
    detalle: "Quién avisó una molestia, quién hace días que no entrena, a quién se le venció la cuota y qué clases tenés. Todo en la primera pantalla.",
    puntos: ["Avisos ordenados por prioridad", "Clases del día con sus anotados", "Tus alumnos y su estado, de un vistazo"],
    img: "/landing/studio-inicio.jpg",
    imgMovil: "/landing/studio-movil.jpg",
    alto: 1600,
    alt: "Pantalla de inicio de Coach Studio: avisos para revisar hoy, clases del día y lista de alumnos",
    sigueHref: "#studio-rutinas",
    sigueTexto: "Ahora, armá un plan",
  },
  {
    id: "studio-rutinas",
    n: "02",
    etiqueta: "Tus planes",
    titulo: "Armás el plan como vos lo pensás.",
    detalle: "Guardá plantillas para optimizar tu workflow y dedicá tu tiempo a personalizar el plan de cada alumno.",
    puntos: ["Plantillas propias y planes por alumno", "Constructor por días, con tus ejercicios", "Cambiás un ejercicio sin rehacer todo"],
    img: "/landing/studio-rutinas.jpg",
    alto: 1280,
    alt: "Biblioteca de planes de Coach Studio con los planes asignados a cada alumno",
    sigueHref: "#studio-alumno",
    sigueTexto: "Mirá la ficha de un alumno",
  },
  {
    id: "studio-alumno",
    n: "03",
    etiqueta: "Cada alumno",
    titulo: "La historia completa de cada alumno.",
    detalle: "Lo que entrenó, sus mejores marcas, el plan vigente y cualquier molestia que haya avisado. Decidís con información, no de memoria.",
    puntos: ["Últimas sesiones y récords", "Molestias con tu nota de seguimiento", "Mensaje directo desde la ficha"],
    img: "/landing/studio-alumno.jpg",
    alto: 1600,
    alt: "Ficha de un alumno en Coach Studio: últimas sesiones, plan vigente y un aviso de molestia",
    foco: { x: "10%", y: "0%" },
    sigueHref: "#studio-negocio",
    sigueTexto: "¿Y las clases y las cuotas?",
  },
  {
    id: "studio-negocio",
    n: "04",
    etiqueta: "Clases y cuotas",
    titulo: "Agenda y cobros, sin otra planilla.",
    detalle: "Armás las clases de la semana con sus cupos y registrás cada pago. Sabés cuánto cobraste, cuánto falta y quién tiene la cuota pendiente.",
    puntos: ["Agenda semanal con cupos y anotados", "Cada pago queda registrado con su recibo", "Cuotas vencidas y por vencer, a la vista"],
    img: "/landing/studio-cobros.jpg",
    alto: 1600,
    alt: "Pantalla de cobros de Coach Studio: total cobrado, por cobrar, vencido y el estado de cada cuota",
    foco: { x: "10%", y: "19%" },
    sigueHref: "#faq",
    sigueTexto: "¿Te quedaron dudas?",
  },
];

const FAQ_COACHES = [
  {
    q: "¿Coach Studio tiene costo?",
    a: "Hasta 3 alumnos sin costo. Después, $1.000 por alumno al mes. Empezás gratis y SIN tarjeta.",
  },
  {
    q: "¿Puedo usar mis ejercicios y mi forma de planificar?",
    a: "Sí. Coach Studio se adapta a tu método, no al revés: armás los planes con tu criterio y tus ejercicios.",
  },
  {
    q: "¿Qué necesitan mis alumnos?",
    a: "Solo su celular. Abren la app, ven qué les toca y registran lo que hicieron, incluso sin señal.",
  },
  {
    q: "¿Puedo verlo antes de decidir?",
    a: "Sí. Escribinos y el equipo de GOZS te lo muestra funcionando con casos reales.",
  },
];

const NAV = [
  ["#studio-hoy", "Tu día"],
  ["#studio-rutinas", "Planes"],
  ["#studio-alumno", "Alumnos"],
  ["#studio-negocio", "Clases y cuotas"],
  ["#faq", "Preguntas"],
] as const;

/* Vista ilustrativa del constructor de rutinas y planes: días, ejercicios y biblioteca propia. */
const CONSTRUCTOR_DIAS = ["Día 1 · Piernas", "Día 2 · Empuje", "Día 3 · Tirón"];
const CONSTRUCTOR_EJERCICIOS = [
  { nombre: "Sentadilla", series: "4 × 6", descanso: "2:30", grupo: "" },
  { nombre: "Peso muerto rumano", series: "3 × 8", descanso: "2:00", grupo: "" },
  { nombre: "Estocadas", series: "3 × 10", descanso: "1:00", grupo: "Superserie" },
  { nombre: "Plancha", series: "3 × 40 s", descanso: "1:00", grupo: "Superserie" },
];
const CONSTRUCTOR_BIBLIOTECA = ["Sentadilla búlgara", "Hip thrust", "Prensa", "Gemelos de pie", "Puente de glúteos"];

function ConstructorEjemplo() {
  return (
    <div
      role="img"
      aria-label="Vista ilustrativa del constructor de planes: los días de la semana, los ejercicios de cada día con series y descansos, y tu biblioteca de ejercicios"
      className="aspect-[2/1] min-w-[640px] bg-zinc-50 p-4 text-zinc-900 sm:min-w-0 lg:p-5"
    >
      <div className="flex h-full flex-col gap-3" aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Nuevo plan</div>
            <div className="text-lg font-black tracking-tight lg:text-xl">Fuerza · Tren inferior</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-500">Borrador</span>
            <span className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-bold text-zinc-50">Guardar y asignar</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {CONSTRUCTOR_DIAS.map((d, i) => (
            <span key={d} className={`rounded-full px-3 py-1.5 text-xs font-bold ${i === 0 ? "bg-zinc-900 text-zinc-50" : "border border-zinc-200 bg-white text-zinc-600"}`}>
              {d}
            </span>
          ))}
          <span className="rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-500">+ Día</span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
          <ul className="col-span-8 flex flex-col gap-2">
            {CONSTRUCTOR_EJERCICIOS.map((e, i) => (
              <li
                key={e.nombre}
                className={`landing-pop flex flex-1 items-center gap-3 rounded-xl border bg-white px-3 ${e.grupo ? "border-zinc-900" : "border-zinc-200"}`}
                style={{ "--pop-delay": `${150 + i * 140}ms` } as React.CSSProperties}
              >
                <span className="grid grid-cols-2 gap-0.5">
                  {[0, 1, 2, 3, 4, 5].map((p) => (
                    <span key={p} className="size-1 rounded-full bg-zinc-300" />
                  ))}
                </span>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-[11px] font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{e.nombre}</span>
                  {e.grupo ? <span className="block font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{e.grupo}</span> : null}
                </span>
                <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs font-bold tabular-nums">{e.series}</span>
                <span className="hidden rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs tabular-nums text-zinc-600 md:block">{e.descanso}</span>
              </li>
            ))}
            <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs font-bold text-zinc-500">+ Agregar ejercicio</li>
          </ul>
          <div className="col-span-4 flex flex-col rounded-xl border border-zinc-200 bg-white p-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Tu biblioteca</div>
            <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-400">Buscar ejercicio…</div>
            <ul className="mt-2 flex flex-1 flex-col justify-between">
              {CONSTRUCTOR_BIBLIOTECA.map((b) => (
                <li key={b} className="flex items-center justify-between gap-2 border-b border-zinc-100 py-1 text-xs font-semibold last:border-0">
                  <span className="truncate">{b}</span>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-500">+</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const BIBLIOTECA_DESTACADOS = [
  { nombre: "Sentadilla Trasera con Barra", grupo: "Piernas", patron: "Rodilla dominante", series: "Barra olímpica" },
  { nombre: "Press de Banca Plano", grupo: "Empuje", patron: "Empuje horizontal", series: "Barra / Mancuernas" },
  { nombre: "Peso Muerto Rumano", grupo: "Isquios", patron: "Cadera dominante", series: "Barra olímpica" },
  { nombre: "Dominadas Pronas", grupo: "Tirón", patron: "Tracción vertical", series: "Peso corporal" },
  { nombre: "Hip Thrust con Barra", grupo: "Glúteos", patron: "Extensión de cadera", series: "Barra olímpica" },
  { nombre: "Press Militar de Pie", grupo: "Hombros", patron: "Empuje vertical", series: "Barra olímpica" },
];

function BibliotecaEjemplo() {
  return (
    <div
      role="img"
      aria-label="Vista ilustrativa del catálogo de ejercicios: biblioteca de ejercicios con nombres destacados, grupos musculares y patrones de movimiento"
      className="aspect-[2/1] min-w-[640px] bg-zinc-50 p-4 text-zinc-900 sm:min-w-0 lg:p-5"
    >
      <div className="flex h-full flex-col gap-3" aria-hidden="true">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Catálogo de ejercicios</div>
            <div className="text-lg font-black tracking-tight lg:text-xl">Biblioteca de movimientos</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
              +120 ejercicios
            </span>
            <span className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-bold text-zinc-50">+ Crear ejercicio</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {["Todos", "Piernas", "Empuje", "Tirón", "Core"].map((cat, i) => (
            <span
              key={cat}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                i === 0 ? "bg-zinc-900 text-zinc-50" : "border border-zinc-200 bg-white text-zinc-600"
              }`}
            >
              {cat}
            </span>
          ))}
          <span className="ml-auto hidden rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-400 sm:inline-block">
            Buscar ejercicio…
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3">
          {BIBLIOTECA_DESTACADOS.map((ej, i) => (
            <div
              key={ej.nombre}
              className="landing-pop flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-3 shadow-xs"
              style={{ "--pop-delay": `${100 + i * 80}ms` } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">{ej.grupo}</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-zinc-600">Video</span>
              </div>
              <div className="my-1">
                <div className="truncate text-sm font-black tracking-tight text-zinc-900">{ej.nombre}</div>
                <div className="truncate text-[11px] text-zinc-500">{ej.patron}</div>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-1.5 text-[10px] font-semibold text-zinc-600">
                <span>{ej.series}</span>
                <span className="text-zinc-900">Ver técnica →</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Marco de navegador para las pantallas del producto. */
function Ventana({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-white shadow-2xl lg:rounded-2xl ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-100 px-3 py-2" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
      </div>
      {children}
    </div>
  );
}

const VISTAS_PLANES = [
  { id: "planes", etiqueta: "Planes" },
  { id: "constructor", etiqueta: "Constructor" },
  { id: "biblioteca", etiqueta: "Biblioteca" },
] as const;

export default function EntrenadoresPage() {
  const { user } = useLandingSession();
  useScrollReveal();
  const { heroCtaRef, visible: barraVisible } = useBarraMovil("empezar");
  const [vistaPlanes, setVistaPlanes] = React.useState<(typeof VISTAS_PLANES)[number]["id"]>("planes");

  /* Quien ya usa Coach Studio entra desde el header; la página invita a conocerlo. */
  const accionCorta = (className: string, tabIndex?: number) =>
    user?.rol === "ADMIN" ? (
      <Link href="/studio" className={className} tabIndex={tabIndex}>
        <span>Ir a Coach Studio</span>
        <ArrowIcon />
      </Link>
    ) : (
      <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
        <span>Pedí tu demo</span>
        <ArrowIcon />
      </a>
    );

  return (
    <div className="landing-root flex min-h-screen flex-col overflow-x-clip bg-background text-foreground antialiased">
      <div className="landing-progress pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-foreground" aria-hidden="true" />

      <LandingHeader publico="entrenadores" user={user} accion={accionCorta(`${BTN_PRIMARY} !hidden !min-h-[40px] !px-4 !py-2 md:!inline-flex`)} />

      <main className="flex-1">
        {/* Hero: quién lo hizo, para quién, y el producto a la vista */}
        <section className="landing-section dark relative isolate flex min-h-landing-chapter flex-col overflow-hidden bg-background text-foreground" data-testid="hero-entrenadores">
          <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className={`${CONTAINER} flex flex-1 flex-col justify-between gap-8 pb-6 pt-8 sm:pb-8 sm:pt-12`}>
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
              <div className="lg:col-span-7">
                <p className={`${MICRO_LABEL} landing-rise flex items-center gap-3`}>
                  <span className="landing-dot size-2 rounded-full bg-foreground text-foreground" aria-hidden="true" />
                  <span>Coach Studio · Para entrenadores</span>
                </p>
                <h1 className="mt-5 text-[clamp(2.4rem,5.4vw,4.5rem)] font-black leading-[0.93] tracking-tighter">
                  <span className="landing-rise block" style={{ animationDelay: "80ms" }}>
                    Lo pensó un
                  </span>{" "}
                  <span className="landing-rise block" style={{ animationDelay: "170ms" }}>
                    entrenador,
                  </span>{" "}
                  <span className="landing-rise block lg:whitespace-nowrap" style={{ animationDelay: "260ms" }}>
                    <span className="text-white">para</span> entrenadores.
                  </span>
                </h1>
                <div
                  ref={heroCtaRef}
                  className="landing-rise mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center"
                  style={{ animationDelay: "440ms" }}
                  data-testid="hero-cta"
                >
                  <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={`${BTN_PRIMARY} ${BTN_XL}`}>
                    <span>Pedí tu demo</span>
                    <ArrowIcon className="size-5" />
                  </a>
                  <a href="#studio-hoy" className={`${BTN_GHOST} ${BTN_XL} bg-background/40`}>
                    Verlo por dentro
                  </a>
                </div>
                <p className="landing-rise mt-3 text-xs text-muted-foreground sm:mt-4 sm:text-sm" style={{ animationDelay: "520ms" }}>
                  El equipo de GOZS te lo muestra funcionando, con casos reales. Gratis, sin tarjeta.
                </p>
              </div>

              <figure className="landing-media landing-rise relative hidden sm:block lg:col-span-5" style={{ animationDelay: "500ms" }}>
                <Tilt className="lg:-mr-[62%]" max={6}>
                  <Ventana>
                    <img
                      src="/landing/studio-inicio.jpg"
                      alt="Pantalla de inicio de Coach Studio: avisos para revisar hoy, clases del día y lista de alumnos"
                      width={2560}
                      height={1600}
                      className="h-auto w-full"
                    />
                  </Ventana>
                </Tilt>
              </figure>
            </div>

            <div className="border-t border-border pt-4 sm:pt-6">
              <dl className="grid grid-cols-3 gap-4 sm:max-w-2xl sm:gap-10">
                {[
                  ["$1.000", "por alumno"],
                  ["SIN", "tarjeta para empezar"],
                  ["100%", "gestión centralizada"],
                ].map(([valor, texto]) => (
                  <div key={texto}>
                    <dd className="text-2xl font-black tracking-tighter sm:text-4xl">{valor}</dd>
                    <dt className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">{texto}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* Lo que el entrenador deja atrás, tachado */}
          <Tachados items={DOLORES_COACH} intro="Lo que dejás atrás" testid="dolores-entrenador" />
        </section>

        {/* 01 a 04 · Coach Studio por dentro, una pantalla por capítulo */}
        {STUDIO_PANTALLAS.map((pantalla, i) => {
          const conConstructor = pantalla.id === "studio-rutinas";
          return (
            <section key={pantalla.id} id={pantalla.id} className={`${SECCION} overflow-hidden ${i % 2 === 0 ? "bg-secondary/40" : ""}`} data-testid="studio-pantalla">
              <div className={CUERPO}>
                <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12 lg:gap-10">
                  <div className="lg:col-span-4">
                    <Capitulo n={pantalla.n}>{pantalla.etiqueta}</Capitulo>
                    <h2 className="text-balance text-[clamp(1.9rem,3.6vw,3rem)] font-black leading-[1] tracking-tighter" data-reveal>
                      {pantalla.titulo}
                    </h2>
                    <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground" data-reveal>
                      {pantalla.detalle}
                    </p>
                    <ul className="mt-5 hidden space-y-2.5 sm:block">
                      {pantalla.puntos.map((punto, k) => (
                        <li key={punto} className="flex items-start gap-3 text-sm font-semibold sm:text-base" data-reveal style={{ "--reveal-delay": `${k * 80}ms` } as React.CSSProperties}>
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                            <CheckIcon className="size-3" />
                          </span>
                          <span>{punto}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <figure className="landing-media lg:col-span-8" data-reveal>
                    {conConstructor ? (
                      <div className="mb-3 inline-flex rounded-full border border-border bg-secondary/60 p-1" role="tablist" aria-label="Vistas de planes" data-testid="vistas-rutinas">
                        {VISTAS_PLANES.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            role="tab"
                            aria-selected={vistaPlanes === v.id}
                            onClick={() => setVistaPlanes(v.id)}
                            className={`min-h-target-lg rounded-full px-5 text-sm font-bold transition-colors duration-150 ${FOCUS_RING} ${
                              vistaPlanes === v.id ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {v.etiqueta}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {pantalla.imgMovil ? (
                      <div className="mx-auto w-full max-w-[230px] rounded-[2.2rem] border border-foreground/20 bg-foreground p-2 shadow-2xl sm:hidden">
                        <img
                          src={pantalla.imgMovil}
                          alt={pantalla.alt}
                          width={780}
                          height={1600}
                          loading="lazy"
                          className="max-h-[330px] w-full rounded-[1.7rem] object-cover object-top"
                        />
                      </div>
                    ) : null}
                    <Tilt className={`lg:-mr-[14%] ${pantalla.imgMovil ? "hidden sm:block" : ""}`} max={3}>
                      <Ventana>
                        <div
                          className={`${
                            pantalla.foco ? "max-h-[260px]" : "max-h-[220px]"
                          } overflow-hidden sm:max-h-none ${conConstructor && vistaPlanes !== "planes" ? "hidden" : ""}`}
                        >
                          <img
                            src={pantalla.img}
                            alt={pantalla.alt}
                            width={2560}
                            height={pantalla.alto}
                            loading="lazy"
                            style={
                              pantalla.foco
                                ? ({
                                    "--shot-x": pantalla.foco.x,
                                    "--shot-y": pantalla.foco.y,
                                  } as React.CSSProperties)
                                : undefined
                            }
                            className={
                              pantalla.foco
                                ? "-ml-[var(--shot-x)] -mt-[var(--shot-y)] h-auto w-[240%] max-w-none sm:m-0 sm:w-full"
                                : "h-auto w-[165%] max-w-none sm:w-full"
                            }
                          />
                        </div>
                        {conConstructor ? (
                          <>
                            <div className={`max-h-[220px] overflow-hidden sm:max-h-none ${vistaPlanes === "constructor" ? "" : "hidden"}`} data-testid="vista-constructor">
                              <ConstructorEjemplo />
                            </div>
                            <div className={`max-h-[220px] overflow-hidden sm:max-h-none ${vistaPlanes === "biblioteca" ? "" : "hidden"}`} data-testid="vista-biblioteca">
                              <BibliotecaEjemplo />
                            </div>
                          </>
                        ) : null}
                      </Ventana>
                    </Tilt>
                    <figcaption className="mt-3 text-xs text-muted-foreground">
                      {conConstructor && vistaPlanes === "constructor"
                        ? "Vista ilustrativa del constructor de planes."
                        : conConstructor && vistaPlanes === "biblioteca"
                        ? "Vista ilustrativa de la biblioteca de ejercicios."
                        : "Pantalla de Coach Studio con datos de ejemplo."}
                    </figcaption>
                  </figure>
                </div>
              </div>
              <Siguiente href={pantalla.sigueHref}>{pantalla.sigueTexto}</Siguiente>
            </section>
          );
        })}

        {/* 05 · Preguntas frecuentes */}
        <section id="faq" className={SECCION} data-testid="seccion-faq">
          <div className={CUERPO}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-5">
                <Capitulo n="05">Preguntas frecuentes</Capitulo>
                <h2 className={H2} data-reveal>
                  Antes de sumar a tus alumnos.
                </h2>
                <p className={`${LEAD} mt-4 hidden max-w-md sm:block`} data-reveal>
                  ¿No está tu duda? Escribinos: el equipo de GOZS te lo muestra funcionando.
                </p>
              </div>
              <div className="lg:col-span-7">
                <Preguntas titulo="Si sos entrenador" items={FAQ_COACHES} />
              </div>
            </div>
          </div>
          <Siguiente href="#empezar">Listo. Coordiná tu demo</Siguiente>
        </section>

        {/* Cierre: coordinar una demo con el equipo de GOZS */}
        <section id="empezar" className={`${SECCION} dark overflow-hidden bg-background text-foreground`} data-testid="cierre-entrenadores">
          <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className={CUERPO}>
            <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-10">
              <div className="md:col-span-8">
                <h2 className="max-w-3xl text-balance text-[clamp(2.2rem,5.6vw,4.75rem)] font-black leading-[0.95] tracking-tighter" data-reveal>
                  Tu método no entra en una app <span className="landing-tachar text-muted-foreground">genérica</span>.
                </h2>
                <p className={`${LEAD} mt-4 max-w-xl`} data-reveal>
                  Coach Studio se adapta a cómo trabajás vos. El equipo de GOZS te lo muestra funcionando, en la compu y en el celular, y resolvés tus dudas con entrenadores que lo usan todos los días.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" data-reveal>
                  <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={`${BTN_PRIMARY} ${BTN_XL}`}>
                    <span>Pedí tu demo</span>
                    <ArrowIcon className="size-5" />
                  </a>
                </div>
                <p className="mt-3 text-sm text-muted-foreground" data-reveal>
                  Por WhatsApp, sin compromiso. Gratis, sin tarjeta.
                </p>
              </div>
              <figure className="hidden md:col-span-4 md:block" data-reveal>
                <div className="landing-float mx-auto w-full max-w-[250px] rounded-[2.2rem] border border-border bg-background p-2 shadow-2xl">
                  <img
                    src="/landing/studio-movil.jpg"
                    alt="Coach Studio en el celular: resumen del día, avisos para revisar y clases de hoy"
                    width={780}
                    height={1600}
                    loading="lazy"
                    className="h-auto w-full rounded-[1.7rem]"
                  />
                </div>
                <figcaption className="mt-3 text-center text-xs text-muted-foreground">Pantalla de Coach Studio con datos de ejemplo.</figcaption>
              </figure>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter nav={NAV} />

      <BarraMovil visible={barraVisible}>
        {accionCorta(`${BTN_PRIMARY} flex-1 !px-4`, barraVisible ? 0 : -1)}
        <a href="#studio-hoy" className={`${BTN_GHOST} !px-4`} tabIndex={barraVisible ? 0 : -1}>
          Verlo
        </a>
      </BarraMovil>
    </div>
  );
}
