// Genera los HTML del ANTES (CSS actual) y del DESPUÉS (propuesta) a partir del DOM real
// capturado (tools/dom) y de los fragmentos renderizados desde el código (tools/ssr).
// Uso: node tools/build.mjs [filtro]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./session.mjs";
import { PROPUESTA_CSS, transformar } from "./propuesta.mjs";
import { ESCENARIOS } from "./escenarios.mjs";
import { codificarAnidados, RECONSTRUIR_JS } from "./anidados.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const REPO = path.resolve(RAIZ, "../../..");
const filtro = process.argv[2] || "";

// ---------- CSS: globals.css tal cual, salvo el bloque .theme-athlete de variables ----------
const globals = fs.readFileSync(path.join(REPO, "src/app/globals.css"), "utf8").replace(/\r\n/g, "\n");
const BLOQUE_P01 = /\/\* Athlete App y landing: envolver su raíz en \.theme-athlete \(P01\) \*\/\n[\s\S]*?--rest-timer-fill-bg-paused: var\(--warning-soft-foreground\);\n}\n/;
const BLOQUE_448 = /\/\* Capas de superficie de Coach Studio:[^\n]*\n\.theme-athlete \{ --background: 0 0% 98%; \}\n\.dark \.theme-athlete \{[^\n]*\}\n/;
const actualP01 = globals.match(BLOQUE_P01)?.[0];
const actual448 = globals.match(BLOQUE_448)?.[0];
if (!actualP01 || !actual448) throw new Error("No se encontró el bloque .theme-athlete en globals.css");
const BASE_CSS = globals.replace(BLOQUE_P01, "").replace(BLOQUE_448, "");
const ACTUAL_CSS = `${actualP01}\n${actual448}`;

// ---------- tailwind.config.ts → objeto (mismo theme.extend) ----------
const twSrc = fs.readFileSync(path.join(REPO, "tailwind.config.ts"), "utf8")
  .replace(/^import type .*$/m, "").replace("const config: Config =", "return").replace(/export default config;?/, "");
const TW = new Function(twSrc)();
const TW_CONFIG = JSON.stringify({ darkMode: TW.darkMode, theme: TW.theme, plugins: [] });

// ---------- assets de public/ referenciados ----------
function assets(html) {
  return html.replace(/(src|href)="\/(brand|landing|icons|images)\/([^"]+)"/g, (_m, attr, dir, file) => {
    const origen = path.join(REPO, "public", dir, file);
    const destino = path.join(RAIZ, "assets", dir, file);
    if (fs.existsSync(origen) && !fs.existsSync(destino)) { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.copyFileSync(origen, destino); }
    return `${attr}="../assets/${dir}/${file}"`;
  });
}

const escapar = (s) => s.replace(/<\/template>/g, "<\\/template>");

