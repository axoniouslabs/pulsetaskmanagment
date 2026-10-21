"use client";

import * as React from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Role, Task } from "@/lib/types";
import { STATUS_LABEL, heatOf } from "@/lib/selectors";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Tip } from "@/components/ui/primitives";
import { EmptyState, Panel } from "@/components/app/page-header";
import { TaskList, TaskRow } from "@/components/app/task-row";
import { HEAT } from "@/components/app/task-bits";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_PILLS = 3;
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

export function CalendarView({ tasks, role, meId, now }: { tasks: Task[]; role: Role; meId: string; now: Date }) {
  const [month, setMonth] = React.useState(() => startOfMonth(now));
  const byDay = React.useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) (map[dayKey(new Date(t.dueAt))] ??= []).push(t);
    for (const k of Object.keys(map))
      map[k].sort((a, b) => heatOf(b, now) - heatOf(a, now) || a.dueAt.localeCompare(b.dueAt));
    return map;
  }, [tasks, now]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const monthDays = days.filter((d) => isSameMonth(d, month) && byDay[dayKey(d)]?.length);
  const inMonth = monthDays.reduce((n, d) => n + byDay[dayKey(d)].length, 0);
  const onThisMonth = isSameMonth(month, now);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-semibold leading-tight text-text">{format(month, "MMMM yyyy")}</h2>
          <p className="text-[13px] text-muted">{inMonth ? `${plural(inMonth, "task")} due this month` : "Nothing due this month"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {!onThisMonth && (
            <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(now))}>
              Today
            </Button>
          )}
          <Button size="icon" variant="secondary" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft />
          </Button>
          <Button size="icon" variant="secondary" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* desktop: month grid */}
      <div className="hidden overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface md:block">
        <div className="grid grid-cols-7 border-b border-line bg-sunken/60">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2.5 py-2 text-[12.5px] font-medium text-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const list = byDay[dayKey(d)] ?? [];
            const out = !isSameMonth(d, month);
            const today = isSameDay(d, now);
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "flex min-h-[118px] min-w-0 flex-col gap-1 border-line p-1.5",
                  i % 7 !== 6 && "border-r",
                  i < days.length - 7 && "border-b",
                  out && "bg-sunken/40",
                )}
              >
                <span
                  className={cn(
                    "tabular mb-0.5 ml-0.5 inline-flex size-6 items-center justify-center rounded-full text-[12.5px] font-medium",
                    today ? "bg-ink font-semibold text-white" : out ? "text-faint" : "text-text",
                  )}
                  aria-label={format(d, "EEEE d MMMM")}
                >
                  {format(d, "d")}
                </span>
                {list.slice(0, MAX_PILLS).map((t) => (
                  <Pill key={t.id} task={t} now={now} />
                ))}
                {list.length > MAX_PILLS && <MoreTasks day={d} tasks={list} now={now} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* phone: agenda grouped by day */}
      <div className="space-y-6 md:hidden">
        {monthDays.length ? (
          monthDays.map((d) => {
            const list = byDay[dayKey(d)];
            const today = isSameDay(d, now);
            return (
              <section key={d.toISOString()}>
                <h3 className="mb-2 flex items-baseline gap-2 text-[14.5px] font-semibold text-text">
                  {today ? <span className="text-ink">Today</span> : null}
                  <span className={cn(today && "font-normal text-muted")}>{format(d, "EEE d MMM")}</span>
                  <span className="tabular text-[13px] font-normal text-muted">{list.length}</span>
                </h3>
                <TaskList>
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} showStatus={false} showAssignee={role !== "employee" || t.assigneeId !== meId} />
                  ))}
                </TaskList>
              </section>
            );
          })
        ) : (
          <Panel>
            <EmptyState
              icon={CalendarDays}
              title={`Nothing due in ${format(month, "MMMM")}`}
              body="Use the arrows to look at another month, or clear filters to see more."
            />
          </Panel>
        )}
      </div>
    </div>
  );
}

function pillClass(t: Task, now: Date) {
  const heat = heatOf(t, now);
  if (t.status === "approved" || t.status === "cancelled") return "text-faint line-through decoration-line-strong hover:bg-sunken";
  if (heat > 0) return cn(HEAT[heat].tint, HEAT[heat].text, "font-medium hover:brightness-95");
  if (t.status === "blocked") return "bg-heat-2-tint text-heat-2 hover:brightness-95";
  if (t.status === "draft") return "border border-dashed border-line-strong text-muted hover:bg-sunken";
  return "bg-sunken text-text hover:bg-line";
}

function Pill({ task, now }: { task: Task; now: Date }) {
  const openTask = useApp((s) => s.openTask);
  const assignee = useApp((s) => s.people.find((p) => p.id === task.assigneeId));
  return (
    <Tip label={`${task.title}. ${assignee?.name ?? ""}, due ${format(new Date(task.dueAt), "h:mm a")}. ${STATUS_LABEL[task.status]}.`}>
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className={cn("block h-6 w-full truncate rounded-[var(--radius-xs)] px-1.5 text-left text-[12px] leading-6 transition-[filter,background-color]", pillClass(task, now))}
      >
        {task.title}
      </button>
    </Tip>
  );
}

function MoreTasks({ day, tasks, now }: { day: Date; tasks: Task[]; now: Date }) {
  const openTask = useApp((s) => s.openTask);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="h-6 rounded-[var(--radius-xs)] px-1.5 text-left text-[12px] font-medium text-muted hover:bg-sunken hover:text-text">
          +{tasks.length - MAX_PILLS} more
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1.5 pb-1.5 pt-1 text-[13px] font-semibold text-text">{format(day, "EEEE d MMMM")}</p>
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => openTask(t.id)}
                className={cn("block h-7 w-full truncate rounded-[var(--radius-xs)] px-2 text-left text-[12.5px] leading-7", pillClass(t, now))}
              >
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
