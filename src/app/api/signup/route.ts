import { ZodError } from "zod";
import { headers } from "next/headers";
import { json } from "@/server/session";
import { auth } from "@/server/auth";
import { hit } from "@/server/throttle";
import { emailCheckOn, sendSignupCode, signupInput, SignupError, startTrial } from "@/server/signup";

const ipOf = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

/** does sign-up ask for an emailed code? */
export async function GET() {
  return json({ ok: true, needsCode: emailCheckOn() });
}

/** { step: "code" } sends the code; otherwise creates the company and signs the owner in */
export async function POST(req: Request) {
  const h = await headers();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (body.step === "code") {
      if (!(await hit(`signup-code:${ipOf(h)}`, 6, 3600))) return json({ ok: false, error: "Too many codes asked for. Try again in an hour." }, 429);
      const { email } = signupInput.pick({ email: true }).parse(body);
      await sendSignupCode(email);
      return json({ ok: true });
    }
    // a handful of trials per network address a day, and a few code guesses per address
    if (!(await hit(`signup:${ipOf(h)}`, 5, 86400))) return json({ ok: false, error: "Too many sign-ups from this connection today. Contact us instead." }, 429);
    if (typeof body.email === "string" && !(await hit(`signup-try:${body.email.toLowerCase()}`, 8, 900))) return json({ ok: false, error: "Too many tries. Wait 15 minutes." }, 429);
    const r = await startTrial(body);
    const res = await auth.api.signInEmail({ body: { email: r.ownerEmail, password: r.password }, headers: h, asResponse: true });
    const out = json({ ok: true });
    for (const c of res.headers.getSetCookie()) out.headers.append("set-cookie", c);
    return out;
  } catch (e) {
    if (e instanceof ZodError) return json({ ok: false, error: e.issues[0]?.message ?? "Check the details." }, 400);
    if (e instanceof SignupError) return json({ ok: false, error: e.message }, 422);
    console.error("signup", e);
    return json({ ok: false, error: "Couldn't create your company. Try again." }, 500);
  }
}
