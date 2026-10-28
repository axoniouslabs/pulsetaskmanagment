import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq } from "drizzle-orm";
import { newId } from "./ids";
import { sendEmail } from "./email";
import { db, schema } from "./db";

/** the app's public address: BETTER_AUTH_URL, or what Vercel tells us */
const vercel = (v?: string) => (v ? `https://${v}` : undefined);
const baseURL = process.env.BETTER_AUTH_URL || vercel(process.env.VERCEL_PROJECT_PRODUCTION_URL) || vercel(process.env.VERCEL_URL);
// preview links and the production domain may all be used to sign in
const trustedOrigins = [baseURL, vercel(process.env.VERCEL_URL), vercel(process.env.VERCEL_BRANCH_URL), vercel(process.env.VERCEL_PROJECT_PRODUCTION_URL)].filter((x): x is string => !!x);

export const auth = betterAuth({
  appName: "Pulse",
  baseURL,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification, rateLimit: schema.rateLimit, twoFactor: schema.twoFactor },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by the owner (invites), never by public sign-up.
    disableSignUp: true,
    minPasswordLength: 8,
    // a reset link by email, when email is set up (RESEND_API_KEY); otherwise managers reset passwords
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        "Reset your Pulse password",
        `Someone asked to reset the password for ${user.email} on Pulse.\n\nChoose a new password here (the link works for one hour): ${url}\n\nIf it wasn't you, ignore this email. Your password stays the same.`,
      );
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // kept in Postgres so the limit holds across every serverless instance; always on
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },
      "/two-factor/*": { window: 300, max: 10 },
      "/request-password-reset": { window: 3600, max: 5 },
      "/reset-password": { window: 3600, max: 10 },
    },
  },
  // security changes go on the record (spec §12: full audit trail)
  hooks: {
    // the shared demo accounts can't be locked behind one visitor's authenticator app
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/enable" || process.env.PULSE_DEMO !== "1") return;
      const session = await getSessionFromCtx(ctx);
      if (!session) return;
      const [p] = await db.select({ orgId: schema.people.orgId }).from(schema.people).where(eq(schema.people.userId, session.user.id));
      if (p?.orgId === "org_crescent") throw new APIError("FORBIDDEN", { message: "Two-step sign-in is turned off for the demo company." });
    }),
    after: createAuthMiddleware(async (ctx) => {
      const what = AUDIT[ctx.path];
      const userId = ctx.context.session?.user.id ?? ctx.context.newSession?.user.id;
      if (!what || !userId || ctx.context.returned instanceof Error) return;
      try {
        const [p] = await db.select({ id: schema.people.id, orgId: schema.people.orgId }).from(schema.people).where(eq(schema.people.userId, userId));
        if (p) await db.insert(schema.activity).values({ id: newId("act"), orgId: p.orgId, at: new Date(), actorId: p.id, kind: "security", text: what });
      } catch (e) {
        console.error("audit", e);
      }
    }),
  },
  plugins: [twoFactor({ issuer: "Pulse" }), nextCookies()],
});

const AUDIT: Record<string, string> = {
  "/two-factor/enable": "Set up two-step sign-in",
  "/two-factor/disable": "Turned off two-step sign-in",
  "/revoke-other-sessions": "Signed out of every other device",
  "/revoke-session": "Signed out of a device",
  "/change-password": "Changed their password",
};
