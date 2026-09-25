/**
 * Customer notifications — SMS (Bangladeshi bulk-SMS gateways), WhatsApp Cloud API and email (Resend).
 * Every attempt is written to the `notifications` table so staff can see what was sent.
 * When a provider isn't configured the message is logged as "skipped" instead of failing the order.
 */
import type { Env } from "../env";
import { getSetting } from "./store";
import { BRAND } from "../brand.generated";

export type TemplateKey = "placed" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled" | "returned" | "otp";
type Templates = Record<TemplateKey, { en: string; bn: string }>;

export interface NotifyOrder {
  id: number;
  order_no: string;
  invoice_no?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  total: number;
  courier_partner: string | null;
  tracking_id: string | null;
  lang: "bn" | "en";
}

export function render(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] == null ? "" : String(vars[k])));
}

async function log(env: Env, channel: "sms" | "whatsapp" | "email", recipient: string, template: string, message: string, status: "sent" | "failed" | "skipped", error: string | null, orderId: number | null) {
  await env.DB.prepare("INSERT INTO notifications (channel, recipient, template, message, status, error, order_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(channel, recipient, template, message, status, error, orderId)
    .run();
}

export async function sendSms(env: Env, phone: string, message: string, template: string, orderId: number | null = null): Promise<boolean> {
  if (!env.SMS_API_KEY) {
    await log(env, "sms", phone, template, message, "skipped", "SMS_API_KEY not configured", orderId);
    return false;
  }
  try {
    // Works with BulkSMSBD-style gateways (api_key, senderid, number, message). Swap SMS_API_URL for another provider.
    const url = env.SMS_API_URL || "https://bulksmsbd.net/api/smsapi";
    const form = new URLSearchParams({
      api_key: env.SMS_API_KEY,
      type: "text",
      senderid: env.SMS_SENDER_ID || "",
      number: phone.replace(/^0/, "880"),
      message,
    });
    const res = await fetch(url, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } });
    const ok = res.ok;
    await log(env, "sms", phone, template, message, ok ? "sent" : "failed", ok ? null : `HTTP ${res.status}`, orderId);
    return ok;
  } catch (e) {
    await log(env, "sms", phone, template, message, "failed", String(e).slice(0, 300), orderId);
    return false;
  }
}

export async function sendWhatsApp(env: Env, phone: string, message: string, template: string, orderId: number | null = null): Promise<boolean> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    await log(env, "whatsapp", phone, template, message, "skipped", "WhatsApp Cloud API not configured", orderId);
    return false;
  }
  try {
    // Note: business-initiated WhatsApp messages outside the 24h window require an approved template.
    const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone.replace(/^0/, "880"), type: "text", text: { body: message } }),
    });
    await log(env, "whatsapp", phone, template, message, res.ok ? "sent" : "failed", res.ok ? null : `HTTP ${res.status}`, orderId);
    return res.ok;
  } catch (e) {
    await log(env, "whatsapp", phone, template, message, "failed", String(e).slice(0, 300), orderId);
    return false;
  }
}

export async function sendEmail(env: Env, to: string, subject: string, text: string, template: string, orderId: number | null = null): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    await log(env, "email", to, template, text, "skipped", "Email provider not configured", orderId);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
    });
    await log(env, "email", to, template, text, res.ok ? "sent" : "failed", res.ok ? null : `HTTP ${res.status}`, orderId);
    return res.ok;
  } catch (e) {
    await log(env, "email", to, template, text, "failed", String(e).slice(0, 300), orderId);
    return false;
  }
}

/** Sends the order message for a pipeline stage on every enabled channel. */
export async function notifyOrder(env: Env, order: NotifyOrder, key: TemplateKey): Promise<void> {
  const [templates, channels] = await Promise.all([
    getSetting<Partial<Templates>>(env, "sms_templates", {}),
    getSetting<{ sms: boolean; whatsapp: boolean; email: boolean }>(env, "notifications", { sms: true, whatsapp: false, email: true }),
  ]);
  const tpl = templates[key];
  if (!tpl) return;
  const lang = order.lang === "en" ? "en" : "bn";
  const message = render(tpl[lang], {
    name: order.customer_name.split(" ")[0],
    order_no: order.order_no,
    invoice_no: order.invoice_no ?? order.order_no,
    total: order.total,
    courier: order.courier_partner ?? "",
    tracking: order.tracking_id ?? "",
    store: lang === "bn" ? BRAND.name.bn : BRAND.name.en,
  });
  const jobs: Promise<unknown>[] = [];
  if (channels.sms) jobs.push(sendSms(env, order.customer_phone, message, key, order.id));
  if (channels.whatsapp) jobs.push(sendWhatsApp(env, order.customer_phone, message, key, order.id));
  if (channels.email && order.customer_email) {
    const subject = lang === "bn" ? `${BRAND.name.bn} — অর্ডার ${order.order_no}` : `${BRAND.name.en} — Order ${order.order_no}`;
    const link = `\n\n${lang === "bn" ? "অর্ডার দেখুন" : "View your order"}: https://${BRAND.domain}/track?order=${order.order_no}`;
    jobs.push(sendEmail(env, order.customer_email, subject, message + link, key, order.id));
  }
  await Promise.allSettled(jobs);
}
