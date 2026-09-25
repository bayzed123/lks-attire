/** Dashboard KPIs and reports. All "day" boundaries use Bangladesh time (UTC+6). */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../env";
import { validate } from "../../lib/http";
import { perm } from "../../middleware";
import { toCsv } from "../../lib/csv";
import { audit } from "../../lib/store";

const app = new Hono<AppEnv>();
const BD = "'+6 hours'";
const LIVE = "o.deleted_at IS NULL AND o.status NOT IN ('cancelled','returned')";

app.get("/dashboard", perm("dashboard.view"), async (c) => {
  const db = c.env.DB;
  const [today, yesterday, month, lastMonth, pending, lowStock, newCustomers, prevCustomers, chart, recent, top, pendingReviews, statusMix] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders o WHERE ${LIVE} AND date(o.created_at, ${BD}) = date('now', ${BD})`).first<{ orders: number; revenue: number }>(),
    db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders o WHERE ${LIVE} AND date(o.created_at, ${BD}) = date('now', ${BD}, '-1 day')`).first<{ orders: number; revenue: number }>(),
    db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders o WHERE ${LIVE} AND strftime('%Y-%m', o.created_at, ${BD}) = strftime('%Y-%m', 'now', ${BD})`).first<{ orders: number; revenue: number }>(),
    db.prepare(`SELECT COALESCE(SUM(total),0) AS revenue FROM orders o WHERE ${LIVE} AND strftime('%Y-%m', o.created_at, ${BD}) = strftime('%Y-%m', 'now', ${BD}, 'start of month', '-1 month')`).first<{ revenue: number }>(),
    db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN payment_method = 'COD' THEN 1 ELSE 0 END) AS cod FROM orders WHERE status = 'pending' AND deleted_at IS NULL").first<{ n: number; cod: number }>(),
    db.prepare("SELECT COUNT(*) AS n, (SELECT COUNT(*) FROM product_variants) AS total FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.stock <= v.low_stock_threshold AND p.deleted_at IS NULL AND p.status = 'active'").first<{ n: number; total: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM customers WHERE created_at >= datetime('now', '-7 days')`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM customers WHERE created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')`).first<{ n: number }>(),
    db.prepare(
      `SELECT strftime('%Y-%m', o.created_at, ${BD}) AS month, COUNT(*) AS orders, COALESCE(SUM(o.total),0) AS revenue
         FROM orders o WHERE ${LIVE} AND o.created_at >= date('now', 'start of month', '-11 months') GROUP BY month ORDER BY month`,
    ).all<{ month: string; orders: number; revenue: number }>(),
    db.prepare("SELECT id, order_no, customer_name, customer_phone, district, total, payment_method, payment_status, status, created_at FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 8").all(),
    db.prepare(
      `SELECT i.product_id, i.name_en, i.name_bn, MAX(i.image) AS image, SUM(i.quantity) AS qty, SUM(i.line_total) AS revenue
         FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${LIVE} AND o.created_at >= datetime('now', '-30 days')
        GROUP BY i.product_id ORDER BY qty DESC LIMIT 6`,
    ).all(),
    db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending' AND deleted_at IS NULL").first<{ n: number }>(),
    db.prepare("SELECT status, COUNT(*) AS n FROM orders WHERE deleted_at IS NULL AND created_at >= datetime('now', '-30 days') GROUP BY status").all<{ status: string; n: number }>(),
  ]);

  // Fill the 12-month series so the chart has no gaps.
  const series: { month: string; orders: number; revenue: number }[] = [];
  const d = new Date(Date.now() + 6 * 3600_000);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    series.push(chart.results.find((r) => r.month === m) ?? { month: m, orders: 0, revenue: 0 });
  }
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);
  return c.json({
    kpis: {
      todayOrders: { value: today?.orders ?? 0, change: pct(today?.orders ?? 0, yesterday?.orders ?? 0) },
      todayRevenue: { value: today?.revenue ?? 0, change: pct(today?.revenue ?? 0, yesterday?.revenue ?? 0) },
      monthRevenue: { value: month?.revenue ?? 0, orders: month?.orders ?? 0, change: pct(month?.revenue ?? 0, lastMonth?.revenue ?? 0) },
      pendingConfirmations: { value: pending?.n ?? 0, cod: pending?.cod ?? 0 },
      lowStock: { value: lowStock?.n ?? 0, total: lowStock?.total ?? 0 },
      newCustomers: { value: newCustomers?.n ?? 0, change: pct(newCustomers?.n ?? 0, prevCustomers?.n ?? 0) },
      pendingReviews: { value: pendingReviews?.n ?? 0 },
    },
    salesChart: series,
    recentOrders: recent.results,
    topProducts: top.results,
    statusMix: Object.fromEntries(statusMix.results.map((r) => [r.status, r.n])),
  });
});

const range = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  group: z.enum(["day", "month", "category", "product", "payment", "zone"]).default("day"),
  format: z.enum(["json", "csv"]).default("json"),
});

