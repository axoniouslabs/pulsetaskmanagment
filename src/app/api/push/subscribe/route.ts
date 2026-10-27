import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as S } from "@/server/db";
import { getActor, json } from "@/server/session";
import { newId } from "@/server/ids";

const body = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

function describe(ua: string): { kind: "windows" | "android" | "iphone" | "browser"; label: string } {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  if (/Android/i.test(ua)) return { kind: "android", label: `Android phone (${browser})` };
  if (/iPhone|iPad|iPod/i.test(ua)) return { kind: "iphone", label: /iPad/.test(ua) ? "iPad" : "iPhone" };
  if (/Windows/i.test(ua)) return { kind: "windows", label: `Windows PC (${browser})` };
  if (/Mac OS X/i.test(ua)) return { kind: "browser", label: `Mac (${browser})` };
  return { kind: "browser", label: browser };
}

/** Save (or renew) this browser's push subscription for the signed-in person. */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "That subscription didn't look right." }, 400);
  const { endpoint, keys } = parsed.data;
  const { kind, label } = describe(req.headers.get("user-agent") ?? "");

  const [existing] = await db.select({ id: S.devices.id }).from(S.devices).where(eq(S.devices.endpoint, endpoint));
  const values = { orgId: viewer.orgId, personId: viewer.personId, kind, label, endpoint, p256dh: keys.p256dh, auth: keys.auth, healthy: true, lastSeen: new Date() };
  let id = existing?.id;
  // a shared computer moves to whoever signed in last
  if (id) await db.update(S.devices).set(values).where(eq(S.devices.id, id));
  else {
    id = newId("dev");
    await db.insert(S.devices).values({ id, ...values });
  }
  return json({ ok: true, deviceId: id, label });
}

/** Stop sending push to this browser. */
export async function DELETE(req: Request) {
  const actor = await getActor();
  if (!actor.viewer) return actor.response;
  const viewer = actor.viewer;
  const { endpoint, deviceId } = ((await req.json().catch(() => ({}))) ?? {}) as { endpoint?: string; deviceId?: string };
  if (endpoint) await db.delete(S.devices).where(and(eq(S.devices.endpoint, endpoint), eq(S.devices.personId, viewer.personId)));
  if (deviceId) await db.delete(S.devices).where(and(eq(S.devices.id, deviceId), eq(S.devices.personId, viewer.personId)));
  return json({ ok: true });
}
