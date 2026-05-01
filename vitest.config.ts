import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      exclude: [
        "dist/**",
        "vitest.config.ts",
        "src/main.ts",
        "src/scheduled.ts",
        "src/db/client.ts",
        "src/db/migrate.ts",
        "srcx/test/**"
      ],
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },
    include: ["srcx/test/**/*.test.ts"]
  }
});
