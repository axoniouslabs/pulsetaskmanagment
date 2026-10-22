// Runs before `next build` on Vercel (npm run vercel-build):
//   1. apply database migrations
//   2. load the demo company when DEMO_MODE=1 (skipped if it's already there)
// Without a database yet, it warns and lets the build continue, so the first
// deploy succeeds; add the database and redeploy.
import { execSync } from "node:child_process";

const db = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!db) {
  console.warn("\n⚠  Pulse: no DATABASE_URL yet. Skipping migrations. Add a Neon database to the project and redeploy.\n");
  process.exit(0);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

console.log("Pulse: applying database migrations");
run("npx drizzle-kit migrate");

if (process.env.DEMO_MODE === "1") {
  if (!process.env.SEED_PASSWORD) console.warn("⚠  Pulse: DEMO_MODE=1 but SEED_PASSWORD is not set, so the demo company was not loaded.");
  else {
    console.log("Pulse: loading the demo company (if it isn't there yet)");
    run("npx tsx --conditions=react-server scripts/seed.ts");
  }
}
for (const [name, hint] of [
  ["BETTER_AUTH_SECRET", "sign-in will not work"],
  ["CRON_SECRET", "the reminder engine endpoint will refuse to run"],
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "push notifications are off"],
]) {
  if (!process.env[name]) console.warn(`⚠  Pulse: ${name} is not set: ${hint}.`);
}
