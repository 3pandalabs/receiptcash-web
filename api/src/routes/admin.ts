import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { requireAdmin } from "../auth/plugin.js";
import { fetchOrdersWithItems } from "./redemptionOrders.js";

const createGiftBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pointsCost: z.number().int().positive(),
  stockLevel: z.number().int().nonnegative().nullable().optional(),
  imageEmoji: z.string().optional(),
});

const updateGiftBody = createGiftBody.partial().extend({ isActive: z.boolean().optional() });

const updateOrderBody = z.object({
  status: z.enum(["pending", "fulfilled", "failed", "cancelled"]).optional(),
  trackingNumber: z.string().optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  // auth.users isn't a table in this stack (it was Supabase-only), so this is
  // now a plain join — no SECURITY DEFINER workaround needed, unlike the
  // original admin_list_wallets()/admin_get_user() RPCs.
  app.get("/admin/wallets", { preHandler: requireAdmin }, async (_req, reply) => {
    const rows = await db
      .select({
        userId: schema.pointsBalances.userId,
        email: schema.users.email,
        displayName: schema.profiles.displayName,
        balance: schema.pointsBalances.balance,
        updatedAt: schema.pointsBalances.updatedAt,
      })
      .from(schema.pointsBalances)
      .innerJoin(schema.users, eq(schema.users.id, schema.pointsBalances.userId))
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.pointsBalances.userId))
      .orderBy(schema.pointsBalances.balance);
    return reply.send(rows);
  });

  app.get("/admin/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [user] = await db
      .select({
        userId: schema.users.id,
        email: schema.users.email,
        displayName: schema.profiles.displayName,
        isAdmin: schema.profiles.isAdmin,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.users.id))
      .where(eq(schema.users.id, id));
    if (!user) return reply.code(404).send({ error: "not_found" });

    const [balance] = await db
      .select({ balance: schema.pointsBalances.balance })
      .from(schema.pointsBalances)
      .where(eq(schema.pointsBalances.userId, id));

    return reply.send({ ...user, balance: balance?.balance ?? 0 });
  });

  app.get("/admin/users/:id/receipts", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.userId, id))
      .orderBy(desc(schema.receipts.createdAt));
    return reply.send(rows);
  });

  app.get("/admin/users/:id/redemption-orders", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send(await fetchOrdersWithItems(eq(schema.redemptionOrders.userId, id)));
  });

  app.get("/admin/users/:id/ledger", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select({
        id: schema.pointsLedger.id,
        entryType: schema.pointsLedger.entryType,
        points: schema.pointsLedger.points,
        sourceType: schema.pointsLedger.sourceType,
        createdAt: schema.pointsLedger.createdAt,
      })
      .from(schema.pointsLedger)
      .where(eq(schema.pointsLedger.userId, id))
      .orderBy(desc(schema.pointsLedger.createdAt));
    return reply.send(rows);
  });

  // All orders across every user - admin/orders/page.tsx's fulfillment queue.
  app.get("/admin/redemption-orders", { preHandler: requireAdmin }, async (_req, reply) => {
    return reply.send(await fetchOrdersWithItems());
  });

  app.get("/admin/gifts", { preHandler: requireAdmin }, async (_req, reply) => {
    return reply.send(await db.select().from(schema.gifts));
  });

  app.post("/admin/gifts", { preHandler: requireAdmin, schema: { body: createGiftBody } }, async (req, reply) => {
    const body = req.body as z.infer<typeof createGiftBody>;
    const [gift] = await db.insert(schema.gifts).values(body).returning();
    return reply.code(201).send(gift);
  });

  app.patch("/admin/gifts/:id", { preHandler: requireAdmin, schema: { body: updateGiftBody } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof updateGiftBody>;
    const [gift] = await db.update(schema.gifts).set(body).where(eq(schema.gifts.id, id)).returning();
    if (!gift) return reply.code(404).send({ error: "not_found" });
    return reply.send(gift);
  });

  app.patch(
    "/admin/redemption-orders/:id",
    { preHandler: requireAdmin, schema: { body: updateOrderBody } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof updateOrderBody>;
      const fulfilledAt = body.status === "fulfilled" ? new Date() : undefined;
      const [order] = await db
        .update(schema.redemptionOrders)
        .set({ ...body, ...(fulfilledAt ? { fulfilledAt } : {}) })
        .where(eq(schema.redemptionOrders.id, id))
        .returning();
      if (!order) return reply.code(404).send({ error: "not_found" });
      return reply.send(order);
    },
  );
}
