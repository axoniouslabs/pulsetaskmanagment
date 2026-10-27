"use client";

import * as React from "react";
import { addMonths, eachDayOfInterval, endOfMonth, format, isAfter, parseISO, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { useApp } from "@/lib/store";
import type { AttendanceDay, Person } from "@/lib/types";
import { scheduleFor } from "@/domain/time";
import { cn, minutesToLabel } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { approvedLeaveOn, workedMinutes } from "./lib";

export interface MonthRow {
  person: Person;
  workingDays: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  minutes: number;
  breakMinutes: number;
}

/** one person's month: days present, late, absent, on leave, and hours worked */
export function summarise(
  person: Person,
  month: string,
  attendance: AttendanceDay[],
  ctx: { settings: Parameters<typeof scheduleFor>[0]["settings"]; people: Person[]; departments: Parameters<typeof scheduleFor>[0]["departments"]; leaves: Parameters<typeof approvedLeaveOn>[0] },
  now: Date,
): MonthRow {
  const sc = scheduleFor(ctx, person.id);
  const start = parseISO(`${month}-01`);
  const last = endOfMonth(start);
  const today = format(now, "yyyy-MM-dd");
  const row: MonthRow = { person, workingDays: 0, present: 0, late: 0, absent: 0, leave: 0, minutes: 0, breakMinutes: 0 };
  // days before someone's first attendance record (they joined later, or Pulse started later) are not absences
  const since = attendance.reduce<string | null>((m, a) => (a.personId === person.id && (!m || a.date < m) ? a.date : m), null);
  for (const d of eachDayOfInterval({ start, end: isAfter(last, now) ? now : last })) {
    const date = format(d, "yyyy-MM-dd");
    const rec = attendance.find((a) => a.personId === person.id && a.date === date);
    const working = sc.workDays.includes(d.getDay()) && !sc.holidays.some((h) => h.date === date);
    if (working && (since === null || date >= since)) row.workingDays++;
    if (rec?.checkIn) {
      row.present++;
      if (rec.status === "late") row.late++;
      row.minutes += workedMinutes(rec, now);
      row.breakMinutes += rec.breakMin;
    } else if (approvedLeaveOn(ctx.leaves, person.id, date) || rec?.status === "leave") {
      if (working) row.leave++;
    } else if (working && date < today && (rec?.status === "absent" || (since !== null && date >= since))) row.absent++;
  }
  return row;
}

/** the month at a glance for everyone in view, with an Excel export (spec §9) */
export function MonthSummary({ people, now }: { people: Person[]; now: Date }) {
  const loaded = useApp((s) => s.attendance);
  const settings = useApp((s) => s.settings);
  const allPeople = useApp((s) => s.people);
  const departments = useApp((s) => s.departments);
  const leaves = useApp((s) => s.leaves);
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => format(addMonths(startOfMonth(now), -i), "yyyy-MM")), [now]);
  const [month, setMonth] = React.useState(months[0]);
  const [fetched, setFetched] = React.useState<Record<string, AttendanceDay[]>>({});
  // the app holds about five weeks; older months are fetched when picked
  const needsFetch = month !== months[0];
  React.useEffect(() => {
    if (!needsFetch || fetched[month]) return;
    let alive = true;
    fetch(`/api/attendance?month=${month}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { attendance: AttendanceDay[] }) => alive && setFetched((f) => ({ ...f, [month]: d.attendance })))
      .catch(() => alive && toast.error("Couldn't load that month", { description: "Check your connection and try again." }));
    return () => {
      alive = false;
    };
  }, [month, needsFetch, fetched]);
  const records = fetched[month] ?? loaded;
  const loading = needsFetch && !fetched[month];
  const rows = React.useMemo(
    () => people.filter((p) => p.role !== "owner").map((p) => summarise(p, month, records, { settings, people: allPeople, departments, leaves }, now)),
    [people, month, records, settings, allPeople, departments, leaves, now],
  );
  const label = format(parseISO(`${month}-01`), "MMMM yyyy");

  const exportIt = () =>
    downloadXlsx(`attendance-${month}.xlsx`, [
      {
        name: label,
        widths: [24, 14, 10, 8, 9, 8, 14, 14],
        rows: [
          ["Person", "Working days", "Present", "Late", "Absent", "Leave", "Hours worked", "Break hours"],
          ...rows.map((r) => [r.person.name, r.workingDays, r.present, r.late, r.absent, r.leave, Math.round((r.minutes / 60) * 10) / 10, Math.round((r.breakMinutes / 60) * 10) / 10]),
        ],
      },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-auto" aria-label="Month">
          {months.map((m) => (
            <option key={m} value={m}>
              {format(parseISO(`${m}-01`), "MMMM yyyy")}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={exportIt} disabled={!rows.length || loading}>
          <FileDown /> Export Excel
        </Button>
      </div>
      <Panel className="overflow-hidden">
        <div className="thin-scrollbar relative overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-hover text-[12.5px] text-muted">
                <th scope="col" className="py-2.5 pl-4 pr-3 text-left font-medium">
                  {loading ? `Loading ${label}…` : label}
                </th>
                {["Working days", "Present", "Late", "Absent", "Leave", "Hours worked"].map((h) => (
                  <th key={h} scope="col" className="px-3 text-right font-medium last:pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person.id} className="border-b border-line last:border-b-0">
                  <td className="py-2.5 pl-4 pr-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar person={r.person} size="sm" />
                      <span className="truncate font-medium text-text">{r.person.name}</span>
                    </span>
                  </td>
                  <td className="tabular px-3 text-right text-muted">{r.workingDays}</td>
                  <td className="tabular px-3 text-right">{r.present}</td>
                  <td className={cn("tabular px-3 text-right", r.late > 2 && "font-medium text-heat-1")}>{r.late}</td>
                  <td className={cn("tabular px-3 text-right", r.absent > 0 && "font-medium text-heat-3")}>{r.absent}</td>
                  <td className="tabular px-3 text-right">{r.leave}</td>
                  <td className="tabular px-3 pr-4 text-right">{minutesToLabel(r.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-[12.5px] text-muted">Working days follow each person&apos;s own days and the company holidays. Hours worked are check-in to check-out, minus breaks.</p>
    </div>
  );
}

/** an employee's own month so far */
export function MyMonth({ person, now }: { person: Person; now: Date }) {
  const attendance = useApp((s) => s.attendance);
  const settings = useApp((s) => s.settings);
  const people = useApp((s) => s.people);
  const departments = useApp((s) => s.departments);
  const leaves = useApp((s) => s.leaves);
  const month = format(now, "yyyy-MM");
  const r = summarise(person, month, attendance, { settings, people, departments, leaves }, now);
  const items = [
    { l: "Present", v: `${r.present} of ${r.workingDays} days` },
    { l: "Late", v: String(r.late), warn: r.late > 2 },
    { l: "Absent", v: String(r.absent), warn: r.absent > 0 },
    { l: "On leave", v: String(r.leave) },
    { l: "Hours worked", v: minutesToLabel(r.minutes) },
  ];
  return (
    <section>
      <h2 className="mb-2.5 text-[15px] font-semibold text-text">{format(now, "MMMM")} so far</h2>
      <dl className="divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface text-[13.5px]">
        {items.map((i) => (
          <div key={i.l} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted">{i.l}</dt>
            <dd className={cn("tabular font-medium", i.warn ? "text-heat-2" : "text-text")}>{i.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
