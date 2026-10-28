import { connection } from "next/server";
import { companyCount } from "@/server/company";
import { json } from "@/server/session";

/** Lets the sign-in page send a brand-new server's first visitor to /setup. */
export async function GET() {
  await connection();
  try {
    // the sign-in page offers "Forgot your password?" only when reset emails can actually be sent
    return json({ needsSetup: (await companyCount()) === 0, emailEnabled: !!process.env.RESEND_API_KEY });
  } catch {
    return json({ needsSetup: false, emailEnabled: false });
  }
}
