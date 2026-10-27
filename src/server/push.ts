import "server-only";
import webpush from "web-push";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { ReminderRule, TaskStatus } from "@/lib/types";
import { db, schema as S } from "./db";
import { signPushToken } from "./push-token";
import { newId } from "./ids";

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
/** notification kind → the preference row it belongs to */
const PREF_KEY: Record<string, string> = { approved: "review", rejected: "review", unblocked: "blocked", answer: "mention", question: "mention", deadline: "assigned" };

type Action = { action: string; title: string };

/**
 * The buttons a notification carries, so it can be dealt with without opening
 * Pulse (spec §7). Browsers show as many as they can (two on most, three on some
 * Android phones), so the most useful comes first.
 */
export function actionsFor(kind: string, status: TaskStatus | undefined): Action[] {
  if (kind === "reminder" || kind === "assigned") {
    if (status === "assigned")
      return [
        { action: "ack", title: "Acknowledge" },
        { action: "start", title: "Start" },
        { action: "snooze", title: "Snooze 30 min" },
      ];
    if (status === "acknowledged")
      return [
        { action: "start", title: "Start" },
        { action: "block", title: "I'm blocked" },
        { action: "snooze", title: "Snooze 30 min" },
      ];
    if (status === "in_progress")
      return [
        { action: "done", title: "Mark done" },
        { action: "block", title: "I'm blocked" },
      ];
  }
  // level 2 and up: the manager gets a one-tap hand-over or extension (spec §15)
  if (kind === "escalation" && status && ["assigned", "acknowledged", "in_progress"].includes(status))
    return [
      { action: "handover", title: "Hand over" },
      { action: "extend", title: "Extend" },
    ];
  if (kind === "submitted" && status === "submitted") return [{ action: "open", title: "Review" }];
  return [];
}

const send = (d: { endpoint: string | null; p256dh: string | null; auth: string | null }, payload: string, urgent: boolean) =>
  webpush.sendNotification({ endpoint: d.endpoint!, keys: { p256dh: d.p256dh!, auth: d.auth! } }, payload, { TTL: 60 * 60 * 6, urgency: urgent ? "high" : "normal" });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send Web Push for notifications that were just stored.
 * A push service rejecting a subscription (404/410) marks that device unhealthy,
 * so its silence is never counted as an ignored reminder. Other failures are
 * retried once; if no device could be reached the notification is marked as
 * failed and a reminder's history says so (spec §19).
 */
export async function deliverPush(notificationIds: string[]) {
  if (!notificationIds.length || !pushConfigured()) return;
  const items = await db.select().from(S.notifications).where(inArray(S.notifications.id, notificationIds));
  if (!items.length) return;
  const recipientIds = Array.from(new Set(items.map((n) => n.recipientId)));
  const taskIds = Array.from(new Set(items.map((n) => n.taskId).filter((x): x is string => !!x)));
  const [devs, people, tasks] = await Promise.all([
    db.select().from(S.devices).where(and(inArray(S.devices.personId, recipientIds), isNotNull(S.devices.endpoint), eq(S.devices.healthy, true))),
    db.select({ id: S.people.id, prefs: S.people.prefs, name: S.people.name }).from(S.people).where(inArray(S.people.id, recipientIds)),
    taskIds.length ? db.select({ id: S.tasks.id, status: S.tasks.status, reminder: S.tasks.reminder, assigneeId: S.tasks.assigneeId }).from(S.tasks).where(inArray(S.tasks.id, taskIds)) : Promise.resolve([]),
  ]);
  const prefsOf = new Map(people.map((p) => [p.id, p.prefs ?? {}]));
  const taskOf = new Map(tasks.map((t) => [t.id, t as { id: string; status: string; reminder: ReminderRule; assigneeId: string }]));

  await Promise.all(
    items.map(async (n) => {
      const prefs = prefsOf.get(n.recipientId) ?? {};
      if (!LOCKED.has(n.kind) && prefs[`push:${PREF_KEY[n.kind] ?? n.kind}`] === false) return;
      const task = n.taskId ? taskOf.get(n.taskId) : undefined;
      // a task can be set to remind in the app only, without phone and PC pushes
      if (n.kind === "reminder" && task && task.assigneeId === n.recipientId && !(task.reminder?.channels ?? ["push"]).includes("push")) return;
      const targets = devs.filter((x) => x.personId === n.recipientId);
      if (!targets.length) return;
      const urgent = n.kind === "escalation" || n.kind === "reminder";
      const payload = JSON.stringify({
        title: n.title,
        body: n.body,
        taskId: n.taskId,
        // one notification per task on screen: a newer one replaces the older
        tag: n.taskId ? `task-${n.taskId}` : n.id,
        token: signPushToken(n.id, n.recipientId),
        actions: n.taskId ? actionsFor(n.kind, task?.status as TaskStatus | undefined) : [],
        urgent,
      });
      let sent = 0;
      let failed = 0;
      for (const d of targets) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await send(d, payload, urgent);
            sent++;
            break;
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await db.update(S.devices).set({ healthy: false, endpoint: null, p256dh: null, auth: null }).where(eq(S.devices.id, d.id));
              failed++;
              break;
            }
            if (attempt === 0) await wait(1500);
            else {
              console.error("push failed", status, (err as Error).message);
              failed++;
            }
          }
        }
      }
      if (sent) await db.update(S.notifications).set({ pushedAt: new Date() }).where(eq(S.notifications.id, n.id));
      else if (failed) {
        await db.update(S.notifications).set({ failedAt: new Date() }).where(eq(S.notifications.id, n.id));
        if (n.kind === "reminder" && n.taskId) {
          const who = people.find((p) => p.id === n.recipientId)?.name.split(" ")[0] ?? "the assignee";
          await db.insert(S.activity).values({ id: newId("act"), orgId: n.orgId, at: new Date(), actorId: "system", kind: "reminder_failed", taskId: n.taskId, text: `Couldn't reach ${who}'s phone or PC (tried twice). Shown in the app only.` });
        }
      }
    }),
  );
}

/**
 * Something was dealt with on one device: replace the notification on every
 * other device with a quiet note, so it stops asking (spec §18).
 */
export async function silenceOtherDevices(personId: string, taskId: string, what: string) {
  if (!pushConfigured()) return;
  const targets = await db.select().from(S.devices).where(and(eq(S.devices.personId, personId), isNotNull(S.devices.endpoint), eq(S.devices.healthy, true)));
  const payload = JSON.stringify({ title: what, body: "Handled on another device.", taskId, tag: `task-${taskId}`, silent: true, actions: [] });
  await Promise.all(targets.map((d) => send(d, payload, false).catch(() => undefined)));
}
