# Lk's Attire: full-stack e-commerce and admin dashboard

*Style With A Signature.* Party wear, organza three-pieces, kurtis, sarees and festive outfits from **Akurtakur Para, Tangail**, delivered across Bangladesh with Cash on Delivery.

![Lk's Attire cover](brands/lks-attire/assets/og-cover.jpg)

One **Cloudflare Worker** (Hono + TypeScript) serves the bilingual storefront, the admin dashboard and the API, backed by **D1** (database), **KV** (sessions/cache) and **R2** (photos). **GitHub Actions** tests every change and deploys `main` automatically. It also creates the Cloudflare resources on the first run.

| | |
|---|---|
| 🛍 **Storefront** | Bangla/English toggle · mobile-first "Signature Noir" design (black · gold · rani pink, from the official logo) · hero slider · offer strip · category arches · filters and sort · product gallery with zoom · size guide · wishlist · WhatsApp ordering · guest checkout |
| 📍 **Smart checkout** | Type a **postcode or area** (e.g. `1900`, `Mirzapur`, `মির্জাপুর`) and Division → District → Upazila fill in automatically, using data from [Bangladesh-geocode](https://github.com/bayeziddev/Bangladesh-geocode). Live delivery fee by zone (Tangail town / Tangail / Dhaka / rest of BD) |
| 💳 **Payments** | Cash on Delivery (default) · bKash / Nagad / Rocket with TrxID (numbers editable in admin) · bKash Tokenized API and SSLCommerz cards, activated by adding keys |
| 🚚 **Delivery** | Steadfast auto-booking and webhook tracking · Pathao / RedX tracking IDs · SMS / WhatsApp / email updates at every stage |
| 🧾 **Invoices & SKUs** | Every order gets a unique invoice number (`INV-2609-00042`) shown on the printed invoice, label, SMS and the customer's order page · every product and variant gets a unique SKU (automatic when left blank, e.g. `LKS-0042-XL-RED`) · one admin search finds a customer by invoice no, order no, phone, name, email, TrxID or SKU |
| 🏷 **Per-product offers** | In the product editor: % off, ৳ off or a set sale price; area-based, **free** or fixed delivery charge — change any time, with a **live preview** of how the product looks in the shop |
| 🧑‍💼 **Admin dashboard** | Soft-UI purple/pink three-pane layout; works on tablet and phone · KPIs and sales chart · orders pipeline with invoice/label printing · products with variants, photos, CSV · categories (drag to reorder) · inventory log · customers · **coupons/offers** · **banners (top hero, festive, offer strip)** · **logo and social links** · reviews · delivery zones · staff roles · reports · activity log · help center, all bilingual |
| 🔐 **Security** | PBKDF2 passwords · role-based access · CSRF and CSP · rate limits · audit log · nightly D1 backups (NIST CSF runbook) |
| ✅ **Tests** | 59 Vitest unit/integration tests in the Workers runtime · Playwright E2E (checkout, postcode auto-fill, language, admin, no horizontal scroll on phones) |

## 🚀 Deploy (GitHub Actions does everything)
1. Add the GitHub secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (**done**), plus `ADMIN_USERNAME` and `ADMIN_PASSWORD` for your first login.
2. Make sure the API token has **D1 Edit** as well as the Workers/KV/R2 permissions.
3. Merge to `main`. The workflow creates `lks-attire-db` (D1), `lks-attire-kv` (KV) and `lks-attire-media` (R2), binds them, migrates, seeds, creates your admin and deploys.

👉 **The exact names to add are in [`docs/GITHUB-SECRETS.md`](docs/GITHUB-SECRETS.md).**

## 💻 Run locally
```bash
npm ci
cp .dev.vars.example .dev.vars
npm run build                   # brand pipeline → dist/ + dist-seed/seed.sql
npm run db:migrate:local && npm run db:seed:local
node scripts/create-admin.mjs "Owner" owner@example.com 'Choose-A-Long-Password' > /tmp/admin.sql
npx wrangler d1 execute DB --local --file=/tmp/admin.sql
npm run dev                     # http://localhost:8787 · admin: /admin/
```
Checks: `npm run typecheck` · `npm test` · `npm run test:e2e`

## 🎨 Change the look without code
- **In the admin (live, no deploy):** logo, Facebook/Instagram/TikTok links, announcement bar, hero slides, festive banner, offer strip, coupons, bKash/Nagad/Rocket numbers, SMS templates, delivery fees, categories, products.
- **In `brands/lks-attire/brand.json` (then push):** colours (3 palettes included), fonts, layout style, contact, map, seed data. To reuse this code for another client with different brand guidelines, see [`docs/BRAND-PIPELINE.md`](docs/BRAND-PIPELINE.md).
- **New brand photos:** put them in `brands/lks-attire/source/`, run `node scripts/prepare-brand-images.mjs`, and push.

## 📚 Documentation
| Doc | For |
|---|---|
| [`docs/GITHUB-SECRETS.md`](docs/GITHUB-SECRETS.md) | **What to add in GitHub and Cloudflare** so the pipeline works |
| [`docs/SPEC.md`](docs/SPEC.md) | The full A–Z specification: brand, pages, admin modules, architecture diagrams, data models, payments, delivery, security, testing, SEO, roadmap, acceptance checklist, Bangla glossary |
| [`docs/SETUP.md`](docs/SETUP.md) | Manual setup, local development, secrets, custom domain, database changes |
| [`docs/BRAND-PIPELINE.md`](docs/BRAND-PIPELINE.md) | Reusing the build for other clients with their own brand guidelines |
| [`docs/SECURITY.md`](docs/SECURITY.md) | NIST CSF runbook: roles, controls, incident response, backups and restore |
| [`docs/BRIEF.md`](docs/BRIEF.md) | The original project brief |

## 🗂 Structure
```
brands/lks-attire/   brand.json · source/ (original photos) · assets/ (web-ready logo, cover, products)
scripts/             build-brand · prepare-brand-images · provision (Cloudflare) · sync-secrets · create-admin · build-postcodes
worker/              src/ (Hono API, SEO, payments, couriers, notifications) · migrations/ (D1 schema)
public/              storefront (vanilla JS modules, CSS, bd-geo + postcode data, service worker)
admin/               admin dashboard (vanilla JS modules, Soft-UI CSS)
tests/               unit · integration · e2e · fixtures
.github/workflows/   ci-deploy.yml (test → provision → deploy) · d1-backup.yml (nightly)
```

---
Location: Akurtakur Para, Tangail 1900, Bangladesh · [Facebook](https://www.facebook.com/profile.php?id=61579789955802)
