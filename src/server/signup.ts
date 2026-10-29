import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema as S } from "./db";
import { newId } from "./ids";
import { CompanyError, createCompany } from "./company";
import { sendEmail } from "./email";
import { TRIAL_DAYS } from "@/lib/access";

/** personal mail providers: many companies share them, so they don't count as one company's domain */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
  "mail.com",
]);
export const workDomain = (email: string) => {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  return d && !FREE_MAIL.has(d) ? d : undefined;
};

/** a code by email when email is set up; without it the sign-up goes straight through */
export const emailCheckOn = () => !!process.env.RESEND_API_KEY;

export const signupInput = z.object({
  name: z.string().trim().min(2, "Write your full name.").max(80),
  company: z.string().trim().min(2, "Write your company's name.").max(120),
  email: z.string().trim().toLowerCase().email("That email doesn't look right.").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
  code: z.string().trim().max(10).optional(),
});

export class SignupError extends Error {}

async function checkFree(email: string) {
  const [taken] = await db.select({ id: S.user.id }).from(S.user).where(eq(S.user.email, email));
  if (taken) throw new SignupError(`${email} already has a Pulse account. Sign in instead.`);
  const domain = workDomain(email);
  if (domain) {
    const [used] = await db.select({ id: S.organizations.id }).from(S.organizations).where(eq(S.organizations.signupDomain, domain));
    if (used) throw new SignupError(`A company using ${domain} has already started a free trial. Ask your owner to invite you, or contact us.`);
  }
}

/** step 1 (with email on): send a 6-digit code to prove the address is theirs */
export async function sendSignupCode(email: string) {
  await checkFree(email);
  const code = String(randomInt(100000, 1000000));
  const identifier = `signup:${email}`;
  await db.delete(S.verification).where(eq(S.verification.identifier, identifier));
  await db.insert(S.verification).values({ id: newId("v"), identifier, value: code, expiresAt: new Date(Date.now() + 15 * 60000) });
  await sendEmail(email, `${code} is your Pulse code`, `Your Pulse sign-up code is ${code}. It works for 15 minutes.\n\nIf you didn't ask for this, ignore this email.`);
}

/** step 2: make the company, its owner and a 3-day trial */
export async function startTrial(raw: unknown) {
  const input = signupInput.parse(raw);
  await checkFree(input.email);
  if (emailCheckOn()) {
    const identifier = `signup:${input.email}`;
    const [v] = await db
      .select()
      .from(S.verification)
      .where(and(eq(S.verification.identifier, identifier), gt(S.verification.expiresAt, new Date())));
    if (!v || v.value !== (input.code ?? "").replace(/\s+/g, "")) throw new SignupError("That code isn't right, or it has expired. Check the email, or send a new code.");
    await db.delete(S.verification).where(eq(S.verification.identifier, identifier));
  }
  try {
    const r = await createCompany(
      { company: input.company, ownerName: input.name, ownerEmail: input.email, password: input.password, contactPhone: input.phone },
      { trialDays: TRIAL_DAYS, signupDomain: workDomain(input.email) },
    );
    return { ...r, password: input.password };
  } catch (e) {
    if (e instanceof CompanyError) throw new SignupError(e.message);
    throw e;
  }
}
