"use server";

import { addDays } from "date-fns";
import { extendFrom } from "@/lib/subscription";
import { and, asc, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, schema as S } from "@/server/db";
import { newId } from "@/server/ids";
import { CompanyError, createCompany } from "@/server/company";
import { getPlatformAdmin } from "@/server/platform";
import { tempPassword } from "@/server/people-admin";
import { PAYMENT_METHODS } from "@/lib/admin-shared";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };


async function admin() {
  const a = await getPlatformAdmin();
  if (!a) throw new Error("not an admin");
  return a;
}
const fail = (error: string) => ({ ok: false as const, error });
const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const whole = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);

async function planExists(planId: string) {
  const [p] = await db.select({ id: S.plans.id }).from(S.plans).where(eq(S.plans.id, planId));
  return !!p;
}

/** extend a company's paid-up date by `months`, from today or from its current date if that's later */
async function addPaidMonths(orgId: string, months: number, payment: { amount: number; method: string; reference: string; paidAt: Date; note: string }, by: string) {
  return db.transaction(async (tx) => {
    const [org] = await tx.select({ expiresAt: S.organizations.expiresAt }).from(S.organizations).where(eq(S.organizations.id, orgId)).for("update");
    if (!org) throw new CompanyError("That company no longer exists.");
    const { from, to } = extendFrom(org.expiresAt, months);
    await tx.update(S.organizations).set({ expiresAt: to }).where(eq(S.organizations.id, orgId));
    await tx.insert(S.payments).values({ id: newId("pay"), orgId, amount: payment.amount, method: payment.method, reference: payment.reference, months, paidAt: payment.paidAt, periodFrom: from, periodTo: to, recordedBy: by, note: payment.note });
    return to;
  });
}

export interface NewClientInput {
  company: string;
  ownerName: string;
  ownerEmail: string;
  contactPhone: string;
  planId: string;
  start: "paid" | "trial";
  months: number;
  trialDays: number;
  amount: number;
  method: string;
  reference: string;
}

