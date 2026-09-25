#!/usr/bin/env node
/**
 * Prints SQL that creates (or resets) an admin account, hashed exactly like the Worker does
 * (PBKDF2-SHA256, 100k iterations). Usage:
 *
 *   node scripts/create-admin.mjs "Owner Name" owner@example.com 'a-long-password' super_admin > admin.sql
 *   npx wrangler d1 execute DB --remote --file=admin.sql && rm admin.sql
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

const [name, email, password, role = "super_admin"] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error('Usage: node scripts/create-admin.mjs "Name" email password [super_admin|manager|order_processor|viewer]');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}
if (!["super_admin", "manager", "order_processor", "viewer"].includes(role)) {
  console.error("Unknown role");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256");
const stored = `pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
console.log(
  `INSERT INTO admins (name, email, password_hash, role) VALUES (${q(name)}, ${q(email)}, ${q(stored)}, ${q(role)}) ` +
    `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role, is_active = 1, deleted_at = NULL;`,
);
