"use client";

import * as React from "react";
import { Download, Info, X } from "@/components/athlete/icons";

const STORAGE_INSTALLED_KEY = "gozster-app-instalada";
const STORAGE_DISMISSED_KEY = "gozster-install-dismissed";

type PhoneOS = "ios" | "android";

const STEPS_BY_OS: Record<PhoneOS, string[]> = {
  ios: [
    "Abrí GOZSter en Safari.",
    "Tocá Compartir, abajo en la pantalla.",
    'Elegí "Agregar a inicio" y confirmá.',
    "Entrá siempre desde el ícono nuevo.",
  ],
  android: [
    "Abrí GOZSter en Chrome.",
    "Tocá el menú de los tres puntos.",
    'Elegí "Instalar app" y confirmá.',
    "Entrá siempre desde el ícono nuevo.",
  ],
};

function detectPhoneOS(): PhoneOS {
  if (typeof navigator === "undefined") return "ios";
  return /android/i.test(navigator.userAgent) ? "android" : "ios";
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneNav = (window.navigator as { standalone?: boolean }).standalone === true;
  const standaloneMedia =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return standaloneNav || standaloneMedia;
}

/**
 * Tarjeta y hoja de instalación PWA para Inicio (Athlete v7 · FE-03 / 02-pantallas.md §1).
 */
export function InstalarAppCard() {
  const [visible, setVisible] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [os, setOs] = React.useState<PhoneOS>("ios");

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const titleRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    setOs(detectPhoneOS());
    if (isStandaloneMode()) {
      setVisible(false);
      return;
    }
    try {
      const installed = window.localStorage.getItem(STORAGE_INSTALLED_KEY) === "1";
      const dismissed = window.localStorage.getItem(STORAGE_DISMISSED_KEY) === "1";
      setVisible(!installed && !dismissed);
    } catch {
      setVisible(true);
    }
  }, []);

  const closeSheet = React.useCallback(() => {
    setSheetOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  React.useEffect(() => {
    if (!sheetOpen) return;
    titleRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSheet();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen, closeSheet]);

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_DISMISSED_KEY, "1");
    } catch {
      // Ignorar si el almacenamiento está restringido
    }
    setVisible(false);
  };

  const handleInstalled = () => {
    try {
      window.localStorage.setItem(STORAGE_INSTALLED_KEY, "1");
    } catch {
      // Ignorar si el almacenamiento está restringido
    }
    setSheetOpen(false);
    setVisible(false);
  };

  if (!visible) return null;

  const ios = os === "ios";
  const steps = STEPS_BY_OS[os];

  return (
    <>
      <section
        className="a-card grid grid-cols-[40px_1fr] gap-x-3 gap-y-1 p-[14px]"
        data-testid="instalar-app-card"
      >
        <span
          className="row-span-2 grid h-10 w-10 place-items-center rounded-[12px]"
          style={{ background: "var(--a-primary)", color: "var(--a-on-primary)" }}
        >
          <Download width={20} height={20} className="a-i" />
        </span>
        <b className="a-t-bs">Instalá GOZSter en tu inicio</b>
        <small className="a-t-sec a-muted">
          Así abre aunque no haya señal en el gimnasio. En iPhone es la única forma.
        </small>
        <div className="col-span-2 mt-2 grid grid-cols-[1fr_auto] gap-2">
          <button
            ref={triggerRef}
            type="button"
            className="a-btn min-h-[44px]"
            onClick={() => setSheetOpen(true)}
            data-testid="instalar-app-btn"
          >
            Cómo instalar
          </button>
          <button
            type="button"
            className="a-link"
            onClick={handleDismiss}
            data-testid="instalar-app-descartar-btn"
          >
            Ahora no
          </button>
        </div>
      </section>

      {sheetOpen && (
        <div
          className="a-sheet-wrap"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheet();
          }}
          data-testid="instalar-app-sheet-backdrop"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-install-title"
            className="a-sheet"
            data-testid="instalar-app-sheet"
          >
            <div className="a-sh-h">
              <h2 id="sheet-install-title" ref={titleRef} className="a-t-h" tabIndex={-1}>
                Instalar GOZSter
              </h2>
              <button
                type="button"
                className="a-icon-btn"
                onClick={closeSheet}
                aria-label="Cerrar"
                data-testid="instalar-app-cerrar-btn"
              >
                <X width={20} height={20} className="a-i" />
              </button>
            </div>

            <div className="a-seg" role="group" aria-label="Tu teléfono">
              <button
                type="button"
                aria-pressed={ios}
                onClick={() => setOs("ios")}
                data-testid="instalar-os-ios"
              >
                iPhone
              </button>
              <button
                type="button"
                aria-pressed={!ios}
                onClick={() => setOs("android")}
                data-testid="instalar-os-android"
              >
                Android
              </button>
            </div>

            <ol className="a-steps a-t-body">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <p className="a-info a-t-sec">
              <Info width={18} height={18} className="a-i" />
              <span>
                {ios
                  ? "En iPhone, sin instalarla, la app no abre sin señal y el teléfono puede borrar las series guardadas."
                  : "Instalada, la app abre sin señal y envía las series cuando vuelve la conexión."}
              </span>
            </p>

            <button
              type="button"
              className="a-btn"
              onClick={handleInstalled}
              data-testid="instalar-app-listo-btn"
            >
              Ya la instalé
            </button>
          </div>
        </div>
      )}
    </>
  );
}
