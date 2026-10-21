"use client";

import * as React from "react";
import { BellOff, ChevronRight } from "lucide-react";
import type { AttendanceDay, Department, Person, Task, Team } from "@/lib/types";
import { committedHours, isOpenWork, isOverdue } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { Bar } from "@/components/ui/primitives";
import { Avatar } from "@/components/app/avatar";
import { AttendanceText, LOAD_STYLE, LeaveTag, WorkTag, deviceWarning, fmtHours, groupByTeam, loadTone } from "./shared";

const COLS = "lg:grid-cols-[minmax(0,1fr)_64px_72px_150px_160px_20px]";

export function PeopleView({
  people,
  tasks,
  teams,
  departments,
  attendance,
  today,
  now,
  onOpen,
}: {
  people: Person[];
  tasks: Task[];
  teams: Team[];
  departments: Department[];
  attendance: AttendanceDay[];
  today: string;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const { groups, loose } = groupByTeam(people, teams, departments);
  const sections = [...groups.map((g) => ({ key: g.team.id, title: g.team.name, sub: g.department?.name, people: g.people })), ...(loose.length ? [{ key: "none", title: "No team yet", sub: undefined, people: loose }] : [])];

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <div className={cn("hidden gap-x-5 border-b border-line px-5 py-2.5 text-[12.5px] font-medium text-muted lg:grid", COLS)}>
        <span>Person</span>
        <span className="text-right">Open</span>
        <span className="text-right">Overdue</span>
        <span>Today&apos;s load</span>
        <span>Attendance</span>
        <span />
      </div>
      {sections.map((s) => (
        <section key={s.key} aria-label={s.title}>
          <h3 className="flex items-baseline gap-2 border-b border-line [section+section_&]:border-t bg-[#f8fafa] px-4 py-2 sm:px-5">
            <span className="text-[13px] font-semibold text-text">{s.title}</span>
            {s.sub && <span className="text-[12px] text-muted">{s.sub}</span>}
          </h3>
          <ul>
            {s.people.map((p) => (
              <PersonLine
                key={p.id}
                person={p}
                isLead={teams.some((t) => t.id === p.teamId && t.leadId === p.id)}
                tasks={tasks}
                att={attendance.find((a) => a.personId === p.id && a.date === today)}
                now={now}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PersonLine({
  person: p,
  isLead,
  tasks,
  att,
  now,
  onOpen,
}: {
  person: Person;
  isLead: boolean;
  tasks: Task[];
  att: AttendanceDay | undefined;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const mine = tasks.filter((t) => t.assigneeId === p.id);
  const open = mine.filter(isOpenWork).length;
  const overdue = mine.filter((t) => isOverdue(t, now)).length;
  const hours = p.onLeave ? 0 : committedHours(tasks, p.id, now);
  const tone = loadTone(hours, p.capacityHours);
  const warning = deviceWarning(p);

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(p.id)}
        className={cn("grid w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-x-5 gap-y-2.5 px-4 py-3.5 text-left transition-colors hover:bg-[#fafbfb] sm:px-5", COLS)}
      >
        {/* who */}
        <div className="flex min-w-0 items-center gap-3">
          <Avatar person={p} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[14.5px] font-medium text-text">{p.name}</span>
              <WorkTag person={p} />
              {p.onLeave && <LeaveTag />}
            </div>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {p.title}
              {isLead ? ", team lead" : ""}
            </p>
            {warning && (
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-heat-2">
                <BellOff className="size-3.5 shrink-0" /> {warning}
              </p>
            )}
          </div>
        </div>

        <ChevronRight className="size-4 text-faint lg:order-last" aria-hidden />

        {/* numbers: a wrapped line on phones, columns on desktop */}
        <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 pl-[52px] lg:contents">
          <span className="tabular text-[13px] text-muted lg:text-right lg:text-[14px] lg:text-text">
            <span className="font-medium text-text">{open}</span>
            <span className="lg:hidden"> open</span>
          </span>
          <span className={cn("tabular text-[13px] lg:text-right lg:text-[14px]", overdue ? "font-semibold text-heat-3" : "text-faint")}>
            {overdue}
            <span className="font-normal lg:hidden"> overdue</span>
          </span>
          <span className="flex w-[150px] items-center gap-2.5">
            {p.onLeave ? (
              <span className="text-[12.5px] text-faint">Away today</span>
            ) : (
              <>
                <Bar value={hours} max={p.capacityHours} tone={LOAD_STYLE[tone].bar} className="w-16 shrink-0" />
                <span className={cn("tabular whitespace-nowrap text-[12.5px]", tone === "over" ? "font-semibold text-heat-3" : tone === "full" ? "font-medium text-heat-1" : "text-muted")}>
                  {fmtHours(hours)} of {p.capacityHours}h
                </span>
              </>
            )}
          </span>
          <AttendanceText person={p} att={att} />
        </div>
      </button>
    </li>
  );
}
