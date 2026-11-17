// Captura del ANTES: recorre /athlete con el alumno de prueba (solo lectura), guarda
// la captura PNG, el DOM renderizado (markup real del JSX) y las cajas de los bloques.
// Uso: node tools/capture.mjs [filtro-de-escenario]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, BASE, STATE, soloLectura, login } from "./session.mjs";
import { servidorEjemplo } from "./fixtures.mjs";
import { ESCENARIOS } from "./escenarios.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const OUT_DOM = path.join(RAIZ, "tools", "dom");
const OUT_PNG = path.join(RAIZ, "png", "antes");
fs.mkdirSync(OUT_DOM, { recursive: true });
fs.mkdirSync(OUT_PNG, { recursive: true });
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const filtro = process.argv[2] || "";

export const VIEWPORTS = {
  movil: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

/** storageState sin los stores persistidos del alumno (solo queda la sesión). */
function estadoLimpio() {
  const s = JSON.parse(fs.readFileSync(STATE, "utf8"));
  for (const o of s.origins || []) o.localStorage = (o.localStorage || []).filter((kv) => !kv.name.startsWith("gozster-"));
  return s;
}

/** Texto que nunca debe aparecer en una captura: el email y el nombre/plan reales del alumno de prueba.
 *  Se leen en tiempo de ejecución (nunca se imprimen ni se guardan). */
const PROHIBIDOS = [process.env.FE_alumno_mail].filter(Boolean);

async function userId(browser) {
  const ctx = await browser.newContext({ storageState: estadoLimpio() });
  await soloLectura(ctx, []);
  const page = await ctx.newPage();
  page.on("response", async (r) => {
    if (!/\/rest\/v1\/(perfiles|planes_entrenamiento)\?/.test(r.url())) return;
    const filas = await r.json().catch(() => []);
    for (const f of Array.isArray(filas) ? filas : []) {
      for (const v of [f.nombre_completo, f.nombre]) if (typeof v === "string" && v.trim().length > 3) PROHIBIDOS.push(...v.split(/\s+/).filter((w) => w.length > 3));
    }
  });
  await page.goto(`${BASE}/athlete`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("gozster-athlete-store:")), null, { timeout: 60000 });
  const id = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith("gozster-athlete-store:")).split(":")[1]);
  await ctx.close();
  return id;
}

export const SERIALIZAR = () => {
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (el.type === "checkbox" || el.type === "radio") el.toggleAttribute("checked", el.checked);
    else if (el.tagName === "SELECT") for (const o of el.options) o.toggleAttribute("selected", o.selected);
    else if (el.tagName === "TEXTAREA") el.textContent = el.value;
    else el.setAttribute("value", el.value);
  }
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("script, next-route-announcer, nextjs-portal, template, link, style, noscript").forEach((n) => n.remove());
  return {
    html: clone.innerHTML,
    bodyClass: document.body.className,
    htmlClass: document.documentElement.className.replace(/\bdark\b/, "").trim(),
    scrollHeight: document.documentElement.scrollHeight,
  };
};

/** Cajas de los bloques: clave = ruta de índices desde <body> (idéntica en el mockup). */
export const CAJAS = () => {
  const sel = "[data-testid], header, nav, main, main > *, main > * > *, aside, [role=dialog], [role=status], h1, h2, h3, button, a, input, label, section, article, li";
  const ruta = (el) => {
    const r = [];
    while (el && el !== document.body) { r.unshift([...el.parentElement.children].indexOf(el)); el = el.parentElement; }
    return r.join(".");
  };
  const out = {};
  for (const el of document.body.querySelectorAll(sel)) {
    if (el.closest("nextjs-portal, #mockup-ui")) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    out[ruta(el)] = {
      x: Math.round(b.x + scrollX), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height),
      id: el.getAttribute("data-testid") || el.tagName.toLowerCase(),
      txt: (el.innerText || el.getAttribute("aria-label") || "").trim().split("\n")[0].slice(0, 40),
    };
  }
  return out;
};

