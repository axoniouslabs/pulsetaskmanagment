import "server-only";
import { and, desc, eq, getTableColumns, gte, inArray, sql } from "drizzle-orm";
import { format, subDays } from "date-fns";
import type { Person, Task, Timer } from "@/lib/types";
import type { DailyStat } from "@/lib/seed";
import { scopePeople, scopeTasks } from "@/lib/selectors";
import { membersOf, emptyWorld, type World } from "@/domain/world";
import { schema, type DB, type Tx } from "./db";

type Conn = DB | Tx;
const S = schema;

/* ------------------------------------------------------------------ */
/* row ↔ domain conversion                                             */
/* ------------------------------------------------------------------ */

const DATE_FIELDS: Record<string, string[]> = {
  tasks: ["createdAt", "startAt", "dueAt", "lastReminderAt", "blockedAt", "submittedAt", "acknowledgedAt", "startedAt", "approvedAt", "statusChangedAt", "snoozedUntil"],
  activity: ["at"],
  notifications: ["at", "pushedAt", "deliveredAt", "seenAt"],
  announcements: ["at", "ackDueAt"],
  questions: ["at", "answeredAt"],
  deadlineRequests: ["newDueAt", "at"],
  attendance: ["checkIn", "checkOut"],
  groups: ["archivedAt"],
  devices: ["lastSeen"],
};

/** Date → ISO, null → (omitted) */
function fromRow<T>(row: Record<string, unknown>, drop: string[] = []): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (drop.includes(k) || v === null || v === undefined) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out as T;
}

/** ISO → Date for known date fields; undefined → null for nullable columns, omitted otherwise (so defaults apply) */
function toRow(obj: Record<string, unknown>, table: string, columns: Record<string, { notNull: boolean }>, extra: Record<string, unknown> = {}) {
  const dates = DATE_FIELDS[table] ?? [];
  const out: Record<string, unknown> = { ...extra };
  for (const [c, col] of Object.entries(columns)) {
    if (c in extra) continue;
    const v = obj[c];
    if (v === undefined) {
      if (!col.notNull) out[c] = null;
    } else if (dates.includes(c) && typeof v === "string") out[c] = new Date(v);
    else out[c] = v;
  }
  return out;
}

const cols = (table: Parameters<typeof getTableColumns>[0]) => getTableColumns(table) as unknown as Record<string, { notNull: boolean }>;

/* ------------------------------------------------------------------ */
/* load                                                                */
/* ------------------------------------------------------------------ */

export interface LoadOptions {
  /** include activity (snapshot) or not (commands only append) */
  activity?: boolean;
  /** only this person's notifications (commands) */
  notificationsFor?: string;
  stats?: boolean;
}

