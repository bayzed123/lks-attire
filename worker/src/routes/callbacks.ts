/** Payment gateway callbacks and courier webhooks (CSRF-exempt; each verifies its own authenticity). */
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { bkashExecute, sslczValidate, sslczConfigured } from "../lib/payments";
import { mapSteadfastStatus } from "../lib/couriers";
import { safeEqualStr } from "../lib/crypto";
import type { OrderRow } from "../lib/orders";
import { applyStatus } from "./admin/orders";

const app = new Hono<AppEnv>();

async function markPaid(env: AppEnv["Bindings"], orderNo: string, ref: string, amount: number | undefined, source: string): Promise<OrderRow | null> {
  const o = await env.DB.prepare("SELECT * FROM orders WHERE order_no = ?").bind(orderNo).first<OrderRow>();
  if (!o) return null;
  if (amount != null && Math.round(amount) < o.total) {
    await env.DB.prepare("UPDATE orders SET admin_notes = COALESCE(admin_notes || '\n', '') || ? WHERE id = ?").bind(`${source}: paid amount ${amount} is less than total ${o.total}`, o.id).run();
    return o;
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET payment_status = 'paid', payment_ref = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(ref, o.id),
    env.DB.prepare("INSERT INTO order_status_history (order_id, status, note, actor) VALUES (?, ?, ?, ?)").bind(o.id, o.status, `Payment received (${ref})`, source),
  ]);
  return o;
}

// ---- bKash: browser returns here after the customer approves/cancels in the bKash page ----
app.get("/payments/bkash/callback", async (c) => {
  const paymentID = c.req.query("paymentID") ?? "";
  const status = c.req.query("status");
  const orderNo = paymentID ? await c.env.KV.get(`bkash:pay:${paymentID}`) : null;
  if (!orderNo) return c.redirect("/checkout?payment=failed");
  const o = await c.env.DB.prepare("SELECT public_token FROM orders WHERE order_no = ?").bind(orderNo).first<{ public_token: string }>();
  const confirmUrl = `/order/${orderNo}?token=${o?.public_token ?? ""}`;
  if (status !== "success") {
    await c.env.DB.prepare("UPDATE orders SET payment_status = 'failed' WHERE order_no = ? AND payment_status = 'pending'").bind(orderNo).run();
    return c.redirect(`${confirmUrl}&payment=${status === "cancel" ? "cancelled" : "failed"}`);
  }
  const r = await bkashExecute(c.env, paymentID);
  if (r.ok && r.trxID && r.invoice === orderNo) {
    await markPaid(c.env, orderNo, r.trxID, r.amount, "bKash");
    await c.env.KV.delete(`bkash:pay:${paymentID}`);
    return c.redirect(`${confirmUrl}&payment=paid`);
  }
  await c.env.DB.prepare("UPDATE orders SET payment_status = 'failed' WHERE order_no = ? AND payment_status = 'pending'").bind(orderNo).run();
  return c.redirect(`${confirmUrl}&payment=failed`);
});

// ---- SSLCommerz: IPN (server-to-server) is the source of truth; the browser return just shows status ----
app.post("/payments/sslcommerz/ipn", async (c) => {
  if (!sslczConfigured(c.env)) return c.text("not configured", 404);
  const form = await c.req.parseBody();
  const valId = String(form["val_id"] ?? "");
  if (!valId) return c.text("missing val_id", 400);
  const v = await sslczValidate(c.env, valId);
  if (v.ok && v.tranId) await markPaid(c.env, v.tranId, v.bankTranId ?? valId, v.amount, "SSLCommerz");
  return c.text("OK");
});

app.post("/payments/sslcommerz/return", async (c) => {
  const form = await c.req.parseBody();
  const tranId = String(form["tran_id"] ?? "");
  const result = c.req.query("result");
  const token = String(form["value_a"] ?? "");
  if (result === "success" && form["val_id"] && sslczConfigured(c.env)) {
    const v = await sslczValidate(c.env, String(form["val_id"]));
    if (v.ok && v.tranId === tranId) await markPaid(c.env, tranId, v.bankTranId ?? String(form["val_id"]), v.amount, "SSLCommerz");
  } else if (tranId) {
    await c.env.DB.prepare("UPDATE orders SET payment_status = 'failed' WHERE order_no = ? AND payment_status = 'pending'").bind(tranId).run();
  }
  return c.redirect(`/order/${encodeURIComponent(tranId)}?token=${encodeURIComponent(token)}&payment=${result === "success" ? "paid" : result}`, 303);
});

// ---- Steadfast delivery-status webhook (Bearer token configured in the Steadfast panel) ----
app.post("/webhooks/steadfast", async (c) => {
  const expected = c.env.STEADFAST_WEBHOOK_TOKEN;
  const auth = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !safeEqualStr(auth, expected)) return c.json({ status: "error", message: "unauthorized" }, 401);
  const p = (await c.req.json().catch(() => ({}))) as { notification_type?: string; consignment_id?: number | string; invoice?: string; status?: string; tracking_message?: string };
  const o = await c.env.DB.prepare("SELECT * FROM orders WHERE consignment_id = ? OR order_no = ?")
    .bind(String(p.consignment_id ?? ""), p.invoice ?? "")
    .first<OrderRow>();
  if (!o) return c.json({ status: "success", message: "ignored" });
  if (p.notification_type === "delivery_status" && p.status) {
    const next = mapSteadfastStatus(p.status);
    if (next && next !== o.status) {
      try {
        await applyStatus(c.env, o, { status: next, note: p.tracking_message ?? `Steadfast: ${p.status}`, notify: true }, "courier:Steadfast", c.executionCtx);
      } catch (e) {
        console.warn("steadfast transition skipped", e);
      }
    }
  } else if (p.tracking_message) {
    await c.env.DB.prepare("INSERT INTO order_status_history (order_id, status, note, actor) VALUES (?, ?, ?, 'courier:Steadfast')").bind(o.id, o.status, p.tracking_message.slice(0, 300)).run();
  }
  return c.json({ status: "success", message: "Webhook received successfully." });
});

export default app;
