import { and, eq } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { getActor, json } from "@/server/session";
import { newId } from "@/server/ids";

/** Owner signs someone out of every device (a lost phone, a shared PC). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  if (viewer.role !== "owner") return json({ ok: false, error: "Only the owner can sign someone out." }, 403);
  const { id } = await ctx.params;
  const [p] = await db
    .select({ userId: S.people.userId, name: S.people.name })
    .from(S.people)
    .where(and(eq(S.people.id, id), eq(S.people.orgId, viewer.orgId)));
  if (!p?.userId) return json({ ok: false, error: "That person isn't in this company." }, 404);
  if (id === viewer.personId) return json({ ok: false, error: "Sign yourself out from Settings → Security." }, 422);
  const gone = await db.delete(S.session).where(eq(S.session.userId, p.userId)).returning({ id: S.session.id });
  await db
    .insert(S.activity)
    .values({
      id: newId("act"),
      orgId: viewer.orgId,
      at: new Date(),
      actorId: viewer.personId,
      kind: "security",
      text: `Signed ${p.name} out of ${gone.length === 1 ? "1 device" : `${gone.length} devices`}`,
    });
  return json({ ok: true, devices: gone.length });
}
