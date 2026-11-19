// Captura la referencia v7 pantalla por pantalla, en claro y oscuro, a 390 × 844.
// Uso: node docs/athlete-v7/referencia/capturar.mjs [--escala 2] [--semilla 3] [--solo ex-ss,mol-hereda] [--salida <dir>]
// Necesita Playwright (ya está en devDependencies como @playwright/test) y red hacia Google Fonts.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createRequire } from "node:module";

let chromium;
try {
  ({ chromium } = await import("@playwright/test"));
} catch {
  // Fuera del repo (sin node_modules): Playwright global vía NODE_PATH.
  ({ chromium } = createRequire(import.meta.url)("playwright"));
}

const aqui = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const escala = Number(opt("--escala", "1"));
// La app elige la semilla del fondo al azar en cada apertura; para comparar capturas se fija una.
const semilla = opt("--semilla", "3");
const salida = resolve(opt("--salida", join(aqui, "png")));
const solo = opt("--solo", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Pantallas que QA compara contra la app (ver 05-qa.md §2). La clave es el parámetro ?screen= de la referencia.
// El login queda fuera de alcance (es compartido con Coach Studio): no se captura.
export const PANTALLAS = [
  // Acceso
  "onb1", "onbname", "onb2", "onb3",
  // Entrenar
  "inicio", "inicio-semana", "inicio-dia", "inicio-sinplan", "inicio-cargando", "inicio-error",
  "inicio-offline", "inicio-pendientes", "inicio-instalar", "inicio-instalar-android",
  "inicio-vencida", "inicio-suscripcion", "chat",
  // Sesión
  "rutina", "rutina-curso", "rutina-terminar", "rutina-molestia", "registro", "registro-datos",
  "config", "cuest", "cuest-hecho", "cierre", "cierre-off", "toast-sesion",
  // Ejercicio
  "ex-aprox", "ex-ss", "ex-tec", "ex-tec-rpe", "ex-tiempo", "ex-tiempo-run", "ex-drop", "ex-drop-2",
  "ex-uni", "ex-uni-izq", "ex-rest", "ex-rest-pausa", "ex-descanso-info", "ex-record", "toast-record",
  "ex-x10", "ex-rej", "ex-offline", "toast-sinsenal", "ex-completo",
  "ex-videos", "ex-video-estados", "setvideo", "notes", "video",
  // Molestias
  "mol-modal", "mol-modal-alta", "mol-modal-alarma", "mol-leve", "mol-mod", "mol-alta", "mol-alarma",
  "mol-hereda", "mol-lumbar", "mol-no-hereda", "mol-otro",
  // Historial y progreso
  "hist", "hist-open", "hist-open-tec", "hist-fix", "hist-dash", "hist-vacio", "hist-off",
  "prog", "prog-tec", "prog-vacio", "prog-off",
  // Clases
  "cls", "cls-mes", "cls-reservada", "cls-cupo", "cls-dia-vacio", "cls-off",
];

const html = pathToFileURL(join(aqui, "athlete-v7.html")).href;
const lista = solo.length ? PANTALLAS.filter((p) => solo.includes(p)) : PANTALLAS;
mkdirSync(salida, { recursive: true });

const browser = await chromium.launch();
const errores = [];
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: escala,
    reducedMotion: "reduce",
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(`${theme}: ${e.message}`));
  for (const screen of lista) {
    await page.goto(`${html}?embed=1&theme=${theme}&seed=${semilla}&screen=${screen}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const app = page.locator("#app");
    const file = join(salida, `${screen}-${theme}.png`);
    mkdirSync(dirname(file), { recursive: true });
    await app.screenshot({ path: file });
  }
  await ctx.close();
}
await browser.close();
if (errores.length) writeFileSync(join(salida, "errores.txt"), errores.join("\n"));
console.log(`${lista.length * 2} capturas en ${salida}. Errores de JS: ${errores.length}`);
if (errores.length) {
  console.error(errores.join("\n"));
  process.exit(1);
}
