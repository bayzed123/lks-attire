#!/usr/bin/env node
/**
 * Turns the brand's source photos (brands/<id>/source/*.jpg) into small WebP files for the web
 * (brands/<id>/assets/), including product crops and a composed homepage cover.
 * Run once when the photos change:  BRAND=lks-attire node scripts/prepare-brand-images.mjs
 * The build (npm run build) copies brands/<id>/assets/ → dist/assets/brand/.
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const brand = process.env.BRAND || "lks-attire";
const src = (f) => `brands/${brand}/source/${f}`;
const out = (f) => `brands/${brand}/assets/${f}`;
mkdirSync(`brands/${brand}/assets`, { recursive: true });

const webp = (img, file, q = 78) => img.webp({ quality: q, effort: 5 }).toFile(out(file));
const crop = (file, left, top, width, height) => sharp(src(file)).extract({ left, top, width, height });
const product = (img, file) => webp(img.resize({ height: 960, withoutEnlargement: true }), file);

// Logo (black circle with gold "LK") — web sizes + app icon.
await webp(sharp(src("logo.jpg")).resize(512), "logo.webp", 85);
await webp(sharp(src("logo.jpg")).resize(160), "logo-160.webp", 85);
await sharp(src("logo.jpg")).resize(512).png().toFile(out("logo-512.png"));
await sharp(src("logo.jpg")).resize(192).png().toFile(out("logo-192.png"));

// Products from the real photo shoots.
await product(crop("ruby-organza-two-pose.jpg", 0, 0, 480, 878), "ruby-organza-1.webp");
await product(crop("ruby-organza-two-pose.jpg", 480, 0, 480, 878), "ruby-organza-2.webp");
await product(sharp(src("blush-organza.jpg")), "blush-organza-1.webp");
await product(sharp(src("lime-organza.jpg")), "lime-organza-1.webp");
// The "Available now" poster holds three more looks (cropped to the coloured panels, below the lettering).
await product(crop("available-now-poster.jpg", 0, 462, 368, 693), "maroon-kurti-1.webp");
await product(crop("available-now-poster.jpg", 396, 452, 590, 703), "red-organza-1.webp");
await product(crop("available-now-poster.jpg", 1050, 462, 390, 693), "yellow-jacket-gown-1.webp");
await webp(sharp(src("available-now-poster.jpg")).resize({ width: 1080 }), "available-now.webp");

// Composed homepage cover: three arch-framed looks on black with gold arch outlines.
const W = 1400, H = 1000, BG = "#0E0B0C", GOLD = "#E2C15A";
const arch = (w, h) => Buffer.from(`<svg width="${w}" height="${h}"><path d="M0 ${h}V${w / 2}A${w / 2} ${w / 2} 0 0 1 ${w} ${w / 2}V${h}Z" fill="#fff"/></svg>`);
async function arched(file, w, h, opts = {}) {
  const base = await sharp(src(file)).extract(opts.extract ?? { left: 0, top: 0, ...(await sharp(src(file)).metadata()) }).resize(w, h, { fit: "cover", position: "top" }).toBuffer();
  return sharp(base).composite([{ input: arch(w, h), blend: "dest-in" }]).png().toBuffer();
}
const slots = [
  { file: "blush-organza.jpg", x: 90, y: 250, w: 360, h: 650 },
  { file: "lime-organza.jpg", x: 950, y: 250, w: 360, h: 650 },
  { file: "ruby-organza-two-pose.jpg", extract: { left: 480, top: 0, width: 480, height: 878 }, x: 480, y: 130, w: 440, h: 800 },
];
const layers = [];
for (const s of slots) {
  layers.push({ input: await arched(s.file, s.w, s.h, s), left: s.x, top: s.y });
  const pad = 16;
  const ow = s.w + pad * 2, oh = s.h + pad * 2;
  layers.push({ input: Buffer.from(`<svg width="${ow}" height="${oh}"><path d="M2 ${oh}V${ow / 2}A${ow / 2 - 2} ${ow / 2 - 2} 0 0 1 ${ow - 2} ${ow / 2}V${oh}" fill="none" stroke="${GOLD}" stroke-width="2.5"/></svg>`), left: s.x - pad, top: s.y - pad });
}
layers.push({ input: Buffer.from(`<svg width="${W}" height="40"><rect y="6" width="${W}" height="3" fill="${GOLD}"/><rect y="16" width="${W}" height="10" fill="#D6246E"/><rect y="31" width="${W}" height="3" fill="${GOLD}"/></svg>`), left: 0, top: H - 60 });
const cover = await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(layers).png().toBuffer();
await sharp(cover).webp({ quality: 80 }).toFile(out("cover.webp"));
// Social share image (1200×630) — sharp resizes before compositing, so derive it from the finished cover.
await sharp(cover).resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 82 }).toFile(out("og-cover.jpg"));
console.log("✔ brand images written to", `brands/${brand}/assets/`);
