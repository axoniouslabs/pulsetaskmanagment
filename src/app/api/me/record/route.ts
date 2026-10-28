import { getActor, json } from "@/server/session";
import { personalRecord } from "@/server/history";

/** everything recorded about the signed-in person, as one file */
export async function GET() {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const out = await personalRecord(actor.viewer.orgId, actor.viewer.personId);
  if (!out.person) return json({ ok: false, error: "Not found" }, 404);
  return new Response(JSON.stringify(out, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pulse-my-record-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
