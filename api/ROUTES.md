# receiptcash-api routes

Base URL: `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` (e.g. `https://api.receiptcash.3pandalabs.com`, `http://localhost:8080` in dev).

Auth: `Authorization: Bearer <accessToken>` header. Access tokens expire in 15 minutes — callers must catch 401s and call `POST /auth/refresh`, then retry once.

All error responses: `{ "error": "<code>" }` with a matching HTTP status. A resource that exists but isn't yours returns **404**, never 403 — don't rely on 403 to distinguish "forbidden" from "doesn't exist".

No realtime push channel — balance/receipts/orders are plain polling endpoints. Poll on an interval (e.g. every 7-10s) while the relevant screen is focused.

## Auth

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/signup` | none | `{ email, password, displayName? }` | `201 { accessToken, refreshToken, user: { id, email, isAdmin } }` |
| POST | `/auth/login` | none | `{ email, password }` | `200 { accessToken, refreshToken, user }` or `401 { error: 'invalid_credentials' }` |
| POST | `/auth/refresh` | none | `{ refreshToken }` | `200 { accessToken, refreshToken }` (rotated — old refreshToken is now invalid; also re-reads `isAdmin` from the DB) |
| POST | `/auth/logout` | none | `{ refreshToken }` | `204` |
| GET | `/auth/me` | required | — | `200 { id, email, isAdmin }` |

## Profile (self)

| Method | Path | Auth | Body |
|---|---|---|---|
| GET | `/profile` | required | — |
| PATCH | `/profile` | required | `{ displayName }` |
| GET | `/balance` | required | — `{ balance }` — poll target for the mobile home screen (no realtime push channel, see note above) |

## Receipts

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/receipts` | required | `{ storagePath, contentHash }` | `201` new pending receipt, or `409 { error: 'duplicate_upload' }` if `(userId, contentHash)` already exists |
| GET | `/receipts` | required | — | list own, newest first |
| POST | `/receipts/:id/process` | required | — | runs OCR (AWS Textract) + the fraud pipeline; see outcomes below |

`POST /receipts/:id/process` outcomes (ported verbatim from the old `process-receipt` Edge Function):
- `422` — OCR couldn't read merchant/total → receipt marked `flagged_for_review`
- `422` — line-item math doesn't match stated total (±$5) → `rejected`
- `409` — same-user fingerprint (merchant+total+date) match → `rejected`, "already rewarded"
- `200 { message: 'Receipt flagged for manual review' }` — different-user fingerprint match → `flagged_for_review` (not auto-rejected, could be a shared bill)
- `409` — ≥75% line-item match against another receipt with the same merchant/total/date → `rejected`
- `200 { pointsCredited }` — success; receipt marked `processed`, one `points_ledger` credit row inserted
- `200 { message: 'Already processed' }` — retried after already succeeding (idempotency key collision)

## Gifts

| Method | Path | Auth |
|---|---|---|
| GET | `/gifts` | required — active gifts only |

## Redemption orders

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/redemption-orders` | required | `{ items: [{ giftId, quantity }] }` | `201 { orderId }`, or `422 { error: 'Insufficient points balance' }`, or `422 { error: '<reason>' }` for a bad/inactive/out-of-stock gift |
| GET | `/redemption-orders` | required | — | list own with joined items + gift info, newest first |

## Admin (requires `isAdmin`)

| Method | Path | Body |
|---|---|---|
| GET | `/admin/wallets` | — all users' email/displayName/balance |
| GET | `/admin/users/:id` | — single user detail incl. balance |
| GET/POST | `/admin/gifts` | catalog management: `{ name, description?, pointsCost, stockLevel?, imageEmoji? }` |
| PATCH | `/admin/gifts/:id` | any of the above + `{ isActive }` |
| PATCH | `/admin/redemption-orders/:id` | `{ status?, trackingNumber? }` — fulfillment |

## Storage (Cloudflare R2)

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/storage/presign-upload` | required | `{ key }` — `key` must start with `${yourUserId}/`; returns `{ url }`, a presigned PUT, 5 min TTL |
| POST | `/storage/presign-download` | required | `{ key }` — must be your own key (no cross-user sharing in this app); returns `{ url }`, a presigned GET, 10 min TTL |

Upload flow: `POST /storage/presign-upload` → client `PUT`s the image directly to the returned URL → `POST /receipts` with `{ storagePath: key, contentHash }` → `POST /receipts/:id/process` to trigger OCR + fraud checks.
