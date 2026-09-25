/** Cloudflare bindings + secrets. Secrets are set with `wrangler secret put NAME` — never committed. */
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  /** R2 bucket for photos. Optional: when R2 isn't enabled on the account, uploads fall back to KV. */
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  AI?: Ai;

  ENVIRONMENT: string; // "development" | "production"
  PUBLIC_URL: string; // e.g. https://lksattire.com

  /** One-time token that allows creating the first Super Admin through /api/admin/auth/bootstrap. */
  BOOTSTRAP_TOKEN?: string;

  // Payments
  BKASH_APP_KEY?: string;
  BKASH_APP_SECRET?: string;
  BKASH_USERNAME?: string;
  BKASH_PASSWORD?: string;
  BKASH_BASE_URL?: string; // sandbox: https://tokenized.sandbox.bka.sh/v1.2.0-beta
  NAGAD_MERCHANT_ID?: string;
  NAGAD_MERCHANT_PRIVATE_KEY?: string;
  NAGAD_PG_PUBLIC_KEY?: string;
  SSLCZ_STORE_ID?: string;
  SSLCZ_STORE_PASSWD?: string;
  SSLCZ_SANDBOX?: string; // "true" | "false"

  // Couriers
  STEADFAST_API_KEY?: string;
  STEADFAST_SECRET_KEY?: string;
  STEADFAST_WEBHOOK_TOKEN?: string;
  PATHAO_CLIENT_ID?: string;
  PATHAO_CLIENT_SECRET?: string;
  REDX_API_TOKEN?: string;

  // Notifications
  SMS_API_URL?: string;
  SMS_API_KEY?: string;
  SMS_SENDER_ID?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_ID?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // Bot protection
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
}

export type Role = "super_admin" | "manager" | "order_processor" | "viewer";

export interface AdminSession {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface CustomerSession {
  id: number;
  name: string;
  phone: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    admin?: AdminSession;
    customer?: CustomerSession;
    lang: "bn" | "en";
  };
};
