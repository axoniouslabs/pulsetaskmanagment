import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { findDatabaseUrl } from "./url.mjs";

const globalForDb = globalThis as unknown as { pulsePool?: Pool };

// DATABASE_URL, or whatever name the Vercel/Neon integration used
const url = findDatabaseUrl(process.env);
const local = !url || /localhost|127\.0\.0\.1/.test(url);

const pool =
  globalForDb.pulsePool ??
  new Pool({
    connectionString: url,
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    // serverless: let idle connections go quickly so the database isn't kept busy
    idleTimeoutMillis: process.env.NODE_ENV === "production" ? 10_000 : 30_000,
    // hosted Postgres (Neon, Supabase) needs TLS; local does not
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
if (process.env.NODE_ENV !== "production") globalForDb.pulsePool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
