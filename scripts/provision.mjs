#!/usr/bin/env node
/**
 * One-command Cloudflare provisioning — safe to run on every deploy (idempotent).
 *
 *   1. Finds or creates the D1 database, KV namespace and R2 bucket for this Worker
 *   2. Writes their IDs into wrangler.toml (the bindings DB / KV / MEDIA)
 *   3. Applies D1 migrations
 *   4. Seeds the database the first time only (when the settings table is empty)
 *   5. Creates the first Super Admin if ADMIN_USERNAME (or ADMIN_EMAIL) + ADMIN_PASSWORD are set and no admin exists
 *
 * Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment (GitHub secrets in CI).
 * Optional env: WORKER_NAME (default from wrangler.toml), PUBLIC_URL, ADMIN_NAME, ADMIN_USERNAME (or ADMIN_EMAIL), ADMIN_PASSWORD.
 *
 * Usage: node scripts/provision.mjs            (after `node scripts/build-brand.mjs`)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const TOML = "wrangler.toml";
let toml = readFileSync(TOML, "utf8");
const worker = process.env.WORKER_NAME || /^name\s*=\s*"([^"]+)"/m.exec(toml)?.[1] || "lks-attire";
const DB_NAME = `${worker}-db`;
const KV_TITLE = `${worker}-kv`;
const BUCKET = `${worker}-media`;

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.error("✖ CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set (GitHub → Settings → Secrets → Actions).");
  process.exit(1);
}

function wrangler(args, { input, allowFail = false } = {}) {
  try {
    return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" } });
  } catch (e) {
    if (allowFail) return { error: `${e.stdout ?? ""}\n${e.stderr ?? ""}` };
    console.error(`✖ wrangler ${args.join(" ")} failed:\n${e.stdout ?? ""}\n${e.stderr ?? ""}`);
    process.exit(1);
  }
}
/** Pulls the first JSON array/object out of wrangler output (it may print banners/warnings around it). */
function json(out) {
  const text = String(out);
  const start = text.search(/[[{]/);
  for (let end = text.length; end > start; end--) {
    try { return JSON.parse(text.slice(start, end)); } catch { /* keep trimming */ }
  }
  throw new Error(`Could not parse wrangler JSON output:\n${text.slice(0, 500)}`);
}
const log = (m) => console.log(`• ${m}`);

// ---------- D1 ----------
let dbs = json(wrangler(["d1", "list", "--json"]));
let db = dbs.find((d) => d.name === DB_NAME);
let freshDb = false;
if (!db) {
  log(`Creating D1 database ${DB_NAME}`);
  wrangler(["d1", "create", DB_NAME]);
  dbs = json(wrangler(["d1", "list", "--json"]));
  db = dbs.find((d) => d.name === DB_NAME);
  freshDb = true;
}
if (!db) { console.error("✖ D1 database not found after creation"); process.exit(1); }
const dbId = db.uuid ?? db.id;
log(`D1 ${DB_NAME} → ${dbId}`);
toml = toml.replace(/^database_name = .*$/m, `database_name = "${DB_NAME}"`).replace(/^database_id = .*$/m, `database_id = "${dbId}"`);

// ---------- KV ----------
let kvs = json(wrangler(["kv", "namespace", "list"]));
const findKv = (list) => list.find((k) => k.title === KV_TITLE || k.title === `${worker}-${KV_TITLE}`);
let kv = findKv(kvs);
if (!kv) {
  log(`Creating KV namespace ${KV_TITLE}`);
  wrangler(["kv", "namespace", "create", KV_TITLE]);
  kvs = json(wrangler(["kv", "namespace", "list"]));
  kv = findKv(kvs);
}
if (!kv) { console.error("✖ KV namespace not found after creation"); process.exit(1); }
log(`KV ${kv.title} → ${kv.id}`);
toml = toml.replace(/(\[\[kv_namespaces\]\]\s*\nbinding = "KV"\s*\nid = )"[^"]*"/m, `$1"${kv.id}"`);

// ---------- R2 (optional — needs R2 enabled once in the Cloudflare dashboard) ----------
const r2 = wrangler(["r2", "bucket", "create", BUCKET], { allowFail: true });
const r2Err = typeof r2 === "object" ? r2.error : "";
if (!r2Err || /already exists|already own|10004/i.test(r2Err)) {
  log(`R2 bucket ${BUCKET} ready`);
  toml = toml.replace(/^bucket_name = .*$/m, `bucket_name = "${BUCKET}"`);
} else {
  console.warn(`⚠ R2 unavailable (${r2Err.split("\n").find((l) => l.trim()) ?? "unknown error"}).\n  Photos will be stored in KV until you enable R2 (Cloudflare dashboard → R2 → Enable), then re-run the workflow.`);
  toml = toml.replace(/\n\[\[r2_buckets\]\]\nbinding = "MEDIA"\nbucket_name = "[^"]*"\n/m, "\n");
}

if (process.env.PUBLIC_URL) toml = toml.replace(/^PUBLIC_URL = .*$/m, `PUBLIC_URL = "${process.env.PUBLIC_URL}"`);
toml = toml.replace(/^name = .*$/m, `name = "${worker}"`);
writeFileSync(TOML, toml);
log("wrangler.toml bindings updated");

// ---------- Migrations ----------
log("Applying D1 migrations");
wrangler(["d1", "migrations", "apply", "DB", "--remote"]);

const count = (sql) => {
  const out = json(wrangler(["d1", "execute", "DB", "--remote", "--json", "--command", sql]));
  return Number(out?.[0]?.results?.[0]?.n ?? 0);
};

// ---------- Seed (first run only) ----------
if (freshDb || count("SELECT COUNT(*) AS n FROM settings") === 0) {
  log("Seeding categories, delivery zones, settings, banners and starter products");
  wrangler(["d1", "execute", "DB", "--remote", "--file=dist-seed/seed.sql"]);
} else log("Database already seeded — skipping seed (your admin edits are kept)");

// ---------- First admin ----------
// ADMIN_USERNAME (e.g. "owner") or ADMIN_EMAIL — either works as the sign-in ID.
const { ADMIN_PASSWORD, ADMIN_NAME } = process.env;
const ADMIN_LOGIN = (process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
if (ADMIN_LOGIN && ADMIN_PASSWORD) {
  if (count("SELECT COUNT(*) AS n FROM admins") === 0) {
    if (!/^[a-z0-9._@+-]{3,120}$/.test(ADMIN_LOGIN)) { console.error("✖ ADMIN_USERNAME must be 3+ characters: letters, numbers, dot, dash or underscore (no spaces)"); process.exit(1); }
    if (ADMIN_PASSWORD.length < 10) { console.error("✖ ADMIN_PASSWORD must be at least 10 characters"); process.exit(1); }
    const salt = randomBytes(16);
    const hash = `pbkdf2$100000$${salt.toString("base64")}$${pbkdf2Sync(ADMIN_PASSWORD, salt, 100000, 32, "sha256").toString("base64")}`;
    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    writeFileSync(".admin.sql", `INSERT INTO admins (name, email, password_hash, role) VALUES (${q(ADMIN_NAME || "Owner")}, ${q(ADMIN_LOGIN)}, ${q(hash)}, 'super_admin');\n`);
    wrangler(["d1", "execute", "DB", "--remote", "--file=.admin.sql"]);
    unlinkSync(".admin.sql");
    log(`Super Admin "${ADMIN_LOGIN}" created — sign in at /admin/ with this username and ADMIN_PASSWORD`);
  } else log("An admin already exists — ADMIN_USERNAME/ADMIN_PASSWORD ignored");
} else log("ADMIN_USERNAME (or ADMIN_EMAIL) / ADMIN_PASSWORD not set — create the first admin later (see docs/GITHUB-SECRETS.md)");

console.log("✔ Provisioning complete");
