import { demoEnabled } from "@/lib/demo-flag";
import { eq } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { loadEngineState, loadWorld, scopeWorld } from "@/server/repo";
import { getViewer, json } from "@/server/session";

/** Everything the signed-in person is allowed to see, in the shape the screens use. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sign in again." }, 401);
  const [world, engine, [org]] = await Promise.all([
    loadWorld(db, viewer.orgId, { activity: true, stats: true }),
    loadEngineState(db, viewer.orgId),
    db.select({ createdAt: S.organizations.createdAt }).from(S.organizations).where(eq(S.organizations.id, viewer.orgId)),
  ]);
  const scoped = scopeWorld(world, viewer.personId);
  return json({
    viewer: { personId: viewer.personId, role: viewer.role },
    world: scoped,
    serverTime: new Date().toISOString(),
    engineLastTickAt: engine.lastTickAt ?? null,
    companyCreatedAt: org?.createdAt ? new Date(org.createdAt).toISOString() : null,
    demoMode: demoEnabled() && viewer.orgId === "org_crescent",
    pushPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
  });
}
