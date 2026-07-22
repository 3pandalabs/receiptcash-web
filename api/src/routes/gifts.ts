import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/plugin.js";

export async function giftRoutes(app: FastifyInstance) {
  app.get("/gifts", { preHandler: requireAuth }, async (_req, reply) => {
    const rows = await db.select().from(schema.gifts).where(eq(schema.gifts.isActive, true));
    return reply.send(rows);
  });
}
