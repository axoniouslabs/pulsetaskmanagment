import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { loadWorld } from "@/server/repo";
import { getViewer, json } from "@/server/session";
import { scopePeople } from "@/lib/selectors";
import type { DailyStat } from "@/lib/seed";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Report rows for any date range (the app loads only the last five weeks up
 * front). Each person sees the same people they see everywhere else.
 */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sign in again." }, 401);
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return json({ error: "Pick a start and an end date." }, 400);
  // at most two years at a time
  if (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 731 * 86400000) return json({ error: "Pick a range of two years or less." }, 400);
  const world = await loadWorld(db, viewer.orgId, { skipNotifications: true });
  const visible = new Set(scopePeople(world, viewer.role, viewer.personId).map((p) => p.id));
  visible.add(viewer.personId);
  const rows = await db
    .select()
    .from(S.dailyStats)
    .where(and(eq(S.dailyStats.orgId, viewer.orgId), gte(S.dailyStats.date, from), lte(S.dailyStats.date, to)))
    .orderBy(S.dailyStats.date);
  const stats = rows
    .filter((r) => visible.has(r.personId))
    .map((r) => {
      const { orgId, id, ...rest } = r;
      void orgId;
      void id;
      return rest as unknown as DailyStat;
    });
  return json({ stats });
}
