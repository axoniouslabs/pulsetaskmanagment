import { tickAll } from "@/server/tick";
import { json } from "@/server/session";
import { secretMatches } from "@/server/secret";

/**
 * Called every minute by the scheduler (cron-job.org, GitHub Actions or Vercel
 * Cron). Protected by CRON_SECRET: send it as "Authorization: Bearer <secret>"
 * (Vercel Cron does this automatically) or as ?secret=<secret>.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
    if (!secretMatches(given, secret)) return json({ ok: false, error: "unauthorized" }, 401);
  } else if (process.env.NODE_ENV === "production") {
    return json({ ok: false, error: "Set CRON_SECRET to enable the reminder engine." }, 503);
  }
  const started = Date.now();
  const results = await tickAll();
  return json({ ok: true, ms: Date.now() - started, results });
}

export const GET = handle;
export const POST = handle;
