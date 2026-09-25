/** Admin sign-in, sign-out, profile, and one-time bootstrap of the first Super Admin. */
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv, Role } from "../../env";
import { ApiError, body, clientIp, E } from "../../lib/http";
import { adminLoginId, adminLoginSchema } from "../../lib/schemas";
import { hashPassword, randomToken, safeEqualStr, verifyPassword } from "../../lib/crypto";
import { ADMIN_COOKIE, ADMIN_TTL, audit, getSetting, rateLimit, verifyTurnstile } from "../../lib/store";
import { ROLE_MATRIX } from "../../lib/rbac";
import { requireAdmin } from "../../middleware";
import { sendSms } from "../../lib/notify";

const app = new Hono<AppEnv>();

app.post("/login", async (c) => {
  await rateLimit(c, "admin-login", 10, 900);
  const b = await body(c, adminLoginSchema);
  await verifyTurnstile(c, b.turnstileToken);
  const a = await c.env.DB.prepare("SELECT id, name, email, role, password_hash, is_active FROM admins WHERE email = ? AND deleted_at IS NULL")
    .bind(b.email)
    .first<{ id: number; name: string; email: string; role: Role; password_hash: string; is_active: number }>();
  const ok = a && a.is_active && (await verifyPassword(b.password, a.password_hash));
  if (!ok) {
    // Detect: log every failure; alert the owner after repeated failures from one IP.
    await c.env.DB.prepare("INSERT INTO audit_log (admin_id, admin_name, action, entity, entity_id, details, ip) VALUES (NULL, ?, 'login_failed', 'admin', NULL, NULL, ?)")
      .bind(b.email, clientIp(c))
      .run();
    const key = `fail:admin:${clientIp(c)}`;
    const n = Number((await c.env.KV.get(key)) ?? "0") + 1;
    await c.env.KV.put(key, String(n), { expirationTtl: 3600 });
    if (n === 5) {
      const cfg = await getSetting<{ ownerPhone?: string }>(c.env, "notifications", {});
      if (cfg.ownerPhone) c.executionCtx.waitUntil(sendSms(c.env, cfg.ownerPhone, `Security alert: 5 failed admin sign-ins from IP ${clientIp(c)} (last tried: ${b.email}).`, "security"));
    }
    throw new ApiError(401, "bad_credentials", "Username/email or password is incorrect.", "ইউজারনেম/ইমেইল বা পাসওয়ার্ড সঠিক নয়।");
  }
  const token = randomToken();
  const session = { id: a.id, name: a.name, email: a.email, role: a.role };
  await c.env.KV.put(`s:a:${token}`, JSON.stringify(session), { expirationTtl: ADMIN_TTL });
  setCookie(c, ADMIN_COOKIE, token, { httpOnly: true, secure: c.env.ENVIRONMENT !== "development", sameSite: "Strict", path: "/", maxAge: ADMIN_TTL });
  await c.env.DB.prepare("UPDATE admins SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(a.id).run();
  c.set("admin", session);
  await audit(c, "login", "admin", a.id);
  return c.json({ admin: session, permissions: ROLE_MATRIX[a.role] });
});

app.post("/logout", async (c) => {
  const token = getCookie(c, ADMIN_COOKIE);
  if (token) await c.env.KV.delete(`s:a:${token}`);
  deleteCookie(c, ADMIN_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/me", requireAdmin, async (c) => {
  const a = c.get("admin")!;
  return c.json({ admin: a, permissions: ROLE_MATRIX[a.role] });
});

app.put("/me", requireAdmin, async (c) => {
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(80), phone: z.string().max(20).optional(), currentPassword: z.string().optional(), newPassword: z.string().min(10).max(128).optional() }));
  const a = c.get("admin")!;
  if (b.newPassword) {
    const row = await c.env.DB.prepare("SELECT password_hash FROM admins WHERE id = ?").bind(a.id).first<{ password_hash: string }>();
    if (!(await verifyPassword(b.currentPassword ?? "", row?.password_hash))) throw E.badRequest("Current password is incorrect.", "বর্তমান পাসওয়ার্ড সঠিক নয়।");
    await c.env.DB.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").bind(await hashPassword(b.newPassword), a.id).run();
  }
  await c.env.DB.prepare("UPDATE admins SET name = ?, phone = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(b.name, b.phone ?? null, a.id).run();
  const token = getCookie(c, ADMIN_COOKIE)!;
  await c.env.KV.put(`s:a:${token}`, JSON.stringify({ ...a, name: b.name }), { expirationTtl: ADMIN_TTL });
  await audit(c, "update", "profile", a.id, { passwordChanged: Boolean(b.newPassword) });
  return c.json({ ok: true, en: "Profile saved.", bn: "প্রোফাইল সংরক্ষণ করা হয়েছে।" });
});

/** Creates the first Super Admin. Works only while the admins table is empty and BOOTSTRAP_TOKEN matches. */
app.post("/bootstrap", async (c) => {
  await rateLimit(c, "bootstrap", 5, 3600);
  const b = await body(c, z.object({ token: z.string().min(16), name: z.string().trim().min(1).max(80), email: adminLoginId, password: z.string().min(10).max(128) }));
  if (!c.env.BOOTSTRAP_TOKEN || !safeEqualStr(b.token, c.env.BOOTSTRAP_TOKEN)) throw E.forbidden();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first<{ n: number }>();
  if ((n?.n ?? 0) > 0) throw E.conflict("An admin already exists. Sign in instead.", "অ্যাডমিন আগেই তৈরি করা আছে। সাইন ইন করুন।");
  await c.env.DB.prepare("INSERT INTO admins (name, email, password_hash, role) VALUES (?, ?, ?, 'super_admin')").bind(b.name, b.email, await hashPassword(b.password)).run();
  return c.json({ ok: true, en: "Super Admin created. You can now sign in. Remove BOOTSTRAP_TOKEN.", bn: "সুপার অ্যাডমিন তৈরি হয়েছে। এখন সাইন ইন করুন।" }, 201);
});

export default app;
