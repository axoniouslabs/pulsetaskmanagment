import { eq } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { json } from "@/server/session";
import { readPushToken } from "@/server/push-token";
import { runCommand } from "@/server/run-command";
import { newId } from "@/server/ids";

/**
 * Called by the service worker when a notification arrives ("receipt"),
 * is tapped ("open") or a button is pressed ("ack" / "snooze"). Works without
 * an open Pulse window; the signed token says who and which notification.
 */
export async function POST(req: Request) {
  const { token, action } = ((await req.json().catch(() => ({}))) ?? {}) as { token?: string; action?: string };
  const t = token ? readPushToken(token) : null;
  if (!t) return json({ ok: false, error: "This notification link isn't valid." }, 401);
  const [n] = await db.select().from(S.notifications).where(eq(S.notifications.id, t.notificationId));
  if (!n || n.recipientId !== t.personId) return json({ ok: false, error: "That notification no longer exists." }, 404);
  const [person] = await db.select({ orgId: S.people.orgId, active: S.people.active, name: S.people.name }).from(S.people).where(eq(S.people.id, t.personId));
  if (!person?.active) return json({ ok: false, error: "This account is not active." }, 403);

  if (action === "receipt") {
    if (!n.deliveredAt) {
      await db.update(S.notifications).set({ deliveredAt: new Date() }).where(eq(S.notifications.id, n.id));
      // the history shows a reminder reached the phone, not only that it was sent (spec §8)
      if (n.kind === "reminder" && n.taskId)
        await db.insert(S.activity).values({ id: newId("act"), orgId: person.orgId, at: new Date(), actorId: "system", kind: "reminder_delivered", taskId: n.taskId, text: `"${n.title}" reached ${person.name.split(" ")[0]}'s phone or PC` });
    }
    return json({ ok: true });
  }

  const firstSeen = !n.seenAt;
  await db.update(S.notifications).set({ seenAt: n.seenAt ?? new Date(), read: true, deliveredAt: n.deliveredAt ?? new Date() }).where(eq(S.notifications.id, n.id));
  if (firstSeen && n.kind === "reminder" && n.taskId && action === "open") {
    await db.insert(S.activity).values({ id: newId("act"), orgId: person.orgId, at: new Date(), actorId: t.personId, kind: "reminder_seen", taskId: n.taskId, text: `Opened "${n.title}"` });
  }

  // buttons that finish the job from the notification itself
  const snooze = /^snooze(15|30|60)?$/.exec(action ?? "");
  if ((action === "ack" || action === "start" || snooze) && n.taskId) {
    const minutes = snooze ? Number(snooze[1] ?? 30) : 30;
    const r = await runCommand(
      { orgId: person.orgId, personId: t.personId },
      action === "ack" ? { type: "acknowledge", taskId: n.taskId } : action === "start" ? { type: "start", taskId: n.taskId } : { type: "snooze", taskId: n.taskId, minutes },
    );
    if (!r.ok) return json({ ok: false, error: r.error }, r.status);
    return json({ ok: true, message: action === "ack" ? "Acknowledged" : action === "start" ? "Started. Your timer is running." : `Snoozed for ${minutes} minutes` });
  }
  return json({ ok: true });
}
