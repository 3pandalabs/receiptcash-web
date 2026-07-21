// One-off script: applies drizzle/*.sql migrations to DATABASE_URL. Run via
// `npm run db:migrate` locally; in Coolify the compiled dist/db/migrate.js is
// run via `docker exec` (drizzle-kit/tsx are devDependencies, stripped from
// the production image).
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";

await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();
console.log("Migrations applied.");
