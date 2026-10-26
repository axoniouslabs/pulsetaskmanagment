"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight, Users } from "lucide-react";
import { useApp } from "@/lib/store";
import type { AttendanceDay, Leave, Person } from "@/lib/types";
import { ago, cn } from "@/lib/utils";
import { EmptyState, Panel } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { approvedLeaveOn, backOn, minutesLate, startLabel, time } from "./lib";

type Kind = "notyet" | "absent" | "late" | "in" | "off" | "leave";
const ORDER: Record<Kind, number> = { notyet: 0, absent: 1, late: 2, in: 3, off: 4, leave: 5 };

interface Row {
  person: Person;
  kind: Kind;
  rec?: AttendanceDay;
  leave?: Pick<Leave, "to">;
}

export function TeamToday({ people, now, scopeLabel }: { people: Person[]; now: Date; scopeLabel: string }) {
  const attendance = useApp((s) => s.attendance);
  const leaves = useApp((s) => s.leaves);
  const settings = useApp((s) => s.settings);
  const departments = useApp((s) => s.departments);
  const today = format(now, "yyyy-MM-dd");

  const rows = React.useMemo<Row[]>(() => {
    const [eh, em] = settings.workEnd.split(":").map(Number);
    const afterHours = now.getHours() * 60 + now.getMinutes() >= eh * 60 + em;
    const dayOff = !settings.workDays.includes(now.getDay()) || settings.holidays.some((h) => h.date === today);
    return people
      .map((person): Row => {
        const rec = attendance.find((a) => a.personId === person.id && a.date === today);
        const leave = approvedLeaveOn(leaves, person.id, today) ?? (person.onLeave || rec?.status === "leave" ? { to: today } : undefined);
        let kind: Kind;
        if (rec?.checkIn) kind = rec.status === "late" ? "late" : "in";
        else if (leave) kind = "leave";
        else if (rec?.status === "absent") kind = "absent";
        else if (dayOff) kind = "off";
        else kind = afterHours ? "absent" : "notyet";
        return { person, kind, rec, leave };
      })
      .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.rec?.checkIn ?? "").localeCompare(b.rec?.checkIn ?? "") || a.person.name.localeCompare(b.person.name));
  }, [people, attendance, leaves, settings, today, now]);

  if (!people.length)
    return (
      <Panel>
        <EmptyState icon={Users} title="Nobody to show yet" body="Add people to your team in Organisation, and their check-ins will appear here." />
      </Panel>
    );

  const n = (k: Kind) => rows.filter((r) => r.kind === k).length;
  const onTime = n("in");
  const late = n("late");
  const leave = n("leave");
  const notYet = n("notyet");
  const absent = n("absent");
  const off = n("off");
  const out = rows.filter((r) => r.rec?.checkOut).length;
  const parts: { n: number; label: string; cls?: string }[] = [
    { n: onTime, label: "on time" },
    { n: late, label: "late", cls: late ? "text-heat-1" : undefined },
    { n: leave, label: "on leave" },
    { n: notYet, label: "not in yet" },
    { n: absent, label: "absent", cls: "text-heat-3" },
  ].filter((p, i) => i < 2 || p.n > 0);
  const segs = [
    { n: onTime, c: "bg-ink/70" },
    { n: late, c: "bg-heat-1" },
    { n: absent, c: "bg-heat-3" },
    { n: leave, c: "bg-line-strong" },
  ];

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[13.5px] text-muted">
          {format(now, "EEEE d MMMM")}, {scopeLabel}
        </p>
        <p className="mt-1.5 font-display text-[24px] font-semibold leading-tight text-text sm:text-[28px]">
          {off === rows.length
            ? "Day off for everyone"
            : parts.map((p, i) => (
                <React.Fragment key={p.label}>
                  {i > 0 && ", "}
                  <span className={cn("tabular", p.cls)}>
                    {p.n} {p.label}
                  </span>
                </React.Fragment>
              ))}
        </p>
        <div className="mt-3.5 flex h-2 gap-[2px] overflow-hidden rounded-full bg-sunken" aria-hidden>
          {segs.map((s, i) => (s.n > 0 ? <span key={i} className={s.c} style={{ flex: s.n }} /> : null))}
          {notYet + off > 0 && <span style={{ flex: notYet + off }} />}
        </div>
        <p className="mt-2.5 text-[13px] leading-snug text-muted">
          Work starts at {startLabel(settings.workStart)}. Check-ins after 9:15 AM count as late.
          {out > 0 && ` ${out} ${out === 1 ? "has" : "have"} checked out.`}
        </p>
      </section>

      <Panel className="overflow-hidden">
        <ul>
          {rows.map((r) => (
            <PersonRow key={r.person.id} row={r} dept={departments.find((d) => d.id === r.person.departmentId)?.name} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function PersonRow({ row, dept }: { row: Row; dept?: string }) {
  const settings = useApp((s) => s.settings);
  const { person: p, kind, rec, leave } = row;
  const lateBy = kind === "late" ? minutesLate(rec, settings) : 0;

  const label =
    kind === "late"
      ? `${lateBy} min late`
      : kind === "in"
        ? rec?.checkOut
          ? "Checked out"
          : "In"
        : kind === "leave"
          ? "On leave"
          : kind === "absent"
            ? "Absent"
            : kind === "off"
              ? "Day off"
              : "Not in yet";
  const detail =
    kind === "late" || kind === "in"
      ? `${time(rec?.checkIn)}${rec?.checkOut ? ` to ${time(rec.checkOut)}` : ""}`
      : kind === "leave" && leave
        ? `Back ${format(backOn(leave, settings), "EEE d MMM")}`
        : kind === "notyet" && p.workType === "field" && p.devices[0]
          ? `Phone seen ${ago(p.devices[0].lastSeen)}`
          : kind === "absent"
            ? "No check-in"
            : "";
  const tone =
    kind === "late" ? "text-heat-1" : kind === "absent" ? "text-heat-3" : kind === "leave" || kind === "off" ? "text-faint" : kind === "notyet" ? "text-muted" : "text-text";

  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={`/team?person=${p.id}`}
        className={cn("relative flex min-h-[60px] items-center gap-3 px-4 py-3 pl-5 transition-colors hover:bg-hover", kind === "leave" && "text-faint")}
      >
        {(kind === "late" || kind === "absent") && (
          <span className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full", kind === "late" ? "bg-heat-1" : "bg-heat-3")} aria-hidden />
        )}
        <Avatar person={p} size="md" />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[14.5px] font-medium", kind === "leave" ? "text-muted" : "text-text")}>{p.name}</p>
          <p className="truncate text-[12.5px] text-muted">
            {p.title}
            {dept ? `, ${dept}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-[13.5px] font-medium", tone)}>{label}</p>
          {detail && <p className="tabular text-[12.5px] text-faint">{detail}</p>}
        </div>
        <ChevronRight className="hidden size-4 shrink-0 text-faint sm:block" aria-hidden />
      </Link>
    </li>
  );
}
