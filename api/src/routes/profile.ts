import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/plugin.js";

const updateProfileBody = z.object({
  displayName: z.string().min(1).max(120),
});

export async function profileRoutes(app: FastifyInstance) {
  app.get("/profile", { preHandler: requireAuth }, async (req, reply) => {
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, req.userId!));
    if (!profile) return reply.code(404).send({ error: "not_found" });
    return reply.send(profile);
  });

  // Polling target for the mobile app's usePointsBalance hook (no realtime
  // push channel in this stack - see ROUTES.md).
  app.get("/balance", { preHandler: requireAuth }, async (req, reply) => {
    const [row] = await db
      .select({ balance: schema.pointsBalances.balance })
      .from(schema.pointsBalances)
      .where(eq(schema.pointsBalances.userId, req.userId!));
    return reply.send({ balance: row?.balance ?? 0 });
  });

  app.patch("/profile", { preHandler: requireAuth, schema: { body: updateProfileBody } }, async (req, reply) => {
    const { displayName } = req.body as z.infer<typeof updateProfileBody>;
    const [profile] = await db
      .update(schema.profiles)
      .set({ displayName })
      .where(eq(schema.profiles.id, req.userId!))
      .returning();
    if (!profile) return reply.code(404).send({ error: "not_found" });
    return reply.send(profile);
  });
}
