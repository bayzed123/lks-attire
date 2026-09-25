/**
 * Generic, schema-driven CRUD for simple admin resources. Each resource declares its table, validation
 * schema, searchable columns and filters once; list / read / create / update / soft-delete / restore /
 * purge endpoints, permission checks and audit logging come for free.
 *
 * Table and column names only ever come from these definitions — never from the request — so the
 * dynamic SQL below is safe; all values are bound parameters.
 */
import { Hono, type Context } from "hono";
import type { ZodType } from "zod";
import type { AppEnv } from "../../env";
import { ApiError, E, intParam, parseJson, validate } from "../../lib/http";
import { perm } from "../../middleware";
import { audit } from "../../lib/store";
import { can, type Permission } from "../../lib/rbac";
import { hashPassword } from "../../lib/crypto";
import { bannerSchema, categorySchema, couponSchema, customerSchema, reviewModerationSchema, staffSchema, zoneSchema } from "../../lib/schemas";

type Row = Record<string, unknown>;

export interface Resource {
  table: string;
  entity: string;
  perm: "categories" | "customers" | "coupons" | "banners" | "reviews" | "zones" | "staff";
  schema: ZodType<Row>;
  updateSchema?: ZodType<Row>;
  select?: string; // extra computed columns
  search: string[];
  filters: Record<string, string>; // query param → column (exact match)
  sorts: string[];
  defaultSort: string;
  jsonCols?: string[];
  hidden?: string[];
  prepare?: (c: Context<AppEnv>, data: Row, id: number | null) => Promise<Row>;
  afterWrite?: (c: Context<AppEnv>, id: number, data: Row) => Promise<void>;
  beforeDelete?: (c: Context<AppEnv>, id: number) => Promise<void>;
  detail?: (c: Context<AppEnv>, row: Row) => Promise<Row>;
}

const recomputeRating = async (c: Context<AppEnv>, reviewId: number) => {
  await c.env.DB.prepare(
    `UPDATE products SET
       rating_avg = COALESCE((SELECT AVG(rating) FROM reviews WHERE product_id = products.id AND status = 'approved' AND deleted_at IS NULL), 0),
       rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = products.id AND status = 'approved' AND deleted_at IS NULL)
     WHERE id = (SELECT product_id FROM reviews WHERE id = ?)`,
  )
    .bind(reviewId)
    .run();
};

