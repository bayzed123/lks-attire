# What to add in GitHub and Cloudflare (for the automatic pipeline)

The pipeline in `.github/workflows/ci-deploy.yml` **creates everything on Cloudflare by itself** on the first push to `main`: the Worker, the D1 database, the KV namespace and the R2 bucket. It binds them, runs migrations, seeds the shop, creates your first admin and deploys. You only add the values below once.

Where: **GitHub → your repository → Settings → Secrets and variables → Actions**.

---

## 1. Required GitHub secrets (✅ you already added these)
| Secret name | Value | Where to get it |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 32-character account ID | Cloudflare dashboard → **Workers & Pages** → right sidebar "Account ID" |
| `CLOUDFLARE_API_TOKEN` | API token (e.g. named "Lk's attire Api") | Cloudflare → **My Profile → API Tokens → Create Token** (permissions below) |

### Permissions the API token needs
Create it from the **"Edit Cloudflare Workers"** template, then **add** the D1 permission. The final list:

| Scope | Permission | Access |
|---|---|---|
| Account | Workers Scripts | Edit |
| Account | **D1** | Edit |
| Account | Workers KV Storage | Edit |
| Account | Workers R2 Storage | Edit |
| Account | Account Settings | Read |
| User | Memberships | Read |
| User | User Details | Read |
| Zone (only when you add a custom domain) | Workers Routes | Edit |

*Account Resources:* include your account. *Zone Resources:* all zones, or your domain's zone.

> If the token already exists and is missing **D1 Edit**, edit the token and add it. Otherwise the "Provision Cloudflare" step fails with an authentication error.

---

## 2. Strongly recommended GitHub secrets (your first admin login)
| Secret name | Example | What it does |
|---|---|---|
| `ADMIN_EMAIL` | `owner@lksattire.com` | Email for the first **Super Admin** (created only if no admin exists yet) |
| `ADMIN_PASSWORD` | a long password (≥ 10 characters) | That admin's password. Sign in at `https://<your-worker>.workers.dev/admin/` |
| `ADMIN_NAME` *(optional)* | `Lk's Attire Owner` | Display name |

After the first successful deploy you can delete `ADMIN_PASSWORD` from GitHub. Change your password any time in **Admin → Profile settings**.

---

## 3. Optional GitHub **variables** (the "Variables" tab, not "Secrets")
| Variable | Default | When to set it |
|---|---|---|
| `WORKER_NAME` | `lks-attire` | Name of the Worker. Resources are named `<WORKER_NAME>-db`, `<WORKER_NAME>-kv`, `<WORKER_NAME>-media` |
| `PUBLIC_URL` | *(empty → uses the workers.dev address)* | After you connect a domain, e.g. `https://lksattire.com` (used for payment callback URLs and SEO) |
| `BRAND` | `lks-attire` | Only for reusing this code for another client (`brands/<id>/`) |
| `PALETTE` | brand's `activePalette` | Try another palette, e.g. `festive-maroon` |

---

## 4. Optional integration secrets (add in GitHub; the pipeline copies them into the Cloudflare Worker)
Cash on Delivery and **manual bKash/Nagad/Rocket** (the customer sends money and types the TrxID) work **without any of these**. Change the bKash/Nagad receiving numbers in **Admin → Settings → Payment methods**.

| Feature | GitHub secret names |
|---|---|
| bKash automatic payment (Tokenized Checkout) | `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD`, `BKASH_BASE_URL` (sandbox `https://tokenized.sandbox.bka.sh/v1.2.0-beta`, live `https://tokenized.pay.bka.sh/v1.2.0-beta`) |
| Card payments (SSLCommerz) | `SSLCZ_STORE_ID`, `SSLCZ_STORE_PASSWD`, `SSLCZ_SANDBOX` (`true` while testing, `false` live) |
| Nagad API (future) | `NAGAD_MERCHANT_ID`, `NAGAD_MERCHANT_PRIVATE_KEY`, `NAGAD_PG_PUBLIC_KEY` |
| Steadfast courier (auto booking + tracking) | `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`, `STEADFAST_WEBHOOK_TOKEN` |
| Pathao / RedX (future) | `PATHAO_CLIENT_ID`, `PATHAO_CLIENT_SECRET`, `REDX_API_TOKEN` |
| SMS to customers | `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_API_URL` (default BulkSMSBD) |
| WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `Lk's Attire <orders@lksattire.com>`) |
| Bot protection (Cloudflare Turnstile) | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` |
| Emergency admin creation | `BOOTSTRAP_TOKEN` (a long random string; see docs/SETUP.md) |

Callback URLs to register with providers (replace the host with your domain or workers.dev URL):
- Steadfast webhook: `https://<host>/api/webhooks/steadfast` with Bearer token = `STEADFAST_WEBHOOK_TOKEN`
- SSLCommerz IPN: `https://<host>/api/payments/sslcommerz/ipn`
- bKash callback: sent automatically (`https://<host>/api/payments/bkash/callback`)

---

## 5. One-time clicks in the Cloudflare dashboard
1. **workers.dev subdomain:** Workers & Pages → the first visit asks you to choose a subdomain (e.g. `lksattire.workers.dev`). Pick one once, or the first deploy fails.
2. **R2 (for product photos):** R2 Object Storage → *Enable/Purchase R2* (the free tier includes 10 GB; Cloudflare may ask for a card). **If you skip this, the pipeline still deploys** and photos are stored in KV. Enable R2 later and re-run the workflow to switch.
3. **Custom domain (later):** add your domain to Cloudflare, set the `PUBLIC_URL` variable, and uncomment `routes` in `wrangler.toml` (see docs/SETUP.md §7).

---

## 6. Run it
- Merge the pull request into `main` (or open **Actions → CI & Deploy → Run workflow**).
- Open the finished run → **Summary** shows the **Store URL** and **Admin URL**.
- Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Then, in the admin:
  - **Settings → Branding:** upload/replace the logo; add Facebook/Instagram/TikTok links
  - **Settings → Payment methods:** your **bKash / Nagad / Rocket numbers**
  - **Homepage banners:** hero slides (top), festive banner, **offer strip** (promo)
  - **Coupons:** create offers (e.g. `LK10` = 10% off, already created)
  - **Products:** replace the starter demo items with your own photos

## Summary: names to add
**GitHub → Secrets:** `CLOUDFLARE_ACCOUNT_ID` ✅, `CLOUDFLARE_API_TOKEN` ✅, `ADMIN_EMAIL`, `ADMIN_PASSWORD` *(+ optional integration secrets from §4)*
**GitHub → Variables (optional):** `WORKER_NAME`, `PUBLIC_URL`, `BRAND`, `PALETTE`
**Cloudflare:** API token permissions from §1 (incl. **D1 Edit**), a workers.dev subdomain, and R2 enabled (optional)
**Cloudflare Worker secrets:** nothing to add by hand. The pipeline copies the §4 secrets from GitHub automatically.
