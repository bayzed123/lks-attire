/**
 * Payment integrations.
 *
 *  COD          — default. Order is created with payment_status "pending"; becomes "paid" when delivered.
 *  bKash/Nagad/Rocket "manual" mode — customer sends money to the shop's number and types the TrxID at
 *               checkout; staff verify it in the admin (Orders → Mark as paid). Works on day one, no API keys.
 *  bKash "api" mode — bKash Tokenized Checkout: grant token → create payment → redirect → callback → execute.
 *  Card         — SSLCommerz hosted payment page (also supports bKash/Nagad/Rocket inside it). We never touch
 *               card numbers, which keeps PCI scope minimal (SAQ-A style redirect).
 *  Nagad "api"  — requires RSA-signed merchant requests; left as a documented stub until merchant keys exist.
 */
import type { Env } from "../env";

export interface PaymentOrder {
  order_no: string;
  public_token: string;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  area: string;
  district: string;
  item_count: number;
}

export interface InitiateResult {
  redirectUrl: string;
  gatewayRef?: string;
}

// ---------------- bKash Tokenized Checkout ----------------
export function bkashConfigured(env: Env): boolean {
  return Boolean(env.BKASH_APP_KEY && env.BKASH_APP_SECRET && env.BKASH_USERNAME && env.BKASH_PASSWORD);
}

function bkashBase(env: Env): string {
  return env.BKASH_BASE_URL || "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
}

async function bkashToken(env: Env): Promise<string> {
  const cached = await env.KV.get("bkash:id_token");
  if (cached) return cached;
  const res = await fetch(`${bkashBase(env)}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", username: env.BKASH_USERNAME!, password: env.BKASH_PASSWORD! },
    body: JSON.stringify({ app_key: env.BKASH_APP_KEY, app_secret: env.BKASH_APP_SECRET }),
  });
  const data = (await res.json()) as { id_token?: string; expires_in?: number; statusMessage?: string };
  if (!data.id_token) throw new Error(`bKash token grant failed: ${data.statusMessage ?? res.status}`);
  // Token lives 3600s; refresh a bit early.
  await env.KV.put("bkash:id_token", data.id_token, { expirationTtl: Math.max(60, (data.expires_in ?? 3600) - 300) });
  return data.id_token;
}

async function bkashCall<T>(env: Env, path: string, payload: unknown): Promise<T> {
  const token = await bkashToken(env);
  const res = await fetch(`${bkashBase(env)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", authorization: token, "x-app-key": env.BKASH_APP_KEY! },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as T;
}

export async function bkashCreate(env: Env, order: PaymentOrder, publicUrl: string): Promise<InitiateResult> {
  const data = await bkashCall<{ bkashURL?: string; paymentID?: string; statusMessage?: string }>(env, "/tokenized/checkout/create", {
    mode: "0011",
    payerReference: order.customer_phone,
    callbackURL: `${publicUrl}/api/payments/bkash/callback`,
    amount: order.total.toFixed(2),
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: order.order_no,
  });
  if (!data.bkashURL || !data.paymentID) throw new Error(`bKash create failed: ${data.statusMessage ?? "unknown"}`);
  return { redirectUrl: data.bkashURL, gatewayRef: data.paymentID };
}

export async function bkashExecute(env: Env, paymentID: string): Promise<{ ok: boolean; trxID?: string; invoice?: string; amount?: number; message?: string }> {
  const data = await bkashCall<{ transactionStatus?: string; trxID?: string; merchantInvoiceNumber?: string; amount?: string; statusMessage?: string }>(
    env,
    "/tokenized/checkout/execute",
    { paymentID },
  );
  return {
    ok: data.transactionStatus === "Completed",
    trxID: data.trxID,
    invoice: data.merchantInvoiceNumber,
    amount: data.amount ? Number(data.amount) : undefined,
    message: data.statusMessage,
  };
}

// ---------------- SSLCommerz (cards + MFS inside hosted page) ----------------
export function sslczConfigured(env: Env): boolean {
  return Boolean(env.SSLCZ_STORE_ID && env.SSLCZ_STORE_PASSWD);
}

function sslczBase(env: Env): string {
  return env.SSLCZ_SANDBOX === "false" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";
}

export async function sslczInitiate(env: Env, order: PaymentOrder, publicUrl: string): Promise<InitiateResult> {
  const cb = `${publicUrl}/api/payments/sslcommerz`;
  const form = new URLSearchParams({
    store_id: env.SSLCZ_STORE_ID!,
    store_passwd: env.SSLCZ_STORE_PASSWD!,
    total_amount: order.total.toFixed(2),
    currency: "BDT",
    tran_id: order.order_no,
    success_url: `${cb}/return?result=success`,
    fail_url: `${cb}/return?result=fail`,
    cancel_url: `${cb}/return?result=cancel`,
    ipn_url: `${cb}/ipn`,
    cus_name: order.customer_name,
    cus_email: order.customer_email || "no-email@example.com",
    cus_phone: order.customer_phone,
    cus_add1: order.area,
    cus_city: order.district,
    cus_country: "Bangladesh",
    shipping_method: "Courier",
    num_of_item: String(order.item_count),
    ship_name: order.customer_name,
    ship_add1: order.area,
    ship_city: order.district,
    ship_postcode: "0000",
    ship_country: "Bangladesh",
    product_name: `Order ${order.order_no}`,
    product_category: "Clothing",
    product_profile: "physical-goods",
    value_a: order.public_token,
  });
  const res = await fetch(`${sslczBase(env)}/gwprocess/v4/api.php`, { method: "POST", body: form });
  const data = (await res.json()) as { status?: string; GatewayPageURL?: string; sessionkey?: string; failedreason?: string };
  if (data.status !== "SUCCESS" || !data.GatewayPageURL) throw new Error(`SSLCommerz init failed: ${data.failedreason ?? res.status}`);
  return { redirectUrl: data.GatewayPageURL, gatewayRef: data.sessionkey };
}

/** Server-side validation of an IPN / return — never trust the browser redirect alone. */
export async function sslczValidate(env: Env, valId: string): Promise<{ ok: boolean; tranId?: string; amount?: number; bankTranId?: string }> {
  const url = `${sslczBase(env)}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(env.SSLCZ_STORE_ID!)}&store_passwd=${encodeURIComponent(env.SSLCZ_STORE_PASSWD!)}&format=json`;
  const res = await fetch(url);
  const data = (await res.json()) as { status?: string; tran_id?: string; amount?: string; bank_tran_id?: string };
  return {
    ok: data.status === "VALID" || data.status === "VALIDATED",
    tranId: data.tran_id,
    amount: data.amount ? Number(data.amount) : undefined,
    bankTranId: data.bank_tran_id,
  };
}

// ---------------- Nagad (stub) ----------------
export function nagadConfigured(env: Env): boolean {
  return Boolean(env.NAGAD_MERCHANT_ID && env.NAGAD_MERCHANT_PRIVATE_KEY && env.NAGAD_PG_PUBLIC_KEY);
}
/**
 * Nagad's merchant API needs: (1) initialize with RSA-encrypted sensitive data signed by the merchant private
 * key, (2) complete order, (3) verify via /verify/payment/{paymentRefId}. Implement once merchant onboarding is
 * done; until then Nagad runs in "manual TrxID" mode which needs no keys.
 */
export async function nagadInitiate(): Promise<InitiateResult> {
  throw new Error("Nagad API mode is not activated yet — use manual mode (Settings → Payments).");
}
