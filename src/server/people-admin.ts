import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { TRIAL_MAX_PEOPLE } from "@/lib/access";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db, schema as S } from "./db";
import { lockOrg } from "./repo";
import { newId } from "./ids";
import { assertNotPaused, PausedError } from "./platform";

/** a paused company can't change its people */
async function notPaused(orgId: string) {
  try {
    await assertNotPaused(orgId);
  } catch (e) {
    throw e instanceof PausedError ? new AdminError(e.message) : e;
  }
}

/** easy to read out over the phone: no 0/O, 1/l */
export function tempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${part()}-${part()}-${part()}`;
}

export const personInput = z.object({
  name: z.string().trim().min(2, "Write their full name.").max(80),
  email: z.string().trim().toLowerCase().email("That email doesn't look right.").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  title: z.string().trim().min(1, "Add their job title.").max(80),
  role: z.enum(["employee", "manager"]),
  teamId: z.string().max(80).optional().default(""),
  workType: z.enum(["desk", "field"]).default("desk"),
  capacityHours: z.number().min(1).max(16).default(8),
});

export const personPatch = personInput.omit({ email: true, teamId: true }).partial().extend({ active: z.boolean().optional() });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase())
    .join("")
    .slice(0, 2);

const log = (orgId: string, actorId: string, text: string) => ({ id: newId("act"), orgId, at: new Date(), actorId, kind: "created", text });

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** add a person and their sign-in inside a transaction that already holds the org lock */
export async function insertPerson(tx: Tx, orgId: string, actorId: string, input: z.infer<typeof personInput>, opts: { hash: string; mustChangePassword: boolean; via: string }) {
  const [taken] = await tx.select({ id: S.user.id }).from(S.user).where(eq(S.user.email, input.email));
  if (taken) throw new AdminError("Someone already signs in with that email.");
  // a trial has room for a real try, not a whole firm
  const [org] = await tx.select({ trialEndsAt: S.organizations.trialEndsAt }).from(S.organizations).where(eq(S.organizations.id, orgId));
  if (org?.trialEndsAt) {
    const [n] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(S.people)
      .where(and(eq(S.people.orgId, orgId), eq(S.people.active, true)));
    if ((n?.n ?? 0) >= TRIAL_MAX_PEOPLE) throw new AdminError(`During the free trial a company can have up to ${TRIAL_MAX_PEOPLE} people. Contact us to add more.`);
  }
  const team = input.teamId
    ? (
        await tx
          .select()
          .from(S.teams)
          .where(and(eq(S.teams.id, input.teamId), eq(S.teams.orgId, orgId)))
      )[0]
    : undefined;
  if (input.teamId && !team) throw new AdminError("Pick a team in this company.");
  const userId = newId("u");
  const personId = newId("p");
  await tx.insert(S.user).values({ id: userId, name: input.name, email: input.email, emailVerified: true });
  await tx.insert(S.account).values({ id: newId("a"), accountId: userId, providerId: "credential", userId, password: opts.hash });
  await tx.insert(S.people).values({
    id: personId,
    orgId,
    userId,
    name: input.name,
    initials: initials(input.name),
    role: input.role,
    title: input.title,
    departmentId: team?.departmentId ?? "",
    teamId: team?.id ?? "",
    hue: randomInt(360),
    capacityHours: input.capacityHours,
    email: input.email,
    phone: input.phone,
    workType: input.workType,
    mustChangePassword: opts.mustChangePassword,
  });
  await tx.insert(S.activity).values(log(orgId, actorId, `${opts.via} ${input.name} (${input.title})${team ? ` to ${team.name}` : ""}`));
  return personId;
}

export async function createPerson(orgId: string, actorId: string, raw: unknown) {
  const input = personInput.parse(raw);
  await notPaused(orgId);
  const password = tempPassword();
  const hash = await hashPassword(password);
  return db.transaction(async (tx) => {
    await lockOrg(tx, orgId);
    const personId = await insertPerson(tx, orgId, actorId, input, { hash, mustChangePassword: true, via: "Added" });
    return { personId, password };
  });
}

/**
 * Delete someone added by mistake. Anyone who has done any work, been given
 * any, or checked in is deactivated instead, so their history stays.
 */
export async function deletePerson(orgId: string, actorId: string, personId: string) {
  await notPaused(orgId);
  return db.transaction(async (tx) => {
    await lockOrg(tx, orgId);
    const [p] = await tx
      .select()
      .from(S.people)
      .where(and(eq(S.people.id, personId), eq(S.people.orgId, orgId)));
    if (!p) throw new AdminError("That person isn't in this company.");
    if (p.role === "owner") throw new AdminError("The owner can't be deleted.");
    if (personId === actorId) throw new AdminError("You can't delete yourself.");
    const touches = or(eq(S.tasks.assigneeId, personId), eq(S.tasks.createdById, personId), eq(S.tasks.reviewerId, personId));
    const [task] = await tx
      .select({ id: S.tasks.id })
      .from(S.tasks)
      .where(and(eq(S.tasks.orgId, orgId), touches))
      .limit(1);
    const [acted] = await tx
      .select({ id: S.activity.id })
      .from(S.activity)
      .where(and(eq(S.activity.orgId, orgId), eq(S.activity.actorId, personId)))
      .limit(1);
    const [came] = await tx.select({ id: S.attendance.id }).from(S.attendance).where(eq(S.attendance.personId, personId)).limit(1);
    const runs =
      (await tx.select({ id: S.departments.id }).from(S.departments).where(eq(S.departments.headId, personId))).length +
      (await tx.select({ id: S.teams.id }).from(S.teams).where(eq(S.teams.leadId, personId))).length;
    if (task || acted || came || runs)
      throw new AdminError(`${p.name.split(" ")[0]} already has a history here (tasks, check-ins or activity). Deactivate them instead: they lose access and their record stays.`);
    await tx.delete(S.devices).where(eq(S.devices.personId, personId));
    await tx.delete(S.people).where(eq(S.people.id, personId));
    if (p.userId) {
      await tx.delete(S.session).where(eq(S.session.userId, p.userId));
      await tx.delete(S.account).where(eq(S.account.userId, p.userId));
      await tx.delete(S.user).where(eq(S.user.id, p.userId));
    }
    await tx.insert(S.activity).values({ ...log(orgId, actorId, `Deleted ${p.name}, who was added by mistake`), kind: "security" });
  });
}

export async function updatePerson(orgId: string, actorId: string, personId: string, raw: unknown) {
  const patch = personPatch.parse(raw);
  await notPaused(orgId);
  return db.transaction(async (tx) => {
    await lockOrg(tx, orgId);
    const [p] = await tx
      .select()
      .from(S.people)
      .where(and(eq(S.people.id, personId), eq(S.people.orgId, orgId)));
    if (!p) throw new AdminError("That person isn't in this company.");
    if (p.role === "owner" && (patch.role || patch.active === false)) throw new AdminError("The owner's role can't be changed here.");
    if (personId === actorId && patch.active === false) throw new AdminError("You can't deactivate yourself.");
    if (patch.active === false && p.active) {
      // escalations go up through heads and leads, so those roles need a successor first
      const heads = await tx
        .select({ name: S.departments.name })
        .from(S.departments)
        .where(and(eq(S.departments.orgId, orgId), eq(S.departments.headId, personId)));
      const leads = await tx
        .select({ name: S.teams.name })
        .from(S.teams)
        .where(and(eq(S.teams.orgId, orgId), eq(S.teams.leadId, personId)));
      const runs = [...heads.map((d) => `the ${d.name} department`), ...leads.map((t) => `the ${t.name} team`)];
      if (runs.length) throw new AdminError(`${p.name.split(" ")[0]} runs ${runs.join(" and ")}. Choose someone else in Organisation first, so escalations still reach a person.`);
    }
    const set: Partial<typeof S.people.$inferInsert> = {};
    if (patch.name) {
      set.name = patch.name;
      set.initials = initials(patch.name);
    }
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.phone !== undefined) set.phone = patch.phone;
    if (patch.role) set.role = patch.role;
    if (patch.workType) set.workType = patch.workType;
    if (patch.capacityHours) set.capacityHours = patch.capacityHours;
    if (patch.active !== undefined) set.active = patch.active;
    if (Object.keys(set).length) await tx.update(S.people).set(set).where(eq(S.people.id, personId));
    if (patch.name && p.userId) await tx.update(S.user).set({ name: patch.name }).where(eq(S.user.id, p.userId));

    if (patch.active === false && p.active) {
      if (p.userId) await tx.delete(S.session).where(eq(S.session.userId, p.userId));
      await tx.update(S.devices).set({ endpoint: null, p256dh: null, auth: null, healthy: false }).where(eq(S.devices.personId, personId));
      // nothing they were holding goes quiet: open work, reviews and questions pass to whoever deactivated them
      const open = and(eq(S.tasks.orgId, orgId), notInArray(S.tasks.status, ["approved", "cancelled"]));
      const handed = await tx
        .update(S.tasks)
        .set({ assigneeId: actorId })
        .where(and(open, eq(S.tasks.assigneeId, personId)))
        .returning({ id: S.tasks.id });
      const reviews = await tx
        .update(S.tasks)
        .set({ reviewerId: actorId })
        .where(and(open, eq(S.tasks.reviewerId, personId)))
        .returning({ id: S.tasks.id });
      // no state change is silent: each task's own history records the hand-over (spec §4)
      const [by] = await tx.select({ name: S.people.name }).from(S.people).where(eq(S.people.id, actorId));
      const who = p.name.split(" ")[0];
      const to = by?.name.split(" ")[0] ?? "the owner";
      const at = new Date();
      for (const t of handed)
        await tx.insert(S.activity).values({ id: newId("act"), orgId, at, actorId, kind: "reassigned", taskId: t.id, text: `Handed over from ${who} to ${to}: ${who} was deactivated` });
      for (const t of reviews)
        await tx.insert(S.activity).values({ id: newId("act"), orgId, at, actorId, kind: "reassigned", taskId: t.id, text: `Review moved from ${who} to ${to}: ${who} was deactivated` });
      await tx
        .update(S.questions)
        .set({ toId: actorId })
        .where(and(eq(S.questions.orgId, orgId), eq(S.questions.toId, personId), isNull(S.questions.answer)));
      const moved = handed.length ? ` Their ${handed.length === 1 ? "open task was" : `${handed.length} open tasks were`} handed to you.` : "";
      await tx.insert(S.activity).values(log(orgId, actorId, `Deactivated ${p.name}. They can no longer sign in.${moved}`));
    } else if (patch.active === true && !p.active) {
      await tx.insert(S.activity).values(log(orgId, actorId, `Reactivated ${p.name}`));
    } else if (Object.keys(set).length) {
      // the record shows what changed, from what to what (spec §12)
      const was = p as unknown as Record<string, unknown>;
      const changes = Object.entries(set)
        .filter(([k, v]) => k !== "initials" && was[k] !== v)
        .map(([k, v]) => `${k}: ${JSON.stringify(was[k])} → ${JSON.stringify(v)}`);
      await tx.insert(S.activity).values({ ...log(orgId, actorId, `Updated ${p.name}'s details${changes.length ? `. ${changes.join("; ")}` : ""}`), kind: "security" });
    }
  });
}

