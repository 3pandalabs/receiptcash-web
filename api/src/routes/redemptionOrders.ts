import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, pool, schema } from "../db/index.js";
import { requireAuth } from "../auth/plugin.js";

const cartItem = z.object({
  giftId: z.string().uuid(),
  quantity: z.number().int().positive(),
});
const redeemBody = z.object({ items: z.array(cartItem).min(1) });

type PgError = Error & { code?: string };

export async function redemptionOrderRoutes(app: FastifyInstance) {
  // Calls the redeem_cart(uuid, jsonb) Postgres function (ported verbatim
  // from receiptcash/supabase/migrations/0009 — row-locks each gift via
  // FOR UPDATE, validates active/stock/quantity, then atomically creates the
  // order + line items, decrements stock, and debits points). The
  // points_balances.balance >= 0 CHECK constraint is what actually rejects
  // insufficient balance (23514) — the function itself never checks balance.
  app.post("/redemption-orders", { preHandler: requireAuth, schema: { body: redeemBody } }, async (req, reply) => {
    const { items } = req.body as z.infer<typeof redeemBody>;
    const pgItems = items.map((i) => ({ gift_id: i.giftId, quantity: i.quantity }));

    try {
      const result = await pool.query<{ redeem_cart: string }>(
        "select redeem_cart($1, $2) as redeem_cart",
        [req.userId, JSON.stringify(pgItems)],
      );
      const orderId = result.rows[0].redeem_cart;
      return reply.code(201).send({ orderId });
    } catch (err) {
      const pgErr = err as PgError;
      if (pgErr.code === "23514") {
        return reply.code(422).send({ error: "Insufficient points balance" });
      }
      if (pgErr.code === "P0001") {
        return reply.code(422).send({ error: pgErr.message });
      }
      throw err;
    }
  });

  app.get("/redemption-orders", { preHandler: requireAuth }, async (req, reply) => {
    const orders = await db
      .select()
      .from(schema.redemptionOrders)
      .where(eq(schema.redemptionOrders.userId, req.userId!))
      .orderBy(desc(schema.redemptionOrders.createdAt));

    const orderIds = orders.map((o) => o.id);
    const items = orderIds.length
      ? await db
          .select({
            orderId: schema.redemptionOrderItems.orderId,
            quantity: schema.redemptionOrderItems.quantity,
            pointsCostEach: schema.redemptionOrderItems.pointsCostEach,
            gift: schema.gifts,
          })
          .from(schema.redemptionOrderItems)
          .innerJoin(schema.gifts, eq(schema.gifts.id, schema.redemptionOrderItems.giftId))
      : [];

    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
      itemsByOrder.get(item.orderId)!.push(item);
    }

    return reply.send(orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })));
  });
}
