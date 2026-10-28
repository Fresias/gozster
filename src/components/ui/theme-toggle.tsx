"use client";

import * as React from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "gozster-theme";

/**
 * Hook para consultar y alternar el tema activo (Modo Día / Modo Noche).
 */
export function useTheme() {
  const [theme, setTheme] = React.useState<Theme>("dark");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);

    const getInitialTheme = (): Theme => {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "light" || stored === "dark") {
          return stored;
        }
        if (typeof window !== "undefined" && window.matchMedia) {
          return window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
        }
      } catch {
        // Fallback en entornos restringidos
      }
      return document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
    };

    const initial = getInitialTheme();
    setTheme(initial);

    // Sincronizar clase en HTML por si el script inicial no corrió
    if (initial === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: Theme }>;
      if (customEvent.detail && customEvent.detail.theme) {
        setTheme(customEvent.detail.theme);
      } else {
        const currentIsDark = document.documentElement.classList.contains("dark");
        setTheme(currentIsDark ? "dark" : "light");
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        setTheme(e.newValue);
        if (e.newValue === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    };

    window.addEventListener("gozster-theme-change", handleThemeChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("gozster-theme-change", handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setThemeValue = React.useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignorar error si almacenamiento local está restringido
    }

    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("gozster-theme-change", { detail: { theme: nextTheme } }),
      );
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setThemeValue(theme === "dark" ? "light" : "dark");
  }, [theme, setThemeValue]);

  return { theme, toggleTheme, setTheme: setThemeValue, mounted };
}

export interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className = "", showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme, mounted } = useTheme();

  const isDark = mounted ? theme === "dark" : true;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Cambiar a Modo Día" : "Cambiar a Modo Noche"}
      title={isDark ? "Cambiar a Modo Día (Blanco Cálido)" : "Cambiar a Modo Noche (Carbón Suave)"}
      data-testid="theme-toggle"
      data-theme={isDark ? "dark" : "light"}
      className={`group relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-xs transition-all hover:bg-secondary hover:border-border active:scale-95 focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
    >
      <div className="relative flex h-5 w-5 items-center justify-center">
        {/* Sol (Light Mode) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 text-amber-500 transition-all duration-300 ${
            isDark
              ? "rotate-90 scale-0 opacity-0 absolute"
              : "rotate-0 scale-100 opacity-100"
          }`}
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>

        {/* Luna (Dark Mode) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 text-sky-400 transition-all duration-300 ${
            isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0 absolute"
          }`}
          aria-hidden="true"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </div>

      {showLabel && (
        <span className="hidden sm:inline-block font-medium text-xs">
          {isDark ? "Modo Noche" : "Modo Día"}
        </span>
      )}
    </button>
  );
}