async function capturarEscenario(browser, uid, esc, modo, vpName) {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({ storageState: estadoLimpio(), ...vp, reducedMotion: "reduce", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  const bloqueadas = [];
  await soloLectura(ctx, bloqueadas);
  const srv = servidorEjemplo(SB, uid, esc.datos || {});
  await ctx.route("**/*", srv.handler);
  const seed = { onboardingCompletado: true, mostrarTimerDescanso: true, membershipStatus: "ACTIVE", ...(esc.store || {}) };
  await ctx.addInitScript(({ modo, uid, seed, extra }) => {
    if (sessionStorage.getItem("__seed")) return;
    sessionStorage.setItem("__seed", "1");
    localStorage.setItem("gozster-theme", modo);
    localStorage.setItem(`gozster-athlete-store:${uid}`, JSON.stringify({ state: seed, version: 2 }));
    for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(`${k}:${uid}`, JSON.stringify(v));
  }, { modo, uid, seed, extra: esc.storesExtra });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-11-17T10:30:00-03:00")).catch(() => {});
  await page.goto(`${BASE}${esc.ruta}`, { waitUntil: "load", timeout: 120000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  if (esc.esperar) {
    // Reintento único: a veces el plan llega después de la rehidratación del store y no se pinta.
    try { await page.waitForSelector(esc.esperar, { timeout: 30000 }); }
    catch { await page.reload({ waitUntil: "load" }); await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); await page.waitForSelector(esc.esperar, { timeout: 45000 }); }
  }
  await page.waitForTimeout(esc.espera ?? 2500);
  if (esc.pasos) await esc.pasos(page, ctx);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
  const texto = await page.evaluate(() => document.body.innerText);
  const filtrados = PROHIBIDOS.filter((p) => texto.includes(p));
  if (filtrados.length) throw new Error(`[${esc.id}] la captura contiene datos reales (${filtrados.length} coincidencias)`);
  const nombre = `${esc.id}-${vpName}-${modo}`;
  // Se mide antes de la captura: el screenshot de página completa redimensiona el viewport.
  await page.evaluate(() => window.scrollTo(0, 0)); // el render del mockup arranca sin scroll
  await page.waitForTimeout(300);
  const dom = await page.evaluate(SERIALIZAR);
  const cajas = await page.evaluate(CAJAS);
  await page.screenshot({ path: path.join(OUT_PNG, `${nombre}.png`), fullPage: true, animations: "disabled" });
  fs.writeFileSync(path.join(OUT_DOM, `${nombre}.json`), JSON.stringify({ ...dom, cajas, viewport: vpName, modo, ruta: esc.ruta }, null, 0));
  await ctx.close();
  return { bloqueadas, sinDatos: [...srv.sinDatos] };
}

const browser = await chromium.launch();
if (!fs.existsSync(STATE)) {
  const ok = await login(browser);
  if (!ok) throw new Error("login falló dos veces");
}
const uid = await userId(browser);
const log = [];
const filtros = filtro.split(",").filter(Boolean);
const coincide = (id) => !filtros.length || filtros.some((f) => (f.startsWith("=") ? id === f.slice(1) : id.includes(f)));
for (const esc of ESCENARIOS.filter((e) => e.captura !== false && coincide(e.id))) {
  for (const vpName of esc.viewports || ["movil"]) {
    for (const modo of ["light", "dark"]) {
      try {
        const r = await capturarEscenario(browser, uid, esc, modo, vpName);
        log.push({ id: esc.id, vpName, modo, ok: true, ...r });
        console.log("OK", esc.id, vpName, modo, r.bloqueadas.length ? `escrituras bloqueadas: ${r.bloqueadas.length}` : "", r.sinDatos.join(","));
      } catch (e) {
        log.push({ id: esc.id, vpName, modo, ok: false, error: String(e.message).split("\n")[0] });
        console.log("ERROR", esc.id, vpName, modo, String(e.message).split("\n")[0]);
      }
    }
  }
}
const prev = fs.existsSync(path.join(OUT_DOM, "_log.json")) ? JSON.parse(fs.readFileSync(path.join(OUT_DOM, "_log.json"), "utf8")) : [];
const merged = [...prev.filter((p) => !log.some((l) => l.id === p.id && l.vpName === p.vpName && l.modo === p.modo)), ...log];
fs.writeFileSync(path.join(OUT_DOM, "_log.json"), JSON.stringify(merged, null, 1));
await browser.close();