export const RESOURCES: Record<string, Resource> = {
  categories: {
    table: "categories",
    entity: "category",
    perm: "categories",
    schema: categorySchema as unknown as ZodType<Row>,
    select: "(SELECT COUNT(*) FROM products p WHERE p.category_id = t.id AND p.deleted_at IS NULL) AS product_count, (SELECT name_en FROM categories x WHERE x.id = t.parent_id) AS parent_name",
    search: ["name_en", "name_bn", "slug"],
    filters: { parent_id: "parent_id", is_active: "is_active" },
    sorts: ["sort_order", "name_en", "created_at"],
    defaultSort: "sort_order",
    prepare: async (c, d, id) => {
      if (id && d.parent_id === id) throw E.badRequest("A category cannot be its own parent.", "একটি ক্যাটাগরি নিজের প্যারেন্ট হতে পারে না।");
      return d;
    },
    beforeDelete: async (c, id) => {
      const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE category_id = ? AND deleted_at IS NULL").bind(id).first<{ n: number }>();
      if (n?.n) throw E.conflict(`Move the ${n.n} product(s) in this category first.`, `আগে এই ক্যাটাগরির ${n.n}টি পণ্য অন্য ক্যাটাগরিতে সরান।`);
    },
  },
  customers: {
    table: "customers",
    entity: "customer",
    perm: "customers",
    schema: customerSchema as unknown as ZodType<Row>,
    select:
      "(SELECT COUNT(*) FROM orders o WHERE o.customer_phone = t.phone AND o.deleted_at IS NULL) AS order_count, (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.customer_phone = t.phone AND o.status NOT IN ('cancelled','returned') AND o.deleted_at IS NULL) AS total_spent, CASE WHEN t.password_hash IS NULL THEN 0 ELSE 1 END AS has_account",
    search: ["name", "phone", "email"],
    filters: { is_blocked: "is_blocked" },
    sorts: ["created_at", "name", "last_login_at"],
    defaultSort: "-created_at",
    hidden: ["password_hash"],
    detail: async (c, row) => {
      const [orders, addresses] = await Promise.all([
        c.env.DB.prepare("SELECT id, order_no, status, total, payment_method, created_at FROM orders WHERE customer_phone = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50").bind(row.phone).all(),
        c.env.DB.prepare("SELECT * FROM addresses WHERE customer_id = ?").bind(row.id).all(),
      ]);
      return { ...row, orders: orders.results, addresses: addresses.results };
    },
  },
  coupons: {
    table: "coupons",
    entity: "coupon",
    perm: "coupons",
    schema: couponSchema as unknown as ZodType<Row>,
    search: ["code", "description"],
    filters: { type: "type", is_active: "is_active" },
    sorts: ["created_at", "code", "expires_at", "used_count"],
    defaultSort: "-created_at",
    jsonCols: ["category_ids"],
  },
  banners: {
    table: "banners",
    entity: "banner",
    perm: "banners",
    schema: bannerSchema as unknown as ZodType<Row>,
    search: ["title_en", "title_bn"],
    filters: { placement: "placement", is_active: "is_active" },
    sorts: ["sort_order", "created_at", "starts_at"],
    defaultSort: "sort_order",
  },
  reviews: {
    table: "reviews",
    entity: "review",
    perm: "reviews",
    schema: reviewModerationSchema.required({ product_id: true, name: true, rating: true, body: true }) as unknown as ZodType<Row>,
    updateSchema: reviewModerationSchema as unknown as ZodType<Row>,
    select: "(SELECT name_en FROM products p WHERE p.id = t.product_id) AS product_name, (SELECT slug FROM products p WHERE p.id = t.product_id) AS product_slug",
    search: ["name", "body"],
    filters: { status: "status", product_id: "product_id", rating: "rating" },
    sorts: ["created_at", "rating"],
    defaultSort: "-created_at",
    prepare: async (c, d) => (d.reply ? { ...d, replied_at: new Date().toISOString() } : d),
    afterWrite: (c, id) => recomputeRating(c, id),
  },
  zones: {
    table: "delivery_zones",
    entity: "delivery_zone",
    perm: "zones",
    schema: zoneSchema as unknown as ZodType<Row>,
    search: ["name_en", "name_bn", "code"],
    filters: {},
    sorts: ["sort_order", "fee"],
    defaultSort: "sort_order",
    jsonCols: ["district_ids", "upazila_ids"],
    prepare: async (c, d, id) => {
      if (d.is_default) await c.env.DB.prepare("UPDATE delivery_zones SET is_default = 0 WHERE id != ?").bind(id ?? 0).run();
      return d;
    },
    afterWrite: async (c) => {
      await c.env.KV.delete("setting:zones");
    },
  },
  staff: {
    table: "admins",
    entity: "staff",
    perm: "staff",
    schema: staffSchema as unknown as ZodType<Row>,
    search: ["name", "email"],
    filters: { role: "role", is_active: "is_active" },
    sorts: ["created_at", "name", "last_login_at"],
    defaultSort: "name",
    hidden: ["password_hash"],
    prepare: async (c, d, id) => {
      const { password, ...rest } = d as Row & { password?: string };
      if (!id && !password) throw new ApiError(422, "validation", "Set a password (at least 10 characters).", "পাসওয়ার্ড দিন (কমপক্ষে ১০ অক্ষর)।", [{ field: "password", en: "Required for new staff.", bn: "নতুন স্টাফের জন্য আবশ্যক।" }]);
      const me = c.get("admin")!;
      if (id === me.id && (rest.role !== me.role || !rest.is_active)) throw E.badRequest("You cannot change your own role or deactivate yourself.", "নিজের রোল পরিবর্তন বা নিজেকে নিষ্ক্রিয় করা যাবে না।");
      return password ? { ...rest, password_hash: await hashPassword(password) } : rest;
    },
    beforeDelete: async (c, id) => {
      if (id === c.get("admin")!.id) throw E.badRequest("You cannot delete your own account.", "নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না।");
      const r = await c.env.DB.prepare("SELECT role FROM admins WHERE id = ?").bind(id).first<{ role: string }>();
      if (r?.role === "super_admin") {
        const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM admins WHERE role='super_admin' AND deleted_at IS NULL AND is_active = 1").first<{ n: number }>();
        if ((n?.n ?? 0) <= 1) throw E.badRequest("At least one Super Admin must remain.", "কমপক্ষে একজন সুপার অ্যাডমিন থাকতে হবে।");
      }
    },
  },
};

