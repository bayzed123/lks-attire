/** Public storefront API — catalogue, config, delivery fee, coupons, checkout, order tracking, reviews. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { body, E, intParam, parseJson, validate } from "../lib/http";
import { checkoutSchema, reviewSchema } from "../lib/schemas";
import { DEFAULT_PAYMENTS, expandCategoryIds, getSetting, loadZones, rateLimit, verifyTurnstile, type PaymentSettings } from "../lib/store";
import { createOrder, quote, type OrderRow } from "../lib/orders";
import { notifyOrder } from "../lib/notify";
import { bkashConfigured, bkashCreate, sslczConfigured, sslczInitiate } from "../lib/payments";
import { deliveryFee, discountPercent, resolveZone } from "../lib/pricing";
import { trackingUrl } from "../lib/couriers";
import { optionalCustomer } from "../middleware";
import { BRAND } from "../brand.generated";

const app = new Hono<AppEnv>();

// ---------- Store configuration ----------
app.get("/config", async (c) => {
  const [store, payments, seo, integrations, zones] = await Promise.all([
    getSetting<Record<string, string>>(c.env, "store", {}),
    getSetting<PaymentSettings>(c.env, "payments", DEFAULT_PAYMENTS),
    getSetting<Record<string, string>>(c.env, "seo", {}),
    getSetting<Record<string, string>>(c.env, "integrations", {}),
    loadZones(c.env),
  ]);
  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    brand: BRAND,
    store,
    seo,
    integrations,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
    payments: {
      COD: { enabled: payments.cod.enabled },
      bKash: { enabled: payments.bkash.enabled, mode: payments.bkash.mode === "api" && bkashConfigured(c.env) ? "api" : "manual", number: payments.bkash.manualNumber, accountType: payments.bkash.accountType },
      Nagad: { enabled: payments.nagad.enabled, mode: "manual", number: payments.nagad.manualNumber, accountType: payments.nagad.accountType },
      Rocket: { enabled: payments.rocket.enabled, mode: "manual", number: payments.rocket.manualNumber, accountType: payments.rocket.accountType },
      Card: { enabled: payments.card.enabled && sslczConfigured(c.env), mode: "api" },
    },
    zones: zones.map((z) => ({ code: z.code, name_en: z.name_en, name_bn: z.name_bn, fee: z.fee, free_shipping_min: z.free_shipping_min, eta_en: z.eta_en, eta_bn: z.eta_bn })),
  });
});

// ---------- Catalogue ----------
app.get("/categories", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.parent_id, c.slug, c.name_en, c.name_bn, c.sort_order,
            COALESCE(c.image_url, (SELECT json_extract(p.images, '$[0]') FROM products p
               WHERE p.status = 'active' AND p.deleted_at IS NULL AND (p.category_id = c.id OR p.category_id IN (SELECT id FROM categories x WHERE x.parent_id = c.id))
               ORDER BY (json_extract(p.images, '$[0]') LIKE '%.svg') ASC, p.is_featured DESC, p.sold_count DESC LIMIT 1)) AS image_url,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active' AND p.deleted_at IS NULL) AS product_count
       FROM categories c WHERE c.deleted_at IS NULL AND c.is_active = 1 ORDER BY c.sort_order, c.id`,
  ).all();
  c.header("Cache-Control", "public, max-age=120");
  return c.json({ categories: results });
});

const listQuery = z.object({
  category: z.string().optional(),
  q: z.string().max(100).optional(),
  size: z.string().max(30).optional(),
  color: z.string().max(40).optional(),
  fabric: z.string().max(60).optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  in_stock: z.enum(["0", "1"]).optional(),
  featured: z.enum(["0", "1"]).optional(),
  on_sale: z.enum(["0", "1"]).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular", "discount", "rating"]).default("newest"),
  page: z.string().optional(),
  limit: z.string().optional(),
  ids: z.string().max(500).optional(),
});

export const PRODUCT_CARD_COLUMNS = `p.id, p.slug, p.name_en, p.name_bn, p.price, p.sale_price, p.images, p.rating_avg, p.rating_count, p.sold_count, p.is_featured, p.created_at, p.category_id, p.delivery_mode, p.delivery_charge,
  (SELECT COALESCE(SUM(stock),0) FROM product_variants v WHERE v.product_id = p.id) AS stock,
  (SELECT GROUP_CONCAT(DISTINCT v.color_hex) FROM product_variants v WHERE v.product_id = p.id) AS color_hexes,
  (SELECT GROUP_CONCAT(DISTINCT v.size) FROM product_variants v WHERE v.product_id = p.id) AS sizes`;

type CardRow = { id: number; images: string; price: number; sale_price: number | null; color_hexes: string | null; sizes: string | null; stock: number } & Record<string, unknown>;
export function toCard(r: CardRow) {
  const imgs = parseJson<string[]>(r.images, []);
  return {
    ...r,
    images: imgs.slice(0, 2),
    color_hexes: (r.color_hexes ?? "").split(",").filter(Boolean),
    sizes: (r.sizes ?? "").split(",").filter(Boolean),
    discount_percent: discountPercent(r.price, r.sale_price),
    in_stock: r.stock > 0,
  };
}

app.get("/products", async (c) => {
  const f = validate(listQuery, c.req.query());
  const where = ["p.status = 'active'", "p.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (f.category) {
    const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE slug = ? AND deleted_at IS NULL").bind(f.category).first<{ id: number }>();
    if (!cat) return c.json({ items: [], total: 0, page: 1, pages: 0 });
    const ids = await expandCategoryIds(c.env, [cat.id]);
    where.push(`p.category_id IN (${ids.map(() => "?").join(",")})`);
    args.push(...ids);
  }
  if (f.q) {
    where.push("(p.name_en LIKE ? OR p.name_bn LIKE ? OR p.tags LIKE ? OR p.sku LIKE ?)");
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like, like);
  }
  if (f.size) {
    where.push("EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.size = ? AND v.stock > 0)");
    args.push(f.size);
  }
  if (f.color) {
    where.push("EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.color = ?)");
    args.push(f.color);
  }
  if (f.fabric) {
    where.push("(p.fabric_en LIKE ? OR p.tags LIKE ?)");
    args.push(`%${f.fabric}%`, `%${f.fabric}%`);
  }
  if (f.min != null) {
    where.push("COALESCE(p.sale_price, p.price) >= ?");
    args.push(f.min);
  }
  if (f.max != null) {
    where.push("COALESCE(p.sale_price, p.price) <= ?");
    args.push(f.max);
  }
  if (f.in_stock === "1") where.push("EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock > 0)");
  if (f.featured === "1") where.push("p.is_featured = 1");
  if (f.on_sale === "1") where.push("p.sale_price IS NOT NULL AND p.sale_price < p.price");
  if (f.ids) {
    const ids = f.ids.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
    if (!ids.length) return c.json({ items: [], total: 0, page: 1, pages: 0 });
    where.push(`p.id IN (${ids.map(() => "?").join(",")})`);
    args.push(...ids);
  }
  const order = {
    newest: "p.created_at DESC",
    price_asc: "COALESCE(p.sale_price, p.price) ASC",
    price_desc: "COALESCE(p.sale_price, p.price) DESC",
    popular: "p.sold_count DESC",
    discount: "CASE WHEN p.sale_price IS NULL THEN 0 ELSE (p.price - p.sale_price) * 1.0 / p.price END DESC",
    rating: "p.rating_avg DESC, p.rating_count DESC",
  }[f.sort];
  const limit = intParam(f.limit, 12, 1, 48);
  const page = intParam(f.page, 1, 1, 10000);
  const w = where.join(" AND ");
  const [count, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${w}`).bind(...args).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT ${PRODUCT_CARD_COLUMNS} FROM products p WHERE ${w} ORDER BY ${order}, p.id DESC LIMIT ? OFFSET ?`)
      .bind(...args, limit, (page - 1) * limit)
      .all<CardRow>(),
  ]);
  const total = count?.n ?? 0;
  c.header("Cache-Control", "public, max-age=30");
  return c.json({ items: rows.results.map(toCard), total, page, pages: Math.ceil(total / limit) });
});

/** Filter options for the listing sidebar. */
app.get("/facets", async (c) => {
  const slug = c.req.query("category");
  let where = "p.status = 'active' AND p.deleted_at IS NULL";
  const args: unknown[] = [];
  if (slug) {
    const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE slug = ?").bind(slug).first<{ id: number }>();
    if (cat) {
      const ids = await expandCategoryIds(c.env, [cat.id]);
      where += ` AND p.category_id IN (${ids.map(() => "?").join(",")})`;
      args.push(...ids);
    }
  }
  const [sizes, colors, price, fabrics] = await Promise.all([
    c.env.DB.prepare(`SELECT DISTINCT v.size FROM product_variants v JOIN products p ON p.id = v.product_id WHERE ${where} ORDER BY v.size`).bind(...args).all<{ size: string }>(),
    c.env.DB.prepare(`SELECT v.color, MAX(v.color_hex) AS hex FROM product_variants v JOIN products p ON p.id = v.product_id WHERE ${where} GROUP BY v.color ORDER BY v.color`).bind(...args).all<{ color: string; hex: string }>(),
    c.env.DB.prepare(`SELECT MIN(COALESCE(p.sale_price,p.price)) AS min, MAX(COALESCE(p.sale_price,p.price)) AS max FROM products p WHERE ${where}`).bind(...args).first<{ min: number; max: number }>(),
    c.env.DB.prepare(`SELECT DISTINCT p.fabric_en FROM products p WHERE ${where} AND p.fabric_en IS NOT NULL`).bind(...args).all<{ fabric_en: string }>(),
  ]);
  const fabricWords = new Set<string>();
  for (const f of fabrics.results) for (const w of ["Cotton", "Silk", "Jamdani", "Lawn", "Georgette", "Linen", "Rayon", "Nida", "Jersey", "Katan", "Chiffon"]) if (f.fabric_en.toLowerCase().includes(w.toLowerCase())) fabricWords.add(w);
  c.header("Cache-Control", "public, max-age=120");
  return c.json({ sizes: sizes.results.map((s) => s.size), colors: colors.results, price: price ?? { min: 0, max: 0 }, fabrics: [...fabricWords].sort() });
});

