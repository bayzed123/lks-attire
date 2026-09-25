/** Admin product management — products with variants, images, CSV import/export, trash. */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../../env";
import { ApiError, E, intParam, parseJson, validate } from "../../lib/http";
import { productSchema, type ProductInput } from "../../lib/schemas";
import { perm } from "../../middleware";
import { audit, expandCategoryIds } from "../../lib/store";
import { can } from "../../lib/rbac";
import { parseCsv, toCsv } from "../../lib/csv";

const app = new Hono<AppEnv>();
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

app.get("/", perm("products.read"), async (c) => {
  const q = c.req.query();
  const where: string[] = [q.trash === "1" ? "p.deleted_at IS NOT NULL" : "p.deleted_at IS NULL"];
  const args: unknown[] = [];
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    where.push("(p.name_en LIKE ? OR p.name_bn LIKE ? OR p.sku LIKE ? OR p.slug LIKE ? OR p.tags LIKE ?)");
    args.push(like, like, like, like, like);
  }
  if (q.status) {
    where.push("p.status = ?");
    args.push(q.status);
  }
  if (q.category_id) {
    const ids = await expandCategoryIds(c.env, [Number(q.category_id)]);
    where.push(`p.category_id IN (${ids.map(() => "?").join(",")})`);
    args.push(...ids);
  }
  if (q.stock === "out") where.push("NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock > 0)");
  if (q.stock === "low") where.push("EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock <= v.low_stock_threshold)");
  const sorts: Record<string, string> = {
    newest: "p.created_at DESC",
    name: "p.name_en ASC",
    price_asc: "p.price ASC",
    price_desc: "p.price DESC",
    sold: "p.sold_count DESC",
    stock: "stock ASC",
  };
  const sort = sorts[q.sort ?? "newest"] ?? sorts.newest;
  const limit = intParam(q.limit, 20, 1, 200);
  const page = intParam(q.page, 1, 1, 100000);
  const w = where.join(" AND ");
  const [count, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${w}`).bind(...args).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT p.id, p.slug, p.sku, p.name_en, p.name_bn, p.price, p.sale_price, p.status, p.images, p.is_featured, p.sold_count, p.rating_avg, p.created_at, p.updated_at,
              c.name_en AS category_name, c.name_bn AS category_name_bn,
              (SELECT COALESCE(SUM(stock),0) FROM product_variants v WHERE v.product_id = p.id) AS stock,
              (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
              (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.stock <= v.low_stock_threshold) AS low_variants
         FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${w} ORDER BY ${sort}, p.id DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all<{ images: string }>(),
  ]);
  const total = count?.n ?? 0;
  return c.json({ items: rows.results.map((r) => ({ ...r, image: parseJson<string[]>(r.images, [])[0] ?? null, images: undefined })), total, page, pages: Math.ceil(total / limit) });
});

app.get("/:id{[0-9]+}", perm("products.read"), async (c) => {
  const id = Number(c.req.param("id"));
  const p = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<{ images: string }>();
  if (!p) throw E.notFound("Product");
  const v = await c.env.DB.prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY id").bind(id).all();
  return c.json({ item: { ...p, images: parseJson<string[]>(p.images, []), variants: v.results } });
});

function productParams(p: ProductInput) {
  return [
    p.slug, p.sku, p.name_en, p.name_bn, p.description_en, p.description_bn, p.fabric_en, p.fabric_bn, p.care_en, p.care_bn,
    p.category_id, p.price, p.sale_price ?? null, p.tags, JSON.stringify(p.images), p.status, p.is_featured, p.meta_title, p.meta_description,
  ];
}
const PRODUCT_COLS = "slug, sku, name_en, name_bn, description_en, description_bn, fabric_en, fabric_bn, care_en, care_bn, category_id, price, sale_price, tags, images, status, is_featured, meta_title, meta_description";

async function ensureCategory(c: Context<AppEnv>, id: number) {
  const cat = await c.env.DB.prepare("SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!cat) throw new ApiError(422, "validation", "Choose a category.", "একটি ক্যাটাগরি বেছে নিন।", [{ field: "category_id", en: "Choose a category.", bn: "ক্যাটাগরি বেছে নিন।" }]);
}

function slugTaken(e: unknown): never {
  if (String(e).includes("UNIQUE") && String(e).includes("slug"))
    throw new ApiError(409, "duplicate", "Another product already uses this web address (slug).", "অন্য একটি পণ্যে এই ওয়েব ঠিকানা (slug) ব্যবহৃত হয়েছে।", [{ field: "slug", en: "Already in use.", bn: "আগেই ব্যবহৃত।" }]);
  throw e;
}

app.post("/", perm("products.write"), async (c) => {
  const p = validate(productSchema, await c.req.json().catch(() => ({})));
  await ensureCategory(c, p.category_id);
  const actor = c.get("admin")!.name;
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO products (${PRODUCT_COLS}) VALUES (${PRODUCT_COLS.split(",").map(() => "?").join(",")})`).bind(...productParams(p)),
  ];
  for (const v of p.variants) {
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO product_variants (product_id, sku, size, color, color_hex, stock, price_override, low_stock_threshold) VALUES ((SELECT id FROM products WHERE slug = ?), ?, ?, ?, ?, ?, ?, ?)",
      ).bind(p.slug, v.sku, v.size, v.color, v.color_hex ?? null, v.stock, v.price_override ?? null, v.low_stock_threshold),
    );
    if (v.stock > 0)
      stmts.push(
        c.env.DB.prepare(
          "INSERT INTO inventory_log (product_id, variant_id, change, stock_after, reason, note, actor) SELECT p.id, v.id, ?, ?, 'restock', 'Initial stock', ? FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.slug = ? AND v.size = ? AND v.color = ?",
        ).bind(v.stock, v.stock, actor, p.slug, v.size, v.color),
      );
  }
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    slugTaken(e);
  }
  const row = await c.env.DB.prepare("SELECT id FROM products WHERE slug = ?").bind(p.slug).first<{ id: number }>();
  await audit(c, "create", "product", row!.id, { name: p.name_en, variants: p.variants.length });
  return c.json({ id: row!.id, en: "Product created.", bn: "পণ্য তৈরি হয়েছে।" }, 201);
});

