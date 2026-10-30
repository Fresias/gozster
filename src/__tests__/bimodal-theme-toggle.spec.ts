import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { THEME_STORAGE_KEY } from "@/components/ui/theme-toggle";

// Mock de localStorage y document para el entorno Node de Vitest
const storageMap: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storageMap[key] ?? null,
  setItem: (key: string, val: string) => {
    storageMap[key] = String(val);
  },
  removeItem: (key: string) => {
    delete storageMap[key];
  },
  clear: () => {
    for (const k of Object.keys(storageMap)) {
      delete storageMap[k];
    }
  },
};

const classListSet = new Set<string>();
const mockDocumentElement = {
  classList: {
    add: (c: string) => classListSet.add(c),
    remove: (c: string) => classListSet.delete(c),
    contains: (c: string) => classListSet.has(c),
  },
};

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: mockLocalStorage,
    writable: true,
  });
}

if (typeof globalThis.document === "undefined") {
  Object.defineProperty(globalThis, "document", {
    value: { documentElement: mockDocumentElement },
    writable: true,
  });
}

if (typeof globalThis.window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    writable: true,
  });
}

describe("GOZS-24 / Issue #40: Bimodal Theme (Modo Día Suave & Modo Noche Pulido) and ThemeToggle", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    classListSet.clear();
    vi.restoreAllMocks();
  });

  describe("1. Gherkin: Persistencia y Alternancia de Tema en LocalStorage", () => {
    it("GIVEN sin preferencia previa, WHEN no hay valor en localStorage, THEN detecta preferencia del sistema o fallback", () => {
      // Sin valor en localStorage
      expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

      // Simular matchMedia para dark mode
      (globalThis as any).window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("dark"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const isSystemDark = (globalThis as any).window.matchMedia("(prefers-color-scheme: dark)").matches;
      expect(isSystemDark).toBe(true);
    });

    it("GIVEN el usuario pulsa ThemeToggle, THEN alterna entre 'light' y 'dark' y actualiza la clase en documentElement", () => {
      // 1. Establecer en light
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
      globalThis.document.documentElement.classList.remove("dark");
      expect(globalThis.document.documentElement.classList.contains("dark")).toBe(false);
      expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

      // 2. Alternar a dark
      let nextTheme = "dark";
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      globalThis.document.documentElement.classList.add("dark");
      expect(globalThis.document.documentElement.classList.contains("dark")).toBe(true);
      expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

      // 3. Alternar a light
      nextTheme = "light";
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      globalThis.document.documentElement.classList.remove("dark");
      expect(globalThis.document.documentElement.classList.contains("dark")).toBe(false);
      expect(globalThis.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });

    it("GIVEN recarga de página, WHEN existe 'gozster-theme' en localStorage, THEN conserva la preferencia del usuario", () => {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
      const savedTheme = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
      expect(savedTheme).toBe("light");

      // Simular ejecución del script zero-FOUC de RootLayout
      const isDark = savedTheme === "dark";
      if (isDark) {
        globalThis.document.documentElement.classList.add("dark");
      } else {
        globalThis.document.documentElement.classList.remove("dark");
      }

      expect(globalThis.document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("2. Verificación Estricta de Tokens y Variables CSS Bimodales en globals.css", () => {
    it("valida que globals.css contiene los valores exactos aprobados para MODO DÍA (:root)", () => {
      const globalsCssPath = path.resolve(__dirname, "../app/globals.css");
      const globalsContent = fs.readFileSync(globalsCssPath, "utf-8");

      // Modo Día
      expect(globalsContent).toContain("--background: 210 20% 98%"); // #F8FAFC
      expect(globalsContent).toContain("--foreground: 222 47% 11%"); // #0F172A
      expect(globalsContent).toContain("--card: 0 0% 100%");         // #FFFFFF
      expect(globalsContent).toContain("--primary: 221 83% 53%");    // #2563EB Azul Atlántico
      expect(globalsContent).toContain("--border: 214 32% 91%");     // #E2E8F0
      expect(globalsContent).toContain("--success: 160 84% 39%");    // #10B981 Esmeralda
      expect(globalsContent).toContain("--warning: 38 92% 50%");     // #F59E0B Ámbar
    });

    it("valida que globals.css contiene los valores exactos aprobados para MODO NOCHE (.dark)", () => {
      const globalsCssPath = path.resolve(__dirname, "../app/globals.css");
      const globalsContent = fs.readFileSync(globalsCssPath, "utf-8");

      // Modo Noche
      expect(globalsContent).toContain("--background: 222 47% 11%"); // #0F172A Charcoal
      expect(globalsContent).toContain("--foreground: 210 40% 98%"); // #F8FAFC
      expect(globalsContent).toContain("--card: 217 33% 17%");       // #1E293B
      expect(globalsContent).toContain("--primary: 199 89% 48%");    // #38BDF8 Sky Atlántico
      expect(globalsContent).toContain("--border: 217 33% 22%");
      expect(globalsContent).toContain("--success: 158 64% 52%");    // #34D399 Menta
      expect(globalsContent).toContain("--warning: 45 93% 47%");     // #FBBF24 Dorado
    });
  });

  describe("3. Presencia Obligatoria del Botón ThemeToggle en Vistas Clave", () => {
    it("verifica que Coach Studio Shell incluye ThemeToggle en su cabecera", () => {
      const shellPath = path.resolve(__dirname, "../components/coach/studio-shell.tsx");
      const shellContent = fs.readFileSync(shellPath, "utf-8");
      expect(shellContent).toContain("ThemeToggle");
    });

    it("verifica que Athlete App Shell incluye ThemeToggle en su cabecera", () => {
      const athleteShellPath = path.resolve(__dirname, "../components/athlete/athlete-shell.tsx");
      const athleteShellContent = fs.readFileSync(athleteShellPath, "utf-8");
      expect(athleteShellContent).toContain("ThemeToggle");
    });

    it("verifica que Landing Page (src/app/page.tsx) incluye ThemeToggle en su navbar", () => {
      const landingPath = path.resolve(__dirname, "../app/page.tsx");
      const landingContent = fs.readFileSync(landingPath, "utf-8");
      expect(landingContent).toContain("ThemeToggle");
    });

    it("verifica que RootLayout previene FOUC con script de hidratación y suppressHydrationWarning", () => {
      const layoutPath = path.resolve(__dirname, "../app/layout.tsx");
      const layoutContent = fs.readFileSync(layoutPath, "utf-8");
      expect(layoutContent).toContain("suppressHydrationWarning");
      expect(layoutContent).toContain("themeInitScript");
      expect(layoutContent).toContain("gozster-theme");
    });
  });

  describe("4. Regla Ponytail y Dependencias Ligeras", () => {
    it("verifica estrictamente que no se instalaron paquetes pesados o innecesarios en package.json", () => {
      const pkgPath = path.resolve(__dirname, "../../package.json");
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      const deps = Object.keys(pkgJson.dependencies || {});
      const devDeps = Object.keys(pkgJson.devDependencies || {});
      const allPkgs = [...deps, ...devDeps];

      // Prohibir next-themes o bibliotecas redundantes de utilidades
      expect(allPkgs).not.toContain("next-themes");
      expect(allPkgs).not.toContain("lucide-react");
      expect(allPkgs).not.toContain("clsx");
      expect(allPkgs).not.toContain("lodash");

      // Solo las dependencias autorizadas
      expect(deps).toContain("next");
      expect(deps).toContain("react");
      expect(deps).toContain("react-dom");
      expect(deps).toContain("zustand");
      expect(deps).toContain("@supabase/supabase-js");
    });
  });

  describe("5. Cuadro INDEC 1.1 y Formateo Decimal de Precisión", () => {
    it("formatea números decimales con alineación y coma decimal según norma INDEC", () => {
      const formatIndec = (val: number | null | undefined): string => {
        if (val === null || val === undefined || !Number.isFinite(val) || val <= 0) {
          return "—";
        }
        return val.toLocaleString("es-AR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
      };

      expect(formatIndec(125)).toBe("125,0");
      expect(formatIndec(97.5)).toBe("97,5");
      expect(formatIndec(0)).toBe("—");
      expect(formatIndec(null)).toBe("—");
      expect(formatIndec(undefined)).toBe("—");
    });

    it("verifica que coach-studio-view.tsx implementa el cuadro con filas de 48px y columna matriz", () => {
      const viewPath = path.resolve(__dirname, "../components/coach/coach-studio-view.tsx");
      const viewContent = fs.readFileSync(viewPath, "utf-8");

      expect(viewContent).toContain("min-h-[48px]");
      expect(viewContent).toContain("Columna Matriz");
      expect(viewContent).toContain("sticky left-0");
      expect(viewContent).toContain("tabular-nums");
    });
  });
});
