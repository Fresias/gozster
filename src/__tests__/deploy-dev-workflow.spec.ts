import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = fs.readFileSync(
  path.resolve(__dirname, "../../.github/workflows/deploy-dev.yml"),
  "utf8",
);

describe("deploy-dev.yml (migraciones Supabase en develop)", () => {
  it("se dispara en push a develop filtrado por paths y por workflow_dispatch", () => {
    expect(WORKFLOW).toMatch(/branches:\s*\[develop\]/);
    expect(WORKFLOW).toContain('"supabase/migrations/**"');
    expect(WORKFLOW).toContain('"scripts/check-supabase-migrations.mjs"');
    expect(WORKFLOW).toContain('".github/workflows/deploy-dev.yml"');
    expect(WORKFLOW).toContain("workflow_dispatch:");
    expect(WORKFLOW).toMatch(/apply_migrations:[\s\S]*?default: true/);
  });

  it("nunca cancela migraciones en curso y usa el environment develop", () => {
    expect(WORKFLOW).toContain("group: deploy-dev-migrations");
    expect(WORKFLOW).toContain("cancel-in-progress: false");
    expect(WORKFLOW).toContain("environment: develop");
    expect(WORKFLOW).toContain("contents: read");
  });

  it("se omite si DEV_MIGRATIONS_ENABLED no es true (salvo ejecución manual)", () => {
    expect(WORKFLOW).toContain(
      "if: github.event_name == 'workflow_dispatch' || vars.DEV_MIGRATIONS_ENABLED == 'true'",
    );
  });

  it("aplica migraciones y luego verifica cero pendientes", () => {
    const push = WORKFLOW.indexOf("supabase db push --remote=");
    const check = WORKFLOW.indexOf("check-supabase-migrations.mjs --remote");
    expect(push).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(push);
    expect(WORKFLOW).toContain(
      "if: github.event_name == 'push' || github.event.inputs.apply_migrations == 'true'",
    );
  });

  it("no contiene URLs ni secretos reales", () => {
    expect(WORKFLOW).not.toMatch(/postgres(ql)?:\/\//);
  });
});
