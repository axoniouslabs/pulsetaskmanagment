import { ZodError } from "zod";
import { headers } from "next/headers";
import { json } from "@/server/session";
import { AdminError } from "@/server/people-admin";
import { PausedError } from "@/server/platform";
import { acceptInvite, lookupInvite } from "@/server/invites";
import { auth } from "@/server/auth";
import { hit } from "@/server/throttle";

/** check a code before showing the sign-up form */
export async function GET(req: Request) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await hit(`join:${ip}`, 30, 600))) return json({ ok: false, error: "Too many tries. Wait a few minutes." }, 429);
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const invite = await lookupInvite(code);
  return invite ? json({ ok: true, invite }) : json({ ok: false, error: "That code isn't valid. It may have expired or been used. Ask for a new one." }, 404);
}

/** use an invite: make the account, then sign straight in */
export async function POST(req: Request) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await hit(`join:${ip}`, 30, 600))) return json({ ok: false, error: "Too many tries. Wait a few minutes." }, 429);
  try {
    const body = await req.json();
    const r = await acceptInvite(body);
    const res = await auth.api.signInEmail({ body: { email: r.email, password: String(body.password) }, headers: h, asResponse: true });
    const out = json({ ok: true });
    for (const c of res.headers.getSetCookie()) out.headers.append("set-cookie", c);
    return out;
  } catch (e) {
    if (e instanceof ZodError) return json({ ok: false, error: e.issues[0]?.message ?? "Check the details." }, 400);
    if (e instanceof AdminError || e instanceof PausedError) return json({ ok: false, error: e.message }, 422);
    console.error("join", e);
    return json({ ok: false, error: "Couldn't create your account. Try again." }, 500);
  }
}
