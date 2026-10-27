import * as React from "react";
import { differenceInHours, endOfWeek, startOfWeek } from "date-fns";
import type { Priority, Role, Task, TaskStatus } from "@/lib/types";
import { isActive, isOverdue } from "@/lib/selectors";

/* ------------------------------------------------------------------ */
/* filter model                                                        */
/* ------------------------------------------------------------------ */

export type ViewMode = "list" | "board" | "calendar" | "timeline";
export type SortKey = "deadline" | "priority" | "activity" | "stale";
export type QuickKey = "overdue" | "blocked" | "unseen" | "review" | "week" | "stuck";

/** every list is "any of these"; an empty list means no filter */
export interface TaskFilters {
  q: string;
  assignee: string[];
  status: TaskStatus[];
  priority: Priority[];
  project: string[]; // "none" = no project
  tags: string[];
  /** due between these days (yyyy-MM-dd), either end optional */
  from: string;
  to: string;
  quick: QuickKey | null;
  reviewerMe: boolean; // only work the viewer reviews
  showDone: boolean;
  /** include archived work */
  archived: boolean;
}

export const EMPTY_FILTERS: TaskFilters = {
  q: "",
  assignee: [],
  status: [],
  priority: [],
  project: [],
  tags: [],
  from: "",
  to: "",
  quick: null,
  reviewerMe: false,
  showDone: false,
  archived: false,
};

/** saved views from before filters took several values held single strings */
export function normalizeFilters(raw: Record<string, unknown> | undefined): TaskFilters {
  const f = { ...EMPTY_FILTERS, ...(raw ?? {}) } as Record<string, unknown>;
  for (const k of ["assignee", "status", "priority", "project", "tags"]) {
    const v = f[k];
    f[k] = Array.isArray(v) ? v.filter((x) => typeof x === "string") : typeof v === "string" && v ? [v] : [];
  }
  for (const k of ["q", "from", "to"]) if (typeof f[k] !== "string") f[k] = "";
  return f as unknown as TaskFilters;
}

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
  const q = f.q.trim().toLowerCase().replace(/^#/, "");
  const wantsClosed = f.showDone || f.status.includes("approved") || f.status.includes("cancelled") || f.archived;
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : -Infinity;
  const to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : Infinity;
  return tasks.filter((t) => {
    if (ctx.role === "employee" && t.status === "draft") return false;
    // archived work is hidden but still found by a search
    if (t.archivedAt && !f.archived && !q) return false;
    if (!wantsClosed && !q && isClosed(t)) return false;
    if (f.assignee.length && !f.assignee.includes(t.assigneeId)) return false;
    if (f.status.length && !f.status.includes(t.status)) return false;
    if (f.priority.length && !f.priority.includes(t.priority)) return false;
    if (f.project.length && !f.project.includes(t.projectId ?? "none")) return false;
    if (f.tags.length && !f.tags.some((tag) => t.tags.includes(tag))) return false;
    const due = new Date(t.dueAt).getTime();
    if (due < from || due > to) return false;
    if (f.reviewerMe && ctx.role !== "owner" && t.reviewerId !== ctx.meId) return false;
    if (q && !matchesText(t, q)) return false;
    return true;
  });
}

/** full-text search: title, description, tags, comments and the result report */
function matchesText(t: Task, q: string) {
  if (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) return true;
  if (t.tags.some((x) => x.includes(q))) return true;
  if (t.submissionNote?.toLowerCase().includes(q) || t.progressNote?.toLowerCase().includes(q)) return true;
  return t.comments.some((c) => c.kind === "text" && c.body.toLowerCase().includes(q));
}

export function applyFilters(tasks: Task[], f: TaskFilters, ctx: FilterContext) {
  const base = applyBaseFilters(tasks, f, ctx);
  return f.quick ? base.filter((t) => matchesQuick(t, f.quick!, ctx.now)) : base;
}

/** pinned tasks come first, then the chosen order */
export function sortTasks(tasks: Task[], key: SortKey, lastActivity: Record<string, string>, pinned: Set<string> = new Set()) {
  const list = [...tasks];
  const due = (t: Task) => new Date(t.dueAt).getTime();
  const pin = (a: Task, b: Task) => Number(pinned.has(b.id)) - Number(pinned.has(a.id));
  switch (key) {
    case "deadline":
      return list.sort((a, b) => pin(a, b) || due(a) - due(b));
    case "priority":
      return list.sort((a, b) => pin(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || due(a) - due(b));
    case "activity":
      return list.sort((a, b) => pin(a, b) || (lastActivity[b.id] ?? b.statusChangedAt).localeCompare(lastActivity[a.id] ?? a.statusChangedAt));
    case "stale":
      return list.sort((a, b) => pin(a, b) || a.statusChangedAt.localeCompare(b.statusChangedAt));
  }
}

export function activeFilterCount(f: TaskFilters) {
  return [f.q.trim(), f.assignee.length, f.status.length, f.priority.length, f.project.length, f.tags.length, f.from || f.to, f.quick, f.reviewerMe, f.archived].filter(Boolean).length;
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

/** views saved on this device before they were kept on the account; moved over once */
export function readLegacyViews(meId: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(`${VIEWS_KEY}:${meId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed.map((v) => ({ ...v, filters: normalizeFilters(v.filters as unknown as Record<string, unknown>) })) : [];
  } catch {
    return [];
  }
}

export function forgetLegacyViews(meId: string) {
  try {
    window.localStorage.removeItem(`${VIEWS_KEY}:${meId}`);
  } catch {
    /* ignore */
  }
}

export function readMode(): ViewMode {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    const v = fromUrl ?? window.localStorage.getItem(MODE_KEY);
    return v === "board" || v === "calendar" || v === "timeline" ? v : "list";
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
