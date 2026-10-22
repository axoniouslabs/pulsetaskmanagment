import { eq } from "drizzle-orm";
import { db, schema as S } from "@/server/db";
import { getViewer, json } from "@/server/session";

/** clears the "choose your own password" prompt after someone changes theirs */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false }, 401);
  await db.update(S.people).set({ mustChangePassword: false }).where(eq(S.people.id, viewer.personId));
  return json({ ok: true });
}