app.put("/:id{[0-9]+}", perm("products.write"), async (c) => {
  const id = Number(c.req.param("id"));
  const p = validate(productSchema, await c.req.json().catch(() => ({})));
  await ensureCategory(c, p.category_id);
  const before = await c.env.DB.prepare("SELECT name_en, price, sale_price, status FROM products WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!before) throw E.notFound("Product");
  const existing = await c.env.DB.prepare("SELECT id, stock FROM product_variants WHERE product_id = ?").bind(id).all<{ id: number; stock: number }>();
  const existingById = new Map(existing.results.map((v) => [v.id, v]));
  const keep = new Set(p.variants.filter((v) => v.id && existingById.has(v.id)).map((v) => v.id!));
  const actor = c.get("admin")!.name;

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`UPDATE products SET ${PRODUCT_COLS.split(", ").map((k) => `${k} = ?`).join(", ")}, updated_at = ${NOW} WHERE id = ?`).bind(...productParams(p), id),
  ];
  for (const old of existing.results) if (!keep.has(old.id)) stmts.push(c.env.DB.prepare("DELETE FROM product_variants WHERE id = ?").bind(old.id));
  for (const v of p.variants) {
    const old = v.id ? existingById.get(v.id) : undefined;
    if (old) {
      stmts.push(
        c.env.DB.prepare("UPDATE product_variants SET sku=?, size=?, color=?, color_hex=?, stock=?, price_override=?, low_stock_threshold=? WHERE id = ? AND product_id = ?").bind(
          v.sku, v.size, v.color, v.color_hex ?? null, v.stock, v.price_override ?? null, v.low_stock_threshold, old.id, id,
        ),
      );
      if (old.stock !== v.stock)
        stmts.push(
          c.env.DB.prepare("INSERT INTO inventory_log (product_id, variant_id, change, stock_after, reason, note, actor) VALUES (?, ?, ?, ?, 'adjustment', 'Edited in product form', ?)").bind(
            id, old.id, v.stock - old.stock, v.stock, actor,
          ),
        );
    } else {
      stmts.push(
        c.env.DB.prepare("INSERT INTO product_variants (product_id, sku, size, color, color_hex, stock, price_override, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
          id, v.sku, v.size, v.color, v.color_hex ?? null, v.stock, v.price_override ?? null, v.low_stock_threshold,
        ),
      );
    }
  }
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    if (String(e).includes("product_variants.product_id, product_variants.size, product_variants.color"))
      throw E.conflict("Two variants have the same size and colour.", "দুটি ভ্যারিয়েন্টে একই সাইজ ও রং।");
    slugTaken(e);
  }
  await audit(c, "update", "product", id, { before, after: { name_en: p.name_en, price: p.price, sale_price: p.sale_price, status: p.status }, variants: p.variants.length });
  return c.json({ id, en: "Product saved.", bn: "পণ্য সংরক্ষণ করা হয়েছে।" });
});

