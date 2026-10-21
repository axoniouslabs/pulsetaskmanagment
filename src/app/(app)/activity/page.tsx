"use client";

import * as React from "react";
import { format, isToday, isYesterday, startOfDay, subDays } from "date-fns";
import { toast } from "sonner";
import { FileDown, History, Lock, Search, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import type { Activity } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Segmented, Select } from "@/components/ui/primitives";
import { EmptyState, PageHeader, Panel } from "@/components/app/page-header";
import { ActivityLine } from "@/components/app/task-detail";
import { downloadCsv } from "@/components/pages/reports/csv";
import { GROUPS, GROUP_OF, KIND_LABEL, type DateRange, type EventGroup } from "@/components/pages/activity/groups";

const PAGE = 50;

export default function ActivityPage() {
  const now = useNow(60000);
  const { role, meId, people, tasks, allPeople, allTasks } = useScope();
  const activity = useApp((s) => s.activity);

  const [range, setRange] = React.useState<DateRange>("week");
  const [person, setPerson] = React.useState("all");
  const [groups, setGroups] = React.useState<EventGroup[]>([]);
  const [query, setQuery] = React.useState("");
  const [visible, setVisible] = React.useState(PAGE);

  const taskById = React.useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const personById = React.useMemo(() => new Map(allPeople.map((p) => [p.id, p])), [allPeople]);

  /* only what this viewer may see */
  const scoped = React.useMemo(() => {
    if (role === "owner") return activity;
    if (role === "employee") return activity.filter((a) => a.actorId === meId || (a.taskId && taskById.get(a.taskId)?.assigneeId === meId));
    const ids = new Set(people.map((p) => p.id));
    const taskIds = new Set(tasks.map((t) => t.id));
    return activity.filter((a) => a.actorId === meId || ids.has(a.actorId) || (a.taskId && taskIds.has(a.taskId)));
  }, [activity, role, meId, people, tasks, taskById]);

  /* date + person + search (group filter applied after, so chips can show counts) */
  const base = React.useMemo(() => {
    const today = startOfDay(now).getTime();
    const from = range === "today" ? today : range === "yesterday" ? subDays(today, 1).getTime() : range === "week" ? subDays(today, 6).getTime() : 0;
    const to = range === "yesterday" ? today : Infinity;
    const q = query.trim().toLowerCase();
    return scoped.filter((a) => {
      const t = new Date(a.at).getTime();
      if (t < from || t >= to) return false;
      if (person !== "all" && a.actorId !== person && !(a.taskId && taskById.get(a.taskId)?.assigneeId === person)) return false;
      if (q) {
        const hay = `${a.text} ${a.actorId === "system" ? "Pulse" : personById.get(a.actorId)?.name ?? ""} ${a.taskId ? taskById.get(a.taskId)?.title ?? "" : ""} ${KIND_LABEL[a.kind]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scoped, now, range, person, query, taskById, personById]);

  const counts = React.useMemo(() => {
    const c = {} as Record<EventGroup, number>;
    for (const g of GROUPS) c[g.value] = 0;
    for (const a of base) c[GROUP_OF[a.kind]] = (c[GROUP_OF[a.kind]] ?? 0) + 1;
    return c;
  }, [base]);

  const filtered = React.useMemo(() => (groups.length ? base.filter((a) => groups.includes(GROUP_OF[a.kind])) : base), [base, groups]);
  const shown = filtered.slice(0, visible);

  const days = React.useMemo(() => {
    const out: { key: string; label: string; items: Activity[] }[] = [];
    for (const a of shown) {
      const d = new Date(a.at);
      const key = format(d, "yyyy-MM-dd");
      let day = out[out.length - 1];
      if (!day || day.key !== key) {
        day = { key, label: isToday(d) ? `Today, ${format(d, "EEEE d MMMM")}` : isYesterday(d) ? `Yesterday, ${format(d, "EEEE d MMMM")}` : format(d, "EEEE d MMMM"), items: [] };
        out.push(day);
      }
      day.items.push(a);
    }
    return out;
  }, [shown]);

  /* today at a glance, from the same log */
  const todayStats = React.useMemo(() => {
    const t = scoped.filter((a) => isToday(new Date(a.at)));
    const n = (k: Activity["kind"]) => t.filter((a) => a.kind === k).length;
    return { reminders: n("reminder_sent"), acks: n("acknowledged"), escalations: n("escalated"), approved: n("approved"), total: t.length };
  }, [scoped]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setVisible(PAGE);
  };
  const toggleGroup = (g: EventGroup) => {
    setGroups((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));
    setVisible(PAGE);
  };
  const clearAll = () => {
    setRange("all");
    setPerson("all");
    setGroups([]);
    setQuery("");
    setVisible(PAGE);
  };
  const filtersOn = person !== "all" || groups.length > 0 || query.trim() !== "";

  const exportCsv = () => {
    if (!filtered.length) {
      toast("Nothing to export", { description: "No events match these filters." });
      return;
    }
    downloadCsv(
      `pulse-activity-${format(new Date(), "yyyy-MM-dd")}.csv`,
      ["When", "Who", "Event", "Task", "Details"],
      filtered.map((a) => [
        format(new Date(a.at), "yyyy-MM-dd HH:mm"),
        a.actorId === "system" ? "Pulse" : personById.get(a.actorId)?.name ?? "Someone",
        KIND_LABEL[a.kind],
        a.taskId ? taskById.get(a.taskId)?.title ?? "" : "",
        a.text,
      ]),
    );
    toast.success("Exported", { description: `${plural(filtered.length, "event")} saved as a CSV file.` });
  };

  const isEmployee = role === "employee";
  const personOptions = role === "owner" ? allPeople : people;

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        title={isEmployee ? "My history" : "Activity log"}
        description={
          <span className="flex items-start gap-1.5">
            <Lock className="mt-[3px] size-3.5 shrink-0 text-ink" />
            <span>
              {isEmployee
                ? "Everything that happened on your tasks, and everything you did. "
                : ""}
              Every event is recorded here. Nobody can edit or delete it, including the owner.
            </span>
          </span>
        }
        actions={
          <Button onClick={exportCsv}>
            <FileDown /> Export CSV
          </Button>
        }
      />

      {/* today at a glance */}
      <p className="-mt-2 mb-6 text-[14px] leading-relaxed text-muted">
        <span className="font-medium text-text">Today:</span>{" "}
        {todayStats.total === 0 ? (
          "nothing recorded yet."
        ) : (
          <>
            <span className="tabular text-text">{plural(todayStats.reminders, "reminder")}</span> sent,{" "}
            <span className="tabular text-text">{todayStats.acks}</span> acknowledged,{" "}
            <span className={cn("tabular", todayStats.escalations ? "font-medium text-heat-2" : "text-text")}>{plural(todayStats.escalations, "escalation")}</span>
            {todayStats.approved ? (
              <>
                , <span className="tabular text-text">{todayStats.approved}</span> approved
              </>
            ) : null}
            .
          </>
        )}
      </p>

      {/* filters */}
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="no-scrollbar -mx-1 overflow-x-auto px-1">
            <Segmented
              value={range}
              onChange={reset(setRange)}
              options={[
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "week", label: "Last 7 days" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          <div className="flex flex-1 gap-2">
            {!isEmployee && (
              <Select value={person} onChange={(e) => reset(setPerson)(e.target.value)} className="h-9 w-[44%] min-w-0 sm:w-48" aria-label="Person">
                <option value="all">Everyone</option>
                {personOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input value={query} onChange={(e) => reset(setQuery)(e.target.value)} placeholder="Search events or tasks" className="h-9 pl-9 pr-8" aria-label="Search the log" />
              {query && (
                <button type="button" onClick={() => reset(setQuery)("")} className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-faint hover:text-text" aria-label="Clear search">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Event types">
          <button
            type="button"
            aria-pressed={groups.length === 0}
            onClick={() => {
              setGroups([]);
              setVisible(PAGE);
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
              groups.length === 0 ? "border-ink bg-ink text-white" : "border-line-strong text-muted hover:border-ink/40 hover:text-text",
            )}
          >
            All events <span className={cn("tabular", groups.length === 0 ? "text-white/70" : "text-faint")}>{base.length}</span>
          </button>
          {GROUPS.map((g) => {
            const on = groups.includes(g.value);
            return (
              <button
                key={g.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleGroup(g.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  on ? "border-ink bg-ink-tint text-ink" : "border-line-strong text-muted hover:border-ink/40 hover:text-text",
                )}
              >
                {g.label} <span className={cn("tabular", on ? "text-ink/70" : "text-faint")}>{counts[g.value]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-2 mt-5 text-[13px] text-muted">
        {filtered.length === 0 ? "No events" : `Showing ${Math.min(visible, filtered.length)} of ${plural(filtered.length, "event")}`}
        {filtersOn && filtered.length > 0 && (
          <button type="button" onClick={clearAll} className="ml-2 font-medium text-ink hover:underline">
            Clear filters
          </button>
        )}
      </p>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={History}
            title="No events match these filters"
            body={range !== "all" ? "Try a wider date range or clear the filters to see the whole log." : "Clear the filters to see the whole log."}
            action={<Button onClick={clearAll}>Show everything</Button>}
          />
        </Panel>
      ) : (
        <div className="space-y-2">
          {days.map((d) => (
            <section key={d.key} aria-label={d.label}>
              <h2 className="sticky top-14 z-10 -mx-1 flex items-baseline justify-between bg-paper/95 px-1 py-2 text-[14px] font-semibold text-text backdrop-blur-sm lg:top-16">
                {d.label}
                <span className="tabular text-[12.5px] font-normal text-faint">{plural(d.items.length, "event")}</span>
              </h2>
              <Panel className="px-4 py-4 sm:px-5">
                <ol>
                  {d.items.map((a) => (
                    <ActivityLine key={a.id} a={a} showTask />
                  ))}
                </ol>
              </Panel>
            </section>
          ))}
          {visible < filtered.length && (
            <div className="flex justify-center pt-4">
              <Button onClick={() => setVisible((v) => v + PAGE)}>Show {Math.min(PAGE, filtered.length - visible)} more</Button>
            </div>
          )}
          {visible >= filtered.length && filtered.length > PAGE && <p className="pt-4 text-center text-[13px] text-faint">That&apos;s everything for these filters.</p>}
        </div>
      )}
    </div>
  );
}