export async function loadWorld(c: Conn, orgId: string, opts: LoadOptions = {}): Promise<World> {
  const w = emptyWorld();
  w.orgId = orgId;
  const [org] = await c.select().from(S.organizations).where(eq(S.organizations.id, orgId));
  if (!org) throw new Error(`Organisation ${orgId} not found`);
  w.settings = { ...org.settings, name: org.name, timezone: org.timezone };

  const since30 = format(subDays(new Date(), 35), "yyyy-MM-dd");
  const [peopleRows, deviceRows, deps, teams, groups, projects, tasks, channels, anns, questions, drs, att, leaves, timerRows] = await Promise.all([
    c.select().from(S.people).where(eq(S.people.orgId, orgId)),
    c.select().from(S.devices).where(eq(S.devices.orgId, orgId)),
    c.select().from(S.departments).where(eq(S.departments.orgId, orgId)),
    c.select().from(S.teams).where(eq(S.teams.orgId, orgId)),
    c.select().from(S.groups).where(eq(S.groups.orgId, orgId)),
    c.select().from(S.projects).where(eq(S.projects.orgId, orgId)),
    c.select().from(S.tasks).where(eq(S.tasks.orgId, orgId)).orderBy(desc(S.tasks.createdAt)),
    c.select().from(S.channels).where(eq(S.channels.orgId, orgId)),
    c.select().from(S.announcements).where(eq(S.announcements.orgId, orgId)).orderBy(desc(S.announcements.at)),
    c.select().from(S.questions).where(eq(S.questions.orgId, orgId)).orderBy(desc(S.questions.at)),
    c.select().from(S.deadlineRequests).where(eq(S.deadlineRequests.orgId, orgId)).orderBy(desc(S.deadlineRequests.at)),
    c.select().from(S.attendance).where(and(eq(S.attendance.orgId, orgId), gte(S.attendance.date, since30))),
    c.select().from(S.leaves).where(eq(S.leaves.orgId, orgId)),
    c.select().from(S.timers).where(eq(S.timers.orgId, orgId)),
  ]);

  w.people = peopleRows.map((r) => {
    const p = fromRow<Person>(r, ["orgId", "userId", "prefs", "dayOrder", "createdAt"]);
    p.devices = deviceRows
      .filter((d) => d.personId === r.id)
      .map((d) => ({ id: d.id, kind: d.kind as Person["devices"][number]["kind"], label: d.label, lastSeen: d.lastSeen.toISOString(), healthy: d.healthy }));
    w.prefs[r.id] = r.prefs ?? {};
    if (r.dayOrder?.length) w.dayOrder[r.id] = r.dayOrder;
    return p;
  });
  w.departments = deps.map((r) => fromRow(r, ["orgId"]));
  w.teams = teams.map((r) => fromRow(r, ["orgId"]));
  w.groups = groups.filter((g) => !g.archivedAt).map((r) => fromRow(r, ["orgId"]));
  w.projects = projects.map((r) => fromRow(r, ["orgId"]));
  w.tasks = tasks.map((r) => fromRow<Task>(r, ["orgId", "updatedAt"]));
  w.channels = channels.map((r) => fromRow(r, ["orgId"]));
  w.announcements = anns.map((r) => fromRow(r, ["orgId"]));
  w.questions = questions.map((r) => fromRow(r, ["orgId"]));
  w.deadlineRequests = drs.map((r) => fromRow(r, ["orgId"]));
  w.attendance = att.map((r) => fromRow(r, ["orgId", "id"]));
  w.leaves = leaves.map((r) => fromRow(r, ["orgId"]));
  for (const t of timerRows) w.timers[t.personId] = { taskId: t.taskId, startedAt: t.startedAt.toISOString() };

  if (opts.activity) {
    const rows = await c.select().from(S.activity).where(and(eq(S.activity.orgId, orgId), gte(S.activity.at, subDays(new Date(), 30)))).orderBy(desc(S.activity.at)).limit(1500);
    w.activity = rows.map((r) => fromRow(r, ["orgId"]));
  }
  const nWhere = opts.notificationsFor
    ? and(eq(S.notifications.orgId, orgId), eq(S.notifications.recipientId, opts.notificationsFor))
    : eq(S.notifications.orgId, orgId);
  const nRows = await c.select().from(S.notifications).where(nWhere).orderBy(desc(S.notifications.at)).limit(opts.notificationsFor ? 200 : 2000);
  w.notifications = nRows.map((r) => fromRow(r, ["orgId", "pushedAt", "deliveredAt", "seenAt"]));

  if (opts.stats) {
    const rows = await c.select().from(S.dailyStats).where(and(eq(S.dailyStats.orgId, orgId), gte(S.dailyStats.date, since30)));
    w.stats = rows.map((r) => fromRow<DailyStat>(r, ["orgId", "id"]));
  }
  return w;
}

/* ------------------------------------------------------------------ */
/* persist: write what a command changed                               */
/* ------------------------------------------------------------------ */

type Keyed = { id: string };
function diff<T extends Keyed>(before: T[], after: T[]) {
  const old = new Map(before.map((x) => [x.id, JSON.stringify(x)]));
  const added: T[] = [];
  const changed: T[] = [];
  for (const x of after) {
    const prev = old.get(x.id);
    if (prev === undefined) added.push(x);
    else if (prev !== JSON.stringify(x)) changed.push(x);
  }
  return { added, changed };
}

