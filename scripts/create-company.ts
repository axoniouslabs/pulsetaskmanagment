/**
 * Create a real client company and its owner account.
 *
 *   npx tsx --conditions=react-server scripts/create-company.ts \
 *     --company "Client Name" --owner-name "Owner Name" --owner-email owner@client.com [--timezone Asia/Karachi]
 *
 * Prints a temporary password for the owner, who is asked to change it after signing in.
 */
import "dotenv/config";
import { createCompany } from "@/server/company";
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

  const password = tempPassword();
  await createCompany({ company, ownerName, ownerEmail, timezone, password, mustChangePassword: true });

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
