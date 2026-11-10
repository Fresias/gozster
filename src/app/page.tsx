"use client";

import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LandingSessionCapsule } from "@/components/landing-session-capsule";
import { useLandingSession } from "@/lib/use-landing-session";

/* Configuración única de contacto: cambiar acá el número de WhatsApp. */
const WHATSAPP_NUMERO = "541162752515";
const whatsapp = (mensaje: string) => `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
const WHATSAPP_ALUMNO = whatsapp("Hola Gonza, quiero empezar a entrenar con vos. ¿Me contás cómo trabajás?");
const WHATSAPP_COACH = whatsapp("Hola Gonza, soy entrenador y quiero conocer Coach Studio.");
const FOTO_GONZALO = "/landing/gonzalo-salas.jpg";

/* Recetas visuales compartidas con Coach Studio (tokens zinc, borde 1px, micro-etiquetas mono). */
const MICRO_LABEL = "font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const BTN =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-all duration-150 active:scale-[0.98] " +
  FOCUS_RING;
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:opacity-90`;
const BTN_GHOST = `${BTN} border border-border bg-transparent text-foreground hover:bg-secondary`;
const CONTAINER = "mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12";
/* Cada capítulo ocupa, como mínimo, un viewport (descontando el header fijo). */
const SECCION = "landing-section relative isolate flex min-h-[calc(100svh-4rem)] scroll-mt-16 flex-col border-t border-border pb-24 pt-8 sm:py-14";
const CUERPO = `${CONTAINER} flex flex-1 flex-col justify-center`;
const H2 = "text-balance text-[clamp(2rem,4.6vw,3.75rem)] font-black leading-[0.98] tracking-tighter text-foreground";
/* En móvil, los grupos de tres se recorren deslizando: el capítulo sigue entrando en una pantalla. */
const FILA =
  "-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden";
const FILA_ITEM = "w-[82%] shrink-0 snap-start md:w-auto";
const LEAD = "text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg";

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

