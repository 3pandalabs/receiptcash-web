import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Replaces Supabase's auth.users + GoTrue. password_hash is bcrypt.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Revocable refresh tokens. Only the bcrypt hash is stored, so a DB leak alone
// doesn't yield usable tokens.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_sessions_user").on(t.userId)],
);

// Replaces Supabase's profiles table (extended auth.users).
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    contentHash: text("content_hash").notNull(),
    merchantName: text("merchant_name"),
    receiptTotal: numeric("receipt_total", { precision: 10, scale: 2 }),
    taxAmount: numeric("tax_amount", { precision: 10, scale: 2 }),
    tipAmount: numeric("tip_amount", { precision: 10, scale: 2 }),
    purchaseDate: date("purchase_date"),
    status: text("status").notNull().default("pending"),
    statusReason: text("status_reason"),
    fingerprintHash: text("fingerprint_hash"),
    ocrRaw: jsonb("ocr_raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_receipts_user_content_hash").on(t.userId, t.contentHash),
    index("idx_receipts_fingerprint_hash").on(t.fingerprintHash),
    index("idx_receipts_user").on(t.userId),
    check(
      "receipts_status_check",
      sql`${t.status} in ('pending','processed','rejected','duplicate','flagged_for_review')`,
    ),
    check("receipts_total_check", sql`${t.receiptTotal} is null or ${t.receiptTotal} >= 0`),
  ],
);

// Needed for the process-receipt line-item math/deep-duplicate fraud checks.
export const receiptItems = pgTable(
  "receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipts.id, { onDelete: "cascade" }),
    description: text("description"),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [index("idx_receipt_items_receipt").on(t.receiptId)],
);

// Append-only source of truth for all balance movements. idempotencyKey is
// UNIQUE so a retried/duplicate credit/debit attempt for the same
// receipt/order cannot double-post (caught as a 23505 by the route layer).
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryType: text("entry_type").notNull(),
    points: integer("points").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_points_ledger_user").on(t.userId),
    check("points_ledger_entry_type_check", sql`${t.entryType} in ('credit','debit')`),
    check("points_ledger_points_check", sql`${t.points} > 0`),
    check("points_ledger_source_type_check", sql`${t.sourceType} in ('receipt','redemption','adjustment')`),
  ],
);

// Derived cache, maintained by the apply_points_ledger_entry() trigger (see
// drizzle/0000_*.sql). balance >= 0 is the real enforcement mechanism: an
// over-drafting debit rolls back the entire inserting transaction.
export const pointsBalances = pgTable(
  "points_balances",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("points_balances_balance_check", sql`${t.balance} >= 0`)],
);

export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    pointsCost: integer("points_cost").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    stockLevel: integer("stock_level"),
    imageEmoji: text("image_emoji"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("gifts_points_cost_check", sql`${t.pointsCost} > 0`)],
);

export const redemptionOrders = pgTable(
  "redemption_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    totalPointsCost: integer("total_points_cost").notNull(),
    status: text("status").notNull().default("pending"),
    trackingNumber: text("tracking_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_redemption_orders_user").on(t.userId),
    check("redemption_orders_total_check", sql`${t.totalPointsCost} > 0`),
    check("redemption_orders_status_check", sql`${t.status} in ('pending','fulfilled','failed','cancelled')`),
  ],
);

export const redemptionOrderItems = pgTable(
  "redemption_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => redemptionOrders.id, { onDelete: "cascade" }),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gifts.id),
    quantity: integer("quantity").notNull(),
    pointsCostEach: integer("points_cost_each").notNull(),
  },
  (t) => [
    index("idx_redemption_order_items_order").on(t.orderId),
    check("redemption_order_items_quantity_check", sql`${t.quantity} > 0`),
    check("redemption_order_items_points_check", sql`${t.pointsCostEach} > 0`),
  ],
);
