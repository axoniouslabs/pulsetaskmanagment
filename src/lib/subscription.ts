/** A company's access on a given day, from its status and paid-up date (pure; shared by server and tests). */

export type AccessState = "active" | "expiring" | "expired" | "suspended";
export const EXPIRING_DAYS = 7;

export interface Access {
  state: AccessState;
  expiresAt: string | null;
  daysLeft: number | null;
}

export function accessOf(org: { status: string; expiresAt: Date | string | null }, now = new Date()): Access {
  const expiresAt = org.expiresAt ? new Date(org.expiresAt) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000) : null;
  const state: AccessState =
    org.status === "suspended" ? "suspended" : expiresAt && expiresAt <= now ? "expired" : daysLeft !== null && daysLeft <= EXPIRING_DAYS ? "expiring" : "active";
  return { state, expiresAt: expiresAt?.toISOString() ?? null, daysLeft };
}

/** read-only once the paid-up date has passed; nothing at all while paused */
export const canWrite = (a: Pick<Access, "state">) => a.state === "active" || a.state === "expiring";

/** the next paid-up date: months added from today, or from the current date if it's still ahead */
export function extendFrom(current: Date | null, months: number, now = new Date()) {
  const from = current && current > now ? current : now;
  const to = new Date(from);
  const day = to.getDate();
  to.setMonth(to.getMonth() + months);
  if (to.getDate() < day) to.setDate(0); // 31 Jan + 1 month → 28/29 Feb, not 3 Mar
  return { from, to };
}
