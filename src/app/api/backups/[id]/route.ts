import { readBackup } from "@/server/backup";
import { getActor, json } from "@/server/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  if (actor.viewer.role !== "owner") return json({ ok: false, error: "Only the owner can download backups." }, 403);
  const b = await readBackup(actor.viewer.orgId, (await ctx.params).id);
  if (!b) return json({ ok: false, error: "That backup no longer exists." }, 404);
  return new Response(new Uint8Array(b.json), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pulse-backup-${b.at.toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
