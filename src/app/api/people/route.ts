import { ZodError } from "zod";
import { getViewer, json } from "@/server/session";
import { AdminError, createPerson } from "@/server/people-admin";

/** Owner adds a person. Returns a temporary password to hand over once. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return json({ ok: false, error: "Sign in again." }, 401);
  if (viewer.role !== "owner") return json({ ok: false, error: "Only the owner can add people." }, 403);
  try {
    const r = await createPerson(viewer.orgId, viewer.personId, await req.json());
    return json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ZodError) return json({ ok: false, error: e.issues[0]?.message ?? "Check the details." }, 400);
    if (e instanceof AdminError) return json({ ok: false, error: e.message }, 422);
    console.error("add person", e);
    return json({ ok: false, error: "Couldn't add them. Try again." }, 500);
  }
}
