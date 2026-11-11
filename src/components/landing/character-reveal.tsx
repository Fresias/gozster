"use client";

import * as React from "react";

export interface CharacterRevealProps {
  text: string;
  className?: string;
  staggerMs?: number;
}

/**
 * Componente CharacterReveal en TS/CSS puro.
 * Anima la palabra carácter por carácter de forma secuencial al entrar en viewport a 60 FPS.
 * Deshabilita la animación al activarse prefers-reduced-motion.
 */
export function CharacterReveal({
  text,
  className = "",
  staggerMs = 80,
}: CharacterRevealProps) {
  const containerRef = React.useRef<HTMLSpanElement | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = containerRef.current;
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

  const chars = Array.from(text);

  return (
    <span
      ref={containerRef}
      className={`landing-char-reveal inline-block ${className}`}
      aria-label={text}
      data-testid="character-reveal"
      data-in-view={inView ? "true" : "false"}
    >
      {chars.map((char, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`landing-char-item inline-block ${inView ? "is-revealed" : ""}`}
          style={
            {
              "--char-index": index,
              animationDelay: `${index * staggerMs}ms`,
            } as React.CSSProperties
          }
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </span>
  );
}
