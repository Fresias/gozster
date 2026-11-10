"use client";

import * as React from "react";
import Link from "next/link";
import { useLandingSession } from "@/lib/use-landing-session";
import {
  ArrowIcon,
  BarraMovil,
  BTN_GHOST,
  BTN_PRIMARY,
  Capitulo,
  CheckIcon,
  CONTAINER,
  CUERPO,
  FOCUS_RING,
  H2,
  LandingFooter,
  LandingHeader,
  LEAD,
  MICRO_LABEL,
  Preguntas,
  SECCION,
  Siguiente,
  useBarraMovil,
  useScrollReveal,
  WHATSAPP_COACH,
} from "@/components/landing/kit";

/* Lo que el entrenador deja atrás (mismo recurso del tachado que usa el hero). */
const DOLORES_COACH = [
  "Planillas que solo vos entendés",
  "Rutinas por PDF y audios de WhatsApp",
  "Enterarte tarde de quién dejó de entrenar",
  "Perseguir cuotas por chat",
];

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
    alto: 1600,
    alt: "Pantalla de inicio de Coach Studio: avisos para revisar hoy, clases del día y lista de alumnos",
    sigueHref: "#studio-rutinas",
    sigueTexto: "Ahora, armá una rutina",
  },
  {
    id: "studio-rutinas",
    n: "02",
    etiqueta: "Tus rutinas",
    titulo: "Armás la rutina como vos la pensás.",
    detalle: "Tus ejercicios, tus días, tu criterio. Guardás plantillas para reutilizar y adaptás cada rutina al alumno que tenés adelante.",
    puntos: ["Plantillas propias y rutinas por alumno", "Aviso cuando una rutina está por vencer", "Cambiás un ejercicio sin rehacer todo"],
    img: "/landing/studio-rutinas.jpg",
    alto: 1280,
    alt: "Biblioteca de rutinas de Coach Studio con las rutinas asignadas a cada alumno",
    sigueHref: "#studio-alumno",
    sigueTexto: "Mirá la ficha de un alumno",
  },
  {
    id: "studio-alumno",
    n: "03",
    etiqueta: "Cada alumno",
    titulo: "La historia completa de cada alumno.",
    detalle: "Lo que entrenó, sus mejores marcas, la rutina vigente y cualquier molestia que haya avisado. Decidís con información, no de memoria.",
    puntos: ["Últimas sesiones y récords", "Molestias con tu nota de seguimiento", "Mensaje directo desde la ficha"],
    img: "/landing/studio-alumno.jpg",
    alto: 1600,
    alt: "Ficha de un alumno en Coach Studio: últimas sesiones, rutina vigente y un aviso de molestia",
    sigueHref: "#studio-negocio",
    sigueTexto: "¿Y las clases y las cuotas?",
  },
  {
    id: "studio-negocio",
    n: "04",
    etiqueta: "Clases y cuotas",
    titulo: "Agenda y cobros, sin otra planilla.",
    detalle: "Armás las clases de la semana con sus cupos y registrás cada pago. Sabés cuánto cobraste, cuánto falta y quién está vencido.",
    puntos: ["Agenda semanal con cupos y anotados", "Cada pago queda registrado con su recibo", "Cuotas vencidas y por vencer, a la vista"],
    img: "/landing/studio-cobros.jpg",
    alto: 1600,
    alt: "Pantalla de cobros de Coach Studio: total cobrado, por cobrar, vencido y el estado de cada cuota",
    sigueHref: "#faq",
    sigueTexto: "¿Te quedaron dudas?",
  },
];

const FAQ_COACHES = [
  {
    q: "¿Coach Studio tiene costo?",
    a: "Hoy podés ingresar gratis y sin tarjeta. No se cobra por alumno.",
  },
  {
    q: "¿Puedo usar mis ejercicios y mi forma de planificar?",
    a: "Sí. Coach Studio se adapta a tu método, no al revés: armás las rutinas con tu criterio y tus ejercicios.",
  },
  {
    q: "¿Qué necesitan mis alumnos?",
    a: "Solo su celular. Abren la app, ven qué les toca y registran lo que hicieron, incluso sin señal.",
  },
  {
    q: "¿Puedo verlo antes de decidir?",
    a: "Sí. Escribile a Gonzalo y te lo muestra funcionando con casos reales.",
  },
];

