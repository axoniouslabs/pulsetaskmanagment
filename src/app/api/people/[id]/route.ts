import { ZodError } from "zod";
import { getActor, json } from "@/server/session";
import { AdminError, deletePerson, updatePerson } from "@/server/people-admin";

/** Owner edits a person, or deactivates / reactivates them. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  if (viewer.role !== "owner") return json({ ok: false, error: "Only the owner can change people's details." }, 403);
  const { id } = await ctx.params;
  try {
    await updatePerson(viewer.orgId, viewer.personId, id, await req.json());
    return json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError) return json({ ok: false, error: e.issues[0]?.message ?? "Check the details." }, 400);
    if (e instanceof AdminError) return json({ ok: false, error: e.message }, 422);
    console.error("update person", e);
    return json({ ok: false, error: "Couldn't save that. Try again." }, 500);
  }
}

/** Owner deletes someone added by mistake (anyone with a history is deactivated instead). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  if (viewer.role !== "owner") return json({ ok: false, error: "Only the owner can delete people." }, 403);
  const { id } = await ctx.params;
  try {
    await deletePerson(viewer.orgId, viewer.personId, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AdminError) return json({ ok: false, error: e.message }, 422);
    console.error("delete person", e);
    return json({ ok: false, error: "Couldn't delete them. Try again." }, 500);
  }
}
