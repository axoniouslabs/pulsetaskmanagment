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

  /** who an entry counts against: its aboutId, or for entries written before that existed, the assignee when the text says so */
  const LEGACY_REMINDER = /^(Reminder \d|Overdue reminder|Due-soon reminder|Gentle reminder)/;
  const LEGACY_ESCALATION = /^(Escalated to level|Past the deadline)/;
  const against = (a: Activity, personId: string, legacy: RegExp) => (a.aboutId ? a.aboutId === personId : !!a.taskId && byTask.get(a.taskId)?.assigneeId === personId && legacy.test(a.text));
  const h = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
  const feedOf = (taskId: string) => (actsByTask.get(taskId) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  /** hours blocked between two moments on a task */
  const blockedBetween = (feed: Activity[], from: string, to: string) => {
    let total = 0;
    let openedAt: string | null = null;
    for (const a of feed) {
      if (a.kind === "blocked") openedAt = a.at;
      else if (a.kind === "unblocked" && openedAt) {
        const s0 = openedAt > from ? openedAt : from;
        const e0 = a.at < to ? a.at : to;
        if (e0 > s0) total += h(s0, e0);
        openedAt = null;
      }
    }
    return total;
  };
  /** the submission a review decision answered */
  const submittedBefore = (feed: Activity[], at: string) => [...feed].reverse().find((a) => a.kind === "submitted" && a.at <= at)?.at;

  const rows: DailyStat[] = [];
  for (const p of w.people) {
    if (p.role === "owner" || p.active === false) continue;
    const mine = w.tasks.filter((t) => t.assigneeId === p.id && t.status !== "draft");
    const assignedToday = mine.filter((t) => on(t.createdAt));
    const approvedToday = mine.filter((t) => t.status === "approved" && on(t.approvedAt));
    const ackedToday = mine.filter((t) => on(t.acknowledgedAt));
    const myActs = acts.filter((a) => a.taskId && byTask.get(a.taskId)?.assigneeId === p.id);
    const count = (k: Activity["kind"]) => myActs.filter((a) => a.kind === k).length;
    // reminders and escalations count only when they were about this person (spec §10, §15)
    const remindersSent = acts.filter((a) => a.kind === "reminder_sent" && against(a, p.id, LEGACY_REMINDER)).length;
    const escalations = acts.filter((a) => a.kind === "escalated" && against(a, p.id, LEGACY_ESCALATION)).length;

    const ackMins = ackedToday.map((t) => Math.max(0, (new Date(t.acknowledgedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000));
    const ackFirst = ackedToday.filter((t) => {
      const before = (actsByTask.get(t.id) ?? []).filter((a) => a.kind === "reminder_sent" && a.at < t.acknowledgedAt! && against(a, p.id, LEGACY_REMINDER)).length;
      return before <= 1;
    }).length;

    // each round is timed on its own: the first pass, every rework after a send-back, and every wait for review (spec §10)
    let waitHours = 0;
    let workHours = 0;
    let reworkHours = 0;
    let blockedHours = 0;
    const reviewWaits: number[] = [];
    for (const t of approvedToday) {
      const feed = feedOf(t.id);
      const started = t.startedAt ?? feed.find((a) => a.kind === "submitted")?.at ?? t.approvedAt!;
      waitHours += h(t.createdAt, started);
      let begin = started;
      let round = 0;
      for (const a of feed) {
        if (a.kind === "submitted" && a.at >= begin) {
          const blocked = blockedBetween(feed, begin, a.at);
          blockedHours += blocked;
          const work = Math.max(0, h(begin, a.at) - blocked);
          if (round === 0) workHours += work;
          else reworkHours += work;
          const decision = feed.find((d) => (d.kind === "approved" || d.kind === "rejected") && d.at >= a.at);
          if (decision) {
            reviewWaits.push(h(a.at, decision.at));
            begin = decision.at;
          }
          round++;
        }
      }
      if (round === 0) workHours += Math.max(0, h(started, t.approvedAt!) - blockedBetween(feed, started, t.approvedAt!));
    }

    // as a reviewer: the decisions this person made today, and how long each waited
    const decided = acts.filter((a) => (a.kind === "approved" || a.kind === "rejected") && a.actorId === p.id && a.taskId);
    const givenWaits = decided.map((a) => {
      const sub = submittedBefore(feedOf(a.taskId!), a.at);
      return sub ? h(sub, a.at) : 0;
    });
    // other people's time blocked on this person, counted when the block cleared
    let blockingHours = 0;
    for (const a of acts) {
      if (a.kind !== "unblocked" || !a.taskId) continue;
      const opened = [...feedOf(a.taskId)].reverse().find((x) => x.kind === "blocked" && x.at <= a.at);
      if (opened?.aboutId === p.id) blockingHours += h(opened.at, a.at);
    }

    const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((x, y) => x + y, 0) / xs.length) : 0);
    const row: DailyStat = {
      personId: p.id,
      date,
      assigned: assignedToday.length,
      approved: approvedToday.length,
      onTime: approvedToday.filter((t) => new Date(t.submittedAt ?? t.approvedAt!) <= new Date(t.dueAt)).length,
      ackMinutes: ackMins.length ? Math.round(ackMins.reduce((a, b) => a + b, 0) / ackMins.length) : 0,
      remindersSent,
      ackFirst,
      submissions: count("submitted"),
      rejections: count("rejected"),
      estHours: round1(approvedToday.reduce((s, t) => s + t.estimateHours, 0)),
      actualHours: round1(approvedToday.reduce((s, t) => s + t.loggedMinutes / 60, 0)),
      escalations,
      reviewHours: avg(reviewWaits),
      waitHours: round1(waitHours),
      workHours: round1(workHours),
      blockedHours: round1(blockedHours),
      reworkHours: round1(reworkHours),
      reviewsDone: decided.length,
      reviewGivenHours: avg(givenWaits),
      blockingHours: round1(blockingHours),
    };
    const empty = !row.assigned && !row.approved && !row.remindersSent && !row.submissions && !row.escalations && !row.rejections && !row.reviewsDone && !row.blockingHours;
    if (!empty) rows.push(row);
  }
  return rows;
}
