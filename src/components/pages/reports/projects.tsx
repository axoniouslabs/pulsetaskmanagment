"use client";

import * as React from "react";
import { addDays, differenceInCalendarDays, format, max as maxDate, min as minDate, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, LabelList } from "recharts";
import type { Person, Project, Task } from "@/lib/types";
import { committedHours, isOverdue } from "@/lib/selectors";
import { cn, plural } from "@/lib/utils";
import { Select } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { C, ChartPanel, Legend } from "./charts";

export interface ProjectRow {
  project: Project;
  total: number;
  done: number;
  open: number;
  overdue: number;
  onTime: number | null;
  estHours: number;
  actualHours: number;
  /** the last deadline among its tasks */
  deadline: string | null;
}

const closed = (t: Task) => t.status === "approved" || t.status === "cancelled";

/** one row per project: progress, lateness and hours, from the project's own tasks */
export function projectRows(projects: Project[], tasks: Task[], now: Date): ProjectRow[] {
  return projects
    .map((p) => {
      const list = tasks.filter((t) => t.projectId === p.id && t.status !== "draft" && t.status !== "cancelled");
      const approved = list.filter((t) => t.status === "approved");
      const onTime = approved.filter((t) => t.approvedAt && t.approvedAt <= (t.overdueAt ?? t.dueAt)).length;
      return {
        project: p,
        total: list.length,
        done: approved.length,
        open: list.filter((t) => !closed(t)).length,
        overdue: list.filter((t) => isOverdue(t, now)).length,
        onTime: approved.length ? (onTime / approved.length) * 100 : null,
        estHours: list.reduce((n, t) => n + t.estimateHours, 0),
        actualHours: list.reduce((n, t) => n + t.loggedMinutes / 60, 0),
        deadline: list.length ? list.reduce((m, t) => (t.dueAt > m ? t.dueAt : m), list[0].dueAt) : null,
      };
    })
    .filter((r) => r.total > 0);
}

/**
 * Burn-down for a project: estimated hours still open on each day, against a
 * straight line from all the work at the start to nothing at the deadline.
 */
export function burnDown(tasks: Task[], now: Date) {
  const list = tasks.filter((t) => t.status !== "draft" && t.status !== "cancelled");
  if (!list.length) return null;
  const start = minDate(list.map((t) => parseISO(t.createdAt)));
  const deadline = maxDate(list.map((t) => parseISO(t.dueAt)));
  const end = maxDate([deadline, now]);
  const span = Math.max(1, differenceInCalendarDays(end, start));
  const step = Math.max(1, Math.ceil(span / 40));
  const scope = list.reduce((n, t) => n + t.estimateHours, 0);
  const days = differenceInCalendarDays(deadline, start) || 1;
  const points: { label: string; full: string; remaining: number | null; ideal: number | null; scope: number }[] = [];
  for (let i = 0; i <= span; i += step) {
    const d = addDays(start, i);
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);
    const known = list.filter((t) => parseISO(t.createdAt) <= endOfDay);
    const open = known.filter((t) => !(t.status === "approved" && t.approvedAt && parseISO(t.approvedAt) <= endOfDay));
    points.push({
      label: format(d, "d MMM"),
      full: format(d, "EEEE d MMMM"),
      // the future hasn't happened yet: the line stops today
      remaining: d <= now ? Math.round(open.reduce((n, t) => n + t.estimateHours, 0) * 10) / 10 : null,
      ideal: i <= days ? Math.round(scope * (1 - i / days) * 10) / 10 : 0,
      scope: Math.round(known.reduce((n, t) => n + t.estimateHours, 0) * 10) / 10,
    });
  }
  return { points, deadline: format(deadline, "d MMM"), deadlineFull: format(deadline, "EEEE d MMMM"), scope: Math.round(scope * 10) / 10, todayLabel: format(now, "d MMM") };
}

