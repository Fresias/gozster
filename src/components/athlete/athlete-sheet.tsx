"use client";

import * as React from "react";
import { X } from "@/components/athlete/icons";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Calcula el próximo elemento al que debe moverse el foco en un focus trap circular.
 * Devuelve `null` si el navegador puede continuar con su flujo nativo dentro de `focusables`.
 */
export function siguienteElementoFoco<T>(
  focusables: readonly T[],
  active: T | null,
  shiftKey: boolean,
): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const idx = active ? focusables.indexOf(active) : -1;

  if (idx === -1) {
    return shiftKey ? last : first;
  }
  if (shiftKey && idx === 0) {
    return last;
  }
  if (!shiftKey && idx === focusables.length - 1) {
    return first;
  }
  return null;
}

function obtenerFocuseables(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return candidates.filter((el) => {
    if (el.tabIndex < 0) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return el.getClientRects().length > 0;
  });
}

export interface AthleteSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  titleId?: string;
  center?: boolean;
  closeAriaLabel?: string;
  backdropTestId?: string;
  dialogTestId?: string;
  titleTestId?: string;
  subtitleTestId?: string;
  closeTestId?: string;
  children?: React.ReactNode;
}

/**
 * Hoja modal reutilizable de Athlete v7:
 * crece con el contenido hasta `calc(100% - 40px)`, se desliza por dentro con
 * encabezado fijo (`.a-sh-h`), atrapa el foco (`Tab`/`Shift+Tab`), cierra con
 * `Escape` en `window` o clic en el fondo y devuelve el foco al disparador.
 */
export function AthleteSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  titleId,
  center = false,
  closeAriaLabel = "Cerrar",
  backdropTestId,
  dialogTestId,
  titleTestId,
  subtitleTestId,
  closeTestId,
  children,
}: AthleteSheetProps) {
  const generatedTitleId = React.useId();
  const effectiveTitleId = titleId ?? generatedTitleId;
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const titleRef = React.useRef<HTMLHeadingElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!isOpen) return;

    const prev = document.activeElement;
    previousFocusRef.current = prev instanceof HTMLElement ? prev : null;

    titleRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusables = obtenerFocuseables(sheetRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          titleRef.current?.focus();
          return;
        }
        const activeEl =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const next = siguienteElementoFoco(focusables, activeEl, e.shiftKey);
        if (next) {
          e.preventDefault();
          next.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      const returnTarget = previousFocusRef.current;
      previousFocusRef.current = null;
      if (returnTarget && returnTarget.isConnected) {
        returnTarget.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={center ? "a-sheet-wrap a-center" : "a-sheet-wrap"}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      data-testid={backdropTestId}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={effectiveTitleId}
        className="a-sheet"
        onClick={(e) => e.stopPropagation()}
        data-testid={dialogTestId}
      >
        <div className="a-sh-h">
          <div>
            <h2
              id={effectiveTitleId}
              ref={titleRef}
              className="a-t-h"
              tabIndex={-1}
              data-testid={titleTestId}
            >
              {title}
            </h2>
            {subtitle ? (
              <span className="a-t-sec a-muted" data-testid={subtitleTestId}>
                {subtitle}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="a-icon-btn"
            onClick={onClose}
            aria-label={closeAriaLabel}
            data-testid={closeTestId}
          >
            <X width={18} height={18} className="a-i" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
