# Security runbook (NIST CSF 2.0: Govern · Identify · Protect · Detect · Respond · Recover)

## Govern: who decides
| Role | Person | Responsibilities |
|---|---|---|
| Security owner | Shop owner | Approves staff accounts and roles, payment/courier vendor choices, and who holds Cloudflare/GitHub access |
| Deputy | One trusted staff member (Super Admin) | Acts when the owner is unavailable; runs the quarterly review |
| Developer | Contracted | Holds Cloudflare/GitHub access only while engaged. Rotates secrets on hand-over |

**Quarterly review (30 min):** remove staff who left (*Staff & roles → Can sign in: off*), scan the *Activity log* for unexpected actions, confirm the latest nightly backup exists, confirm bKash/SSLCommerz/Steadfast accounts have 2FA, and check the last restore drill date.

## Identify: what we protect and where it flows
| Asset | Where | Sensitivity | Retention |
|---|---|---|---|
| Customer name, phone, address, email | D1 `customers`, `orders`, `addresses` | PII | Orders kept for accounting. Customers can ask for deletion |
| Password hashes | D1 `customers`, `admins` | Secret (hashed) | Until account deleted |
| Payment references (TrxID, gateway IDs) | D1 `orders.payment_ref` | Low. No card data is ever stored | With the order |
| Sessions, OTP codes | KV (TTL 12h admin / 30d customer / 10 min OTP) | Secret | Auto-expire |
| API keys | Cloudflare Wrangler secrets | Secret | Rotate on staff/developer change |
| Product photos | R2 | Public | — |

**Data flow:** Browser ⇄ (HTTPS) Worker ⇄ D1/KV/R2. Outbound, each provider gets only what it needs: payment (amount, order no, name, phone), courier (name, phone, address, COD amount), SMS/WhatsApp/email (phone or email plus the message text).

## Protect: controls in place
- **Authentication:** PBKDF2-SHA256, 100,000 iterations, 16-byte salt, constant-time comparison. Admin passwords ≥10 characters, customer passwords ≥8.
- **Sessions:** random 256-bit tokens in KV. Cookies are `HttpOnly` + `Secure` + `SameSite=Strict` (admin) or `Lax` (customer).
- **Authorisation:** role → permission matrix checked on **every** admin API route (`perm()` middleware). The UI hides actions too, but the server is the gate.
- **CSRF:** state-changing requests require the same `Origin` and an `X-Requested-With: fetch` header. Payment and courier callbacks are exempt and verify themselves (bKash execute, SSLCommerz validation API, Steadfast Bearer token).
- **Input and output:** zod validation on all inputs; parameterised SQL only; an auto-escaping HTML template helper on both front-ends; strict CSP without inline scripts; formula-injection guard on CSV exports; image uploads limited to JPG/PNG/WebP/AVIF ≤ 5 MB.
- **Transport:** HTTPS only, HSTS (`max-age=31536000; includeSubDomains`), `X-Frame-Options: DENY`, `nosniff`, a strict `Referrer-Policy`.
- **Secrets:** only in Wrangler secrets or `.dev.vars` (git-ignored). The Settings API rejects keys that look like secrets.
- **PCI scope:** card payments use SSLCommerz's hosted page and bKash uses its own page, so we never see card numbers or PINs.
- **Soft delete and Trash:** accidental deletes are recoverable. Only Super Admins can purge.

## Detect
- **Activity log:** every admin create/update/delete/restore/purge/status change/refund/export/import/sign-in/failed sign-in, with IP.
- **Failed-sign-in alert:** after 5 failures from one IP within an hour, the owner phone (*Settings → Customer messages → Owner phone*) gets an SMS.
- **Rate limits:** checkout, sign-in, OTP, review and tracking endpoints (KV fixed windows). A 429 response shows a friendly bilingual message.
- **Optional:** Cloudflare Turnstile on sign-in/register/checkout, Cloudflare WAF managed rules, and Workers Observability logs (enabled in `wrangler.toml`).

## Respond: incident checklist
1. **Contain (first 30 minutes)**
   - Deactivate the suspicious staff account (*Staff & roles*).
   - Sign every staff member out (deletes all admin sessions):
     ```bash
     npx wrangler kv key list --binding KV --remote --prefix "s:a:" | jq '[.[].name]' > sessions.json
     npx wrangler kv bulk delete sessions.json --binding KV --remote && rm sessions.json
     ```
     (Use prefix `s:c:` for customer sessions.)
   - Rotate any possibly exposed secret: `npx wrangler secret put <NAME>`, and regenerate it in the provider panel (bKash, SSLCommerz, Steadfast, SMS).
   - If the admin itself is compromised, temporarily block `/admin*` and `/api/admin*` with a Cloudflare WAF rule.
2. **Assess:** review the Activity log, Worker logs, recent orders/refunds and payment statements. Decide what data was affected.
3. **Notify:** if customer PII was exposed, tell the affected customers by SMS in Bangla and English within 72 hours, explaining what happened and what to watch for (e.g. fake calls asking for OTPs). Inform payment and courier partners if their credentials were involved.
4. **Fix and learn:** patch the cause via a PR (CI must pass), then write a short note: what happened, impact, fix, and prevention.

## Recover: backups and restore
**Backups**
- **Nightly:** GitHub Actions `d1-backup.yml` exports the production D1 to a gzipped SQL artifact kept for 30 days.
- **Point-in-time:** D1 Time Travel restores to any minute in the last 30 days (Workers Paid) or 7 days (Free).
- **Photos:** R2 objects are write-once with unique keys. Enable R2 object versioning or a periodic `rclone` copy for extra safety.
- **Code:** GitHub is the source of truth; any past commit can be redeployed.

**Restore procedures**
```bash
# A) Undo a bad change from minutes/hours ago (Time Travel)
npx wrangler d1 time-travel info lks-attire-db --timestamp "2026-09-24T10:00:00Z"
npx wrangler d1 time-travel restore lks-attire-db --timestamp "2026-09-24T10:00:00Z"

# B) Rebuild from a nightly export (e.g. new database after account loss)
gunzip d1-20260924-2040.sql.gz
npx wrangler d1 create lks-attire-db-restore
npx wrangler d1 execute lks-attire-db-restore --remote --file=d1-20260924-2040.sql
# point database_id in wrangler.toml at the new database (or rename it to lks-attire-db), then deploy
npx wrangler deploy

# C) Roll back the application code
git revert <bad-commit> && git push   # CI redeploys the previous behaviour
```
**Restore drill:** once a quarter, restore the latest export into a scratch database with option B and spot-check order counts. Record the date in the review notes.
