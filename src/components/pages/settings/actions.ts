"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db, schema as S } from "@/server/db";
import { getViewer } from "@/server/session";

/**
 * Change your own password. The "temporary password" prompt is cleared only here,
 * after the change has really happened.
 */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Your session ended. Sign in again." };
  if (typeof newPassword !== "string" || newPassword.length < 8) return { ok: false, error: "Use at least 8 characters for the new password." };
  if (newPassword.length > 128) return { ok: false, error: "Use at most 128 characters." };
  if (newPassword === currentPassword) return { ok: false, error: "Choose a password that's different from the current one." };
  try {
    await auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 500;
    return { ok: false, error: status === 400 || status === 401 ? "Your current password isn't right." : "Couldn't change the password. Try again." };
  }
  await db.update(S.people).set({ mustChangePassword: false }).where(eq(S.people.id, viewer.personId));
  return { ok: true };
}
