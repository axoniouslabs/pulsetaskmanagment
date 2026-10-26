import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/admin/bits";
import { PlansEditor } from "@/components/admin/plans";
import { listPlans } from "@/server/admin-data";
import { requireAdmin } from "../guard";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Plans />
    </Suspense>
  );
}

async function Plans() {
  await requireAdmin();
  const plans = await listPlans();
  return <PlansEditor plans={plans.map((p) => ({ id: p.id, name: p.name, maxUsers: p.maxUsers, priceMonthly: p.priceMonthly, archived: p.archived, companies: p.companies }))} />;
}
