import fs from "node:fs";
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

const ALL_INCLUDE = [
  "src/**/*.{test,spec}.{ts,tsx}",
  "tests/**/*.{test,spec}.{ts,tsx}",
  "harness-kit/tests/**/*.spec.ts",
];

function classifySpecs(rootDir: string): { dbSpecs: string[]; harnessSpecs: string[] } {
  const roots = [
    { base: "src", pattern: /\.(test|spec)\.(ts|tsx)$/ },
    { base: "tests", pattern: /\.(test|spec)\.(ts|tsx)$/ },
    { base: "harness-kit/tests", pattern: /\.spec\.ts$/ },
  ];
  const dbSpecs: string[] = [];
  const harnessSpecs: string[] = [];

  function walk(absDir: string, relDir: string, pattern: RegExp): void {
    if (!fs.existsSync(absDir)) return;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (rel === "harness-kit/tests/fixtures") continue;
        walk(abs, rel, pattern);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        const src = fs.readFileSync(abs, "utf8");
        if (/@electric-sql\/pglite|pglite-migrada/.test(src)) {
          dbSpecs.push(rel);
        } else if (/\bchild_process\b/.test(src)) {
          harnessSpecs.push(rel);
        }
      }
    }
  }

  for (const { base, pattern } of roots) {
    walk(path.join(rootDir, base), base, pattern);
  }
  return { dbSpecs: dbSpecs.sort(), harnessSpecs: harnessSpecs.sort() };
}

const { dbSpecs, harnessSpecs } = classifySpecs(__dirname);

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Child processes inherit process.env, so the guard never writes real telemetry from tests.
    // Non-routable Supabase URL guarantees tests never touch production by accident.
    env: {
      HARNESS_TELEMETRY: "0",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
    maxWorkers: 4,
    testTimeout: 30000,
    hookTimeout: 120000,
    teardownTimeout: 60000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ALL_INCLUDE,
          exclude: [...configDefaults.exclude, ...dbSpecs, ...harnessSpecs],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: dbSpecs,
          globalSetup: ["./src/__tests__/helpers/pglite-global-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "harness",
          include: harnessSpecs,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