app.get("/products/:slug", async (c) => {
  const p = await c.env.DB.prepare("SELECT * FROM products WHERE slug = ? AND status = 'active' AND deleted_at IS NULL")
    .bind(c.req.param("slug"))
    .first<Record<string, unknown> & { id: number; category_id: number | null; images: string; price: number; sale_price: number | null }>();
  if (!p) throw E.notFound("Product");
  const [variants, reviews, related, crumbs] = await Promise.all([
    c.env.DB.prepare("SELECT id, size, color, color_hex, stock, price_override FROM product_variants WHERE product_id = ? ORDER BY id").bind(p.id).all(),
    c.env.DB.prepare("SELECT id, name, rating, body, reply, created_at FROM reviews WHERE product_id = ? AND status = 'approved' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20").bind(p.id).all(),
    c.env.DB.prepare(`SELECT ${PRODUCT_CARD_COLUMNS} FROM products p WHERE p.category_id = ? AND p.id != ? AND p.status='active' AND p.deleted_at IS NULL ORDER BY p.sold_count DESC LIMIT 8`)
      .bind(p.category_id, p.id)
      .all<CardRow>(),
    c.env.DB.prepare(
      `WITH RECURSIVE chain(id, parent_id, slug, name_en, name_bn, depth) AS (
         SELECT id, parent_id, slug, name_en, name_bn, 0 FROM categories WHERE id = ?
         UNION ALL SELECT c.id, c.parent_id, c.slug, c.name_en, c.name_bn, chain.depth + 1 FROM categories c JOIN chain ON c.id = chain.parent_id)
       SELECT slug, name_en, name_bn FROM chain ORDER BY depth DESC`,
    )
      .bind(p.category_id)
      .all(),
  ]);
  let relatedItems = related.results.map(toCard);
  if (relatedItems.length < 4) {
    const more = await c.env.DB.prepare(`SELECT ${PRODUCT_CARD_COLUMNS} FROM products p WHERE p.id != ? AND p.status='active' AND p.deleted_at IS NULL ORDER BY p.sold_count DESC LIMIT 8`).bind(p.id).all<CardRow>();
    const seen = new Set(relatedItems.map((r) => r.id));
    relatedItems = [...relatedItems, ...more.results.map(toCard).filter((r) => !seen.has(r.id))].slice(0, 8);
  }
  c.header("Cache-Control", "public, max-age=20");
  return c.json({
    product: { ...p, images: parseJson<string[]>(p.images, []), discount_percent: discountPercent(p.price, p.sale_price) },
    variants: variants.results,
    reviews: reviews.results,
    related: relatedItems,
    breadcrumbs: crumbs.results,
  });
});

