"use client";

import * as React from "react";

const DEFAULT_GLYPHS = "0123456789ABCDEF!<>-_\\/[]{}—=+*^?#_";

export interface ScrambleTextProps {
  text: string;
  className?: string;
  glyphs?: string;
  duration?: number;
  as?: React.ElementType;
}

/**
 * Hook liviano de TypeScript puro para efecto Scramble / Decode de texto a 60 FPS
 * Respeto estricto a Ponytail (cero dependencias de NPM) y accesibilidad (prefers-reduced-motion).
 */
export function useScrambleText({
  text,
  duration = 550,
  glyphs = DEFAULT_GLYPHS,
}: {
  text: string;
  duration?: number;
  glyphs?: string;
}) {
  const [displayText, setDisplayText] = React.useState(text);
  const elementRef = React.useRef<HTMLElement | null>(null);
  const animatedRef = React.useRef(false);

  React.useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayText(text);
      return;
    }

    let rafId: number | null = null;

    const startScramble = () => {
      if (animatedRef.current) return;
      animatedRef.current = true;

      const startTime = performance.now();
      const length = text.length;

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const revealedCount = Math.floor(progress * length);

        let result = "";
        for (let i = 0; i < length; i++) {
          if (i < revealedCount || progress >= 1) {
            result += text[i];
          } else {
            result += glyphs[Math.floor(Math.random() * glyphs.length)];
          }
        }

        setDisplayText(result);

        if (progress < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          setDisplayText(text);
        }
      };

      rafId = requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") {
      startScramble();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            startScramble();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [text, duration, glyphs]);

  return { displayText, elementRef };
}

/**
 * Componente ScrambleText en TS puro sin dependencias de NPM.
 * Renderiza el texto legible en SSR y activa el decodificado al entrar en viewport.
 */
export function ScrambleText({
  text,
  className = "",
  glyphs = DEFAULT_GLYPHS,
  duration = 550,
  as: Component = "span",
}: ScrambleTextProps) {
  const { displayText, elementRef } = useScrambleText({ text, duration, glyphs });

  return (
    <Component
      ref={elementRef}
      className={className}
      aria-label={text}
      data-testid="scramble-text"
    >
      <span aria-hidden="true">{displayText}</span>
    </Component>
  );
}

export { CharacterReveal } from "./character-reveal";
export { NosotrosInteraction } from "./nosotros-badge";
