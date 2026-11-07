import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { DEMO_GIMNASIO, DEMO_KPIS_NEGOCIO } from "../../src/services/coach-demo-dataset";

const COACH_ID = "00000000-0000-4000-8000-000000000001";
const STUB_URL = "http://localhost:54321";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION_COOKIE = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
    sub: COACH_ID,
    exp: 4102444800,
    role: "authenticated",
  })}.sig`,
  refresh_token: "e2e-refresh",
  expires_at: 4102444800,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: COACH_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "coach-e2e@gozster.test",
    app_metadata: {},
    user_metadata: {},
  },
};

test("Generar artefacto comparativo comparar/inicio.jpg (1440x900)", async ({ page, context }) => {
  // 1. Configurar fixtures en el stub de Supabase
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, {
    data: {
      rol: "ADMIN",
      alumnos: DEMO_GIMNASIO.alumnos,
      planes_entrenamiento: DEMO_GIMNASIO.planes,
      dias_rutina: DEMO_GIMNASIO.dias,
      ejercicios_en_rutina: DEMO_GIMNASIO.ejerciciosEnRutina,
      ejercicios: DEMO_GIMNASIO.ejercicios,
      kpis_negocio: [DEMO_KPIS_NEGOCIO],
    },
  });

  await context.addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(SESSION_COOKIE)}`,
      url: "http://localhost:3100",
    },
  ]);

  // 2. Capturar vista de la rama en vivo a 1440x900
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/studio");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector('[data-testid="business-kpi-strip"]', { timeout: 30000 });
  await page.waitForTimeout(1000); // estabilizar animaciones

  const liveScreenshot = await page.screenshot({ type: "png" });

  // 3. Capturar vista objetivo desde objetivo/html/Inicio.html
  const objetivoHtmlPath = path.resolve("docs/ux-ui-review/objetivo/html/Inicio.html");
  const fileUrl = `file:///${objetivoHtmlPath.replace(/\\/g, "/")}`;
  const pageObjetivo = await context.newPage();
  await pageObjetivo.setViewportSize({ width: 1440, height: 900 });
  await pageObjetivo.goto(fileUrl);
  await pageObjetivo.waitForLoadState("domcontentloaded");
  await pageObjetivo.waitForTimeout(500);

  const objetivoScreenshot = await pageObjetivo.screenshot({ type: "png" });
  await pageObjetivo.close();

  // 4. Componer lado a lado: Objetivo (izq) vs Implementado (der)
  const pageComposer = await context.newPage();
  await pageComposer.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin: 0; background: #09090b;">
        <canvas id="c"></canvas>
      </body>
    </html>
  `);

  const b64Objetivo = objetivoScreenshot.toString("base64");
  const b64Live = liveScreenshot.toString("base64");

  const jpegBase64 = await pageComposer.evaluate(async ({ b64Obj, b64Liv }) => {
    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      });

    const [imgObj, imgLiv] = await Promise.all([
      loadImage(`data:image/png;base64,${b64Obj}`),
      loadImage(`data:image/png;base64,${b64Liv}`),
    ]);

    const canvas = document.getElementById("c") as HTMLCanvasElement;
    // Dimensiones finales lado a lado (1460 x 730 como el canvas original o 1440x900 x 2)
    const targetW = 730;
    const targetH = 730;
    canvas.width = targetW * 2;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar objetivo a la izquierda escalado a targetW x targetH
    ctx.drawImage(imgObj, 0, 0, imgObj.width, imgObj.height, 0, 0, targetW, targetH);

    // Dibujar live a la derecha escalado a targetW x targetH
    ctx.drawImage(imgLiv, 0, 0, imgLiv.width, imgLiv.height, targetW, 0, targetW, targetH);

    // Divisoria vertical sutil
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(targetW, 0);
    ctx.lineTo(targetW, targetH);
    ctx.stroke();

    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  }, { b64Obj: b64Objetivo, b64Liv: b64Live });

  await pageComposer.close();

  const outPath = path.resolve("docs/ux-ui-review/comparar/inicio.jpg");
  if (!jpegBase64) {
    throw new Error("No se pudo extraer base64 del canvas de comparacion");
  }
  fs.writeFileSync(outPath, Buffer.from(jpegBase64, "base64"));
  console.log(`Artefacto generado con exito en: ${outPath} (${fs.statSync(outPath).size} bytes)`);

  expect(fs.existsSync(outPath)).toBe(true);
});
