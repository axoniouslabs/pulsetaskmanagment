/**
 * Daily per-person report rows, computed from tasks and the activity log.
 * Reports read these rows; the engine recomputes today's and yesterday's rows.
 */
import type { DailyStat } from "@/lib/seed";
import type { Activity, Task } from "@/lib/types";
import type { World } from "./world";
import { localDate } from "./time";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeDailyStats(w: Pick<World, "people" | "tasks" | "activity" | "settings">, date: string): DailyStat[] {
  const tz = w.settings.timezone;
  const on = (iso?: string) => !!iso && localDate(iso, tz) === date;
  const byTask = new Map<string, Task>(w.tasks.map((t) => [t.id, t]));
  const acts = w.activity.filter((a) => on(a.at));
  const actsByTask = new Map<string, Activity[]>();
  for (const a of w.activity) {
    if (!a.taskId) continue;
    const list = actsByTask.get(a.taskId) ?? [];
    list.push(a);
    actsByTask.set(a.taskId, list);
  }

  const rows: DailyStat[] = [];
  for (const p of w.people) {
    if (p.role === "owner" || p.active === false) continue;
    const mine = w.tasks.filter((t) => t.assigneeId === p.id && t.status !== "draft");
    const assignedToday = mine.filter((t) => on(t.createdAt));
    const approvedToday = mine.filter((t) => t.status === "approved" && on(t.approvedAt));
    const ackedToday = mine.filter((t) => on(t.acknowledgedAt));
    const myActs = acts.filter((a) => a.taskId && byTask.get(a.taskId)?.assigneeId === p.id);
    const count = (k: Activity["kind"]) => myActs.filter((a) => a.kind === k).length;

    const ackMins = ackedToday.map((t) => Math.max(0, (new Date(t.acknowledgedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000));
    const ackFirst = ackedToday.filter((t) => {
      const before = (actsByTask.get(t.id) ?? []).filter((a) => a.kind === "reminder_sent" && a.at < t.acknowledgedAt!).length;
      return before <= 1;
    }).length;
    const reviewHours = approvedToday.filter((t) => t.submittedAt).map((t) => (new Date(t.approvedAt!).getTime() - new Date(t.submittedAt!).getTime()) / 3600000);

    const row: DailyStat = {
      personId: p.id,
      date,
      assigned: assignedToday.length,
      approved: approvedToday.length,
      onTime: approvedToday.filter((t) => new Date(t.submittedAt ?? t.approvedAt!) <= new Date(t.dueAt)).length,
      ackMinutes: ackMins.length ? Math.round(ackMins.reduce((a, b) => a + b, 0) / ackMins.length) : 0,
      remindersSent: count("reminder_sent"),
      ackFirst,
      submissions: count("submitted"),
      rejections: count("rejected"),
      estHours: round1(approvedToday.reduce((s, t) => s + t.estimateHours, 0)),
      actualHours: round1(approvedToday.reduce((s, t) => s + t.loggedMinutes / 60, 0)),
      escalations: count("escalated"),
      reviewHours: reviewHours.length ? round1(reviewHours.reduce((a, b) => a + b, 0) / reviewHours.length) : 0,
    };
    const empty = !row.assigned && !row.approved && !row.remindersSent && !row.submissions && !row.escalations && !row.rejections;
    if (!empty) rows.push(row);
  }
  return rows;
}