function dateWhere(from?: string, to?: string): { sql: string; args: string[] } {
  const f = from ?? new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10);
  const t = to ?? new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
  return { sql: `date(o.created_at, ${BD}) BETWEEN ? AND ?`, args: [f, t] };
}

async function respond(c: Context<AppEnv>, name: string, rows: Record<string, unknown>[], format: string, extra: Record<string, unknown> = {}) {
  if (format === "csv") {
    await audit(c, "export", "report", name, { rows: rows.length });
    return new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  return c.json({ rows, ...extra });
}

app.get("/reports/sales", perm("reports.view"), async (c) => {
  const q = validate(range, c.req.query());
  const w = dateWhere(q.from, q.to);
  const sql = {
    day: `SELECT date(o.created_at, ${BD}) AS label, COUNT(*) AS orders, SUM(o.subtotal) AS merchandise, SUM(o.discount) AS discounts, SUM(o.delivery_fee) AS delivery, SUM(o.total) AS revenue FROM orders o WHERE ${LIVE} AND ${w.sql} GROUP BY label ORDER BY label`,
    month: `SELECT strftime('%Y-%m', o.created_at, ${BD}) AS label, COUNT(*) AS orders, SUM(o.subtotal) AS merchandise, SUM(o.discount) AS discounts, SUM(o.delivery_fee) AS delivery, SUM(o.total) AS revenue FROM orders o WHERE ${LIVE} AND ${w.sql} GROUP BY label ORDER BY label`,
    category: `SELECT COALESCE(c.name_en, 'Uncategorised') AS label, COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS units, SUM(i.line_total) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN categories c ON c.id = i.category_id WHERE ${LIVE} AND ${w.sql} GROUP BY label ORDER BY revenue DESC`,
    product: `SELECT i.name_en AS label, COUNT(DISTINCT o.id) AS orders, SUM(i.quantity) AS units, SUM(i.line_total) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${LIVE} AND ${w.sql} GROUP BY i.product_id ORDER BY revenue DESC LIMIT 200`,
    payment: `SELECT o.payment_method AS label, COUNT(*) AS orders, SUM(o.total) AS revenue, SUM(CASE WHEN o.payment_status = 'paid' THEN o.total ELSE 0 END) AS collected FROM orders o WHERE ${LIVE} AND ${w.sql} GROUP BY label ORDER BY revenue DESC`,
    zone: `SELECT o.zone_code AS label, COUNT(*) AS orders, SUM(o.delivery_fee) AS delivery, SUM(o.total) AS revenue FROM orders o WHERE ${LIVE} AND ${w.sql} GROUP BY label ORDER BY orders DESC`,
  }[q.group];
  const { results } = await c.env.DB.prepare(sql).bind(...w.args).all<Record<string, unknown>>();
  const totals = await c.env.DB.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(o.total),0) AS revenue, COALESCE(AVG(o.total),0) AS aov FROM orders o WHERE ${LIVE} AND ${w.sql}`).bind(...w.args).first();
  return respond(c, `sales-by-${q.group}`, results, q.format, { totals });
});

app.get("/reports/customers", perm("reports.view"), async (c) => {
  const q = validate(range, c.req.query());
  const w = dateWhere(q.from, q.to);
  const { results } = await c.env.DB.prepare(
    `SELECT o.customer_name AS name, o.customer_phone AS phone, MAX(o.district) AS district, COUNT(*) AS orders, SUM(o.total) AS spent, MAX(o.created_at) AS last_order
       FROM orders o WHERE ${LIVE} AND ${w.sql} GROUP BY o.customer_phone ORDER BY spent DESC LIMIT 100`,
  )
    .bind(...w.args)
    .all<Record<string, unknown>>();
  return respond(c, "best-customers", results, q.format);
});

app.get("/reports/couriers", perm("reports.view"), async (c) => {
  const q = validate(range, c.req.query());
  const w = dateWhere(q.from, q.to);
  const { results } = await c.env.DB.prepare(
    `SELECT o.courier_partner AS courier, COUNT(*) AS shipped,
            SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN o.status = 'returned' THEN 1 ELSE 0 END) AS returned,
            ROUND(100.0 * SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) / COUNT(*), 1) AS success_rate,
            ROUND(AVG(CASE WHEN o.status = 'delivered' THEN
              julianday((SELECT MAX(created_at) FROM order_status_history h WHERE h.order_id = o.id AND h.status = 'delivered')) -
              julianday((SELECT MIN(created_at) FROM order_status_history h WHERE h.order_id = o.id AND h.status = 'shipped')) END), 1) AS avg_days
       FROM orders o WHERE o.deleted_at IS NULL AND o.courier_partner IS NOT NULL AND ${w.sql} GROUP BY o.courier_partner ORDER BY shipped DESC`,
  )
    .bind(...w.args)
    .all<Record<string, unknown>>();
  return respond(c, "courier-performance", results, q.format);
});

export default app;
