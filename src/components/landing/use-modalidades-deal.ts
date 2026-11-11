"use client";

import * as React from "react";

/**
 * Fanning físico y escalas de los naipes en estado apilado.
 * Calibrados según la escena "finishes" de relevovinco.com y el mockup Hi-Fi validado.
 */
export const STACK_ROTATIONS = [-8.5, 0.4, 7.8] as const;
export const STACK_SCALES = [0.93, 0.96, 0.93] as const;
export const STACK_Z_INDICES = [1, 3, 2] as const;
export const TRIGGER_START_RATIO = 0.88;
export const TRIGGER_END_RATIO = 0.2;
export const TRANSFORM_ORIGIN = "50% 85%";

/**
 * Función de easing suave power2.inOut (quad in-out) de GSAP.
 */
export function easeInOutPower2(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
}

/**
 * Calcula el progreso normalizado (0 a 1) ligado al scroll del viewport.
 * - progress = 0: la sección apenas asoma al 88% del viewport (tarjetas apiladas en el centro).
 * - progress = 1: la sección se asentó al 20% del viewport (tarjetas abiertas en sus 3 columnas fijas).
 */
export function calculateDealProgress(sectionTop: number, viewportHeight: number): number {
  const vh = viewportHeight || 800;
  const startPx = vh * TRIGGER_START_RATIO;
  const endPx = vh * TRIGGER_END_RATIO;
  const distance = startPx - endPx;
  if (distance <= 0) return 1;
  const raw = (startPx - sectionTop) / distance;
  return easeInOutPower2(raw);
}

/**
 * Hook dedicado para la animación bidireccional "deal-from-center" en la sección 06 Modalidades.
 *
 * Arquitectura (Regla Ponytail & Karpathy):
 * - Microinteracciones sin dependencias externas pesadas ni overhead en bundle.
 * - Utiliza los cardWrappers estáticos en la grilla CSS para medir centros y calcular offsets inmunes a transforms.
 * - Sincronizado a 60-120 FPS mediante passive listeners + requestAnimationFrame.
 * - Respeta estrictamente prefers-reduced-motion: reduce y viewports móviles (< 768px).
 */
export function useModalidadesDeal() {
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const wrapperRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = React.useRef<(HTMLElement | null)[]>([]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId: number | null = null;
    let isScheduled = false;

    const clearTransforms = () => {
      for (const card of cardRefs.current) {
        if (!card) continue;
        card.style.transform = "";
        card.style.zIndex = "";
        card.style.boxShadow = "";
        card.style.willChange = "";
        card.style.transformOrigin = "";
      }
    };

    const update = () => {
      isScheduled = false;

      // 1. Accesibilidad: respetar preferencia de movimiento reducido
      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // 2. Mobile first: en viewports < 768px mantener carrusel horizontal intacto sin rotaciones
      const isMobile = window.innerWidth < 768;

      if (prefersReducedMotion || isMobile) {
        clearTransforms();
        return;
      }

      const section = sectionRef.current;
      if (!section) return;

      const vh = window.innerHeight || 800;
      const sectionRect = section.getBoundingClientRect();
      const progress = calculateDealProgress(sectionRect.top, vh);

      // Si las tarjetas alcanzaron su posición final en la sección 06 o más abajo
      if (progress >= 1) {
        clearTransforms();
        return;
      }

      const centerWrapper = wrapperRefs.current[1];
      if (!centerWrapper) return;

      const centerRect = centerWrapper.getBoundingClientRect();
      const targetCenterX = centerRect.left + centerRect.width / 2;
      const targetCenterY = centerRect.top + centerRect.height / 2;

      for (let i = 0; i < 3; i++) {
        const wrapper = wrapperRefs.current[i];
        const card = cardRefs.current[i];
        if (!wrapper || !card) continue;

        const r = wrapper.getBoundingClientRect();
        if (r.width === 0 || centerRect.width === 0) continue;

        const curCenterX = r.left + r.width / 2;
        const curCenterY = r.top + r.height / 2;

        const offsetX = targetCenterX - curCenterX;
        const offsetY = targetCenterY - curCenterY;

        const invP = 1 - progress;
        const curX = offsetX * invP;
        const curY = offsetY * invP;
        const baseRot = STACK_ROTATIONS[i] ?? 0;
        const baseScale = STACK_SCALES[i] ?? 1;
        const rot = baseRot * invP;
        const sc = baseScale + (1 - baseScale) * progress;

        card.style.transformOrigin = TRANSFORM_ORIGIN;
        card.style.willChange = "transform, box-shadow";
        card.style.zIndex = String(STACK_Z_INDICES[i] ?? 1);
        card.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;

        // Interpolación de sombra física de mazo de naipes apilados
        const shadowY = Math.round(15 + 15 * invP);
        const shadowBlur = Math.round(35 + 25 * invP);
        const shadowAlpha = (0.7 + 0.2 * invP).toFixed(2);
        const borderAlpha = (0.08 + 0.04 * invP).toFixed(2);
        card.style.boxShadow = `0 ${shadowY}px ${shadowBlur}px -15px rgba(0, 0, 0, ${shadowAlpha}), 0 0 0 1px rgba(255, 255, 255, ${borderAlpha})`;
      }
    };

    const requestUpdate = () => {
      if (isScheduled) return;
      isScheduled = true;
      rafId = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    window.addEventListener("orientationchange", requestUpdate, { passive: true });

    const mediaReduced =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    if (mediaReduced?.addEventListener) {
      mediaReduced.addEventListener("change", requestUpdate);
    }

    // Ejecución inicial sincrónica con el scroll actual
    requestUpdate();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("orientationchange", requestUpdate);
      if (mediaReduced?.removeEventListener) {
        mediaReduced.removeEventListener("change", requestUpdate);
      }
      clearTransforms();
    };
  }, []);

  return {
    sectionRef,
    gridRef,
    wrapperRefs,
    cardRefs,
  };
}
