import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const SUPABASE_STUB_PORT = 54321;

// E2E (GOZS-196): la app corre contra un stub local de Supabase (tests/e2e/supabase-stub.mjs),
// así el middleware y el SSR pasan el RBAC sin credenciales reales ni tocar producción.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", grepInvert: /@mobile/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", grep: /@mobile/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node tests/e2e/supabase-stub.mjs",
      url: `http://localhost:${SUPABASE_STUB_PORT}/health`,
      reuseExistingServer: true,
      env: { STUB_PORT: String(SUPABASE_STUB_PORT) },
    },
    {
      command: `npx next dev -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/login`,
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${SUPABASE_STUB_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
      },
    },
  ],
});