app.post("/:id{[0-9]+}/duplicate", perm("products.write"), async (c) => {
  const id = Number(c.req.param("id"));
  const p = await c.env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first<Record<string, unknown> & { slug: string }>();
  if (!p) throw E.notFound("Product");
  const slug = `${p.slug}-copy-${Date.now().toString(36).slice(-4)}`;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO products (${PRODUCT_COLS}) SELECT ?, sku, name_en || ' (copy)', name_bn || ' (কপি)', description_en, description_bn, fabric_en, fabric_bn, care_en, care_bn, category_id, price, sale_price, tags, images, 'draft', 0, meta_title, meta_description FROM products WHERE id = ?`,
    ).bind(slug, id),
    c.env.DB.prepare(
      "INSERT INTO product_variants (product_id, sku, size, color, color_hex, stock, price_override, low_stock_threshold) SELECT (SELECT id FROM products WHERE slug = ?), sku, size, color, color_hex, 0, price_override, low_stock_threshold FROM product_variants WHERE product_id = ?",
    ).bind(slug, id),
  ]);
  const row = await c.env.DB.prepare("SELECT id FROM products WHERE slug = ?").bind(slug).first<{ id: number }>();
  await audit(c, "duplicate", "product", row!.id, { from: id });
  return c.json({ id: row!.id, en: "Copy created as a draft (stock set to 0).", bn: "ড্রাফট হিসেবে কপি তৈরি হয়েছে (স্টক ০)।" }, 201);
});

app.delete("/:id{[0-9]+}", perm("products.delete"), async (c) => {
  const id = Number(c.req.param("id"));
  if (c.req.query("purge") === "1") {
    if (!can(c.get("admin")!.role, "trash.purge")) throw E.forbidden();
    const r = await c.env.DB.prepare("SELECT deleted_at FROM products WHERE id = ?").bind(id).first<{ deleted_at: string | null }>();
    if (!r?.deleted_at) throw E.badRequest("Move the product to Trash first.", "আগে পণ্যটি ট্র্যাশে পাঠান।");
    await c.env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    await audit(c, "purge", "product", id);
    return c.json({ ok: true, en: "Deleted permanently.", bn: "স্থায়ীভাবে মুছে ফেলা হয়েছে।" });
  }
  const r = await c.env.DB.prepare(`UPDATE products SET deleted_at = ${NOW}, status = 'archived' WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
  if (!r.meta.changes) throw E.notFound("Product");
  await audit(c, "delete", "product", id);
  return c.json({ ok: true, en: "Moved to Trash. It is hidden from the shop.", bn: "ট্র্যাশে পাঠানো হয়েছে। দোকানে আর দেখাবে না।" });
});

app.post("/:id{[0-9]+}/restore", perm("products.delete"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE products SET deleted_at = NULL, status = 'draft' WHERE id = ?").bind(id).run();
  await audit(c, "restore", "product", id);
  return c.json({ ok: true, en: "Restored as a draft. Set it to Active to show it in the shop.", bn: "ড্রাফট হিসেবে ফিরিয়ে আনা হয়েছে। দোকানে দেখাতে 'Active' করুন।" });
});

// ---------- CSV ----------
const CSV_COLUMNS = [
  "slug", "name_en", "name_bn", "category_slug", "price", "sale_price", "status", "tags", "size", "color", "color_hex", "stock", "variant_sku",
  "description_en", "description_bn", "fabric_en", "fabric_bn", "images",
];

