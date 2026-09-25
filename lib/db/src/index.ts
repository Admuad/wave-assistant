import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("⚠️ DATABASE_URL is not set. Database operations will fail until configured.");
}

export const pool = new Pool({
  connectionString: databaseUrl || "postgres://localhost:5432/postgres",
  ssl:
    !databaseUrl || databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export * from "./schema";
