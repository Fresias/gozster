// Funciones que corren en el navegador: cajas de bloques y contraste WCAG.

/** Cajas de los bloques: clave = ruta de índices desde <body> (idéntica entre ANTES y DESPUÉS). */
export const CAJAS_FN = () => {
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

/** Contraste de todo texto visible (fondo efectivo = composición de los fondos de sus ancestros). */
export const CONTRASTE_FN = () => {
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const mezclar = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const fondo = (el) => {
    const cadena = [];
    for (let e = el; e; e = e.parentElement) cadena.unshift(e);
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    let gradiente = false;
    for (const e of cadena) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") gradiente = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) bg = mezclar(c, bg);
    }
    return { bg, gradiente };
  };
  const opacidad = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity || "1"); return o; };
  const medirTexto = (el) => {
    const cs = getComputedStyle(el);
    const { bg, gradiente } = fondo(el);
    const fg0 = parse(cs.color);
    const fg = mezclar({ ...fg0, a: fg0.a * opacidad(el) }, bg);
    const size = parseFloat(cs.fontSize);
    const grande = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    return { ratio: Math.round(ratio(fg, bg) * 100) / 100, min: grande ? 3 : 4.5, fg: hex(fg), bg: hex(bg), gradiente };
  };

  const fallas = [];
  let total = 0;
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("#mockup-ui, script, style, template, svg")) continue;
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!propio) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (el.closest(":disabled, [aria-disabled=true]")) continue;
    if (el.closest('[class*="sr-only"]')) continue;
    total++;
    const m = medirTexto(el);
    if (m.gradiente) continue;
    if (m.ratio < m.min) fallas.push({ txt: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 40), testid: el.closest("[data-testid]")?.getAttribute("data-testid") || null, ...m });
  }

  // Elementos clave pedidos por la tarea (texto 4.5:1 / UI 3:1).
  const clave = {};
  const texto = (nombre, sel) => { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width > 1) clave[nombre] = medirTexto(el); };
  const ui = (nombre, selA, selB) => {
    const a = document.querySelector(selA), b = document.querySelector(selB);
    if (!a || !b) return;
    const fa = fondo(a).bg, fb = fondo(b).bg;
    clave[nombre] = { ratio: Math.round(ratio(fa, fb) * 100) / 100, min: 3, fg: hex(fa), bg: hex(fb) };
  };
  texto("tab activa (texto)", 'nav[aria-label="Secciones Athlete"] a[aria-current="page"]');
  ui("tab activa vs barra", 'nav[aria-label="Secciones Athlete"] a[aria-current="page"]', 'nav[aria-label="Secciones Athlete"]');
  texto("chip Online/Modo Avión", "header [role=status]");
  texto("«Te toca hoy» (hero)", '[data-testid="hero-dia-hoy"] span');
  texto("botón Empezar Día", '[data-testid="empezar-dia-btn"] span');
  texto("botón Hacer otro día", '[data-testid="hacer-otro-dia-btn"] span');
  ui("botón Empezar vs tarjeta", '[data-testid="empezar-dia-btn"]', '[data-testid="hero-dia-hoy"]');
  texto("día de hoy en la lista («Te toca hoy»)", '[data-testid^="dia-row-"] .text-primary');
  ui("día de hoy (número) vs tarjeta", '[data-testid^="dia-row-"] .bg-primary', '[data-testid^="dia-row-"]');
  texto("botón Registrar serie", '[data-testid="registrar-serie-btn"]');
  ui("botón Registrar serie vs tarjeta", '[data-testid="registrar-serie-btn"]', '[data-testid="effective-sets-section"]');
  texto("tag superserie (lista)", '[data-testid^="superserie-tag-"]');
  texto("banner superserie (texto)", '[data-testid="superserie-circuit-banner"] .font-bold');
  texto("tag drop set (lista)", '[data-testid^="dropset-tag-"]');
  texto("banner drop set (título)", '[data-testid="dropset-banner"] .font-bold');
  texto("nombre del ejercicio seleccionado", '[data-testid^="exercise-select-btn-"][class*="ring-1"] span.leading-tight');
  texto("ordinal superserie/drop set (no seleccionado)", '[data-testid^="exercise-select-btn-"] .bg-purple-500\\/20');
  texto("etiqueta Aproximación", '[data-testid^="warmup-tag-"]');
  texto("timer de descanso (cifras)", '[data-testid="rest-timer-banner"] [role=timer]');
  ui("barra de descanso: relleno vs pista", '[data-testid="rest-timer-banner"] [role=progressbar] > div', '[data-testid="rest-timer-banner"] [role=progressbar]');
  return { total, fallas, clave };
};
