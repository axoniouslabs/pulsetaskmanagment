import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema as S } from "./db";
import { accessOf, PAUSED_MESSAGE, TRIAL_ENDED_MESSAGE } from "@/lib/access";

/**
 * Pulse hosts many companies. The Pulse administrator adds them at /admin and can
 * pause one; a paused company can't use Pulse until it's resumed.
 */

export class PausedError extends Error {}

/** the company's name, whether it can use Pulse, and when its trial ends */
export async function loadAccess(orgId: string) {
  const [org] = await db.select({ status: S.organizations.status, name: S.organizations.name, trialEndsAt: S.organizations.trialEndsAt }).from(S.organizations).where(eq(S.organizations.id, orgId));
  return org ? { company: org.name, state: accessOf(org), trialEndsAt: org.trialEndsAt?.toISOString() ?? null } : null;
}

/** throws when the company can't change anything: paused, or its trial is over */
export async function assertNotPaused(orgId: string) {
  const a = await loadAccess(orgId);
  if (a?.state === "paused") throw new PausedError(PAUSED_MESSAGE);
  if (a?.state === "trial_ended") throw new PausedError(TRIAL_ENDED_MESSAGE);
}

/** who a trial company should contact to continue: PULSE_SALES_CONTACT, else the Pulse administrator's email */
export async function salesContact() {
  if (process.env.PULSE_SALES_CONTACT) return process.env.PULSE_SALES_CONTACT;
  const [a] = await db.select({ email: S.user.email }).from(S.user).where(eq(S.user.platformAdmin, true)).limit(1);
  return a?.email ?? "the Pulse team";
}

/** the signed-in Pulse administrator, or null */
export const getPlatformAdmin = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [u] = await db.select({ id: S.user.id, name: S.user.name, email: S.user.email, platformAdmin: S.user.platformAdmin }).from(S.user).where(eq(S.user.id, session.user.id));
  return u?.platformAdmin ? { id: u.id, name: u.name, email: u.email } : null;
});
