import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema as S } from "./db";

/** for the request gate: is this request from the Pulse administrator? */
export async function isPlatformAdminRequest(headers: Headers) {
  try {
    const session = await auth.api.getSession({ headers });
    if (!session) return false;
    const [u] = await db.select({ platformAdmin: S.user.platformAdmin }).from(S.user).where(eq(S.user.id, session.user.id));
    return !!u?.platformAdmin;
  } catch {
    return false;
  }
}
