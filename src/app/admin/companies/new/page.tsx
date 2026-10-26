import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/admin/bits";
import { NewCompanyForm } from "@/components/admin/new-company";
import { listPlans } from "@/server/admin-data";
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
  const plans = (await listPlans()).filter((p) => !p.archived);
  return <NewCompanyForm plans={plans.map((p) => ({ id: p.id, name: p.name, maxUsers: p.maxUsers, priceMonthly: p.priceMonthly }))} />;
}
