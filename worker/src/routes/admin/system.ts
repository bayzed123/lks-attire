/** Inventory, settings, uploads, audit log, notifications bell, staff presence, category ordering, global search, AI helper. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../env";
import { body, E, intParam, validate } from "../../lib/http";
import { stockAdjustSchema } from "../../lib/schemas";
import { perm } from "../../middleware";
import { audit, getSetting, putSetting } from "../../lib/store";
import { ROLE_LABELS, ROLE_MATRIX, PERMISSIONS } from "../../lib/rbac";
import { bkashConfigured, nagadConfigured, sslczConfigured } from "../../lib/payments";
import { steadfastConfigured } from "../../lib/couriers";

const app = new Hono<AppEnv>();

// ---------- Inventory ----------
app.get("/inventory", perm("inventory.read"), async (c) => {
  const q = c.req.query();
  const where = ["p.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    where.push("(p.name_en LIKE ? OR p.name_bn LIKE ? OR v.sku LIKE ? OR p.sku LIKE ?)");
    args.push(like, like, like, like);
  }
  if (q.stock === "low") where.push("v.stock <= v.low_stock_threshold AND v.stock > 0");
  if (q.stock === "out") where.push("v.stock = 0");
  const limit = intParam(q.limit, 50, 1, 200);
  const page = intParam(q.page, 1, 1, 100000);
  const w = where.join(" AND ");
  const [count, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE ${w}`).bind(...args).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT v.id, v.product_id, v.sku, v.size, v.color, v.color_hex, v.stock, v.low_stock_threshold, p.name_en, p.name_bn, p.slug, p.status
         FROM product_variants v JOIN products p ON p.id = v.product_id WHERE ${w} ORDER BY v.stock ASC, p.name_en LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all(),
  ]);
  const total = count?.n ?? 0;
  return c.json({ items: rows.results, total, page, pages: Math.ceil(total / limit) });
});

app.post("/inventory/adjust", perm("inventory.adjust"), async (c) => {
  const b = await body(c, z.object({ items: z.array(stockAdjustSchema).min(1).max(200) }));
  const actor = c.get("admin")!.name;
  const stmts: D1PreparedStatement[] = [];
  for (const it of b.items) {
    const expr = it.mode === "set" ? "?" : it.mode === "add" ? "stock + ?" : "MAX(0, stock - ?)";
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO inventory_log (product_id, variant_id, change, stock_after, reason, note, actor) SELECT product_id, id, " +
          (it.mode === "set" ? "? - stock" : it.mode === "add" ? "?" : "-MIN(stock, ?)") +
          ", " + (it.mode === "set" ? "?" : it.mode === "add" ? "stock + ?" : "MAX(0, stock - ?)") + ", ?, ?, ? FROM product_variants WHERE id = ?",
      ).bind(it.quantity, it.quantity, it.reason, it.note ?? null, actor, it.variantId),
    );
    stmts.push(c.env.DB.prepare(`UPDATE product_variants SET stock = ${expr} WHERE id = ?`).bind(it.quantity, it.variantId));
  }
  await c.env.DB.batch(stmts);
  await audit(c, "stock_adjust", "inventory", null, b.items);
  return c.json({ ok: true, en: `Stock updated for ${b.items.length} item(s).`, bn: `${b.items.length}টি আইটেমের স্টক আপডেট হয়েছে।` });
});

app.get("/inventory/log", perm("inventory.read"), async (c) => {
  const q = c.req.query();
  const where = ["1=1"];
  const args: unknown[] = [];
  if (q.variant_id) {
    where.push("l.variant_id = ?");
    args.push(Number(q.variant_id));
  }
  if (q.reason) {
    where.push("l.reason = ?");
    args.push(q.reason);
  }
  const limit = intParam(q.limit, 50, 1, 200);
  const page = intParam(q.page, 1, 1, 100000);
  const [count, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM inventory_log l WHERE ${where.join(" AND ")}`).bind(...args).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT l.*, p.name_en, v.size, v.color FROM inventory_log l LEFT JOIN products p ON p.id = l.product_id LEFT JOIN product_variants v ON v.id = l.variant_id
        WHERE ${where.join(" AND ")} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all(),
  ]);
  const total = count?.n ?? 0;
  return c.json({ items: rows.results, total, page, pages: Math.ceil(total / limit) });
});

// ---------- Categories: drag-to-reorder ----------
app.put("/categories/reorder", perm("categories.write"), async (c) => {
  const b = await body(c, z.object({ items: z.array(z.object({ id: z.number().int().positive(), parent_id: z.number().int().positive().nullable(), sort_order: z.number().int().min(0) })).max(500) }));
  await c.env.DB.batch(b.items.map((it) => c.env.DB.prepare("UPDATE categories SET parent_id = ?, sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND (? IS NULL OR ? != id)").bind(it.parent_id, it.sort_order, it.id, it.parent_id, it.parent_id)));
  await audit(c, "reorder", "category", null, { count: b.items.length });
  return c.json({ ok: true, en: "Order saved.", bn: "ক্রম সংরক্ষণ করা হয়েছে।" });
});

// ---------- Settings ----------
const SETTING_KEYS = ["store", "payments", "notifications", "sms_templates", "seo", "inventory", "integrations"] as const;

app.get("/settings", perm("settings.read"), async (c) => {
  const entries = await Promise.all(SETTING_KEYS.map(async (k) => [k, await getSetting(c.env, k, {})] as const));
  return c.json({
    settings: Object.fromEntries(entries),
    // Secrets are never returned — only whether each integration is configured.
    integrations: {
      bkashApi: bkashConfigured(c.env),
      nagadApi: nagadConfigured(c.env),
      sslcommerz: sslczConfigured(c.env),
      steadfast: steadfastConfigured(c.env),
      sms: Boolean(c.env.SMS_API_KEY),
      whatsapp: Boolean(c.env.WHATSAPP_TOKEN && c.env.WHATSAPP_PHONE_ID),
      email: Boolean(c.env.RESEND_API_KEY && c.env.EMAIL_FROM),
      turnstile: Boolean(c.env.TURNSTILE_SECRET),
      r2: Boolean(c.env.MEDIA),
      ai: Boolean(c.env.AI),
    },
  });
});

app.put("/settings/:key", perm("settings.manage"), async (c) => {
  const key = c.req.param("key");
  if (!(SETTING_KEYS as readonly string[]).includes(key)) throw E.notFound("Setting");
  const value = await body(c, z.record(z.string(), z.unknown()));
  if (JSON.stringify(value).length > 20000) throw E.badRequest("Settings are too large.", "সেটিংস অনেক বড়।");
  // Guard against someone pasting API secrets into the database-backed settings.
  if (/secret|password|api_key|apikey|token/i.test(JSON.stringify(Object.keys(value))))
    throw E.badRequest("API keys must be stored as Wrangler secrets, not here.", "API কী এখানে নয়, Wrangler secret হিসেবে রাখুন।");
  const before = await getSetting(c.env, key, {});
  await putSetting(c.env, key, value);
  await audit(c, "update", "settings", key, { before, after: value });
  return c.json({ ok: true, en: "Settings saved.", bn: "সেটিংস সংরক্ষণ করা হয়েছে।" });
});

// ---------- Image uploads → R2 ----------
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
app.post("/uploads", perm("products.write"), async (c) => {
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) throw E.badRequest("Choose an image to upload.", "আপলোড করার জন্য একটি ছবি বেছে নিন।");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw E.badRequest("Only JPG, PNG, WebP or AVIF images are allowed.", "শুধু JPG, PNG, WebP বা AVIF ছবি দেওয়া যাবে।");
  if (file.size > 5 * 1024 * 1024) throw E.badRequest("Image is too large (max 5 MB).", "ছবিটি অনেক বড় (সর্বোচ্চ ৫ MB)।");
  const folder = String(form["folder"] ?? "products").replace(/[^a-z0-9-]/g, "") || "products";
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  if (c.env.MEDIA) {
    await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
  } else {
    // Fallback when R2 isn't enabled on the Cloudflare account: store the (browser-resized) image in KV.
    await c.env.KV.put(`media:${key}`, await file.arrayBuffer(), { metadata: { contentType: file.type } });
  }
  await audit(c, "upload", "media", key, { size: file.size });
  return c.json({ url: `/media/${key}`, key }, 201);
});

// ---------- Audit log ----------
app.get("/audit", perm("audit.view"), async (c) => {
  const q = c.req.query();
  const where = ["1=1"];
  const args: unknown[] = [];
  for (const [p, col] of [["entity", "entity"], ["action", "action"], ["admin_id", "admin_id"]] as const) {
    if (q[p]) {
      where.push(`${col} = ?`);
      args.push(q[p]);
    }
  }
  if (q.q) {
    where.push("(admin_name LIKE ? OR entity_id LIKE ? OR details LIKE ?)");
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like);
  }
  const limit = intParam(q.limit, 50, 1, 200);
  const page = intParam(q.page, 1, 1, 100000);
  const [count, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ${where.join(" AND ")}`).bind(...args).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT * FROM audit_log WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...args, limit, (page - 1) * limit).all(),
  ]);
  const total = count?.n ?? 0;
  return c.json({ items: rows.results, total, page, pages: Math.ceil(total / limit) });
});

// ---------- Notification bell ----------
app.get("/notifications", perm("dashboard.view"), async (c) => {
  const since = validate(z.object({ since: z.string().optional() }), c.req.query()).since ?? new Date(Date.now() - 3 * 86400_000).toISOString();
  const [orders, low, reviews] = await Promise.all([
    c.env.DB.prepare("SELECT id, order_no, customer_name, total, created_at FROM orders WHERE created_at > ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 10").bind(since).all(),
    c.env.DB.prepare(
      "SELECT v.id, p.id AS product_id, p.name_en, p.name_bn, v.size, v.color, v.stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.stock <= v.low_stock_threshold AND p.status = 'active' AND p.deleted_at IS NULL ORDER BY v.stock LIMIT 10",
    ).all(),
    c.env.DB.prepare("SELECT r.id, r.name, r.rating, r.created_at, p.name_en FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.status = 'pending' AND r.deleted_at IS NULL ORDER BY r.id DESC LIMIT 10").all(),
  ]);
  return c.json({ newOrders: orders.results, lowStock: low.results, pendingReviews: reviews.results });
});

// ---------- Staff presence (who is online) ----------
app.post("/presence", async (c) => {
  const a = c.get("admin")!;
  await c.env.KV.put(`presence:${a.id}`, JSON.stringify({ id: a.id, name: a.name, role: a.role, at: new Date().toISOString(), page: c.req.query("page") ?? "" }), { expirationTtl: 120 });
  const list = await c.env.KV.list({ prefix: "presence:" });
  const online = (await Promise.all(list.keys.map((k) => c.env.KV.get(k.name, "json")))).filter(Boolean);
  return c.json({ online });
});

// ---------- Roles ----------
app.get("/roles", async (c) => c.json({ permissions: PERMISSIONS, matrix: ROLE_MATRIX, labels: ROLE_LABELS }));

// ---------- Global search (right sidebar) ----------
app.get("/search", perm("dashboard.view"), async (c) => {
  const term = (c.req.query("q") ?? "").trim();
  if (term.length < 2) return c.json({ orders: [], products: [], customers: [] });
  const like = `%${term.replace(/[%_]/g, "")}%`;
  // Phone numbers are stored as 01XXXXXXXXX; also match when staff type +880 / 880.
  const digits = term.replace(/\D/g, "");
  const phone = digits.length >= 5 ? `%${digits.replace(/^(?:00)?880/, "0")}%` : like;
  const [orders, products, customers] = await Promise.all([
    c.env.DB.prepare(
      `SELECT o.id, o.order_no, o.invoice_no, o.customer_name, o.customer_phone, o.total, o.status, o.created_at FROM orders o
        WHERE o.deleted_at IS NULL AND (o.order_no LIKE ? OR o.invoice_no LIKE ? OR o.customer_phone LIKE ? OR o.customer_name LIKE ? OR o.customer_email LIKE ?
          OR o.payment_ref LIKE ? OR o.tracking_id LIKE ? OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.sku LIKE ?))
        ORDER BY o.id DESC LIMIT 8`,
    ).bind(like, like, phone, like, like, like, like, like).all(),
    c.env.DB.prepare(
      `SELECT p.id, p.name_en, p.name_bn, p.slug, p.sku, p.price, p.sale_price,
              (SELECT v.sku FROM product_variants v WHERE v.product_id = p.id AND v.sku LIKE ? LIMIT 1) AS variant_sku
         FROM products p WHERE p.deleted_at IS NULL AND (p.name_en LIKE ? OR p.name_bn LIKE ? OR p.sku LIKE ? OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.sku LIKE ?)) LIMIT 6`,
    ).bind(like, like, like, like, like).all(),
    c.env.DB.prepare(
      `SELECT c.id, c.name, c.phone, c.email,
              (SELECT COUNT(*) FROM orders o WHERE o.customer_phone = c.phone AND o.deleted_at IS NULL) AS order_count
         FROM customers c WHERE c.deleted_at IS NULL AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?
           OR c.phone IN (SELECT customer_phone FROM orders WHERE invoice_no LIKE ? OR order_no LIKE ?)) LIMIT 6`,
    ).bind(like, phone, like, like, like).all(),
  ]);
  return c.json({ orders: orders.results, products: products.results, customers: customers.results });
});

// ---------- Workers AI: bilingual product description draft (Phase 3, optional) ----------
app.post("/ai/describe", perm("products.write"), async (c) => {
  if (!c.env.AI) throw E.badRequest("AI is not enabled for this store. Add the [ai] binding in wrangler.toml.", "এই দোকানে AI চালু নেই।");
  const b = await body(c, z.object({ name: z.string().min(2).max(160), fabric: z.string().max(200).optional(), category: z.string().max(80).optional(), notes: z.string().max(400).optional() }));
  const prompt = `Write a warm, honest product description for a women's clothing shop in Tangail, Bangladesh.
Product: ${b.name}
Category: ${b.category ?? ""}
Fabric: ${b.fabric ?? ""}
Notes: ${b.notes ?? ""}
Return strict JSON: {"en": "<2-3 sentences in simple English>", "bn": "<same meaning in natural Bangla>"}. No exaggerated claims.`;
  const out = (await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct" as Parameters<Ai["run"]>[0], { messages: [{ role: "user", content: prompt }], max_tokens: 400 } as never)) as { response?: string };
  const match = out.response?.match(/\{[\s\S]*\}/);
  let parsed: { en?: string; bn?: string } = {};
  try {
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    /* fall through */
  }
  return c.json({ en: parsed.en ?? out.response ?? "", bn: parsed.bn ?? "" });
});

export default app;
