import * as React from "react";
import { differenceInHours, endOfWeek, startOfWeek } from "date-fns";
import type { Priority, Role, Task, TaskStatus } from "@/lib/types";
import { isActive, isOverdue } from "@/lib/selectors";

/* ------------------------------------------------------------------ */
/* filter model                                                        */
/* ------------------------------------------------------------------ */

export type ViewMode = "list" | "board" | "calendar";
export type SortKey = "deadline" | "priority" | "activity" | "stale";
export type QuickKey = "overdue" | "blocked" | "unseen" | "review" | "week" | "stuck";

export interface TaskFilters {
  q: string;
  assignee: string; // "" = everyone
  status: TaskStatus | "";
  priority: Priority | "";
  project: string; // "" = all, "none" = no project
  quick: QuickKey | null;
  reviewerMe: boolean; // only work the viewer reviews
  showDone: boolean;
}

export const EMPTY_FILTERS: TaskFilters = {
  q: "",
  assignee: "",
  status: "",
  priority: "",
  project: "",
  quick: null,
  reviewerMe: false,
  showDone: false,
};

/** the five chips always on screen */
export const QUICK_CHIPS: { key: QuickKey; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "blocked", label: "Blocked" },
  { key: "unseen", label: "Not seen yet" },
  { key: "review", label: "Waiting for review" },
  { key: "week", label: "Due this week" },
];

export const QUICK_LABEL: Record<QuickKey, string> = {
  overdue: "Overdue",
  blocked: "Blocked",
  unseen: "Not seen yet",
  review: "Waiting for review",
  week: "Due this week",
  stuck: "Same state for 3+ days",
};

export const SORT_LABEL: Record<SortKey, string> = {
  deadline: "Deadline",
  priority: "Priority",
  activity: "Last activity",
  stale: "Time in current state",
};

export const STUCK_HOURS = 72;

/** lifecycle order used by the list groups and the board columns */
export const LIFECYCLE: TaskStatus[] = ["assigned", "acknowledged", "in_progress", "blocked", "submitted", "approved"];

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export interface FilterContext {
  role: Role;
  meId: string;
  now: Date;
}

export function matchesQuick(t: Task, key: QuickKey, now: Date) {
  switch (key) {
    case "overdue":
      return isOverdue(t, now);
    case "blocked":
      return t.status === "blocked";
    case "unseen":
      return t.status === "assigned";
    case "review":
      return t.status === "submitted";
    case "week": {
      const due = new Date(t.dueAt);
      return isActive(t) && due >= startOfWeek(now, { weekStartsOn: 1 }) && due <= endOfWeek(now, { weekStartsOn: 1 });
    }
    case "stuck":
      return isActive(t) && differenceInHours(now, new Date(t.statusChangedAt)) >= STUCK_HOURS;
  }
}

const isClosed = (t: Task) => t.status === "approved" || t.status === "cancelled";

/** everything except the quick chip, so chip counts can be shown against it */
export function applyBaseFilters(tasks: Task[], f: TaskFilters, ctx: FilterContext) {
  const q = f.q.trim().toLowerCase();
  const wantsClosed = f.showDone || f.status === "approved" || f.status === "cancelled";
  return tasks.filter((t) => {
    if (ctx.role === "employee" && t.status === "draft") return false;
    if (!wantsClosed && isClosed(t)) return false;
    if (f.assignee && t.assigneeId !== f.assignee) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.project === "none" ? !!t.projectId : f.project && t.projectId !== f.project) return false;
    if (f.reviewerMe && ctx.role !== "owner" && t.reviewerId !== ctx.meId) return false;
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function applyFilters(tasks: Task[], f: TaskFilters, ctx: FilterContext) {
  const base = applyBaseFilters(tasks, f, ctx);
  return f.quick ? base.filter((t) => matchesQuick(t, f.quick!, ctx.now)) : base;
}

export function sortTasks(tasks: Task[], key: SortKey, lastActivity: Record<string, string>) {
  const list = [...tasks];
  const due = (t: Task) => new Date(t.dueAt).getTime();
  switch (key) {
    case "deadline":
      return list.sort((a, b) => due(a) - due(b));
    case "priority":
      return list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || due(a) - due(b));
    case "activity":
      return list.sort((a, b) => (lastActivity[b.id] ?? b.statusChangedAt).localeCompare(lastActivity[a.id] ?? a.statusChangedAt));
    case "stale":
      return list.sort((a, b) => a.statusChangedAt.localeCompare(b.statusChangedAt));
  }
}

export function activeFilterCount(f: TaskFilters) {
  return [f.q.trim(), f.assignee, f.status, f.priority, f.project, f.quick, f.reviewerMe].filter(Boolean).length;
}

/* ------------------------------------------------------------------ */
/* saved views                                                         */
/* ------------------------------------------------------------------ */

export interface SavedView {
  id: string;
  name: string;
  filters: TaskFilters;
  sort: SortKey;
  builtIn?: boolean;
}

export function builtInViews(role: Role): SavedView[] {
  const views: SavedView[] = [
    {
      id: "builtin_overdue",
      name: role === "employee" ? "My overdue tasks" : "Overdue in my scope",
      filters: { ...EMPTY_FILTERS, quick: "overdue" },
      sort: "deadline",
      builtIn: true,
    },
    {
      id: "builtin_approval",
      name: "Awaiting my approval",
      filters: { ...EMPTY_FILTERS, quick: "review", reviewerMe: true },
      sort: "stale",
      builtIn: true,
    },
    {
      id: "builtin_stuck",
      name: "Stuck over 3 days",
      filters: { ...EMPTY_FILTERS, quick: "stuck" },
      sort: "stale",
      builtIn: true,
    },
  ];
  return role === "employee" ? views.filter((v) => v.id !== "builtin_approval") : views;
}

const VIEWS_KEY = "pulse-task-views";
const MODE_KEY = "pulse-task-mode";

export function readSavedViews(meId: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(`${VIEWS_KEY}:${meId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed.map((v) => ({ ...v, filters: { ...EMPTY_FILTERS, ...v.filters } })) : [];
  } catch {
    return [];
  }
}

export function writeSavedViews(meId: string, views: SavedView[]) {
  try {
    window.localStorage.setItem(`${VIEWS_KEY}:${meId}`, JSON.stringify(views));
  } catch {
    /* storage blocked: the view still works for this visit */
  }
}

export function readMode(): ViewMode {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    const v = fromUrl ?? window.localStorage.getItem(MODE_KEY);
    return v === "board" || v === "calendar" ? v : "list";
  } catch {
    return "list";
  }
}

export function writeMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** `?filter=overdue` lets other screens deep-link into a quick filter */
export function readQuickFromUrl(): QuickKey | null {
  try {
    const v = new URLSearchParams(window.location.search).get("filter");
    return v && v in QUICK_LABEL ? (v as QuickKey) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* small shared hooks                                                  */
/* ------------------------------------------------------------------ */

export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** "3 days", "5h", "40 min": how long a task has been in its state */
export function durationLabel(fromIso: string, now: Date) {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(fromIso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.floor(hrs / 24)} days`;
}
