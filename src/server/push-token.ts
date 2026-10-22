import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Notification buttons (Acknowledge / Snooze) work straight from the lock screen,
 * without opening Pulse. Each push carries a signed token naming exactly one
 * notification and one person, so the button can act for that person only.
 */
const secret = () => process.env.PUSH_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET || "pulse-dev-secret";

export function signPushToken(notificationId: string, personId: string) {
  const body = Buffer.from(JSON.stringify({ n: notificationId, p: personId })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readPushToken(token: string): { notificationId: string; personId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { n, p } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof n === "string" && typeof p === "string" ? { notificationId: n, personId: p } : null;
  } catch {
    return null;
  }
}
