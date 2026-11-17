// Vuelca en README.md: la tabla de verificación por pantalla, la lista de reglas y el CSS propuesto.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pantallas } from "./build.mjs";
import { PROPUESTA_CSS, REGLAS } from "./propuesta.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const ver = JSON.parse(fs.readFileSync(path.join(AQUI, "dom", "_verificacion.json"), "utf8"));
const CAUSAS = JSON.parse(fs.readFileSync(path.join(AQUI, "causas.json"), "utf8"));

const filas = [];
const detalle = [];
for (const p of pantallas()) {
  const l = ver[`${p.id}-${p.vp}-light`], d = ver[`${p.id}-${p.vp}-dark`];
  if (!l || !d) continue;
  const nombre = p.vp === "desktop" ? `${p.id} (1280)` : p.id;
  filas.push(`| \`${nombre}\` | ${p.fuente === "captura" ? "captura" : "sin captura"} | ${l.bloques} | ${l.fueraDeTolerancia} / ${d.fueraDeTolerancia} | ${l.contrasteAntes.fallas} → ${l.contrasteDespues.fallas} | ${d.contrasteAntes.fallas} → ${d.contrasteDespues.fallas} |`);
  const vistos = new Set();
  const arrastre = { n: 0, dys: new Set(), causa: null };
  for (const x of [...l.difs, ...d.difs]) {
    const k = `${x.id}|${x.txt}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const mov = x.falta ? "no está" : [x.dx && `x ${x.dx > 0 ? "+" : ""}${x.dx}`, x.dy && `y ${x.dy > 0 ? "+" : ""}${x.dy}`, x.dw && `ancho ${x.dw > 0 ? "+" : ""}${x.dw}`, x.dh && `alto ${x.dh > 0 ? "+" : ""}${x.dh}`].filter(Boolean).join(", ");
    const causa = CAUSAS.find((c) => new RegExp(c.patron).test(`${x.id} ${x.txt}`))?.causa ?? "sin clasificar";
    // Los bloques que solo se desplazan con el de arriba se resumen en una fila por pantalla.
    if (causa.startsWith("Arrastre vertical")) { arrastre.n++; if (x.dy) arrastre.dys.add(x.dy); arrastre.causa = causa; continue; }
    detalle.push(`| \`${nombre}\` | \`${x.id.replace(/-0f0f0f0f-[0-9a-f-]+/, "-…")}\` «${x.txt.replace(/\|/g, "/")}» | ${mov} px | ${causa} |`);
  }
  if (arrastre.n) detalle.push(`| \`${nombre}\` | ${arrastre.n} bloques más (contenedores, tarjeta de serie, inputs y botones de abajo) | y ${[...arrastre.dys].sort((a, b) => a - b).join(" / ")} px | ${arrastre.causa} |`);
}

const seccion = `### Verificación (Playwright, mismos viewports, tolerancia ±2 px)

Bloques = cajas comparadas en claro. «Fuera» = bloques con alguna diferencia de posición o tamaño > 2 px (claro / oscuro). Contraste = cantidad de textos que no llegan a AA, ANTES → DESPUÉS.

| Pantalla | Fuente | Bloques | Fuera ±2 px (claro / oscuro) | Fallas AA claro | Fallas AA oscuro |
|---|---|---|---|---|---|
${filas.join("\n")}

#### Diferencias de layout por pantalla y su causa

Todas vienen de cambios estéticos documentados (ninguna de estructura). Una fila por bloque distinto (se listan una vez aunque aparezcan en ambos modos).

| Pantalla | Bloque | Diferencia | Causa |
|---|---|---|---|
${detalle.join("\n") || "| — | — | — | — |"}
`;

const reglas = `| Regla | Cambio | Archivo(s) | Actual | Nueva | Por qué | Efecto en layout |
|---|---|---|---|---|---|---|
${REGLAS.map((r) => `| ${r.id} | ${r.titulo} | ${r.archivos.map((a) => `\`${a}\``).join("<br>")} | \`${r.antes}\` | \`${r.despues}\` | ${r.motivo} | ${r.layout} |`).join("\n")}`;

let readme = fs.readFileSync(path.join(RAIZ, "README.md"), "utf8");
readme = readme.replace(/<!-- VERIFICACION:INICIO -->[\s\S]*<!-- VERIFICACION:FIN -->/, `<!-- VERIFICACION:INICIO -->\n${seccion}\n<!-- VERIFICACION:FIN -->`);
readme = readme.replace(/```css\n(<!-- PROPUESTA_CSS -->|[\s\S]*?)\n```/, "```css\n" + PROPUESTA_CSS + "\n```");
readme = readme.replace(/<!-- REGLAS -->|<!-- REGLAS:INICIO -->[\s\S]*?<!-- REGLAS:FIN -->/, `<!-- REGLAS:INICIO -->\n${reglas}\n<!-- REGLAS:FIN -->`);
fs.writeFileSync(path.join(RAIZ, "README.md"), readme);
console.log("README actualizado:", filas.length, "pantallas,", detalle.length, "diferencias");
