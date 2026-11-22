import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");

describe("GOZS-687: configuración estricta de Supabase y limpieza de scripts manuales", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("falla con mensaje claro si falta NEXT_PUBLIC_SUPABASE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.resetModules();

    await expect(import("@/lib/supabase/browser")).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("falla con mensaje claro si falta NEXT_PUBLIC_SUPABASE_ANON_KEY", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.resetModules();

    await expect(import("@/lib/supabase/browser")).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("exporta las variables de entorno configuradas sin fallback hardcodeado", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://custom-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "custom-anon-key");
    vi.resetModules();

    const mod = await import("@/lib/supabase/browser");
    expect(mod.SUPABASE_URL).toBe("https://custom-project.supabase.co");
    expect(mod.SUPABASE_ANON_KEY).toBe("custom-anon-key");

    const source = fs.readFileSync(path.join(REPO_ROOT, "src/lib/supabase/browser.ts"), "utf8");
    expect(source).not.toContain("cutvhrxgrwwfntetdsdo");
    expect(source).not.toContain("sb_publishable_");
  });

  it("no existen 00_FULL_SETUP_AND_SEED_GOZS.sql ni apply_migration_sprints.js en el repo", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "supabase/00_FULL_SETUP_AND_SEED_GOZS.sql"))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, "scripts/apply_migration_sprints.js"))).toBe(false);
  });
});
