import { eq } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { getViewer } from "@/server/session";
import { authorize } from "@/domain/permissions";
import { loadWorld } from "@/server/repo";

/** Serve an uploaded file to people in the same organisation. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in again.", { status: 401 });
  const { id } = await ctx.params;
  const [f] = await db.select().from(S.files).where(eq(S.files.id, id));
  if (!f || f.orgId !== viewer.orgId) return new Response("Not found", { status: 404 });
  // a file on a task is for the people who can see that task
  if (f.taskId && f.byId !== viewer.personId) {
    const world = await loadWorld(db, viewer.orgId);
    if (!authorize(world, viewer.personId, { type: "addComment", taskId: f.taskId, body: "-" }).ok) return new Response("Not found", { status: 404 });
  }
  if (f.blobUrl) return Response.redirect(f.blobUrl, 302);
  if (!f.data) return new Response("Not found", { status: 404 });
  const inline = /^(image\/|application\/pdf|text\/plain|audio\/)/.test(f.contentType);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.contentType,
      "content-length": String(f.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(f.name)}"`,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
