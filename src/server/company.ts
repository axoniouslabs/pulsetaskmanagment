import "server-only";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { emptyWorld } from "@/domain/world";
import { db, schema as S } from "./db";
import { newId } from "./ids";

export interface NewCompany {
  company: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  timezone?: string;
  /** ask the owner to choose their own password after the first sign-in */
  mustChangePassword?: boolean;
  /** subscription: plan (user limit) and paid-up date; none means no limit, never expires */
  planId?: string | null;
  expiresAt?: Date | null;
  contactPhone?: string;
  /** the owner also runs the Pulse admin panel (the first company on a server) */
  platformAdmin?: boolean;
}

export class CompanyError extends Error {}

export async function companyCount() {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(S.organizations);
  return row?.n ?? 0;
}

/** One organisation with its owner, their sign-in, and a notices channel. */
export async function createCompany(input: NewCompany, opts: { onlyIfEmpty?: boolean } = {}) {
  const company = input.company.trim();
  const ownerName = input.ownerName.trim().replace(/\s+/g, " ");
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const timezone = input.timezone ?? "Asia/Karachi";
  if (!company || !ownerName || !ownerEmail) throw new CompanyError("Company name, your name and email are all needed.");
  if (input.password.length < 8) throw new CompanyError("Use a password of at least 8 characters.");

  const hash = await hashPassword(input.password);
  const orgId = newId("org");
  const userId = newId("u");
  const personId = newId("p");
  const settings = { ...emptyWorld().settings, name: company, timezone };
  const initials = ownerName
    .split(" ")
    .map((s) => s[0]!.toUpperCase())
    .join("")
    .slice(0, 2);

  await db.transaction(async (tx) => {
    // one setup at a time, so two people pressing "Create" can't both win
    await tx.execute(sql`select pg_advisory_xact_lock(4471)`);
    if (opts.onlyIfEmpty) {
      const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(S.organizations);
      if ((row?.n ?? 0) > 0) throw new CompanyError("Pulse is already set up here. Sign in instead.");
    }
    const [taken] = await tx.select({ id: S.user.id }).from(S.user).where(eq(S.user.email, ownerEmail));
    if (taken) throw new CompanyError(`${ownerEmail} already has a Pulse account.`);

    await tx.insert(S.organizations).values({
      id: orgId,
      name: company,
      timezone,
      settings,
      planId: input.planId ?? null,
      expiresAt: input.expiresAt ?? null,
      contactPhone: input.contactPhone?.trim() ?? "",
    });
    await tx.insert(S.user).values({ id: userId, name: ownerName, email: ownerEmail, emailVerified: true, platformAdmin: !!input.platformAdmin });
    await tx.insert(S.account).values({ id: newId("a"), accountId: userId, providerId: "credential", userId, password: hash });
    await tx.insert(S.people).values({
      id: personId,
      orgId,
      userId,
      name: ownerName,
      initials,
      role: "owner",
      title: "Owner",
      hue: 205,
      email: ownerEmail,
      mustChangePassword: input.mustChangePassword ?? false,
    });
    await tx.insert(S.channels).values({ id: newId("c"), orgId, name: "Company notices", kind: "announcement", unitType: "org", unitId: orgId, description: "Notices from the owner to everyone" });
    await tx.insert(S.activity).values({ id: newId("act"), orgId, at: new Date(), actorId: personId, kind: "created", text: `Created ${company} on Pulse` });
  });

  return { orgId, personId, ownerEmail };
}
