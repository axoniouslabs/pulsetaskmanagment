import { listBackups } from "@/server/backup";
import { getActor, json } from "@/server/session";

export async function GET() {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  if (actor.viewer.role !== "owner") return json({ ok: false, error: "Only the owner can see backups." }, 403);
  return json({ ok: true, backups: await listBackups(actor.viewer.orgId) });
}
