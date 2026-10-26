import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { companyCount } from "@/server/company";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up Pulse" };

/** First run only: once a company exists, this page sends people to sign in. */
export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  await connection();
  if ((await companyCount()) > 0) redirect("/login");
  return <SetupForm />;
}
