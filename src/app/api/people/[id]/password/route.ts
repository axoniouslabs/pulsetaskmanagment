import { getActor, json } from "@/server/session";
import { AdminError, resetPassword } from "@/server/people-admin";

/** Owner sets a new temporary password; the person is signed out everywhere. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  if (viewer.role !== "owner") return json({ ok: false, error: "Only the owner can reset passwords." }, 403);
  const { id } = await ctx.params;
  try {
    return json({ ok: true, ...(await resetPassword(viewer.orgId, viewer.personId, id)) });
  } catch (e) {
    if (e instanceof AdminError) return json({ ok: false, error: e.message }, 422);
    console.error("reset password", e);
    return json({ ok: false, error: "Couldn't reset it. Try again." }, 500);
  }
}
