// Verificación: captura cada mockup (DESPUÉS) en el mismo viewport que el ANTES, compara las
// cajas de los bloques (tolerancia ±2 px) y mide el contraste WCAG de todo el texto visible.
// Para las pantallas renderizadas desde el código, el ANTES es antes/<id>.html (CSS actual).
// Uso: node tools/verify.mjs [filtro]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./session.mjs";
import { pantallas } from "./build.mjs";
import { CAJAS_FN, CONTRASTE_FN } from "./medir.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const filtro = process.argv[2] || "";
const TOL = 2;
const VPS = {
  movil: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
fs.mkdirSync(path.join(RAIZ, "png", "despues"), { recursive: true });
fs.mkdirSync(path.join(RAIZ, "png", "antes"), { recursive: true });

async function abrir(browser, archivo, vp, modo) {
  const ctx = await browser.newContext({ ...VPS[vp], reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("file:///" + archivo.replace(/\\/g, "/") + `#${modo},captura`, { waitUntil: "load" });
  await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)", null, { timeout: 30000 });
  // Animaciones congeladas en su estado final (pulsos y fades no deben alterar la medición).
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(600);
  return { ctx, page };
}

function comparar(a, d) {
  const difs = [];
  for (const [k, ca] of Object.entries(a)) {
    const cd = d[k];
    if (!cd) { difs.push({ k, id: ca.id, txt: ca.txt, falta: true }); continue; }
    const dx = cd.x - ca.x, dy = cd.y - ca.y, dw = cd.w - ca.w, dh = cd.h - ca.h;
    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh)) > TOL) difs.push({ k, id: ca.id, txt: ca.txt, dx, dy, dw, dh });
  }
  return difs;
}

const browser = await chromium.launch();
const resultado = fs.existsSync(path.join(AQUI, "dom", "_verificacion.json")) ? JSON.parse(fs.readFileSync(path.join(AQUI, "dom", "_verificacion.json"), "utf8")) : {};
const filtros = filtro.split(",").filter(Boolean);
for (const p of pantallas().filter((x) => !filtros.length || filtros.some((f) => (f.startsWith("=") ? x.id === f.slice(1) : x.id.includes(f))))) {
  const nombre = p.vp === "desktop" ? `${p.id}-desktop` : p.id;
  const fDespues = path.join(RAIZ, "pantallas", `${nombre}.html`);
  const fAntes = path.join(RAIZ, "antes", `${nombre}.html`);
  if (!fs.existsSync(fDespues)) continue;
  for (const modo of ["light", "dark"]) {
    const clave = `${p.id}-${p.vp}-${modo}`;
    // ANTES: captura real (tools/dom) o, si es render del código, el HTML con el CSS actual.
    let cajasAntes, contrasteAntes;
    const a = await abrir(browser, fAntes, p.vp, modo);
    contrasteAntes = await a.page.evaluate(CONTRASTE_FN);
    if (p.fuente === "captura") {
      const dom = JSON.parse(fs.readFileSync(path.join(AQUI, "dom", `${clave}.json`), "utf8"));
      cajasAntes = dom.cajas;
      // Control del método: el HTML del ANTES con el CSS actual debe calcar la captura real.
      const cajasRender = await a.page.evaluate(CAJAS_FN);
      resultado[clave] = { ...(resultado[clave] || {}), controlMetodo: comparar(cajasAntes, cajasRender).length };
    } else {
      cajasAntes = await a.page.evaluate(CAJAS_FN);
      await a.page.screenshot({ path: path.join(RAIZ, "png", "antes", `${clave}.png`), fullPage: true });
    }
    await a.ctx.close();

    const d = await abrir(browser, fDespues, p.vp, modo);
    await d.page.screenshot({ path: path.join(RAIZ, "png", "despues", `${clave}.png`), fullPage: true });
    const cajasDespues = await d.page.evaluate(CAJAS_FN);
    const contrasteDespues = await d.page.evaluate(CONTRASTE_FN);
    await d.ctx.close();
    const difs = comparar(cajasAntes, cajasDespues);
    resultado[clave] = {
      ...(resultado[clave] || {}),
      bloques: Object.keys(cajasAntes).length,
      fueraDeTolerancia: difs.length,
      difs: difs.slice(0, 40),
      contrasteAntes: { fallas: contrasteAntes.fallas.length, total: contrasteAntes.total, detalle: contrasteAntes.fallas.slice(0, 30) },
      contrasteDespues: { fallas: contrasteDespues.fallas.length, total: contrasteDespues.total, detalle: contrasteDespues.fallas.slice(0, 30) },
      clave: contrasteDespues.clave,
    };
    console.log(clave.padEnd(44), `bloques ${String(Object.keys(cajasAntes).length).padStart(4)}  ±2px fuera: ${String(difs.length).padStart(3)}  contraste AA fallas antes/después: ${contrasteAntes.fallas.length}/${contrasteDespues.fallas.length}`, resultado[clave].controlMetodo !== undefined ? ` control: ${resultado[clave].controlMetodo}` : "");
  }
}
fs.writeFileSync(path.join(AQUI, "dom", "_verificacion.json"), JSON.stringify(resultado, null, 1));
await browser.close();
