import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminSkeleton } from "@/components/admin/bits";
import { CompanyView } from "@/components/admin/company-view";
import { companyDetail, listPlans } from "@/server/admin-data";
import { getPlatformAdmin } from "@/server/platform";
import { db, schema as S } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "../../guard";

export const metadata: Metadata = { title: "Company" };

export default function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Company params={params} />
    </Suspense>
  );
}

async function Company({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const now = new Date();
  const [detail, plans, me] = await Promise.all([companyDetail(id, now), listPlans(), getPlatformAdmin()]);
  if (!detail) notFound();
  const [mine] = me ? await db.select({ id: S.people.id }).from(S.people).where(and(eq(S.people.orgId, id), eq(S.people.userId, me.id))) : [];
  return (
    <CompanyView
      {...detail}
      now={now.getTime()}
      ownCompany={!!mine}
      plans={plans.filter((p) => !p.archived || p.id === detail.company.planId).map((p) => ({ id: p.id, name: p.name, maxUsers: p.maxUsers, priceMonthly: p.priceMonthly }))}
    />
  );
}
