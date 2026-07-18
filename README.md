# ReceiptCash

Receipt-cashback rewards app — one repo, whole product.

Part of [3PandaLabs](https://3pandalabs.com). Live at [receiptcash.3pandalabs.com](https://receiptcash.3pandalabs.com).

## Structure

- **`web/`** — Next.js marketing site + authenticated account portal, deployed to Vercel (project Root Directory = `web`).
- **`app/`** — Expo (React Native) mobile app, built with EAS.
- **`supabase/`** — shared backend: migrations, config, and Edge Functions (process-receipt, redeem-cart). One schema serves both clients. Run `supabase` CLI commands from the repo root.
- **`brand/`** — icon/logo sources; PNGs are rendered from here into `web/` and `app/` assets.

## Working on it

Each client is its own npm project — run `npm install` / dev commands inside `web/` or `app/`, not at the root. CI runs per-folder via path-filtered workflows.

History note: this repo was merged from the former `receiptcash-web` and `receiptcash-app` repos (2026-07-18); both full histories are preserved.
