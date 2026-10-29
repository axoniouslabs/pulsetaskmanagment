import "server-only";
import { applyCommand, CommandError, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { db } from "./db";
import { loadWorld, lockOrg, persist } from "./repo";
import { deliverPush, silenceOtherDevices } from "./push";
import { newId } from "./ids";
import { loadAccess } from "./platform";
import { ALLOWED_AFTER_TRIAL, PAUSED_MESSAGE, TRIAL_ENDED_MESSAGE } from "@/lib/access";

export type RunResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * One command, one transaction: lock the organisation, load, check permission,
 * apply the shared rules, write the changes, activity and notifications together.
 * Push goes out after the data is safely stored.
 */
export async function runCommand(actor: { orgId: string; personId: string }, cmd: Command): Promise<RunResult> {
  const access = await loadAccess(actor.orgId);
  if (access?.state === "paused") return { ok: false, status: 423, error: PAUSED_MESSAGE };
  // after the trial everything stays readable; only personal settings can change
  if (access?.state === "trial_ended" && !ALLOWED_AFTER_TRIAL.has(cmd.type)) return { ok: false, status: 402, error: TRIAL_ENDED_MESSAGE };
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
    // handled on one device: the reminder stops asking on the others
    const handled: Partial<Record<Command["type"], string>> = { acknowledge: "Acknowledged", start: "Started", snooze: "Snoozed", block: "Marked blocked", submit: "Submitted" };
    const taskId = "taskId" in cmd ? cmd.taskId : undefined;
    if (handled[cmd.type] && taskId) silenceOtherDevices(actor.personId, taskId, handled[cmd.type]!).catch(() => undefined);
    return { ok: true };
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, status: 422, error: e.message };
    console.error("command failed", cmd.type, e);
    return { ok: false, status: 500, error: "Something went wrong saving that. Try again in a moment." };
  }
}
