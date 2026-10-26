import { demoEnabled } from "@/lib/demo-flag";
import { eq } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { loadEngineState, loadWorld, scopeWorld } from "@/server/repo";
import { getViewer, json } from "@/server/session";
import { blockedMessage, loadSubscription, supportLine } from "@/server/platform";

/** Everything the signed-in person is allowed to see, in the shape the screens use. */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sign in again." }, 401);
  const [sub, [account]] = await Promise.all([
    loadSubscription(viewer.orgId),
    db.select({ platformAdmin: S.user.platformAdmin }).from(S.user).where(eq(S.user.id, viewer.userId)),
  ]);
  // a paused company sees only why, and who to talk to
  if (sub?.state === "suspended") return json({ locked: { company: sub.company, message: await blockedMessage(sub) }, platformAdmin: !!account?.platformAdmin }, 423);
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
    platformAdmin: !!account?.platformAdmin,
    subscription: sub && {
      state: sub.state,
      expiresAt: sub.expiresAt,
      daysLeft: sub.daysLeft,
      planName: sub.planName,
      maxUsers: sub.maxUsers,
      usedUsers: sub.usedUsers,
      notice: sub.state === "expired" ? await blockedMessage(sub) : sub.state === "expiring" ? await supportLine() : null,
    },
    pushPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
  });
}
