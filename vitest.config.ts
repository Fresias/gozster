import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.test.ts",
      "harness-kit/tests/**/*.spec.ts",
    ],
    globals: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    pool: "forks",
    fileParallelism: false,
    poolOptions: {
      forks: {
        execArgv: [
          "--no-wasm-dynamic-tiering",
          "--no-wasm-tier-up",
        ],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
