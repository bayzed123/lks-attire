/**
 * Lk's Attire — single Cloudflare Worker.
 * Static storefront (/) and admin (/admin/) are served from Workers Static Assets (dist/).
 * This Worker handles /api/*, /media/*, /sitemap.xml and SEO-enhanced /product/* and /shop/* pages.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./env";
import { ApiError } from "./lib/http";
import { csrf, language, requireAdmin, securityHeaders } from "./middleware";
import publicRoutes from "./routes/public";
import customerRoutes from "./routes/customer";
import callbackRoutes from "./routes/callbacks";
import seoRoutes from "./routes/seo";
import adminAuth from "./routes/admin/auth";
import adminOrders from "./routes/admin/orders";
import adminProducts from "./routes/admin/products";
import adminInsights from "./routes/admin/insights";
import adminSystem from "./routes/admin/system";
import { crudRouter, RESOURCES } from "./routes/admin/crud";

const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("/api/*", language, csrf);

app.get("/api/health", (c) => c.json({ ok: true, env: c.env.ENVIRONMENT, time: new Date().toISOString() }));

app.route("/api", publicRoutes);
app.route("/api", customerRoutes);
app.route("/api", callbackRoutes);

// ---- Admin API ----
app.route("/api/admin/auth", adminAuth);
const admin = new Hono<AppEnv>();
admin.use("*", requireAdmin);
admin.route("/orders", adminOrders);
admin.route("/products", adminProducts);
admin.route("/", adminInsights);
admin.route("/", adminSystem);
for (const [key, res] of Object.entries(RESOURCES)) admin.route(`/${key}`, crudRouter(key, res));
app.route("/api/admin", admin);

app.route("/", seoRoutes);

app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ code: "not_found", en: "Not found.", bn: "পাওয়া যায়নি।" }, 404) : c.env.ASSETS.fetch(c.req.raw)));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ code: err.code, en: err.en, bn: err.bn, fields: err.fields }, err.status as 400);
  }
  if (err instanceof HTTPException) return err.getResponse();
  console.error("Unhandled error", c.req.method, c.req.path, err);
  return c.json({ code: "server_error", en: "Something went wrong on our side. Please try again.", bn: "আমাদের দিকে একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।" }, 500);
});

export default app;
