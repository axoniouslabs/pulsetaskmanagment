/**
 * Optional built-in scheduler for running Pulse on a normal server (or locally):
 * set ENGINE_INTERNAL_TICK=1 and the app calls its own /api/cron/tick every
 * minute. On Vercel, leave it off and call /api/cron/tick from a scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENGINE_INTERNAL_TICK !== "1") return;
  const g = globalThis as unknown as { __pulseTicker?: ReturnType<typeof setInterval> };
  if (g.__pulseTicker) return;
  const url = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/cron/tick`;
  const run = () =>
    fetch(url, { method: "POST", headers: process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {} })
      .then((r) => (r.ok ? undefined : r.text().then((t) => console.error("internal tick", r.status, t.slice(0, 200)))))
      .catch((e) => console.error("internal tick", e instanceof Error ? e.message : e));
  setTimeout(run, 8000);
  g.__pulseTicker = setInterval(run, 60_000);
  console.log("Pulse reminder engine: ticking every minute inside the app");
}
