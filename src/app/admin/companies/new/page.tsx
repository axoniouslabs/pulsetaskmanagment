import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/admin/bits";
import { NewCompanyForm } from "@/components/admin/new-company";
import { requireAdmin } from "../../guard";

export const metadata: Metadata = { title: "Add a company" };

export default function NewCompanyPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <NewCompany />
    </Suspense>
  );
}

async function NewCompany() {
  await requireAdmin();
  return <NewCompanyForm />;
}
