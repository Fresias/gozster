import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Browser, Page } from "@playwright/test";

export type TemaContraste = "light" | "dark";

export interface FilaContraste {
  clave: string;
  tema: TemaContraste;
  pctDistinto: number;
  outPngPath: string;
}

export interface SinRecetaEntry {
  clave: string;
  motivo: string; // ej. "sin receta (falta FE-03)"
}

export interface OpcionesContrastePar {
  clave: string;
  tema: TemaContraste;
  refPngPath: string;
  appPngPath: string;
  outPngPath: string;
}

const PANEL_WIDTH = 390;
const UMBRAL_CANAL = 24;

function toDataUrlPng(filePath: string): string {
  const b64 = readFileSync(filePath).toString("base64");
  return `data:image/png;base64,${b64}`;
}

/**
 * Valida que las dimensiones en píxeles de referencia y app coincidan antes de compararlas.
 * Lanza Error si difieren en ancho o alto para evitar escalados silenciosos en canvas.
 */
export function validarDimensionesContraste(
  refW: number,
  refH: number,
  appW: number,
  appH: number,
  contexto?: { clave?: string; tema?: string },
): void {
  if (refW !== appW || refH !== appH) {
    const clave = contexto && contexto.clave ? contexto.clave : "";
    const tema = contexto && contexto.tema ? contexto.tema : "";
    const etiqueta = clave || tema ? ` [${[clave, tema].filter(Boolean).join(" · ")}]` : "";
    throw new Error(
      `Dimensiones incompatibles en contraste${etiqueta}: ref=${refW}×${refH}, app=${appW}×${appH}`,
    );
  }
}

/**
 * Compone una imagen "Referencia | App | Diferencia" usando Chromium + canvas.getImageData.
 * Un píxel cuenta como distinto si algún canal RGB/A difiere en más de 24.
 * Los píxeles distintos se pintan en rojo sobre la referencia atenuada al 30 %.
 */
export async function generarContrastePar(
  pageOrBrowser: Page | Browser,
  opts: OpcionesContrastePar,
): Promise<FilaContraste> {
  const esBrowser = "newContext" in pageOrBrowser;
  const context = esBrowser
    ? await pageOrBrowser.newContext({ viewport: { width: 1320, height: 1100 }, deviceScaleFactor: 1 })
    : null;
  const page = esBrowser ? await context!.newPage() : pageOrBrowser;

  try {
    const refDataUrl = toDataUrlPng(opts.refPngPath);
    const appDataUrl = toDataUrlPng(opts.appPngPath);

    await page.setContent(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f4f4f5; font-family: system-ui, -apple-system, sans-serif; color: #09090b; }
    #contraste-wrap {
      display: inline-flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: #f4f4f5;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, ${PANEL_WIDTH}px);
      gap: 12px;
      align-items: start;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #d4d4d8;
      border-radius: 10px;
      padding: 8px;
    }
    .panel-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #52525b;
    }
    canvas {
      display: block;
      width: ${PANEL_WIDTH}px;
      background: #ffffff;
      border: 1px solid #e4e4e7;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #09090b;
      color: #fafafa;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
    }
    .footer-meta { font-family: ui-monospace, SFMono-Regular, monospace; }
  </style>
</head>
<body>
  <div id="contraste-wrap">
    <div class="grid">
      <div class="panel">
        <div class="panel-title">Referencia</div>
        <canvas id="c-ref" width="${PANEL_WIDTH}" height="844"></canvas>
      </div>
      <div class="panel">
        <div class="panel-title">App</div>
        <canvas id="c-app" width="${PANEL_WIDTH}" height="844"></canvas>
      </div>
      <div class="panel">
        <div class="panel-title">Diferencia</div>
        <canvas id="c-diff" width="${PANEL_WIDTH}" height="844"></canvas>
      </div>
    </div>
    <div class="footer">
      <span id="footer-clave"></span>
      <span id="footer-pct" class="footer-meta"></span>
    </div>
  </div>
  <script>
    const validarDimensionesContraste = ${validarDimensionesContraste.toString()};
    window.__procesarContraste = async ({ refUrl, appUrl, clave, tema, panelW, umbral }) => {
      const loadImg = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("No se pudo cargar imagen"));
          img.src = src;
        });

      const [refImg, appImg] = await Promise.all([loadImg(refUrl), loadImg(appUrl)]);
      validarDimensionesContraste(
        refImg.naturalWidth,
        refImg.naturalHeight,
        appImg.naturalWidth,
        appImg.naturalHeight,
        { clave, tema },
      );
      const height = Math.max(refImg.naturalHeight || 844, appImg.naturalHeight || 844, 1);

      const cRef = document.getElementById("c-ref");
      const cApp = document.getElementById("c-app");
      const cDiff = document.getElementById("c-diff");
      for (const c of [cRef, cApp, cDiff]) {
        c.width = panelW;
        c.height = height;
        c.style.height = height + "px";
      }

      const ctxRef = cRef.getContext("2d");
      const ctxApp = cApp.getContext("2d");
      const ctxDiff = cDiff.getContext("2d");

      ctxRef.fillStyle = "#ffffff";
      ctxRef.fillRect(0, 0, panelW, height);
      ctxApp.fillStyle = "#ffffff";
      ctxApp.fillRect(0, 0, panelW, height);

      ctxRef.drawImage(refImg, 0, 0, panelW, refImg.naturalHeight || height);
      ctxApp.drawImage(appImg, 0, 0, panelW, appImg.naturalHeight || height);

      const dRef = ctxRef.getImageData(0, 0, panelW, height).data;
      const dApp = ctxApp.getImageData(0, 0, panelW, height).data;
      const out = ctxDiff.createImageData(panelW, height);
      const dOut = out.data;

      const totalPixels = panelW * height;
      let distintos = 0;

      for (let i = 0; i < dRef.length; i += 4) {
        const r1 = dRef[i];
        const g1 = dRef[i + 1];
        const b1 = dRef[i + 2];
        const a1 = dRef[i + 3];

        const r2 = dApp[i];
        const g2 = dApp[i + 1];
        const b2 = dApp[i + 2];
        const a2 = dApp[i + 3];

        const esDistinto =
          Math.abs(r1 - r2) > umbral ||
          Math.abs(g1 - g2) > umbral ||
          Math.abs(b1 - b2) > umbral ||
          Math.abs(a1 - a2) > umbral;

        if (esDistinto) {
          distintos++;
          const bgR = Math.round(255 * 0.7 + r1 * 0.3);
          const bgG = Math.round(255 * 0.7 + g1 * 0.3);
          const bgB = Math.round(255 * 0.7 + b1 * 0.3);
          dOut[i] = Math.round(bgR * 0.25 + 220 * 0.75);
          dOut[i + 1] = Math.round(bgG * 0.25 + 38 * 0.75);
          dOut[i + 2] = Math.round(bgB * 0.25 + 38 * 0.75);
          dOut[i + 3] = 255;
        } else {
          dOut[i] = Math.round(255 * 0.7 + r1 * 0.3);
          dOut[i + 1] = Math.round(255 * 0.7 + g1 * 0.3);
          dOut[i + 2] = Math.round(255 * 0.7 + b1 * 0.3);
          dOut[i + 3] = 255;
        }
      }

      ctxDiff.putImageData(out, 0, 0);

      const pct = Number(((distintos / totalPixels) * 100).toFixed(2));
      document.getElementById("footer-clave").textContent = clave + " · " + tema;
      document.getElementById("footer-pct").textContent = pct.toFixed(2) + "% de píxeles distintos";
      return pct;
    };
  </script>
