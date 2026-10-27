import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema } from "./db";

export interface Viewer {
  userId: string;
  personId: string;
  orgId: string;
  role: "owner" | "manager" | "employee";
  name: string;
  /** Still on the temporary password someone else typed: only a password change is allowed. */
  mustChangePassword: boolean;
}

/** The signed-in person for this request, or null. Deduplicated per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [p] = await db.select().from(schema.people).where(eq(schema.people.userId, session.user.id));
  if (!p || !p.active) return null;
  return { userId: session.user.id, personId: p.id, orgId: p.orgId, role: p.role as Viewer["role"], name: p.name, mustChangePassword: p.mustChangePassword };
});

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * The signed-in person for a request that changes something. Until a temporary
 * password has been replaced, the only change allowed is that replacement, so
 * the app's first-sign-in gate can't be skipped by calling the API directly.
 */
export async function getActor(): Promise<{ viewer: Viewer } | { viewer: null; response: Response }> {
  const viewer = await getViewer();
  if (!viewer) return { viewer: null, response: json({ ok: false, error: "Your session ended. Sign in again." }, 401) };
  if (viewer.mustChangePassword) return { viewer: null, response: json({ ok: false, error: "Choose your own password first.", code: "choose_password" }, 403) };
  return { viewer };
}
