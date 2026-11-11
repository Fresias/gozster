"use client";

import * as React from "react";

export function useHorizontalStorytelling() {
  const containerRef = React.useRef<HTMLElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const progressBarRef = React.useRef<HTMLDivElement | null>(null);
  const progressPercentRef = React.useRef<HTMLSpanElement | null>(null);
  const phaseBadgeRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    let rafId: number | null = null;

    const onScroll = () => {
      const rect = container.getBoundingClientRect();
      const containerHeight = container.offsetHeight;
      const windowHeight = window.innerHeight;
      const scrollableDistance = containerHeight - windowHeight;

      if (scrollableDistance <= 0) return;

      const currentScroll = -rect.top;
      let progress = 0;
      if (currentScroll > 0) {
        progress = Math.min(Math.max(currentScroll / scrollableDistance, 0), 1);
      }

      const translateX = progress * 50;
      track.style.transform = `translate3d(-${translateX}%, 0, 0)`;

      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${Math.round(progress * 100)}%`;
      }
      if (progressPercentRef.current) {
        progressPercentRef.current.textContent = `${Math.round(progress * 100)}%`;
      }
      if (phaseBadgeRef.current) {
        if (progress < 0.45) {
          phaseBadgeRef.current.textContent = "Fase 1: El Dolor";
          phaseBadgeRef.current.className = "text-xs font-mono font-bold text-red-400 transition-colors";
        } else {
          phaseBadgeRef.current.textContent = "Fase 2: El Método";
          phaseBadgeRef.current.className = "text-xs font-mono font-bold text-emerald-400 transition-colors";
        }
      }
    };

    const handleScrollOrResize = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(onScroll);
    };

    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const touchX = touch.clientX;
      const touchY = touch.clientY;
      const deltaX = touchStartX - touchX;
      const deltaY = touchStartY - touchY;
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
        window.scrollBy({ top: deltaX * 1.2, behavior: "auto" });
        touchStartX = touchX;
        touchStartY = touchY;
      }
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });
    track.addEventListener("touchstart", onTouchStart, { passive: true });
    track.addEventListener("touchmove", onTouchMove, { passive: true });

    onScroll();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      track.removeEventListener("touchstart", onTouchStart);
      track.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return {
    containerRef,
    trackRef,
    progressBarRef,
    progressPercentRef,
    phaseBadgeRef,
  };
}
