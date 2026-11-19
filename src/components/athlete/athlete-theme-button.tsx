"use client";

import * as React from "react";
import { useTheme } from "@/components/ui/theme-toggle";
import { Moon, Sun } from "@/components/athlete/icons";

/**
 * Botón táctil de cambio de tema para Athlete App v7.
 * Reutiliza `useTheme()` de `@/components/ui/theme-toggle` sin modificar componentes compartidos.
 */
export function AthleteThemeButton() {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = mounted ? theme === "dark" : true;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle"
      data-theme={isDark ? "dark" : "light"}
      aria-label={isDark ? "Usar tema claro" : "Usar tema oscuro"}
      className="a-icon-btn"
    >
      {isDark ? (
        <Moon width={18} height={18} className="a-i" />
      ) : (
        <Sun width={18} height={18} className="a-i" />
      )}
    </button>
  );
}
