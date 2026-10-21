"use client";

import { addDays, format, startOfDay } from "date-fns";
import { CalendarOff, MapPin, Monitor } from "lucide-react";
import type { AttendanceDay, Department, Device, Leave, Person, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/** the next `count` working days starting today (Sundays and other off days skipped) */
export function upcomingWorkDays(from: Date, count: number, workDays: number[]) {
  const days = workDays.length ? workDays : [1, 2, 3, 4, 5, 6];
  const out: Date[] = [];
  let d = startOfDay(from);
  for (let guard = 0; out.length < count && guard < 60; guard++) {
    if (d.getDay() !== 0 && days.includes(d.getDay())) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

const covers = (l: Leave, personId: string, key: string) => l.personId === personId && l.status === "approved" && l.from <= key && l.to >= key;

/**
 * Is this person away on `day`? Today follows the on-leave switch, later days follow
 * approved leave. Someone switched on leave with no leave record is treated as away
 * until they are marked back.
 */
export function isAwayOn(p: Person, day: Date, leaves: Leave[], now: Date) {
  const key = dayKey(day);
  const today = dayKey(now);
  if (key === today) return !!p.onLeave;
  if (leaves.some((l) => covers(l, p.id, key))) return true;
  if (p.onLeave) return !leaves.some((l) => covers(l, p.id, today));
  return false;
}

/** who picks up new work while someone is away */
export function backupOf(p: Person, people: Person[], teams: Team[], departments: Department[]) {
  const find = (id?: string) => (id && id !== p.id ? people.find((x) => x.id === id) : undefined);
  return (
    find(p.backupId) ??
    find(teams.find((t) => t.id === p.teamId)?.leadId) ??
    find(departments.find((d) => d.id === p.departmentId)?.headId) ??
    people.find((x) => x.role === "owner" && x.id !== p.id)
  );
}

/** 0 → "0", 2 → "2", 3.25 → "3.3" */
export function fmtHours(h: number) {
  if (h < 0.05) return "0";
  const r = Math.round(h * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export type LoadTone = "light" | "steady" | "full" | "over";

export function loadTone(hours: number, capacity: number): LoadTone {
  const ratio = hours / (capacity || 8);
  if (ratio > 1) return "over";
  if (ratio >= 0.9) return "full";
  if (ratio >= 0.6) return "steady";
  return "light";
}

export const LOAD_STYLE: Record<LoadTone, { cell: string; bar: "ink" | "heat-1" | "heat-3"; label: string }> = {
  light: { cell: "bg-ink-tint/45 text-muted", bar: "ink", label: "Under 60%" },
  steady: { cell: "bg-ink-tint text-ink", bar: "ink", label: "60 to 90%" },
  full: { cell: "bg-heat-1-tint text-heat-1", bar: "heat-1", label: "90 to 100%" },
  over: { cell: "bg-heat-3-tint text-heat-3", bar: "heat-3", label: "Over capacity" },
};

/** teams in a stable order: by department, then as created */
export function orderedTeams(teams: Team[], departments: Department[]) {
  const deptIndex = new Map(departments.map((d, i) => [d.id, i]));
  return [...teams].sort((a, b) => (deptIndex.get(a.departmentId) ?? 99) - (deptIndex.get(b.departmentId) ?? 99));
}

/** people grouped under their team, lead first */
export function groupByTeam(people: Person[], teams: Team[], departments: Department[]) {
  const groups = orderedTeams(teams, departments)
    .map((team) => ({
      team,
      department: departments.find((d) => d.id === team.departmentId),
      people: people
        .filter((p) => p.teamId === team.id)
        .sort((a, b) => (a.id === team.leadId ? -1 : b.id === team.leadId ? 1 : a.name.localeCompare(b.name))),
    }))
    .filter((g) => g.people.length > 0);
  const loose = people.filter((p) => !teams.some((t) => t.id === p.teamId));
  return { groups, loose };
}

export const deviceNoun = (d: Device) => (d.kind === "windows" ? "PC" : d.kind === "browser" ? "Browser" : "Phone");

/** "Phone isn't receiving notifications" for the first unhealthy device, if any */
export function deviceWarning(p: Person) {
  const bad = p.devices.find((d) => !d.healthy);
  return bad ? `${deviceNoun(bad)} isn't receiving notifications` : null;
}

export function WorkTag({ person, className }: { person: Person; className?: string }) {
  const field = person.workType === "field";
  const Icon = field ? MapPin : Monitor;
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-sunken px-2 text-[11.5px] font-medium text-muted", className)}>
      <Icon className="size-3" />
      {field ? "Field" : "Desk"}
    </span>
  );
}

export function LeaveTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-sunken px-2 text-[11.5px] font-medium text-muted", className)}>
      <CalendarOff className="size-3" />
      On leave
    </span>
  );
}

/** attendance for today as a short, plain phrase */
export function attendanceLabel(p: Person, att: AttendanceDay | undefined): { text: string; tone: "ok" | "late" | "muted" | "faint" } {
  if (p.onLeave || att?.status === "leave") return { text: "On leave", tone: "muted" };
  if (!att) return { text: "Not checked in", tone: "faint" };
  if (att.status === "weekend") return { text: "Day off", tone: "faint" };
  if (att.status === "holiday") return { text: "Holiday", tone: "faint" };
  if (att.status === "absent") return { text: "Absent", tone: "muted" };
  if (!att.checkIn) return { text: "Not checked in", tone: "faint" };
  if (att.checkOut) return { text: `Left at ${format(new Date(att.checkOut), "h:mm a")}`, tone: "muted" };
  const at = format(new Date(att.checkIn), "h:mm a");
  return att.status === "late" ? { text: `Late, in at ${at}`, tone: "late" } : { text: `In at ${at}`, tone: "ok" };
}

export function AttendanceText({ person, att, className }: { person: Person; att: AttendanceDay | undefined; className?: string }) {
  const a = attendanceLabel(person, att);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px]",
        a.tone === "ok" && "text-text",
        a.tone === "late" && "font-medium text-heat-1",
        a.tone === "muted" && "text-muted",
        a.tone === "faint" && "text-faint",
        className,
      )}
    >
      {a.tone === "ok" && <span className="size-1.5 rounded-full bg-ok" aria-hidden />}
      {a.tone === "late" && <span className="size-1.5 rounded-full bg-heat-1" aria-hidden />}
      {a.text}
    </span>
  );
}
