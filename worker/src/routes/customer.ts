/** Customer accounts — register/login with mobile number, profile, order history, addresses, wishlist, password reset. */
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../env";
import { body, E, ApiError } from "../lib/http";
import { bdPhone, loginSchema, registerSchema, savedAddressSchema } from "../lib/schemas";
import { hashPassword, randomDigits, randomToken, verifyPassword } from "../lib/crypto";
import { CUSTOMER_COOKIE, CUSTOMER_TTL, getSetting, loadZones, rateLimit, verifyTurnstile } from "../lib/store";
import { optionalCustomer, requireCustomer } from "../middleware";
import { render, sendSms } from "../lib/notify";
import { resolveZone } from "../lib/pricing";
import { PRODUCT_CARD_COLUMNS, toCard } from "./public";
import { BRAND } from "../brand.generated";

const app = new Hono<AppEnv>();

async function startSession(c: Context<AppEnv>, cust: { id: number; name: string; phone: string }) {
  const token = randomToken();
  await c.env.KV.put(`s:c:${token}`, JSON.stringify({ id: cust.id, name: cust.name, phone: cust.phone }), { expirationTtl: CUSTOMER_TTL });
  setCookie(c, CUSTOMER_COOKIE, token, { httpOnly: true, secure: c.env.ENVIRONMENT !== "development", sameSite: "Lax", path: "/", maxAge: CUSTOMER_TTL });
}

