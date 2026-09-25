/**
 * SEO & media: sitemap.xml, server-side meta/Open Graph/JSON-LD injection for product and category
 * pages (so WhatsApp/Facebook link previews and Google see real content), and R2 image delivery.
 */
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { parseJson } from "../lib/http";
import { BRAND } from "../brand.generated";

const app = new Hono<AppEnv>();
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function origin(c: { env: AppEnv["Bindings"]; req: { url: string } }): string {
  return c.env.PUBLIC_URL || new URL(c.req.url).origin;
}

app.get("/sitemap.xml", async (c) => {
  const base = origin(c);
  const [products, cats] = await Promise.all([
    c.env.DB.prepare("SELECT slug, updated_at FROM products WHERE status = 'active' AND deleted_at IS NULL ORDER BY id").all<{ slug: string; updated_at: string }>(),
    c.env.DB.prepare("SELECT slug, updated_at FROM categories WHERE is_active = 1 AND deleted_at IS NULL").all<{ slug: string; updated_at: string }>(),
  ]);
  const urls = [
    { loc: `${base}/`, pri: "1.0" },
    { loc: `${base}/shop`, pri: "0.9" },
    { loc: `${base}/about`, pri: "0.6" },
    ...cats.results.map((x) => ({ loc: `${base}/shop/${x.slug}`, lastmod: x.updated_at.slice(0, 10), pri: "0.8" })),
    ...products.results.map((x) => ({ loc: `${base}/product/${x.slug}`, lastmod: x.updated_at.slice(0, 10), pri: "0.7" })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls
    .map(
      (u) =>
        `  <url><loc>${esc(u.loc)}</loc>${"lastmod" in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.pri}</priority>` +
        `<xhtml:link rel="alternate" hreflang="bn" href="${esc(u.loc)}?lang=bn"/><xhtml:link rel="alternate" hreflang="en" href="${esc(u.loc)}?lang=en"/></url>`,
    )
    .join("\n")}\n</urlset>\n`;
  return c.body(xml, 200, { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" });
});

interface Meta {
  title: string;
  description: string;
  image: string;
  url: string;
  type: string;
  jsonLd: unknown[];
}

async function shell(c: { env: AppEnv["Bindings"]; req: { url: string } }, meta: Meta): Promise<Response> {
  const res = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
  const rewriter = new HTMLRewriter()
    .on("title", { element: (el) => void el.setInnerContent(meta.title) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute("content", meta.description) })
    .on('meta[property="og:title"]', { element: (el) => void el.setAttribute("content", meta.title) })
    .on('meta[property="og:description"]', { element: (el) => void el.setAttribute("content", meta.description) })
    .on('meta[property="og:image"]', { element: (el) => void el.setAttribute("content", meta.image) })
    .on('meta[property="og:url"]', { element: (el) => void el.setAttribute("content", meta.url) })
    .on('meta[property="og:type"]', { element: (el) => void el.setAttribute("content", meta.type) })
    .on('link[rel="canonical"]', { element: (el) => void el.setAttribute("href", meta.url) })
    .on("head", {
      element: (el) => {
        for (const ld of meta.jsonLd) el.append(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`, { html: true });
      },
    });
  const out = rewriter.transform(res);
  const headers = new Headers(out.headers);
  headers.set("cache-control", "public, max-age=60");
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(out.body, { status: 200, headers });
}

app.get("/product/:slug", async (c) => {
  const base = origin(c);
  const p = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.sku, p.name_en, p.name_bn, p.description_en, p.meta_title, p.meta_description, p.price, p.sale_price, p.images, p.rating_avg, p.rating_count,
            c.name_en AS category, c.slug AS category_slug, (SELECT COALESCE(SUM(stock),0) FROM product_variants v WHERE v.product_id = p.id) AS stock
       FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.status = 'active' AND p.deleted_at IS NULL`,
  )
    .bind(c.req.param("slug"))
    .first<{ id: number; slug: string; sku: string | null; name_en: string; name_bn: string; description_en: string | null; meta_title: string | null; meta_description: string | null; price: number; sale_price: number | null; images: string; rating_avg: number; rating_count: number; category: string | null; category_slug: string | null; stock: number }>();
  if (!p) return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url))); // SPA renders a friendly "not found"
  const url = `${base}/product/${p.slug}`;
  const images = parseJson<string[]>(p.images, []).map((i) => (i.startsWith("http") ? i : base + i));
  const price = p.sale_price ?? p.price;
  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name_en,
    alternateName: p.name_bn,
    image: images,
    description: p.description_en ?? p.name_en,
    sku: p.sku ?? String(p.id),
    brand: { "@type": "Brand", name: BRAND.name.en },
    category: p.category ?? undefined,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BDT",
      price,
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: BRAND.name.en },
      shippingDetails: { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "BD" } },
    },
  };
  if (p.rating_count > 0) product.aggregateRating = { "@type": "AggregateRating", ratingValue: Number(p.rating_avg.toFixed(1)), reviewCount: p.rating_count };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
      ...(p.category_slug ? [{ "@type": "ListItem", position: 2, name: p.category, item: `${base}/shop/${p.category_slug}` }] : []),
      { "@type": "ListItem", position: p.category_slug ? 3 : 2, name: p.name_en, item: url },
    ],
  };
  return shell(c, {
    title: p.meta_title || `${p.name_en} — ৳${price} | ${BRAND.name.en}`,
    description: (p.meta_description || p.description_en || `${p.name_en} (${p.name_bn}). Cash on Delivery across Bangladesh.`).slice(0, 300),
    image: images[0] ?? `${base}/assets/og-default.svg`,
    url,
    type: "product",
    jsonLd: [product, crumbs],
  });
});

app.get("/shop/:slug", async (c) => {
  const base = origin(c);
  const cat = await c.env.DB.prepare("SELECT slug, name_en, name_bn, description_en FROM categories WHERE slug = ? AND deleted_at IS NULL").bind(c.req.param("slug")).first<{ slug: string; name_en: string; name_bn: string; description_en: string | null }>();
  if (!cat) return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
  return shell(c, {
    title: `${cat.name_en} (${cat.name_bn}) | ${BRAND.name.en}`,
    description: cat.description_en ?? `Shop ${cat.name_en} at ${BRAND.name.en}, ${BRAND.location.city.en}. Cash on Delivery across Bangladesh.`,
    image: `${base}/assets/og-default.svg`,
    url: `${base}/shop/${cat.slug}`,
    type: "website",
    jsonLd: [],
  });
});

// R2 media with long-lived caching (object keys are content-unique UUIDs).
app.get("/media/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/media\//, ""));
  if (!key || key.includes("..")) return c.notFound();
  const cache = "public, max-age=31536000, immutable";
  if (c.env.MEDIA) {
    const obj = await c.env.MEDIA.get(key);
    if (obj) {
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("etag", obj.httpEtag);
      headers.set("cache-control", cache);
      return new Response(obj.body, { headers });
    }
  }
  const kv = await c.env.KV.getWithMetadata<{ contentType?: string }>(`media:${key}`, "arrayBuffer");
  if (!kv.value) return c.notFound();
  return new Response(kv.value, { headers: { "content-type": kv.metadata?.contentType ?? "application/octet-stream", "cache-control": cache } });
});

export default app;