export function documento({ titulo, tipo, markup, htmlClass, bodyClass }) {
  const propuesta = tipo === "despues";
  return `<!doctype html>
<html lang="es" class="${htmlClass}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo} · ${propuesta ? "DESPUÉS (propuesta landing)" : "ANTES (CSS actual)"}</title>
<!-- Tailwind v3 (misma línea que el proyecto: ^3.4.17), theme.extend copiado de tailwind.config.ts -->
<script src="https://cdn.tailwindcss.com/3.4.17"></script>
<script>tailwind.config = ${TW_CONFIG};</script>
<!-- src/app/globals.css sin cambios, salvo los bloques .theme-athlete de variables (van abajo) -->
<style type="text/tailwindcss">
${BASE_CSS}
</style>
${propuesta
    ? `<!-- Bloque propuesto: reemplaza a ".theme-athlete (P01)" + "Capas de superficie (GOZS-448)" en globals.css -->\n<style id="propuesta">\n${PROPUESTA_CSS}\n</style>`
    : `<!-- Bloque actual de globals.css (P01 + GOZS-448) -->\n<style id="actual">\n${ACTUAL_CSS}</style>`}
<style>
#mockup-ui{position:fixed;right:8px;bottom:8px;z-index:2147483647;display:flex;gap:6px;font:600 12px/1 system-ui,sans-serif}
#mockup-ui button{border-radius:9999px;border:1px solid #a1a1aa;background:#fff;color:#18181b;padding:8px 12px;cursor:pointer}
html.captura #mockup-ui{display:none}
</style>
<script>
(function(){var q=location.hash.slice(1).split(",");if(q.indexOf("dark")>=0)document.documentElement.classList.add("dark");if(q.indexOf("captura")>=0)document.documentElement.classList.add("captura");})();
</script>
</head>
<body class="${bodyClass}">
${MARCA_INICIO}${codificarAnidados(markup.light)}${MARCA_FIN}
<div id="mockup-ui" aria-hidden="true">
<button type="button" onclick="mockupModo()">Claro / Oscuro</button>
<template id="markup-light">${escapar(codificarAnidados(markup.light))}</template>
<template id="markup-dark">${escapar(codificarAnidados(markup.dark))}</template>
</div>
<script>
// El markup de cada modo es el DOM real de ese modo (p. ej. el ícono del ThemeToggle cambia).
${RECONSTRUIR_JS}
function mockupPintar(modo){var ui=document.getElementById("mockup-ui");Array.prototype.slice.call(document.body.childNodes).forEach(function(n){if(n!==ui&&!(n.tagName==="SCRIPT"))document.body.removeChild(n)});document.body.insertBefore(document.getElementById("markup-"+modo).content.cloneNode(true),ui);mockupAnidados();document.documentElement.classList.toggle("dark",mododark(modo));mockupDialogos();}
function mododark(m){return m==="dark"}
// Un <dialog open> estático no es modal: se reabre con showModal() como en la app (capa superior + backdrop).
function mockupDialogos(){Array.prototype.forEach.call(document.querySelectorAll("dialog[open]"),function(d){d.removeAttribute("open");try{d.showModal()}catch(e){d.setAttribute("open","")}})}
function mockupModo(){var d=!document.documentElement.classList.contains("dark");mockupPintar(d?"dark":"light");var q=location.hash.slice(1).split(",").filter(function(x){return x&&x!=="dark"&&x!=="light"});q.push(d?"dark":"light");history.replaceState(null,"","#"+q.join(","));}
if(document.documentElement.classList.contains("dark"))mockupPintar("dark");else{mockupAnidados();mockupDialogos();}
</script>
</body>
</html>
`;
}
const MARCA_INICIO = "";
const MARCA_FIN = "";