app.post("/auth/register", async (c) => {
  await rateLimit(c, "register", 5, 3600);
  const b = await body(c, registerSchema);
  await verifyTurnstile(c, b.turnstileToken);
  const existing = await c.env.DB.prepare("SELECT id, password_hash FROM customers WHERE phone = ?").bind(b.phone).first<{ id: number; password_hash: string | null }>();
  if (existing?.password_hash) throw E.conflict("An account with this mobile number already exists. Please sign in.", "এই মোবাইল নম্বরে আগেই অ্যাকাউন্ট আছে। সাইন ইন করুন।");
  const hash = await hashPassword(b.password);
  let id: number;
  if (existing) {
    // Guest who ordered before — claim the record so past orders appear in their history.
    await c.env.DB.prepare("UPDATE customers SET name = ?, email = COALESCE(?, email), password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .bind(b.name, b.email, hash, existing.id)
      .run();
    await c.env.DB.prepare("UPDATE orders SET customer_id = ? WHERE customer_phone = ? AND customer_id IS NULL").bind(existing.id, b.phone).run();
    id = existing.id;
  } else {
    const r = await c.env.DB.prepare("INSERT INTO customers (name, phone, email, password_hash) VALUES (?, ?, ?, ?)").bind(b.name, b.phone, b.email, hash).run();
    id = Number(r.meta.last_row_id);
  }
  await startSession(c, { id, name: b.name, phone: b.phone });
  return c.json({ ok: true, customer: { id, name: b.name, phone: b.phone } }, 201);
});

app.post("/auth/login", async (c) => {
  await rateLimit(c, "cust-login", 10, 900);
  const b = await body(c, loginSchema);
  await verifyTurnstile(c, b.turnstileToken);
  const cust = await c.env.DB.prepare("SELECT id, name, phone, password_hash, is_blocked FROM customers WHERE phone = ? AND deleted_at IS NULL")
    .bind(b.phone)
    .first<{ id: number; name: string; phone: string; password_hash: string | null; is_blocked: number }>();
  if (!cust || !(await verifyPassword(b.password, cust.password_hash))) {
    throw new ApiError(401, "bad_credentials", "Mobile number or password is incorrect.", "মোবাইল নম্বর বা পাসওয়ার্ড সঠিক নয়।");
  }
  if (cust.is_blocked) throw new ApiError(403, "blocked", "This account is paused. Please call us for help.", "এই অ্যাকাউন্টটি বন্ধ আছে। সাহায্যের জন্য কল করুন।");
  await c.env.DB.prepare("UPDATE customers SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(cust.id).run();
  await startSession(c, cust);
  return c.json({ ok: true, customer: { id: cust.id, name: cust.name, phone: cust.phone } });
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, CUSTOMER_COOKIE);
  if (token) await c.env.KV.delete(`s:c:${token}`);
  deleteCookie(c, CUSTOMER_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// Password reset via a 6-digit SMS code (stored hashed-by-key in KV for 10 minutes, max 5 tries).
app.post("/auth/reset/request", async (c) => {
  await rateLimit(c, "otp", 5, 3600);
  const { phone } = await body(c, z.object({ phone: bdPhone }));
  const cust = await c.env.DB.prepare("SELECT id FROM customers WHERE phone = ? AND password_hash IS NOT NULL AND deleted_at IS NULL").bind(phone).first();
  if (cust) {
    const code = randomDigits(6);
    await c.env.KV.put(`otp:${phone}`, JSON.stringify({ code, tries: 0 }), { expirationTtl: 600 });
    const tpl = await getSetting<Record<string, { en: string; bn: string }>>(c.env, "sms_templates", {});
    const msg = render(tpl.otp?.bn ?? "{store} code: {code}", { code, store: BRAND.name.en });
    c.executionCtx.waitUntil(sendSms(c.env, phone, msg, "otp"));
    if (c.env.ENVIRONMENT === "development") console.log(`[dev] OTP for ${phone}: ${code}`);
  }
  // Same answer whether or not the number exists (prevents account enumeration).
  return c.json({ ok: true, en: "If this number has an account, we've sent a 6-digit code by SMS.", bn: "এই নম্বরে অ্যাকাউন্ট থাকলে ৬ সংখ্যার একটি কোড SMS এ পাঠানো হয়েছে।" });
});

app.post("/auth/reset/confirm", async (c) => {
  await rateLimit(c, "otp-confirm", 10, 3600);
  const b = await body(c, z.object({ phone: bdPhone, code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(128) }));
  const raw = await c.env.KV.get(`otp:${b.phone}`);
  const stored = raw ? (JSON.parse(raw) as { code: string; tries: number }) : null;
  if (!stored || stored.tries >= 5) throw E.badRequest("The code has expired. Please request a new one.", "কোডের মেয়াদ শেষ। নতুন কোড চান।");
  if (stored.code !== b.code) {
    await c.env.KV.put(`otp:${b.phone}`, JSON.stringify({ ...stored, tries: stored.tries + 1 }), { expirationTtl: 600 });
    throw E.badRequest("The code is not correct.", "কোডটি সঠিক নয়।");
  }
  await c.env.KV.delete(`otp:${b.phone}`);
  await c.env.DB.prepare("UPDATE customers SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE phone = ?").bind(await hashPassword(b.password), b.phone).run();
  return c.json({ ok: true, en: "Password updated. Please sign in.", bn: "পাসওয়ার্ড পরিবর্তন হয়েছে। সাইন ইন করুন।" });
});

/** Who is signed in (null for guests) — lets the storefront check without triggering a 401. */
app.get("/session", optionalCustomer, async (c) => {
  const s = c.get("customer");
  if (!s) return c.json({ customer: null });
  const cust = await c.env.DB.prepare("SELECT id, name, phone, email, created_at FROM customers WHERE id = ? AND deleted_at IS NULL").bind(s.id).first();
  return c.json({ customer: cust ?? null });
});

// ---------- Authenticated account ----------
const me = new Hono<AppEnv>();
me.use("*", requireCustomer);

me.get("/", async (c) => {
  const cust = await c.env.DB.prepare("SELECT id, name, phone, email, created_at FROM customers WHERE id = ?").bind(c.get("customer")!.id).first();
  if (!cust) throw E.unauthorized();
  return c.json({ customer: cust });
});

me.put("/", async (c) => {
  const b = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(80),
      email: z.union([z.literal(""), z.email()]).optional().transform((v) => v || null),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8).max(128).optional(),
    }),
  );
  const id = c.get("customer")!.id;
  if (b.newPassword) {
    const row = await c.env.DB.prepare("SELECT password_hash FROM customers WHERE id = ?").bind(id).first<{ password_hash: string }>();
    if (!(await verifyPassword(b.currentPassword ?? "", row?.password_hash))) throw E.badRequest("Current password is incorrect.", "বর্তমান পাসওয়ার্ড সঠিক নয়।");
    await c.env.DB.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").bind(await hashPassword(b.newPassword), id).run();
  }
  await c.env.DB.prepare("UPDATE customers SET name = ?, email = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(b.name, b.email, id).run();
  return c.json({ ok: true });
});

me.get("/orders", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.order_no, o.public_token, o.status, o.total, o.payment_method, o.payment_status, o.created_at, o.courier_partner, o.tracking_id,
            (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count,
            (SELECT image FROM order_items WHERE order_id = o.id LIMIT 1) AS image
       FROM orders o WHERE (o.customer_id = ? OR o.customer_phone = ?) AND o.deleted_at IS NULL ORDER BY o.created_at DESC LIMIT 100`,
  )
    .bind(c.get("customer")!.id, c.get("customer")!.phone)
    .all();
  return c.json({ orders: results });
});

me.get("/addresses", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC").bind(c.get("customer")!.id).all();
  return c.json({ addresses: results });
});

async function saveAddress(c: Context<AppEnv>, id: number | null) {
  const a = await body(c, savedAddressSchema);
  const cid = c.get("customer")!.id;
  const zone = resolveZone(await loadZones(c.env), a.district_id, a.upazila_id);
  if (a.is_default) await c.env.DB.prepare("UPDATE addresses SET is_default = 0 WHERE customer_id = ?").bind(cid).run();
  if (id) {
    const r = await c.env.DB.prepare(
      `UPDATE addresses SET label=?, recipient_name=?, phone=?, division_id=?, district_id=?, upazila_id=?, division=?, district=?, upazila=?, area=?, zone_code=?, is_default=? WHERE id=? AND customer_id=?`,
    )
      .bind(a.label, a.recipient_name, a.phone, a.division_id, a.district_id, a.upazila_id, a.division, a.district, a.upazila, a.area, zone?.code ?? null, a.is_default, id, cid)
      .run();
    if (!r.meta.changes) throw E.notFound("Address");
  } else {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM addresses WHERE customer_id = ?").bind(cid).first<{ n: number }>();
    if ((count?.n ?? 0) >= 10) throw E.badRequest("You can save up to 10 addresses.", "সর্বোচ্চ ১০টি ঠিকানা সংরক্ষণ করা যায়।");
    await c.env.DB.prepare(
      `INSERT INTO addresses (customer_id, label, recipient_name, phone, division_id, district_id, upazila_id, division, district, upazila, area, zone_code, is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(cid, a.label, a.recipient_name, a.phone, a.division_id, a.district_id, a.upazila_id, a.division, a.district, a.upazila, a.area, zone?.code ?? null, a.is_default || (count?.n ?? 0) === 0 ? 1 : 0)
      .run();
  }
  return c.json({ ok: true });
}
me.post("/addresses", (c) => saveAddress(c, null));
me.put("/addresses/:id", (c) => saveAddress(c, Number(c.req.param("id"))));
me.delete("/addresses/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM addresses WHERE id = ? AND customer_id = ?").bind(Number(c.req.param("id")), c.get("customer")!.id).run();
  return c.json({ ok: true });
});

me.get("/wishlist", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${PRODUCT_CARD_COLUMNS} FROM wishlist w JOIN products p ON p.id = w.product_id WHERE w.customer_id = ? AND p.deleted_at IS NULL AND p.status = 'active' ORDER BY w.created_at DESC`,
  )
    .bind(c.get("customer")!.id)
    .all<Parameters<typeof toCard>[0]>();
  return c.json({ items: results.map(toCard) });
});
me.post("/wishlist/:productId", async (c) => {
  await c.env.DB.prepare("INSERT OR IGNORE INTO wishlist (customer_id, product_id) VALUES (?, ?)").bind(c.get("customer")!.id, Number(c.req.param("productId"))).run();
  return c.json({ ok: true });
});
me.delete("/wishlist/:productId", async (c) => {
  await c.env.DB.prepare("DELETE FROM wishlist WHERE customer_id = ? AND product_id = ?").bind(c.get("customer")!.id, Number(c.req.param("productId"))).run();
  return c.json({ ok: true });
});

app.route("/me", me);
export default app;
