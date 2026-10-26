import "server-only";
import { applyCommand, CommandError, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { db } from "./db";
import { loadWorld, lockOrg, persist } from "./repo";
import { deliverPush } from "./push";
import { newId } from "./ids";
import { blockedMessage, canWrite, loadSubscription } from "./platform";

/** small personal things that still work while a company is read-only */
const READ_ONLY_OK = new Set<Command["type"]>(["markRead", "markAllRead", "readAnnouncement", "setPref", "setDayOrder"]);

export type RunResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * One command, one transaction: lock the organisation, load, check permission,
 * apply the shared rules, write the changes, activity and notifications together.
 * Push goes out after the data is safely stored.
 */
export async function runCommand(actor: { orgId: string; personId: string }, cmd: Command): Promise<RunResult> {
  if (!READ_ONLY_OK.has(cmd.type)) {
    const sub = await loadSubscription(actor.orgId);
    if (sub && !canWrite(sub)) return { ok: false, status: 402, error: await blockedMessage(sub) };
  }
  try {
    const { newNotificationIds } = await db.transaction(async (tx) => {
      await lockOrg(tx, actor.orgId);
      const before = await loadWorld(tx, actor.orgId, { notificationsFor: actor.personId });
      const decision = authorize(before, actor.personId, cmd);
      if (!decision.ok) throw new CommandError(decision.error);
      const after = applyCommand(before, cmd, { actorId: actor.personId, now: new Date(), uid: newId });
      return persist(tx, before, after);
    });
    deliverPush(newNotificationIds).catch((e) => console.error("push", e));
    return { ok: true };
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, status: 422, error: e.message };
    console.error("command failed", cmd.type, e);
    return { ok: false, status: 500, error: "Something went wrong saving that. Try again in a moment." };
  }
}
