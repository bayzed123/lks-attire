import { describe, expect, it } from "vitest";
import { cartDeliveryFee, deliveryFee, discountPercent, salePriceFor, effectiveUnitPrice, evaluateCoupon, resolveZone, type CouponRule, type Zone } from "../../worker/src/lib/pricing";

const zones: Zone[] = [
  { code: "tangail_town", name_en: "Tangail town", name_bn: "", fee: 50, free_shipping_min: 3000, district_ids: [], upazila_ids: [342], is_default: 0 },
  { code: "tangail_outer", name_en: "Tangail", name_bn: "", fee: 80, free_shipping_min: 4000, district_ids: [44], upazila_ids: [], is_default: 0 },
  { code: "dhaka", name_en: "Dhaka", name_bn: "", fee: 100, free_shipping_min: null, district_ids: [47], upazila_ids: [], is_default: 0 },
  { code: "rest_bd", name_en: "Rest", name_bn: "", fee: 130, free_shipping_min: 6000, district_ids: [], upazila_ids: [], is_default: 1 },
];

describe("resolveZone", () => {
  it("prefers an upazila match over its district", () => expect(resolveZone(zones, 44, 342)?.code).toBe("tangail_town"));
  it("falls back to the district rule", () => expect(resolveZone(zones, 44, 339)?.code).toBe("tangail_outer"));
  it("uses the default zone for everywhere else", () => expect(resolveZone(zones, 1, 1)?.code).toBe("rest_bd"));
  it("ignores inactive zones", () => {
    const z = zones.map((x) => (x.code === "dhaka" ? { ...x, is_active: 0 } : x));
    expect(resolveZone(z, 47, 1)?.code).toBe("rest_bd");
  });
  it("returns null when nothing matches and there is no default", () => expect(resolveZone(zones.slice(0, 3), 1, 1)).toBeNull());
});

describe("deliveryFee", () => {
  it("charges the zone fee below the free threshold", () => expect(deliveryFee(zones[0]!, 2999)).toBe(50));
  it("is free at or above the threshold", () => expect(deliveryFee(zones[0]!, 3000)).toBe(0));
  it("never free when there is no threshold", () => expect(deliveryFee(zones[2]!, 999999)).toBe(100));
});

describe("effectiveUnitPrice", () => {
  it("uses the sale price when lower", () => expect(effectiveUnitPrice({ price: 2450, sale_price: 2150 }, { price_override: null })).toBe(2150));
  it("ignores a sale price that isn't lower", () => expect(effectiveUnitPrice({ price: 1000, sale_price: 1200 }, { price_override: null })).toBe(1000));
  it("variant override wins", () => expect(effectiveUnitPrice({ price: 1000, sale_price: 900 }, { price_override: 1100 })).toBe(1100));
  it("computes discount percent", () => expect(discountPercent(2450, 2150)).toBe(12));
});

const base: CouponRule = { code: "EID10", type: "percent", value: 10, min_order: 1000, max_discount: null, starts_at: null, expires_at: null, usage_limit: null, used_count: 0, is_active: 1, category_ids: [] };
const lines = [{ category_id: 2, line_total: 2000 }, { category_id: 9, line_total: 1000 }];

describe("evaluateCoupon", () => {
  it("applies a percentage to the whole cart", () => expect(evaluateCoupon(base, lines)).toEqual({ ok: true, discount: 300, eligibleSubtotal: 3000 }));
  it("caps at max_discount", () => expect(evaluateCoupon({ ...base, max_discount: 150 }, lines)).toMatchObject({ ok: true, discount: 150 }));
  it("flat discounts never exceed the eligible amount", () => expect(evaluateCoupon({ ...base, type: "flat", value: 5000, min_order: 0 }, lines)).toMatchObject({ ok: true, discount: 3000 }));
  it("respects category rules", () => expect(evaluateCoupon({ ...base, category_ids: [9] }, lines)).toMatchObject({ ok: true, discount: 100, eligibleSubtotal: 1000 }));
  it("rejects when no items qualify", () => expect(evaluateCoupon({ ...base, category_ids: [77] }, lines)).toEqual({ ok: false, reason: "no_eligible_items" }));
  it("rejects below minimum order", () => expect(evaluateCoupon({ ...base, min_order: 5000 }, lines)).toEqual({ ok: false, reason: "min_order" }));
  it("rejects expired coupons", () => expect(evaluateCoupon({ ...base, expires_at: "2020-01-01T00:00:00Z" }, lines)).toEqual({ ok: false, reason: "expired" }));
  it("rejects future coupons", () => expect(evaluateCoupon({ ...base, starts_at: "2999-01-01T00:00:00Z" }, lines)).toEqual({ ok: false, reason: "not_started" }));
  it("rejects used-up coupons", () => expect(evaluateCoupon({ ...base, usage_limit: 5, used_count: 5 }, lines)).toEqual({ ok: false, reason: "used_up" }));
  it("rejects inactive coupons", () => expect(evaluateCoupon({ ...base, is_active: 0 }, lines)).toEqual({ ok: false, reason: "inactive" }));
});

describe("cartDeliveryFee (per-product delivery)", () => {
  const dhaka = zones[2]!;
  it("uses the area fee for normal products", () => expect(cartDeliveryFee(dhaka, 1000, [{ mode: "zone", charge: null }])).toBe(100));
  it("is free when every item has free delivery", () => expect(cartDeliveryFee(dhaka, 1000, [{ mode: "free", charge: null }, { mode: "free", charge: null }])).toBe(0));
  it("charges the highest fee in a mixed cart", () => expect(cartDeliveryFee(dhaka, 1000, [{ mode: "free", charge: null }, { mode: "zone", charge: null }, { mode: "fixed", charge: 60 }])).toBe(100));
  it("uses a product's fixed charge", () => expect(cartDeliveryFee(dhaka, 1000, [{ mode: "fixed", charge: 150 }, { mode: "free", charge: null }])).toBe(150));
  it("still honours the zone's free-delivery minimum for area-fee items", () => expect(cartDeliveryFee(zones[0]!, 3000, [{ mode: "zone", charge: null }])).toBe(0));
});

describe("salePriceFor (product discounts)", () => {
  it("calculates a percentage discount", () => expect(salePriceFor(2000, "percent", 15, null)).toBe(1700));
  it("calculates a fixed taka discount", () => expect(salePriceFor(2000, "flat", 250, null)).toBe(1750));
  it("keeps a typed sale price when there is no discount rule", () => expect(salePriceFor(2000, "none", 0, 1800)).toBe(1800));
  it("drops a sale price that is not lower than the price", () => expect(salePriceFor(2000, "none", 0, 2000)).toBeNull());
  it("never returns zero or less", () => expect(salePriceFor(500, "flat", 500, null)).toBeNull());
});
