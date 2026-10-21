import { addDays, nextDay, set as setTime, type Day } from "date-fns";
import type { Person, Priority } from "./types";

export interface Parsed {
  title: string;
  assigneeId?: string;
  dueAt?: Date;
  priority?: Priority;
  tags: string[];
}

const DAYS: Record<string, Day> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * "Send invoice to Ali tomorrow 5pm #accounts !high"
 * → title "Send invoice to Ali", assignee Ali, tomorrow 17:00, tag accounts, high
 */
export function parseQuickAdd(input: string, people: Person[], now = new Date()): Parsed {
  let text = ` ${input} `;
  const tags: string[] = [];
  let priority: Priority | undefined;
  let assigneeId: string | undefined;
  let day: Date | undefined;
  let hour: number | undefined;
  let minute = 0;

  text = text.replace(/\s!(urgent|high|normal|low)\b/gi, (_, p) => {
    priority = p.toLowerCase() as Priority;
    return " ";
  });
  text = text.replace(/\s#([\w-]+)/g, (_, t) => {
    tags.push(t.toLowerCase());
    return " ";
  });
  text = text.replace(/\s@(\w+)/g, (m, n) => {
    const p = people.find((x) => x.name.toLowerCase().startsWith(n.toLowerCase()));
    if (p) {
      assigneeId = p.id;
      return ` ${p.name.split(" ")[0]} `;
    }
    return m;
  });
  if (!assigneeId) {
    const m = text.match(/\b(?:to|for)\s+([A-Z][a-z]+)/);
    if (m) {
      const p = people.find((x) => x.name.split(" ")[0].toLowerCase() === m[1].toLowerCase());
      if (p) assigneeId = p.id;
    }
  }
  text = text.replace(/\s(today|tonight)\b/gi, () => {
    day = now;
    return " ";
  });
  text = text.replace(/\s(tomorrow|tmrw)\b/gi, () => {
    day = addDays(now, 1);
    return " ";
  });
  text = text.replace(/\s(?:on\s)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/gi, (_, d) => {
    day = nextDay(now, DAYS[d.toLowerCase().slice(0, 3)]);
    return " ";
  });
  text = text.replace(/\s(?:at\s|by\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/gi, (_, h, mm, ap) => {
    hour = (Number(h) % 12) + (ap.toLowerCase() === "pm" ? 12 : 0);
    minute = mm ? Number(mm) : 0;
    return " ";
  });
  text = text.replace(/\s(?:at\s|by\s)?([01]?\d|2[0-3]):(\d{2})\b/g, (_, h, mm) => {
    hour = Number(h);
    minute = Number(mm);
    return " ";
  });

  let dueAt: Date | undefined;
  if (day || hour !== undefined) {
    dueAt = setTime(day ?? now, { hours: hour ?? 17, minutes: hour !== undefined ? minute : 0, seconds: 0, milliseconds: 0 });
    if (!day && dueAt < now) dueAt = addDays(dueAt, 1);
  }

  return { title: text.replace(/\s+/g, " ").trim(), assigneeId, dueAt, priority, tags };
}