export async function resetPassword(orgId: string, actorId: string, personId: string) {
  const [p] = await db
    .select()
    .from(S.people)
    .where(and(eq(S.people.id, personId), eq(S.people.orgId, orgId)));
  if (!p?.userId) throw new AdminError("That person isn't in this company.");
  if (personId === actorId) throw new AdminError("Change your own password in Settings → Account.");
  await notPaused(orgId);
  const password = tempPassword();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(S.account)
      .set({ password: hash })
      .where(and(eq(S.account.userId, p.userId!), eq(S.account.providerId, "credential")))
      .returning({ id: S.account.id });
    if (!updated.length) await tx.insert(S.account).values({ id: newId("a"), accountId: p.userId!, providerId: "credential", userId: p.userId!, password: hash });
    await tx.delete(S.session).where(eq(S.session.userId, p.userId!));
    await tx.update(S.people).set({ mustChangePassword: true }).where(eq(S.people.id, personId));
    await tx.insert(S.activity).values(log(orgId, actorId, `Reset ${p.name}'s password`));
  });
  return { password };
}

export class AdminError extends Error {}

/** how many people can still sign in as owner (never let it drop to zero) */
export async function otherOwners(orgId: string, personId: string) {
  const rows = await db
    .select({ id: S.people.id })
    .from(S.people)
    .where(and(eq(S.people.orgId, orgId), eq(S.people.role, "owner"), ne(S.people.id, personId), eq(S.people.active, true)));
  return rows.length;
}
