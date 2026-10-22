import "server-only";
import webpush from "web-push";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema as S } from "./db";
import { signPushToken } from "./push-token";

let configured: boolean | null = null;
export function pushConfigured(): boolean {
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
/** notification kind → the preference row it belongs to */
const PREF_KEY: Record<string, string> = { approved: "review", rejected: "review", unblocked: "blocked", answer: "mention", question: "mention", deadline: "assigned" };

/**
 * Send Web Push for notifications that were just stored.
 * A push service rejecting a subscription (404/410) marks that device unhealthy,
 * so its silence is never counted as an ignored reminder.
 */
export async function deliverPush(notificationIds: string[]) {
  if (!notificationIds.length || !pushConfigured()) return;
  const items = await db.select().from(S.notifications).where(inArray(S.notifications.id, notificationIds));
  if (!items.length) return;
  const recipientIds = Array.from(new Set(items.map((n) => n.recipientId)));
  const [devs, people] = await Promise.all([
    db.select().from(S.devices).where(and(inArray(S.devices.personId, recipientIds), isNotNull(S.devices.endpoint), eq(S.devices.healthy, true))),
    db.select({ id: S.people.id, prefs: S.people.prefs }).from(S.people).where(inArray(S.people.id, recipientIds)),
  ]);
  const prefsOf = new Map(people.map((p) => [p.id, p.prefs ?? {}]));

  await Promise.all(
    items.map(async (n) => {
      const prefs = prefsOf.get(n.recipientId) ?? {};
      if (!LOCKED.has(n.kind) && prefs[`push:${PREF_KEY[n.kind] ?? n.kind}`] === false) return;
      const targets = devs.filter((x) => x.personId === n.recipientId);
      if (!targets.length) return;
      const payload = JSON.stringify({
        title: n.title,
        body: n.body,
        taskId: n.taskId,
        tag: n.taskId ? `${n.kind}-${n.taskId}` : n.id,
        token: signPushToken(n.id, n.recipientId),
        actions:
          ACTIONABLE.has(n.kind) && n.taskId
            ? [
                { action: "ack", title: "Acknowledge" },
                { action: "snooze", title: "Snooze 30 min" },
              ]
            : [],
        urgent: n.kind === "escalation" || n.kind === "reminder",
      });
      let sent = false;
      for (const d of targets) {
        try {
          await webpush.sendNotification({ endpoint: d.endpoint!, keys: { p256dh: d.p256dh!, auth: d.auth! } }, payload, {
            TTL: 60 * 60 * 6,
            urgency: n.kind === "reminder" || n.kind === "escalation" ? "high" : "normal",
          });
          sent = true;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.update(S.devices).set({ healthy: false, endpoint: null, p256dh: null, auth: null }).where(eq(S.devices.id, d.id));
          } else console.error("push failed", status, (err as Error).message);
        }
      }
      if (sent) await db.update(S.notifications).set({ pushedAt: new Date() }).where(eq(S.notifications.id, n.id));
    }),
  );
}
