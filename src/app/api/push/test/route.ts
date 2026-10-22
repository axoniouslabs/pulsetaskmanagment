import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { getViewer, json } from "@/server/session";
import { deliverPush, pushConfigured } from "@/server/push";
import { newId } from "@/server/ids";

/** Send a test notification to every device of the signed-in person. */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, error: "Sign in again." }, 401);
  if (!pushConfigured()) return json({ ok: false, error: "Push isn't set up on this server yet (VAPID keys missing)." }, 503);
  const devices = await db.select({ id: S.devices.id }).from(S.devices).where(and(eq(S.devices.personId, viewer.personId), isNotNull(S.devices.endpoint), eq(S.devices.healthy, true)));
  if (!devices.length) return json({ ok: false, error: "No device is set up for notifications yet. Turn them on first." }, 409);
  const id = newId("n");
  await db.insert(S.notifications).values({
    id,
    orgId: viewer.orgId,
    recipientId: viewer.personId,
    at: new Date(),
    kind: "announcement",
    title: "Test notification from Pulse",
    body: "If you can see this, reminders will reach this device.",
    read: true,
  });
  await deliverPush([id]);
  return json({ ok: true, devices: devices.length });
}
