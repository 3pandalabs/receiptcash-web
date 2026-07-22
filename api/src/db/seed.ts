// One-off script: seeds the 3 placeholder gifts (values ported from
// receiptcash/supabase/migrations/0004_seed_gifts.sql + 0010_gift_stock_and_icons.sql).
// Idempotent: skips entirely if the gifts table is already non-empty.
import { db, pool, schema } from "./index.js";

const PLACEHOLDER_GIFTS = [
  {
    name: "$5 Gift Card",
    description: "Placeholder reward - swap for a real fulfillment partner before launch",
    pointsCost: 500,
    isActive: true,
    stockLevel: 100,
    imageEmoji: "🎁",
  },
  {
    name: "$10 Gift Card",
    description: "Placeholder reward - swap for a real fulfillment partner before launch",
    pointsCost: 1000,
    isActive: true,
    stockLevel: 50,
    imageEmoji: "🎁",
  },
  {
    name: "$25 Gift Card",
    description: "Placeholder reward - swap for a real fulfillment partner before launch",
    pointsCost: 2500,
    isActive: true,
    stockLevel: 20,
    imageEmoji: "🎁",
  },
];

const existing = await db.select({ id: schema.gifts.id }).from(schema.gifts).limit(1);
if (existing.length > 0) {
  console.log("gifts table already has rows, skipping seed.");
} else {
  await db.insert(schema.gifts).values(PLACEHOLDER_GIFTS);
  console.log(`Seeded ${PLACEHOLDER_GIFTS.length} placeholder gifts.`);
}

await pool.end();
