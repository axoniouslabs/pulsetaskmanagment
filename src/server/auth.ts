import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "./db";

/** the app's public address: BETTER_AUTH_URL, or what Vercel tells us */
const vercel = (v?: string) => (v ? `https://${v}` : undefined);
const baseURL = process.env.BETTER_AUTH_URL || vercel(process.env.VERCEL_PROJECT_PRODUCTION_URL) || vercel(process.env.VERCEL_URL);
// preview links and the production domain may all be used to sign in
const trustedOrigins = [baseURL, vercel(process.env.VERCEL_URL), vercel(process.env.VERCEL_BRANCH_URL), vercel(process.env.VERCEL_PROJECT_PRODUCTION_URL)].filter(
  (x): x is string => !!x,
);

export const auth = betterAuth({
  appName: "Pulse",
  baseURL,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by the owner (invites), never by public sign-up.
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: { enabled: process.env.NODE_ENV === "production" },
  plugins: [nextCookies()],
});