function shape(res: Resource, row: Row): Row {
  const out: Row = { ...row };
  for (const h of res.hidden ?? []) delete out[h];
  for (const j of res.jsonCols ?? []) out[j] = parseJson(out[j] as string, []);
  return out;
}

function toDb(res: Resource, data: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) out[k] = (res.jsonCols ?? []).includes(k) ? JSON.stringify(v ?? []) : v === undefined ? null : v;
  return out;
}

function uniqueError(e: unknown): never {
  const msg = String(e);
  if (msg.includes("UNIQUE")) {
    const col = /UNIQUE constraint failed: \w+\.(\w+)/.exec(msg)?.[1] ?? "value";
    throw new ApiError(409, "duplicate", `This ${col} is already used. Please choose another.`, "এই তথ্যটি আগেই ব্যবহার করা হয়েছে। অন্য একটি দিন।", [
      { field: col, en: "Already in use.", bn: "আগেই ব্যবহৃত।" },
    ]);
  }
  throw e;
}

export function crudRouter(key: string, res: Resource) {
  const r = new Hono<AppEnv>();
  const P = (a: "read" | "write" | "delete" | "manage" | "moderate") => perm(`${res.perm}.${a}` as Permission);
  const writePerm = res.perm === "staff" ? P("manage") : res.perm === "reviews" ? P("moderate") : P("write");
  const deletePerm = res.perm === "staff" ? P("manage") : P("delete");

  r.get("/", P("read"), async (c) => {
    const q = c.req.query();
    const where: string[] = [q.trash === "1" ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL"];
    const args: unknown[] = [];
    if (q.q && res.search.length) {
      where.push(`(${res.search.map((s) => `t.${s} LIKE ?`).join(" OR ")})`);
      res.search.forEach(() => args.push(`%${q.q!.replace(/[%_]/g, "")}%`));
    }
    for (const [param, col] of Object.entries(res.filters)) {
      if (q[param] !== undefined && q[param] !== "") {
        if (q[param] === "null") where.push(`t.${col} IS NULL`);
        else {
          where.push(`t.${col} = ?`);
          args.push(q[param]);
        }
      }
    }
    const sortKey = (q.sort ?? res.defaultSort).replace(/^-/, "");
    const dir = (q.sort ?? res.defaultSort).startsWith("-") ? "DESC" : "ASC";
    const sort = res.sorts.includes(sortKey) ? `t.${sortKey} ${dir}` : `t.id DESC`;
    const limit = intParam(q.limit, 20, 1, 200);
    const page = intParam(q.page, 1, 1, 100000);
    const w = where.join(" AND ");
    const [count, rows] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${res.table} t WHERE ${w}`).bind(...args).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT t.*${res.select ? ", " + res.select : ""} FROM ${res.table} t WHERE ${w} ORDER BY ${sort}, t.id DESC LIMIT ? OFFSET ?`)
        .bind(...args, limit, (page - 1) * limit)
        .all<Row>(),
    ]);
    const total = count?.n ?? 0;
    return c.json({ items: rows.results.map((x) => shape(res, x)), total, page, pages: Math.ceil(total / limit) });
  });

  r.get("/:id{[0-9]+}", P("read"), async (c) => {
    const row = await c.env.DB.prepare(`SELECT t.*${res.select ? ", " + res.select : ""} FROM ${res.table} t WHERE t.id = ?`).bind(Number(c.req.param("id"))).first<Row>();
    if (!row) throw E.notFound();
    const shaped = shape(res, row);
    return c.json({ item: res.detail ? await res.detail(c, shaped) : shaped });
  });

  r.post("/", writePerm, async (c) => {
    let data = validate(res.schema, await c.req.json().catch(() => ({})));
    if (res.prepare) data = await res.prepare(c, data, null);
    const cols = toDb(res, data);
    const keys = Object.keys(cols);
    let id: number;
    try {
      const out = await c.env.DB.prepare(`INSERT INTO ${res.table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
        .bind(...keys.map((k) => cols[k]))
        .run();
      id = Number(out.meta.last_row_id);
    } catch (e) {
      uniqueError(e);
    }
    await res.afterWrite?.(c, id, data);
    await audit(c, "create", res.entity, id, redact(data));
    return c.json({ id, en: "Saved successfully.", bn: "সফলভাবে সংরক্ষণ করা হয়েছে।" }, 201);
  });

  r.put("/:id{[0-9]+}", writePerm, async (c) => {
    const id = Number(c.req.param("id"));
    const before = await c.env.DB.prepare(`SELECT * FROM ${res.table} WHERE id = ?`).bind(id).first<Row>();
    if (!before) throw E.notFound();
    let data = validate(res.updateSchema ?? res.schema, await c.req.json().catch(() => ({})));
    if (res.prepare) data = await res.prepare(c, data, id);
    const cols = toDb(res, data);
    const keys = Object.keys(cols).filter((k) => cols[k] !== undefined);
    if (!keys.length) return c.json({ id });
    try {
      await c.env.DB.prepare(`UPDATE ${res.table} SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(...keys.map((k) => cols[k]), id)
        .run();
    } catch (e) {
      uniqueError(e);
    }
    await res.afterWrite?.(c, id, data);
    const changed = Object.fromEntries(keys.filter((k) => String(before[k] ?? "") !== String(cols[k] ?? "")).map((k) => [k, { from: before[k], to: cols[k] }]));
    await audit(c, "update", res.entity, id, redact(changed));
    return c.json({ id, en: "Changes saved.", bn: "পরিবর্তন সংরক্ষণ করা হয়েছে।" });
  });

  r.delete("/:id{[0-9]+}", deletePerm, async (c) => {
    const id = Number(c.req.param("id"));
    const purge = c.req.query("purge") === "1";
    if (purge) {
      if (!can(c.get("admin")!.role, "trash.purge")) throw E.forbidden();
      const row = await c.env.DB.prepare(`SELECT deleted_at FROM ${res.table} WHERE id = ?`).bind(id).first<{ deleted_at: string | null }>();
      if (!row) throw E.notFound();
      if (!row.deleted_at) throw E.badRequest("Move the item to Trash first.", "আগে আইটেমটি ট্র্যাশে পাঠান।");
      await c.env.DB.prepare(`DELETE FROM ${res.table} WHERE id = ?`).bind(id).run();
      await audit(c, "purge", res.entity, id);
      return c.json({ ok: true, en: "Deleted permanently.", bn: "স্থায়ীভাবে মুছে ফেলা হয়েছে।" });
    }
    await res.beforeDelete?.(c, id);
    const out = await c.env.DB.prepare(`UPDATE ${res.table} SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    if (!out.meta.changes) throw E.notFound();
    if (res.perm === "reviews") await recomputeRating(c, id);
    await audit(c, "delete", res.entity, id);
    return c.json({ ok: true, en: "Moved to Trash. You can restore it from the Trash tab.", bn: "ট্র্যাশে পাঠানো হয়েছে। ট্র্যাশ ট্যাব থেকে ফিরিয়ে আনা যাবে।" });
  });

  r.post("/:id{[0-9]+}/restore", deletePerm, async (c) => {
    const id = Number(c.req.param("id"));
    const out = await c.env.DB.prepare(`UPDATE ${res.table} SET deleted_at = NULL WHERE id = ?`).bind(id).run();
    if (!out.meta.changes) throw E.notFound();
    if (res.perm === "reviews") await recomputeRating(c, id);
    await audit(c, "restore", res.entity, id);
    return c.json({ ok: true, en: "Restored.", bn: "ফিরিয়ে আনা হয়েছে।" });
  });

  void key;
  return r;
}

function redact(d: Row): Row {
  const out = { ...d };
  for (const k of Object.keys(out)) if (/password/.test(k)) out[k] = "••••";
  return out;
}
