import { demoEnabled } from "@/lib/demo-flag";
import { getViewer, json } from "@/server/session";
import { DEMO_ORG_ID, seedDemo } from "@/server/demo";

/** Owner of the demo company puts everything back to the starting story. */
export async function POST() {
  if (!demoEnabled()) return json({ ok: false, error: "Demo reset is turned off." }, 403);
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, error: "Sign in again." }, 401);
  if (viewer.orgId !== DEMO_ORG_ID || viewer.role !== "owner") return json({ ok: false, error: "Only the demo owner can reset the demo." }, 403);
  try {
    await seedDemo({ reset: true });
    return json({ ok: true });
  } catch (e) {
    console.error("demo reset", e);
    return json({ ok: false, error: "The reset didn't finish. Try again." }, 500);
  }
}
