/**
 * Organisation-local time. The server runs in UTC; every rule about working
 * hours, "today" and digests is decided in the company's own time zone.
 */
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { OrgSettings } from "@/lib/types";
import type { World } from "./world";

export interface LocalNow {
  /** yyyy-MM-dd in the org time zone */
  date: string;
  /** minutes since local midnight */
  minutes: number;
  /** 0 = Sunday */
  dow: number;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function localNow(now: Date, tz: string): LocalNow {
  const z = new TZDate(now, tz || "Asia/Karachi");
  return { date: format(z, "yyyy-MM-dd"), minutes: z.getHours() * 60 + z.getMinutes(), dow: z.getDay() };
}

export function localDate(at: Date | string, tz: string) {
  return format(new TZDate(new Date(at), tz || "Asia/Karachi"), "yyyy-MM-dd");
}

export const previousDate = (date: string) => format(addDays(new Date(`${date}T12:00:00Z`), -1), "yyyy-MM-dd");

export const isHoliday = (s: OrgSettings, date: string) => s.holidays.some((h) => h.date === date);

export const isWorkDay = (s: OrgSettings, l: LocalNow) => s.workDays.includes(l.dow) && !isHoliday(s, l.date);

export function isWorkingTime(s: OrgSettings, now: Date) {
  const l = localNow(now, s.timezone);
  return isWorkDay(s, l) && l.minutes >= toMinutes(s.workStart) && l.minutes < toMinutes(s.workEnd);
}

/** away today: marked on leave, or an approved leave covers today */
export function isAway(w: Pick<World, "people" | "leaves">, personId: string, date: string) {
  const p = w.people.find((x) => x.id === personId);
  if (!p || p.active === false) return true;
  if (p.onLeave) return true;
  return w.leaves.some((l) => l.personId === personId && l.status === "approved" && l.from <= date && l.to >= date);
}

/* ---------------- per-person schedules ---------------- */

export interface Schedule {
  timezone: string;
  workDays: number[];
  workStart: string;
  workEnd: string;
  holidays: OrgSettings["holidays"];
}

type ScheduleWorld = Pick<World, "settings" | "people" | "departments">;

/**
 * The working hours that apply to one person: their own override, else their
 * department's, else the company's. Holidays are always the company's.
 */
export function scheduleFor(w: ScheduleWorld, personId?: string): Schedule {
  const s = w.settings;
  const p = personId ? w.people.find((x) => x.id === personId) : undefined;
  const d = p ? w.departments.find((x) => x.id === p.departmentId)?.settings : undefined;
  const own = p?.schedule;
  const pick = <K extends "workDays" | "workStart" | "workEnd">(k: K) => (own?.[k] ?? d?.[k] ?? s[k]) as Schedule[K];
  return {
    timezone: own?.timezone || s.timezone || "Asia/Karachi",
    workDays: pick("workDays")?.length ? pick("workDays") : s.workDays,
    workStart: pick("workStart"),
    workEnd: pick("workEnd"),
    holidays: s.holidays,
  };
}

export const localNowFor = (w: ScheduleWorld, personId: string | undefined, now: Date) => localNow(now, scheduleFor(w, personId).timezone);

export function isWorkDayFor(w: ScheduleWorld, personId: string | undefined, now: Date) {
  const sc = scheduleFor(w, personId);
  const l = localNow(now, sc.timezone);
  return sc.workDays.includes(l.dow) && !sc.holidays.some((h) => h.date === l.date);
}

/** inside this person's working hours right now */
export function isWorkingTimeFor(w: ScheduleWorld, personId: string | undefined, now: Date) {
  const sc = scheduleFor(w, personId);
  const l = localNow(now, sc.timezone);
  return sc.workDays.includes(l.dow) && !sc.holidays.some((h) => h.date === l.date) && l.minutes >= toMinutes(sc.workStart) && l.minutes < toMinutes(sc.workEnd);
}

/** the UTC instant of a local wall-clock time on a local date, in a time zone */
export function zonedInstant(date: string, hhmm: string, tz: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, h || 0, min || 0, 0, tz || "Asia/Karachi").getTime());
}

/** a timer left running after work stops counting here */
export const OVERTIME_TIMER_HOURS = 3;

/**
 * When a running timer should stop on its own, so a forgotten timer never logs
 * a 14-hour day: the end of that working day, or a few hours after it was
 * started outside working hours.
 */
export function timerCutoff(w: ScheduleWorld, personId: string, startedAt: string): Date {
  const sc = scheduleFor(w, personId);
  const start = new Date(startedAt);
  const l = localNow(start, sc.timezone);
  const end = zonedInstant(l.date, sc.workEnd, sc.timezone);
  const workDay = sc.workDays.includes(l.dow) && !sc.holidays.some((h) => h.date === l.date);
  if (workDay && start < end) return end;
  return new Date(start.getTime() + OVERTIME_TIMER_HOURS * 3600000);
}

/**
 * When a deadline actually becomes overdue: at the deadline if it falls inside
 * the assignee's working hours, otherwise at the start of their next working
 * day. A 5pm deadline at a 5pm close is due at close, not overdue at 5:01.
 */
export function overdueFrom(w: ScheduleWorld, personId: string | undefined, dueIso: string): string {
  const sc = scheduleFor(w, personId);
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return dueIso;
  const l = localNow(due, sc.timezone);
  const off = (date: string, dow: number) => !sc.workDays.includes(dow) || sc.holidays.some((h) => h.date === date);
  const start = toMinutes(sc.workStart);
  const end = toMinutes(sc.workEnd);
  if (!off(l.date, l.dow) && l.minutes >= start && l.minutes < end) return due.toISOString();
  if (!off(l.date, l.dow) && l.minutes < start) return zonedInstant(l.date, sc.workStart, sc.timezone).toISOString();
  // after close, or a day off: the next working morning
  let d = new Date(`${l.date}T12:00:00Z`);
  for (let i = 0; i < 31; i++) {
    d = addDays(d, 1);
    const date = format(d, "yyyy-MM-dd");
    if (!off(date, d.getUTCDay())) return zonedInstant(date, sc.workStart, sc.timezone).toISOString();
  }
  return due.toISOString();
}

/** a date-only deadline is due at the end of that working day */
export function endOfWorkingDay(w: ScheduleWorld, personId: string | undefined, date: string): string {
  const sc = scheduleFor(w, personId);
  return zonedInstant(date, sc.workEnd, sc.timezone).toISOString();
}
