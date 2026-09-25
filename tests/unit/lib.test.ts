import { describe, expect, it } from "vitest";
import { canTransition, restoresStock, TRANSITIONS } from "../../worker/src/lib/orders";
import { hashPassword, verifyPassword, randomCode } from "../../worker/src/lib/crypto";
import { parseCsv, toCsv } from "../../worker/src/lib/csv";
import { normalizeBdPhone, slugify } from "../../worker/src/lib/http";
import { can, ROLE_MATRIX } from "../../worker/src/lib/rbac";
import { render } from "../../worker/src/lib/notify";
import { mapSteadfastStatus } from "../../worker/src/lib/couriers";

describe("order pipeline", () => {
  it("follows Pending → Confirmed → Packed → Shipped → Delivered", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "packed")).toBe(true);
    expect(canTransition("packed", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });
  it("blocks skipping steps and moving backwards", () => {
    expect(canTransition("pending", "shipped")).toBe(false);
    expect(canTransition("delivered", "pending")).toBe(false);
  });
  it("allows cancel only before shipping and return only after", () => {
    expect(canTransition("packed", "cancelled")).toBe(true);
    expect(canTransition("shipped", "cancelled")).toBe(false);
    expect(canTransition("delivered", "returned")).toBe(true);
    expect(canTransition("pending", "returned")).toBe(false);
  });
  it("final states are final", () => {
    expect(TRANSITIONS.cancelled).toEqual([]);
    expect(TRANSITIONS.returned).toEqual([]);
  });
  it("restocks on cancel/return only", () => {
    expect(restoresStock("cancelled")).toBe(true);
    expect(restoresStock("returned")).toBe(true);
    expect(restoresStock("delivered")).toBe(false);
  });
});

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await hashPassword("Correct Horse 42");
    expect(h.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPassword("Correct Horse 42", h)).toBe(true);
    expect(await verifyPassword("correct horse 42", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
  it("salts every hash", async () => expect(await hashPassword("same")).not.toBe(await hashPassword("same")));
  it("makes readable codes", () => expect(randomCode(6)).toMatch(/^[2-9A-HJKMNP-Z]{6}$/));
});

describe("csv", () => {
  it("round-trips quotes, commas and Bangla", () => {
    const rows = [{ slug: "a", name: 'Saree, "red"', bn: "শাড়ি\nলাল" }];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("neutralises spreadsheet formulas", () => expect(toCsv([{ x: "=HYPERLINK(1)" }])).toContain("'=HYPERLINK"));
});

describe("helpers", () => {
  it("normalises Bangladeshi mobile numbers", () => {
    expect(normalizeBdPhone("+880 1711-223344")).toBe("01711223344");
    expect(normalizeBdPhone("01711223344")).toBe("01711223344");
    expect(normalizeBdPhone("01211223344")).toBeNull();
    expect(normalizeBdPhone("12345")).toBeNull();
  });
  it("slugifies", () => expect(slugify("Tangail Taant Saree — Red & Gold!")).toBe("tangail-taant-saree-red-gold"));
  it("renders message templates", () => expect(render("Hi {name}, order {order_no}", { name: "Rina", order_no: "LKS-1" })).toBe("Hi Rina, order LKS-1"));
  it("maps courier statuses", () => {
    expect(mapSteadfastStatus("delivered")).toBe("delivered");
    expect(mapSteadfastStatus("cancelled")).toBe("returned");
    expect(mapSteadfastStatus("in_review")).toBeNull();
  });
});

describe("role permissions", () => {
  it("super admin can do everything", () => expect(ROLE_MATRIX.super_admin.length).toBeGreaterThan(30));
  it("order processors handle orders but not products or staff", () => {
    expect(can("order_processor", "orders.update")).toBe(true);
    expect(can("order_processor", "products.write")).toBe(false);
    expect(can("order_processor", "staff.manage")).toBe(false);
  });
  it("viewers are read-only", () => {
    expect(ROLE_MATRIX.viewer.every((p) => p.endsWith(".read") || p === "dashboard.view" || p === "reports.view")).toBe(true);
  });
  it("managers cannot manage staff, settings or purge", () => {
    expect(can("manager", "staff.manage")).toBe(false);
    expect(can("manager", "settings.manage")).toBe(false);
    expect(can("manager", "trash.purge")).toBe(false);
    expect(can("manager", "orders.refund")).toBe(true);
  });
});
