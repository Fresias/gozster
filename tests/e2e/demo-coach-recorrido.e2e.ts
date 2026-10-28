import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

// GOZS-206: recorrido de demo del Coach Studio (login → dashboard → alumno → rutina → agenda → cobros → documentación).
// Un test.step por ítem de la checklist (ID D-xx). Un fallo no corta la corrida: se registra y el test falla al final.
// Lo ya cubierto por agenda-testeo.e2e.ts (GOZS-196) no se repite: acá solo recorrido y gaps.
// GABI AGOSTO sale del dataset real de respaldo (src/services/real-mynter-data.ts, plan cab4ad3d-…); el stub no devuelve filas.

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

async function entrar(page: Page, modo: "TESTEO" | "PRODUCCION") {
  await page.context().addCookies([{ name: "sb-localhost-auth-token", value: `base64-${b64url(session)}`, url: "http://localhost:3100" }]);
  await page.addInitScript((m) => window.localStorage.setItem("gozster-workspace-mode", m), modo);
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

  // ── 3. Dashboard (/studio/dashboard y directorio /studio) ───────────────
  await entrar(page, "PRODUCCION");
  await paso("D-D1", "ROJO", "Dashboard carga con franja de KPIs visible", async () => {
    await page.goto("/studio/dashboard");
    await expect(page.getByTestId("retention-executive-banner")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("kpi-cant-activas")).toBeVisible();
  });
  await paso("D-D2", "ROJO", "Ningún KPI muestra NaN/Infinity/undefined", async () => {
    await sinBasura(page);
    await page.goto("/studio");
    await expect(page.getByTestId("alumnos-directory")).toBeVisible({ timeout: 60_000 });
    await sinBasura(page);
    await expect(page.getByTestId("kpi-cant-activas")).not.toHaveText(/^\s*0\s*$/);
  });
  await paso("D-D3", "NARANJA", "Abrir una alerta lleva al alumno correcto", async () => {
    await page.getByTestId("view-student-btn-alert-demo-dolor-1").click();
    await expect(page.getByRole("heading", { name: /Celeste Gerardi/ })).toBeVisible();
    await page.getByRole("button", { name: /Volver a Alumnos/ }).click();
  });
  await paso("D-D5", "NARANJA", 'Buscar "gabi" lo encuentra y limpiar restaura la lista', async () => {
    const buscador = page.getByRole("searchbox").first();
    const antes = await page.locator('[data-testid^="btn-ver-ficha-"]').count();
    try {
      await buscador.fill("gabi");
      await expect(page.getByTestId(`btn-ver-ficha-${GABI_ID}`)).toBeVisible({ timeout: 3000 });
    } finally {
      await buscador.fill("");
      await expect(page.locator('[data-testid^="btn-ver-ficha-"]')).toHaveCount(antes);
    }
  });
  await paso("D-D6", "AMARILLO", "Sin scroll horizontal de página en el directorio", async () => {
    expect(await desborde(page)).toBeLessThanOrEqual(1);
  });

  // ── 4. Alumno (Gabi) ────────────────────────────────────────────────────
  await paso("D-A1", "ROJO", "Abrir ficha de Gabi: carga plan, historial y datos", async () => {
    await page.getByTestId(`btn-ver-ficha-${GABI_ID}`).click();
    await expect(page.getByTestId("contratacion-panel")).toBeVisible();
    await expect(page.getByTestId("estado-rutina")).toBeVisible();
    await sinBasura(page);
  });
  await paso("D-A2", "ROJO", "Plan GABI AGOSTO con estado vencido y fechas coherentes", async () => {
    await expect(page.getByText("GABI AGOSTO", { exact: true }).first()).toBeVisible();
    // D-A2: GABI AGOSTO con fecha_fin 25/10/2026 (hoy 28/10): el estado no es ACTIVO (VENCIDO)
    // y el vencimiento mostrado coincide con fecha_fin (25 de oct)
    await expect(page.getByTestId("estado-rutina")).toContainText(/VENCIDO/i);
    await expect(page.getByTestId("fecha-vencimiento")).toContainText(/25 de oct/i);
  });
  await paso("D-A3", "NARANJA", "Historial de cargas abre y cierra", async () => {
    await page.getByText("Ver Cargas & RPE").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Cerrar panel de historial").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
  await paso("D-A5", "NARANJA", "Plantilla WhatsApp abre sin enviar nada real", async () => {
    const enviados: string[] = [];
    page.on("request", (r) => { if (/wa\.me|whatsapp|api\.whatsapp/i.test(r.url())) enviados.push(r.url()); });
    await page.context().route(/wa\.me|whatsapp/i, (r) => r.abort());
    await page.getByTestId("whatsapp-direct-btn").click();
    await page.waitForTimeout(500);
    expect(enviados, "no debe haber requests a WhatsApp").toEqual([]);
    await page.keyboard.press("Escape");
  });

  // Rotación a mitad de recorrido (solo tablet): el estado debe conservarse.
  if (info.project.name === "tablet") {
    await paso("D-T3", "NARANJA", "Rotar a horizontal conserva estado (ficha de Gabi)", async () => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(page.getByTestId("contratacion-panel")).toBeVisible();
      await expect(page.getByText("GABI AGOSTO", { exact: true }).first()).toBeVisible();
      expect(await desborde(page)).toBeLessThanOrEqual(1);
    });
  }

  // ── 5. Rutina (constructor / estructura GABI AGOSTO) ────────────────────
  await paso("D-R1", "ROJO", "GABI AGOSTO: días en orden (WARM UP → PRINCIPAL)", async () => {
    const txt = await page.locator("body").innerText();
    expect(txt).toContain("ESTRUCTURA DEL PLAN (2 DÍAS)");
    expect(txt.indexOf("WARM UP")).toBeGreaterThan(-1);
    expect(txt.indexOf("WARM UP")).toBeLessThan(txt.indexOf("PRINCIPAL"));
  });
  await paso("D-R2", "ROJO", "Ejercicios con series, reps (rango), descanso y RPE", async () => {
    const txt = await page.locator("body").innerText();
    expect(txt).toMatch(/\d+ × .+/);
    expect(txt).toMatch(/RPE \d/);
    expect(txt).toMatch(/\d+s desc\./);
  });
  await paso("D-R3", "NARANJA", "Superseries agrupadas y recomendaciones (escala RPE 1–10)", async () => {
    await expect(page.getByText("Superserie G1").first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/RPE.*1 al 10/);
  });
  await paso("D-R4", "NARANJA", "Constructor abre con el plan de Gabi (no con la plantilla genérica)", async () => {
    await page.getByTestId("sidebar-routine-builder-btn").click();
    const modal = page.getByTestId("routine-builder-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Gabriel Sanchez");
    // GAP conocido: el constructor siempre arranca con la "Plantilla Maestra" (Bloque de Hipertrofia), no con GABI AGOSTO.
    await expect(modal.locator("input").first()).toHaveValue("GABI AGOSTO");
  });
  await paso("D-R6", "NARANJA", "9999 series se rechaza o avisa", async () => {
    const serie = page.getByTestId("routine-builder-modal").locator('input[type="number"]').first();
    await serie.fill("9999");
    const valor = await serie.inputValue();
    const aviso = await page.getByTestId("routine-builder-modal").getByText(/máximo|inválid|límite|rango/i).count();
    expect(Number(valor) < 9999 || aviso > 0, "acepta 9999 series sin rechazar ni avisar").toBe(true);
  });
  await paso("D-R8", "AMARILLO", "Modal del constructor se cierra sin guardar", async () => {
    await page.getByTestId("routine-builder-modal").getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("routine-builder-modal")).toHaveCount(0);
  });
  await paso("D-R5", "NARANJA", "Quick Swap: sustituir y queda trazado", async () => {
    await page.goto("/studio");
    await page.getByTestId("quick-swap-btn-alert-demo-dolor-2").click();
    const modal = page.getByTestId("quick-swap-modal");
    await expect(modal).toBeVisible();
    await modal.getByTestId("swap-motive-input").fill("QA demo: molestia de hombro");
    await modal.locator('[data-testid^="confirm-swap-btn-"]').first().click();
    await expect(page.getByTestId("quick-swap-modal")).toHaveCount(0);
  });

  // ── 6. Agenda (Modo Testeo; detalle en agenda-testeo.e2e.ts) ────────────
  await entrar(page, "TESTEO");
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
      const sel = page.getByTestId("enroll-student-select");
      const opciones = await sel.locator("option").evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).filter(Boolean));
      for (const v of opciones) {
        await sel.selectOption(v);
        if (await page.getByTestId("enroll-warning-banner").isVisible().catch(() => false)) { aviso = true; break; }
      }
      await page.keyboard.press("Escape");
    }
    expect(aviso, "ningún alumno/clase del seed dispara el aviso de suscripción").toBe(true);
  });
  await paso("D-G4", "NARANJA", "Crear clase de prueba y cancelarla (Modo Testeo)", async () => {
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
