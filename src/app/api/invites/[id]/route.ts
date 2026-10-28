import { getActor, json } from "@/server/session";
import { AdminError } from "@/server/people-admin";
import { revokeInvite } from "@/server/invites";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  if (actor.viewer.role !== "owner") return json({ ok: false, error: "Only the owner can cancel invites." }, 403);
  try {
    await revokeInvite(actor.viewer.orgId, actor.viewer.personId, (await ctx.params).id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AdminError) return json({ ok: false, error: e.message }, 422);
    throw e;
  }
}
