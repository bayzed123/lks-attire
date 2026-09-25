/** Small data-access helpers shared by routes: settings, zones, audit log, rate limiting, sessions, Turnstile. */
import type { Context } from "hono";
import type { AppEnv, Env, AdminSession, CustomerSession } from "../env";
import { parseJson, clientIp, E } from "./http";
import type { Zone } from "./pricing";

// ---------- Settings (D1 table, cached in KV for 60s) ----------
export async function getSetting<T>(env: Env, key: string, fallback: T): Promise<T> {
  const cacheKey = `setting:${key}`;
  const cached = await env.KV.get(cacheKey);
  if (cached) return parseJson<T>(cached, fallback);
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  const value = row ? parseJson<T>(row.value, fallback) : fallback;
  await env.KV.put(cacheKey, JSON.stringify(value), { expirationTtl: 60 });
  return value;
}

export async function putSetting(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  )
    .bind(key, JSON.stringify(value))
    .run();
  await env.KV.delete(`setting:${key}`);
}

export interface PaymentSettings {
  cod: { enabled: boolean };
  bkash: { enabled: boolean; mode: "manual" | "api"; manualNumber: string; accountType: string };
  nagad: { enabled: boolean; mode: "manual" | "api"; manualNumber: string; accountType: string };
  rocket: { enabled: boolean; mode: "manual"; manualNumber: string; accountType: string };
  card: { enabled: boolean; provider: "sslcommerz" };
}
export const DEFAULT_PAYMENTS: PaymentSettings = {
  cod: { enabled: true },
  bkash: { enabled: false, mode: "manual", manualNumber: "", accountType: "Personal" },
  nagad: { enabled: false, mode: "manual", manualNumber: "", accountType: "Personal" },
  rocket: { enabled: false, mode: "manual", manualNumber: "", accountType: "Personal" },
  card: { enabled: false, provider: "sslcommerz" },
};

// ---------- Delivery zones ----------
interface ZoneRow extends Omit<Zone, "district_ids" | "upazila_ids"> {
  id: number;
  district_ids: string;
  upazila_ids: string;
}
export async function loadZones(env: Env): Promise<(Zone & { id: number })[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM delivery_zones WHERE deleted_at IS NULL AND is_active = 1 ORDER BY sort_order, id",
  ).all<ZoneRow>();
  return results.map((z) => ({
    ...z,
    district_ids: parseJson<number[]>(z.district_ids, []),
    upazila_ids: parseJson<number[]>(z.upazila_ids, []),
  }));
}

// ---------- Audit log ----------
export async function audit(
  c: Context<AppEnv>,
  action: string,
  entity: string,
  entityId: string | number | null,
  details?: unknown,
): Promise<void> {
  const admin = c.get("admin");
  await c.env.DB.prepare(
    "INSERT INTO audit_log (admin_id, admin_name, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(admin?.id ?? null, admin?.name ?? "system", action, entity, entityId == null ? null : String(entityId), details ? JSON.stringify(details).slice(0, 4000) : null, clientIp(c))
    .run();
}

// ---------- Rate limiting (fixed window in KV) ----------
/** Returns the new count. Throws 429 when the limit is exceeded. */
export async function rateLimit(c: Context<AppEnv>, bucket: string, limit: number, windowSec: number): Promise<number> {
  const key = `rl:${bucket}:${clientIp(c)}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const current = Number((await c.env.KV.get(key)) ?? "0");
  if (current >= limit) throw E.tooMany();
  await c.env.KV.put(key, String(current + 1), { expirationTtl: Math.max(60, windowSec) });
  return current + 1;
}

// ---------- Sessions ----------
export const ADMIN_COOKIE = "lks_admin";
export const CUSTOMER_COOKIE = "lks_cust";
export const ADMIN_TTL = 60 * 60 * 12; // 12 hours
export const CUSTOMER_TTL = 60 * 60 * 24 * 30; // 30 days

export async function readAdminSession(env: Env, token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  return parseJson<AdminSession | null>(await env.KV.get(`s:a:${token}`), null);
}
export async function readCustomerSession(env: Env, token: string | undefined): Promise<CustomerSession | null> {
  if (!token) return null;
  return parseJson<CustomerSession | null>(await env.KV.get(`s:c:${token}`), null);
}

// ---------- Cloudflare Turnstile (optional bot protection) ----------
export async function verifyTurnstile(c: Context<AppEnv>, token: string | undefined): Promise<void> {
  if (!c.env.TURNSTILE_SECRET) return; // not configured → skip (rate limits still apply)
  if (!token) throw E.badRequest("Please complete the security check.", "নিরাপত্তা যাচাই সম্পন্ন করুন।");
  const form = new FormData();
  form.append("secret", c.env.TURNSTILE_SECRET);
  form.append("response", token);
  form.append("remoteip", clientIp(c));
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = (await res.json()) as { success: boolean };
  if (!data.success) throw E.badRequest("Security check failed. Please try again.", "নিরাপত্তা যাচাই ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
}

/** Expand category ids to include all descendants (for filters and coupon rules). */
export async function expandCategoryIds(env: Env, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare("SELECT id, parent_id FROM categories WHERE deleted_at IS NULL").all<{ id: number; parent_id: number | null }>();
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of results) {
      if (r.parent_id != null && out.has(r.parent_id) && !out.has(r.id)) {
        out.add(r.id);
        grew = true;
      }
    }
  }
  return [...out];
}
