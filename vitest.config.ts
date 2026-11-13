import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      "harness-kit/tests/**/*.spec.ts",
    ],
    globals: false,
    // Child processes inherit process.env, so the guard never writes real telemetry from tests.
    env: { HARNESS_TELEMETRY: "0" },
    testTimeout: 30000,
    hookTimeout: 120000,
    teardownTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
