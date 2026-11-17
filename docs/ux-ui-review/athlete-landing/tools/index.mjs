// Genera index.html: todas las pantallas, ANTES | DESPUÉS lado a lado, en claro u oscuro.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pantallas } from "./build.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const ver = JSON.parse(fs.readFileSync(path.join(AQUI, "dom", "_verificacion.json"), "utf8"));
const grupos = new Map();
for (const p of pantallas()) {
  const nombre = p.vp === "desktop" ? `${p.id}-desktop` : p.id;
  if (!fs.existsSync(path.join(RAIZ, "pantallas", `${nombre}.html`))) continue;
  if (!grupos.has(p.grupo)) grupos.set(p.grupo, []);
  grupos.get(p.grupo).push({ ...p, nombre });
}
const ORDEN = ["Shell", "Inicio", "Paywall", "Entrenamiento en vivo", "Modales", "Historial", "Progreso", "Clases", "Chat", "Onboarding", "Cuestionario inicial", "Hábitos", "Nutrición"];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const tarjeta = (p) => {
  const l = ver[`${p.id}-${p.vp}-light`] || {}, d = ver[`${p.id}-${p.vp}-dark`] || {};
  const fuera = (l.fueraDeTolerancia ?? "?") + " / " + (d.fueraDeTolerancia ?? "?");
  const aa = (r) => (r.contrasteAntes ? `${r.contrasteAntes.fallas}→${r.contrasteDespues.fallas}` : "?");
  const img = (tipo, modo) => `png/${tipo}/${p.id}-${p.vp}-${modo}.png`;
  return `<article class="card" id="${p.nombre}">
  <header><h3>${esc(p.titulo)}${p.vp === "desktop" ? " · 1280 px" : ""}</h3>
  <span class="tag ${p.fuente}">${p.fuente === "captura" ? "captura real" : "sin captura · render del código"}</span></header>
  <p class="meta">Bloques fuera de ±2 px (claro / oscuro): <b>${fuera}</b> · fallas de contraste AA antes→después: claro <b>${aa(l)}</b>, oscuro <b>${aa(d)}</b></p>
  <div class="pares">
    ${["light", "dark"].map((m) => `<div class="par modo-${m}"><figure><figcaption>ANTES · ${m === "light" ? "claro" : "oscuro"}</figcaption><a href="${img("antes", m)}"><img loading="lazy" src="${img("antes", m)}" alt="ANTES ${esc(p.titulo)}"></a></figure>
    <figure><figcaption>DESPUÉS · ${m === "light" ? "claro" : "oscuro"}</figcaption><a href="pantallas/${p.nombre}.html${m === "dark" ? "#dark" : ""}"><img loading="lazy" src="${img("despues", m)}" alt="DESPUÉS ${esc(p.titulo)}"></a></figure></div>`).join("\n    ")}
  </div>
  <p class="links"><a href="pantallas/${p.nombre}.html">mockup HTML (DESPUÉS)</a> · <a href="antes/${p.nombre}.html">HTML con CSS actual (ANTES)</a></p>
</article>`;
};

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Athlete App con la estética de la landing · ANTES | DESPUÉS</title>
<style>
:root{--bg:#fff;--fg:#09090b;--muted:#52525b;--border:#e4e4e7;--soft:#f4f4f5}
body{margin:0;background:var(--bg);color:var(--fg);font-family:Geist,Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.top{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.92);backdrop-filter:blur(8px)}
.top h1{margin:0;font-size:20px;font-weight:900;letter-spacing:-.04em}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:9999px;padding:4px;background:var(--soft)}
.seg button{border:0;background:transparent;border-radius:9999px;padding:8px 14px;font:700 13px system-ui;cursor:pointer;color:var(--muted)}
.seg button[aria-pressed=true]{background:var(--fg);color:#fff}
main{max-width:1400px;margin:0 auto;padding:16px 24px 64px}
h2{font:600 12px/1 "Geist Mono",Menlo,monospace;text-transform:uppercase;letter-spacing:.18em;color:var(--muted);margin:40px 0 12px;border-top:1px solid var(--border);padding-top:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(620px,1fr));gap:16px}
.card{border:1px solid var(--border);border-radius:16px;padding:16px}
.card header{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.card h3{margin:0;font-size:16px;font-weight:800;letter-spacing:-.02em}
.tag{font:600 11px system-ui;border-radius:9999px;padding:3px 8px;white-space:nowrap;border:1px solid var(--border)}
.tag.codigo{background:#fffbeb;color:#92400e;border-color:#fde68a}
.meta,.links{font-size:12px;color:var(--muted);margin:6px 0}
.pares .par{display:grid;grid-template-columns:1fr 1fr;gap:10px}
body.oscuro .modo-light,body.claro .modo-dark{display:none}
figure{margin:0}figcaption{font:600 11px "Geist Mono",Menlo,monospace;letter-spacing:.12em;color:var(--muted);margin-bottom:4px}
figure img{width:100%;max-height:900px;object-fit:cover;object-position:top;border:1px solid var(--border);border-radius:12px;display:block}
a{color:inherit}
</style></head>
<body class="claro">
<div class="top"><h1>/athlete con la estética de la landing</h1>
<div class="seg" role="group" aria-label="Modo"><button aria-pressed="true" onclick="modo('claro',this)">Claro</button><button aria-pressed="false" onclick="modo('oscuro',this)">Oscuro</button></div></div>
<main>
<p>Cada par muestra el ANTES (captura real de la app o, si el estado no se alcanza sin escribir datos, el render del mismo JSX con el CSS actual) y el DESPUÉS (mismo DOM, solo cambian tokens y clases de la propuesta). Clic en una imagen DESPUÉS abre el mockup HTML con su toggle claro/oscuro. Detalle en <a href="README.md">README.md</a>.</p>
${[...grupos.entries()].sort((a, b) => ORDEN.indexOf(a[0]) - ORDEN.indexOf(b[0])).map(([g, ps]) => `<h2>${esc(g)}</h2>\n<div class="grid">\n${ps.map(tarjeta).join("\n")}\n</div>`).join("\n")}
</main>
<script>function modo(m,b){document.body.className=m;document.querySelectorAll(".seg button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))})}</script>
</body></html>`;
fs.writeFileSync(path.join(RAIZ, "index.html"), html);
console.log("index.html", [...grupos.values()].flat().length, "pantallas");
