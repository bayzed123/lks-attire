import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Tests run inside the real Workers runtime (workerd via Miniflare) with local D1/KV/R2.
// `npm test` builds the brand first so dist/ and dist-seed/seed.sql exist.
export default defineConfig(async () => {
  const migrations = await readD1Migrations("worker/migrations");
  const seed = readFileSync("dist-seed/seed.sql", "utf8");
  return {
    plugins: [
      cloudflareTest({
        main: "./worker/src/index.ts",
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            ENVIRONMENT: "development",
            PUBLIC_URL: "",
            BOOTSTRAP_TOKEN: "test-bootstrap-token-0123456789",
            TEST_MIGRATIONS: migrations,
            TEST_SEED: seed,
          },
        },
      }),
    ],
    test: {
      include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  };
});
