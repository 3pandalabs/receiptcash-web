import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/plugin.js";
import { keyOwnerUserId, presignDownload, presignUpload } from "../plugins/r2.js";

const keyBody = z.object({ key: z.string().min(1) });

export async function storageRoutes(app: FastifyInstance) {
  app.post("/storage/presign-upload", { preHandler: requireAuth, schema: { body: keyBody } }, async (req, reply) => {
    const { key } = req.body as z.infer<typeof keyBody>;
    if (!key.startsWith(`${req.userId}/`)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const url = await presignUpload(key);
    return reply.send({ url });
  });

  // Unlike NRIGhar, ReceiptCash has no cross-owner sharing concept — a
  // receipt image is only ever readable by the user who uploaded it.
  app.post("/storage/presign-download", { preHandler: requireAuth, schema: { body: keyBody } }, async (req, reply) => {
    const { key } = req.body as z.infer<typeof keyBody>;
    const ownerUserId = keyOwnerUserId(key);
    if (!ownerUserId || ownerUserId !== req.userId) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const url = await presignDownload(key);
    return reply.send({ url });
  });
}
