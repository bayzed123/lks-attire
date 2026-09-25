/** Admin order management — list, detail, edit, status pipeline, courier booking, refunds, trash. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Env } from "../../env";
import { ApiError, body, E, intParam } from "../../lib/http";
import { orderEditSchema, refundSchema, statusChangeSchema } from "../../lib/schemas";
import { perm } from "../../middleware";
import { audit } from "../../lib/store";
import { canTransition, restockStatements, TRANSITIONS, type OrderRow, type OrderStatus } from "../../lib/orders";
import { createConsignment, trackingUrl, type Courier } from "../../lib/couriers";
import { notifyOrder } from "../../lib/notify";

const app = new Hono<AppEnv>();

export interface StatusChange {
  status: OrderStatus;
  note?: string;
  courier?: Courier;
  trackingId?: string;
  createConsignment?: boolean;
  notify: boolean;
}

/** Moves an order along the pipeline. Shared by the admin UI and the courier webhook. */
export async function applyStatus(env: Env, o: OrderRow, ch: StatusChange, actor: string, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<OrderRow> {
  if (!canTransition(o.status, ch.status)) {
    throw new ApiError(
      409,
      "bad_transition",
      `An order that is "${o.status}" cannot be moved to "${ch.status}".`,
      `"${o.status}" অবস্থার অর্ডার "${ch.status}" এ নেওয়া যাবে না।`,
    );
  }
  let courier = ch.courier ?? o.courier_partner;
  let tracking = ch.trackingId?.trim() || o.tracking_id;
  let consignment = o.consignment_id;
  if (ch.status === "shipped") {
    if (!courier) throw new ApiError(422, "validation", "Choose a courier before marking as shipped.", "শিপড করার আগে কুরিয়ার নির্বাচন করুন।", [{ field: "courier", en: "Required", bn: "আবশ্যক" }]);
    if (ch.createConsignment && !tracking) {
      try {
        const r = await createConsignment(env, courier, o);
        if (r) {
          tracking = r.trackingId;
          consignment = r.consignmentId;
        }
      } catch (e) {
        throw new ApiError(502, "courier", `Courier booking failed: ${String(e).slice(0, 160)}`, "কুরিয়ার বুকিং ব্যর্থ হয়েছে। ট্র্যাকিং আইডি হাতে লিখে দিন।");
      }
    }
    if (!tracking) throw new ApiError(422, "validation", "Enter the courier tracking ID.", "কুরিয়ারের ট্র্যাকিং আইডি লিখুন।", [{ field: "trackingId", en: "Required", bn: "আবশ্যক" }]);
  } else if (ch.status !== "delivered" && ch.status !== "returned") {
    courier = o.courier_partner;
  }

  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE orders SET status = ?, courier_partner = ?, tracking_id = ?, consignment_id = ?,
         payment_status = CASE WHEN ? = 'delivered' AND payment_method = 'COD' AND payment_status = 'pending' THEN 'paid' ELSE payment_status END,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = ?`,
    ).bind(ch.status, courier, tracking, consignment, ch.status, o.id, o.status),
    env.DB.prepare("INSERT INTO order_status_history (order_id, status, note, actor) VALUES (?, ?, ?, ?)").bind(o.id, ch.status, ch.note ?? null, actor),
  ];
  if (ch.status === "cancelled" || ch.status === "returned") {
    stmts.push(...(await restockStatements(env, o.id, ch.status === "cancelled" ? "cancel" : "return", actor)));
    if (o.coupon_code && ch.status === "cancelled") stmts.push(env.DB.prepare("UPDATE coupons SET used_count = MAX(0, used_count - 1) WHERE code = ?").bind(o.coupon_code));
  }
  const res = await env.DB.batch(stmts);
  if (!res[0]?.meta.changes) throw E.conflict("This order was just changed by someone else. Please refresh.", "অর্ডারটি এইমাত্র অন্য কেউ পরিবর্তন করেছে। রিফ্রেশ করুন।");

  const updated = (await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(o.id).first<OrderRow>())!;
  if (ch.notify) {
    const job = notifyOrder(env, updated, ch.status === "pending" ? "placed" : ch.status);
    if (ctx) ctx.waitUntil(job);
    else await job;
  }
  return updated;
}

app.get("/", perm("orders.read"), async (c) => {
  const q = c.req.query();
  const where: string[] = [q.trash === "1" ? "o.deleted_at IS NOT NULL" : "o.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (q.status) {
    where.push("o.status = ?");
    args.push(q.status);
  }
  if (q.payment_method) {
    where.push("o.payment_method = ?");
    args.push(q.payment_method);
  }
  if (q.payment_status) {
    where.push("o.payment_status = ?");
    args.push(q.payment_status);
  }
  if (q.courier) {
    where.push("o.courier_partner = ?");
    args.push(q.courier);
  }
  if (q.from) {
    where.push("o.created_at >= ?");
    args.push(q.from);
  }
  if (q.to) {
    where.push("o.created_at < date(?, '+1 day')");
    args.push(q.to);
  }
  if (q.q) {
    // Anything that identifies a customer or order: invoice/order no, name, phone, email, TrxID, tracking, address or a SKU bought.
    where.push(
      "(o.order_no LIKE ? OR o.invoice_no LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.customer_email LIKE ? OR o.payment_ref LIKE ? OR o.tracking_id LIKE ? OR o.area LIKE ? OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.sku LIKE ?))",
    );
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    args.push(like, like, like, like, like, like, like, like, like);
  }
  const limit = intParam(q.limit, 20, 1, 200);
  const page = intParam(q.page, 1, 1, 100000);
  const sort = q.sort === "total" ? "o.total DESC" : q.sort === "oldest" ? "o.created_at ASC" : "o.created_at DESC";
  const w = where.join(" AND ");
  const [count, rows, counts] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${w}`).bind(...args).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT o.id, o.order_no, o.invoice_no, o.customer_name, o.customer_phone, o.district, o.upazila, o.total, o.payment_method, o.payment_status,
              o.status, o.courier_partner, o.tracking_id, o.created_at,
              (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count
         FROM orders o WHERE ${w} ORDER BY ${sort} LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all(),
    c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM orders WHERE deleted_at IS NULL GROUP BY status").all<{ status: string; n: number }>(),
  ]);
  const total = count?.n ?? 0;
  return c.json({ items: rows.results, total, page, pages: Math.ceil(total / limit), statusCounts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])) });
});

