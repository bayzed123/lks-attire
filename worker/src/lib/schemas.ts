import { z } from "zod";
import { normalizeBdPhone } from "./http";
import { salePriceFor } from "./pricing";

export const bdPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizeBdPhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX) / সঠিক মোবাইল নম্বর দিন" });
      return z.NEVER;
    }
    return p;
  });

const text = (max: number) => z.string().trim().max(max);
const reqText = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const money = z.coerce.number().int().min(0).max(10_000_000);
/** SKU: letters, digits and dashes, stored upper-case. Blank = generated automatically. */
const skuText = z
  .string()
  .trim()
  .toUpperCase()
  .max(60)
  .regex(/^[A-Z0-9._/-]*$/, "Use letters, numbers and dashes only / শুধু অক্ষর, সংখ্যা ও ড্যাশ ব্যবহার করুন")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
const flag = z.union([z.boolean(), z.number()]).transform((v) => (v ? 1 : 0));
const isoDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: "Enter a valid date / সঠিক তারিখ দিন" });
const idList = z.array(z.coerce.number().int().positive()).default([]);
const slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Use lowercase letters, numbers and dashes only / শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও ড্যাশ" });

export const address = z.object({
  division_id: z.coerce.number().int().positive(),
  district_id: z.coerce.number().int().positive(),
  upazila_id: z.coerce.number().int().positive(),
  division: reqText(60),
  district: reqText(60),
  upazila: reqText(80),
  area: reqText(300),
});

// ---------- Public ----------
export const checkoutSchema = z.object({
  customer: z.object({
    name: reqText(80),
    phone: bdPhone,
    email: z.union([z.literal(""), z.email()]).optional().transform((v) => v || null),
  }),
  address,
  items: z
    .array(z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) }))
    .min(1)
    .max(50),
  couponCode: text(40).optional(),
  paymentMethod: z.enum(["COD", "bKash", "Nagad", "Rocket", "Card"]),
  paymentRef: text(60).optional(), // TrxID for manual MFS payments
  note: text(500).optional(),
  lang: z.enum(["bn", "en"]).default("bn"),
  turnstileToken: z.string().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const reviewSchema = z.object({
  productId: z.coerce.number().int().positive(),
  name: reqText(60),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(5).max(1000),
});

export const registerSchema = z.object({
  name: reqText(80),
  phone: bdPhone,
  email: z.union([z.literal(""), z.email()]).optional().transform((v) => v || null),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().optional(),
});

export const loginSchema = z.object({
  phone: bdPhone,
  password: z.string().min(1).max(128),
  turnstileToken: z.string().optional(),
});

/** Staff sign-in ID: an email address or a simple username (letters, digits, . _ - @). */
export const adminLoginId = z.string().trim().toLowerCase().min(3).max(120).regex(/^[a-z0-9._@+-]+$/, "Use letters, numbers, dot, dash or underscore");

export const adminLoginSchema = z.object({
  email: adminLoginId,
  password: z.string().min(1).max(128),
  turnstileToken: z.string().optional(),
});

export const savedAddressSchema = address.extend({
  label: text(30).default("Home"),
  recipient_name: reqText(80),
  phone: bdPhone,
  is_default: flag.default(0),
});

// ---------- Admin ----------
export const variantSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  sku: skuText,
  size: reqText(30),
  color: reqText(40),
  color_hex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  stock: z.coerce.number().int().min(0).max(100000),
  price_override: money.optional().nullable(),
  low_stock_threshold: z.coerce.number().int().min(0).max(1000).default(3),
});

export const productSchema = z
  .object({
    slug,
    sku: skuText,
    name_en: reqText(160),
    name_bn: reqText(160),
    description_en: optText(5000),
    description_bn: optText(5000),
    fabric_en: optText(300),
    fabric_bn: optText(300),
    care_en: optText(500),
    care_bn: optText(500),
    category_id: z.coerce.number().int().positive(),
    price: money.refine((v) => v > 0, { message: "Price must be more than 0 / দাম ০ এর বেশি হতে হবে" }),
    sale_price: money.optional().nullable(),
    discount_type: z.enum(["none", "percent", "flat"]).default("none"),
    discount_value: money.default(0),
    delivery_mode: z.enum(["zone", "free", "fixed"]).default("zone"),
    delivery_charge: money.optional().nullable(),
    tags: text(300).default(""),
    images: z.array(z.string().trim().max(500)).max(12).default([]),
    status: z.enum(["draft", "active", "archived"]).default("draft"),
    is_featured: flag.default(0),
    meta_title: optText(160),
    meta_description: optText(320),
    variants: z.array(variantSchema).min(1).max(200),
  })
  .superRefine((p, ctx) => {
    if (p.discount_type === "percent" && (p.discount_value < 1 || p.discount_value > 95)) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Discount must be 1–95% / ছাড় ১–৯৫% হতে হবে" });
    }
    if (p.discount_type === "flat" && (p.discount_value < 1 || p.discount_value >= p.price)) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Discount must be less than the price / ছাড় দামের চেয়ে কম হতে হবে" });
    }
    if (p.delivery_mode === "fixed" && p.delivery_charge == null) {
      ctx.addIssue({ code: "custom", path: ["delivery_charge"], message: "Enter the delivery charge / ডেলিভারি চার্জ লিখুন" });
    }
    if (p.discount_type === "none" && p.sale_price != null && p.sale_price >= p.price) {
      ctx.addIssue({ code: "custom", path: ["sale_price"], message: "Sale price must be lower than the regular price / ছাড়ের দাম আসল দামের চেয়ে কম হতে হবে" });
    }
    const seen = new Set<string>();
    p.variants.forEach((v, i) => {
      const k = `${v.size}|${v.color}`.toLowerCase();
      if (seen.has(k)) ctx.addIssue({ code: "custom", path: ["variants", i, "size"], message: "Duplicate size + colour / একই সাইজ ও রং দুবার দেওয়া হয়েছে" });
      seen.add(k);
    });
  })
  .transform((p) => ({
    ...p,
    // The stored sale price is what the shop, cart and reports use; discounts are turned into it here.
    sale_price: salePriceFor(p.price, p.discount_type, p.discount_value, p.sale_price || null),
    discount_value: p.discount_type === "none" ? 0 : p.discount_value,
    delivery_charge: p.delivery_mode === "fixed" ? p.delivery_charge ?? 0 : null,
  }));
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  slug,
  parent_id: z.coerce.number().int().positive().optional().nullable(),
  name_en: reqText(80),
  name_bn: reqText(80),
  description_en: optText(1000),
  description_bn: optText(1000),
  image_url: optText(500),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: flag.default(1),
});

