import "server-only";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db, schema as S } from "./db";
import { loadWorld } from "./repo";
import { scopePeople, scopeTasks } from "@/lib/selectors";
import type { Activity, Role } from "@/lib/types";

const PAGE = 300;

/**
 * Older activity, a page at a time, limited to what this person may see: the
 * owner sees everything; a manager their people and their tasks; everyone their
 * own record in full (spec §17, §19).
 */
export async function historyPage(viewer: { orgId: string; personId: string; role: Role }, before: Date, taskId?: string): Promise<{ items: Activity[]; more: boolean }> {
  const w = await loadWorld(db, viewer.orgId, { skipNotifications: true });
  const me = viewer.personId;
  let scope;
  if (viewer.role === "owner") scope = eq(S.activity.orgId, viewer.orgId);
  else {
    const people = scopePeople(w, viewer.role, me).map((p) => p.id);
    const tasks = Array.from(
      new Set([...scopeTasks(w, viewer.role, me), ...w.tasks.filter((t) => t.reviewerId === me || t.createdById === me || t.watcherIds.includes(me) || t.blockedOwnerId === me)].map((t) => t.id)),
    );
    const parts = [eq(S.activity.actorId, me), eq(S.activity.aboutId, me)];
    if (people.length) parts.push(inArray(S.activity.actorId, people));
    if (tasks.length) parts.push(inArray(S.activity.taskId, tasks));
    scope = and(eq(S.activity.orgId, viewer.orgId), or(...parts));
  }
  if (taskId) {
    const t = w.tasks.find((x) => x.id === taskId);
    const visible =
      viewer.role === "owner" || (t && (scopeTasks(w, viewer.role, me).some((x) => x.id === t.id) || [t.reviewerId, t.createdById, t.blockedOwnerId].includes(me) || t.watcherIds.includes(me)));
    if (!visible) return { items: [], more: false };
    scope = and(eq(S.activity.orgId, viewer.orgId), eq(S.activity.taskId, taskId));
  }
  const rows = await db
    .select()
    .from(S.activity)
    .where(and(scope, lt(S.activity.at, before)))
    .orderBy(desc(S.activity.at))
    .limit(PAGE + 1);
  const items = rows.slice(0, PAGE).map(({ orgId: _o, at, taskId: tid, aboutId, ...r }) => {
    void _o;
    return { ...r, at: at.toISOString(), ...(tid ? { taskId: tid } : {}), ...(aboutId ? { aboutId } : {}) } as Activity;
  });
  return { items, more: rows.length > PAGE };
}

/** everything Pulse holds about one person, for them to keep (spec §19) */
export async function personalRecord(orgId: string, personId: string) {
  const w = await loadWorld(db, orgId, { stats: true, skipNotifications: true });
  const p = w.people.find((x) => x.id === personId);
  const acts = await db
    .select()
    .from(S.activity)
    .where(
      and(
        eq(S.activity.orgId, orgId),
        or(
          eq(S.activity.actorId, personId),
          eq(S.activity.aboutId, personId),
          inArray(
            S.activity.taskId,
            w.tasks
              .filter((t) => t.assigneeId === personId)
              .map((t) => t.id)
              .concat("-"),
          ),
        ),
      ),
    )
    .orderBy(desc(S.activity.at));
  const notes = await db
    .select()
    .from(S.notifications)
    .where(and(eq(S.notifications.orgId, orgId), eq(S.notifications.recipientId, personId)))
    .orderBy(desc(S.notifications.at));
  const strip = <T extends Record<string, unknown>>(r: T) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "orgId"));
  return {
    exportedAt: new Date().toISOString(),
    company: w.settings.name,
    person: p ? { ...p, devices: p.devices.map((d) => ({ kind: d.kind, label: d.label, lastSeen: d.lastSeen, healthy: d.healthy })) } : null,
    tasks: w.tasks.filter((t) => t.assigneeId === personId || t.createdById === personId || t.reviewerId === personId),
    activity: acts.map(strip),
    notifications: notes.map(strip),
    attendance: w.attendance.filter((a) => a.personId === personId),
    leaves: w.leaves.filter((l) => l.personId === personId),
    dailyStats: w.stats.filter((s) => s.personId === personId),
  };
}
