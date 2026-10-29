"use server";

import { and, asc, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema as S } from "@/server/db";
import { newId } from "@/server/ids";
import { CompanyError, createCompany } from "@/server/company";
import { getPlatformAdmin } from "@/server/platform";
import { tempPassword } from "@/server/people-admin";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function admin() {
  const a = await getPlatformAdmin();
  if (!a) throw new Error("not an admin");
  return a;
}
const fail = (error: string) => ({ ok: false as const, error });
const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export interface NewCompanyInput {
  company: string;
  ownerName: string;
  ownerEmail: string;
  contactPhone: string;
}

/** register a company and its owner; the owner gets a temporary password to change on first sign-in */
export async function registerCompany(input: NewCompanyInput): Promise<Result<{ orgId: string; password: string }>> {
  await admin();
  const company = clean(input.company, 120);
  const ownerName = clean(input.ownerName, 120);
  const ownerEmail = clean(input.ownerEmail, 200).toLowerCase();
  if (!company) return fail("Enter the company's name.");
  if (!ownerName) return fail("Enter the owner's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return fail("Enter a valid email for the owner.");
  const password = tempPassword();
  try {
    const { orgId } = await createCompany({ company, ownerName, ownerEmail, password, mustChangePassword: true, contactPhone: clean(input.contactPhone, 40) });
    return { ok: true, orgId, password };
  } catch (e) {
    if (e instanceof CompanyError) return fail(e.message);
    console.error("admin register company", e);
    return fail("Couldn't create the company. Try again.");
  }
}

export interface CompanyDetailsInput {
  orgId: string;
  contactPhone: string;
  notes: string;
}

export async function saveCompanyDetails(input: CompanyDetailsInput): Promise<Result> {
  await admin();
  const done = await db
    .update(S.organizations)
    .set({ contactPhone: clean(input.contactPhone, 40), notes: clean(input.notes, 2000) })
    .where(eq(S.organizations.id, input.orgId))
    .returning({ id: S.organizations.id });
  return done.length ? { ok: true } : fail("That company no longer exists.");
}

export async function setCompanyPaused(orgId: string, paused: boolean): Promise<Result> {
  const me = await admin();
  // never lock yourself out of your own company
  const [mine] = await db
    .select({ id: S.people.id })
    .from(S.people)
    .where(and(eq(S.people.orgId, orgId), eq(S.people.userId, me.id)));
  if (mine && paused) return fail("This is your own company. Pausing it would lock you out too.");
  const done = await db
    .update(S.organizations)
    .set({ status: paused ? "suspended" : "active" })
    .where(eq(S.organizations.id, orgId))
    .returning({ id: S.organizations.id });
  return done.length ? { ok: true } : fail("That company no longer exists.");
}

export async function resetOwnerPassword(orgId: string): Promise<Result<{ email: string; password: string }>> {
  await admin();
  const [owner] = await db
    .select()
    .from(S.people)
    .where(and(eq(S.people.orgId, orgId), eq(S.people.role, "owner"), eq(S.people.active, true)))
    .orderBy(asc(S.people.createdAt));
  if (!owner?.userId) return fail("This company has no active owner to reset.");
  const password = tempPassword();
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(S.account)
      .set({ password: hash })
      .where(and(eq(S.account.userId, owner.userId!), eq(S.account.providerId, "credential")))
      .returning({ id: S.account.id });
    if (!updated.length) await tx.insert(S.account).values({ id: newId("a"), accountId: owner.userId!, providerId: "credential", userId: owner.userId!, password: hash });
    await tx.delete(S.session).where(eq(S.session.userId, owner.userId!));
    await tx.update(S.people).set({ mustChangePassword: true }).where(eq(S.people.id, owner.id));
    await tx.insert(S.activity).values({ id: newId("act"), orgId, at: new Date(), actorId: "system", kind: "created", text: `Pulse support reset ${owner.name}'s password` });
  });
  return { ok: true, email: owner.email, password };
}

/** more days of free trial; counted from now if it had already ended */
export async function extendTrial(orgId: string, days: number): Promise<Result> {
  await admin();
  const [o] = await db.select({ trialEndsAt: S.organizations.trialEndsAt }).from(S.organizations).where(eq(S.organizations.id, orgId));
  if (!o) return fail("That company no longer exists.");
  if (!o.trialEndsAt) return fail("This company is already paid.");
  const from = Math.max(Date.now(), o.trialEndsAt.getTime());
  const add = Math.min(30, Math.max(1, Math.round(days)));
  await db
    .update(S.organizations)
    .set({ trialEndsAt: new Date(from + add * 864e5) })
    .where(eq(S.organizations.id, orgId));
  return { ok: true };
}

/** they've paid: the trial ends and Pulse keeps working with no limit */
export async function activateCompany(orgId: string): Promise<Result> {
  await admin();
  const done = await db.update(S.organizations).set({ trialEndsAt: null, status: "active" }).where(eq(S.organizations.id, orgId)).returning({ id: S.organizations.id });
  return done.length ? { ok: true } : fail("That company no longer exists.");
}
