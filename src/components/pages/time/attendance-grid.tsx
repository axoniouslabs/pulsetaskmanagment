"use client";

import * as React from "react";
import { format, subDays } from "date-fns";
import { useApp } from "@/lib/store";
import type { Person } from "@/lib/types";
import { cn, minutesToLabel, plural } from "@/lib/utils";
import { Tip } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { STATUS_META, approvedLeaveOn, minutesLate, time, workedMinutes, type DayStatus } from "./lib";

type Cell = DayStatus | "pending" | "none";

const LEGEND: { key: DayStatus; label: string }[] = [
  { key: "present", label: "Present" },
  { key: "late", label: "Late" },
  { key: "absent", label: "Absent" },
  { key: "leave", label: "Leave" },
  { key: "holiday", label: "Holiday" },
  { key: "weekend", label: "Sunday" },
];

export function AttendanceGrid({ people, now, groupByDepartment }: { people: Person[]; now: Date; groupByDepartment: boolean }) {
  const attendance = useApp((s) => s.attendance);
  const leaves = useApp((s) => s.leaves);
  const settings = useApp((s) => s.settings);
  const departments = useApp((s) => s.departments);
  const today = format(now, "yyyy-MM-dd");

  const days = React.useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = subDays(now, 13 - i);
        return { d, date: format(d, "yyyy-MM-dd"), sunday: d.getDay() === 0 };
      }),
    [now],
  );

  const rows = React.useMemo(() => {
    const byKey = new Map(attendance.map((a) => [`${a.personId}|${a.date}`, a]));
    return people.map((p) => {
      const cells = days.map(({ date, sunday }) => {
        const rec = byKey.get(`${p.id}|${date}`);
        const holiday = settings.holidays.find((h) => h.date === date);
        let status: Cell;
        if (rec?.checkIn) status = rec.status;
        else if (rec && rec.status !== "present") status = rec.status;
        else if (sunday) status = "weekend";
        else if (holiday) status = "holiday";
        else if (approvedLeaveOn(leaves, p.id, date)) status = "leave";
        else status = date === today ? "pending" : "none";
        return { date, rec, status, holiday: holiday?.name };
      });
      return {
        person: p,
        cells,
        late: cells.filter((c) => c.status === "late").length,
        absent: cells.filter((c) => c.status === "absent").length,
      };
    });
  }, [people, days, attendance, leaves, settings.holidays, today]);

  const sections = React.useMemo(() => {
    if (!groupByDepartment) return [{ id: "all", name: "", rows }];
    return departments
      .map((d) => ({ id: d.id, name: d.name, rows: rows.filter((r) => r.person.departmentId === d.id) }))
      .filter((s) => s.rows.length);
  }, [rows, departments, groupByDepartment]);

  const lateTotal = rows.reduce((s, r) => s + r.late, 0);
  const absentTotal = rows.reduce((s, r) => s + r.absent, 0);
  const worst = [...rows].sort((a, b) => b.late - a.late)[0];

  const tip = (p: Person, c: (typeof rows)[number]["cells"][number]) => {
    const when = format(new Date(`${c.date}T12:00:00`), "EEE d MMM");
    if (c.status === "late" || c.status === "present") {
      const worked = workedMinutes(c.rec, now);
      const lateBy = c.status === "late" ? minutesLate(c.rec, settings) : 0;
      return `${p.name.split(" ")[0]}, ${when}: in at ${time(c.rec?.checkIn)}${lateBy ? ` (${lateBy} min late)` : ""}${c.rec?.checkOut ? `, out at ${time(c.rec.checkOut)}` : ""}${worked ? `, ${minutesToLabel(worked)} worked` : ""}`;
    }
    if (c.status === "pending") return `${p.name.split(" ")[0]}, today: not in yet`;
    if (c.status === "none") return `${p.name.split(" ")[0]}, ${when}: no record`;
    if (c.status === "holiday") return `${when}: ${c.holiday ?? "Holiday"}`;
    return `${p.name.split(" ")[0]}, ${when}: ${STATUS_META[c.status].label}`;
  };

  return (
    <div className="space-y-4">
      <p className="text-[14px] leading-relaxed text-muted">
        <span className={cn("font-medium", lateTotal ? "text-heat-1" : "text-text")}>{plural(lateTotal, "late arrival")}</span> and{" "}
        <span className={cn("font-medium", absentTotal ? "text-heat-3" : "text-text")}>{plural(absentTotal, "absence")}</span> in the last 14 days.
        {worst && worst.late >= 3 && ` ${worst.person.name} was late most often, ${worst.late} times.`}
      </p>

      <Panel className="overflow-hidden">
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">Attendance for the last 14 days, one row per person</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-[2] min-w-[150px] border-b border-line bg-surface px-4 py-2.5 text-left font-medium text-muted shadow-[1px_0_0_var(--color-line)] sm:min-w-[200px]">
                  Person
                </th>
                {days.map(({ d, date, sunday }) => (
                  <th key={date} scope="col" className={cn("min-w-[30px] border-b border-line px-0.5 py-2 text-center font-normal", sunday && "bg-sunken/70")}>
                    <span className="block text-[11px] text-faint">{format(d, "EEEEE")}</span>
                    <span className={cn("tabular block text-[12.5px]", date === today ? "font-semibold text-ink" : "text-muted")}>{format(d, "d")}</span>
                  </th>
                ))}
                <th scope="col" className="border-b border-line py-2.5 pl-4 pr-2 text-right font-medium text-muted">
                  Late
                </th>
                <th scope="col" className="border-b border-line py-2.5 pl-2 pr-4 text-right font-medium text-muted">
                  Absent
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <React.Fragment key={s.id}>
                  {s.name && (
                    <tr>
                      <td colSpan={days.length + 3} className="border-b border-line bg-[#fafbfb] px-4 py-1.5">
                        <span className="sticky left-4 inline-block text-[12.5px] font-semibold text-text">{s.name}</span>
                      </td>
                    </tr>
                  )}
                  {s.rows.map((r) => (
                    <tr key={r.person.id} className="group">
                      <th scope="row" className="sticky left-0 z-[1] border-b border-line bg-surface px-4 py-2 text-left font-normal shadow-[1px_0_0_var(--color-line)] group-hover:bg-[#fafbfb]">
                        <span className="flex items-center gap-2">
                          <Avatar person={r.person} size="xs" />
                          <span className="max-w-[104px] truncate font-medium text-text sm:max-w-[150px]">{r.person.name}</span>
                        </span>
                      </th>
                      {r.cells.map((c) => (
                        <td key={c.date} className={cn("border-b border-line px-0.5 py-2 text-center group-hover:bg-[#fafbfb]", c.status === "weekend" && "bg-sunken/70 group-hover:bg-sunken")}>
                          {c.status === "weekend" ? (
                            <span className="mx-auto block h-[2px] w-2.5 rounded-full bg-line-strong" aria-label="Sunday" role="img" />
                          ) : (
                            <Tip label={tip(r.person, c)}>
                              <span
                                role="img"
                                aria-label={tip(r.person, c)}
                                className={cn(
                                  "mx-auto block size-[22px] rounded-[5px]",
                                  c.status === "pending" || c.status === "none" ? "border border-dashed border-line-strong" : STATUS_META[c.status].cell,
                                )}
                              />
                            </Tip>
                          )}
                        </td>
                      ))}
                      <td className={cn("tabular border-b border-line py-2 pl-4 pr-2 text-right group-hover:bg-[#fafbfb]", r.late ? "font-semibold text-heat-1" : "text-faint")}>{r.late}</td>
                      <td className={cn("tabular border-b border-line py-2 pl-2 pr-4 text-right group-hover:bg-[#fafbfb]", r.absent ? "font-semibold text-heat-3" : "text-faint")}>{r.absent}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-[12.5px] text-muted">
          {LEGEND.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-1.5">
              {l.key === "weekend" ? (
                <span className="flex size-3.5 items-center justify-center rounded-[3px] bg-sunken">
                  <span className="h-[2px] w-2 rounded-full bg-line-strong" />
                </span>
              ) : (
                <span className={cn("size-3.5 rounded-[3px]", STATUS_META[l.key].cell)} />
              )}
              {l.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded-[3px] border border-dashed border-line-strong" />
            No check-in yet
          </span>
        </div>
      </Panel>
      <p className="text-[12.5px] text-muted">On a phone, scroll the grid sideways to see every day. Point at a square to see check-in and check-out times.</p>
    </div>
  );
}