export async function persist(tx: Tx, before: World, after: World) {
  const orgId = after.orgId;
  const extra = { orgId };

  const upsert = async <T extends Keyed>(
    name: string,
    table: typeof S.tasks | typeof S.departments | typeof S.teams | typeof S.groups | typeof S.channels | typeof S.announcements | typeof S.questions | typeof S.deadlineRequests | typeof S.leaves,
    b: T[],
    a: T[],
  ) => {
    const { added, changed } = diff(b, a);
    const columns = cols(table);
    for (const x of added) await tx.insert(table).values(toRow(x as unknown as Record<string, unknown>, name, columns, extra) as never);
    for (const x of changed) {
      const row = toRow(x as unknown as Record<string, unknown>, name, columns, extra);
      delete row.id;
      if (name === "tasks") row.updatedAt = new Date();
      await tx.update(table).set(row as never).where(eq((table as typeof S.tasks).id, x.id));
    }
  };

  await upsert("tasks", S.tasks, before.tasks, after.tasks);
  await upsert("departments", S.departments, before.departments, after.departments);
  await upsert("teams", S.teams, before.teams, after.teams);
  await upsert("groups", S.groups, before.groups, after.groups);
  await upsert("channels", S.channels, before.channels, after.channels);
  await upsert("announcements", S.announcements, before.announcements, after.announcements);
  await upsert("questions", S.questions, before.questions, after.questions);
  await upsert("deadlineRequests", S.deadlineRequests, before.deadlineRequests, after.deadlineRequests);
  await upsert("leaves", S.leaves, before.leaves, after.leaves);

  // people: profile fields + personal prefs / order
  const peopleCols = ["name", "initials", "role", "title", "departmentId", "teamId", "hue", "capacityHours", "email", "phone", "workType", "onLeave", "backupId", "active"];
  const pb = new Map(before.people.map((p) => [p.id, p]));
  for (const p of after.people) {
    const old = pb.get(p.id);
    if (!old) continue; // people are created by invites, not commands
    const patch: Record<string, unknown> = {};
    for (const k of peopleCols) {
      const nv = (p as unknown as Record<string, unknown>)[k];
      const ov = (old as unknown as Record<string, unknown>)[k];
      if (JSON.stringify(nv) !== JSON.stringify(ov)) patch[k] = nv ?? null;
    }
    if (JSON.stringify(after.prefs[p.id] ?? {}) !== JSON.stringify(before.prefs[p.id] ?? {})) patch.prefs = after.prefs[p.id] ?? {};
    if (JSON.stringify(after.dayOrder[p.id] ?? []) !== JSON.stringify(before.dayOrder[p.id] ?? [])) patch.dayOrder = after.dayOrder[p.id] ?? [];
    if (Object.keys(patch).length) await tx.update(S.people).set(patch).where(eq(S.people.id, p.id));
  }

  // attendance (keyed by person + date)
  const attKey = (a: { personId: string; date: string }) => `${a.personId}_${a.date}`;
  const ab = new Map(before.attendance.map((a) => [attKey(a), JSON.stringify(a)]));
  for (const a of after.attendance) {
    const key = attKey(a);
    if (ab.get(key) === JSON.stringify(a)) continue;
    const row = { id: key, orgId, personId: a.personId, date: a.date, checkIn: a.checkIn ? new Date(a.checkIn) : null, checkOut: a.checkOut ? new Date(a.checkOut) : null, breakMin: a.breakMin, status: a.status };
    await tx.insert(S.attendance).values(row).onConflictDoUpdate({ target: S.attendance.id, set: { checkIn: row.checkIn, checkOut: row.checkOut, breakMin: row.breakMin, status: row.status } });
  }

  // timers
  const ids = new Set([...Object.keys(before.timers), ...Object.keys(after.timers)]);
  for (const personId of ids) {
    const b = before.timers[personId];
    const a = after.timers[personId];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    if (!a) await tx.delete(S.timers).where(eq(S.timers.personId, personId));
    else await tx.insert(S.timers).values({ personId, orgId, taskId: a.taskId, startedAt: new Date(a.startedAt) }).onConflictDoUpdate({ target: S.timers.personId, set: { taskId: a.taskId, startedAt: new Date(a.startedAt) } });
  }

  // settings
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    const { name, timezone, ...rest } = after.settings;
    await tx.update(S.organizations).set({ name, timezone, settings: { ...rest, name, timezone } }).where(eq(S.organizations.id, orgId));
  }

  // activity: append only
  const seenAct = new Set(before.activity.map((a) => a.id));
  const newActs = after.activity.filter((a) => !seenAct.has(a.id));
  if (newActs.length) await tx.insert(S.activity).values(newActs.map((a) => ({ id: a.id, orgId, at: new Date(a.at), actorId: a.actorId, kind: a.kind, taskId: a.taskId ?? null, text: a.text })));

  // notifications: new ones, and read flags
  const nb = new Map(before.notifications.map((n) => [n.id, n]));
  const newNotes = after.notifications.filter((n) => !nb.has(n.id));
  if (newNotes.length)
    await tx.insert(S.notifications).values(newNotes.map((n) => ({ id: n.id, orgId, recipientId: n.recipientId, at: new Date(n.at), kind: n.kind, title: n.title, body: n.body, taskId: n.taskId ?? null, read: n.read })));
  const nowRead = after.notifications.filter((n) => n.read && nb.get(n.id) && !nb.get(n.id)!.read).map((n) => n.id);
  if (nowRead.length) await tx.update(S.notifications).set({ read: true, seenAt: new Date() }).where(inArray(S.notifications.id, nowRead));

  return { newNotificationIds: newNotes.map((n) => n.id) };
}

