import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AdminSkeleton } from "@/components/admin/bits";
import { CompanyView } from "@/components/admin/company-view";
import { companyDetail } from "@/server/admin-data";
import { db, schema as S } from "@/server/db";
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
  const me = await requireAdmin();
  const { id } = await params;
  const now = new Date();
  const detail = await companyDetail(id, now);
  if (!detail) notFound();
  const [mine] = await db.select({ id: S.people.id }).from(S.people).where(and(eq(S.people.orgId, id), eq(S.people.userId, me.id)));
  return <CompanyView {...detail} now={now.getTime()} ownCompany={!!mine} />;
}
