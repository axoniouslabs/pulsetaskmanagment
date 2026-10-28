import { differenceInHours, isToday } from "date-fns";
import type { HeatLevel, Person, Role, Task, TaskStatus } from "./types";
import type { AppState } from "./store";
import { membersOf } from "@/domain/world";

export const ACTIVE: TaskStatus[] = ["assigned", "acknowledged", "in_progress", "blocked", "submitted"];

export const isActive = (t: Task) => ACTIVE.includes(t.status);
export const isOpenWork = (t: Task) => ["assigned", "acknowledged", "in_progress", "blocked"].includes(t.status);

/** overdue from the next working moment after the deadline (see overdueFrom), not the deadline itself */
export const isOverdue = (t: Task, now = new Date()) => isActive(t) && t.status !== "submitted" && new Date(t.overdueAt ?? t.dueAt).getTime() < now.getTime();

/** escalation heat as the owner sees it: overdue is always at least level 3 */
export function heatOf(t: Task, now = new Date()): HeatLevel {
  if (!isActive(t) || t.status === "blocked" || t.status === "submitted") return 0;
  if (isOverdue(t, now)) {
    const late = differenceInHours(now, new Date(t.dueAt));
    return late >= 24 && !t.acknowledgedAt ? 4 : (Math.max(3, t.escalationLevel) as HeatLevel);
  }
  return t.escalationLevel;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  draft: "Draft",
  assigned: "Not seen yet",
  acknowledged: "Seen",
  in_progress: "In progress",
  blocked: "Blocked",
  submitted: "Waiting for review",
  approved: "Done",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" } as const;

/** who the current viewer is responsible for */
export function scopePeople(s: Pick<AppState, "people" | "teams" | "departments">, role: Role, meId: string): Person[] {
  const people = s.people.filter((p) => p.active !== false);
  if (role === "owner") return people;
  if (role === "employee") return people.filter((p) => p.id === meId);
  const headOf = s.departments.find((d) => d.headId === meId);
  const depTeams = headOf ? s.teams.filter((t) => t.departmentId === headOf.id).map((t) => t.id) : [];
  if (headOf) return people.filter((p) => p.departmentId === headOf.id || p.secondaryTeamIds?.some((id) => depTeams.includes(id)));
  const leads = s.teams.filter((t) => t.leadId === meId).map((t) => t.id);
  // secondary members of a team are in its lead's view too
  return people.filter((p) => leads.includes(p.teamId) || p.secondaryTeamIds?.some((id) => leads.includes(id)) || p.id === meId);
}

/** offered to a team or group I belong to, and nobody has claimed it yet */
export const isOpenToClaim = (s: Pick<AppState, "people" | "teams" | "groups">, t: Task, meId: string) =>
  !!t.groupClaim && !t.groupClaim.claimed && t.status === "assigned" && !!t.groupClaim.unitType && !!t.groupClaim.unitId && membersOf(s, t.groupClaim.unitType, t.groupClaim.unitId).includes(meId);

export function scopeTasks(s: Pick<AppState, "people" | "teams" | "departments" | "tasks" | "groups">, role: Role, meId: string): Task[] {
  if (role === "owner") return s.tasks;
  const ids = new Set(scopePeople(s, role, meId).map((p) => p.id));
  if (role === "employee") return s.tasks.filter((t) => t.assigneeId === meId || t.watcherIds.includes(meId) || isOpenToClaim(s, t, meId));
  return s.tasks.filter((t) => ids.has(t.assigneeId) || t.reviewerId === meId || t.blockedOwnerId === meId || t.watcherIds.includes(meId) || isOpenToClaim(s, t, meId));
}

export interface Attention {
  overdue: Task[];
  unseen: Task[];
  blocked: Task[];
  slowReview: Task[];
  quiet: Person[];
}

/** the five things the owner's main screen is about (spec §11) */
export function attention(s: AppState, tasks: Task[], people: Person[], now = new Date()): Attention {
  const overdue = tasks.filter((t) => isOverdue(t, now)).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const unseen = tasks.filter((t) => t.status === "assigned" && !isOverdue(t, now) && t.remindersIgnored >= s.settings.escalation.l1Ignored).sort((a, b) => b.remindersIgnored - a.remindersIgnored);
  const blocked = tasks.filter((t) => t.status === "blocked").sort((a, b) => (a.blockedAt ?? "").localeCompare(b.blockedAt ?? ""));
  const slowReview = tasks
    .filter((t) => t.status === "submitted" && t.submittedAt && differenceInHours(now, new Date(t.submittedAt)) >= s.settings.reviewSlaHours)
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const activeToday = new Set(s.activity.filter((a) => isToday(new Date(a.at))).map((a) => a.actorId));
  const quiet = people.filter(
    // never the viewer: their own work is on My day, not something to chase
    (p) => p.role !== "owner" && p.id !== s.viewer?.personId && p.active !== false && !p.onLeave && !activeToday.has(p.id) && tasks.some((t) => t.assigneeId === p.id && isOpenWork(t)),
  );
  return { overdue, unseen, blocked, slowReview, quiet };
}

/** committed hours for a person on a given day from open task estimates */
export function committedHours(tasks: Task[], personId: string, day = new Date()) {
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return (
    tasks
      // overdue work is still owed, all of it today
      .filter((t) => t.assigneeId === personId && isOpenWork(t) && new Date(t.startAt ?? t.createdAt) <= end)
      .reduce((sum, t) => {
        const days = Math.max(1, Math.ceil((new Date(t.dueAt).getTime() - day.getTime()) / 86400000));
        const remaining = Math.max(0.25, t.estimateHours - t.loggedMinutes / 60);
        return sum + remaining / days;
      }, 0)
  );
}

export const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<string, T>;

export const NEXT_UP_SCORE = (t: Task, now = new Date()) => {
  const pr = { urgent: 0, high: 1, normal: 2, low: 3 }[t.priority];
  const hours = (new Date(t.dueAt).getTime() - now.getTime()) / 3600000;
  const statusBoost = t.status === "assigned" ? -2 : t.status === "in_progress" ? -1 : 0;
  return pr * 6 + Math.max(-12, Math.min(hours, 72)) / 6 + statusBoost;
};
