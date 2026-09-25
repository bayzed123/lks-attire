// Runs before each test file: apply D1 migrations and load the brand seed data.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
const done = await env.DB.prepare("SELECT COUNT(*) AS n FROM categories").first<{ n: number }>();
if (!done?.n) {
  const statements = env.TEST_SEED.split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n")
    .split(/;\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
}
