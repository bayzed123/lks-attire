/** Order creation and the delivery-status pipeline. */
import type { Env } from "../env";
import type { CheckoutInput } from "./schemas";
import { ApiError, E, parseJson } from "./http";
import { cartDeliveryFee, effectiveUnitPrice, evaluateCoupon, resolveZone, COUPON_MESSAGES, type CouponRule } from "./pricing";
import { expandCategoryIds, loadZones } from "./store";
import { randomCode, randomToken } from "./crypto";
import { BRAND } from "../brand.generated";
import type { OrderStatus } from "./couriers";

export type { OrderStatus };

/**
 * Allowed transitions. Pending → Confirmed → Packed → Shipped → Delivered, with Cancelled possible
 * before shipping and Returned possible after shipping.
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Stock goes back on the shelf when an order is cancelled or returned. */
export function restoresStock(to: OrderStatus): boolean {
  return to === "cancelled" || to === "returned";
}

export interface OrderRow {
  id: number;
  order_no: string;
  invoice_no: string | null;
  public_token: string;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  division_id: number;
  district_id: number;
  upazila_id: number;
  division: string;
  district: string;
  upazila: string;
  area: string;
  zone_code: string;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  coupon_code: string | null;
  payment_method: "COD" | "bKash" | "Nagad" | "Rocket" | "Card";
  payment_status: string;
  payment_ref: string | null;
  status: OrderStatus;
  courier_partner: "Steadfast" | "Pathao" | "RedX" | null;
  tracking_id: string | null;
  consignment_id: string | null;
  customer_note: string | null;
  lang: "bn" | "en";
  admin_notes: string | null;
  refund_amount: number;
  refund_note: string | null;
  created_at: string;
  updated_at: string;
}

/** INV-<yymm>-<5-digit order id>, e.g. INV-2609-00042. Also used by migration 0002 for old orders. */
export const INVOICE_NO_SQL = "'INV-' || substr(created_at, 3, 2) || substr(created_at, 6, 2) || '-' || printf('%05d', id)";