app.get("/export.csv", perm("products.read"), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.slug, p.name_en, p.name_bn, c.slug AS category_slug, p.price, p.sale_price, p.status, p.tags, v.size, v.color, v.color_hex, v.stock, v.sku AS variant_sku,
            p.description_en, p.description_bn, p.fabric_en, p.fabric_bn, p.images
       FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN product_variants v ON v.product_id = p.id
      WHERE p.deleted_at IS NULL ORDER BY p.id, v.id`,
  ).all<Record<string, unknown> & { images: string }>();
  const rows = results.map((r) => ({ ...r, images: parseJson<string[]>(r.images, []).join(" | ") }));
  await audit(c, "export", "product", null, { rows: rows.length });
  return new Response(toCsv(rows, CSV_COLUMNS), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});

/**
 * Import: one row per variant. Existing products (matched by slug) are updated; variants are matched by
 * size + colour and their stock is SET to the CSV value. Returns per-row errors in plain language.
 */
app.post("/import", perm("products.write"), async (c) => {
  const text = await c.req.text();
  if (text.length > 2_000_000) throw E.badRequest("File is too large (max 2 MB).", "ফাইলটি অনেক বড় (সর্বোচ্চ ২ MB)।");
  const rows = parseCsv(text);
  if (!rows.length) throw E.badRequest("The file is empty.", "ফাইলটি খালি।");
  const missing = ["slug", "name_en", "name_bn", "category_slug", "price", "size", "color", "stock"].filter((k) => !(k in rows[0]!));
  if (missing.length) throw E.badRequest(`Missing columns: ${missing.join(", ")}`, `এই কলামগুলো নেই: ${missing.join(", ")}`);

  const cats = await c.env.DB.prepare("SELECT id, slug FROM categories WHERE deleted_at IS NULL").all<{ id: number; slug: string }>();
  const catBySlug = new Map(cats.results.map((x) => [x.slug, x.id]));
  const errors: { row: number; en: string; bn: string }[] = [];
  const groups = new Map<string, { row: number; data: Record<string, string> }[]>();
  rows.forEach((r, i) => {
    const line = i + 2;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug ?? "")) return errors.push({ row: line, en: "Invalid slug", bn: "slug সঠিক নয়" });
    if (!catBySlug.has(r.category_slug ?? "")) return errors.push({ row: line, en: `Unknown category "${r.category_slug}"`, bn: `ক্যাটাগরি "${r.category_slug}" পাওয়া যায়নি` });
    if (!(Number(r.price) > 0)) return errors.push({ row: line, en: "Price must be a number above 0", bn: "দাম ০ এর বেশি সংখ্যা হতে হবে" });
    if (!Number.isInteger(Number(r.stock)) || Number(r.stock) < 0) return errors.push({ row: line, en: "Stock must be a whole number", bn: "স্টক পূর্ণসংখ্যা হতে হবে" });
    if (!r.name_en || !r.name_bn || !r.size || !r.color) return errors.push({ row: line, en: "Name (EN/BN), size and colour are required", bn: "নাম (ইংরেজি/বাংলা), সাইজ ও রং আবশ্যক" });
    const g = groups.get(r.slug!) ?? [];
    g.push({ row: line, data: r });
    groups.set(r.slug!, g);
  });
  if (errors.length) return c.json({ imported: 0, errors }, 422);

  const actor = c.get("admin")!.name;
  const stmts: D1PreparedStatement[] = [];
  for (const [slug, list] of groups) {
    const f = list[0]!.data;
    const images = (f.images ?? "").split("|").map((s) => s.trim()).filter(Boolean);
    const sale = f.sale_price ? Number(f.sale_price) : null;
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO products (slug, name_en, name_bn, category_id, price, sale_price, status, tags, description_en, description_bn, fabric_en, fabric_bn, images)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET name_en=excluded.name_en, name_bn=excluded.name_bn, category_id=excluded.category_id, price=excluded.price,
           sale_price=excluded.sale_price, status=excluded.status, tags=excluded.tags, description_en=COALESCE(excluded.description_en, description_en),
           description_bn=COALESCE(excluded.description_bn, description_bn), fabric_en=COALESCE(excluded.fabric_en, fabric_en), fabric_bn=COALESCE(excluded.fabric_bn, fabric_bn),
           images=CASE WHEN excluded.images = '[]' THEN images ELSE excluded.images END, updated_at=${NOW}`,
      ).bind(
        slug, f.name_en, f.name_bn, catBySlug.get(f.category_slug!), Number(f.price), sale && sale < Number(f.price) ? sale : null,
        ["draft", "active", "archived"].includes(f.status ?? "") ? f.status : "draft", f.tags ?? "",
        f.description_en || null, f.description_bn || null, f.fabric_en || null, f.fabric_bn || null, JSON.stringify(images),
      ),
    );
    for (const { data: v } of list) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO product_variants (product_id, sku, size, color, color_hex, stock) VALUES ((SELECT id FROM products WHERE slug = ?), ?, ?, ?, ?, ?)
           ON CONFLICT(product_id, size, color) DO UPDATE SET stock = excluded.stock, sku = COALESCE(excluded.sku, sku), color_hex = COALESCE(excluded.color_hex, color_hex)`,
        ).bind(slug, v.variant_sku || null, v.size, v.color, /^#[0-9a-fA-F]{6}$/.test(v.color_hex ?? "") ? v.color_hex : null, Number(v.stock)),
      );
      stmts.push(
        c.env.DB.prepare(
          "INSERT INTO inventory_log (product_id, variant_id, change, stock_after, reason, note, actor) SELECT p.id, v.id, 0, v.stock, 'import', 'CSV import (stock set)', ? FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.slug = ? AND v.size = ? AND v.color = ?",
        ).bind(actor, slug, v.size, v.color),
      );
    }
  }
  await c.env.DB.batch(stmts);
  await audit(c, "import", "product", null, { products: groups.size, rows: rows.length });
  return c.json({ imported: groups.size, rows: rows.length, errors: [], en: `${groups.size} product(s) imported.`, bn: `${groups.size}টি পণ্য ইমপোর্ট হয়েছে।` });
});

export default app;
