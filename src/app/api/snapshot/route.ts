import { db } from "@/server/db";
import { loadWorld, scopeWorld } from "@/server/repo";
import { getViewer, json } from "@/server/session";

/** Everything the signed-in person is allowed to see, in the shape the screens use. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sign in again." }, 401);
  const world = await loadWorld(db, viewer.orgId, { activity: true, stats: true });
  const scoped = scopeWorld(world, viewer.personId);
  return json({ viewer: { personId: viewer.personId, role: viewer.role }, world: scoped, serverTime: new Date().toISOString(), demoMode: process.env.DEMO_MODE === "1" && viewer.orgId === "org_crescent" });
}
