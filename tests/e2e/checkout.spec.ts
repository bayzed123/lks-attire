import { expect, test } from "@playwright/test";

// Block third-party requests (fonts/CDNs) so the test is fast and deterministic.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem("lks_lang", "en"));
});

test("guest can browse, filter, add to cart and check out with Cash on Delivery", async ({ page }) => {
  await page.goto("/shop/three-piece");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Three-Piece");

  await page.locator("article.card a.media").first().click();
  await expect(page.locator("h1")).toBeVisible();

  // Choose the first in-stock colour and size.
  await page.locator(".colour-opts button").first().click();
  await page.locator(".size-opts button:not([disabled])").first().click();
  await expect(page.locator("#stock")).not.toContainText("Out of stock");
  await page.locator("#add").click();
  await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await page.locator('input[name="name"]').fill("E2E Shopper");
  await page.locator('input[name="phone"]').fill("01811223344");
  await page.locator('select[name="division_id"]').selectOption({ label: "Dhaka" });
  await page.locator('select[name="district_id"]').selectOption({ label: "Tangail" });
  await page.locator('select[name="upazila_id"]').selectOption({ label: "Tangail Sadar" });
  await expect(page.locator("#zone")).toContainText("Inside Tangail town");
  await page.locator('textarea[name="area"]').fill("Akurtakur Para, Road 3, House 12");
  await expect(page.locator('input[name="paymentMethod"][value="COD"]')).toBeChecked();
  // The Send Money steps name the wallet the customer picked.
  await page.locator('input[name="paymentMethod"][value="bKash"]').check({ force: true });
  await expect(page.locator("#mfs")).toContainText("Open your bKash app");
  await page.locator('input[name="paymentMethod"][value="COD"]').check({ force: true });
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page.getByRole("heading", { name: /Thank you/ })).toBeVisible({ timeout: 15_000 });
  const orderNo = (await page.locator(".panel h2").first().textContent())?.trim();
  expect(orderNo).toMatch(/^LKS-\d{6}-[A-Z0-9]{4}$/);
  await expect(page.locator(".timeline li").first()).toContainText("Order placed");
});

test("language toggle switches the storefront to Bangla", async ({ page }) => {
  await page.goto("/");
  await page.locator('.lang-toggle button[data-lang="bn"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.locator(".trust")).toContainText("ক্যাশ অন ডেলিভারি");
});

test("staff can sign in and confirm an order from the admin", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lks_admin_lang", "en"));
  await page.goto("/admin/");
  await page.locator('input[name="email"]').fill("e2e@test.dev");
  await page.locator('input[name="password"]').fill("E2E-Password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".kpis .kpi").first()).toBeVisible();
  await page.goto("/admin/#/orders?status=pending");
  const rows = page.locator("#list tbody tr");
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  await page.getByRole("button", { name: "→ Confirmed" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Yes" }).click();
  await expect(page.locator(".toast").first()).toBeVisible();
});

test("admin dashboard has no horizontal scrolling on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone-only check");
  await page.addInitScript(() => localStorage.setItem("lks_admin_lang", "en"));
  await page.goto("/admin/");
  await page.locator('input[name="email"]').fill("e2e@test.dev");
  await page.locator('input[name="password"]').fill("E2E-Password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  for (const hash of ["#/dashboard", "#/orders", "#/products", "#/inventory"]) {
    await page.goto(`/admin/${hash}`);
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, hash).toBeLessThanOrEqual(1);
  }
});

test("typing a postcode auto-selects Division, District and Upazila at checkout", async ({ page }) => {
  await page.goto("/product/ruby-organza-three-piece");
  await page.locator(".size-opts button:not([disabled])").first().click();
  await page.locator("#add").click();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.locator("#area-q").fill("1900");
  await page.locator("#area-results button").first().click();
  await expect(page.locator('select[name="district_id"] option:checked')).toHaveText("Tangail");
  await expect(page.locator('select[name="division_id"] option:checked')).toHaveText("Dhaka");
  // Place-name search works too (English or Bangla).
  await page.locator("#area-q").fill("Mirzapur");
  await page.locator("#area-results button", { hasText: "Tangail" }).first().click();
  await expect(page.locator('select[name="upazila_id"] option:checked')).toHaveText("Mirzapur");
  await expect(page.locator("#zone")).toContainText("Tangail (outside town)");
});

test("a slow earlier delivery quote never overwrites the zone for the final address", async ({ page }) => {
  // Each address change asks for a new quote. Hold the earlier ones back so they
  // arrive after the last one — the zone shown must still be the final address's.
  let n = 0;
  await page.route("**/api/cart/quote", async (route) => {
    const delay = n++ < 3 ? 1500 : 0;
    await new Promise((r) => setTimeout(r, delay));
    await route.continue();
  });
  await page.goto("/product/ruby-organza-three-piece");
  await page.locator(".colour-opts button").first().click();
  await page.locator(".size-opts button:not([disabled])").first().click();
  await page.locator("#add").click();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  n = 0;
  await page.locator('select[name="division_id"]').selectOption({ label: "Dhaka" });
  await page.locator('select[name="district_id"]').selectOption({ label: "Tangail" });
  await page.locator('select[name="upazila_id"]').selectOption({ label: "Tangail Sadar" });
  await page.waitForTimeout(2500);
  await expect(page.locator("#zone")).toContainText("Inside Tangail town");
});
