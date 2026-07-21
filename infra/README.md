# ReceiptCash infrastructure — Hetzner + Coolify runbook

Target: the **same** Hetzner Cloud server + Coolify instance already running NRIGhar's backend (see `nrighar/infra/README.md` for how that box was provisioned — this is not a new server). Coolify will manage two additional resources on it:
- a second **Postgres 17 "Database"** resource, `receiptcash-postgres` (replaces Supabase Postgres for this app)
- a second **`receiptcash-api` "Application"** resource (new Fastify backend, replaces PostgREST/GoTrue/Storage/Edge Functions for this app)

Because this reuses NRIGhar's already-hardened box, the following are **already done at the box level** and do not need repeating: server provisioning, firewall (22/80/443/8000 rules), Coolify install, Cloudflare SSL/TLS Full(strict) on the zone, Traefik DNS-01 challenge config (`CF_DNS_API_TOKEN`, explicit `1.1.1.1:53,8.8.8.8:53` resolvers), and the Hetzner firewall's 80/443 restricted to Cloudflare's published IP ranges. Only the steps below are ReceiptCash-specific.

## Why this migration, and what's different from NRIGhar's

Same driver as NRIGhar: Supabase's free-tier caps at 2 projects, and ReceiptCash would be the app that blows past it. Unlike NRIGhar's migration, three things are simplified here (decided with the user up front, see repo-root plan discussion):

1. **No data migration script.** ReceiptCash's current Supabase data is test/seed only — no `scripts/migrate-data.ts` dry-run/verify pass. Apply the new schema fresh and reseed the 3 placeholder gifts. Existing test logins do not carry over.
2. **No new server.** Everything here targets the existing box — see the Coolify steps below, not a `hetzner/provision-server.sh` run.
3. **Realtime → polling.** ReceiptCash's mobile app uses Supabase Realtime (`postgres_changes`) for live balance/receipt/order updates. The new stack has no push-notification equivalent — mobile hooks switch to interval polling instead. No WebSocket/SSE/LISTEN-NOTIFY layer to build or operate.

ReceiptCash's backend surface is otherwise **larger** than NRIGhar's: a two-stage OCR/fraud pipeline (AWS Textract + line-item math check + content-fingerprint dedup + near-duplicate detection), cart/order redemption with row-level stock locking, and an admin panel (wallet directory, user detail, catalog, order fulfillment). All of that needs porting from `supabase/migrations/0001`-`0017` and the two Edge Functions into the new `api/` service — see the repo's approved migration plan for the full breakdown of what maps to what.

## 1. Add the `receiptcash-postgres` resource

Coolify dashboard (same instance as NRIGhar's) → the ReceiptCash project (or create one if Coolify's projects are organized per-app) → **New Resource → Database → PostgreSQL 17**.

- Name it `receiptcash-postgres`. Let Coolify generate the password — copy it immediately, it becomes part of `receiptcash-api`'s `DATABASE_URL`.
- Leave it **not publicly exposed** (internal Docker network only, same as `nrighar-postgres`).
- Note the internal connection string Coolify shows (`postgres://postgres:<password>@receiptcash-postgres:5432/postgres`).
- Register `receiptcash-backups` as a new bucket target under Coolify's *global* S3 Storage settings (Team → Storages) — reuse the same R2 account, just point at the new bucket once it exists (step 2). Remember: this has to be registered globally before the Postgres resource's own Backups tab will offer it as an option — that's the exact gotcha NRIGhar hit (`nrighar/infra/coolify-setup.md` §3).
- Add a scheduled daily backup once the storage destination validates; trigger one manual "Backup now" and confirm the object lands in `receiptcash-backups` before trusting the schedule.

## 2. Create the R2 buckets

