import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { format, subMonths } from "date-fns";
import { db, schema as S } from "./db";

/** the shortest a company can keep its records: a full year of appraisals (spec §12) */
export const MIN_RETENTION_MONTHS = 12;

/**
 * Remove what is older than the company's retention period: the activity log,
 * notifications, attendance and report rows, and finished work that has been
 * archived (with its files). Runs once a day per company.
 */
export async function purgeOld(orgId: string, months: number, now = new Date()) {
  const cutoff = subMonths(now, Math.max(MIN_RETENTION_MONTHS, months || MIN_RETENTION_MONTHS));
  const day = format(cutoff, "yyyy-MM-dd");
  return db.transaction(async (tx) => {
    // the activity trigger lets this transaction, and only rows past the minimum, through
    await tx.execute(sql`select set_config('pulse.retention_purge', 'on', true)`);
    const act = await tx
      .delete(S.activity)
      .where(and(eq(S.activity.orgId, orgId), lt(S.activity.at, cutoff)))
      .returning({ id: S.activity.id });
    const notes = await tx
      .delete(S.notifications)
      .where(and(eq(S.notifications.orgId, orgId), lt(S.notifications.at, cutoff)))
      .returning({ id: S.notifications.id });
    await tx.delete(S.attendance).where(and(eq(S.attendance.orgId, orgId), lt(S.attendance.date, day)));
    await tx.delete(S.dailyStats).where(and(eq(S.dailyStats.orgId, orgId), lt(S.dailyStats.date, day)));
    const old = await tx
      .select({ id: S.tasks.id })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, orgId), isNotNull(S.tasks.archivedAt), inArray(S.tasks.status, ["approved", "cancelled"]), lt(S.tasks.statusChangedAt, cutoff)));
    if (old.length) {
      const ids = old.map((t) => t.id);
      await tx.delete(S.files).where(and(eq(S.files.orgId, orgId), inArray(S.files.taskId, ids)));
      await tx.delete(S.tasks).where(and(eq(S.tasks.orgId, orgId), inArray(S.tasks.id, ids)));
    }
    return { activity: act.length, notifications: notes.length, tasks: old.length };
  });
}
