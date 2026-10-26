"use server";

import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { CompanyError, createCompany } from "@/server/company";
import { secretMatches } from "@/server/secret";

/** the setup key is CRON_SECRET (or SETUP_KEY when set): only whoever runs the server knows it */
function keyMatches(given: string) {
  return secretMatches(given, process.env.SETUP_KEY || process.env.CRON_SECRET);
}

export interface SetupInput {
  key: string;
  company: string;
  name: string;
  email: string;
  password: string;
}

export async function setupCompany(input: SetupInput): Promise<{ ok: true } | { ok: false; error: string; field?: keyof SetupInput }> {
  if (!input.company?.trim()) return { ok: false, error: "Enter your company's name.", field: "company" };
  if (!input.name?.trim()) return { ok: false, error: "Enter your name.", field: "name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email?.trim() ?? "")) return { ok: false, error: "Enter a valid email address.", field: "email" };
  if ((input.password ?? "").length < 8) return { ok: false, error: "Use a password of at least 8 characters.", field: "password" };
  if (!keyMatches(input.key ?? "")) return { ok: false, error: "That setup key isn't right. Copy the CRON_SECRET value from your Vercel project settings.", field: "key" };

  try {
    await createCompany({ company: input.company, ownerName: input.name, ownerEmail: input.email, password: input.password }, { onlyIfEmpty: true });
  } catch (e) {
    if (e instanceof CompanyError) return { ok: false, error: e.message };
    console.error("setup", e);
    return { ok: false, error: "Pulse couldn't save your company. Try again in a moment." };
  }

  try {
    await auth.api.signInEmail({ body: { email: input.email.trim().toLowerCase(), password: input.password }, headers: await headers() });
  } catch {
    // the company exists; they can still sign in on the next screen
  }
  return { ok: true };
}
