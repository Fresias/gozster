import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        "border-subtle": "hsl(var(--border-subtle))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        "subtle-foreground": "hsl(var(--subtle-foreground))",
        sidebar: "hsl(var(--sidebar))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          container: "hsl(var(--surface-container))",
          "container-low": "hsl(var(--surface-container-low))",
          "container-high": "hsl(var(--surface-container-high))",
          "container-highest": "hsl(var(--surface-container-highest))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        "success-soft": {
          DEFAULT: "hsl(var(--success-soft))",
          foreground: "hsl(var(--success-soft-foreground))",
          border: "hsl(var(--success-soft-border))",
        },
        "warning-soft": {
          DEFAULT: "hsl(var(--warning-soft))",
          foreground: "hsl(var(--warning-soft-foreground))",
          border: "hsl(var(--warning-soft-border))",
          strong: "hsl(var(--warning-soft-strong))",
        },
        "warning-soft-strong": "hsl(var(--warning-soft-strong))",
        "danger-soft": {
          DEFAULT: "hsl(var(--danger-soft))",
          foreground: "hsl(var(--danger-soft-foreground))",
          border: "hsl(var(--danger-soft-border))",
        },
        "neutral-soft": {
          DEFAULT: "hsl(var(--neutral-soft))",
          foreground: "hsl(var(--neutral-soft-foreground))",
          border: "hsl(var(--neutral-soft-border))",
        },
        "destructive-soft": {
          DEFAULT: "hsl(var(--danger-soft))",
          foreground: "hsl(var(--danger-soft-foreground))",
          border: "hsl(var(--danger-soft-border))",
        },
        "act-funcional": {
          bg: "hsl(var(--act-funcional-bg) / <alpha-value>)",
          border: "hsl(var(--act-funcional-border) / <alpha-value>)",
          fg: "hsl(var(--act-funcional-fg) / <alpha-value>)",
          bar: "hsl(var(--act-funcional-bar) / <alpha-value>)",
        },
        "act-funcional-bg": "hsl(var(--act-funcional-bg))",
        "act-funcional-border": "hsl(var(--act-funcional-border))",
        "act-boxeo": {
          bg: "hsl(var(--act-boxeo-bg) / <alpha-value>)",
          border: "hsl(var(--act-boxeo-border) / <alpha-value>)",
          fg: "hsl(var(--act-boxeo-fg) / <alpha-value>)",
          bar: "hsl(var(--act-boxeo-bar) / <alpha-value>)",
        },
        "act-boxeo-bg": "hsl(var(--act-boxeo-bg))",
        "act-boxeo-border": "hsl(var(--act-boxeo-border))",
      },
      fontFamily: {
        sans: ["Geist", "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 16px)",
      },
      boxShadow: {
        "m3-1": "0 1px 3px 0 rgb(0 0 0 / 0.35), 0 1px 2px -1px rgb(0 0 0 / 0.35)",
        "m3-2": "0 4px 8px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4)",
        "m3-3": "0 12px 24px -4px rgb(0 0 0 / 0.5), 0 4px 8px -4px rgb(0 0 0 / 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
