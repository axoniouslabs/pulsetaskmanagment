import { sql } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { json } from "@/server/session";

/**
 * Uptime check for monitors (UptimeRobot, Better Stack): 200 when the database
 * answers and the reminder engine ran in the last 10 minutes, 503 otherwise.
 */
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    const orgs = await db.select({ engine: S.organizations.engine }).from(S.organizations);
    const last = orgs.map((o) => o.engine?.lastTickAt).filter(Boolean).sort().pop() ?? null;
    const engineAgeMin = last ? Math.round((Date.now() - new Date(last).getTime()) / 60000) : null;
    const engineOk = engineAgeMin !== null && engineAgeMin < 10;
    return json({ ok: engineOk, database: "ok", engineLastTickAt: last, engineAgeMin, ms: Date.now() - started }, engineOk ? 200 : 503);
  } catch {
    return json({ ok: false, database: "down" }, 503);
  }
}