app.get("/banners", async (c) => {
  const now = new Date().toISOString();
  const { results } = await c.env.DB.prepare(
    `SELECT id, placement, title_en, title_bn, subtitle_en, subtitle_bn, cta_en, cta_bn, link_url, image_url FROM banners
      WHERE deleted_at IS NULL AND is_active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)
      ORDER BY placement, sort_order, id`,
  )
    .bind(now, now)
    .all();
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ banners: results });
});

app.get("/testimonials", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.rating, r.body, p.name_en AS product_en, p.name_bn AS product_bn, p.slug
       FROM reviews r JOIN products p ON p.id = r.product_id
      WHERE r.status = 'approved' AND r.deleted_at IS NULL AND r.rating >= 4 ORDER BY r.created_at DESC LIMIT 6`,
  ).all();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ testimonials: results });
});

// ---------- Delivery fee & cart quote ----------
app.get("/delivery-fee", async (c) => {
  const q = validate(
    z.object({ district_id: z.coerce.number().int().positive(), upazila_id: z.coerce.number().int().positive(), subtotal: z.coerce.number().int().min(0).default(0) }),
    c.req.query(),
  );
  const zone = resolveZone(await loadZones(c.env), q.district_id, q.upazila_id);
  if (!zone) throw E.badRequest("We don't deliver to this area yet.", "এই এলাকায় এখনো ডেলিভারি দেওয়া হয় না।");
  return c.json({ zone: { code: zone.code, name_en: zone.name_en, name_bn: zone.name_bn, eta_en: zone.eta_en, eta_bn: zone.eta_bn, free_shipping_min: zone.free_shipping_min }, fee: deliveryFee(zone, q.subtotal) });
});

const quoteSchema = z.object({
  items: checkoutSchema.shape.items,
  address: z.object({ district_id: z.coerce.number().int().positive(), upazila_id: z.coerce.number().int().positive() }).optional(),
  couponCode: z.string().max(40).optional(),
});
app.post("/cart/quote", async (c) => {
  await rateLimit(c, "quote", 120, 300);
  const b = await body(c, quoteSchema);
  // Without an address yet, quote against the default zone so the cart still shows a total.
  const addr = b.address ?? { district_id: 0, upazila_id: 0 };
  return c.json(await quote(c.env, b.items, addr, b.couponCode));
});

// ---------- Checkout ----------
app.post("/orders", optionalCustomer, async (c) => {
  await rateLimit(c, "checkout", 15, 600);
  const input = await body(c, checkoutSchema);
  await verifyTurnstile(c, input.turnstileToken);

  const payments = await getSetting<PaymentSettings>(c.env, "payments", DEFAULT_PAYMENTS);
  const pm = input.paymentMethod;
  const enabled =
    (pm === "COD" && payments.cod.enabled) ||
    (pm === "bKash" && payments.bkash.enabled) ||
    (pm === "Nagad" && payments.nagad.enabled) ||
    (pm === "Rocket" && payments.rocket.enabled) ||
    (pm === "Card" && payments.card.enabled && sslczConfigured(c.env));
  if (!enabled) throw E.badRequest("This payment method is not available right now.", "এই পেমেন্ট পদ্ধতি এখন চালু নেই।");
  const bkashApi = pm === "bKash" && payments.bkash.mode === "api" && bkashConfigured(c.env);
  if (["bKash", "Nagad", "Rocket"].includes(pm) && !bkashApi && !input.paymentRef?.trim()) {
    throw E.badRequest("Please enter the Transaction ID (TrxID) from your payment SMS.", "পেমেন্ট SMS থেকে ট্রানজেকশন আইডি (TrxID) লিখুন।");
  }

  const { order, quote: q } = await createOrder(c.env, input, c.get("customer")?.id ?? null);
  c.executionCtx.waitUntil(notifyOrder(c.env, order, "placed"));

  let redirectUrl: string | null = null;
  const base = c.env.PUBLIC_URL || new URL(c.req.url).origin;
  const payOrder = { ...order, item_count: q.lines.reduce((s, l) => s + l.quantity, 0) };
  try {
    if (bkashApi) {
      const r = await bkashCreate(c.env, payOrder, base);
      await c.env.KV.put(`bkash:pay:${r.gatewayRef}`, order.order_no, { expirationTtl: 3600 });
      redirectUrl = r.redirectUrl;
    } else if (pm === "Card") {
      redirectUrl = (await sslczInitiate(c.env, payOrder, base)).redirectUrl;
    }
  } catch (e) {
    console.error("payment init failed", e);
    // The order stays "pending" + payment "pending"; staff can call the customer or they can retry.
    await c.env.DB.prepare("UPDATE orders SET admin_notes = COALESCE(admin_notes || '\n', '') || ? WHERE id = ?").bind(`Payment start failed: ${String(e).slice(0, 200)}`, order.id).run();
  }
  return c.json({ orderNo: order.order_no, token: order.public_token, total: order.total, redirectUrl }, 201);
});

// ---------- Order tracking ----------
app.get("/orders/track", async (c) => {
  await rateLimit(c, "track", 30, 300);
  const q = validate(z.object({ order: z.string().max(40), token: z.string().max(64).optional(), phone: z.string().max(20).optional() }), c.req.query());
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE (order_no = ? OR invoice_no = ?) AND deleted_at IS NULL")
    .bind(q.order.trim().toUpperCase(), q.order.trim().toUpperCase())
    .first<OrderRow>();
  const phoneOk = q.phone && o && o.customer_phone === q.phone.replace(/[^\d]/g, "").replace(/^880/, "0");
  const tokenOk = q.token && o && o.public_token === q.token;
  if (!o || (!phoneOk && !tokenOk)) throw E.notFound("Order");
  const [items, history] = await Promise.all([
    c.env.DB.prepare("SELECT name_en, name_bn, sku, size, color, image, quantity, unit_price, line_total FROM order_items WHERE order_id = ?").bind(o.id).all(),
    c.env.DB.prepare("SELECT status, created_at FROM order_status_history WHERE order_id = ? ORDER BY id").bind(o.id).all(),
  ]);
  return c.json({
    order: {
      order_no: o.order_no, invoice_no: o.invoice_no, status: o.status, payment_method: o.payment_method, payment_status: o.payment_status,
      subtotal: o.subtotal, discount: o.discount, delivery_fee: o.delivery_fee, total: o.total, coupon_code: o.coupon_code,
      customer_name: o.customer_name, customer_phone: o.customer_phone.replace(/^(\d{3})\d{5}/, "$1*****"),
      address: `${o.area}, ${o.upazila}, ${o.district}`, courier_partner: o.courier_partner, tracking_id: o.tracking_id,
      tracking_url: trackingUrl(o.courier_partner, o.tracking_id), created_at: o.created_at,
    },
    items: items.results,
    history: history.results,
  });
});

// ---------- Reviews & newsletter ----------
app.post("/reviews", optionalCustomer, async (c) => {
  await rateLimit(c, "review", 5, 3600);
  const r = await body(c, reviewSchema);
  const exists = await c.env.DB.prepare("SELECT id FROM products WHERE id = ? AND deleted_at IS NULL").bind(r.productId).first();
  if (!exists) throw E.notFound("Product");
  await c.env.DB.prepare("INSERT INTO reviews (product_id, customer_id, name, rating, body, status) VALUES (?, ?, ?, ?, ?, 'pending')")
    .bind(r.productId, c.get("customer")?.id ?? null, r.name, r.rating, r.body)
    .run();
  return c.json({ ok: true, en: "Thank you! Your review will appear after a quick check.", bn: "ধন্যবাদ! যাচাইয়ের পর আপনার রিভিউ দেখানো হবে।" }, 201);
});

app.post("/subscribe", async (c) => {
  await rateLimit(c, "subscribe", 5, 3600);
  const { contact } = await body(c, z.object({ contact: z.string().trim().min(5).max(120) }));
  await c.env.DB.prepare("INSERT OR IGNORE INTO subscribers (contact) VALUES (?)").bind(contact).run();
  return c.json({ ok: true });
});

export default app;
