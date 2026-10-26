// Runs before `next build` on Vercel (npm run vercel-build):
//   1. apply database migrations
//   2. PULSE_DEMO=1: load the demo company (skipped if it's already there)
//      otherwise: remove any demo company left in the database
// Without a database yet, it warns and lets the build continue, so the first
// deploy succeeds; add the database and redeploy.
import { execSync } from "node:child_process";
import { findDatabaseUrl } from "../src/server/db/url.mjs";

// preview builds (other branches) may share the production database: leave it alone
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`Pulse: ${process.env.VERCEL_ENV} build, so no database changes (migrations and demo data run on production deploys only).`);
  process.exit(0);
}

const db = findDatabaseUrl(process.env);
if (!db) {
  console.warn("\n⚠  Pulse: no DATABASE_URL yet. Skipping migrations. Add a Neon database to the project and redeploy.\n");
  process.exit(0);
}
// the steps below (and the seed) read DATABASE_URL
process.env.DATABASE_URL = db;
const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

console.log("Pulse: applying database migrations");
run("npx drizzle-kit migrate");

if (process.env.PULSE_DEMO === "1") {
  if (!process.env.SEED_PASSWORD) console.warn("⚠  Pulse: PULSE_DEMO=1 but SEED_PASSWORD is not set, so the demo company was not loaded.");
  else {
    console.log("Pulse: loading the demo company (if it isn't there yet)");
    run("npx tsx --conditions=react-server scripts/seed.ts");
  }
} else {
  console.log("Pulse: making sure no demo data is left");
  run("npx tsx --conditions=react-server scripts/remove-demo.ts");
}
for (const [name, hint] of [
  ["BETTER_AUTH_SECRET", "sign-in will not work"],
  ["CRON_SECRET", "the reminder engine endpoint will refuse to run"],
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "push notifications are off"],
]) {
  if (!process.env[name]) console.warn(`⚠  Pulse: ${name} is not set: ${hint}.`);
}
