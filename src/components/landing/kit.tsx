"use client";

import * as React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LandingSessionCapsule } from "@/components/landing-session-capsule";

/* Configuración única de contacto: cambiar acá el número de WhatsApp. */
export const WHATSAPP_NUMERO = "541162752515";
export const whatsapp = (mensaje: string) => `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
export const WHATSAPP_ALUMNO = whatsapp("Hola Gonza, quiero empezar a entrenar con vos. ¿Me contás cómo trabajás?");
export const WHATSAPP_COACH = whatsapp("Hola Gonza, soy entrenador y quiero conocer Coach Studio.");
export const FOTO_GONZALO = "/landing/gonzalo-salas.jpg";

/* Recetas visuales compartidas con Coach Studio (tokens zinc, borde 1px, micro-etiquetas mono). */
export const MICRO_LABEL = "font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
export const BTN =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-all duration-150 active:scale-[0.98] " +
  FOCUS_RING;
export const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:opacity-90`;
export const BTN_GHOST = `${BTN} border border-border bg-transparent text-foreground hover:bg-secondary`;
export const CONTAINER = "mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12";
/* Cada capítulo ocupa, como mínimo, un viewport (descontando el header fijo). */
export const SECCION = "landing-section relative isolate flex min-h-[calc(100svh-4rem)] scroll-mt-16 flex-col border-t border-border pb-24 pt-8 sm:py-14";
export const CUERPO = `${CONTAINER} flex flex-1 flex-col justify-center`;
export const H2 = "text-balance text-[clamp(2rem,4.6vw,3.75rem)] font-black leading-[0.98] tracking-tighter text-foreground";
/* En móvil, los grupos de tres se recorren deslizando: el capítulo sigue entrando en una pantalla. */
export const FILA =
  "-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden";
export const FILA_ITEM = "w-[82%] shrink-0 snap-start md:w-auto";
export const LEAD = "text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg";

export function ArrowIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/* Etiqueta de capítulo: numera el relato y da ritmo a la lectura. */
export function Capitulo({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className={`${MICRO_LABEL} mb-3 flex items-center gap-3 sm:mb-5`} data-reveal>
      <span className="tabular-nums text-foreground">{n}</span>
      <span className="h-px w-10 bg-border" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/* Cierre de cada capítulo: una pregunta o promesa que invita a seguir bajando. */
export function Siguiente({ href, children }: { href: string; children: React.ReactNode }) {
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

/* Revela cada bloque al entrar en pantalla. Sin JS o con movimiento reducido, todo queda visible. */
export function useScrollReveal() {
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

export function Preguntas({ titulo, items }: { titulo: string; items: { q: string; a: string }[] }) {
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


type UsuarioLanding = { email: string; displayName: string; rol: string } | null | undefined;

/* Selector de público: la misma pieza en las dos páginas, para que cada visitante encuentre la suya. */
const PUBLICOS = [
  { id: "alumnos", href: "/", corto: "Entrenar", largo: "Para entrenar" },
  { id: "entrenadores", href: "/entrenadores", corto: "Entrenadores", largo: "Para entrenadores" },
] as const;

export function LandingHeader({
  publico,
  nav,
  user,
  accion,
}: {
  publico: "alumnos" | "entrenadores";
  nav: readonly (readonly [string, string])[];
  user: UsuarioLanding;
  accion: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className={`${CONTAINER} flex h-16 items-center justify-between gap-2 sm:gap-3`}>
        <div className="flex items-center gap-3 sm:gap-5">
          <Link href="/" className={`flex items-center gap-2.5 rounded-lg ${FOCUS_RING}`} aria-label="Inicio GOZSter">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-base font-black text-primary-foreground">G</span>
            <span className="hidden text-lg font-black tracking-tight md:inline">GOZSter</span>
          </Link>

          <nav className="flex items-center rounded-full border border-border bg-secondary/60 p-1" aria-label="Elegí tu perfil" data-testid="selector-publico">
            {PUBLICOS.map((p) => {
              const activo = p.id === publico;
              return (
                <Link
                  key={p.id}
                  href={p.href}
                  aria-current={activo ? "page" : undefined}
                  className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-xs font-bold transition-colors duration-150 sm:px-4 sm:text-sm ${FOCUS_RING} ${
                    activo ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="sm:hidden">{p.corto}</span>
                  <span className="hidden sm:inline">{p.largo}</span>
                </Link>
              );
            })}
          </nav>

          <nav className="hidden items-center gap-5 xl:flex" aria-label="Navegación principal">
            {nav.map(([href, label]) => (
              <a key={href} href={href} className={`rounded text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}>
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className={user ? "hidden sm:block" : undefined}>
            <LandingSessionCapsule
              initialUser={user ? { email: user.email, nombre: `${user.displayName} (${user.rol === "ADMIN" ? "Admin" : "Atleta"})` } : null}
            />
          </div>
          {accion}
          <div className={user ? undefined : "hidden sm:block"}>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter({ nav }: { nav: readonly (readonly [string, string])[] }) {
  const enlace = `inline-flex min-h-[48px] items-center rounded px-2 transition-colors hover:text-foreground ${FOCUS_RING}`;
  return (
    <footer className="border-t border-border/80 bg-background px-5 pb-28 pt-8 text-xs text-muted-foreground sm:px-8 md:pb-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-center md:flex-row md:text-left">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">G</span>
          <span className="font-bold text-foreground">GOZSter</span>
          <span aria-hidden="true">·</span>
          <span>Gonzalo Salas &amp; Fresias</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1" aria-label="Pie de página">
          {nav.map(([href, label]) => (
            <a key={href} href={href} className={enlace}>
              {label}
            </a>
          ))}
          <Link href="/" className={enlace}>
            Para entrenar
          </Link>
          <Link href="/entrenadores" className={enlace}>
            Para entrenadores
          </Link>
          <Link href="/studio" className={enlace}>
            Coach Studio
          </Link>
          <Link href="/athlete" className={enlace}>
            Athlete App
          </Link>
        </nav>
        <div>Entrenamiento basado en evidencia, no en tendencias.</div>
      </div>
    </footer>
  );
}

/* Barra de acción móvil: aparece cuando los botones del hero salen de pantalla. */
export function useBarraMovil() {
  const heroCtaRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = heroCtaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { heroCtaRef, visible };
}

export function BarraMovil({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
      data-testid="barra-accion-movil"
    >
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
