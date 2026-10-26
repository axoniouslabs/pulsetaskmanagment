import { format, subDays } from "date-fns";
import type { DailyStat } from "@/lib/seed";
import type { Person } from "@/lib/types";
import { minutesToLabel } from "@/lib/utils";

export type Period = "week" | "month";

export const PERIOD_LABEL: Record<Period, string> = { week: "This week", month: "Last 4 weeks" };

/** the totals behind every rate on the reports page */
export interface Totals {
  assigned: number;
  approved: number;
  onTime: number;
  ackWeighted: number; // sum of ackMinutes × assigned
  ackFirst: number;
  submissions: number;
  rejections: number;
  estHours: number;
  actualHours: number;
  overrunHours: number;
  escalations: number;
  reviewWeighted: number; // sum of reviewHours × submissions
  days: number;
}

export interface Rates {
  completion: number | null;
  onTime: number | null;
  ack: number | null; // minutes
  firstReminder: number | null;
  rework: number | null;
  escalations: number;
  volume: number; // weighted volume: estimated hours of work assigned
}

export type MetricKey = "completion" | "onTime" | "ack" | "firstReminder" | "rework" | "escalations";

export const emptyTotals = (): Totals => ({
  assigned: 0,
  approved: 0,
  onTime: 0,
  ackWeighted: 0,
  ackFirst: 0,
  submissions: 0,
  rejections: 0,
  estHours: 0,
  actualHours: 0,
  overrunHours: 0,
  escalations: 0,
  reviewWeighted: 0,
  days: 0,
});

export function sumRows(rows: DailyStat[]): Totals {
  const t = emptyTotals();
  for (const r of rows) {
    t.assigned += r.assigned;
    t.approved += r.approved;
    t.onTime += r.onTime;
    t.ackWeighted += r.ackMinutes * r.assigned;
    t.ackFirst += r.ackFirst;
    t.submissions += r.submissions;
    t.rejections += r.rejections;
    t.estHours += r.estHours;
    t.actualHours += r.actualHours;
    t.overrunHours += Math.max(0, r.actualHours - r.estHours);
    t.escalations += r.escalations;
    t.reviewWeighted += r.reviewHours * Math.max(1, r.submissions);
    t.days += 1;
  }
  return t;
}

export function addTotals(a: Totals, b: Totals): Totals {
  const out = { ...a };
  (Object.keys(out) as (keyof Totals)[]).forEach((k) => (out[k] = a[k] + b[k]));
  return out;
}

const ratio = (n: number, d: number) => (d ? Math.min(100, (n / d) * 100) : null);

export function ratesOf(t: Totals): Rates {
  return {
    completion: ratio(t.approved, t.assigned),
    onTime: ratio(t.onTime, t.approved),
    ack: t.assigned ? t.ackWeighted / t.assigned : null,
    firstReminder: ratio(t.ackFirst, t.assigned),
    rework: ratio(t.rejections, t.submissions),
    escalations: t.escalations,
    volume: t.estHours,
  };
}

/** date windows (yyyy-MM-dd, inclusive) for a period and for its trend comparison */
export function windows(period: Period, today: Date) {
  const d = (n: number) => format(subDays(today, n), "yyyy-MM-dd");
  if (period === "week") {
    return {
      range: [d(6), d(0)] as const,
      trendCur: [d(6), d(0)] as const,
      trendPrev: [d(13), d(7)] as const,
      trendNote: "Arrows compare with the week before.",
    };
  }
  return {
    range: [d(27), d(0)] as const,
    trendCur: [d(13), d(0)] as const,
    trendPrev: [d(27), d(14)] as const,
    trendNote: "Arrows compare the last 2 weeks with the 2 weeks before.",
  };
}

export const inRange = (date: string, [from, to]: readonly [string, string]) => date >= from && date <= to;

export interface MetricDef {
  key: MetricKey;
  label: string;
  hint: string;
  better: "up" | "down";
  /** a change smaller than this is noise and stays grey */
  threshold: number;
  format: (v: number | null) => string;
  delta: (d: number) => string;
}

const pctFmt = (v: number | null) => (v === null ? "–" : `${Math.round(v)}%`);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export const METRICS: MetricDef[] = [
  {
    key: "completion",
    label: "Completion rate",
    hint: "Approved out of assigned",
    better: "up",
    threshold: 5,
    format: pctFmt,
    delta: (d) => `${signed(Math.round(d))} pts`,
  },
  {
    key: "onTime",
    label: "On-time rate",
    hint: "Approved before the deadline",
    better: "up",
    threshold: 5,
    format: pctFmt,
    delta: (d) => `${signed(Math.round(d))} pts`,
  },
  {
    key: "ack",
    label: "Avg time to acknowledge",
    hint: "From assignment to the first OK",
    better: "down",
    threshold: 8,
    format: (v) => (v === null ? "–" : minutesToLabel(Math.round(v))),
    delta: (d) => `${signed(Math.round(d))} min`,
  },
  {
    key: "firstReminder",
    label: "Answered first reminder",
    hint: "Acknowledged before a second reminder",
    better: "up",
    threshold: 5,
    format: pctFmt,
    delta: (d) => `${signed(Math.round(d))} pts`,
  },
  {
    key: "rework",
    label: "Rework rate",
    hint: "Submissions sent back for changes",
    better: "down",
    threshold: 4,
    format: pctFmt,
    delta: (d) => `${signed(Math.round(d))} pts`,
  },
  {
    key: "escalations",
    label: "Escalations",
    hint: "Times the ladder had to widen",
    better: "down",
    threshold: 2,
    format: (v) => (v === null ? "–" : String(Math.round(v))),
    delta: (d) => signed(Math.round(d)),
  },
];

/** "better" | "worse" | "flat" for a change, using the metric's noise threshold */
export function judge(def: MetricDef, cur: number | null, prev: number | null) {
  if (cur === null || prev === null) return { diff: 0, tone: "none" as const };
  const diff = cur - prev;
  if (Math.abs(diff) < def.threshold) return { diff, tone: "flat" as const };
  const improved = def.better === "up" ? diff > 0 : diff < 0;
  return { diff, tone: improved ? ("better" as const) : ("worse" as const) };
}

/** split of a task's cycle time, estimated from reminders, timers and review waits */
export function timeSplit(t: Totals) {
  const tasks = Math.max(1, t.approved);
  const ack = t.assigned ? t.ackWeighted / t.assigned : 0;
  // time to the first OK, plus the usual gap between seeing a task and starting it
  const waiting = (ack * 1.6) / 60;
  const working = t.actualHours / tasks;
  const review = t.submissions ? t.reviewWeighted / Math.max(1, t.submissions) : 0;
  // overruns past the estimate are mostly time spent stuck, plus a share per escalation
  const blocked = (t.overrunHours * 0.55 + t.escalations * 1.5) / tasks;
  const parts = [
    { key: "waiting", label: "Waiting to start", hours: waiting, color: "var(--color-line-strong)" },
    { key: "working", label: "In progress", hours: working, color: "var(--color-ink)" },
    { key: "review", label: "Waiting for review", hours: review, color: "var(--color-faint)" },
    { key: "blocked", label: "Blocked", hours: blocked, color: "var(--color-heat-2)" },
  ];
  const total = parts.reduce((s, p) => s + p.hours, 0);
  return { parts, total };
}

export const hoursLabel = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h < 10 ? h.toFixed(1) : Math.round(h)}h`);

export interface PersonRow {
  person: Person;
  rates: Rates;
  totals: Totals;
}

export function fieldNote(p: Person) {
  return p.workType === "field" ? "Field" : "Desk";
}
