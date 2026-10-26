import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { format } from "date-fns";
import { auth } from "./auth";
import { db, schema as S } from "./db";

/**
 * Pulse as a subscription service: each company has a plan (a user limit) and a
 * paid-up date. Past that date the company is read-only; a suspended company
 * can't use Pulse at all. The Pulse administrator manages all of it at /admin.
 */

export { accessOf, canWrite, EXPIRING_DAYS, type Access, type AccessState } from "@/lib/subscription";
import { accessOf, canWrite, type Access } from "@/lib/subscription";

export class SubscriptionError extends Error {}

export async function supportLine() {
  const s = await getPlatformSettings();
  const ways = [s.supportPhone, s.supportEmail].filter(Boolean).join(" or ");
  return ways ? `Contact ${s.supportName || "Pulse"} on ${ways} to renew.` : "Contact the person who set up Pulse for you to renew.";
}

/** the company's plan, limit and access today */
export async function loadSubscription(orgId: string, now = new Date()) {
  const [org] = await db
    .select({ status: S.organizations.status, expiresAt: S.organizations.expiresAt, planId: S.organizations.planId, name: S.organizations.name })
    .from(S.organizations)
    .where(eq(S.organizations.id, orgId));
  if (!org) return null;
  const [plan] = org.planId ? await db.select().from(S.plans).where(eq(S.plans.id, org.planId)) : [];
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(S.people)
    .where(and(eq(S.people.orgId, orgId), eq(S.people.active, true)));
  return {
    ...accessOf(org, now),
    company: org.name,
    planName: plan?.name ?? null,
    maxUsers: plan ? plan.maxUsers : null,
    usedUsers: used?.n ?? 0,
  };
}

/** the sentence a company sees when Pulse is read-only or paused for them */
export async function blockedMessage(access: Access) {
  const when = access.expiresAt ? format(new Date(access.expiresAt), "d MMM yyyy") : "";
  const contact = await supportLine();
  if (access.state === "suspended") return `Pulse is paused for your company. ${contact}`;
  return `Your Pulse subscription ended on ${when}. You can still see everything, but changes are paused until it's renewed. ${contact}`;
}

/** throws when the company can't make changes right now */
export async function assertWritable(orgId: string) {
  const sub = await loadSubscription(orgId);
  if (sub && !canWrite(sub)) throw new SubscriptionError(await blockedMessage(sub));
}

/** throws when adding `adding` more active people would go past the plan's limit */
export async function assertSeats(orgId: string, adding = 1) {
  const sub = await loadSubscription(orgId);
  if (!sub || sub.maxUsers === null) return;
  if (sub.usedUsers + adding > sub.maxUsers) {
    throw new SubscriptionError(
      `Your ${sub.planName} plan includes up to ${sub.maxUsers} people, and all ${sub.usedUsers} places are in use. Deactivate someone, or ask to move to a bigger plan. ${await supportLine()}`,
    );
  }
}

export async function getPlatformSettings() {
  const [row] = await db.select().from(S.platformSettings).where(eq(S.platformSettings.id, "platform"));
  return row?.data ?? {};
}

/** the signed-in Pulse administrator, or null */
export const getPlatformAdmin = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [u] = await db.select({ id: S.user.id, name: S.user.name, email: S.user.email, platformAdmin: S.user.platformAdmin }).from(S.user).where(eq(S.user.id, session.user.id));
  return u?.platformAdmin ? { id: u.id, name: u.name, email: u.email } : null;
});
