import { exportData } from "@/server/backup";
import { getActor, json } from "@/server/session";

/**
 * The whole company's data as one JSON file, for the owner. People come without
 * anything secret (no passwords, no device keys). The activity log is complete.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  if (viewer.role !== "owner") return json({ error: "Only the owner can export the company's data." }, 403);
  const out = await exportData(viewer.orgId);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(out, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pulse-${out.settings.name.replace(/[^\w.-]+/g, "-").toLowerCase()}-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
