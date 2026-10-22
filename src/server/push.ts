import "server-only";
import webpush from "web-push";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema as S } from "./db";

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  configured = !!(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@pulse.app", pub!, priv!);
  return configured;
}

/** categories a person may not silence (spec §16): accountability always reaches them */
const LOCKED = new Set(["escalation", "announcement"]);
/** which notifications carry Acknowledge / Snooze buttons */
const ACTIONABLE = new Set(["reminder", "assigned"]);

/**
 * Send Web Push for notifications that were just stored.
 * A push service rejecting a subscription (404/410) marks that device unhealthy,
 * so its silence is never counted as an ignored reminder.
 */
export async function deliverPush(notificationIds: string[]) {
  if (!notificationIds.length || !configure()) return;
  const items = await db.select().from(S.notifications).where(inArray(S.notifications.id, notificationIds));
  if (!items.length) return;
  const recipientIds = Array.from(new Set(items.map((n) => n.recipientId)));
  const [devs, people] = await Promise.all([
    db.select().from(S.devices).where(and(inArray(S.devices.personId, recipientIds), isNotNull(S.devices.endpoint), eq(S.devices.healthy, true))),
    db.select({ id: S.people.id, prefs: S.people.prefs }).from(S.people).where(inArray(S.people.id, recipientIds)),
  ]);
  const prefsOf = new Map(people.map((p) => [p.id, p.prefs ?? {}]));

  for (const n of items) {
    const prefs = prefsOf.get(n.recipientId) ?? {};
    if (!LOCKED.has(n.kind) && prefs[`push:${n.kind}`] === false) continue;
    const payload = JSON.stringify({
      title: n.title,
      body: n.body,
      taskId: n.taskId,
      tag: n.taskId ?? n.id,
      notificationId: n.id,
      actions: ACTIONABLE.has(n.kind) && n.taskId,
      urgent: n.kind === "escalation" || n.kind === "reminder",
    });
    let delivered = false;
    for (const d of devs.filter((x) => x.personId === n.recipientId)) {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint!, keys: { p256dh: d.p256dh!, auth: d.auth! } }, payload, {
          TTL: 60 * 60 * 6,
          urgency: n.kind === "reminder" || n.kind === "escalation" ? "high" : "normal",
        });
        delivered = true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.update(S.devices).set({ healthy: false, endpoint: null }).where(eq(S.devices.id, d.id));
        } else console.error("push failed", status, (err as Error).message);
      }
    }
    await db.update(S.notifications).set({ pushedAt: new Date(), ...(delivered ? { deliveredAt: new Date() } : {}) }).where(eq(S.notifications.id, n.id));
  }
}
