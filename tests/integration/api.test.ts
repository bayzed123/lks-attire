// End-to-end API tests against the real Worker, D1, KV and R2 (Miniflare).
import { describe, expect, it, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import productListFixture from "../fixtures/product-list.response.json";
import createOrderFixture from "../fixtures/create-order.request.json";
import adminLoginFixture from "../fixtures/admin-login.request.json";

const BASE = "https://shop.test";

async function call(path: string, init: RequestInit & { json?: unknown; cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-requested-with", "fetch");
  headers.set("origin", BASE);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await exports.default.fetch(new Request(BASE + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }));
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { res, data };
}

let adminCookie = "";
let processorCookie = "";

beforeAll(async () => {
  const b = await call("/api/admin/auth/bootstrap", { method: "POST", json: { token: "test-bootstrap-token-0123456789", name: "Owner", email: adminLoginFixture.email, password: adminLoginFixture.password } });
  expect([201, 409]).toContain(b.res.status);
  const login = await call("/api/admin/auth/login", { method: "POST", json: adminLoginFixture });
  expect(login.res.status).toBe(200);
  adminCookie = login.res.headers.get("set-cookie")!.split(";")[0]!;
  // Create an order processor for permission tests.
  await call("/api/admin/staff", { method: "POST", cookie: adminCookie, json: { name: "Rina", email: "rina@test.dev", role: "order_processor", is_active: 1, password: "Processor-123" } });
  const pl = await call("/api/admin/auth/login", { method: "POST", json: { email: "rina@test.dev", password: "Processor-123" } });
  processorCookie = pl.res.headers.get("set-cookie")!.split(";")[0]!;
});

describe("public catalogue", () => {
  it("lists active products with the fixture's shape", async () => {
    const { res, data } = await call("/api/products?limit=2&sort=popular");
    expect(res.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(Object.keys(productListFixture).sort());
    expect(Object.keys(data.items[0]).sort()).toEqual(Object.keys(productListFixture.items[0]!).sort());
    expect(data.items.length).toBe(2);
  });
  it("filters by category (including sub-categories), size and price", async () => {
    const saree = await call("/api/products?category=saree&limit=48");
    expect(saree.data.total).toBeGreaterThanOrEqual(4);
    const xl = await call("/api/products?size=XL&limit=48");
    expect(xl.data.items.every((p: any) => p.sizes.includes("XL"))).toBe(true);
    const cheap = await call("/api/products?max=1000&limit=48");
    expect(cheap.data.items.every((p: any) => (p.sale_price ?? p.price) <= 1000)).toBe(true);
  });
  it("returns product detail with variants, reviews and related items", async () => {
    const { data } = await call("/api/products/tangail-taant-saree-red-gold");
    expect(data.product.name_bn).toContain("টাঙ্গাইল");
    expect(data.variants.length).toBeGreaterThan(0);
    expect(data.related.length).toBeGreaterThan(0);
  });
  it("calculates delivery fee by zone", async () => {
    const town = await call("/api/delivery-fee?district_id=44&upazila_id=342&subtotal=500");
    expect(town.data).toMatchObject({ zone: { code: "tangail_town" }, fee: 50 });
    const rest = await call("/api/delivery-fee?district_id=1&upazila_id=1&subtotal=500");
    expect(rest.data.zone.code).toBe("rest_bd");
  });
  it("serves SEO pages with Product JSON-LD", async () => {
    const { res, data } = await call("/product/dhakai-jamdani-ivory");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(data).toContain('"@type":"Product"');
    const sm = await call("/sitemap.xml");
    expect(sm.data).toContain("/product/dhakai-jamdani-ivory");
  });
});

describe("checkout", () => {
  it("rejects requests without the CSRF header", async () => {
    const res = await exports.default.fetch(new Request(`${BASE}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createOrderFixture) }));
    expect(res.status).toBe(403);
  });
  it("validates input with bilingual field errors", async () => {
    const { res, data } = await call("/api/orders", { method: "POST", json: { ...createOrderFixture, customer: { name: "", phone: "123" } } });
    expect(res.status).toBe(422);
    expect(data.fields.map((f: any) => f.field)).toEqual(expect.arrayContaining(["customer.name", "customer.phone"]));
    expect(data.fields[0].bn).toBeTruthy();
  });
  it("places a COD guest order, prices it on the server and decrements stock", async () => {
    const before = await env.DB.prepare("SELECT stock FROM product_variants WHERE id = ?").bind(createOrderFixture.items[0]!.variantId).first<{ stock: number }>();
    const { res, data } = await call("/api/orders", { method: "POST", json: createOrderFixture });
    expect(res.status).toBe(201);
    expect(data.orderNo).toMatch(/^LKS-\d{6}-[A-Z0-9]{4}$/);
    const after = await env.DB.prepare("SELECT stock FROM product_variants WHERE id = ?").bind(createOrderFixture.items[0]!.variantId).first<{ stock: number }>();
    expect(after!.stock).toBe(before!.stock - createOrderFixture.items[0]!.quantity);
    const track = await call(`/api/orders/track?order=${data.orderNo}&phone=${createOrderFixture.customer.phone}`);
    expect(track.data.order.status).toBe("pending");
    expect(track.data.order.delivery_fee).toBe(0); // Tangail town, over ৳3,000 → free
    // Every order gets a unique invoice number, and each line keeps the SKU that was sold.
    expect(track.data.order.invoice_no).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(track.data.items[0].sku).toBeTruthy();
    const byInvoice = await call(`/api/orders/track?order=${track.data.order.invoice_no}&phone=${createOrderFixture.customer.phone}`);
    expect(byInvoice.data.order.order_no).toBe(data.orderNo);
  });
  it("refuses to oversell", async () => {
    const { res, data } = await call("/api/orders", { method: "POST", json: { ...createOrderFixture, items: [{ variantId: createOrderFixture.items[0]!.variantId, quantity: 20 }] } });
    expect(res.status).toBe(409);
    expect(data.code).toBe("out_of_stock");
  });
  it("requires a TrxID for manual bKash payments", async () => {
    const { res } = await call("/api/orders", { method: "POST", json: { ...createOrderFixture, paymentMethod: "bKash" } });
    expect(res.status).toBe(400);
    const ok = await call("/api/orders", { method: "POST", json: { ...createOrderFixture, paymentMethod: "bKash", paymentRef: "9ABC1DEF2G" } });
    expect(ok.res.status).toBe(201);
  });
});

describe("admin", () => {
  it("requires sign-in", async () => {
    const { res } = await call("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });
  it("rejects a wrong password", async () => {
    const { res, data } = await call("/api/admin/auth/login", { method: "POST", json: { ...adminLoginFixture, password: "wrong-password" } });
    expect(res.status).toBe(401);
    expect(data.bn).toBeTruthy();
  });
  it("lets staff sign in with a plain username (case-insensitive)", async () => {
    const created = await call("/api/admin/staff", { method: "POST", cookie: adminCookie, json: { name: "Shop Owner", email: "LksAdmin", role: "viewer", is_active: 1, password: "Username-Login-1" } });
    expect(created.res.status).toBe(201);
    const { res, data } = await call("/api/admin/auth/login", { method: "POST", json: { email: "lksadmin", password: "Username-Login-1" } });
    expect(res.status).toBe(200);
    expect(data.admin.email).toBe("lksadmin");
    const bad = await call("/api/admin/staff", { method: "POST", cookie: adminCookie, json: { name: "X", email: "has space", role: "viewer", is_active: 1, password: "Username-Login-1" } });
    expect(bad.res.status).toBe(422);
  });
  it("shows dashboard KPIs", async () => {
    const { res, data } = await call("/api/admin/dashboard", { cookie: adminCookie });
    expect(res.status).toBe(200);
    expect(data.salesChart).toHaveLength(12);
    expect(data.kpis.pendingConfirmations.value).toBeGreaterThan(0);
  });
  it("runs the order pipeline, logs history, notifies and restocks on cancel", async () => {
    const list = await call("/api/admin/orders?status=pending", { cookie: adminCookie });
    const order = list.data.items[0];
    const variantId = createOrderFixture.items[0]!.variantId;
    const stock0 = (await env.DB.prepare("SELECT stock FROM product_variants WHERE id = ?").bind(variantId).first<{ stock: number }>())!.stock;
    const bad = await call(`/api/admin/orders/${order.id}/status`, { method: "POST", cookie: adminCookie, json: { status: "delivered" } });
    expect(bad.res.status).toBe(409);
    for (const status of ["confirmed", "packed"]) {
      const r = await call(`/api/admin/orders/${order.id}/status`, { method: "POST", cookie: adminCookie, json: { status } });
      expect(r.res.status).toBe(200);
    }
    const noTracking = await call(`/api/admin/orders/${order.id}/status`, { method: "POST", cookie: adminCookie, json: { status: "shipped", courier: "Pathao" } });
    expect(noTracking.res.status).toBe(422);
    const cancel = await call(`/api/admin/orders/${order.id}/status`, { method: "POST", cookie: processorCookie, json: { status: "cancelled", note: "Customer changed mind" } });
    expect(cancel.res.status).toBe(200);
    const detail = await call(`/api/admin/orders/${order.id}`, { cookie: adminCookie });
    expect(detail.data.history.map((h: any) => h.status)).toEqual(["pending", "confirmed", "packed", "cancelled"]);
    expect(detail.data.notifications.length).toBeGreaterThan(0); // logged as "skipped" without an SMS key
    const stock1 = (await env.DB.prepare("SELECT stock FROM product_variants WHERE id = ?").bind(variantId).first<{ stock: number }>())!.stock;
    expect(stock1).toBeGreaterThan(stock0);
  });
  it("creates, updates, soft-deletes and restores a product with variants", async () => {
    const body = {
      slug: "test-kurti-rose", name_en: "Test Kurti", name_bn: "টেস্ট কুর্তি", category_id: 1, price: 1200, sale_price: 999, status: "active",
      images: [], tags: "test", variants: [{ size: "M", color: "Rose", color_hex: "#cc6677", stock: 5, low_stock_threshold: 2 }, { size: "L", color: "Rose", stock: 3, low_stock_threshold: 2 }],
    };
    const created = await call("/api/admin/products", { method: "POST", cookie: adminCookie, json: body });
    expect(created.res.status).toBe(201);
    const dup = await call("/api/admin/products", { method: "POST", cookie: adminCookie, json: body });
    expect(dup.res.status).toBe(409);
    const got = await call(`/api/admin/products/${created.data.id}`, { cookie: adminCookie });
    const variants = got.data.item.variants.map((v: any) => ({ ...v, stock: v.size === "M" ? 9 : v.stock }));
    const upd = await call(`/api/admin/products/${created.data.id}`, { method: "PUT", cookie: adminCookie, json: { ...body, price: 1300, variants } });
    expect(upd.res.status).toBe(200);
    const log = await call(`/api/admin/inventory/log?limit=5`, { cookie: adminCookie });
    expect(log.data.items.some((l: any) => l.change === 4)).toBe(true);
    expect((await call(`/api/admin/products/${created.data.id}`, { method: "DELETE", cookie: adminCookie })).res.status).toBe(200);
    expect((await call("/api/products/test-kurti-rose")).res.status).toBe(404);
    expect((await call(`/api/admin/products/${created.data.id}/restore`, { method: "POST", cookie: adminCookie })).res.status).toBe(200);
  });
  it("auto-generates unique SKUs and rejects a duplicate SKU", async () => {
    const body = {
      slug: "sku-test-dress", name_en: "SKU Test Dress", name_bn: "এসকেইউ টেস্ট", category_id: 1, price: 1500, status: "active",
      images: [], variants: [{ size: "M", color: "Deep Red", stock: 2 }, { size: "L", color: "Deep Red", sku: "my-own-sku", stock: 2 }],
    };
    const created = await call("/api/admin/products", { method: "POST", cookie: adminCookie, json: body });
    expect(created.res.status).toBe(201);
    const got = (await call(`/api/admin/products/${created.data.id}`, { cookie: adminCookie })).data.item;
    expect(got.sku).toBe(`LKS-${String(created.data.id).padStart(4, "0")}`);
    expect(got.variants.map((v: any) => v.sku).sort()).toEqual([`${got.sku}-M-DEEPRED`, "MY-OWN-SKU"].sort());
    const clash = await call("/api/admin/products", { method: "POST", cookie: adminCookie, json: { ...body, slug: "sku-test-dress-2", sku: got.sku, variants: [{ size: "S", color: "Blue", stock: 1 }] } });
    expect(clash.res.status).toBe(409);
    expect(clash.data.fields[0].field).toBe("sku");
    const copy = await call(`/api/admin/products/${created.data.id}/duplicate`, { method: "POST", cookie: adminCookie });
    const copied = (await call(`/api/admin/products/${copy.data.id}`, { cookie: adminCookie })).data.item;
    expect(copied.sku).not.toBe(got.sku);
    expect(copied.variants.every((v: any) => v.sku && v.sku.startsWith(copied.sku))).toBe(true);
  });
  it("applies a product's % discount and free delivery at checkout", async () => {
    const body = {
      slug: "offer-test-saree", name_en: "Offer Saree", name_bn: "অফার শাড়ি", category_id: 1, price: 2000, status: "active", images: [],
      discount_type: "percent", discount_value: 20, delivery_mode: "free", variants: [{ size: "Free Size", color: "Green", stock: 5 }],
    };
    const created = await call("/api/admin/products", { method: "POST", cookie: adminCookie, json: body });
    expect(created.res.status).toBe(201);
    const pub = await call("/api/products/offer-test-saree");
    expect(pub.data.product.sale_price).toBe(1600);
    expect(pub.data.product.discount_percent).toBe(20);
    expect(pub.data.product.delivery_mode).toBe("free");
    const variantId = pub.data.variants[0].id;
    const dhaka = { ...createOrderFixture.address, division_id: 6, district_id: 47, upazila_id: 1, district: "Dhaka", upazila: "Dhanmondi" };
    const q1 = await call("/api/cart/quote", { method: "POST", json: { items: [{ variantId, quantity: 1 }], address: dhaka } });
    expect(q1.data.subtotal).toBe(1600);
    expect(q1.data.deliveryFee).toBe(0);
    // A normal product in the same cart brings the area fee back.
    const cheap = await env.DB.prepare("SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.status = 'active' AND p.delivery_mode = 'zone' AND p.price < 1500 AND v.stock > 0 LIMIT 1").first<{ id: number }>();
    const q2 = await call("/api/cart/quote", { method: "POST", json: { items: [{ variantId, quantity: 1 }, { variantId: cheap!.id, quantity: 1 }], address: dhaka } });
    expect(q2.data.deliveryFee).toBe(100);
    // Switch to a fixed ৳40 charge and a flat ৳300 discount at any time.
    const got = (await call(`/api/admin/products/${created.data.id}`, { cookie: adminCookie })).data.item;
    const upd = await call(`/api/admin/products/${created.data.id}`, { method: "PUT", cookie: adminCookie, json: { ...body, discount_type: "flat", discount_value: 300, delivery_mode: "fixed", delivery_charge: 40, variants: got.variants } });
    expect(upd.res.status).toBe(200);
    const q3 = await call("/api/cart/quote", { method: "POST", json: { items: [{ variantId, quantity: 2 }], address: dhaka } });
    expect(q3.data.subtotal).toBe(3400);
    expect(q3.data.deliveryFee).toBe(40);
    const bad = await call(`/api/admin/products/${created.data.id}`, { method: "PUT", cookie: adminCookie, json: { ...body, discount_value: 120, variants: got.variants } });
    expect(bad.res.status).toBe(422);
  });
  it("finds a customer's orders by invoice no, phone or SKU in admin search", async () => {
    const o = await env.DB.prepare("SELECT invoice_no, customer_phone FROM orders WHERE invoice_no IS NOT NULL ORDER BY id LIMIT 1").first<{ invoice_no: string; customer_phone: string }>();
    const byInvoice = await call(`/api/admin/search?q=${o!.invoice_no}`, { cookie: adminCookie });
    expect(byInvoice.data.orders[0].invoice_no).toBe(o!.invoice_no);
    expect(byInvoice.data.customers.some((c: any) => c.phone === o!.customer_phone)).toBe(true);
    const byPhone = await call(`/api/admin/search?q=${encodeURIComponent("+88" + o!.customer_phone)}`, { cookie: adminCookie });
    expect(byPhone.data.orders.length).toBeGreaterThan(0);
    const sku = await env.DB.prepare("SELECT sku FROM order_items WHERE sku IS NOT NULL LIMIT 1").first<{ sku: string }>();
    const bySku = await call(`/api/admin/orders?q=${encodeURIComponent(sku!.sku)}`, { cookie: adminCookie });
    expect(bySku.data.items.length).toBeGreaterThan(0);
    const product = await call(`/api/admin/search?q=${encodeURIComponent(sku!.sku)}`, { cookie: adminCookie });
    expect(product.data.products.length).toBeGreaterThan(0);
  });
  it("enforces role permissions on the server", async () => {
    const r = await call("/api/admin/products", { method: "POST", cookie: processorCookie, json: {} });
    expect(r.res.status).toBe(403);
    const s = await call("/api/admin/settings/store", { method: "PUT", cookie: processorCookie, json: { name_en: "x" } });
    expect(s.res.status).toBe(403);
  });
  it("manages coupons and applies them at checkout", async () => {
    const c = await call("/api/admin/coupons", { method: "POST", cookie: adminCookie, json: { code: "test10", type: "percent", value: 10, min_order: 0, category_ids: [], is_active: 1 } });
    expect(c.res.status).toBe(201);
    const q = await call("/api/cart/quote", { method: "POST", json: { items: createOrderFixture.items, couponCode: "TEST10" } });
    expect(q.data.discount).toBe(Math.floor(q.data.subtotal * 0.1));
    const bad = await call("/api/cart/quote", { method: "POST", json: { items: createOrderFixture.items, couponCode: "NOPE" } });
    expect(bad.res.status).toBe(422);
  });
  it("writes an audit log", async () => {
    const { data } = await call("/api/admin/audit?limit=50", { cookie: adminCookie });
    const actions = data.items.map((a: any) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["login", "create", "status"]));
  });
  it("refuses to store API secrets in settings", async () => {
    const { res } = await call("/api/admin/settings/integrations", { method: "PUT", cookie: adminCookie, json: { api_key: "abc" } });
    expect(res.status).toBe(400);
  });
});
