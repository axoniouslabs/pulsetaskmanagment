import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db, schema as S } from "./db";
import { lockOrg } from "./repo";
import { newId } from "./ids";
import { AdminError, insertPerson, personInput } from "./people-admin";
import { sendEmail } from "./email";
import { assertNotPaused } from "./platform";

const DAYS = 7;
/** easy to read out: no 0/O, 1/I */
const code = () => Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]).join("");
export const appUrl = () => process.env.BETTER_AUTH_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const inviteInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That email doesn't look right.")
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  role: z.enum(["employee", "manager"]).default("employee"),
  teamId: z.string().max(80).optional().default(""),
  title: z.string().trim().max(80).optional().default(""),
  workType: z.enum(["desk", "field"]).default("desk"),
});

export interface InviteRow {
  id: string;
  code: string;
  email: string | null;
  role: string;
  teamId: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedById: string | null;
  revokedAt: string | null;
}

const row = (r: typeof S.invites.$inferSelect): InviteRow => ({
  id: r.id,
  code: r.code,
  email: r.email,
  role: r.role,
  teamId: r.teamId,
  title: r.title,
  createdAt: r.createdAt.toISOString(),
  expiresAt: r.expiresAt.toISOString(),
  usedAt: r.usedAt?.toISOString() ?? null,
  usedById: r.usedById,
  revokedAt: r.revokedAt?.toISOString() ?? null,
});

export async function listInvites(orgId: string) {
  const rows = await db.select().from(S.invites).where(eq(S.invites.orgId, orgId)).orderBy(desc(S.invites.createdAt)).limit(100);
  return rows.map(row);
}

/** make an invite; emails the link when an address is given and email is set up */
export async function createInvite(orgId: string, actorId: string, raw: unknown) {
  const input = inviteInput.parse(raw);
  await assertNotPaused(orgId);
  if (input.email) {
    const [taken] = await db.select({ id: S.user.id }).from(S.user).where(eq(S.user.email, input.email));
    if (taken) throw new AdminError("Someone already signs in with that email.");
  }
  if (input.teamId) {
    const [team] = await db
      .select({ id: S.teams.id })
      .from(S.teams)
      .where(and(eq(S.teams.id, input.teamId), eq(S.teams.orgId, orgId)));
    if (!team) throw new AdminError("Pick a team in this company.");
  }
  const [org] = await db.select({ name: S.organizations.name }).from(S.organizations).where(eq(S.organizations.id, orgId));
  const [by] = await db.select({ name: S.people.name }).from(S.people).where(eq(S.people.id, actorId));
  const inv = {
    id: newId("inv"),
    orgId,
    code: code(),
    email: input.email ?? null,
    role: input.role,
    teamId: input.teamId,
    title: input.title,
    workType: input.workType,
    createdById: actorId,
    expiresAt: new Date(Date.now() + DAYS * 864e5),
  };
  await db.insert(S.invites).values(inv);
  await db.insert(S.activity).values({
    id: newId("act"),
    orgId,
    at: new Date(),
    actorId,
    kind: "security",
    text: `Created an invite${input.email ? ` for ${input.email}` : ""} (${input.role === "manager" ? "manager" : "employee"})`,
  });
  const link = `${appUrl()}/join/${inv.code}`;
  let emailed = false;
  if (input.email) {
    const who = by?.name ?? "Your manager";
    const company = org?.name ?? "your company";
    emailed = await sendEmail(
      input.email,
      `${who} invited you to ${company} on Pulse`,
      `${who} invited you to join ${company} on Pulse, where your team's tasks and reminders live.\n\nChoose your password here: ${link}\n\nOr open Pulse and enter the code ${inv.code}. The invite works for ${DAYS} days.`,
    ).catch((e) => {
      console.error("invite email", e);
      return false;
    });
  }
  return { ...row({ ...inv, createdAt: new Date(), usedAt: null, usedById: null, revokedAt: null }), link, emailed };
}

export async function revokeInvite(orgId: string, actorId: string, id: string) {
  const r = await db
    .update(S.invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(S.invites.id, id), eq(S.invites.orgId, orgId), isNull(S.invites.usedAt)))
    .returning({ code: S.invites.code });
  if (!r.length) throw new AdminError("That invite was already used or no longer exists.");
  await db.insert(S.activity).values({ id: newId("act"), orgId, at: new Date(), actorId, kind: "security", text: `Cancelled invite ${r[0].code}` });
}

const usable = (r: typeof S.invites.$inferSelect | undefined) => !!r && !r.usedAt && !r.revokedAt && r.expiresAt > new Date();

/** what the join page shows before someone signs up */
export async function lookupInvite(raw: string) {
  const c = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const [r] = await db.select().from(S.invites).where(eq(S.invites.code, c));
  if (!usable(r)) return null;
  const [org] = await db.select({ name: S.organizations.name, settings: S.organizations.settings, status: S.organizations.status }).from(S.organizations).where(eq(S.organizations.id, r!.orgId));
  if (!org || org.status !== "active") return null;
  const [team] = r!.teamId ? await db.select({ name: S.teams.name }).from(S.teams).where(eq(S.teams.id, r!.teamId)) : [];
  return { code: r!.code, company: org.name, logoUrl: org.settings.logoUrl ?? null, email: r!.email, role: r!.role, team: team?.name ?? null, title: r!.title };
}

export const joinInput = z.object({
  code: z.string().trim().min(4).max(20),
  name: z.string().trim().min(2, "Write your full name.").max(80),
  email: z.string().trim().toLowerCase().email("That email doesn't look right.").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  title: z.string().trim().max(80).optional().default(""),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

/** someone uses an invite: their account is made with the password they chose */
export async function acceptInvite(raw: unknown) {
  const input = joinInput.parse(raw);
  const c = input.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const hash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(S.invites).where(eq(S.invites.code, c)).for("update");
    if (!usable(r)) throw new AdminError("This invite has expired or was already used. Ask for a new one.");
    if (r!.email && r!.email !== input.email) throw new AdminError(`This invite is for ${r!.email}. Use that address, or ask for a new invite.`);
    await assertNotPaused(r!.orgId);
    await lockOrg(tx, r!.orgId);
    const person = personInput.parse({
      name: input.name,
      email: input.email,
      phone: input.phone,
      title: input.title || r!.title || "Team member",
      role: r!.role,
      teamId: r!.teamId,
      workType: r!.workType,
    });
    const personId = await insertPerson(tx, r!.orgId, r!.createdById, person, { hash, mustChangePassword: false, via: "Welcomed" });
    await tx.update(S.invites).set({ usedAt: new Date(), usedById: personId }).where(eq(S.invites.id, r!.id));
    return { personId, email: input.email };
  });
}
