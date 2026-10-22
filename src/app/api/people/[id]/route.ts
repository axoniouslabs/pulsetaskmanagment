import { ZodError } from "zod";
import { getViewer, json } from "@/server/session";
import { AdminError, updatePerson } from "@/server/people-admin";

/** Owner edits a person, or deactivates / reactivates them. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, error: "Sign in again." }, 401);
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
