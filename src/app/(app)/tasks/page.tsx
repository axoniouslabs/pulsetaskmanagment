"use client";

import * as React from "react";
import { FileUp, ListTodo, Plus, SearchX } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import { isOpenWork, isOverdue } from "@/lib/selectors";
import { plural, uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/app/page-header";
import { TasksToolbar } from "@/components/pages/tasks/toolbar";
import { ListView } from "@/components/pages/tasks/list-view";
import { BoardView } from "@/components/pages/tasks/board-view";
import { CalendarView } from "@/components/pages/tasks/calendar-view";
import { TimelineView } from "@/components/pages/tasks/timeline-view";
import { ImportDialog } from "@/components/pages/tasks/import-dialog";
import {
  EMPTY_FILTERS,
  QUICK_CHIPS,
  applyBaseFilters,
  applyFilters,
  builtInViews,
  matchesQuick,
  readMode,
  readQuickFromUrl,
  readSavedViews,
  sortTasks,
  writeMode,
  writeSavedViews,
  type QuickKey,
  type SavedView,
  type SortKey,
  type TaskFilters,
  type ViewMode,
} from "@/components/pages/tasks/filters";

export default function TasksPage() {
  const meId = useApp((s) => s.userIds[s.role]);
  // a fresh screen per viewer, so filters never leak across roles
  return <TasksScreen key={meId} />;
}

function TasksScreen() {
  const now = useNow(30000);
  const { role, meId, people, tasks, allPeople, departments } = useScope();
  const projects = useApp((s) => s.projects);
  const activity = useApp((s) => s.activity);
  const openCreate = useApp((s) => s.openCreate);

  const [mode, setModeState] = React.useState<ViewMode>(() => (typeof window === "undefined" ? "list" : readMode()));
  const [filters, setFilters] = React.useState<TaskFilters>(() => ({
    ...EMPTY_FILTERS,
    quick: typeof window === "undefined" ? null : readQuickFromUrl(),
  }));
  const [sort, setSort] = React.useState<SortKey>("deadline");
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [customViews, setCustomViews] = React.useState<SavedView[]>(() => (typeof window === "undefined" ? [] : readSavedViews(meId)));

  const ctx = React.useMemo(() => ({ role, meId, now }), [role, meId, now]);
  const visible = React.useMemo(() => (role === "employee" ? tasks.filter((t) => t.status !== "draft") : tasks), [tasks, role]);

  const lastActivity = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of activity) if (a.taskId && !map[a.taskId]) map[a.taskId] = a.at; // newest first
    return map;
  }, [activity]);

  const base = React.useMemo(() => applyBaseFilters(visible, filters, ctx), [visible, filters, ctx]);
  const filtered = React.useMemo(() => sortTasks(applyFilters(visible, filters, ctx), sort, lastActivity), [visible, filters, ctx, sort, lastActivity]);
  const chipCounts = React.useMemo(() => {
    const out = {} as Record<QuickKey, number>;
    for (const c of [...QUICK_CHIPS.map((x) => x.key), "stuck" as const]) out[c] = base.filter((t) => matchesQuick(t, c, now)).length;
    return out;
  }, [base, now]);

  const assignees = React.useMemo(() => {
    const ids = new Set(visible.map((t) => t.assigneeId));
    return allPeople
      .filter((p) => ids.has(p.id))
      .sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)));
  }, [visible, allPeople, meId]);
  const projectOptions = React.useMemo(() => {
    const ids = new Set(visible.map((t) => t.projectId).filter(Boolean));
    return projects.filter((p) => ids.has(p.id));
  }, [visible, projects]);
  const scopeIds = React.useMemo(() => new Set(people.map((p) => p.id)), [people]);

  const views = React.useMemo(() => [...builtInViews(role), ...customViews], [role, customViews]);

  const change = (patch: Partial<TaskFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setActiveViewId(null);
  };
  const clear = () => {
    setFilters((f) => ({ ...EMPTY_FILTERS, showDone: f.showDone }));
    setActiveViewId(null);
  };
  const setMode = (m: ViewMode) => {
    setModeState(m);
    writeMode(m);
  };
  const applyView = (v: SavedView) => {
    setFilters({ ...EMPTY_FILTERS, ...v.filters });
    setSort(v.sort);
    setActiveViewId(v.id);
  };
  const saveView = (name: string) => {
    const v: SavedView = { id: uid("view"), name, filters, sort };
    const next = [...customViews, v];
    setCustomViews(next);
    writeSavedViews(meId, next);
    setActiveViewId(v.id);
  };
  const removeView = (id: string) => {
    const next = customViews.filter((v) => v.id !== id);
    setCustomViews(next);
    writeSavedViews(meId, next);
    if (activeViewId === id) setActiveViewId(null);
  };

  const open = visible.filter(isOpenWork).length;
  const overdue = visible.filter((t) => isOverdue(t, now)).length;
  const dept = departments.find((d) => d.headId === meId)?.name;
  const description =
    role === "owner"
      ? `${plural(open, "open task")} across the company${overdue ? `, ${overdue} overdue` : ""}. Filter, sort or switch the view to find what needs a push.`
      : role === "manager"
        ? `${plural(open, "open task")} in ${dept ?? "your team"} and work you review${overdue ? `, ${overdue} overdue` : ""}.`
        : `${plural(open, "open task")}${overdue ? `, ${overdue} overdue` : ""}. Acknowledge new work so the reminders stop.`;

  const hasFilters = filtered.length === 0 && visible.length > 0;
  const draftCount = filtered.filter((t) => t.status === "draft").length;

  return (
    <div>
      <PageHeader
        title={role === "employee" ? "My tasks" : "Tasks"}
        description={description}
        actions={
          <div className="flex gap-2">
            {role !== "employee" && (
              <Button onClick={() => setImporting(true)}>
                <FileUp /> Import
              </Button>
            )}
            <Button variant="primary" onClick={() => openCreate()}>
              <Plus /> New task
            </Button>
          </div>
        }
      />

      <ImportDialog open={importing} onOpenChange={setImporting} />

      <TasksToolbar
        role={role}
        meId={meId}
        filters={filters}
        onChange={change}
        onClear={clear}
        sort={sort}
        onSort={(s) => {
          setSort(s);
          setActiveViewId(null);
        }}
        mode={mode}
        onMode={setMode}
        assignees={assignees}
        projects={projectOptions}
        chipCounts={chipCounts}
        resultCount={filtered.length}
        views={views}
        activeViewId={activeViewId}
        onApplyView={applyView}
        onSaveView={saveView}
        onRemoveView={removeView}
      />

      <div className="mt-6">
        {visible.length === 0 ? (
          <Panel>
            <EmptyState
              icon={ListTodo}
              title={role === "employee" ? "Nothing assigned to you yet" : "No tasks yet"}
              body={
                role === "employee"
                  ? "When someone gives you a task it shows up here and on My day, with a reminder on your phone."
                  : "Assign the first task and Pulse follows up for you until it's done."
              }
              action={
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus /> New task
                </Button>
              }
            />
          </Panel>
        ) : hasFilters ? (
          <Panel>
            <EmptyState
              icon={SearchX}
              title="No tasks match these filters"
              body={filters.showDone ? "Try removing a filter or searching for a different word." : "Try removing a filter, or turn on Show done to include finished work."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={clear}>Clear filters</Button>
                  {!filters.showDone && (
                    <Button variant="ghost" onClick={() => change({ showDone: true })}>
                      Show done
                    </Button>
                  )}
                </div>
              }
            />
          </Panel>
        ) : mode === "board" ? (
          <BoardView
            tasks={filtered.filter((t) => t.status !== "draft")}
            role={role}
            meId={meId}
            scopeIds={scopeIds}
            people={allPeople}
            showDone={filters.showDone || filters.status === "approved"}
            onShowDone={() => change({ showDone: true })}
            draftCount={draftCount}
            onShowDrafts={() => setMode("list")}
          />
        ) : mode === "timeline" ? (
          <TimelineView tasks={filtered} people={allPeople} now={now} />
        ) : mode === "calendar" ? (
          <CalendarView tasks={filtered} role={role} meId={meId} now={now} />
        ) : (
          <ListView tasks={filtered} role={role} meId={meId} sort={sort} now={now} />
        )}
      </div>
    </div>
  );
}
