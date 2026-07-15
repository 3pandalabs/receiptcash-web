# ReceiptCash (mobile app)

React Native / Expo app for **3PandA Labs**. Users scan/upload receipts, earn cashback points on the bill amount, and redeem points for gifts.

- Company/app names are still pending final approval — see the planning doc for current status.
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions), shared with the [receiptcash-web](https://github.com/anprasha-labs/receiptcash-web) site.
- Build/release: EAS (Expo Application Services) → Google Play Console.

## Development

```
npm install
npm run android   # or: npm run ios / npm run web
```

## Status

Early scaffold — Expo blank TypeScript template. Supabase integration, receipt OCR, and the points-ledger schema are not yet wired up.