</body>
</html>`);

    const pctDistinto = await page.evaluate(
      (args) =>
        (
          window as unknown as {
            __procesarContraste: (a: typeof args) => Promise<number>;
          }
        ).__procesarContraste(args),
      {
        refUrl: refDataUrl,
        appUrl: appDataUrl,
        clave: opts.clave,
        tema: opts.tema,
        panelW: PANEL_WIDTH,
        umbral: UMBRAL_CANAL,
      },
    );

    mkdirSync(dirname(opts.outPngPath), { recursive: true });
    await page.locator("#contraste-wrap").screenshot({ path: opts.outPngPath });

    return {
      clave: opts.clave,
      tema: opts.tema,
      pctDistinto,
      outPngPath: opts.outPngPath,
    };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Escribe `resumen.md` en `outDir` con la tabla `clave | tema | % distinto`
 * y el listado de claves sin receta en el estado actual.
 */
export function generarResumenContraste(opts: {
  outDir: string;
  filas: FilaContraste[];
  sinReceta?: SinRecetaEntry[];
  titulo?: string;
}): string {
  mkdirSync(opts.outDir, { recursive: true });
  const resumenPath = join(opts.outDir, "resumen.md");
  const sinReceta = opts.sinReceta ?? [];

  const lineas: string[] = [
    `# ${opts.titulo ?? "Resumen de contraste visual · Athlete v7"}`,
    "",
    `- **Pares comparados:** ${opts.filas.length}`,
    `- **Claves sin receta (pendientes de FE-xx):** ${sinReceta.length}`,
    "",
    "## Comparaciones",
    "",
    "| clave | tema | % distinto |",
    "|---|---|---|",
    ...opts.filas.map((f) => `| \`${f.clave}\` | ${f.tema} | ${f.pctDistinto.toFixed(2)}% |`),
  ];

  if (sinReceta.length > 0) {
    lineas.push("", "## Claves sin receta", "", "| clave | motivo |", "|---|---|");
    for (const s of sinReceta) {
      lineas.push(`| \`${s.clave}\` | ${s.motivo} |`);
    }
  }

  const contenido = `${lineas.join("\n")}\n`;
  writeFileSync(resumenPath, contenido, "utf8");
  return resumenPath;
}