export function ProjectReport({ projects, tasks, now }: { projects: Project[]; tasks: Task[]; now: Date }) {
  const rows = React.useMemo(() => projectRows(projects, tasks, now), [projects, tasks, now]);
  const [picked, setPicked] = React.useState<string>("");
  const current = rows.find((r) => r.project.id === picked) ?? rows[0];
  const bd = React.useMemo(
    () =>
      current
        ? burnDown(
            tasks.filter((t) => t.projectId === current.project.id),
            now,
          )
        : null,
    [current, tasks, now],
  );
  if (!rows.length)
    return (
      <Panel className="p-5">
        <p className="text-[13.5px] text-muted">No project has tasks yet. File tasks under a project when you create them, and its progress shows here.</p>
      </Panel>
    );
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] print:grid-cols-1">
      <Panel className="overflow-hidden">
        <div className="thin-scrollbar relative overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line bg-hover text-[12.5px] text-muted">
                <th scope="col" className="py-2.5 pl-4 pr-3 text-left font-medium">
                  Project
                </th>
                <th scope="col" className="px-3 text-right font-medium">
                  Done
                </th>
                <th scope="col" className="px-3 text-right font-medium">
                  Overdue
                </th>
                <th scope="col" className="px-3 text-right font-medium">
                  On time
                </th>
                <th scope="col" className="px-3 pr-4 text-right font-medium">
                  Hours, worked of estimated
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.project.id}
                  className={cn("cursor-pointer border-b border-line last:border-b-0 hover:bg-hover", current?.project.id === r.project.id && "bg-ink-tint/40")}
                  onClick={() => setPicked(r.project.id)}
                >
                  <td className="py-2.5 pl-4 pr-3">
                    <button type="button" onClick={() => setPicked(r.project.id)} className="flex items-center gap-2 text-left font-medium text-text">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: `oklch(0.65 0.13 ${r.project.hue})` }} aria-hidden />
                      {r.project.name}
                    </button>
                  </td>
                  <td className="tabular px-3 text-right">
                    {r.done} of {r.total}
                  </td>
                  <td className={cn("tabular px-3 text-right", r.overdue > 0 && "font-medium text-heat-3")}>{r.overdue}</td>
                  <td className="tabular px-3 text-right">{r.onTime === null ? "–" : `${Math.round(r.onTime)}%`}</td>
                  <td className={cn("tabular px-3 pr-4 text-right", r.actualHours > r.estHours * 1.2 && "font-medium text-heat-2")}>
                    {Math.round(r.actualHours)} of {Math.round(r.estHours)}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {current && bd && (
        <ChartPanel
          title={
            <span className="flex flex-wrap items-center gap-2">
              Burn-down
              <Select value={current.project.id} onChange={(e) => setPicked(e.target.value)} className="h-8 w-auto text-[13px]" aria-label="Project">
                {rows.map((r) => (
                  <option key={r.project.id} value={r.project.id}>
                    {r.project.name}
                  </option>
                ))}
              </Select>
            </span>
          }
          aside={`${plural(current.open, "task")} open, due by ${bd.deadline}`}
          legend={
            <Legend
              items={[
                { label: "Hours still open", color: C.ink, line: true },
                { label: "On track to finish by the deadline", color: C.light, line: true },
                { label: "All work in the project so far", color: C.muted, line: true },
              ]}
            />
          }
          footnote="Estimated hours of work not yet approved, each day. Staying under the grey line means it will be done by the last deadline; the dashed line rises when new work is added."
        >
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bd.points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.text, fontSize: 11.5 }} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: C.text, fontSize: 11.5 }} width={40} unit="h" />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[12.5px] shadow-pop">
                        <p className="font-medium text-text">{String(payload[0].payload.full)}</p>
                        {payload[0].payload.remaining !== null && <p className="tabular text-text">{String(payload[0].payload.remaining)}h still open</p>}
                        <p className="tabular text-muted">{String(payload[0].payload.ideal)}h on track</p>
                        <p className="tabular text-muted">{String(payload[0].payload.scope)}h in the project</p>
                      </div>
                    ) : null
                  }
                />
                <ReferenceLine x={bd.todayLabel} stroke={C.light} strokeDasharray="3 3" />
                <Line type="stepAfter" dataKey="scope" stroke={C.muted} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey="ideal" stroke={C.light} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="remaining" stroke={C.ink} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      )}
    </div>
  );
}

/** open work per person against what they can do in a day */
export function LoadChart({ people, tasks, now }: { people: Person[]; tasks: Task[]; now: Date }) {
  const rows = people
    .map((p) => ({ name: p.name.split(" ")[0], full: p.name, load: Math.round(committedHours(tasks, p.id, now) * 10) / 10, capacity: p.capacityHours, onLeave: !!p.onLeave }))
    .filter((r) => !r.onLeave)
    .sort((a, b) => b.load / b.capacity - a.load / a.capacity)
    .slice(0, 16)
    .map((r) => ({ ...r, label: `${r.load}h of ${r.capacity}h`, over: r.load > r.capacity }));
  if (!rows.length) return null;
  return (
    <ChartPanel
      title="Load today"
      aside="Committed hours against each person's day"
      footnote="Work spread over the days until each deadline. Over the line means more than a day's work is due from them today."
    >
      <div style={{ height: Math.max(160, rows.length * 34 + 20) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 96, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis type="number" hide domain={[0, (max: number) => Math.max(max, ...rows.map((r) => r.capacity))]} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={80} tick={{ fill: "var(--color-text)", fontSize: 12.5 }} />
            <Tooltip
              cursor={{ fill: "var(--color-hover)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[12.5px] shadow-pop">
                    <p className="font-medium text-text">{String(payload[0].payload.full)}</p>
                    <p className="tabular text-muted">{String(payload[0].payload.label)}</p>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="load" fill={C.ink} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
              <LabelList dataKey="label" position="right" fill="var(--color-muted)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}
