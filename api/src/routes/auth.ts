import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, pool, schema } from "../db/index.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  generateRefreshSecret,
  parseRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
} from "../auth/jwt.js";
import { requireAuth } from "../auth/plugin.js";

const signupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(120).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshBody = z.object({ refreshToken: z.string() });

async function issueSession(userId: string, isAdmin: boolean) {
  const accessToken = signAccessToken({ sub: userId, isAdmin });
  const secret = generateRefreshSecret();
  const refreshTokenHash = await hashPassword(secret);
  const [session] = await db
    .insert(schema.sessions)
    .values({
      userId,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    .returning({ id: schema.sessions.id });
  return { accessToken, refreshToken: `${session.id}.${secret}` };
}

async function findValidSession(refreshToken: string) {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return null;
  const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, parsed.sessionId));
  if (!session || session.expiresAt < new Date()) return null;
  if (!(await verifyPassword(parsed.secret, session.refreshTokenHash))) return null;
  return session;
}

async function getIsAdmin(userId: string): Promise<boolean> {
  const [profile] = await db.select({ isAdmin: schema.profiles.isAdmin }).from(schema.profiles).where(eq(schema.profiles.id, userId));
  return profile?.isAdmin ?? false;
}

export async function authRoutes(app: FastifyInstance) {
  // Atomic signup: users + profiles + points_balances(0) in one transaction.
  // The old Supabase app created these client-side after auth.signUp()
  // returned — non-atomically, which could leave an orphaned auth identity if
  // the client crashed mid-flow. Fixed here.
  app.post("/auth/signup", { schema: { body: signupBody } }, async (req, reply) => {
    const { email, password, displayName } = req.body as z.infer<typeof signupBody>;

    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (existing) {
      return reply.code(409).send({ error: "email_in_use" });
    }

    const passwordHash = await hashPassword(password);

    const client = await pool.connect();
    let userId: string;
    try {
      await client.query("BEGIN");
      const userResult = await client.query<{ id: string }>(
        "insert into users (email, password_hash) values ($1, $2) returning id",
        [email, passwordHash],
      );
      userId = userResult.rows[0].id;

      await client.query("insert into profiles (id, display_name) values ($1, $2)", [
        userId,
        displayName ?? email.split("@")[0],
      ]);
      await client.query("insert into points_balances (user_id, balance) values ($1, 0)", [userId]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const session = await issueSession(userId, false);
    return reply.code(201).send({ ...session, user: { id: userId, email, isAdmin: false } });
  });

  app.post("/auth/login", { schema: { body: loginBody } }, async (req, reply) => {
    const { email, password } = req.body as z.infer<typeof loginBody>;

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const isAdmin = await getIsAdmin(user.id);

    const session = await issueSession(user.id, isAdmin);
    return reply.send({ ...session, user: { id: user.id, email: user.email, isAdmin } });
  });

  app.post("/auth/refresh", { schema: { body: refreshBody } }, async (req, reply) => {
    const { refreshToken } = req.body as z.infer<typeof refreshBody>;

    const matched = await findValidSession(refreshToken);
    if (!matched) {
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    // Rotate: delete the used session, issue a fresh one. Re-reads isAdmin
    // from the DB so an admin grant/revoke takes effect on next refresh
    // rather than being stuck for the life of the old access token.
    await db.delete(schema.sessions).where(eq(schema.sessions.id, matched.id));

    const isAdmin = await getIsAdmin(matched.userId);
    const session = await issueSession(matched.userId, isAdmin);
    return reply.send(session);
  });

  app.post("/auth/logout", { schema: { body: refreshBody } }, async (req, reply) => {
    const { refreshToken } = req.body as z.infer<typeof refreshBody>;
    const matched = await findValidSession(refreshToken);
    if (matched) {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, matched.id));
    }
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (req, reply) => {
    const [user] = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, req.userId!));
    if (!user) return reply.code(404).send({ error: "not_found" });
    return reply.send({ ...user, isAdmin: req.isAdmin ?? false });
  });
}
