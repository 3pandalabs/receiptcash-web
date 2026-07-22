# ReceiptCash Supabase/Vercel → self-hosted migration — pre-merge checklist

Mirrors `nrighar/infra/PRE_MERGE_CHECKLIST.md`'s structure. Branch: `migrate/postgres-coolify-hetzner`. Do not merge to `main` until every section below is checked and verified — `web/` and `app/` will no longer talk to Supabase at all once their route changes land, so this must go live in the order below, not merged speculatively.

Scope decisions locked in before starting (do not re-litigate mid-migration):
- **Realtime → polling.** No WebSocket/SSE/LISTEN-NOTIFY layer.
- **Compute → same Hetzner/Coolify box as NRIGhar.** New Postgres + app resources on the existing `cpx22` server, not a new server.
- **Data → clean start.** No `scripts/migrate-data.ts`-equivalent run. Current Supabase data is test/seed only; skip straight to fresh schema + reseeded gifts. Existing test logins will not carry over.

## 1. Build `api/` (new Fastify + Drizzle service)

- [ ] `src/db/schema.ts` — Drizzle tables: `users`, `sessions` (new — replace `auth.users`/GoTrue), `profiles`, `receipts`, `receipt_items`, `points_ledger`, `points_balances` (with the `balance >= 0` CHECK and the trigger fixed in Supabase migration `0014`, ported near-verbatim), `gifts`, `redemption_orders`, `redemption_order_items`.
- [ ] `src/auth/{jwt,plugin,password}.ts` — copy NRIGhar's pattern verbatim: 15min JWT access token, `sessionId.secret` refresh token with only the bcrypt hash stored server-side.
- [ ] `src/plugins/r2.ts` — copy verbatim, repoint bucket/env names to `receiptcash-*`.
- [ ] `src/plugins/authz.ts` — owner-scoped `WHERE user_id = req.userId` filtering + `requireAdmin` preHandler (plain column check, no RLS/SECURITY DEFINER — those are Supabase-specific and dropped entirely).
- [ ] `src/routes/auth.ts`, `profile.ts`, `receipts.ts` (upload/list + `POST /receipts/:id/process`), `gifts.ts`, `redemptionOrders.ts` (`POST /redemption-orders`, `FOR UPDATE` stock locking ported from `redeem_cart`), `admin.ts` (wallets, user detail, catalog, order fulfillment), `storage.ts` (R2 presign upload/download).
- [ ] Port the fraud/OCR pipeline from `supabase/functions/process-receipt/index.ts` into `POST /receipts/:id/process`: AWS Textract `AnalyzeExpenseCommand`, no-OCR-data check, line-item math tolerance ($5), same-user fingerprint collision (reject), cross-user fingerprint collision (flag, don't auto-reject), ≥75% line-item deep-duplicate match (reject). Preserve `status_reason` semantics and the idempotency-on-retry behavior (unique-violation on already-processed = treated as success).
- [ ] Port `redeem-cart`'s Postgres-error-to-HTTP mapping (insufficient balance, inactive/out-of-stock gift → 422) into `POST /redemption-orders`.
- [ ] `src/env.ts` — add `REWARD_RATE_PERCENT`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` alongside the standard set.
- [ ] `Dockerfile`, `docker-compose.dev.yml`, `drizzle.config.ts`, `ROUTES.md` — copy NRIGhar's shape, adapt contents.
- [ ] `.gitignore` covers `api/.env` from the start (NRIGhar caught a real gap here after the fact — don't repeat it).
- [ ] Verify locally against `docker-compose.dev.yml` before touching Coolify.

## 2. Rewire `web/` and `app/` against the local API

- [ ] `web/`: new `src/lib/api/client.ts` (httpOnly cookies, `INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL` resolution, 401→refresh→retry-once) replacing `src/lib/supabase/{client,server}.ts`. Rewrite `login/page.tsx`, `account/{page.tsx,actions.tsx}`, `admin/{layout.tsx,catalog,orders,wallets,users/[id]}/page.tsx`. Delete `src/proxy.ts`; move its auth-gate into `account/layout.tsx` and `admin/layout.tsx` as async Server Components. Remove `@supabase/supabase-js` + `@supabase/ssr` from `package.json`. Force `next build --webpack` in the build script now, before it's ever deployed to Workers.
- [ ] `app/`: new `lib/api.ts` (JWT + `expo-secure-store`) replacing `lib/supabase.ts`. Rewrite `hooks/useAuth.tsx`, `lib/uploadReceipt.ts`. Switch `hooks/{usePointsBalance,useReceipts,useRedemptionOrders}.ts` from `postgres_changes` subscriptions to interval polling. Point `hooks/useGifts.ts` / `app/(tabs)/redeem.tsx` at `POST /redemption-orders`. Remove `@supabase/supabase-js` from `package.json`.

## 3. Provision infra (see `infra/README.md` for full detail)

- [ ] `receiptcash-postgres` Coolify resource added to the existing box.
- [ ] `receiptcash-documents` + `receiptcash-backups` R2 buckets created; `receiptcash-backups` registered as a Coolify global S3 Storage destination; scheduled backup added and manually triggered once to confirm.
- [ ] `receiptcash-api` Coolify resource deployed: Base Directory `api`, Dockerfile Location bare `Dockerfile`, Ports Exposes `8080`, both Domains set with `https://` scheme from the first deploy.
- [ ] DNS: `receiptcash-api.3pandalabs.com` (proxied) + `receiptcash-api-internal.3pandalabs.com` (DNS-only) both added, pointing at the existing box IP. Single-label subdomains, not `api.receiptcash.*` — see infra/README.md's double-subdomain cert gotcha.
- [ ] Schema migration run via `docker exec ... node dist/db/migrate.js`; verified via `psql \dt`.
- [ ] 3 placeholder gifts reseeded (values from Supabase migrations `0004`/`0010`).
- [ ] `curl -I https://receiptcash-api.3pandalabs.com/health` → 200; port 5432 confirmed unreachable externally.

## 4. Smoke-test the live API directly (before touching web/mobile deploys)

- [ ] Signup, login.
- [ ] Upload a real receipt image; confirm Textract OCR runs and points are credited to the balance.
- [ ] Redeem a gift; confirm the order is created and stock decrements.
- [ ] Hit an admin route (wallet list, user detail) with an admin account.

## 5. Deploy `web/` to Cloudflare Workers

- [ ] Build via a Docker container (sidesteps the Windows `@ast-grep/napi` npm bug NRIGhar hit — unrelated to the app, don't debug it again).
- [ ] `wrangler.jsonc` vars set (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `INTERNAL_API_URL`); `JWT_SECRET` set as a Worker secret via `wrangler secret put` (verify with `wrangler secret list` — NRIGhar shipped a deploy once without actually doing this).
- [ ] Custom domain `receiptcash.3pandalabs.com` attached — remove the old Vercel git link/domain first (expect "hostname already has externally managed DNS records" until it's removed).
- [ ] Unauthenticated `/account` redirects to `/login`; authenticated signup→data flow round-trips against the live production API with a disposable test account.

## 6. Ship mobile

- [ ] New EAS build of `app/` pointing at the new API (`EXPO_PUBLIC_API_URL`). Play Console is still on-hold, so no store review is involved — just get a build to existing testers.

## 7. Merge and decommission

- [ ] Merge `migrate/postgres-coolify-hetzner` into `main`.
- [ ] **Pause** (don't delete) the Supabase project and the Vercel project for ReceiptCash — keep a rollback window.
- [ ] Update `ops/tech-stack.md`'s ReceiptCash section to reflect the new stack (same treatment as NRIGhar's Section 3: IN PROGRESS → LIVE, note the Hetzner/Coolify/R2 details, flag old Supabase/Vercel as paused).
- [ ] Fix the stale `CLAUDE.md` files (root, `web/`, `app/`) — they currently describe Supabase/Vercel and (on root) an inaccurate "not yet wired" status; replace with the actual self-hosted architecture.

## Related

- `infra/README.md` — full detail behind steps 3-5 above.
- `nrighar/infra/{README.md,coolify-setup.md,r2-setup.md,PRE_MERGE_CHECKLIST.md}` — the template this checklist mirrors.
