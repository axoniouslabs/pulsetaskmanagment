import { connection } from "next/server";
import { companyCount } from "@/server/company";
import { json } from "@/server/session";

/** Lets the sign-in page send a brand-new server's first visitor to /setup. */
export async function GET() {
  await connection();
  try {
    return json({ needsSetup: (await companyCount()) === 0 });
  } catch {
    return json({ needsSetup: false });
  }
}
