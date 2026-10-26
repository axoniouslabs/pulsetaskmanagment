"use server";

import { demoEnabled } from "@/lib/demo-flag";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db, schema } from "@/server/db";

/**
 * One-tap sign-in for the demo company. Only works while PULSE_DEMO=1 and only
 * for people in the demo organisation; the password stays on the server.
 */
export async function demoSignIn(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!demoEnabled()) return { ok: false, error: "Demo sign-in is turned off. Use your email and password." };
  const password = process.env.SEED_PASSWORD;
  if (!password) return { ok: false, error: "The demo isn't set up on this server yet." };
  const [person] = await db.select({ orgId: schema.people.orgId }).from(schema.people).where(eq(schema.people.email, email.toLowerCase()));
  if (!person || person.orgId !== "org_crescent") return { ok: false, error: "That isn't one of the demo accounts." };
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
    return { ok: true };
  } catch {
    return { ok: false, error: "That demo account can't sign in right now. The demo may need a reset." };
  }
}
