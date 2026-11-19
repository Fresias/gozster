import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { esperarEstilo } from "./helpers/estilo-v7";

const STUB_URL = "http://localhost:54321";
const FIXTURE_BASE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "e2e", "fixtures", "athlete-v7.json"), "utf8"),
);
const LUCIA_ID: string = FIXTURE_BASE.user.id;
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function buildSessionCookie() {
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
      sub: FIXTURE_BASE.user.id,
      exp: 4102444800,
      role: "authenticated",
    })}.sig`,
    refresh_token: "e2e-refresh",
    expires_at: 4102444800,
    expires_in: 3600,
    token_type: "bearer",
    user: FIXTURE_BASE.user,
  };
}

async function prepararAthlete(page: Page, tema: "light" | "dark") {
  await page.request.put(`${STUB_URL}/__e2e/fixtures`, { data: FIXTURE_BASE });
  await page.context().addCookies([
    {
      name: "sb-localhost-auth-token",
      value: `base64-${b64url(buildSessionCookie())}`,
      url: "http://localhost:3100",
    },
  ]);
  await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-11-17T10:00:00-03:00"));

  const storeSeed = {
    state: {
      onboardingCompletado: true,
      mostrarTimerDescanso: true,
      nivelVistaAlumno: "SIMPLE",
      membershipStatus: "ACTIVE",
      currentSession: {
        id: "aaaaaaaa-1111-4111-8111-111111111101",
        nombre_rutina: "Lucía Fernández: DÍA 1",
        fecha: "2026-11-17",
        ejercicios: [],
        studentId: LUCIA_ID,
        studentName: "Lucía Fernández",
      },
    },
    version: 2,
  };

  await page.addInitScript(
    ({ theme, userId, storeJson }) => {
      window.localStorage.setItem("gozster-theme", theme);
      window.localStorage.setItem(`gozster-athlete-store:${userId}`, storeJson);
    },
    { theme: tema, userId: LUCIA_ID, storeJson: JSON.stringify(storeSeed) },
  );
}

test.describe("@mobile Athlete v7 · FE-01 Base visual", () => {
  test.afterAll(async ({ request }) => {
    await request.delete(`${STUB_URL}/__e2e/fixtures`).catch(() => {});
  });

  for (const tema of ["light", "dark"] as const) {
    test(`/athlete (${tema}): lienzo en tinta/papel, sin azul, fuentes cargadas y tipografía 05 §3.1`, async ({
      page,
    }) => {
      await prepararAthlete(page, tema);
      await page.goto("/athlete");
      await expect(page.getByTestId("inicio-mis-dias-container")).toBeVisible({ timeout: 25_000 });
      await expect(page.getByTestId("hero-dia-hoy")).toBeVisible();

      await page.evaluate(() => document.fonts.ready);

      const expectedBg = tema === "dark" ? "rgb(9, 9, 11)" : "rgb(250, 250, 250)";
      const expectedPrimaryBg = tema === "dark" ? "rgb(250, 250, 250)" : "rgb(9, 9, 11)";
      const expectedPrimaryFg = tema === "dark" ? "rgb(9, 9, 11)" : "rgb(250, 250, 250)";

      // 1. Lienzo y ausencia de azul en .theme-athlete[data-v7]
      await esperarEstilo(page, "body", {
        backgroundColor: expectedBg,
      }, { esTestId: false, descripcion: `body background (${tema})` });

      await esperarEstilo(page, ".theme-athlete[data-v7]", {
        backgroundColor: expectedBg,
        fontFamilyContains: "Geist",
      }, { esTestId: false, descripcion: `.theme-athlete[data-v7] (${tema})` });

      // 2. Los tokens HSL de primario y la pastilla de navegación inferior heredan el scope v7 (tinta/papel, sin azul)
      const activeNavItem = page.locator("[data-testid='nav-inferior'] [aria-current='page'] .a-ni");
      await expect(activeNavItem).toBeVisible();
      const navStyles = await activeNavItem.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { bg: cs.backgroundColor, color: cs.color };
      });
      expect(navStyles.bg).toBe(expectedPrimaryBg);
      expect(navStyles.color).toBe(expectedPrimaryFg);
      expect(navStyles.bg).not.toBe("rgb(37, 99, 235)");
      expect(navStyles.bg).not.toBe("rgb(14, 165, 233)");

      // 3. Verificar que las 3 fuentes Archivo, Geist y Geist Mono están registradas en document.fonts
      const loadedFamilies = await page.evaluate(() =>
        Array.from(document.fonts).map((f) => f.family.replace(/["']/g, "").toLowerCase()),
      );
      expect(loadedFamilies.some((f) => f.includes("archivo"))).toBe(true);
      expect(loadedFamilies.some((f) => f.includes("geist") && !f.includes("mono"))).toBe(true);
      expect(loadedFamilies.some((f) => f.includes("geist") && f.includes("mono"))).toBe(true);

      // 4. Verificar clases tipográficas .a-t-* y elevación dentro de .theme-athlete[data-v7] contra 05 §3.1
      await page.evaluate(() => {
        const root = document.querySelector(".theme-athlete[data-v7]");
        if (!root) throw new Error("Falta .theme-athlete[data-v7]");
        const probe = document.createElement("div");
        probe.id = "v7-base-probe";
        probe.innerHTML = `
          <h1 class="a-t-d" data-testid="probe-d">PLAN GENERAL</h1>
          <h2 class="a-t-h" data-testid="probe-h">Press banca plano</h2>
          <p class="a-t-dxl" data-testid="probe-dxl">Bienvenida</p>
          <span class="a-t-label" data-testid="probe-label">RUTINA</span>
          <span class="a-t-bs" data-testid="probe-bs">Sentadilla</span>
          <span class="a-t-sec" data-testid="probe-sec">Última vez: 45 kg × 9</span>
          <div class="a-card" data-testid="probe-card">Tarjeta</div>
        `;
        root.appendChild(probe);
      });

      await esperarEstilo(page, "probe-d", {
        fontFamilyContains: "Archivo",
        fontSizePx: 32,
        fontWeight: "800",
        fontStretch: "112%",
      });
      await esperarEstilo(page, "probe-h", {
        fontFamilyContains: "Archivo",
        fontSizePx: 26,
        fontWeight: "800",
        fontStretch: "100%",
      });
      await esperarEstilo(page, "probe-dxl", {
        fontFamilyContains: "Archivo",
        fontSizePx: 40,
        fontWeight: "900",
        fontStretch: "125%",
      });
      await esperarEstilo(page, "probe-label", {
        fontFamilyContains: "Geist Mono",
        fontSizePx: 12,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacingPx: 1.44,
      });
      await esperarEstilo(page, "probe-bs", {
        fontFamilyContains: "Geist",
        fontSizePx: 16,
        fontWeight: "600",
      });
      await esperarEstilo(page, "probe-sec", {
        fontFamilyContains: "Geist",
        fontSizePx: 14,
        fontWeight: "500",
      });
      await esperarEstilo(page, "probe-card", {
        backgroundColor: tema === "dark" ? "rgb(24, 24, 27)" : "rgb(255, 255, 255)",
        boxShadowContains: "0px 1px 2px",
      });
    });
  }
});
