import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/admin/bits";
import { CompaniesTable } from "@/components/admin/companies-table";
import { listCompanies } from "@/server/admin-data";
import { requireAdmin } from "../guard";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Companies />
    </Suspense>
  );
}

async function Companies() {
  await requireAdmin();
  const now = new Date();
  return <CompaniesTable rows={await listCompanies(now)} now={now.getTime()} />;
}
