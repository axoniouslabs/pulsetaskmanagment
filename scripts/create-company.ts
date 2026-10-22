/**
 * Create a real client company and its owner account.
 *
 *   npx tsx --conditions=react-server scripts/create-company.ts \
 *     --company "Client Name" --owner-name "Owner Name" --owner-email owner@client.com [--timezone Asia/Karachi]
 *
 * Prints a temporary password for the owner, who is asked to change it after signing in.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { emptyWorld } from "@/domain/world";
import { db, schema as S } from "@/server/db";
import { newId } from "@/server/ids";
import { tempPassword } from "@/server/people-admin";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const company = arg("company")?.trim();
  const ownerName = arg("owner-name")?.trim();
  const ownerEmail = arg("owner-email")?.trim().toLowerCase();
  const timezone = arg("timezone") ?? "Asia/Karachi";
  if (!company || !ownerName || !ownerEmail) throw new Error('Usage: --company "Name" --owner-name "Name" --owner-email you@company.com');

  const [taken] = await db.select({ id: S.user.id }).from(S.user).where(eq(S.user.email, ownerEmail));
  if (taken) throw new Error(`${ownerEmail} already has a Pulse account.`);

  const password = tempPassword();
  const hash = await hashPassword(password);
  const orgId = newId("org");
  const userId = newId("u");
  const personId = newId("p");
  const settings = { ...emptyWorld().settings, name: company, timezone };

  await db.transaction(async (tx) => {
    await tx.insert(S.organizations).values({ id: orgId, name: company, timezone, settings });
    await tx.insert(S.user).values({ id: userId, name: ownerName, email: ownerEmail, emailVerified: true });
    await tx.insert(S.account).values({ id: newId("a"), accountId: userId, providerId: "credential", userId, password: hash });
    await tx.insert(S.people).values({
      id: personId,
      orgId,
      userId,
      name: ownerName,
      initials: ownerName.split(/\s+/).map((s) => s[0]!.toUpperCase()).join("").slice(0, 2),
      role: "owner",
      title: "Owner",
      hue: 205,
      email: ownerEmail,
      mustChangePassword: true,
    });
    await tx.insert(S.channels).values({ id: newId("c"), orgId, name: "Company notices", kind: "announcement", unitType: "org", unitId: orgId, description: "Notices from the owner to everyone" });
    await tx.insert(S.activity).values({ id: newId("act"), orgId, at: new Date(), actorId: personId, kind: "created", text: `Created ${company} on Pulse` });
  });

  console.log(`\nCreated ${company}.`);
  console.log(`Owner: ${ownerName} <${ownerEmail}>`);
  console.log(`Temporary password: ${password}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
