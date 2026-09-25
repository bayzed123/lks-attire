/** Pure pricing logic — no I/O, fully unit-tested (tests/unit/pricing.test.ts). */

export interface Zone {
  code: string;
  name_en: string;
  name_bn: string;
  fee: number;
  free_shipping_min: number | null;
  district_ids: number[];
  upazila_ids: number[];
  eta_en?: string | null;
  eta_bn?: string | null;
  is_default: number;
  is_active?: number;
}

/**
 * Most specific rule wins: an upazila match beats a district match, which beats the default zone.
 * Example: Tangail Sadar (upazila 342) → "tangail_town"; Mirzapur (district 44) → "tangail_outer".
 */
export function resolveZone(zones: Zone[], districtId: number, upazilaId: number): Zone | null {
  const active = zones.filter((z) => z.is_active !== 0);
  return (
    active.find((z) => z.upazila_ids.includes(upazilaId)) ??
    active.find((z) => z.district_ids.includes(districtId)) ??
    active.find((z) => z.is_default) ??
    null
  );
}

export function deliveryFee(zone: Zone, merchandiseTotal: number): number {
  if (zone.free_shipping_min != null && merchandiseTotal >= zone.free_shipping_min) return 0;
  return zone.fee;
}

export type DeliveryMode = "zone" | "free" | "fixed";

/**
 * Delivery fee for a whole cart. Each product can use the area fee ("zone"), be delivered free, or have
 * its own fixed charge. The cart pays the highest fee among its items, so it is free only when every
 * item is free. Example: a free-delivery saree + an area-fee kurti to Dhaka → ৳100 (the Dhaka fee).
 */
export function cartDeliveryFee(zone: Zone, merchandiseTotal: number, items: { mode: DeliveryMode; charge: number | null }[]): number {
  const areaFee = deliveryFee(zone, merchandiseTotal);
  if (!items.length) return areaFee;
  return Math.max(...items.map((i) => (i.mode === "free" ? 0 : i.mode === "fixed" ? (i.charge ?? 0) : areaFee)));
}

export type DiscountType = "none" | "percent" | "flat";

/**
 * Sale price from a product-level discount. "percent" and "flat" are calculated from the regular price;
 * "none" keeps the sale price the admin typed (or no sale). Returns null when there is no real discount.
 */
export function salePriceFor(price: number, type: DiscountType, value: number, manualSale: number | null): number | null {
  let sale: number | null = manualSale;
  if (type === "percent") sale = Math.round((price * (100 - value)) / 100);
  else if (type === "flat") sale = price - value;
  return sale != null && sale > 0 && sale < price ? sale : null;
}

export function effectiveUnitPrice(product: { price: number; sale_price: number | null }, variant: { price_override: number | null }): number {
  if (variant.price_override != null && variant.price_override > 0) return variant.price_override;
  if (product.sale_price != null && product.sale_price > 0 && product.sale_price < product.price) return product.sale_price;
  return product.price;
}

export function discountPercent(price: number, sale: number | null): number {
  if (sale == null || sale <= 0 || sale >= price) return 0;
  return Math.round(((price - sale) / price) * 100);
}

export interface CouponRule {
  code: string;
  type: "percent" | "flat";
  value: number;
  min_order: number;
  max_discount: number | null;
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: number;
  /** Already expanded to include sub-categories. Empty = whole store. */
  category_ids: number[];
}

export interface PricedLine {
  category_id: number | null;
  line_total: number;
}

export type CouponResult =
  | { ok: true; discount: number; eligibleSubtotal: number }
  | { ok: false; reason: "inactive" | "not_started" | "expired" | "used_up" | "min_order" | "no_eligible_items" };

export function evaluateCoupon(c: CouponRule, lines: PricedLine[], now = new Date()): CouponResult {
  if (!c.is_active) return { ok: false, reason: "inactive" };
  if (c.starts_at && Date.parse(c.starts_at) > now.getTime()) return { ok: false, reason: "not_started" };
  if (c.expires_at && Date.parse(c.expires_at) < now.getTime()) return { ok: false, reason: "expired" };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { ok: false, reason: "used_up" };
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  if (subtotal < c.min_order) return { ok: false, reason: "min_order" };
  const eligible = c.category_ids.length
    ? lines.filter((l) => l.category_id != null && c.category_ids.includes(l.category_id)).reduce((s, l) => s + l.line_total, 0)
    : subtotal;
  if (eligible <= 0) return { ok: false, reason: "no_eligible_items" };
  let discount = c.type === "percent" ? Math.floor((eligible * c.value) / 100) : c.value;
  if (c.max_discount != null) discount = Math.min(discount, c.max_discount);
  discount = Math.min(discount, eligible);
  return { ok: true, discount, eligibleSubtotal: eligible };
}

export const COUPON_MESSAGES: Record<Exclude<CouponResult, { ok: true }>["reason"] | "not_found", { en: string; bn: string }> = {
  not_found: { en: "This coupon code doesn't exist.", bn: "এই কুপন কোডটি নেই।" },
  inactive: { en: "This coupon is not active.", bn: "এই কুপনটি এখন চালু নেই।" },
  not_started: { en: "This coupon is not valid yet.", bn: "এই কুপনটি এখনো শুরু হয়নি।" },
  expired: { en: "This coupon has expired.", bn: "এই কুপনের মেয়াদ শেষ।" },
  used_up: { en: "This coupon has reached its usage limit.", bn: "এই কুপনের ব্যবহারের সীমা শেষ।" },
  min_order: { en: "Your order total is below this coupon's minimum.", bn: "এই কুপনের জন্য অর্ডারের পরিমাণ যথেষ্ট নয়।" },
  no_eligible_items: { en: "This coupon doesn't apply to the items in your cart.", bn: "কার্টের পণ্যগুলোতে এই কুপন প্রযোজ্য নয়।" },
};
