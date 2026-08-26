import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration tests run against a real Postgres (Section 22.3). Each file gets
 * its own schema so no mutable state is shared between files.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/e2e/**"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    globalSetup: ["tests/integration/globalSetup.ts"],
  },
});
