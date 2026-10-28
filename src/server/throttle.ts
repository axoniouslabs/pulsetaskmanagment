import "server-only";
import { sql } from "drizzle-orm";
import { db, schema as S } from "./db";
import { newId } from "./ids";

/**
 * Count a request against a fixed window, in Postgres so it holds across every
 * serverless instance. Returns false once `max` is passed within `windowSec`.
 */
export async function hit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const start = now - windowSec * 1000;
  const [r] = await db
    .insert(S.rateLimit)
    .values({ id: newId("rl"), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: S.rateLimit.key,
      set: {
        count: sql`case when ${S.rateLimit.lastRequest} < ${start} then 1 else ${S.rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${S.rateLimit.lastRequest} < ${start} then ${now} else ${S.rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: S.rateLimit.count });
  return (r?.count ?? 1) <= max;
}