export async function createClient(input: NewClientInput): Promise<Result<{ orgId: string; password: string; expiresAt: string }>> {
  const me = await admin();
  const company = clean(input.company, 120);
  const ownerName = clean(input.ownerName, 120);
  const ownerEmail = clean(input.ownerEmail, 200).toLowerCase();
  if (!company) return fail("Enter the company's name.");
  if (!ownerName) return fail("Enter the owner's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return fail("Enter a valid email for the owner.");
  if (!input.planId || !(await planExists(input.planId))) return fail("Pick a plan.");
  const months = whole(input.months);
  const trialDays = whole(input.trialDays);
  if (input.start === "paid" && !(months >= 1 && months <= 36)) return fail("Paid months should be between 1 and 36.");
  if (input.start === "trial" && !(trialDays >= 1 && trialDays <= 90)) return fail("A trial can be 1 to 90 days.");
  const amount = input.start === "paid" ? whole(input.amount) : 0;
  if (input.start === "paid" && !(amount >= 0)) return fail("Enter the amount received (0 if not paid yet).");
  const method = PAYMENT_METHODS.includes(input.method as (typeof PAYMENT_METHODS)[number]) ? input.method : "Other";

  const now = new Date();
  const password = tempPassword();
  try {
    const { orgId } = await createCompany({
      company,
      ownerName,
      ownerEmail,
      password,
      mustChangePassword: true,
      planId: input.planId,
      // a paid start gets its months from the payment below; a trial ends after its days
      expiresAt: input.start === "trial" ? addDays(now, trialDays) : now,
      contactPhone: clean(input.contactPhone, 40),
    });
    let expiresAt = addDays(now, trialDays);
    if (input.start === "paid") {
      expiresAt = await addPaidMonths(orgId, months, { amount, method, reference: clean(input.reference), paidAt: now, note: "First payment" }, me.id);
    }
    return { ok: true, orgId, password, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    if (e instanceof CompanyError) return fail(e.message);
    console.error("admin create company", e);
    return fail("Couldn't create the company. Try again.");
  }
}

export interface PaymentInput {
  orgId: string;
  amount: number;
  months: number;
  method: string;
  reference: string;
  paidOn: string; // yyyy-mm-dd
  note: string;
}

export async function recordPayment(input: PaymentInput): Promise<Result<{ expiresAt: string }>> {
  const me = await admin();
  const amount = whole(input.amount);
  const months = whole(input.months);
  if (!(amount >= 0)) return fail("Enter the amount received.");
  if (!(months >= 1 && months <= 36)) return fail("Months should be between 1 and 36.");
  const paidAt = input.paidOn ? new Date(`${input.paidOn}T12:00:00`) : new Date();
  if (Number.isNaN(paidAt.getTime())) return fail("Pick the date it was paid.");
  const method = PAYMENT_METHODS.includes(input.method as (typeof PAYMENT_METHODS)[number]) ? input.method : "Other";
  try {
    const to = await addPaidMonths(input.orgId, months, { amount, method, reference: clean(input.reference), paidAt, note: clean(input.note, 500) }, me.id);
    return { ok: true, expiresAt: to.toISOString() };
  } catch (e) {
    if (e instanceof CompanyError) return fail(e.message);
    console.error("record payment", e);
    return fail("Couldn't save the payment. Try again.");
  }
}

export interface SubscriptionInput {
  orgId: string;
  planId: string | null;
  expiresOn: string | null; // yyyy-mm-dd, null: never
  contactPhone: string;
  notes: string;
}

export async function updateSubscription(input: SubscriptionInput): Promise<Result> {
  await admin();
  if (input.planId && !(await planExists(input.planId))) return fail("Pick a plan.");
  let expiresAt: Date | null = null;
  if (input.expiresOn) {
    expiresAt = new Date(`${input.expiresOn}T23:59:00`);
    if (Number.isNaN(expiresAt.getTime())) return fail("Pick a valid end date.");
  }
  const done = await db
    .update(S.organizations)
    .set({ planId: input.planId || null, expiresAt, contactPhone: clean(input.contactPhone, 40), notes: clean(input.notes, 2000) })
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

export interface PlanInput {
  id?: string;
  name: string;
  maxUsers: number | null;
  priceMonthly: number | null;
  archived?: boolean;
}

export async function savePlan(input: PlanInput): Promise<Result<{ id: string }>> {
  await admin();
  const name = clean(input.name, 60);
  if (!name) return fail("Give the plan a name.");
  const maxUsers = input.maxUsers === null ? null : whole(input.maxUsers);
  if (maxUsers !== null && !(maxUsers >= 1 && maxUsers <= 100000)) return fail("The user limit should be at least 1, or leave it empty for unlimited.");
  const price = input.priceMonthly === null ? null : whole(input.priceMonthly);
  if (price !== null && !(price >= 0)) return fail("The price can't be negative.");
  if (input.id) {
    const done = await db
      .update(S.plans)
      .set({ name, maxUsers, priceMonthly: price, archived: !!input.archived })
      .where(eq(S.plans.id, input.id))
      .returning({ id: S.plans.id });
    return done.length ? { ok: true, id: input.id } : fail("That plan no longer exists.");
  }
  const id = newId("plan");
  const all = await db.select({ sortOrder: S.plans.sortOrder }).from(S.plans);
  await db.insert(S.plans).values({ id, name, maxUsers, priceMonthly: price, sortOrder: Math.max(0, ...all.map((p) => p.sortOrder)) + 1 });
  return { ok: true, id };
}

export interface SupportInput {
  supportName: string;
  supportPhone: string;
  supportEmail: string;
}

export async function saveSupport(input: SupportInput): Promise<Result> {
  await admin();
  const data = { supportName: clean(input.supportName, 80), supportPhone: clean(input.supportPhone, 40), supportEmail: clean(input.supportEmail, 120) };
  if (data.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.supportEmail)) return fail("Enter a valid email, or leave it empty.");
  await db
    .insert(S.platformSettings)
    .values({ id: "platform", data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: S.platformSettings.id, set: { data, updatedAt: new Date() } });
  return { ok: true };
}
