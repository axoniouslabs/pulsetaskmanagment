import { ZodError } from "zod";
import { getActor, json } from "@/server/session";
import { AdminError } from "@/server/people-admin";
import { PausedError } from "@/server/platform";
import { createInvite, listInvites } from "@/server/invites";

/** Owner: open invites, and who used theirs */
export async function GET() {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  if (actor.viewer.role !== "owner") return json({ ok: false, error: "Only the owner can see invites." }, 403);
  return json({ ok: true, invites: await listInvites(actor.viewer.orgId) });
}

/** Owner invites someone by email, or makes a code to hand over */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  if (viewer.role !== "owner") return json({ ok: false, error: "Only the owner can invite people." }, 403);
  try {
    return json({ ok: true, invite: await createInvite(viewer.orgId, viewer.personId, await req.json()) });
  } catch (e) {
    if (e instanceof ZodError) return json({ ok: false, error: e.issues[0]?.message ?? "Check the details." }, 400);
    if (e instanceof AdminError || e instanceof PausedError) return json({ ok: false, error: e.message }, 422);
    console.error("invite", e);
    return json({ ok: false, error: "Couldn't make the invite. Try again." }, 500);
  }
}