/* ------------------------------------------------------------------ */
/* the copy of the world one person is allowed to see                  */
/* ------------------------------------------------------------------ */

export function scopeWorld(w: World, personId: string): World {
  const me = w.people.find((p) => p.id === personId);
  if (!me) throw new Error("Person not in organisation");
  const role = me.role;
  const people = scopePeople(w, role, personId);
  const peopleIds = new Set(people.map((p) => p.id));
  const visibleTasks = scopeTasks(w, role, personId);
  const extraTasks = w.tasks.filter((t) => t.reviewerId === personId || t.blockedOwnerId === personId || t.createdById === personId);
  const tasks = role === "owner" ? w.tasks : Array.from(new Map([...visibleTasks, ...extraTasks].map((t) => [t.id, t])).values());
  const taskIds = new Set(tasks.map((t) => t.id));
  const isOwner = role === "owner";

  const channelIds = new Set(w.channels.filter((c) => isOwner || membersOf(w, c.unitType, c.unitId).includes(personId)).map((c) => c.id));

  return {
    ...w,
    tasks,
    activity: isOwner ? w.activity : w.activity.filter((a) => a.actorId === personId || (a.taskId && taskIds.has(a.taskId)) || (!a.taskId && peopleIds.has(a.actorId))).slice(0, 800),
    notifications: w.notifications.filter((n) => n.recipientId === personId).slice(0, 150),
    channels: w.channels.filter((c) => channelIds.has(c.id)),
    announcements: w.announcements.filter((a) => channelIds.has(a.channelId)),
    attendance: w.attendance.filter((a) => isOwner || peopleIds.has(a.personId) || a.personId === personId),
    leaves: w.leaves.filter((l) => isOwner || peopleIds.has(l.personId) || l.personId === personId),
    questions: w.questions.filter((q) => q.fromId === personId || q.toId === personId || (isOwner && false)),
    deadlineRequests: w.deadlineRequests.filter((d) => taskIds.has(d.taskId)),
    stats: w.stats.filter((s) => isOwner || peopleIds.has(s.personId) || s.personId === personId),
    timers: Object.fromEntries(Object.entries(w.timers).filter(([pid]) => isOwner || peopleIds.has(pid) || pid === personId)) as Record<string, Timer | undefined>,
    prefs: { [personId]: w.prefs[personId] ?? {} },
    dayOrder: { [personId]: w.dayOrder[personId] ?? [] },
  };
}

/** take a per-organisation lock for the length of the transaction */
export async function lockOrg(tx: Tx, orgId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);
}

