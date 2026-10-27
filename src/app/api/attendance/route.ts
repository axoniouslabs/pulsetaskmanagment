import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { loadWorld } from "@/server/repo";
import { getViewer, json } from "@/server/session";
import { scopePeople } from "@/lib/selectors";
import type { AttendanceDay } from "@/lib/types";

/** attendance for one month (yyyy-MM), for the people the viewer can see */
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sign in again." }, 401);
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "Pick a month." }, 400);
  const world = await loadWorld(db, viewer.orgId, { skipNotifications: true });
  const visible = new Set(scopePeople(world, viewer.role, viewer.personId).map((p) => p.id));
  visible.add(viewer.personId);
  const rows = await db
    .select()
    .from(S.attendance)
    .where(and(eq(S.attendance.orgId, viewer.orgId), gte(S.attendance.date, `${month}-01`), lte(S.attendance.date, `${month}-31`)));
  const attendance: AttendanceDay[] = rows
    .filter((r) => visible.has(r.personId))
    .map((r) => ({
      personId: r.personId,
      date: r.date,
      checkIn: r.checkIn?.toISOString(),
      checkOut: r.checkOut?.toISOString(),
      breakMin: r.breakMin,
      breaks: r.breaks,
      status: r.status as AttendanceDay["status"],
    }));
  return json({ attendance });
}
