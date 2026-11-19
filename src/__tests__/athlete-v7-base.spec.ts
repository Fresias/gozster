import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

describe("Athlete v7 · FE-01 Base visual (fuentes, tokens, tipografía y elevación)", () => {
  const layoutSrc = read("src/app/(athlete)/athlete/layout.tsx");
  const cssSrc = read("src/app/(athlete)/athlete/athlete-v7.css");
  const globalsSrc = read("src/app/globals.css");
  const tailwindSrc = read("tailwind.config.ts");
  const pkgJson = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("layout.tsx carga Archivo, Geist y Geist Mono con next/font/local (sin next/font/google) y sus variables CSS", () => {
    expect(layoutSrc).toContain('from "next/font/local"');
    expect(layoutSrc).not.toContain("next/font/google");
    expect(layoutSrc).toContain("./fonts/archivo-latin.woff2");
    expect(layoutSrc).toContain("./fonts/geist-latin.woff2");
    expect(layoutSrc).toContain("./fonts/geist-mono-latin.woff2");
    expect(layoutSrc).toContain('variable: "--a-f-display"');
    expect(layoutSrc).toContain('variable: "--a-f-sans"');
    expect(layoutSrc).toContain('variable: "--a-f-mono"');
    expect(layoutSrc).toContain('display: "swap"');
    expect(layoutSrc).toContain('weight: "800 900"');
    expect(layoutSrc).toContain('weight: "400 700"');
    expect(layoutSrc).toContain('weight: "600 700"');
    expect(layoutSrc).toContain("62% 125%");
    expect(layoutSrc).toContain('import "./athlete-v7.css"');

    for (const file of [
      "src/app/(athlete)/athlete/fonts/archivo-latin.woff2",
      "src/app/(athlete)/athlete/fonts/geist-latin.woff2",
      "src/app/(athlete)/athlete/fonts/geist-mono-latin.woff2",
    ]) {
      const buf = readFileSync(resolve(ROOT, file));
      expect(buf.subarray(0, 4).toString("ascii"), `${file} debe ser WOFF2 válido`).toBe("wOF2");
    }
    expect(read("src/app/(athlete)/athlete/fonts/OFL.txt")).toContain("SIL OPEN FONT LICENSE");
  });

  it("layout.tsx envuelve la app del alumno en .theme-athlete con data-v7 y las 3 variables de fuente", () => {
    expect(layoutSrc).toContain("theme-athlete");
    expect(layoutSrc).toContain("archivo.variable");
    expect(layoutSrc).toContain("geist.variable");
    expect(layoutSrc).toContain("geistMono.variable");
    expect(layoutSrc).toMatch(/data-v7(=["']{2})?/);
  });

  it("athlete-v7.css define el scope HSL claro y oscuro de shadcn bajo .theme-athlete[data-v7]", () => {
    expect(cssSrc).toContain("body:has(.theme-athlete[data-v7])");
    expect(cssSrc).toContain(".dark body:has(.theme-athlete[data-v7])");
    expect(cssSrc).toContain(".theme-athlete[data-v7]");
    expect(cssSrc).toContain(".dark .theme-athlete[data-v7]");

    // Claro: papel #FAFAFA, tinta #09090B, tarjeta #FFFFFF
    expect(cssSrc).toContain("--background: 0 0% 98%;");
    expect(cssSrc).toContain("--foreground: 240 10% 3.9%;");
    expect(cssSrc).toContain("--primary: 240 10% 3.9%;");
    expect(cssSrc).toContain("--primary-foreground: 0 0% 98%;");
    expect(cssSrc).toContain("--card: 0 0% 100%;");
    expect(cssSrc).toContain("--success: 164 100% 31%;");
    expect(cssSrc).toContain("--success-soft: 159 43.6% 92.4%;");
    expect(cssSrc).toContain("--destructive: 0 72.2% 50.6%;");

    // Oscuro: tinta #09090B, papel #FAFAFA, tarjeta #18181B
    expect(cssSrc).toContain("--background: 240 10% 3.9%;");
    expect(cssSrc).toContain("--foreground: 0 0% 98%;");
    expect(cssSrc).toContain("--card: 240 5.9% 10%;");
    expect(cssSrc).toContain("--popover: 240 5.4% 14.5%;");
    expect(cssSrc).toContain("--success-soft: 166 76.9% 10.2%;");
  });

  it("athlete-v7.css define los tokens --a-* de la paleta p1 (verde, oro y tinta), héroe invertido y elevación 1..3", () => {
    const tokensRequeridos = [
      "--a-bg:",
      "--a-surface:",
      "--a-surface-l2:",
      "--a-surface-l3:",
      "--a-surface-2:",
      "--a-fg:",
      "--a-fg-2:",
      "--a-fg-3:",
      "--a-line:",
      "--a-line-strong:",
      "--a-primary:",
      "--a-on-primary:",
      "--a-sel:",
      "--a-on-sel:",
      "--a-sel-soft:",
      "--a-sel-line:",
      "--a-silver:",
      "--a-silver-2:",
      "--a-link:",
      "--a-tip:",
      "--a-tip-fg:",
      "--a-chev:",
      "--a-hatch:",
      "--a-ok-bg:",
      "--a-ok-fg:",
      "--a-ok-ic:",
      "--a-ok-on:",
      "--a-ok-line:",
      "--a-rec-bg:",
      "--a-rec-fg:",
      "--a-rec-ic:",
      "--a-warn-bg:",
      "--a-warn-fg:",
      "--a-warn-line:",
      "--a-warn-ic:",
      "--a-warn-on:",
      "--a-bad:",
      "--a-on-bad:",
      "--a-bad-fg:",
      "--a-bad-soft:",
      "--a-hero:",
      "--a-on-hero:",
      "--a-hero-2:",
      "--a-hero-btn:",
      "--a-on-hero-btn:",
      "--a-hero-line:",
      "--a-elev-1:",
      "--a-elev-2:",
      "--a-elev-3:",
    ];
    for (const token of tokensRequeridos) {
      expect(cssSrc, `Falta token ${token}`).toContain(token);
    }

    // Paleta p1 exacta y elevación Material
    expect(cssSrc).toContain("--a-ok-ic: #009E73;");
    expect(cssSrc).toContain("--a-rec-bg: #FFF6DA;");
    expect(cssSrc).toContain("--a-rec-ic: #A87B0B;");
    expect(cssSrc).toContain("--a-rec-bg: #2A2208;");
    expect(cssSrc).toContain("--a-rec-ic: #D4A72C;");
    expect(cssSrc).toContain("0 1px 2px rgba(9, 9, 11, 0.06), 0 1px 3px 1px rgba(9, 9, 11, 0.04)");
    expect(cssSrc).toContain("0 1px 2px rgba(9, 9, 11, 0.08), 0 3px 8px 2px rgba(9, 9, 11, 0.08)");
    expect(cssSrc).toContain("0 6px 14px 4px rgba(9, 9, 11, 0.1), 0 2px 4px rgba(9, 9, 11, 0.12)");
    expect(cssSrc).toContain("0 8px 18px 6px rgba(0, 0, 0, 0.45), 0 3px 6px rgba(0, 0, 0, 0.5)");
  });

  it("athlete-v7.css define las 11 clases tipográficas .a-t-*, fuentes base, clases .a-* y reduced-motion", () => {
    expect(cssSrc).toContain("font-family: var(--a-f-sans)");
    expect(cssSrc).toContain(".theme-athlete[data-v7] .font-mono");
    expect(cssSrc).toContain("font-family: var(--a-f-mono)");

    const clasesTipograficas = [
      ".a-t-dxl",
      ".a-t-d",
      ".a-t-h",
      ".a-t-ml",
      ".a-t-mi",
      ".a-t-mm",
      ".a-t-title",
      ".a-t-bs",
      ".a-t-body",
      ".a-t-sec",
      ".a-t-label",
    ];
    for (const cls of clasesTipograficas) {
      expect(cssSrc, `Falta clase tipográfica ${cls}`).toContain(`.theme-athlete[data-v7] ${cls}`);
    }

    const clasesComponentes = [
      ".a-app",
      ".a-chev",
      ".a-card",
      ".a-hero",
      ".a-btn.a-hbtn",
      ".a-row",
      ".a-btn",
      ".a-btn.a-gym",
      ".a-chip",
      ".a-bnav",
      ".a-restbar",
      ".a-sheet",
      ".a-toast",
      ".a-setcard",
      ".a-stepper",
      ".a-val",
      ".a-sug",
      ".a-last",
      ".a-kgwarn",
      ".a-appr",
    ];
    for (const cls of clasesComponentes) {
      expect(cssSrc, `Falta clase de componente ${cls}`).toContain(`.theme-athlete[data-v7] ${cls}`);
    }

    expect(cssSrc).toContain("@media (prefers-reduced-motion: reduce)");
    expect(cssSrc).toContain("transition: none !important;");
    expect(cssSrc).toContain("animation: none !important;");
    expect(cssSrc).not.toMatch(/#2563EB|#0EA5E9/i);
  });

  it("mantiene globals.css, tailwind.config.ts y package.json sin cambios de v7", () => {
    expect(globalsSrc).not.toContain("data-v7");
    expect(globalsSrc).not.toContain("--a-bg");
    expect(tailwindSrc).not.toContain("--a-");
    expect(tailwindSrc).not.toContain("Archivo");
    expect(Object.keys(pkgJson.dependencies ?? {}).sort()).toEqual([
      "@supabase/ssr",
      "@supabase/supabase-js",
      "next",
      "react",
      "react-dom",
      "zustand",
    ]);
  });
});