/* Etiqueta de capítulo: numera el relato y da ritmo a la lectura. */
function Capitulo({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className={`${MICRO_LABEL} mb-3 flex items-center gap-3 sm:mb-5`} data-reveal>
      <span className="tabular-nums text-foreground">{n}</span>
      <span className="h-px w-10 bg-border" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/* Cierre de cada capítulo: una pregunta o promesa que invita a seguir bajando. */
function Siguiente({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className={`${CONTAINER} mt-6 sm:mt-10`}>
      <a href={href} className={`group inline-flex min-h-[48px] items-center gap-3 rounded-full text-sm font-bold text-foreground ${FOCUS_RING}`} data-siguiente>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border transition-colors duration-150 group-hover:bg-foreground group-hover:text-background">
          <ArrowIcon className="landing-nudge size-4 rotate-90" />
        </span>
        <span className="underline-offset-4 group-hover:underline">{children}</span>
      </a>
    </div>
  );
}

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
    evidencia: "Primero moverte bien. Después, sumar de a poco.",
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
    detalle: "Gonzalo te escucha: qué querés lograr, qué hiciste hasta ahora y si algo te molesta.",
  },
  {
    n: "2",
    titulo: "Recibís tu plan",
    detalle: "Hecho para vos, en tu celular. Abrís la app y sabés exactamente qué te toca hoy.",
  },
  {
    n: "3",
    titulo: "Te acompaña",
    detalle: "Ve lo que hiciste, te corrige y ajusta el plan cuando hace falta. No entrenás solo.",
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
    descripcion: "Fuerza y movimiento para la vida real: sentirte ágil, fuerte y sin dolores.",
    cta: "Consultar por Funcional",
  },
  {
    nombre: "Boxeo",
    badge: "Presencial",
    foto: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?q=80&w=800&auto=format&fit=crop",
    alt: "Guantes de boxeo junto a una bolsa de entrenamiento",
    descripcion: "Aprendé los fundamentos del boxeo mientras mejorás tu resistencia, tu coordinación y bajás el estrés.",
    cta: "Consultar por Boxeo",
  },
  {
    nombre: "Rutinas online",
    badge: "Desde donde estés",
    foto: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800&auto=format&fit=crop",
    alt: "Sala de gimnasio con mancuernas y máquinas",
    descripcion: "Tu plan en el celular y Gonzalo siguiendo tu progreso, entrenes donde entrenes.",
    cta: "Consultar por Rutinas online",
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

const DOLORES_COACH = [
  {
    titulo: "Armás la rutina como vos la pensás",
    detalle: "Sin plantillas rígidas. Tu forma de planificar, tus ejercicios, tu criterio.",
  },
  {
    titulo: "Sabés quién te necesita hoy",
    detalle: "De un vistazo: quién viene al día, quién se está quedando y quién espera su plan.",
  },
  {
    titulo: "Tus alumnos entrenan aunque no haya señal",
    detalle: "En el subsuelo del gimnasio la app sigue andando y se pone al día sola.",
  },
  {
    titulo: "Sin costo por alumno",
    detalle: "Que crezca tu cartera de alumnos, no tu factura.",
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

/* Preguntas frecuentes: versión genérica, a validar con Gonzalo. */
const FAQ_ALUMNOS = [
  {
    q: "¿Necesito experiencia para empezar?",
    a: "No. El plan arranca desde tu nivel de hoy, sea tu primera vez o vuelvas después de años.",
  },
  {
    q: "¿Cómo es el primer paso?",
    a: "Le escribís a Gonzalo por WhatsApp. Te pregunta qué querés lograr, qué hiciste hasta ahora y si algo te molesta. Sin compromiso.",
  },
  {
    q: "¿Qué diferencia hay entre presencial y online?",
    a: "Presencial entrenás en grupo con Gonzalo: funcional o boxeo. Online recibís tu plan en la app y él sigue tu progreso a distancia. También se pueden coordinar clases personalizadas.",
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
  ["#metodo", "El método"],
  ["#alumnos", "Para alumnos"],
  ["#entrenadores", "Para entrenadores"],
  ["#gonzalo", "Gonzalo"],
  ["#faq", "Preguntas"],
] as const;

/* Revela cada bloque al entrar en pantalla. Sin JS o con movimiento reducido, todo queda visible. */
function useScrollReveal() {
  React.useEffect(() => {
    /* Scroll suave y anclaje por capítulo, solo mientras la home está montada. */
    document.documentElement.classList.add("landing-scroll");
    const limpiarScroll = () => document.documentElement.classList.remove("landing-scroll");

    if (typeof IntersectionObserver === "undefined") return limpiarScroll;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return limpiarScroll;

    const elementos = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove("reveal-pending");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    for (const el of elementos) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) continue;
      el.classList.add("reveal-pending");
      observer.observe(el);
    }

    return () => {
      limpiarScroll();
      observer.disconnect();
      for (const el of elementos) el.classList.remove("reveal-pending");
    };
  }, []);
}

/* Ejemplo ilustrativo de la app del alumno: qué toca hoy y cuánto avanzó. */
function TelefonoEjemplo() {
  const ejercicios = [
    { nombre: "Sentadilla", estado: "Listo", hecho: true },
    { nombre: "Peso muerto", estado: "Listo", hecho: true },
    { nombre: "Estocadas", estado: "Vas 2 de 3", hecho: false },
  ];
  return (
    <div
      role="img"
      aria-label="Ejemplo ilustrativo de la app: la rutina de hoy con los ejercicios hechos y el avance respecto de la semana pasada"
      className="dark mx-auto w-full max-w-[290px] rounded-[2.4rem] border border-zinc-700 bg-zinc-950 p-2.5 shadow-2xl"
    >
      <div className="rounded-[1.9rem] bg-background p-5 text-foreground" aria-hidden="true">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-secondary" />
        <div className={MICRO_LABEL}>Hoy · Miércoles</div>
        <div className="mt-1 text-2xl font-black tracking-tight">Piernas</div>
        <div className="text-sm text-muted-foreground">Día 2 de tu semana</div>

        <ul className="mt-4 hidden space-y-2 sm:block">
          {ejercicios.map((e) => (
            <li key={e.nombre} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/70 px-3.5 py-2.5">
              <span className="flex items-center gap-2.5">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                    e.hecho ? "bg-success text-success-foreground" : "border border-muted-foreground/50"
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

        <div className="mt-3 rounded-xl border border-border p-3.5">
          <div className="text-xs text-muted-foreground">Sentadilla · tu avance</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-sm text-muted-foreground line-through">60 kg</span>
            <ArrowIcon className="size-3.5 text-muted-foreground" />
            <span className="font-mono tabular-nums text-2xl font-black">62,5 kg</span>
          </div>
          <div className="mt-1 text-xs font-semibold text-success">Más que la semana pasada</div>
        </div>
      </div>
    </div>
  );
}

/* Ejemplo ilustrativo de Coach Studio: quién necesita atención hoy. */
function StudioEjemplo() {
  const alumnos = [
    { inicial: "L", nombre: "Lucía", nota: "Entrenó ayer", estado: "Al día", tono: "border-success-soft-border bg-success-soft text-success-soft-foreground" },
    { inicial: "M", nombre: "Martín", nota: "Entrenó hoy", estado: "Al día", tono: "border-success-soft-border bg-success-soft text-success-soft-foreground" },
    { inicial: "S", nombre: "Sofía", nota: "Hace 9 días que no entrena", estado: "Escribile", tono: "border-warning-soft-border bg-warning-soft text-warning-soft-foreground" },
    { inicial: "D", nombre: "Diego", nota: "Terminó su plan", estado: "Espera plan", tono: "border-danger-soft-border bg-danger-soft text-danger-soft-foreground" },
  ];
  return (
    <div
      role="img"
      aria-label="Ejemplo ilustrativo de Coach Studio: lista de alumnos que muestra quién viene al día, a quién conviene escribirle y quién espera un plan nuevo"
      className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="size-2.5 rounded-full bg-surface-container-high" />
          <span className="size-2.5 rounded-full bg-surface-container-high" />
          <span className="size-2.5 rounded-full bg-surface-container-high" />
          <span className={`${MICRO_LABEL} ml-3`}>Coach Studio · Hoy</span>
        </div>
        <div className="p-4 sm:p-5">
          <div className="text-lg font-black tracking-tight sm:text-xl">¿Quién te necesita hoy?</div>
          <ul className="mt-3 divide-y divide-border">
            {alumnos.map((a) => (
              <li key={a.nombre} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">{a.inicial}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.nota}</span>
                  </span>
                </span>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${a.tono}`}>{a.estado}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Preguntas({ titulo, items }: { titulo: string; items: { q: string; a: string }[] }) {
  return (
    <div data-reveal>
      <h3 className={`${MICRO_LABEL} mb-2`}>{titulo}</h3>
      <div className="border-t border-border">
        {items.map((item) => (
          <details key={item.q} className="group border-b border-border">
            <summary className={`flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-4 py-2 text-[15px] font-bold leading-snug sm:py-3 sm:text-base tracking-tight [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}>
              <span>{item.q}</span>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-sm transition-transform duration-150 group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="pb-4 pr-10 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useLandingSession();
  useScrollReveal();

  /* Acción principal: una sola por visitante, la misma en hero, header, barra móvil y cierre. */
  const principal =
    user?.rol === "ADMIN"
      ? { corto: "Ir a Coach Studio", largo: "Ingresar al Panel de Administrador", href: "/studio", externo: false }
      : user?.rol === "ALUMNO"
        ? { corto: "Abrir mi rutina", largo: "Abrir mi rutina", href: "/athlete", externo: false }
        : { corto: "Quiero entrenar", largo: "Quiero entrenar con Gonzalo", href: WHATSAPP_ALUMNO, externo: true };

  /* Cierre: tres caminos; las etiquetas se adaptan a la sesión activa. */
  const caminos = [
    {
      n: "01",
      kicker: "Quiero entrenar",
      titulo: "Entrenar con Gonzalo",
      detalle: "Funcional, boxeo o tu rutina online.",
      accion: user?.rol === "ALUMNO" ? "Consultar con Gonzalo" : "Quiero entrenar con Gonzalo",
      href: WHATSAPP_ALUMNO,
      externo: true,
    },
    {
      n: "02",
      kicker: "Soy entrenador",
      titulo: "Coach Studio",
      detalle: "Tu método, tus alumnos, un solo lugar.",
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
      kicker: "Ya entreno con Gonzalo",
      titulo: "Athlete App",
      detalle: "Tu rutina de hoy, en el celular.",
      accion: "Abrir mi rutina",
      href: "/athlete",
      externo: false,
    },
  ];
  const destacado = user?.rol === "ADMIN" ? "02" : user?.rol === "ALUMNO" ? "03" : "01";

  /* Barra de acción móvil: aparece cuando los botones del hero salen de pantalla. */
  const heroCtaRef = React.useRef<HTMLDivElement>(null);
  const [barraVisible, setBarraVisible] = React.useState(false);
  React.useEffect(() => {
    const el = heroCtaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setBarraVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const enlacePrincipal = (className: string, etiqueta: string, tabIndex?: number) =>
    principal.externo ? (
      <a href={principal.href} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
        <span>{etiqueta}</span>
        <ArrowIcon />
      </a>
    ) : (
      <Link href={principal.href} className={className} tabIndex={tabIndex}>
        <span>{etiqueta}</span>
        <ArrowIcon />
      </Link>
    );

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground antialiased selection:bg-primary/20">
      {/* Progreso de lectura del relato */}
      <div className="landing-progress pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 bg-foreground" aria-hidden="true" />

      {/* Header fijo */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className={`${CONTAINER} flex h-16 items-center justify-between gap-3`}>
          <div className="flex items-center gap-8">
            <Link href="/" className={`flex items-center gap-2.5 rounded-lg ${FOCUS_RING}`} aria-label="Inicio GOZSter">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-base font-black text-primary-foreground">G</span>
              <span className="text-lg font-black tracking-tight">GOZSter</span>
            </Link>
            <nav className="hidden items-center gap-6 lg:flex" aria-label="Navegación principal">
              {NAV.map(([href, label]) => (
                <a key={href} href={href} className={`rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}>
                  {label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <LandingSessionCapsule
              initialUser={
                user
                  ? { email: user.email, nombre: `${user.displayName} (${user.rol === "ADMIN" ? "Admin" : "Atleta"})` }
                  : null
              }
            />
            {enlacePrincipal(`${BTN_PRIMARY} !hidden !min-h-[40px] !px-4 !py-2 md:!inline-flex`, principal.corto)}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: la promesa, en una frase, y quién la sostiene */}
        <section
          className="landing-section dark relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden bg-background text-foreground"
          data-testid="hero-impacto"
        >
          <div className="hero-grid pointer-events-none absolute inset-0 -z-20" aria-hidden="true" />
          {/* Retrato de Gonzalo: presencia humana en el primer pantallazo (desktop) */}
          <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full opacity-35 lg:w-[46%] lg:opacity-100" aria-hidden="true">
            <img src={FOTO_GONZALO} alt="" className="size-full object-cover object-top grayscale contrast-125" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>

          <div className={`${CONTAINER} flex flex-1 flex-col justify-between gap-6 pb-6 pt-8 sm:gap-10 sm:pb-8 sm:pt-16`}>
            <div>
              <p className={`${MICRO_LABEL} landing-rise flex items-center gap-3`}>
                <span className="size-2 rounded-full bg-success" aria-hidden="true" />
                <span>Gonzalo Salas · Head Coach</span>
              </p>

              <h1 className="mt-4 max-w-4xl sm:mt-6 text-[clamp(2.6rem,6.6vw,5.25rem)] font-black leading-[0.92] tracking-tighter">
                <span className="landing-rise block" style={{ animationDelay: "80ms" }}>
                  Entrenamiento basado en evidencia,
                </span>
                <span className="landing-rise block text-muted-foreground" style={{ animationDelay: "200ms" }}>
                  no en <span className="landing-strike">tendencias</span>.
                </span>
              </h1>

              <p className="landing-rise mt-5 max-w-xl text-pretty text-base leading-relaxed sm:mt-7 sm:text-lg text-foreground/85 sm:text-xl" style={{ animationDelay: "320ms" }}>
                Dejá de adivinar en el gimnasio. Un plan hecho para vos, alguien que te mira entrenar y un progreso que se nota semana a semana.
              </p>

              <div
                ref={heroCtaRef}
                className="landing-rise mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center"
                style={{ animationDelay: "440ms" }}
                data-testid="hero-cta"
              >
                {enlacePrincipal(`${BTN_PRIMARY} !px-8 !py-4 text-base`, principal.largo)}
                <a href="#entrenadores" className={`${BTN_GHOST} bg-background/40 !px-8 !py-4 text-base backdrop-blur-sm`}>
                  Soy entrenador
                </a>
              </div>
              {principal.externo ? (
                <p className="landing-rise mt-3 text-xs text-muted-foreground sm:mt-4 sm:text-sm" style={{ animationDelay: "520ms" }}>
                  Sin compromiso: le escribís por WhatsApp y te cuenta cómo trabaja.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-6 border-t border-border pt-4 sm:flex-row sm:pt-6 sm:items-end sm:justify-between">
              <dl className="grid grid-cols-3 gap-4 sm:max-w-xl sm:gap-8">
                {[
                  ["+150", "alumnos acompañados"],
                  ["5+", "años entrenando personas"],
                  ["3", "formas de entrenar"],
                ].map(([valor, texto]) => (
                  <div key={texto}>
                    <dd className="font-mono tabular-nums text-3xl font-black tracking-tighter sm:text-4xl">{valor}</dd>
                    <dt className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">{texto}</dt>
                  </div>
                ))}
              </dl>
              <a href="#problema" className={`group hidden min-h-[48px] items-center gap-3 sm:inline-flex rounded-full text-sm font-bold ${FOCUS_RING}`} data-siguiente>
                <span className="flex size-10 items-center justify-center rounded-full border border-border bg-background/40 transition-colors group-hover:bg-foreground group-hover:text-background">
                  <ArrowIcon className="landing-nudge size-4 rotate-90" />
                </span>
                <span className="underline-offset-4 group-hover:underline">¿Te suena esto?</span>
              </a>
            </div>
          </div>

          {/* Las tendencias, tachadas */}
          <div className="landing-marquee overflow-hidden border-t border-border bg-background/70 py-3.5" data-testid="tendencias-tachadas">
            <p className="sr-only">Lo que dejamos afuera: {TENDENCIAS.join(", ")}.</p>
            <div className="landing-marquee-track" aria-hidden="true">
              {[0, 1].map((copia) => (
                <ul key={copia} className="flex shrink-0 items-center">
                  {TENDENCIAS.map((t) => (
                    <li key={t} className="flex items-center whitespace-nowrap">
                      <span className="px-6 text-lg font-bold tracking-tight text-muted-foreground line-through decoration-2 sm:text-xl">{t}</span>
                      <span className="size-1.5 rounded-full bg-border" />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </section>

        {/* 01 · El problema */}
        <section id="problema" className={SECCION}>
          <div className={CUERPO}>
            <Capitulo n="01">¿Te suena?</Capitulo>
            <h2 className={`${H2} max-w-4xl`} data-reveal>
              Vas al gimnasio. Cumplís. Y aun así, no avanzás.
            </h2>
            <ol className={`${FILA} mt-8 md:gap-10 lg:mt-14`}>
              {DOLORES.map((d, i) => (
                <li key={d.n} className={`${FILA_ITEM} border-t border-border pt-5`} data-reveal style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}>
                  <span className="font-mono tabular-nums text-sm font-semibold text-muted-foreground">{d.n}</span>
                  <h3 className="mt-3 text-balance text-2xl font-black leading-tight tracking-tight lg:text-3xl">{d.titulo}</h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">{d.detalle}</p>
                </li>
              ))}
            </ol>
          </div>
          <Siguiente href="#metodo">No es falta de voluntad. Mirá por qué</Siguiente>
        </section>

        {/* 02 · El método */}
        <section id="metodo" className={`${SECCION} bg-secondary/40`}>
          <div className={CUERPO}>
            <Capitulo n="02">El método</Capitulo>
            <h2 className={`${H2} max-w-4xl`} data-reveal>
              Lo que funciona no es novedad. Es método.
            </h2>
            <p className={`${LEAD} mt-4 hidden max-w-2xl sm:block`} data-reveal>
              Las modas cambian cada mes. Lo que hace progresar a una persona se sabe hace años. Gonzalo trabaja con eso.
            </p>

            <div className="mt-6 lg:mt-8" data-testid="contraste-tendencia-evidencia">
              <div className={`${MICRO_LABEL} hidden grid-cols-2 gap-8 pb-3 sm:grid`} aria-hidden="true">
                <span>La tendencia</span>
                <span>La evidencia</span>
              </div>
              <ul className="border-t border-border">
                {CONTRASTE.map((c, i) => (
                  <li
                    key={c.tendencia}
                    className="grid grid-cols-1 gap-1.5 border-b border-border py-3.5 sm:grid-cols-2 sm:gap-8 sm:py-4"
                    data-reveal
                    style={{ "--reveal-delay": `${i * 60}ms` } as React.CSSProperties}
                  >
                    <p className="text-base font-semibold leading-snug text-muted-foreground line-through decoration-muted-foreground/60 sm:text-lg">
                      <span className="sr-only">Tendencia: </span>
                      {c.tendencia}
                    </p>
                    <p className="flex items-start gap-3 text-lg font-black leading-snug tracking-tight sm:text-xl">
                      <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                        <CheckIcon className="size-3.5" />
                      </span>
                      <span>
                        <span className="sr-only">Evidencia: </span>
                        {c.evidencia}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Siguiente href="#como">¿Y cómo se lleva a la práctica?</Siguiente>
        </section>

        {/* 03 · Cómo se trabaja */}
        <section id="como" className={SECCION}>
          <div className={CUERPO}>
            <Capitulo n="03">Cómo se trabaja</Capitulo>
            <h2 className={`${H2} max-w-4xl`} data-reveal>
              Tres pasos. Cero adivinanzas.
            </h2>
            <ol className={`${FILA} mt-8 md:gap-8 lg:mt-14`}>
              {PASOS.map((p, i) => (
                <li key={p.n} className={`${FILA_ITEM} border-t border-border pt-5`} data-reveal style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}>
                  <span className="font-mono tabular-nums text-6xl font-black tracking-tighter text-foreground/15 lg:text-7xl">{p.n}</span>
                  <h3 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">{p.titulo}</h3>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">{p.detalle}</p>
                </li>
              ))}
            </ol>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center" data-reveal>
              <a href={WHATSAPP_ALUMNO} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
                <span>Empezar por el paso 1</span>
                <ArrowIcon />
              </a>
              <span className="text-sm text-muted-foreground">Una charla por WhatsApp, sin compromiso.</span>
            </div>
          </div>
          <Siguiente href="#alumnos">Mirá cómo se ve tu plan</Siguiente>
        </section>

        {/* 04 · Para quien entrena */}
        <section id="alumnos" className={`${SECCION} bg-secondary/40`}>
          <div className={`${CUERPO}`}>
            <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-12 md:gap-10 lg:gap-12">
              <div className="md:col-span-7">
                <Capitulo n="04">Para vos, que querés entrenar</Capitulo>
                <h2 className={H2} data-reveal>
                  Tu plan en el bolsillo. Tu entrenador del otro lado.
                </h2>
                <p className={`${LEAD} mt-4 hidden max-w-xl sm:block`} data-reveal>
                  Nada de hojas sueltas ni capturas perdidas en el chat. Tu rutina vive en una app hecha a medida de cómo entrena Gonzalo.
                </p>
                <ul className="mt-6 hidden space-y-3 sm:block">
                  {BENEFICIOS_ALUMNO.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-base font-medium" data-reveal>
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                        <CheckIcon className="size-3" />
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center" data-reveal>
                  <a href={WHATSAPP_ALUMNO} target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY}>
                    <span>Quiero entrenar con Gonzalo</span>
                    <ArrowIcon />
                  </a>
                  <Link href="/athlete" className={`${BTN_GHOST} !hidden sm:!inline-flex`}>
                    Ya entreno: abrir mi rutina
                  </Link>
                </div>
              </div>
              <div className="md:col-span-5" data-reveal>
                <TelefonoEjemplo />
                {/* Del otro lado, una persona: el seguimiento contado como conversación */}
                <div className="mx-auto mt-4 max-w-[290px] space-y-2 text-sm" data-testid="mensaje-coach">
                  <p className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-background px-4 py-2.5 shadow-sm">
                    <span className="block text-[11px] font-bold text-muted-foreground">Gonzalo</span>
                    Muy bien la sentadilla de ayer. La próxima, bajá un poco más lento.
                  </p>
                  <p className="ml-auto hidden w-fit max-w-[88%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background sm:block">¡Dale! Sentí la diferencia.</p>
                </div>
                <p className="mt-2 text-center text-[11px] text-muted-foreground sm:mt-3 sm:text-xs">Ejemplo ilustrativo de la app.</p>
              </div>
            </div>
          </div>
          <Siguiente href="#modalidades">Elegí cómo querés entrenar</Siguiente>
        </section>

        {/* 05 · Modalidades */}
        <section id="modalidades" className={SECCION}>
          <div className={CUERPO}>
            <Capitulo n="05">Modalidades</Capitulo>
            <h2 className={H2} data-reveal>
              Tres formas de empezar.
            </h2>
            <div className={`${FILA} mt-8 md:gap-5`}>
              {MODALIDADES.map((m, i) => (
                <article
                  key={m.nombre}
                  className={`${FILA_ITEM} group relative isolate flex min-h-[380px] flex-col justify-end overflow-hidden rounded-2xl bg-zinc-950 p-6 text-zinc-50 lg:min-h-[400px]`}
                  data-reveal
                  style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}
                >
                  <img
                    src={m.foto}
                    alt={m.alt}
                    loading="lazy"
                    className="absolute inset-0 -z-20 size-full object-cover grayscale transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 -z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950/20" aria-hidden="true" />
                  <span className="mb-auto self-start rounded-full border border-zinc-50/30 bg-zinc-950/60 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider">
                    {m.badge}
                  </span>
                  <h3 className="text-3xl font-black tracking-tighter">{m.nombre}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{m.descripcion}</p>
                  <a
                    href={whatsapp(`Hola Gonza, quiero consultar por ${m.nombre}.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${BTN} mt-5 w-full bg-zinc-50 text-zinc-950 hover:bg-zinc-200 focus-visible:ring-zinc-50 focus-visible:ring-offset-zinc-950`}
                  >
                    <span>{m.cta}</span>
                    <ArrowIcon />
                  </a>
                </article>
              ))}
            </div>
          </div>
          <Siguiente href="#testimonios">Lo que dicen quienes ya entrenan</Siguiente>
        </section>

        {/* 06 · Testimonios */}
        <section id="testimonios" className={`${SECCION} bg-secondary/40`}>
          <div className={CUERPO}>
            <Capitulo n="06">Quienes ya entrenan</Capitulo>
            <h2 className={`${H2} max-w-4xl`} data-reveal>
              No lo decimos nosotros.
            </h2>
            <div className={`${FILA} mt-8 md:gap-5 lg:mt-12`}>
              {TESTIMONIOS.map((t, i) => (
                <figure
                  key={t.nombre}
                  className={`${FILA_ITEM} flex flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-6`}
                  data-reveal
                  style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}
                >
                  <blockquote className="text-pretty text-base font-medium leading-relaxed">&ldquo;{t.cita}&rdquo;</blockquote>
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
          <Siguiente href="#gonzalo">Conocé a quien está detrás</Siguiente>
        </section>

        {/* 07 · Quién está detrás */}
        <section id="gonzalo" className={SECCION}>
          <div className={CUERPO}>
            <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-12 md:gap-10 lg:gap-12">
              <figure className="dark relative isolate overflow-hidden rounded-2xl bg-zinc-950 md:col-span-4" data-reveal>
                <img
                  src={FOTO_GONZALO}
                  alt="Retrato de Gonzalo Salas, Head Coach"
                  loading="lazy"
                  className="aspect-[16/9] w-full object-cover object-top grayscale contrast-125 md:aspect-[3/4]"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950 to-transparent p-5 pt-16 text-zinc-50">
                  <span className="block text-3xl font-black leading-none tracking-tighter">Gonzalo Salas</span>
                  <span className="mt-2 block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">Head Coach</span>
                </figcaption>
              </figure>

              <div className="md:col-span-8">
                <Capitulo n="07">Quién está detrás</Capitulo>
                <blockquote className="text-balance text-xl font-black leading-[1.05] tracking-tighter sm:text-4xl" data-reveal>
                  &ldquo;No tenés un problema de voluntad. Tenés una rutina genérica y nadie que te mire entrenar.&rdquo;
                </blockquote>
                <p className={`${LEAD} mt-4 hidden max-w-2xl sm:block`} data-reveal>
                  Profesor de Educación Física, entrenador y director técnico de boxeo. Lleva más de cinco años acompañando a personas reales a entrenar mejor, sin atajos y sin humo.
                </p>

                <ul className="mt-6 border-t border-border" id="trayectoria">
                  {CREDENCIALES.map((c, i) => (
                    <li
                      key={c.titulo}
                      className="group grid grid-cols-1 gap-1 border-b border-border px-0 py-2.5 transition-colors sm:py-3.5 duration-150 hover:bg-foreground hover:text-background sm:grid-cols-12 sm:gap-6 sm:px-4"
                      data-testid={`franja-cv-${i + 1}`}
                      data-reveal
                    >
                      <span className="hidden font-mono tabular-nums text-sm font-semibold text-muted-foreground transition-colors group-hover:text-background/70 sm:col-span-1 sm:block sm:pt-0.5">
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
          </div>
          <Siguiente href="#entrenadores">¿Entrenás a otros? Esto es para vos</Siguiente>
        </section>

        {/* 08 · Para entrenadores */}
        <section id="entrenadores" className={`${SECCION} dark overflow-hidden bg-background text-foreground`} data-testid="seccion-entrenadores">
          <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div className={CUERPO}>
            <div className="grid grid-cols-1 items-center gap-5 md:grid-cols-12 md:gap-10 lg:gap-12">
              <div className="md:col-span-7">
                <Capitulo n="08">Para vos, que entrenás a otros</Capitulo>
                <h2 className={H2} data-reveal>
                  Tu método no entra en una app genérica.
                </h2>
                <p className={`${LEAD} mt-4 hidden max-w-2xl sm:block`} data-reveal>
                  Planillas, PDFs, audios de WhatsApp y apps que te obligan a trabajar a su manera. Coach Studio nació de ese mismo cansancio: lo pensó un entrenador, para entrenadores.
                </p>
                <ul className="mt-6 hidden grid-cols-1 gap-x-8 border-t border-border sm:grid sm:grid-cols-2">
                  {DOLORES_COACH.map((d, i) => (
                    <li key={d.titulo} className="border-b border-border py-2.5 sm:py-4" data-reveal style={{ "--reveal-delay": `${i * 60}ms` } as React.CSSProperties}>
                      <h3 className="text-base font-black leading-snug tracking-tight sm:text-lg">{d.titulo}</h3>
                      <p className="mt-1 hidden text-sm leading-relaxed text-muted-foreground sm:block">{d.detalle}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center" data-reveal>
                  <Link href="/studio" className={BTN_PRIMARY}>
                    <span>Ingresar a Coach Studio</span>
                    <ArrowIcon />
                  </Link>
                  <a href={WHATSAPP_COACH} target="_blank" rel="noopener noreferrer" className={`${BTN_GHOST} !hidden sm:!inline-flex`}>
                    Hablar con Gonzalo
                  </a>
                  <span className="text-sm text-muted-foreground">Gratis, sin tarjeta.</span>
                </div>
              </div>
              <div className="md:col-span-5" data-reveal>
                <StudioEjemplo />
                <p className="mt-2 text-center text-[11px] text-muted-foreground sm:mt-3 sm:text-xs">Ejemplo ilustrativo de Coach Studio.</p>
              </div>
            </div>
          </div>
          <Siguiente href="#faq">¿Te quedaron dudas?</Siguiente>
        </section>

        {/* 09 · Preguntas frecuentes */}
        <section id="faq" className={SECCION} data-testid="seccion-faq">
          <div className={CUERPO}>
            <Capitulo n="09">Preguntas frecuentes</Capitulo>
            <h2 className={`${H2} max-w-4xl`} data-reveal>
              Lo que todos preguntan antes de empezar.
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:mt-8 sm:gap-10 lg:grid-cols-2 lg:gap-12">
              <Preguntas titulo="Si querés entrenar" items={FAQ_ALUMNOS} />
              <Preguntas titulo="Si sos entrenador" items={FAQ_COACHES} />
            </div>
          </div>
          <Siguiente href="#empezar">Listo. Elegí por dónde empezar</Siguiente>
        </section>

        {/* Cierre: elegí tu camino */}
        <section id="empezar" className={`${SECCION} dark bg-background text-foreground`} data-testid="cierre-caminos">
          <div className={CUERPO}>
            <h2 className="max-w-5xl text-balance text-[clamp(2.4rem,6.4vw,5.25rem)] font-black leading-[0.94] tracking-tighter" data-reveal>
              La evidencia no pasa de moda.
            </h2>
            <p className={`${LEAD} mt-4 max-w-xl`} data-reveal>
              Elegí por dónde empezar.
            </p>

            <nav aria-label="Elegí tu camino" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3 lg:mt-12">
              {caminos.map((c) => {
                const activo = c.n === destacado;
                const className = `group flex flex-col justify-between gap-4 rounded-2xl border p-5 md:min-h-[200px] md:gap-8 transition-all duration-150 active:scale-[0.98] sm:p-7 ${FOCUS_RING} ${
                  activo
                    ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
                    : "border-border bg-card text-foreground hover:border-foreground/50 hover:bg-secondary"
                }`;
                const sub = activo ? "text-primary-foreground/70" : "text-muted-foreground";
                const contenido = (
                  <>
                    <span>
                      <span className={`flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${sub}`}>
                        <span className="tabular-nums">{c.n}</span>
                        <span>{c.kicker}</span>
                      </span>
                      <span className="mt-3 block text-2xl font-black leading-none tracking-tighter md:mt-4 md:text-3xl">{c.titulo}</span>
                      <span className={`mt-2 block text-sm leading-relaxed ${sub}`}>{c.detalle}</span>
                    </span>
                    <span className="flex items-center justify-between gap-3 text-sm font-bold">
                      <span>{c.accion}</span>
                      <ArrowIcon className="size-5 shrink-0 transition-transform duration-150 group-hover:translate-x-1" />
                    </span>
                  </>
                );
                return c.externo ? (
                  <a key={c.n} href={c.href} target="_blank" rel="noopener noreferrer" className={className} data-testid={`camino-${c.n}`} data-reveal>
                    {contenido}
                  </a>
                ) : (
                  <Link key={c.n} href={c.href} className={className} data-testid={`camino-${c.n}`} data-reveal>
                    {contenido}
                  </Link>
                );
              })}
            </nav>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/80 bg-background px-5 pb-28 pt-8 text-xs text-muted-foreground sm:px-8 md:pb-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">G</span>
            <span className="font-bold text-foreground">GOZSter</span>
            <span aria-hidden="true">·</span>
            <span>Gonzalo Salas &amp; Fresias</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1" aria-label="Pie de página">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className={`inline-flex min-h-[48px] items-center rounded px-2 transition-colors hover:text-foreground ${FOCUS_RING}`}>
                {label}
              </a>
            ))}
            <Link href="/studio" className={`inline-flex min-h-[48px] items-center rounded px-2 transition-colors hover:text-foreground ${FOCUS_RING}`}>
              Coach Studio
            </Link>
            <Link href="/athlete" className={`inline-flex min-h-[48px] items-center rounded px-2 transition-colors hover:text-foreground ${FOCUS_RING}`}>
              Athlete App
            </Link>
          </nav>
          <div>Entrenamiento basado en evidencia, no en tendencias.</div>
        </div>
      </footer>

      {/* Barra de acción móvil: la misma acción principal, siempre a mano */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 md:hidden ${
          barraVisible ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!barraVisible}
        data-testid="barra-accion-movil"
      >
        <div className="flex items-center gap-2">
          {enlacePrincipal(`${BTN_PRIMARY} flex-1 !px-4`, principal.corto, barraVisible ? 0 : -1)}
          <a href="#entrenadores" className={`${BTN_GHOST} !px-4`} tabIndex={barraVisible ? 0 : -1}>
            Soy entrenador
          </a>
        </div>
      </div>
    </div>
  );
}
