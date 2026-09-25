import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "./env";
import { E } from "./lib/http";
import { can, type Permission } from "./lib/rbac";
import { ADMIN_COOKIE, CUSTOMER_COOKIE, readAdminSession, readCustomerSession } from "./lib/store";

/** Security headers for every Worker-generated response (static assets get the same via dist/_headers). */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  if (c.env.ENVIRONMENT === "production") h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  if (c.req.path.startsWith("/api/") && !h.has("Cache-Control")) h.set("Cache-Control", "no-store");
};

/** Paths that receive POSTs from payment gateways / couriers (they authenticate differently). */
const CSRF_EXEMPT = [/^\/api\/payments\//, /^\/api\/webhooks\//];

/**
 * CSRF defence for cookie-authenticated APIs: state-changing requests must come from our own origin
 * and carry the X-Requested-With header that our fetch wrapper adds (cross-site forms cannot set it).
 */
export const csrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  const m = c.req.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS" || CSRF_EXEMPT.some((r) => r.test(c.req.path))) return next();
  const origin = c.req.header("origin");
  const self = new URL(c.req.url).origin;
  if (origin && origin !== self) throw E.forbidden();
  if (c.req.header("x-requested-with") !== "fetch") throw E.forbidden();
  return next();
};

/** Attaches language preference from ?lang= or the lks_lang cookie. */
export const language: MiddlewareHandler<AppEnv> = async (c, next) => {
  const q = c.req.query("lang");
  const ck = getCookie(c, "lks_lang");
  c.set("lang", q === "en" || q === "bn" ? q : ck === "en" ? "en" : "bn");
  return next();
};

export const optionalCustomer: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await readCustomerSession(c.env, getCookie(c, CUSTOMER_COOKIE));
  if (s) c.set("customer", s);
  return next();
};

export const requireCustomer: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await readCustomerSession(c.env, getCookie(c, CUSTOMER_COOKIE));
  if (!s) throw E.unauthorized();
  c.set("customer", s);
  return next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await readAdminSession(c.env, getCookie(c, ADMIN_COOKIE));
  if (!s) throw E.unauthorized();
  c.set("admin", s);
  return next();
};

/** Route-level permission check. The admin UI also hides actions, but this is the real gate. */
export const perm =
  (p: Permission): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const a = c.get("admin");
    if (!a) throw E.unauthorized();
    if (!can(a.role, p)) throw E.forbidden();
    return next();
  };
