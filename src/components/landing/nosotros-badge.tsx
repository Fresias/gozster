"use client";

import * as React from "react";

export interface NosotrosInteractionProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Microinteracción sutil y moderna en la palabra "nosotros" para la sección de testimonios.
 * Reemplaza el contorno hueco anterior con un acento cinético de subrayado y respuesta táctil.
 * Cumple con accesibilidad y deshabilitación inmediata bajo prefers-reduced-motion.
 */
export function NosotrosInteraction({
  className = "",
  children = "nosotros",
}: NosotrosInteractionProps) {
  const elementRef = React.useRef<HTMLSpanElement | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <span
      ref={elementRef}
      className={`landing-nosotros-interaction relative inline-block transition-transform duration-300 hover:scale-[1.03] active:scale-[0.98] cursor-default ${className}`}
      data-testid="nosotros-interaction"
      data-in-view={inView ? "true" : "false"}
    >
      <span className="relative z-10 font-black">{children}</span>
      <span
        aria-hidden="true"
        className={`landing-nosotros-line absolute inset-x-0 -bottom-1 h-[0.14em] rounded-full bg-foreground transition-transform duration-700 ease-out origin-left ${
          inView ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </span>
  );
}
