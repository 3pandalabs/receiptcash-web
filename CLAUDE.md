# ReceiptCash

Receipt-cashback rewards product (3PandaLabs). Users scan/upload receipts, earn cashback points, redeem for gifts. Names are provisional pending approval.

Single monorepo, four plain subdirectories (not submodules) — each client is its own npm project, run installs/dev commands inside the subfolder, not at root:

- **`web/`** — Next.js 16 (App Router, TS, Tailwind) marketing site + authenticated account portal. Deployed to Vercel (Root Directory = `web`). Own `CLAUDE.md`/`AGENTS.md` — has a framework-version warning, read it before touching Next.js code.
- **`app/`** — Expo/React Native (SDK 57) mobile app, built with EAS → Google Play. Own `CLAUDE.md`/`AGENTS.md` — has an Expo-version warning, read it before touching Expo code.
- **`supabase/`** — shared backend for both clients: one Postgres schema, migrations (`0001`–`0017`, sequential — check the latest before adding a new one), Edge Functions `process-receipt` and `redeem-cart`. Run `supabase` CLI from the repo root, not from inside this folder.
- **`brand/`** — icon/logo sources; rendered PNGs get copied into `web/` and `app/` assets manually (no build step).

## Conventions
- Env vars: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`); web uses the equivalent Supabase public vars in its own `.env`.
- CI runs per-folder via path-filtered GitHub Actions workflows (`.github/`).
- History note: merged from former `receiptcash-web` + `receiptcash-app` repos (2026-07-18); both histories preserved.
- Status as of 2026-07-18: early scaffold — Supabase integration, receipt OCR, and points-ledger schema not yet wired into either client (schema/functions exist in `supabase/` but aren't consumed yet).