Cloudflare dashboard (or `wrangler r2 bucket create`, if/once authenticated) → create:
- `receiptcash-documents` — private, user-uploaded receipt images. Same `<user_id>/<filename>` key convention as NRIGhar's `nrighar-documents`.
- `receiptcash-backups` — Postgres backup target, kept isolated from user files (same rationale as NRIGhar's split).

Reuse the existing R2 API token if it's scoped broadly enough to cover both new buckets; otherwise mint a second token scoped to just these two (Object Read & Write, bucket-scoped, not "all buckets" — same convention as `nrighar/infra/r2-setup.md`).

Yields: `R2_ACCOUNT_ID` (same account as NRIGhar, so this value is already known), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, endpoint `https://<account_id>.r2.cloudflarestorage.com`. Verify with `aws s3 ls --endpoint-url ... s3://receiptcash-documents` (or the Cloudflare dashboard's object browser) before wiring anywhere.

## 3. Add the `receiptcash-api` application resource

**New Resource → Application → Public Repository / Deploy from Git**, repo `3pandalabs/receiptcash`, branch `main` (or this migration branch during testing).

- **Base Directory:** `api`. **Dockerfile Location:** `Dockerfile` — bare, relative to Base Directory. (`api/Dockerfile` here doubles the path and fails the build — the exact bug NRIGhar hit and fixed in commit `a286d3c`.)
- **Ports Exposes:** `8080` explicitly (Coolify's `3000` default causes a working build to still 502 — NRIGhar's `d0f1c3d`).
- **Domains:** set **both** from day one, each **with the `https://` scheme** (a scheme-less value produces a broken Traefik rule with an empty Host matcher — NRIGhar's `64b93f0`):
  - `https://api.receiptcash.3pandalabs.com` (public)
  - `https://api-internal.receiptcash.3pandalabs.com` (server-side-only; pre-empts the Cloudflare "orange-to-orange" same-account block that only bit NRIGhar *after* it was already live — see §5)

Environment variables (authoritative list will live in `api/.env.example` once the service exists):

| Key | Value | Secret |
|---|---|---|
| `DATABASE_URL` | internal Postgres string from step 1 | yes |
| `JWT_SECRET` | fresh `openssl rand -base64 48` — never reused across apps | yes |
| `R2_ACCOUNT_ID` | from step 2 | no |
| `R2_ACCESS_KEY_ID` | from step 2 | yes |
| `R2_SECRET_ACCESS_KEY` | from step 2 | yes |
| `R2_BUCKET` | `receiptcash-documents` | no |
| `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` | no |
| `PORT` | `3000` (internal container port — separate from the Ports Exposes UI field, which is `8080`) | no |
| `CORS_ORIGINS` | comma-separated allowed origins (web + local dev) | no |
| `REWARD_RATE_PERCENT` | cashback rate, e.g. `2` (matches current Supabase Edge Function default) | no |
| `AWS_REGION` | Textract region | no |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | existing `receiptcash-textract` IAM user creds (no new AWS setup needed — see `ops/tech-stack.md`) | yes |

## 4. DNS

Two A records, both → the box's existing public IPv4 (same one NRIGhar's API uses):
- `api.receiptcash.3pandalabs.com` — **Proxied (orange cloud)**. The zone is already set to Full(strict) SSL from NRIGhar's hardening pass, so no per-record TLS config needed.
- `api-internal.receiptcash.3pandalabs.com` — **DNS-only (grey cloud)**, never proxied. This is the Cloudflare-orange-to-orange workaround hostname — see §5.

## 5. The Cloudflare "orange-to-orange" (O2O) issue — avoid it from day one

A Cloudflare Worker (ReceiptCash's Next.js app once it's also on Workers) cannot call another Cloudflare-proxied hostname on the **same account** — blocked at a platform layer ahead of WAF, no zone setting disables it. NRIGhar only discovered this in production after cutover (commit `e5f33d4`) and had to retrofit the fix. For ReceiptCash, build it in from the start:

- The second, DNS-only `api-internal.*` hostname (§4) points at the same origin.
- `receiptcash-api` resource's Domains field includes both hostnames (§3) — comma-separated, requires a redeploy if added after the fact, so just include both from the first deploy.
- Server-side-only code in `web/` reads `INTERNAL_API_URL` (never `NEXT_PUBLIC_`-prefixed, so the browser bundle gets `undefined` and correctly falls back to the public hostname — browser-side calls aren't O2O-affected). See the web deployment doc (once written) for the exact client resolution pattern, copied from `nrighar/web/src/lib/api/client.ts`.

## 6. Run the schema migration + seed data

`docker exec` into the running `receiptcash-api` container and run the **compiled** `dist/db/migrate.js` (not `npm run db:migrate` / `tsx` — those are devDependencies stripped from the production image by `npm ci --omit=dev`, same as NRIGhar's `dc9eeb9`). Verify via `psql \dt`.

Since this is a clean start (no `scripts/migrate-data.ts` run — see top of this doc), immediately after the schema migration, seed the 3 placeholder gifts (values from `supabase/migrations/0004_seed_gifts.sql` + `0010_gift_stock_and_icons.sql`: $5/$10/$25 cards, plus their `stock_level`/`image_emoji`).

## 7. Verify

- `curl -I https://api.receiptcash.3pandalabs.com/health` → `200` with a valid cert (no `-k`).
- `docker ps` on the box shows `receiptcash-postgres` and `receiptcash-api` healthy **alongside** the existing `nrighar-postgres`/`nrighar-api` containers (don't disturb those).
- Confirm port 5432 is not reachable from outside for either Postgres resource.
- Manual smoke test against the live API directly (signup, login, upload a real receipt image, confirm Textract OCR + points credit, redeem a gift, hit an admin route) **before** touching the web/mobile deploys — same order NRIGhar's checklist used.

## Related

- `PRE_MERGE_CHECKLIST.md` — the ordered, checkable version of this doc plus the web/mobile cutover steps.
- `nrighar/infra/{README.md,coolify-setup.md,r2-setup.md}` — the template this doc mirrors; consult those for box-level details (Traefik, DNS-01, firewall) that don't need repeating here since the box is shared.
- Once live: update `ops/tech-stack.md`'s ReceiptCash section (flip from Supabase/Vercel description to this stack, same treatment as NRIGhar's Section 3) and fix the stale `CLAUDE.md` files (root, `web/`, `app/`) that currently describe a Supabase/Vercel architecture that's either out of date or about to be.
