# Setup, deployment and daily development

## 1. Requirements
- **Node.js 22 LTS** (Node 20 also works) and npm 10+
- A **Cloudflare account** (the Workers Paid plan is recommended for D1 Time Travel and higher limits)
- A **GitHub** repository (this one)

```bash
git clone https://github.com/bayzed123/lks-attire.git && cd lks-attire
npm ci
npx wrangler login          # opens the browser once
```

> **Using GitHub Actions? You can skip §2, §4 and §5.** The pipeline creates and binds the resources and copies secrets automatically. See [`GITHUB-SECRETS.md`](GITHUB-SECRETS.md). You can also run the same provisioning from your computer:
> ```bash
> export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ADMIN_USERNAME=owner ADMIN_PASSWORD='a-long-password'
> npm run build && node scripts/provision.mjs && npx wrangler deploy
> ```

## 2. Create Cloudflare resources by hand (once per environment)
```bash
npx wrangler d1 create lks-attire-db
# → copy database_id into wrangler.toml [[d1_databases]]

npx wrangler kv namespace create KV
# → copy id into wrangler.toml [[kv_namespaces]]

npx wrangler r2 bucket create lks-attire-media
```

Sample `wrangler.toml` (already in the repo; replace the zero IDs):
```toml
name = "lks-attire"
main = "worker/src/index.ts"
compatibility_date = "2026-08-15"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*", "/media/*", "/sitemap.xml", "/product/*", "/shop/*"]

[vars]
ENVIRONMENT = "production"
PUBLIC_URL = ""   # set to https://lksattire.com once the domain is live

[[d1_databases]]
binding = "DB"
database_name = "lks-attire-db"
database_id = "<from wrangler d1 create>"
migrations_dir = "worker/migrations"

[[kv_namespaces]]
binding = "KV"
id = "<from wrangler kv namespace create>"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "lks-attire-media"
```
> In CI, `scripts/provision.mjs` finds or creates the resources and writes their IDs automatically, so you can leave the zero placeholders in git.

## 3. Local development
```bash
cp .dev.vars.example .dev.vars        # local secrets (git-ignored)
npm run build                         # brand pipeline → dist/ + dist-seed/seed.sql
npm run db:migrate:local
npm run db:seed:local
node scripts/create-admin.mjs "Owner" owner@lksattire.com 'Choose-A-Long-Password' > /tmp/admin.sql
npx wrangler d1 execute DB --local --file=/tmp/admin.sql
npm run dev                           # http://localhost:8787  ·  admin: http://localhost:8787/admin/
```
Sample `.dev.vars`:
```ini
ENVIRONMENT=development
PUBLIC_URL=
BOOTSTRAP_TOKEN=change-me-to-a-long-random-string
SMS_API_KEY=
STEADFAST_API_KEY=
STEADFAST_SECRET_KEY=
BKASH_APP_KEY=
SSLCZ_STORE_ID=
SSLCZ_SANDBOX=true
```
In development the password-reset OTP is printed to the `wrangler dev` console.

### Tests
```bash
npm run typecheck      # tsc --noEmit
npm test               # Vitest in the Workers runtime (unit + integration with D1/KV/R2)
npm run test:e2e       # Playwright (starts its own wrangler dev on :8788 with a fresh DB)
```

## 4. Production secrets
Set each secret once. They are encrypted by Cloudflare and never stored in git:
```bash
npx wrangler secret put SMS_API_KEY
npx wrangler secret put SMS_SENDER_ID
npx wrangler secret put STEADFAST_API_KEY
npx wrangler secret put STEADFAST_SECRET_KEY
npx wrangler secret put STEADFAST_WEBHOOK_TOKEN    # also paste into Steadfast panel → Webhook (Bearer)
npx wrangler secret put BKASH_APP_KEY               # + BKASH_APP_SECRET, BKASH_USERNAME, BKASH_PASSWORD, BKASH_BASE_URL
npx wrangler secret put SSLCZ_STORE_ID              # + SSLCZ_STORE_PASSWD, SSLCZ_SANDBOX=false
npx wrangler secret put RESEND_API_KEY              # + EMAIL_FROM
npx wrangler secret put TURNSTILE_SECRET            # + TURNSTILE_SITE_KEY
```
Webhook/callback URLs to register with providers:
| Provider | URL |
|---|---|
| bKash (callbackURL is sent automatically) | `https://lksattire.com/api/payments/bkash/callback` |
| SSLCommerz IPN | `https://lksattire.com/api/payments/sslcommerz/ipn` |
| Steadfast webhook | `https://lksattire.com/api/webhooks/steadfast` |

## 5. First deploy
```bash
npm run build
npm run db:migrate:remote
npm run db:seed:remote            # categories, zones, settings (+ demo catalogue — delete later in admin)
node scripts/create-admin.mjs "Owner Name" owner@lksattire.com 'A-Very-Long-Password' > admin.sql
npx wrangler d1 execute DB --remote --file=admin.sql && rm admin.sql
npx wrangler deploy
```
To seed without demo products, set `"demoProducts": false` in `brand.json` before building.

## 6. GitHub repository and branch strategy
- `main` = **production**. It is protected: pull requests only, and the "CI & Deploy / test" check must pass.
- Work on `feature/<short-name>` branches → pull request → review → merge. Merging deploys automatically.
- Add **repository secrets**: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" + D1 edit), `CLOUDFLARE_ACCOUNT_ID`.
- Optional **repository variables**: `WORKER_NAME`, `PUBLIC_URL`, `BRAND`, `PALETTE`. Resource IDs are discovered automatically by `scripts/provision.mjs`.
- Workflows:
  - `.github/workflows/ci-deploy.yml`: on every PR/push it runs build, typecheck, Vitest and Playwright; on `main` it then provisions (D1/KV/R2), migrates, seeds on the first run, deploys, syncs secrets and runs a smoke test.
  - `.github/workflows/d1-backup.yml`: a nightly D1 export kept for 30 days.

## 7. Custom domain
1. Add `lksattire.com` to Cloudflare, then change the nameservers at your registrar to the two Cloudflare gives you.
2. In `wrangler.toml`, uncomment:
   ```toml
   routes = [
     { pattern = "lksattire.com", custom_domain = true },
     { pattern = "www.lksattire.com", custom_domain = true }
   ]
   ```
3. Deploy. Cloudflare creates the DNS records and TLS certificate automatically.
4. In Cloudflare → SSL/TLS, set mode **Full (strict)** and turn on **Always Use HTTPS**. HSTS is also sent by the app.

## 8. Adding a database change
Create `worker/migrations/0002_<name>.sql` (never edit applied migrations), run `npm run db:migrate:local`, update the code and tests, then open a PR. CI applies it to production before deploying the code that uses it. Keep migrations **additive** (add columns/tables) so the old Worker version keeps working during the deploy.
