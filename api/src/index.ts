import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyError } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { env } from "./env.js";
import { authPlugin } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { profileRoutes } from "./routes/profile.js";
import { receiptRoutes } from "./routes/receipts.js";
import { giftRoutes } from "./routes/gifts.js";
import { redemptionOrderRoutes } from "./routes/redemptionOrders.js";
import { adminRoutes } from "./routes/admin.js";
import { storageRoutes } from "./routes/storage.js";

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(cors, { origin: env.CORS_ORIGINS, credentials: true });
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
await app.register(authPlugin);

app.get("/health", async () => ({ ok: true }));

// Postgres error codes the redeem_cart/credit_points_for_receipt functions
// and unique constraints (e.g. one-upload-per-content-hash) actually raise,
// mapped to clean HTTP statuses instead of an unhandled 500:
//   23505 unique_violation  -> 409 (duplicate upload / already processed)
//   23514 check_violation   -> 422 (points_balances.balance >= 0, i.e. can't afford)
//   P0001 raised exception  -> 422 (bad/inactive/out-of-stock gift, empty cart, etc.)
// Route handlers that need a specific message for P0001/23514 catch those
// inline (see redemptionOrders.ts); this is the catch-all for anything else.
app.setErrorHandler((err: FastifyError & { code?: string }, _req, reply) => {
  if (err.code === "23505") {
    return reply.code(409).send({ error: "conflict" });
  }
  if (err.code === "23514") {
    return reply.code(422).send({ error: "check_violation" });
  }
  if (err.code === "P0001") {
    return reply.code(422).send({ error: err.message });
  }
  app.log.error(err);
  return reply.code(err.statusCode ?? 500).send({ error: "internal_error" });
});

await app.register(authRoutes);
await app.register(profileRoutes);
await app.register(receiptRoutes);
await app.register(giftRoutes);
await app.register(redemptionOrderRoutes);
await app.register(adminRoutes);
await app.register(storageRoutes);

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
