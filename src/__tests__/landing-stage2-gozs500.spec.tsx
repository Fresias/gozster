import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import HomePage from "../app/page";
import EntrenadoresPage from "../app/entrenadores/page";

const leer = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
const bloque = (h: string, testid: string) => h.split(`data-testid="${testid}"`)[1] ?? "";

describe("GOZS-500: L4 · Capturas del producto legibles en mobile (/entrenadores 01, 03, 04 y / 07) (stage 2)", () => {
  const homeHtml = renderToStaticMarkup(createElement(HomePage));
  const entrenadoresHtml = renderToStaticMarkup(createElement(EntrenadoresPage));
  const homeCode = leer("../app/page.tsx");
  const entrenadoresCode = leer("../app/entrenadores/page.tsx");

  describe("1. /entrenadores sección 01 (Tu día)", () => {
    it("muestra captura mobile dentro de un marco de teléfono (sm:hidden)", () => {
      expect(entrenadoresHtml).toContain("/landing/studio-movil.jpg");
      expect(entrenadoresCode).toContain('imgMovil: "/landing/studio-movil.jpg"');
      expect(entrenadoresCode).toMatch(
        /className="mx-auto w-full max-w-\[230px\] rounded-\[2\.2rem\] border border-foreground\/20 bg-foreground p-2 shadow-2xl sm:hidden"/
      );
      expect(entrenadoresCode).toContain('className="max-h-[330px] w-full rounded-[1.7rem] object-cover object-top"');
    });

    it("en desktop (>= sm) oculta el marco de teléfono y muestra Tilt con captura de escritorio", () => {
      expect(entrenadoresCode).toContain('${pantalla.imgMovil ? "hidden sm:block" : ""}');
    });
  });

  describe("2. /entrenadores secciones 03 (Cada alumno) y 04 (Clases y cuotas)", () => {
    it("definen foco para recortar el menú lateral en mobile", () => {
      expect(entrenadoresCode).toContain('foco: { x: "10%", y: "0%" }');
      expect(entrenadoresCode).toContain('foco: { x: "10%", y: "19%" }');
    });

    it("aplican recorte a 240% con max-h-[260px] y variables CSS --shot-x / --shot-y", () => {
      expect(entrenadoresHtml).toContain("--shot-x:10%");
      expect(entrenadoresHtml).toContain("--shot-y:0%");
      expect(entrenadoresHtml).toContain("--shot-y:19%");
      expect(entrenadoresCode).toContain('-ml-[var(--shot-x)] -mt-[var(--shot-y)] h-auto w-[240%] max-w-none sm:m-0 sm:w-full');
      expect(entrenadoresCode).toContain('max-h-[260px]');
    });

    it("en desktop (>= sm) restauran margen a 0 y ancho al 100% (sm:m-0 sm:w-full sm:max-h-none)", () => {
      expect(entrenadoresCode).toContain("sm:m-0 sm:w-full");
      expect(entrenadoresCode).toContain("sm:max-h-none");
    });
  });

  describe("3. /entrenadores sección 02 (Tus planes) no modificada", () => {
    it("conserva w-[165%] y max-h-[220px] al no tener foco ni imgMovil", () => {
      const seccionPlanes = entrenadoresHtml.split('id="studio-rutinas"')[1]?.split("</section>")[0] ?? "";
      expect(seccionPlanes).toContain("max-h-[220px]");
      expect(seccionPlanes).toContain("w-[165%]");
      expect(seccionPlanes).not.toContain("--shot-x");
      expect(seccionPlanes).not.toContain("/landing/studio-movil.jpg");
    });
  });

  describe("4. / sección 07 (Coach Studio - puente)", () => {
    it("muestra la captura mobile studio-movil.jpg dentro del marco de teléfono en mobile (sm:hidden)", () => {
      const puente = bloque(homeHtml, "puente-entrenadores").split("</section>")[0] ?? "";
      expect(puente).toContain("/landing/studio-movil.jpg");
      expect(homeCode).toMatch(
        /className="mx-auto w-full max-w-\[230px\] rounded-\[2\.2rem\] border border-foreground\/20 bg-foreground p-2 shadow-2xl sm:hidden"/
      );
      expect(homeCode).toContain('className="max-h-[330px] w-full rounded-[1.7rem] object-cover object-top"');
    });

    it("Tilt de escritorio está oculto en mobile y visible en desktop (hidden sm:block)", () => {
      expect(homeCode).toContain('className="hidden sm:block lg:-mr-[30%]"');
      expect(homeHtml).toContain("/landing/studio-inicio.jpg");
    });
  });

  describe("5. Conservación de atributos y accesibilidad en imágenes", () => {
    it("las capturas de producto de las secciones L4 conservan width, height, loading=lazy y texto alternativo descriptivo", () => {
      const seccionPuente = bloque(homeHtml, "puente-entrenadores").split("</section>")[0] ?? "";
      const seccionesStudio = (entrenadoresHtml.match(/data-testid="studio-pantalla"[\s\S]*?<\/figure>/g) ?? []).join("");
      const imgs = [...seccionPuente.matchAll(/<img[^>]+>/g), ...seccionesStudio.matchAll(/<img[^>]+>/g)].map((m) => m[0]);

      expect(imgs.length).toBeGreaterThanOrEqual(5); // 01 (mobile + desktop), 02, 03, 04, y puente (mobile + desktop)
      for (const img of imgs) {
        expect(img).toContain('loading="lazy"');
        expect(img).toMatch(/alt="[^"]+"/);
        expect(img).toMatch(/width="?\d+"?/);
        expect(img).toMatch(/height="?\d+"?/);
      }
    });

    it("el marco del teléfono en mobile usa foreground en vez de zinc-*", () => {
      const marcoTelefonoRegex = /rounded-\[2\.2rem\][^"]*border-foreground\/20 bg-foreground/;
      expect(entrenadoresCode).toMatch(marcoTelefonoRegex);
      expect(homeCode).toMatch(marcoTelefonoRegex);
    });
  });
});