// ---------- pantallas a construir ----------
const DOM = path.join(AQUI, "dom");
const SSR = path.join(AQUI, "ssr");
const domDe = (id, vp, modo) => {
  const f = path.join(DOM, `${id}-${vp}-${modo}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
};

export const SSR_META = {
  "rest-timer": { grupo: "Entrenamiento en vivo", titulo: "Temporizador de descanso · activo" },
  "rest-timer-pausa": { grupo: "Entrenamiento en vivo", titulo: "Temporizador de descanso · en pausa" },
  "aviso-record": { grupo: "Entrenamiento en vivo", titulo: "Aviso de récord (Simple)" },
  "aviso-record-tecnica": { grupo: "Entrenamiento en vivo", titulo: "Aviso de récord (Técnica, con 1RM)" },
  "pain-banner-leve": { grupo: "Entrenamiento en vivo", titulo: "Banner de molestia · leve (1-3)" },
  "pain-banner-moderado": { grupo: "Entrenamiento en vivo", titulo: "Banner de molestia · moderada (4-6)" },
  "pain-banner-alto": { grupo: "Entrenamiento en vivo", titulo: "Banner de molestia · alta (7-9)" },
  "modal-cierre-dia": { grupo: "Modales", titulo: "Modal · cierre de día" },
  error: { grupo: "Shell", titulo: "error.tsx (límite de error de /athlete)" },
  habitos: { grupo: "Hábitos", titulo: "Hábitos (habit-tracker)" },
  nutricion: { grupo: "Nutrición", titulo: "Nutrición (nutrition-tracker)" },
  "modal-calculadora-discos": { grupo: "Modales", titulo: "Modal · calculadora de discos" },
  "modal-subida-video": { grupo: "Modales", titulo: "Modal · subida de video" },
};

export function pantallas() {
  const out = [];
  for (const e of ESCENARIOS) for (const vp of e.viewports || ["movil"]) out.push({ id: e.id, vp, grupo: e.grupo, titulo: e.titulo, fuente: "captura" });
  for (const f of fs.readdirSync(SSR).filter((x) => x.endsWith(".json"))) {
    const frag = JSON.parse(fs.readFileSync(path.join(SSR, f), "utf8"));
    out.push({ id: frag.id, vp: "movil", ...SSR_META[frag.id], fuente: "codigo", frag });
  }
  return out;
}

/** Inserta un fragmento renderizado desde el código dentro del DOM anfitrión (en el navegador). */
function insertar({ html, insertar }) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  window.mockupAnidados(tpl.content);
  const main = document.querySelector("main");
  if (insertar === "main-end") main.appendChild(tpl.content);
  else if (insertar === "main-replace") { main.replaceChildren(tpl.content); }
  else if (insertar === "body-end") document.body.insertBefore(tpl.content, document.getElementById("mockup-ui"));
  else if (insertar === "aviso-record") {
    const tabs = document.querySelector('[data-testid="tab-entrenar"]').closest('[role="tablist"]') || document.querySelector('[data-testid="tab-entrenar"]').parentElement;
    tabs.after(tpl.content);
  } else if (insertar === "pain-banner") {
    const fila = document.querySelector('[data-testid="volver-a-mis-dias-btn"]').parentElement.parentElement;
    fila.after(tpl.content);
  }
}

const SERIAL = () => {
  const ui = document.getElementById("mockup-ui");
  return [...document.body.childNodes].filter((n) => n !== ui && n.tagName !== "SCRIPT").map((n) => n.outerHTML ?? (n.nodeType === 3 ? n.textContent : "")).join("");
};

async function main() {
  const browser = await chromium.launch();
  fs.mkdirSync(path.join(RAIZ, "antes"), { recursive: true });
  fs.mkdirSync(path.join(RAIZ, "pantallas"), { recursive: true });
  const reporte = {};
  for (const p of pantallas().filter((x) => x.id.includes(filtro))) {
    const nombre = p.vp === "desktop" ? `${p.id}-desktop` : p.id;
    const markupAntes = {}, markupDespues = {};
    let meta = null;
    for (const modo of ["light", "dark"]) {
      const base = p.fuente === "captura" ? domDe(p.id, p.vp, modo) : domDe(p.frag.anfitrion, "movil", modo);
      if (!base) { console.log("sin DOM", nombre, modo); continue; }
      meta = base;
      const vp = p.vp === "desktop" ? { width: 1280, height: 800 } : { width: 390, height: 844 };
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: p.vp !== "desktop", hasTouch: p.vp !== "desktop", reducedMotion: "reduce" });
      const page = await ctx.newPage();
      const html = documento({ titulo: p.titulo, tipo: "antes", markup: { light: assets(base.html), dark: assets(base.html) }, htmlClass: base.htmlClass, bodyClass: base.bodyClass });
      const tmp = path.join(RAIZ, "antes", `__tmp.html`);
      fs.writeFileSync(tmp, html);
      await page.goto("file:///" + tmp.replace(/\\/g, "/") + (modo === "dark" ? "#dark" : ""), { waitUntil: "load" });
      await page.waitForTimeout(700);
      if (p.fuente === "codigo") { await page.evaluate(insertar, { html: codificarAnidados(p.frag.html), insertar: p.frag.insertar }); await page.waitForTimeout(400); }
      markupAntes[modo] = await page.evaluate(SERIAL);
      reporte[`${nombre}-${modo}`] = await page.evaluate(transformar);
      markupDespues[modo] = await page.evaluate(SERIAL);
      await ctx.close();
      fs.rmSync(tmp);
    }
    if (!markupAntes.light || !markupAntes.dark) continue;
    fs.writeFileSync(path.join(RAIZ, "antes", `${nombre}.html`), documento({ titulo: p.titulo, tipo: "antes", markup: markupAntes, htmlClass: meta.htmlClass, bodyClass: meta.bodyClass }));
    fs.writeFileSync(path.join(RAIZ, "pantallas", `${nombre}.html`), documento({ titulo: p.titulo, tipo: "despues", markup: markupDespues, htmlClass: meta.htmlClass, bodyClass: meta.bodyClass }));
    console.log("OK", nombre, JSON.stringify(reporte[`${nombre}-light`]));
  }
  const f = path.join(AQUI, "dom", "_reglas.json");
  const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...prev, ...reporte }, null, 1));
  await browser.close();
}

if (process.argv[1]?.endsWith("build.mjs")) await main();
