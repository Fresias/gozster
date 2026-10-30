import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// GOZS-206: recorrido de demo del Coach Studio (login → agenda → cobros → documentación).
// Un test.step por ítem de la checklist (ID D-xx). Un fallo no corta la corrida: se registra y el test falla al final.
// Lo ya cubierto por agenda-testeo.e2e.ts (GOZS-196) no se repite: acá solo recorrido y gaps.

const GABI_ID = "0a7a4dfd-e040-4b92-ac29-9507cbb13215";
const EVIDENCIA = "docs/qa/demo-evidencia";
type Sev = "ROJO" | "NARANJA" | "AMARILLO";
interface Resultado { id: string; viewport: string; estado: "PASS" | "FAIL"; sev: Sev; detalle: string; evidencia: string }

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "00000000-0000-4000-8000-000000000001", exp: 4102444800, role: "authenticated" })}.sig`,
  refresh_token: "e2e-refresh", expires_at: 4102444800, expires_in: 3600, token_type: "bearer",
  user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "coach-e2e@gozster.test", app_metadata: {}, user_metadata: {} },
};

async function entrar(page: Page) {
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: "http://localhost:3100" }]);
}

const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const sinBasura = async (page: Page) => {
  const txt = await page.locator("main, body").first().innerText();
  const malo = txt.match(/\bNaN\b|Infinity|undefined|\[object Object\]/);
  expect(malo, `texto inválido en pantalla: ${malo?.[0]}`).toBeNull();
};

test("@demo recorrido Coach Studio con GABI AGOSTO", async ({ page }, info: TestInfo) => {
  test.setTimeout(600_000);
  page.setDefaultTimeout(8_000); // un ítem que no responde falla rápido y no frena el resto del recorrido
  const vp = () => { const v = page.viewportSize()!; return `${v.width}x${v.height}`; };
  const carpeta = `${EVIDENCIA}/${info.project.name}`;
  mkdirSync(carpeta, { recursive: true });
  const resultados: Resultado[] = [];
  const errores: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(`[console] ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errores.push(`[pageerror] ${e.message.slice(0, 160)}`));

  const paso = async (id: string, sev: Sev, titulo: string, fn: () => Promise<void>) => {
    let estado: "PASS" | "FAIL" = "PASS";
    let detalle = "";
    await test.step(`${id} ${titulo}`, async () => {
      try { await fn(); } catch (e) { estado = "FAIL"; detalle = String((e as Error).message).split("\n")[0]?.slice(0, 220) ?? ""; }
    });
    const evidencia = `${carpeta}/${id}.png`;
    await page.screenshot({ path: evidencia, fullPage: false }).catch(() => {});
    resultados.push({ id, viewport: vp(), estado, sev, detalle, evidencia });
  };

  // ── 2. Login (sin sesión) ───────────────────────────────────────────────
  await paso("D-L1", "ROJO", "Login carga < 3 s", async () => {
    const t0 = Date.now();
    await page.goto("/login");
    await expect(page.getByTestId("login-submit")).toBeVisible();
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  await paso("D-L3", "NARANJA", "Password incorrecto: mensaje claro y sin datos", async () => {
    await page.getByLabel(/email|correo/i).fill("coach-e2e@gozster.test");
    await page.locator("#password").fill("clave-mala");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText(/incorrectos/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText("Gabriel Sanchez");
    errores.length = 0; // el 400 de GoTrue por clave mala es esperado, no cuenta para la aserción de consola
  });
  await paso("D-L2", "ROJO", "Credenciales correctas → /studio en < 3 s", async () => {
    await page.locator("#password").fill("e2e-ok");
    const t0 = Date.now();
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/studio/, { timeout: 15_000 });
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  await paso("D-L4", "NARANJA", "Atrás tras login no vuelve al login", async () => {
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
    expect(page.url()).not.toMatch(/\/login/);
  });
  await paso("D-L5", "AMARILLO", "Tema claro/oscuro disponible en login", async () => {
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /modo (día|noche|oscuro|claro)|tema/i }).first()).toBeVisible();
  });

  await entrar(page);
  // ── 6. Agenda (detalle en agenda-testeo.e2e.ts) ────────────
  await paso("D-G1", "ROJO", "Vista Semana con clases y día actual resaltado", async () => {
    await page.goto("/studio/agenda");
    await expect(page.getByTestId("class-agenda")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("view-week-btn").click();
    await expect(page.getByTestId("class-block-card").first()).toBeVisible();
    await expect(page.locator("span.font-mono.bg-primary.text-primary-foreground").first()).toHaveText(String(new Date().getDate()));
  });
  await paso("D-G2", "NARANJA", "Cupos coherentes (anotados ≤ cupo) y clase llena marcada", async () => {
    const labels = await page.getByTestId("class-block-card").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    for (const l of labels) {
      const m = l.match(/(\d+) de (\d+) cupos/);
      expect(m, `aria-label sin cupos: ${l}`).not.toBeNull();
      expect(Number(m![1])).toBeLessThanOrEqual(Number(m![2]));
    }
    expect(labels.some((l) => /(\d+) de \1 cupos/.test(l)), "ninguna clase llena en el seed").toBe(true);
  });
  await paso("D-G3", "NARANJA", "Anotar sin suscripción vigente pide confirmación", async () => {
    let aviso = false;
    const clases = Math.min(await page.getByTestId("class-block-card").count(), 6);
    for (let c = 0; c < clases && !aviso; c++) {
      await page.getByTestId("class-block-card").nth(c).click();
      await expect(page.getByTestId("class-detail")).toBeVisible();
      if (!(await page.getByTestId("enroll-student-dialog-btn").isEnabled())) continue;
      await page.getByTestId("enroll-student-dialog-btn").click();
      // El aviso se calcula al pulsar Confirmar, no al elegir: Tomás tiene la contratación VENCIDA en el seed.
      await page.getByTestId("enroll-student-select").selectOption("demo-alumno-tomas");
      await page.getByTestId("confirm-enroll-student-btn").click();
      aviso = await page.getByTestId("enroll-warning-banner").isVisible();
      await page.keyboard.press("Escape");
    }
    expect(aviso, "ningún alumno/clase del seed dispara el aviso de suscripción").toBe(true);
  });
  await paso("D-G4", "NARANJA", "Crear clase de prueba y cancelarla", async () => {
    await page.goto("/studio/agenda");
    await expect(page.getByTestId("class-agenda")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("view-week-btn").click();
    const antes = await page.getByTestId("class-block-card").count();
    await page.getByTestId("create-class-btn").click();
    await page.getByTestId("create-class-submit").click();
    await expect(page.getByTestId("class-block-card")).toHaveCount(antes + 1);
    await page.getByTestId("class-block-card").last().click();
    await page.getByTestId("cancel-class-dialog-btn").click();
    await page.getByTestId("cancel-class-reason").fill("QA demo: clase de prueba");
    await page.getByTestId("confirm-cancel-class-btn").click();
    await expect(page.getByTestId("class-canceled-banner")).toBeVisible();
  });
  await paso("D-G5", "AMARILLO", "Agenda legible, sin scroll horizontal de página", async () => {
    expect(await desborde(page)).toBeLessThanOrEqual(1);
  });

  // ── 7. Cobros ───────────────────────────────────────────────────────────
  const monto = async (id: string) => Number((await page.getByTestId(id).innerText()).replace(/\D/g, "") || "NaN");
  let ingresosAntes = 0;
  let pagadosAntes = 0;
  const pagados = async () => Number((await page.getByTestId("filtro-pagados-btn").innerText()).match(/\((\d+)\)/)?.[1]);
  await paso("D-C1", "ROJO", "Panel de cobros coherente entre sí", async () => {
    await page.goto("/studio/cobros");
    await expect(page.getByTestId("cobros-kpis")).toBeVisible({ timeout: 60_000 });
    await sinBasura(page);
    const total = Number((await page.getByTestId("filtro-todos-btn").innerText()).match(/\((\d+)\)/)?.[1]);
    const suma = (await Promise.all(["pendientes", "vencidos", "pagados"].map(async (f) => Number((await page.getByTestId(`filtro-${f}-btn`).innerText()).match(/\((\d+)\)/)?.[1])))).reduce((a, b) => a + b, 0);
    expect(suma).toBe(total);
    ingresosAntes = await monto("kpi-ingresos-mes");
    pagadosAntes = await pagados();
    expect(ingresosAntes).toBeGreaterThan(0);
  });
  await paso("D-C4", "NARANJA", "Monto 0 / negativo / vacío rechazado", async () => {
    await page.getByTestId("filtro-pendientes-btn").click();
    await page.getByTestId("registrar-pago-btn").first().click();
    await expect(page.getByTestId("registrar-pago-dialog")).toBeVisible();
    const input = page.getByTestId("input-pago-monto");
    for (const v of ["0", "-5", ""]) {
      await input.fill(v);
      await expect(page.getByTestId("confirmar-pago-submit-btn"), `monto "${v}" debe deshabilitar el envío`).toBeDisabled();
    }
  });
  await paso("D-C2", "NARANJA", "Pago de prueba pasa a pagado y suma al ingreso", async () => {
    const m = 25000;
    await page.getByTestId("input-pago-monto").fill(String(m));
    // D-C3: dos clics en el mismo tick no deben duplicar el pago
    await page.getByTestId("confirmar-pago-submit-btn").evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await expect(page.getByTestId("registrar-pago-dialog")).not.toBeVisible({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId("comprobante-dialog")).toBeVisible(); // el recibo se abre solo
    await page.keyboard.press("Escape");
    await page.getByTestId("filtro-todos-btn").click();
    await expect.poll(pagados).toBe(pagadosAntes + 1);
    expect(await monto("kpi-ingresos-mes")).toBe(ingresosAntes + m);
  });
  await paso("D-C5", "AMARILLO", "Moneda y fechas en español", async () => {
    const txt = await page.getByTestId("cobros-table").innerText();
    expect(txt).toMatch(/\$\d{1,3}(\.\d{3})+/);
    expect(txt).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  // ── 8. Documentación ────────────────────────────────────────────────────
  await paso("D-DOC1", "ROJO", "Documentación carga con contenido", async () => {
    await page.goto("/studio/documentacion");
    await expect(page.getByTestId("documentacion-pagina")).toBeVisible({ timeout: 60_000 });
    expect((await page.getByTestId("documentacion-pagina").innerText()).length).toBeGreaterThan(500);
  });
  await paso("D-DOC2", "NARANJA", "Enlaces internos del índice funcionan", async () => {
    const links = page.getByTestId("documentacion-indice").locator('a[href^="#"]');
    const n = await links.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const href = await links.nth(i).getAttribute("href");
      await expect(page.locator(href!), `ancla ${href} sin destino`).toHaveCount(1);
    }
  });
  await paso("D-DOC3", "AMARILLO", 'Sin referencias a "Mynter" de cara al entrenador', async () => {
    await expect(page.locator("body")).not.toContainText(/mynter/i);
  });

  // ── 9. Responsive (todas las pantallas del recorrido) ───────────────────
  const rutas = ["/studio", "/studio/dashboard", "/studio/agenda", "/studio/cobros", "/studio/documentacion"];
  await paso("D-T2", "ROJO", "Recorrido completo sin scroll horizontal de página", async () => {
    const malas: string[] = [];
    for (const r of rutas) {
      await page.goto(r);
      await page.waitForLoadState("networkidle").catch(() => {});
      if ((await desborde(page)) > 1) malas.push(r);
    }
    expect(malas, `desborde horizontal en: ${malas.join(", ")}`).toEqual([]);
  });
  await paso("D-T1", "ROJO", "Navegación con áreas táctiles ≥ 44 px", async () => {
    await page.goto("/studio");
    await page.waitForLoadState("networkidle").catch(() => {});
    const chicos: string[] = [];
    for (const l of await page.locator("aside a, aside button, nav a, nav button, header a, header button").all()) {
      if (!(await l.isVisible())) continue;
      const b = await l.boundingBox();
      if (b && (b.height < 44 || b.width < 44)) chicos.push(`${(await l.innerText()).trim().slice(0, 20) || "icono"} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    expect(chicos, `controles < 44 px: ${chicos.slice(0, 6).join("; ")}`).toEqual([]);
  });

  // ── Global: consola sin errores rojos ───────────────────────────────────
  await paso("D-CONSOLA", "NARANJA", "Consola con 0 errores rojos en todo el recorrido", async () => {
    const unicos = [...new Set(errores)];
    expect(unicos, unicos.slice(0, 3).join(" | ")).toEqual([]);
  });

  writeFileSync(`${carpeta}/resultados.json`, JSON.stringify(resultados, null, 2));
  const fallos = resultados.filter((r) => r.estado === "FAIL");
  console.log(`\n${resultados.map((r) => `${r.id} | ${r.viewport} | ${r.estado} | ${r.sev} | ${r.detalle}`).join("\n")}`);
  expect(fallos.map((f) => `${f.id}: ${f.detalle}`), "ítems de la checklist con FAIL").toEqual([]);
});