app.get("/:id{[0-9]+}", perm("orders.read"), async (c) => {
  const id = Number(c.req.param("id"));
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  if (!o) throw E.notFound("Order");
  const [items, history, notes, stats] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id").bind(id).all(),
    c.env.DB.prepare("SELECT channel, template, status, error, created_at FROM notifications WHERE order_id = ? ORDER BY id DESC LIMIT 30").bind(id).all(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS orders, SUM(CASE WHEN status IN ('cancelled','returned') THEN 1 ELSE 0 END) AS failed FROM orders WHERE customer_phone = ? AND deleted_at IS NULL",
    )
      .bind(o.customer_phone)
      .first<{ orders: number; failed: number }>(),
  ]);
  return c.json({
    order: { ...o, tracking_url: trackingUrl(o.courier_partner, o.tracking_id) },
    items: items.results,
    history: history.results,
    notifications: notes.results,
    customerStats: stats,
    nextStatuses: TRANSITIONS[o.status],
  });
});

app.put("/:id{[0-9]+}", perm("orders.update"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await body(c, orderEditSchema);
  const entries = Object.entries(b).filter(([, v]) => v !== undefined);
  if (!entries.length) return c.json({ ok: true });
  await c.env.DB.prepare(`UPDATE orders SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(...entries.map(([, v]) => v), id)
    .run();
  await audit(c, "update", "order", id, Object.fromEntries(entries));
  return c.json({ ok: true, en: "Order updated.", bn: "অর্ডার আপডেট হয়েছে।" });
});

app.post("/:id{[0-9]+}/status", perm("orders.update"), async (c) => {
  const id = Number(c.req.param("id"));
  const ch = await body(c, statusChangeSchema);
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL").bind(id).first<OrderRow>();
  if (!o) throw E.notFound("Order");
  const updated = await applyStatus(c.env, o, ch, c.get("admin")!.name, c.executionCtx);
  await audit(c, "status", "order", id, { from: o.status, to: ch.status, courier: updated.courier_partner, tracking: updated.tracking_id });
  return c.json({ order: updated, en: `Order moved to "${ch.status}".`, bn: `অর্ডারটি "${ch.status}" এ নেওয়া হয়েছে।` });
});

app.post("/bulk-status", perm("orders.update"), async (c) => {
  const b = await body(c, z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), status: statusChangeSchema.shape.status, notify: z.boolean().default(true) }));
  if (b.status === "shipped") throw E.badRequest("Ship orders one by one so each gets a tracking ID.", "প্রতিটি অর্ডারে ট্র্যাকিং আইডি দিতে একটি একটি করে শিপ করুন।");
  const done: number[] = [];
  const failed: { id: number; reason: string }[] = [];
  for (const id of b.ids) {
    const o = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL").bind(id).first<OrderRow>();
    if (!o) continue;
    try {
      await applyStatus(c.env, o, { status: b.status, notify: b.notify }, c.get("admin")!.name, c.executionCtx);
      done.push(id);
    } catch (e) {
      failed.push({ id, reason: e instanceof ApiError ? e.en : String(e) });
    }
  }
  await audit(c, "bulk_status", "order", done.join(","), { status: b.status, failed });
  return c.json({ done, failed, en: `${done.length} order(s) updated.`, bn: `${done.length}টি অর্ডার আপডেট হয়েছে।` });
});

app.post("/:id{[0-9]+}/refund", perm("orders.refund"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await body(c, refundSchema);
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  if (!o) throw E.notFound("Order");
  const newTotal = o.refund_amount + b.amount;
  if (newTotal > o.total) throw E.badRequest(`Refund cannot exceed the order total (৳${o.total}).`, `রিফান্ড অর্ডারের মোট টাকার (৳${o.total}) বেশি হতে পারে না।`);
  const ps = newTotal >= o.total ? "refunded" : "partially_refunded";
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE orders SET refund_amount = ?, refund_note = ?, payment_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(newTotal, b.note, ps, id),
    c.env.DB.prepare("INSERT INTO order_status_history (order_id, status, note, actor) VALUES (?, ?, ?, ?)").bind(id, o.status, `Refund ৳${b.amount}: ${b.note}`, c.get("admin")!.name),
  ]);
  await audit(c, "refund", "order", id, b);
  return c.json({ ok: true, en: "Refund recorded. Remember to send the money to the customer.", bn: "রিফান্ড রেকর্ড হয়েছে। গ্রাহককে টাকা পাঠাতে ভুলবেন না।" });
});

app.post("/:id{[0-9]+}/notify", perm("orders.update"), async (c) => {
  const id = Number(c.req.param("id"));
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
  if (!o) throw E.notFound("Order");
  await notifyOrder(c.env, o, o.status === "pending" ? "placed" : o.status);
  return c.json({ ok: true, en: "Message sent again.", bn: "মেসেজ আবার পাঠানো হয়েছে।" });
});

app.delete("/:id{[0-9]+}", perm("orders.delete"), async (c) => {
  const id = Number(c.req.param("id"));
  const o = await c.env.DB.prepare("SELECT status FROM orders WHERE id = ?").bind(id).first<{ status: OrderStatus }>();
  if (!o) throw E.notFound("Order");
  if (!["cancelled", "returned", "delivered"].includes(o.status))
    throw E.badRequest("Cancel the order first — that puts the stock back.", "আগে অর্ডারটি বাতিল করুন — তাতে স্টক ফেরত যাবে।");
  await c.env.DB.prepare("UPDATE orders SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(id).run();
  await audit(c, "delete", "order", id);
  return c.json({ ok: true, en: "Moved to Trash.", bn: "ট্র্যাশে পাঠানো হয়েছে।" });
});

app.post("/:id{[0-9]+}/restore", perm("orders.delete"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE orders SET deleted_at = NULL WHERE id = ?").bind(id).run();
  await audit(c, "restore", "order", id);
  return c.json({ ok: true, en: "Restored.", bn: "ফিরিয়ে আনা হয়েছে।" });
});

export default app;
