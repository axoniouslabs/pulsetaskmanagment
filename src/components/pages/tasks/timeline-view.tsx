"use client";

import * as React from "react";
import { addDays, differenceInMinutes, format, isWeekend, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Person, Task } from "@/lib/types";
import { heatOf, STATUS_LABEL } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/app/avatar";

const DAY_W = 44;
const ROW_H = 36;
const HEAD_H = 28;
const DAYS = 21;

/**
 * Gantt-style timeline: one bar per task from its start to its deadline, grouped
 * by person, with lines from each task to the tasks it waits for.
 */
export function TimelineView({ tasks, people, now }: { tasks: Task[]; people: Person[]; now: Date }) {
  const openTask = useApp((s) => s.openTask);
  const [from, setFrom] = React.useState(() => addDays(startOfDay(now), -3));
  const to = addDays(from, DAYS);
  const x = (d: Date) => (differenceInMinutes(d, from) / (24 * 60)) * DAY_W;

  const groups = React.useMemo(() => {
    const inRange = tasks.filter((t) => {
      if (t.status === "cancelled") return false;
      const start = new Date(t.startAt ?? t.createdAt);
      return new Date(t.dueAt) >= from && start <= to;
    });
    const byPerson = new Map<string, Task[]>();
    for (const t of inRange) byPerson.set(t.assigneeId, [...(byPerson.get(t.assigneeId) ?? []), t]);
    return Array.from(byPerson.entries())
      .map(([pid, list]) => ({
        person: people.find((p) => p.id === pid),
        tasks: list.sort((a, b) => (a.startAt ?? a.createdAt).localeCompare(b.startAt ?? b.createdAt)),
      }))
      .sort((a, b) => (a.person?.name ?? "").localeCompare(b.person?.name ?? ""));
  }, [tasks, people, from, to]);

  // row index of every visible task, for dependency lines
  const layout: ({ kind: "person"; person?: Person; count: number } | { kind: "task"; task: Task })[] = [];
  for (const g of groups) {
    layout.push({ kind: "person", person: g.person, count: g.tasks.length });
    for (const t of g.tasks) layout.push({ kind: "task", task: t });
  }
  const rowOf = new Map<string, number>();
  layout.forEach((r, i) => r.kind === "task" && rowOf.set(r.task.id, i));

  const bar = (t: Task) => {
    const start = new Date(t.startAt ?? t.createdAt);
    const due = new Date(t.dueAt);
    const left = Math.max(0, x(start));
    const right = Math.min(DAYS * DAY_W, x(due));
    return {
      left,
      width: Math.max(10, right - left),
      clippedLeft: x(start) < 0,
      clippedRight: x(due) > DAYS * DAY_W,
    };
  };

  const tone = (t: Task) => {
    if (t.status === "approved") return "bg-ok/80 text-white";
    if (t.status === "submitted") return "bg-info text-white";
    if (t.status === "blocked") return "bg-heat-2 text-white";
    const h = heatOf(t, now);
    if (h >= 3) return "bg-heat-3 text-white";
    if (h >= 1) return "bg-heat-1 text-white";
    if (t.status === "draft") return "border border-dashed border-line-strong bg-surface text-muted";
    return "bg-ink text-white";
  };

  const lines: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    done: boolean;
  }[] = [];
  for (const r of layout) {
    if (r.kind !== "task") continue;
    for (const dep of r.task.dependsOn ?? []) {
      const di = rowOf.get(dep);
      const ti = rowOf.get(r.task.id)!;
      if (di === undefined) continue;
      const d = layout[di] as { kind: "task"; task: Task };
      const db = bar(d.task);
      const tb = bar(r.task);
      lines.push({
        x1: db.left + db.width,
        y1: HEAD_H + di * ROW_H + ROW_H / 2,
        x2: tb.left,
        y2: HEAD_H + ti * ROW_H + ROW_H / 2,
        done: d.task.status === "approved",
      });
    }
  }

  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const todayX = x(now);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <Button size="iconSm" variant="ghost" aria-label="Earlier" onClick={() => setFrom((f) => addDays(f, -7))}>
          <ChevronLeft />
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setFrom(addDays(startOfDay(now), -3))}>
          Today
        </Button>
        <Button size="iconSm" variant="ghost" aria-label="Later" onClick={() => setFrom((f) => addDays(f, 7))}>
          <ChevronRight />
        </Button>
        <p className="ml-1 text-[13px] text-muted">
          {format(from, "d MMM")} – {format(addDays(to, -1), "d MMM yyyy")}
        </p>
        <div className="ml-auto hidden flex-wrap items-center gap-3 text-[12px] text-muted md:flex">
          {[
            ["bg-ink", "On track"],
            ["bg-heat-1", "Reminders ignored"],
            ["bg-heat-3", "Late"],
            ["bg-heat-2", "Blocked"],
            ["bg-info", "In review"],
            ["bg-ok/80", "Done"],
          ].map(([c, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", c)} /> {l}
            </span>
          ))}
        </div>
      </div>

      {layout.length === 0 ? (
        <p className="px-4 py-10 text-center text-[14px] text-muted">No tasks fall in these three weeks. Move the window or change the filters.</p>
      ) : (
        <div className="thin-scrollbar flex overflow-x-auto">
          {/* names */}
          <div className="sticky left-0 z-10 w-[150px] shrink-0 border-r border-line bg-surface sm:w-[232px]">
            <div style={{ height: HEAD_H }} className="border-b border-line" />
            {layout.map((r, i) =>
              r.kind === "person" ? (
                <div key={`p${i}`} style={{ height: ROW_H }} className="flex items-center gap-2 border-b border-line bg-sunken/60 px-3">
                  <Avatar person={r.person} size="xs" />
                  <span className="truncate text-[12.5px] font-semibold">{r.person?.name ?? "Unknown"}</span>
                  <span className="tabular ml-auto text-[11.5px] text-faint">{r.count}</span>
                </div>
              ) : (
                <button
                  key={r.task.id}
                  type="button"
                  onClick={() => openTask(r.task.id)}
                  style={{ height: ROW_H }}
                  className="flex w-full items-center border-b border-line px-3 pl-8 text-left text-[13px] hover:bg-sunken"
                  title={r.task.title}
                >
                  <span className="truncate">{r.task.title}</span>
                </button>
              ),
            )}
          </div>

          {/* grid */}
          <div className="relative shrink-0" style={{ width: DAYS * DAY_W }}>
            <div className="flex border-b border-line" style={{ height: HEAD_H }}>
              {days.map((d) => (
                <div key={d.toISOString()} style={{ width: DAY_W }} className={cn("flex flex-col items-center justify-center text-[10.5px] leading-tight", isWeekend(d) ? "text-faint" : "text-muted")}>
                  <span>{format(d, "EEEEE")}</span>
                  <span className="tabular font-medium">{format(d, "d")}</span>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex" style={{ top: HEAD_H }}>
              {days.map((d) => (
                <div key={d.toISOString()} style={{ width: DAY_W }} className={cn("h-full border-r border-line/60", isWeekend(d) && "bg-sunken/50")} />
              ))}
            </div>
            {todayX >= 0 && todayX <= DAYS * DAY_W && (
              <div className="pointer-events-none absolute bottom-0 z-[1] w-px bg-heat-3" style={{ left: todayX, top: 0 }} aria-hidden>
                <span className="absolute -left-[3px] top-0 size-[7px] rounded-full bg-heat-3" />
              </div>
            )}

            {layout.map((r, i) => {
              if (r.kind === "person") return <div key={`p${i}`} style={{ height: ROW_H }} className="relative border-b border-line bg-sunken/40" />;
              const b = bar(r.task);
              return (
                <div key={r.task.id} style={{ height: ROW_H }} className="relative border-b border-line/60">
                  <button
                    type="button"
                    onClick={() => openTask(r.task.id)}
                    className={cn(
                      "absolute top-1.5 flex h-[22px] items-center overflow-hidden px-2 text-[11.5px] font-medium shadow-sm transition-[filter] hover:brightness-110",
                      tone(r.task),
                      b.clippedLeft ? "rounded-l-none" : "rounded-l-full",
                      b.clippedRight ? "rounded-r-none" : "rounded-r-full",
                    )}
                    style={{ left: b.left, width: b.width }}
                    title={`${r.task.title} · ${STATUS_LABEL[r.task.status]} · due ${format(new Date(r.task.dueAt), "EEE d MMM, h:mm a")}`}
                  >
                    <span className="truncate">{b.width > 60 ? r.task.title : ""}</span>
                  </button>
                </div>
              );
            })}

            {lines.length > 0 && (
              <svg className="pointer-events-none absolute left-0 top-0" width={DAYS * DAY_W} height={HEAD_H + layout.length * ROW_H} aria-hidden>
                <defs>
                  <marker id="tl-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,0 L6,3 L0,6 z" fill="var(--color-muted)" />
                  </marker>
                </defs>
                {lines.map((l, i) => {
                  const midX = Math.max(l.x1 + 8, Math.min(l.x2 - 8, (l.x1 + l.x2) / 2));
                  return (
                    <path
                      key={i}
                      d={`M${l.x1},${l.y1} H${midX} V${l.y2} H${l.x2 - 2}`}
                      fill="none"
                      stroke="var(--color-muted)"
                      strokeWidth="1.25"
                      strokeDasharray={l.done ? "0" : "3 3"}
                      markerEnd="url(#tl-arrow)"
                      opacity={0.75}
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
