# ReceiptCash

Receipt-cashback rewards product (3PandaLabs). Users scan/upload receipts, earn cashback points, redeem for gifts. Names are provisional pending approval.

Single monorepo, plain subdirectories (not submodules) — each client is its own npm project, run installs/dev commands inside the subfolder, not at root. Backend migrated off Supabase to a self-hosted `api/` service on Hetzner/Coolify (merged to `main` 2026-07-22 via PR #4); the original Supabase project is paused, not deleted.

- **`web/`** — Next.js 16 (App Router, TS, Tailwind) marketing site + authenticated account portal. Deployed to Cloudflare Workers via `@opennextjs/cloudflare` (not Vercel — that project is a decommission-candidate, git integration disconnected). Own `CLAUDE.md`/`AGENTS.md` — has a framework-version warning, read it before touching Next.js code.
- **`app/`** — Expo/React Native (SDK 57) mobile app, built with EAS → Google Play. `preview`/`production` EAS environments carry `EXPO_PUBLIC_API_URL` (set via `eas env:set`, not `.env.local` — that's gitignored, local dev only). Own `CLAUDE.md`/`AGENTS.md` — has an Expo-version warning, read it before touching Expo code.
- **`api/`** — self-hosted backend: Fastify + Drizzle ORM, JWT auth, R2-backed receipt storage + AWS Textract OCR, deployed to Coolify on the shared Hetzner box (`nrighar-coolify-fsn`, Falkenstein — yes, shared across apps, name is a holdover from NRIGhar being first). Replaces the old Supabase Edge Functions — e.g. its receipt route reimplements `supabase/functions/process-receipt`'s line-item math/fraud checks. Schema migrations live in `api/drizzle/`, not `supabase/migrations/`. See `api/ROUTES.md` for the full route inventory.
- **`supabase/`** — LEGACY, historical only. One Postgres schema, migrations (`0001`–`0017`), Edge Functions `process-receipt` and `redeem-cart` — kept for reference, not consumed by any client anymore. Don't add new migrations here; new schema changes go in `api/drizzle/`.
- **`infra/`** — Coolify/Hetzner notes and the pre-merge checklist used during the repo-merge migration.
- **`brand/`** — icon/logo sources; rendered PNGs get copied into `web/` and `app/` assets manually (no build step).

## Conventions
- Each client (`web/`, `app/`, `api/`) is its own npm project — installs/dev commands run inside the subfolder, not at repo root. CI runs per-folder via path-filtered GitHub Actions workflows (`.github/`).
- `web/` reads `NEXT_PUBLIC_API_URL` (public, browser-facing) and `INTERNAL_API_URL` (server-side only, points at `receiptcash-api-internal.3pandalabs.com` — avoids a Cloudflare Worker-to-Worker "orange-to-orange" 403 that hits the public hostname); `app/` reads `EXPO_PUBLIC_API_URL` — always the public hostname, never `-internal` (firewalled to Cloudflare's IP ranges only, direct client traffic can't reach it).
- Auth: `api/` issues short-lived JWT access tokens + refresh tokens (`Authorization: Bearer`, 401 on expiry → call `/auth/refresh` and retry once). `app/` stores tokens in `expo-secure-store`, not `AsyncStorage` (deliberate — this app tracks a real points/wallet balance).
- A resource that exists but isn't the caller's returns **404** from `api/`, never 403 — don't rely on 403 to distinguish "forbidden" from "doesn't exist" (see `api/ROUTES.md`).
- History note: merged from former `receiptcash-web` + `receiptcash-app` repos (2026-07-18); both histories preserved.
- `ops/tech-stack.md` in the private `3pandalabs/ops` repo is the source of truth for current live infra (server IPs, DNS, deployment status); this file only orients you around the code layout.