export const customerSchema = z.object({
  name: reqText(80),
  phone: bdPhone,
  email: z.union([z.literal(""), z.email()]).optional().nullable().transform((v) => v || null),
  is_blocked: flag.default(0),
  notes: optText(2000),
});

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, { message: "Letters, numbers, - and _ only / শুধু অক্ষর, সংখ্যা, - ও _" })
      .transform((v) => v.toUpperCase()),
    description: optText(200),
    type: z.enum(["percent", "flat"]),
    value: z.coerce.number().int().min(1).max(1_000_000),
    min_order: money.default(0),
    max_discount: money.optional().nullable(),
    starts_at: isoDate,
    expires_at: isoDate,
    usage_limit: z.coerce.number().int().min(1).optional().nullable(),
    per_customer_limit: z.coerce.number().int().min(1).optional().nullable(),
    category_ids: idList,
    is_active: flag.default(1),
  })
  .superRefine((c, ctx) => {
    if (c.type === "percent" && c.value > 90) ctx.addIssue({ code: "custom", path: ["value"], message: "Percentage cannot exceed 90% / শতাংশ ৯০% এর বেশি হতে পারবে না" });
    if (c.starts_at && c.expires_at && Date.parse(c.expires_at) <= Date.parse(c.starts_at))
      ctx.addIssue({ code: "custom", path: ["expires_at"], message: "Expiry must be after the start date / মেয়াদ শেষের তারিখ শুরুর পরে হতে হবে" });
  });

export const bannerSchema = z.object({
  placement: z.enum(["hero", "promo", "festive"]),
  title_en: reqText(120),
  title_bn: reqText(120),
  subtitle_en: optText(240),
  subtitle_bn: optText(240),
  cta_en: optText(40),
  cta_bn: optText(40),
  link_url: optText(500),
  image_url: optText(500),
  starts_at: isoDate,
  ends_at: isoDate,
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: flag.default(1),
});

export const reviewModerationSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "flagged"]).optional(),
  reply: optText(1000),
  name: reqText(60).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  body: z.string().trim().min(1).max(1000).optional(),
  product_id: z.coerce.number().int().positive().optional(),
});

export const zoneSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/, { message: "lowercase_with_underscores" }),
  name_en: reqText(80),
  name_bn: reqText(80),
  fee: money,
  free_shipping_min: money.optional().nullable(),
  district_ids: idList,
  upazila_ids: idList,
  eta_en: optText(60),
  eta_bn: optText(60),
  is_default: flag.default(0),
  is_active: flag.default(1),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const staffSchema = z.object({
  name: reqText(80),
  email: adminLoginId,
  phone: optText(20),
  role: z.enum(["super_admin", "manager", "order_processor", "viewer"]),
  is_active: flag.default(1),
  password: z.string().min(10).max(128).optional(),
});

export const statusChangeSchema = z.object({
  status: z.enum(["pending", "confirmed", "packed", "shipped", "delivered", "returned", "cancelled"]),
  note: text(500).optional(),
  courier: z.enum(["Steadfast", "Pathao", "RedX"]).optional(),
  trackingId: text(80).optional(),
  createConsignment: z.boolean().optional(),
  notify: z.boolean().default(true),
});

export const orderEditSchema = z.object({
  customer_name: reqText(80).optional(),
  customer_phone: bdPhone.optional(),
  customer_email: z.union([z.literal(""), z.email()]).optional().nullable().transform((v) => v || null),
  area: reqText(300).optional(),
  admin_notes: optText(2000),
  payment_status: z.enum(["pending", "paid", "failed", "refunded", "partially_refunded"]).optional(),
  payment_ref: optText(60),
  courier_partner: z.enum(["Steadfast", "Pathao", "RedX"]).optional().nullable(),
  tracking_id: optText(80),
});

export const refundSchema = z.object({
  amount: z.coerce.number().int().min(1),
  note: reqText(500),
});

export const stockAdjustSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  mode: z.enum(["set", "add", "remove"]),
  quantity: z.coerce.number().int().min(0).max(100000),
  reason: z.enum(["restock", "adjustment", "return"]).default("adjustment"),
  note: text(300).optional(),
});
