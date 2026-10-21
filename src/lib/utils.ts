import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  differenceInMinutes,
  format,
  isToday,
  isTomorrow,
  isYesterday,
  isSameYear,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

/** "10:42" or "Tue 10:42" or "12 Oct" */
export function formatWhen(iso: string | Date | undefined, opts: { withDay?: boolean } = {}) {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow ${format(d, "h:mm a")}`;
  if (opts.withDay) return format(d, "EEE d MMM, h:mm a");
  return isSameYear(d, new Date()) ? format(d, "d MMM") : format(d, "d MMM yyyy");
}

/** Due label tuned for scanning: "Due 5:00 PM", "Due tomorrow", "2h overdue" */
export function dueLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const mins = differenceInMinutes(d, now);
  if (mins < 0) {
    const late = Math.abs(mins);
    if (late < 60) return `${late} min overdue`;
    if (late < 60 * 24) return `${Math.round(late / 60)}h overdue`;
    return `${Math.round(late / 60 / 24)}d overdue`;
  }
  if (isToday(d)) return `Due ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Due tomorrow ${format(d, "h:mm a")}`;
  if (mins < 60 * 24 * 6) return `Due ${format(d, "EEE h:mm a")}`;
  return `Due ${format(d, "d MMM")}`;
}

export function ago(iso: string | undefined, now = new Date()) {
  if (!iso) return "";
  const mins = differenceInMinutes(now, new Date(iso));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function minutesToLabel(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
