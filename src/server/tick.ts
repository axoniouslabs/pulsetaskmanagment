import "server-only";
import { subDays } from "date-fns";
import { db, schema } from "./db";
import { loadActivitySince, loadEngineState, loadWorld, lockOrg, persist, saveEngineState } from "./repo";
import { runTick } from "@/domain/engine";
import { computeDailyStats } from "@/domain/stats";
import { deliverPush } from "./push";
import { sendDigestEmails } from "./email";
import { newId } from "./ids";
import { accessOf } from "./platform";

const ROLLUP_EVERY_MIN = 15;

/** One engine pass for one organisation: lock, load, decide, save, then push. */
export async function tickOrg(orgId: string, now = new Date()) {
  const out = await db.transaction(async (tx) => {
    await lockOrg(tx, orgId);
    const state = await loadEngineState(tx, orgId);
    const before = await loadWorld(tx, orgId, { skipNotifications: true });
    const r = runTick(before, state, now, newId);

    const dueRollup = !r.state.rollupAt || now.getTime() - new Date(r.state.rollupAt).getTime() >= ROLLUP_EVERY_MIN * 60000 || r.rollupDates.length > 1;
    if (dueRollup) {
      const activity = await loadActivitySince(tx, orgId, subDays(now, 3));
      const withActivity = { ...r.world, activity: [...r.world.activity.filter((a) => !activity.some((x) => x.id === a.id)), ...activity] };
      r.world.stats = r.rollupDates.flatMap((d) => computeDailyStats(withActivity, d));
      r.state.rollupAt = now.toISOString();
    }

    const { newNotificationIds } = await persist(tx, before, r.world);
    await saveEngineState(tx, orgId, r.state);
    return { newNotificationIds, digestIds: r.digestIds };
  });
  await deliverPush(out.newNotificationIds).catch((e) => console.error("push", orgId, e));
  if (out.digestIds.length) await sendDigestEmails(out.digestIds).catch((e) => console.error("digest email", orgId, e));
  return { notifications: out.newNotificationIds.length };
}

/** Run the engine for every organisation. Errors in one never stop the others. */
export async function tickAll(now = new Date()) {
  const orgs = await db.select({ id: schema.organizations.id, status: schema.organizations.status, expiresAt: schema.organizations.expiresAt }).from(schema.organizations);
  const results: Record<string, { notifications: number } | { error: string } | { paused: string }> = {};
  for (const o of orgs) {
    // no reminders for a company whose subscription has ended or is paused
    const access = accessOf(o, now);
    if (access.state === "expired" || access.state === "suspended") {
      results[o.id] = { paused: access.state };
      continue;
    }
    try {
      results[o.id] = await tickOrg(o.id, now);
    } catch (e) {
      console.error("tick failed", o.id, e);
      results[o.id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return results;
}
