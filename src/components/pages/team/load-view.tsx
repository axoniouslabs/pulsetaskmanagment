"use client";

import * as React from "react";
import { format, isSameDay } from "date-fns";
import type { Department, Leave, Person, Task, Team } from "@/lib/types";
import { committedHours, isOpenWork } from "@/lib/selectors";
import { cn, plural } from "@/lib/utils";
import { Panel } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { LOAD_STYLE, fmtHours, groupByTeam, isAwayOn, loadTone, type LoadTone } from "./shared";

type Cell = { kind: "load"; day: Date; hours: number; tone: LoadTone } | { kind: "away"; day: Date; span: number };

interface Row {
  person: Person;
  cells: Cell[];
  open: number;
  over: boolean;
  avgRatio: number;
  workingDays: number;
}

export function LoadView({
  people,
  tasks,
  teams,
  departments,
  leaves,
  days,
  now,
  onOpen,
}: {
  people: Person[];
  tasks: Task[];
  teams: Team[];
  departments: Department[];
  leaves: Leave[];
  days: Date[];
  now: Date;
  onOpen: (id: string) => void;
}) {
  const rows = React.useMemo(() => {
    const map = new Map<string, Row>();
    for (const p of people) {
      const cells: Cell[] = [];
      let total = 0;
      let worked = 0;
      let over = false;
      for (const day of days) {
        if (isAwayOn(p, day, leaves, now)) {
          const last = cells[cells.length - 1];
          if (last?.kind === "away") last.span += 1;
          else cells.push({ kind: "away", day, span: 1 });
          continue;
        }
        const hours = committedHours(tasks, p.id, day);
        const tone = loadTone(hours, p.capacityHours);
        if (tone === "over") over = true;
        total += hours;
        worked += 1;
        cells.push({ kind: "load", day, hours, tone });
      }
      map.set(p.id, {
        person: p,
        cells,
        open: tasks.filter((t) => t.assigneeId === p.id && isOpenWork(t)).length,
        over,
        avgRatio: worked ? total / worked / (p.capacityHours || 8) : 0,
        workingDays: worked,
      });
    }
    return map;
  }, [people, tasks, days, leaves, now]);

  const { groups, loose } = groupByTeam(people, teams, departments);
  const sections = [...groups.map((g) => ({ key: g.team.id, title: g.team.name, sub: g.department?.name, people: g.people })), ...(loose.length ? [{ key: "none", title: "No team yet", sub: undefined, people: loose }] : [])];

  const all = [...rows.values()];
  const overloaded = all.filter((r) => r.over);
  const free = all.filter((r) => !r.over && r.workingDays > 0 && r.avgRatio < 0.6 && !r.person.onLeave).sort((a, b) => a.avgRatio - b.avgRatio);

  return (
    <div className="space-y-5">
      <Panel className="divide-y divide-line">
        <SummaryLine
          label="Over capacity"
          hint="More committed hours than their working day on at least one day"
          people={overloaded.map((r) => r.person)}
          empty="Nobody is over capacity this week."
          tone="over"
          onOpen={onOpen}
        />
        <SummaryLine
          label="Has room"
          hint="Under 60% of their hours on average, a good place for new work"
          people={free.map((r) => r.person)}
          empty="Nobody has much spare time this week."
          tone="light"
          onOpen={onOpen}
        />
      </Panel>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-[600px] border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">Committed hours per person for the next {days.length} working days</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-20 w-[150px] min-w-[150px] border-b border-line bg-surface px-4 py-2.5 text-left text-[12.5px] font-medium text-muted sm:w-[230px] sm:min-w-[230px]">
                  Person
                </th>
                {days.map((d) => {
                  const today = isSameDay(d, now);
                  return (
                    <th key={d.toISOString()} scope="col" className="border-b border-line px-1 py-2 text-center font-normal">
                      <span className={cn("block text-[12px]", today ? "font-semibold text-ink" : "text-muted")}>{today ? "Today" : format(d, "EEE")}</span>
                      <span className={cn("tabular block text-[12.5px]", today ? "font-semibold text-ink" : "text-text")}>{format(d, "d MMM")}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <React.Fragment key={s.key}>
                  <tr>
                    <th colSpan={days.length + 1} scope="colgroup" className="border-b border-line bg-[#f8fafa] p-0 text-left">
                      <span className="sticky left-0 inline-flex items-baseline gap-2 px-4 py-2">
                        <span className="text-[13px] font-semibold text-text">{s.title}</span>
                        {s.sub && <span className="text-[12px] font-normal text-muted">{s.sub}</span>}
                      </span>
                    </th>
                  </tr>
                  {s.people.map((p) => {
                    const r = rows.get(p.id)!;
                    return (
                      <tr key={p.id} className="group cursor-pointer" onClick={() => onOpen(p.id)}>
                        <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface p-0 text-left font-normal transition-colors group-last:border-b-0 group-hover:bg-[#fafbfb]">
                          <button type="button" className="flex min-h-12 w-full items-center gap-2.5 px-4 py-1.5 text-left" aria-label={`Open ${p.name}`}>
                            <Avatar person={p} size="sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] font-medium text-text">
                                <span className="sm:hidden">{p.name.split(" ")[0]}</span>
                                <span className="hidden sm:inline">{p.name}</span>
                              </span>
                              <span className="block truncate text-[12px] text-muted">{p.onLeave ? "On leave" : r.open ? plural(r.open, "open task") : "No open tasks"}</span>
                            </span>
                          </button>
                        </th>
                        {r.cells.map((c) =>
                          c.kind === "away" ? (
                            <td key={c.day.toISOString()} colSpan={c.span} className="border-b border-line p-1 transition-colors group-last:border-b-0 group-hover:bg-[#fafbfb]">
                              <div className="flex h-10 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-[12.5px] font-medium text-faint">On leave</div>
                            </td>
                          ) : (
                            <td key={c.day.toISOString()} className="border-b border-line p-1 transition-colors group-last:border-b-0 group-hover:bg-[#fafbfb]">
                              <div
                                className={cn("tabular flex h-10 min-w-12 items-center justify-center rounded-[var(--radius-sm)] text-[13px] font-semibold transition-[filter] group-hover:brightness-[0.98]", LOAD_STYLE[c.tone].cell, c.hours < 0.05 && "font-normal text-faint")}
                                title={`${p.name.split(" ")[0]}, ${format(c.day, "EEEE")}: ${fmtHours(c.hours)} of ${p.capacityHours} hours`}
                              >
                                {fmtHours(c.hours)}
                              </div>
                            </td>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-muted" aria-label="Legend">
          {(Object.keys(LOAD_STYLE) as LoadTone[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("size-3 rounded-[3px]", LOAD_STYLE[k].cell.split(" ")[0])} aria-hidden />
              {LOAD_STYLE[k].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] bg-sunken" aria-hidden />
            On leave
          </li>
        </ul>
        <p className="max-w-[46ch] text-[12.5px] leading-snug text-faint sm:text-right">
          Numbers are committed hours. Each open task&apos;s remaining estimate is spread evenly until its deadline.
        </p>
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  hint,
  people,
  empty,
  tone,
  onOpen,
}: {
  label: string;
  hint: string;
  people: Person[];
  empty: string;
  tone: LoadTone;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5 sm:w-[300px] sm:shrink-0">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone === "over" ? "bg-heat-3" : "bg-ink/40")} aria-hidden />
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-text">
            {label} <span className="tabular font-normal text-muted">{people.length}</span>
          </p>
          <p className="text-[12.5px] leading-snug text-muted">{hint}</p>
        </div>
      </div>
      {people.length ? (
        <ul className="flex flex-wrap gap-1.5 pl-5 sm:pl-0">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface pl-1 pr-2.5 text-[13px] text-text transition-colors hover:border-ink/30 hover:bg-sunken"
              >
                <Avatar person={p} size="sm" />
                {p.name.split(" ")[0]}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-5 text-[13px] text-faint sm:pl-0">{empty}</p>
      )}
    </div>
  );
}
