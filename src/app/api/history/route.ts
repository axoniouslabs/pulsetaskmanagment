import { getActor, json } from "@/server/session";
import { historyPage } from "@/server/history";

/** older activity, a page at a time (?before=ISO&task=id) */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const url = new URL(req.url);
  const b = new Date(url.searchParams.get("before") ?? Date.now());
  const before = Number.isNaN(b.getTime()) ? new Date() : b;
  const page = await historyPage(actor.viewer, before, url.searchParams.get("task") ?? undefined);
  return json({ ok: true, ...page });
}
