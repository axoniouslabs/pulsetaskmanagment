import "server-only";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createSeed } from "@/lib/seed";
import { emptyWorld, type World } from "@/domain/world";
import { db, schema as S } from "./db";
import { persist } from "./repo";

/**
 * The demo company (Crescent Distributors): 20 staff, 5 departments, real logins
 * (firstname@crescent.pk / SEED_PASSWORD). Times are generated relative to now so
 * the demo always looks like a normal working day. Seeding runs in Pakistan time.
 */
export const DEMO_ORG_ID = "org_crescent";

export async function seedDemo({ reset = false }: { reset?: boolean } = {}): Promise<string> {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) throw new Error("Set SEED_PASSWORD (8+ characters) before seeding.");

  const [existing] = await db.select({ id: S.organizations.id }).from(S.organizations).where(eq(S.organizations.id, DEMO_ORG_ID));
  if (existing && !reset) {
    return "Demo company already loaded. Use --reset to load it fresh.";
  }

  // the generator works in local time; build it in Pakistan time (synchronous, so nothing else runs meanwhile)
  const prevTz = process.env.TZ;
  process.env.TZ = "Asia/Karachi";
  const seed = createSeed(new Date());
  if (prevTz === undefined) delete process.env.TZ;
  else process.env.TZ = prevTz;
  const hash = await hashPassword(password);

  await db.transaction(async (tx) => {
    if (existing) await wipe(tx);

    await tx.insert(S.organizations).values({ id: DEMO_ORG_ID, name: seed.settings.name, timezone: seed.settings.timezone, settings: seed.settings });

    for (const p of seed.people) {
      const userId = `u_${p.id.slice(2)}`;
      // logins survive a reset, so whoever pressed "Reset" stays signed in
      await tx.insert(S.user).values({ id: userId, name: p.name, email: p.email, emailVerified: true }).onConflictDoNothing();
      await tx
        .insert(S.account)
        .values({ id: `a_${p.id.slice(2)}`, accountId: userId, providerId: "credential", userId, password: hash })
        .onConflictDoUpdate({ target: S.account.id, set: { password: hash } });
      await tx.insert(S.people).values({
        id: p.id,
        orgId: DEMO_ORG_ID,
        userId,
        name: p.name,
        initials: p.initials,
        role: p.role,
        title: p.title,
        departmentId: p.departmentId,
        teamId: p.teamId,
        hue: p.hue,
        capacityHours: p.capacityHours,
        email: p.email,
        phone: p.phone,
        workType: p.workType,
        onLeave: p.onLeave ?? false,
        backupId: p.backupId ?? null,
      });
      // demo devices have no push subscription; a real one is added when the person allows notifications
      for (const d of p.devices) {
        await tx.insert(S.devices).values({ id: `${p.id}_${d.id}`, orgId: DEMO_ORG_ID, personId: p.id, kind: d.kind, label: d.label, lastSeen: new Date(d.lastSeen), healthy: d.healthy });
      }
    }

    const before: World = { ...emptyWorld(), orgId: DEMO_ORG_ID, settings: seed.settings, people: seed.people };
    const after: World = {
      ...before,
      departments: seed.departments,
      teams: seed.teams,
      groups: seed.groups,
      projects: [],
      tasks: seed.tasks,
      activity: seed.activity,
      notifications: seed.notifications,
      channels: seed.channels,
      announcements: seed.announcements,
      attendance: seed.attendance,
      leaves: seed.leaves,
      questions: seed.questions,
      deadlineRequests: seed.deadlineRequests,
    };
    await persist(tx, before, after);

    if (seed.projects.length) await tx.insert(S.projects).values(seed.projects.map((p) => ({ ...p, orgId: DEMO_ORG_ID })));
    // read state of seeded notifications (persist inserts them with their read flag already)
    if (seed.stats.length) {
      const rows = seed.stats.map((s) => ({ ...s, id: `${s.personId}_${s.date}`, orgId: DEMO_ORG_ID }));
      for (let i = 0; i < rows.length; i += 500) await tx.insert(S.dailyStats).values(rows.slice(i, i + 500));
    }
  });

  return `Loaded ${seed.people.length} people, ${seed.departments.length} departments, ${seed.tasks.length} tasks.`;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** remove the demo organisation, including its append-only activity */
async function wipe(tx: Tx) {
  const byOrg = [S.devices, S.departments, S.teams, S.groups, S.projects, S.tasks, S.notifications, S.timers, S.channels, S.announcements, S.questions, S.deadlineRequests, S.attendance, S.leaves, S.dailyStats];
  for (const t of byOrg) await tx.delete(t).where(eq((t as typeof S.tasks).orgId, DEMO_ORG_ID));
  // the log refuses deletes on purpose; the demo reset is the one sanctioned exception
  await tx.execute(sql`alter table activity disable trigger activity_no_delete`);
  await tx.delete(S.activity).where(eq(S.activity.orgId, DEMO_ORG_ID));
  await tx.execute(sql`alter table activity enable trigger activity_no_delete`);
  await tx.delete(S.people).where(eq(S.people.orgId, DEMO_ORG_ID));
  await tx.delete(S.organizations).where(eq(S.organizations.id, DEMO_ORG_ID));
}

