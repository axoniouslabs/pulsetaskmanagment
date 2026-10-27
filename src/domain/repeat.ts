/**
 * Repeat rules: when the next copy of a repeating task is due, and how to say
 * the rule in plain words. Dates are worked out on the assignee's own calendar
 * and keep the deadline's time of day.
 */
import { addDays, addMonths, differenceInCalendarWeeks, format, getDaysInMonth } from "date-fns";
import type { RepeatRule, Task } from "@/lib/types";
import { localNow, zonedInstant } from "./time";

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NTH: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** a task's rule: its own, or one read from the older simple repeat */
export function ruleOf(t: Pick<Task, "repeat" | "recurrence" | "dueAt">, tz = "Asia/Karachi"): RepeatRule | undefined {
  if (t.repeat) return t.repeat;
  if (!t.recurrence) return undefined;
  const l = localNow(new Date(t.dueAt), tz);
  if (t.recurrence === "daily") return { freq: "day", interval: 1, workingDays: true, mode: "schedule" };
  if (t.recurrence === "weekly") return { freq: "week", interval: 1, weekdays: [l.dow], mode: "schedule" };
  return { freq: "month", interval: 1, monthly: { kind: "date", day: Number(l.date.slice(8, 10)) }, mode: "schedule" };
}

/** the nth (or last) given weekday of a month, as yyyy-MM-dd */
function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const days = getDaysInMonth(first);
  if (nth === -1) {
    for (let d = days; d >= 1; d--) if (new Date(Date.UTC(year, month, d)).getUTCDay() === weekday) return format(new Date(Date.UTC(year, month, d, 12)), "yyyy-MM-dd");
  }
  let count = 0;
  for (let d = 1; d <= days; d++) {
    if (new Date(Date.UTC(year, month, d)).getUTCDay() !== weekday) continue;
    if (++count === nth) return format(new Date(Date.UTC(year, month, d, 12)), "yyyy-MM-dd");
  }
  return null; // e.g. a fifth Friday that doesn't exist
}

/**
 * The deadline of the next copy after `prevDue`, at the same local time of day.
 * `isOff` says whether a local date is a day off for the person (for working-day rules).
 * `anchor` is the first copy's local date, so "every 2 weeks" keeps its rhythm.
 */
export function nextDue(rule: RepeatRule, prevDue: Date, tz: string, isOff: (date: string, dow: number) => boolean, anchor?: string): Date {
  const prev = localNow(prevDue, tz);
  const time = `${String(Math.floor(prev.minutes / 60)).padStart(2, "0")}:${String(prev.minutes % 60).padStart(2, "0")}`;
  const at = (date: string) => zonedInstant(date, time, tz);
  const base = new Date(`${prev.date}T12:00:00Z`);
  const n = Math.max(1, Math.round(rule.interval || 1));

  if (rule.freq === "day") {
    let d = addDays(base, n);
    for (let i = 0; rule.workingDays && i < 60 && isOff(format(d, "yyyy-MM-dd"), d.getUTCDay()); i++) d = addDays(d, 1);
    return at(format(d, "yyyy-MM-dd"));
  }

  if (rule.freq === "week") {
    const days = rule.weekdays?.length ? rule.weekdays : [prev.dow];
    const start = new Date(`${anchor ?? prev.date}T12:00:00Z`);
    for (let i = 1; i <= 7 * n * 2 + 7; i++) {
      const d = addDays(base, i);
      if (!days.includes(d.getUTCDay())) continue;
      const weeks = differenceInCalendarWeeks(d, start, { weekStartsOn: 1 });
      if (weeks % n !== 0) continue;
      return at(format(d, "yyyy-MM-dd"));
    }
    return at(format(addDays(base, 7 * n), "yyyy-MM-dd"));
  }

  // monthly
  const m = rule.monthly ?? { kind: "date" as const, day: Number(prev.date.slice(8, 10)) };
  for (let step = n; step <= n * 24; step += n) {
    const target = addMonths(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1, 12)), step);
    const y = target.getUTCFullYear();
    const mo = target.getUTCMonth();
    if (m.kind === "date") {
      const day = Math.min(m.day, getDaysInMonth(target));
      return at(`${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
    const date = nthWeekday(y, mo, m.weekday, m.nth);
    if (date) return at(date);
  }
  return at(format(addMonths(base, n), "yyyy-MM-dd"));
}

/** "Every Mon, Wed and Fri", "Monthly on the last Friday", "3 days after the last one is approved" */
export function describeRule(rule: RepeatRule): string {
  let s: string;
  const n = Math.max(1, rule.interval || 1);
  if (rule.mode === "afterDone") s = `${rule.afterDays ?? n} ${(rule.afterDays ?? n) === 1 ? "day" : "days"} after the last one is approved`;
  else if (rule.freq === "day") s = n === 1 ? (rule.workingDays ? "Every working day" : "Every day") : `Every ${n} ${rule.workingDays ? "working days" : "days"}`;
  else if (rule.freq === "week") {
    const days = (rule.weekdays ?? []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const list = days.length === 1 ? DAY[days[0]] : days.length ? `${days.slice(0, -1).map((d) => SHORT[d]).join(", ")} and ${SHORT[days[days.length - 1]]}` : "the same day";
    s = n === 1 ? `Every ${list}` : `Every ${n} weeks on ${list}`;
  } else {
    const m = rule.monthly;
    const on = !m ? "the same date" : m.kind === "date" ? `the ${ordinal(m.day)}` : `the ${NTH[m.nth]} ${DAY[m.weekday]}`;
    s = n === 1 ? `Monthly on ${on}` : `Every ${n} months on ${on}`;
  }
  if (rule.ends?.kind === "count") s += `, ${rule.ends.count} times`;
  if (rule.ends?.kind === "date") s += `, until ${format(new Date(`${rule.ends.date}T12:00:00Z`), "d MMM yyyy")}`;
  return s;
}

/** short label for a row: "Daily", "Weekly", "Monthly", "Repeats" */
export function shortRule(rule: RepeatRule) {
  if (rule.mode === "afterDone") return "Repeats";
  return rule.freq === "day" ? (rule.interval > 1 ? `Every ${rule.interval}d` : "Daily") : rule.freq === "week" ? (rule.interval > 1 ? `Every ${rule.interval}w` : "Weekly") : "Monthly";
}
