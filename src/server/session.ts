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
}

/** The signed-in person for this request, or null. Deduplicated per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [p] = await db.select().from(schema.people).where(eq(schema.people.userId, session.user.id));
  if (!p || !p.active) return null;
  return { userId: session.user.id, personId: p.id, orgId: p.orgId, role: p.role as Viewer["role"], name: p.name };
});

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
