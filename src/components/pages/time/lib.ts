import { addDays, differenceInMinutes, format, parseISO } from "date-fns";
import type { AttendanceDay, Department, Leave, OrgSettings, Person } from "@/lib/types";
import { minutesToLabel } from "@/lib/utils";

export type DayStatus = AttendanceDay["status"];

/** one colour per status; heat only for late and absent */
export const STATUS_META: Record<DayStatus, { label: string; cell: string; text: string }> = {
  present: { label: "Present", cell: "bg-ink/70", text: "text-text" },
  late: { label: "Late", cell: "bg-heat-1", text: "text-heat-1" },
  absent: { label: "Absent", cell: "bg-heat-3", text: "text-heat-3" },
  leave: { label: "On leave", cell: "bg-line-strong", text: "text-faint" },
  holiday: { label: "Holiday", cell: "bg-info-tint ring-1 ring-inset ring-info/30", text: "text-muted" },
  weekend: { label: "Weekend", cell: "", text: "text-faint" },
};

export const LEAVE_LABEL: Record<Leave["type"], string> = { sick: "Sick leave", annual: "Annual leave", casual: "Casual leave" };

export const day = (d: string) => parseISO(d);
export const time = (iso?: string) => (iso ? format(new Date(iso), "h:mm a") : "");

/** minutes between check-in and check-out (or now, while still in), minus breaks */
export function workedMinutes(a: AttendanceDay | undefined, now: Date) {
  if (!a?.checkIn) return 0;
  const end = a.checkOut ? new Date(a.checkOut) : a.date === format(now, "yyyy-MM-dd") ? now : undefined;
  if (!end) return 0;
  return Math.max(0, differenceInMinutes(end, new Date(a.checkIn)) - a.breakMin);
}

/** minutes after the official start time */
export function minutesLate(a: AttendanceDay | undefined, settings: Pick<OrgSettings, "workStart">) {
  if (!a?.checkIn) return 0;
  const [h, m] = settings.workStart.split(":").map(Number);
  const start = parseISO(a.date);
  start.setHours(h, m, 0, 0);
  return Math.max(0, differenceInMinutes(new Date(a.checkIn), start));
}

export const startLabel = (hhmm: string) => format(parseISO(`2000-01-01T${hhmm}`), "h:mm a");

export const approvedLeaveOn = (leaves: Leave[], personId: string, date: string) =>
  leaves.find((l) => l.personId === personId && l.status === "approved" && l.from <= date && l.to >= date);

/** "Thu 22 Oct" or "Thu 22 Oct to Sat 24 Oct" */
export function leaveRange(l: Pick<Leave, "from" | "to">) {
  const f = format(day(l.from), "EEE d MMM");
  return l.from === l.to ? f : `${f} to ${format(day(l.to), "EEE d MMM")}`;
}

/** working days in a leave, skipping weekends and holidays */
export function leaveDays(l: Pick<Leave, "from" | "to">, settings: Pick<OrgSettings, "workDays" | "holidays">) {
  let n = 0;
  const holidays = new Set(settings.holidays.map((h) => h.date));
  for (let d = day(l.from); format(d, "yyyy-MM-dd") <= l.to; d = addDays(d, 1)) {
    if (settings.workDays.includes(d.getDay()) && !holidays.has(format(d, "yyyy-MM-dd"))) n++;
    if (n > 400) break;
  }
  return n;
}

/** first working day after a leave ends */
export function backOn(l: Pick<Leave, "to">, settings: Pick<OrgSettings, "workDays" | "holidays">) {
  const holidays = new Set(settings.holidays.map((h) => h.date));
  let d = addDays(day(l.to), 1);
  for (let i = 0; i < 30 && (!settings.workDays.includes(d.getDay()) || holidays.has(format(d, "yyyy-MM-dd"))); i++) d = addDays(d, 1);
  return d;
}

/* ---------- CSV export ---------- */
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportAttendanceCsv({
  rows,
  people,
  departments,
  now,
}: {
  rows: AttendanceDay[];
  people: Person[];
  departments: Department[];
  now: Date;
}) {
  const name = (id: string) => people.find((p) => p.id === id);
  const header = ["Date", "Name", "Title", "Department", "Status", "Check in", "Check out", "Break (min)", "Worked (h)", "Worked"];
  const body = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date) || (name(a.personId)?.name ?? "").localeCompare(name(b.personId)?.name ?? ""))
    .map((a) => {
      const p = name(a.personId);
      const mins = workedMinutes(a, now);
      return [
        a.date,
        p?.name ?? a.personId,
        p?.title ?? "",
        departments.find((d) => d.id === p?.departmentId)?.name ?? "",
        STATUS_META[a.status].label,
        a.checkIn ? format(new Date(a.checkIn), "HH:mm") : "",
        a.checkOut ? format(new Date(a.checkOut), "HH:mm") : "",
        a.checkIn ? a.breakMin : "",
        mins ? (mins / 60).toFixed(2) : "",
        mins ? minutesToLabel(mins) : "",
      ];
    });
  const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${format(now, "yyyy-MM")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return body.length;
}

/** who approves someone's leave: team lead, else department head, else the owner (same rule as the store) */
export function approverFor(
  s: { people: Person[]; teams: { id: string; leadId: string }[]; departments: Department[] },
  personId: string,
) {
  const p = s.people.find((x) => x.id === personId);
  const lead = s.teams.find((t) => t.id === p?.teamId)?.leadId;
  const head = s.departments.find((d) => d.id === p?.departmentId)?.headId;
  const id = lead && lead !== personId ? lead : head && head !== personId ? head : s.people.find((x) => x.role === "owner")?.id;
  return s.people.find((x) => x.id === id);
}
