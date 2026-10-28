import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema as S } from "./db";
import { loadWorld } from "./repo";
import { newId } from "./ids";

const KEEP_DAYS = 14;

/** the whole company as one object: nothing secret (no passwords, no device keys) */
export async function exportData(orgId: string) {
  const w = await loadWorld(db, orgId, { activity: true, stats: true, allActivity: true });
  return {
    exportedAt: new Date().toISOString(),
    company: w.settings.name,
    settings: w.settings,
    people: w.people.map(({ devices, ...p }) => ({ ...p, devices: devices.length })),
    departments: w.departments,
    teams: w.teams,
    groups: w.groups,
    projects: w.projects,
    tasks: w.tasks,
    activity: w.activity,
    channels: w.channels,
    announcements: w.announcements,
    questions: w.questions,
    deadlineRequests: w.deadlineRequests,
    attendance: w.attendance,
    leaves: w.leaves,
    dailyStats: w.stats,
    templates: w.templates,
  };
}

/** nightly copy, kept for two weeks */
export async function makeBackup(orgId: string, now = new Date()) {
  const data = gzipSync(Buffer.from(JSON.stringify(await exportData(orgId))));
  await db.insert(S.backups).values({ id: newId("bk"), orgId, at: now, size: data.length, data });
  await db.delete(S.backups).where(and(eq(S.backups.orgId, orgId), lt(S.backups.at, new Date(now.getTime() - KEEP_DAYS * 864e5))));
}

export async function listBackups(orgId: string) {
  const rows = await db
    .select({ id: S.backups.id, at: S.backups.at, size: S.backups.size })
    .from(S.backups)
    .where(eq(S.backups.orgId, orgId))
    .orderBy(desc(S.backups.at))
    .limit(KEEP_DAYS + 2);
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), size: r.size }));
}

export async function readBackup(orgId: string, id: string) {
  const [r] = await db
    .select()
    .from(S.backups)
    .where(and(eq(S.backups.id, id), eq(S.backups.orgId, orgId)));
  return r ? { at: r.at, json: gunzipSync(r.data) } : null;
}
