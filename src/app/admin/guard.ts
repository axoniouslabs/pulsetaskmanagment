import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { getPlatformAdmin } from "@/server/platform";

/** the Pulse administrator, or: not signed in → sign in; signed in but not admin → 404 */
export async function requireAdmin() {
  await connection();
  const admin = await getPlatformAdmin();
  if (admin) return admin;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=/admin");
  notFound();
}
