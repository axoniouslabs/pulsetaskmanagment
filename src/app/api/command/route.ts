import { applyCommand, CommandError, type Command } from "@/domain/commands";
import { authorize } from "@/domain/permissions";
import { db } from "@/server/db";
import { loadWorld, lockOrg, persist } from "@/server/repo";
import { getViewer, json } from "@/server/session";
import { validateCommand } from "@/server/validate";
import { deliverPush } from "@/server/push";
import { newId } from "@/server/ids";

/**
 * Every button in Pulse ends up here. One command, one transaction:
 * lock the organisation, load, check permission, apply the shared rules,
 * write the changes, the activity entries and the notifications together.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, error: "Your session ended. Sign in again." }, 401);

  let cmd: Command;
  try {
    cmd = validateCommand(await req.json());
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "That request didn't make sense." }, 400);
  }

  try {
    const { newNotificationIds } = await db.transaction(async (tx) => {
      await lockOrg(tx, viewer.orgId);
      const before = await loadWorld(tx, viewer.orgId, { notificationsFor: viewer.personId });
      const decision = authorize(before, viewer.personId, cmd);
      if (!decision.ok) throw new CommandError(decision.error);
      const after = applyCommand(before, cmd, { actorId: viewer.personId, now: new Date(), uid: newId });
      return persist(tx, before, after);
    });
    // push goes out after the data is safely stored
    deliverPush(newNotificationIds).catch((e) => console.error("push", e));
    return json({ ok: true });
  } catch (e) {
    if (e instanceof CommandError) return json({ ok: false, error: e.message }, 422);
    console.error("command failed", cmd.type, e);
    return json({ ok: false, error: "Something went wrong saving that. Try again in a moment." }, 500);
  }
}
