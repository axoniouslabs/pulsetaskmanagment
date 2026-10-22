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
