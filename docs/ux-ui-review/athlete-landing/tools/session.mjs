// Sesión de solo lectura para capturas. Credenciales SOLO desde process.env (nunca se imprimen ni se guardan).
// storageState se guarda en os.tmpdir(), fuera del repo.
import { chromium } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const BASE = process.env.CAPTURE_BASE || "http://localhost:3100";
export const STATE = path.join(os.tmpdir(), "gozster-athlete-capture-state.json");
const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const RPC_LECTURA = ["feriados_en_rango"];

/** Bloquea toda escritura hacia Supabase: solo GET/HEAD/OPTIONS, login y RPC de lectura. */
export async function soloLectura(context, bloqueadas = []) {
  await context.route("**/*", (route) => {
    const req = route.request();
    const url = req.url();
    const m = req.method();
    const esSupabase = SB && url.startsWith(SB);
    if (!esSupabase || ["GET", "HEAD", "OPTIONS"].includes(m)) return route.continue();
    if (url.includes("/auth/v1/token") || url.includes("/auth/v1/user")) return route.continue();
    if (RPC_LECTURA.some((r) => url.includes(`/rest/v1/rpc/${r}`))) return route.continue();
    bloqueadas.push(`${m} ${url.replace(SB, "<sb>").split("?")[0]}`);
    return route.abort();
  });
}

export async function login(browser) {
  const email = process.env.FE_alumno_mail;
  const pass = process.env.FE_alumno_password;
  if (!email || !pass) throw new Error("Faltan variables de entorno del alumno de prueba");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const bloqueadas = [];
  await soloLectura(context, bloqueadas);
  const page = await context.newPage();
  for (let intento = 1; intento <= 2; intento++) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("#email", { timeout: 120000 });
    await page.waitForLoadState("load");
    await page.waitForTimeout(2500);
    for (let k = 0; k < 3; k++) {
      await page.fill("#email", "");
      await page.locator("#email").pressSequentially(email, { delay: 5 });
      await page.fill("#password", "");
      await page.locator("#password").pressSequentially(pass, { delay: 5 });
      if (await page.locator("[data-testid=\"login-submit\"]").isEnabled()) break;
      await page.waitForTimeout(1500);
    }
    await page.click('[data-testid="login-submit"]');
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
      await context.storageState({ path: STATE });
      await context.close();
      return true;
    } catch {
      console.log(`login intento ${intento} falló`);
    }
  }
  await context.close();
  return false;
}

if (process.argv[1] && process.argv[1].endsWith("session.mjs")) {
  const browser = await chromium.launch();
  const ok = await login(browser);
  console.log("login:", ok ? "OK" : "FALLÓ", "state en tmpdir:", fs.existsSync(STATE));
  await browser.close();
}
export { chromium };
