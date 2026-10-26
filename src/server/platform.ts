import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema as S } from "./db";
import { accessOf, PAUSED_MESSAGE } from "@/lib/access";

/**
 * Pulse hosts many companies. The Pulse administrator adds them at /admin and can
 * pause one; a paused company can't use Pulse until it's resumed.
 */

export class PausedError extends Error {}

/** the company's name and whether it's paused */
export async function loadAccess(orgId: string) {
  const [org] = await db.select({ status: S.organizations.status, name: S.organizations.name }).from(S.organizations).where(eq(S.organizations.id, orgId));
  return org ? { company: org.name, state: accessOf(org) } : null;
}

/** throws when the company is paused */
export async function assertNotPaused(orgId: string) {
  const a = await loadAccess(orgId);
  if (a?.state === "paused") throw new PausedError(PAUSED_MESSAGE);
}

/** the signed-in Pulse administrator, or null */
export const getPlatformAdmin = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [u] = await db.select({ id: S.user.id, name: S.user.name, email: S.user.email, platformAdmin: S.user.platformAdmin }).from(S.user).where(eq(S.user.id, session.user.id));
  return u?.platformAdmin ? { id: u.id, name: u.name, email: u.email } : null;
});