const NAV = [
  ["#studio-hoy", "Tu día"],
  ["#studio-rutinas", "Rutinas"],
  ["#studio-alumno", "Alumnos"],
  ["#studio-negocio", "Clases y cuotas"],
  ["#faq", "Preguntas"],
] as const;

export default function EntrenadoresPage() {
  const { user } = useLandingSession();
  useScrollReveal();
  const { heroCtaRef, visible: barraVisible } = useBarraMovil();

  /* Acción principal de la página: entrar a Coach Studio. */
  const ingresar = user?.rol === "ADMIN" ? "Ingresar al Panel de Administrador" : "Ingresar a Coach Studio";

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground antialiased selection:bg-primary/20">
      <div className="landing-progress pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-foreground" aria-hidden="true" />

      <LandingHeader
        publico="entrenadores"
        nav={NAV}
        user={user}
        accion={
          <Link href="/studio" className={`${BTN_PRIMARY} !hidden !min-h-[40px] !px-4 !py-2 md:!inline-flex`}>
            <span>Ingresar</span>
            <ArrowIcon />
          </Link>
        }
      />

      <main className="flex-1">
        {/* Hero: el dolor del entrenador y la promesa */}
        <section className="landing-section dark relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden bg-background text-foreground" data-testid="hero-entrenadores">
          <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className={`${CONTAINER} flex flex-1 flex-col justify-between gap-8 pb-6 pt-8 sm:pb-8 sm:pt-14`}>
            <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-10 lg:gap-16">
              <div className="md:col-span-7">
                <p className={`${MICRO_LABEL} landing-rise flex items-center gap-3`}>
                  <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                  <span>Coach Studio · Para entrenadores</span>
                </p>
                <h1 className="landing-rise mt-5 text-balance text-[clamp(2.5rem,6.2vw,5.25rem)] font-black leading-[0.93] tracking-tighter" style={{ animationDelay: "80ms" }}>
                  Tu método no entra en una app genérica.
                </h1>
                <p className="landing-rise mt-5 max-w-xl text-pretty text-base leading-relaxed text-foreground/85 sm:mt-7 sm:text-xl" style={{ animationDelay: "200ms" }}>
                  Las apps de siempre te obligan a trabajar a su manera. Coach Studio nació de ese cansancio: lo pensó un entrenador, para entrenadores.
                </p>
                <div
                  ref={heroCtaRef}
                  className="landing-rise mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center"
                  style={{ animationDelay: "320ms" }}
                  data-testid="hero-cta"
                >
                  <Link href="/studio" className={`${BTN_PRIMARY} !px-8 !py-4 text-base`}>
                    <span>{ingresar}</span>
                    <ArrowIcon />
                  </Link>
                  <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={`${BTN_GHOST} !hidden bg-background/40 !px-8 !py-4 text-base sm:!inline-flex`}>
                    Hablar con Gonzalo
                  </a>
                </div>
                <p className="landing-rise mt-3 text-xs text-muted-foreground sm:mt-4 sm:text-sm" style={{ animationDelay: "400ms" }}>
                  Gratis, sin tarjeta.
                </p>
              </div>

              <div className="landing-rise md:col-span-5" style={{ animationDelay: "440ms" }} data-testid="dolores-entrenador">
                <p className={`${MICRO_LABEL} mb-3`}>Lo que dejás atrás</p>
                <ul className="border-t border-border">
                  {DOLORES_COACH.map((d) => (
                    <li key={d} className="border-b border-border py-2.5 text-base font-bold leading-snug tracking-tight text-muted-foreground line-through decoration-2 sm:py-4 sm:text-2xl">
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col gap-5 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between sm:pt-6">
              <dl className="grid grid-cols-3 gap-4 sm:max-w-2xl sm:gap-10">
                {[
                  ["$0", "por alumno"],
                  ["Sin", "tarjeta para empezar"],
                  ["Sin señal", "tus alumnos entrenan igual"],
                ].map(([valor, texto]) => (
                  <div key={texto}>
                    <dd className="text-2xl font-black tracking-tighter sm:text-4xl">{valor}</dd>
                    <dt className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">{texto}</dt>
                  </div>
                ))}
              </dl>
              <a href="#studio-hoy" className={`group hidden min-h-[48px] items-center gap-3 rounded-full text-sm font-bold sm:inline-flex ${FOCUS_RING}`} data-siguiente>
                <span className="flex size-10 items-center justify-center rounded-full border border-border transition-colors group-hover:bg-foreground group-hover:text-background">
                  <ArrowIcon className="landing-nudge size-4 rotate-90" />
                </span>
                <span className="underline-offset-4 group-hover:underline">Mirá Coach Studio por dentro</span>
              </a>
            </div>
          </div>
        </section>

        {/* 01 a 04 · Coach Studio por dentro, una pantalla por capítulo */}
        {STUDIO_PANTALLAS.map((pantalla, i) => (
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
                    {pantalla.puntos.map((punto) => (
                      <li key={punto} className="flex items-start gap-3 text-sm font-semibold sm:text-base" data-reveal>
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                          <CheckIcon className="size-3" />
                        </span>
                        <span>{punto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <figure className="lg:col-span-8" data-reveal>
                  <div className="overflow-hidden rounded-xl border border-border bg-white shadow-2xl lg:-mr-[14%] lg:rounded-2xl">
                    <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-100 px-3 py-2" aria-hidden="true">
                      <span className="size-2.5 rounded-full bg-zinc-300" />
                      <span className="size-2.5 rounded-full bg-zinc-300" />
                      <span className="size-2.5 rounded-full bg-zinc-300" />
                    </div>
                    <div className="max-h-[220px] overflow-hidden sm:max-h-none">
                      <img src={pantalla.img} alt={pantalla.alt} width={2560} height={pantalla.alto} loading="lazy" className="h-auto w-[165%] max-w-none sm:w-full" />
                    </div>
                  </div>
                  <figcaption className="mt-3 text-xs text-muted-foreground">Pantalla de Coach Studio con datos de ejemplo.</figcaption>
                </figure>
              </div>
            </div>
            <Siguiente href={pantalla.sigueHref}>{pantalla.sigueTexto}</Siguiente>
          </section>
        ))}

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
                  ¿No está tu duda? Escribile a Gonzalo: te lo muestra funcionando.
                </p>
              </div>
              <div className="lg:col-span-7">
                <Preguntas titulo="Si sos entrenador" items={FAQ_COACHES} />
              </div>
            </div>
          </div>
          <Siguiente href="#empezar">Listo. Empezá hoy</Siguiente>
        </section>

        {/* Cierre: empezar con Coach Studio */}
        <section id="empezar" className={`${SECCION} dark overflow-hidden bg-background text-foreground`} data-testid="cierre-entrenadores">
          <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className={CUERPO}>
            <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-10">
              <div className="md:col-span-8">
                <h2 className="max-w-3xl text-balance text-[clamp(2.2rem,5.6vw,4.75rem)] font-black leading-[0.95] tracking-tighter" data-reveal>
                  Lo pensó un entrenador, para entrenadores.
                </h2>
                <p className={`${LEAD} mt-4 max-w-xl`} data-reveal>
                  Gonzalo Salas lo usa todos los días con sus alumnos. En la compu cuando planifica, en el celular entre clase y clase.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" data-reveal>
                  <Link href="/studio" className={`${BTN_PRIMARY} !px-8 !py-4 text-base`}>
                    <span>{ingresar}</span>
                    <ArrowIcon />
                  </Link>
                  <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={`${BTN_GHOST} !px-8 !py-4 text-base`}>
                    Que Gonzalo te lo muestre
                  </a>
                </div>
                <p className="mt-3 text-sm text-muted-foreground" data-reveal>
                  Gratis, sin tarjeta.
                </p>
                <p className="mt-8 border-t border-border pt-5 text-sm text-muted-foreground" data-reveal>
                  ¿Buscabas entrenar con Gonzalo?{" "}
                  <Link href="/" className={`font-bold text-foreground underline underline-offset-4 ${FOCUS_RING}`}>
                    Ir a la página para alumnos
                  </Link>
                </p>
              </div>
              <figure className="hidden md:col-span-4 md:block" data-reveal>
                <div className="mx-auto w-full max-w-[250px] rounded-[2.2rem] border border-zinc-700 bg-zinc-950 p-2 shadow-2xl">
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
        <Link href="/studio" className={`${BTN_PRIMARY} flex-1 !px-4`} tabIndex={barraVisible ? 0 : -1}>
          <span>Ingresar a Coach Studio</span>
          <ArrowIcon />
        </Link>
        <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={`${BTN_GHOST} !px-4`} tabIndex={barraVisible ? 0 : -1}>
          Consultar
        </a>
      </BarraMovil>
    </div>
  );
}