export function newOrderNo(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${BRAND.orderPrefix}-${ymd}-${randomCode(4)}`;
}

interface VariantJoin {
  variant_id: number;
  product_id: number;
  sku: string | null;
  size: string;
  color: string;
  stock: number;
  price_override: number | null;
  price: number;
  sale_price: number | null;
  name_en: string;
  name_bn: string;
  images: string;
  category_id: number | null;
  status: string;
  delivery_mode: "zone" | "free" | "fixed";
  delivery_charge: number | null;
}

export interface Quote {
  lines: {
    variantId: number;
    productId: number;
    categoryId: number | null;
    sku: string | null;
    deliveryMode: "zone" | "free" | "fixed";
    name_en: string;
    name_bn: string;
    size: string;
    color: string;
    image: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  couponId: number | null;
  zone: { code: string; name_en: string; name_bn: string; eta_en?: string | null; eta_bn?: string | null };
  deliveryFee: number;
  total: number;
}

/** Prices a cart on the server. The browser's prices are never trusted. */
export async function quote(
  env: Env,
  items: { variantId: number; quantity: number }[],
  address: { district_id: number; upazila_id: number },
  couponCode?: string,
): Promise<Quote> {
  const merged = new Map<number, number>();
  for (const it of items) merged.set(it.variantId, (merged.get(it.variantId) ?? 0) + it.quantity);
  const ids = [...merged.keys()];
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT v.id AS variant_id, v.product_id, v.sku, v.size, v.color, v.stock, v.price_override,
            p.price, p.sale_price, p.name_en, p.name_bn, p.images, p.category_id, p.status, p.delivery_mode, p.delivery_charge
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id IN (${placeholders}) AND p.deleted_at IS NULL`,
  )
    .bind(...ids)
    .all<VariantJoin>();
  const byId = new Map(results.map((r) => [r.variant_id, r]));

  const lines: Quote["lines"] = [];
  for (const [variantId, quantity] of merged) {
    const v = byId.get(variantId);
    if (!v || v.status !== "active") {
      throw new ApiError(409, "unavailable", "An item in your cart is no longer available. Please remove it and try again.", "আপনার কার্টের একটি পণ্য আর পাওয়া যাচ্ছে না। সেটি সরিয়ে আবার চেষ্টা করুন।");
    }
    if (v.stock < quantity) {
      throw new ApiError(
        409,
        "out_of_stock",
        `Only ${v.stock} left of "${v.name_en}" (${v.size}, ${v.color}). Please reduce the quantity.`,
        `"${v.name_bn}" (${v.size}, ${v.color}) মাত্র ${v.stock}টি আছে। পরিমাণ কমিয়ে দিন।`,
      );
    }
    const unitPrice = effectiveUnitPrice(v, v);
    lines.push({
      variantId,
      productId: v.product_id,
      categoryId: v.category_id,
      sku: v.sku,
      deliveryMode: v.delivery_mode,
      name_en: v.name_en,
      name_bn: v.name_bn,
      size: v.size,
      color: v.color,
      image: parseJson<string[]>(v.images, [])[0] ?? null,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let discount = 0;
  let couponId: number | null = null;
  let appliedCode: string | null = null;
  if (couponCode?.trim()) {
    const row = await env.DB.prepare("SELECT * FROM coupons WHERE code = ? COLLATE NOCASE AND deleted_at IS NULL")
      .bind(couponCode.trim())
      .first<Omit<CouponRule, "category_ids"> & { id: number; category_ids: string }>();
    if (!row) throw new ApiError(422, "coupon", COUPON_MESSAGES.not_found.en, COUPON_MESSAGES.not_found.bn);
    const rule: CouponRule = { ...row, category_ids: await expandCategoryIds(env, parseJson<number[]>(row.category_ids, [])) };
    const res = evaluateCoupon(rule, lines.map((l) => ({ category_id: l.categoryId, line_total: l.lineTotal })));
    if (!res.ok) throw new ApiError(422, "coupon", COUPON_MESSAGES[res.reason].en, COUPON_MESSAGES[res.reason].bn);
    discount = res.discount;
    couponId = row.id;
    appliedCode = row.code;
  }

  const zones = await loadZones(env);
  const zone = resolveZone(zones, address.district_id, address.upazila_id);
  if (!zone) throw E.badRequest("We don't deliver to this area yet.", "এই এলাকায় এখনো ডেলিভারি দেওয়া হয় না।");
  const fee = cartDeliveryFee(
    zone,
    subtotal - discount,
    lines.map((l) => ({ mode: l.deliveryMode, charge: byId.get(l.variantId)!.delivery_charge })),
  );

  return {
    lines,
    subtotal,
    discount,
    couponCode: appliedCode,
    couponId,
    zone: { code: zone.code, name_en: zone.name_en, name_bn: zone.name_bn, eta_en: zone.eta_en, eta_bn: zone.eta_bn },
    deliveryFee: fee,
    total: subtotal - discount + fee,
  };
}

/**
 * Creates the order, its items, status history, stock decrements and inventory log in one D1 batch
 * (D1 batches run as a single transaction). Stock decrements are guarded with `stock >= qty`; if any
 * guard fails (a race with another checkout) the whole order is rolled back via a failing CHECK.
 */
export async function createOrder(env: Env, input: CheckoutInput, customerId: number | null): Promise<{ order: OrderRow; quote: Quote }> {
  const q = await quote(env, input.items, input.address, input.couponCode);

  // Blocked customers cannot place orders (matched on phone).
  const blocked = await env.DB.prepare("SELECT id FROM customers WHERE phone = ? AND is_blocked = 1").bind(input.customer.phone).first();
  if (blocked) throw new ApiError(403, "blocked", "We couldn't place this order. Please call us for help.", "অর্ডারটি সম্পন্ন করা যায়নি। সাহায্যের জন্য আমাদের কল করুন।");

  // Per-customer coupon limit (matched on the mobile number, cancelled orders don't count).
  if (q.couponId) {
    const c = await env.DB.prepare("SELECT per_customer_limit FROM coupons WHERE id = ?").bind(q.couponId).first<{ per_customer_limit: number | null }>();
    if (c?.per_customer_limit) {
      const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE coupon_code = ? COLLATE NOCASE AND customer_phone = ? AND status != 'cancelled' AND deleted_at IS NULL")
        .bind(q.couponCode, input.customer.phone)
        .first<{ n: number }>();
      if ((used?.n ?? 0) >= c.per_customer_limit) {
        throw new ApiError(422, "coupon", "You have already used this coupon the maximum number of times.", "আপনি এই কুপনটি সর্বোচ্চ সংখ্যকবার ব্যবহার করেছেন।");
      }
    }
  }

  const orderNo = newOrderNo();
  const token = randomToken(18);
  const isManualMfs = ["bKash", "Nagad", "Rocket"].includes(input.paymentMethod) && Boolean(input.paymentRef);

  const stmts: D1PreparedStatement[] = [];
  // Upsert a lightweight customer record so staff can see guest order history by phone.
  stmts.push(
    env.DB.prepare(
      "INSERT INTO customers (name, phone, email) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET email = COALESCE(customers.email, excluded.email), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    ).bind(input.customer.name, input.customer.phone, input.customer.email),
  );
  stmts.push(
    env.DB.prepare(
      `INSERT INTO orders (order_no, public_token, customer_id, customer_name, customer_phone, customer_email,
         division_id, district_id, upazila_id, division, district, upazila, area, zone_code,
         subtotal, discount, delivery_fee, total, coupon_code, payment_method, payment_status, payment_ref, customer_note, lang)
       VALUES (?, ?, COALESCE(?, (SELECT id FROM customers WHERE phone = ?)), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).bind(
      orderNo, token, customerId, input.customer.phone, input.customer.name, input.customer.phone, input.customer.email,
      input.address.division_id, input.address.district_id, input.address.upazila_id,
      input.address.division, input.address.district, input.address.upazila, input.address.area, q.zone.code,
      q.subtotal, q.discount, q.deliveryFee, q.total, q.couponCode, input.paymentMethod,
      isManualMfs ? input.paymentRef!.trim() : null, input.note ?? null, input.lang,
    ),
  );
  // Invoice number from the order's row id: unique, sequential and easy to read out on the phone.
  stmts.push(env.DB.prepare(`UPDATE orders SET invoice_no = ${INVOICE_NO_SQL} WHERE order_no = ?`).bind(orderNo));
  for (const l of q.lines) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO order_items (order_id, product_id, variant_id, category_id, sku, name_en, name_bn, size, color, image, quantity, unit_price, line_total)
         VALUES ((SELECT id FROM orders WHERE order_no = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(orderNo, l.productId, l.variantId, l.categoryId, l.sku, l.name_en, l.name_bn, l.size, l.color, l.image, l.quantity, l.unitPrice, l.lineTotal),
    );
    // CHECK (stock >= 0) on product_variants aborts the whole batch if stock ran out concurrently.
    stmts.push(env.DB.prepare("UPDATE product_variants SET stock = stock - ? WHERE id = ?").bind(l.quantity, l.variantId));
    stmts.push(env.DB.prepare("UPDATE products SET sold_count = sold_count + ? WHERE id = ?").bind(l.quantity, l.productId));
    stmts.push(
      env.DB.prepare(
        "INSERT INTO inventory_log (product_id, variant_id, change, stock_after, reason, note, actor) VALUES (?, ?, ?, (SELECT stock FROM product_variants WHERE id = ?), 'order', ?, 'customer')",
      ).bind(l.productId, l.variantId, -l.quantity, l.variantId, orderNo),
    );
  }
  if (q.couponId) stmts.push(env.DB.prepare("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?").bind(q.couponId));
  stmts.push(
    env.DB.prepare("INSERT INTO order_status_history (order_id, status, note, actor) VALUES ((SELECT id FROM orders WHERE order_no = ?), 'pending', ?, 'customer')").bind(
      orderNo,
      isManualMfs ? `${input.paymentMethod} TrxID: ${input.paymentRef}` : `Placed with ${input.paymentMethod}`,
    ),
  );

  try {
    await env.DB.batch(stmts);
  } catch (e) {
    if (String(e).includes("CHECK")) {
      throw new ApiError(409, "out_of_stock", "Sorry — an item just sold out. Please review your cart.", "দুঃখিত — একটি পণ্য এইমাত্র শেষ হয়ে গেছে। কার্ট দেখে আবার চেষ্টা করুন।");
    }
    throw e;
  }
  const order = await env.DB.prepare("SELECT * FROM orders WHERE order_no = ?").bind(orderNo).first<OrderRow>();
  return { order: order!, quote: q };
}

/** Builds the D1 statements that put stock back for every line of an order. */
export async function restockStatements(env: Env, orderId: number, reason: "cancel" | "return", actor: string): Promise<D1PreparedStatement[]> {
  const { results } = await env.DB.prepare("SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ? AND variant_id IS NOT NULL")
    .bind(orderId)
    .all<{ product_id: number; variant_id: number; quantity: number }>();
  const out: D1PreparedStatement[] = [];
  for (const it of results) {
    out.push(env.DB.prepare("UPDATE product_variants SET stock = stock + ? WHERE id = ?").bind(it.quantity, it.variant_id));
    out.push(env.DB.prepare("UPDATE products SET sold_count = MAX(0, sold_count - ?) WHERE id = ?").bind(it.quantity, it.product_id));
    out.push(
      env.DB.prepare(
        "INSERT INTO inventory_log (product_id, variant_id, change, stock_after, reason, note, actor) VALUES (?, ?, ?, (SELECT stock FROM product_variants WHERE id = ?), ?, (SELECT order_no FROM orders WHERE id = ?), ?)",
      ).bind(it.product_id, it.variant_id, it.quantity, it.variant_id, reason, orderId, actor),
    );
  }
  return out;
}
