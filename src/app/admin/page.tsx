import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, SectionHeading } from "@/components/app/page-header";
import { AccessBadge, AdminSkeleton } from "@/components/admin/bits";
import { ago, pkr, shortDate } from "@/lib/admin-shared";
import { collectedSince, listCompanies, recentPayments, thisMonth, type CompanyRow } from "@/server/admin-data";
import { requireAdmin } from "./guard";

export default function AdminHome() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <Overview />
    </Suspense>
  );
}

const QUIET_DAYS = 7;
const ENGINE_STALE_MIN = 15;

type Need = { company: CompanyRow; why: string; tone: "heat-3" | "heat-1" | "muted" };

function needs(rows: CompanyRow[], now: number): Need[] {
  const out: Need[] = [];
  for (const c of rows) {
    if (c.access.state === "expired") out.push({ company: c, why: "Subscription has ended. They can only look, not work.", tone: "heat-3" });
    else if (c.access.state === "expiring") out.push({ company: c, why: "Subscription ends soon. A reminder to renew would help.", tone: "heat-1" });
    if (c.maxUsers !== null && c.users > c.maxUsers) out.push({ company: c, why: `${c.users} people on a plan for ${c.maxUsers}. Move them to a bigger plan.`, tone: "heat-1" });
    const quietSince = c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : new Date(c.createdAt).getTime();
    if ((c.access.state === "active" || c.access.state === "expiring") && now - quietSince > QUIET_DAYS * 86_400_000) {
      out.push({ company: c, why: c.lastActivityAt ? `Nobody has used Pulse for ${Math.round((now - quietSince) / 86_400_000)} days. Worth a call.` : "Set up but never used yet. Help them get started.", tone: "muted" });
    }
  }
  return out;
}

async function Overview() {
  await requireAdmin();
  const now = new Date();
  const [rows, recent, collected] = await Promise.all([listCompanies(now), recentPayments(), collectedSince(thisMonth(now))]);
  const t = now.getTime();
  const attention = needs(rows, t);
  const working = rows.filter((c) => c.access.state === "active" || c.access.state === "expiring");
  const monthly = working.reduce((sum, c) => sum + (c.access.expiresAt ? (c.priceMonthly ?? 0) : 0), 0);
  const people = rows.reduce((sum, c) => sum + c.users, 0);
  const activePeople = rows.reduce((sum, c) => sum + c.activeThisWeek, 0);
  // a company added in the last few minutes may not have had its first run yet
  const settled = working.filter((c) => t - new Date(c.createdAt).getTime() > ENGINE_STALE_MIN * 60000);
  const engineStale = settled.some((c) => !c.engineLastTickAt || t - new Date(c.engineLastTickAt).getTime() > ENGINE_STALE_MIN * 60000);
  const companiesWord = (n: number) => (n === 1 ? "company needs" : "companies need");
  const needCount = new Set(attention.map((a) => a.company.id)).size;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <p className="text-[14px] text-muted">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-text sm:text-[42px]">
          {needCount === 0 ? "Every company is in good standing." : `${needCount} ${companiesWord(needCount)} you.`}
        </h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          {rows.length} {rows.length === 1 ? "company uses" : "companies use"} Pulse, with {people} {people === 1 ? "person" : "people"}. {activePeople} of them did something this week.
        </p>

        {engineStale && (
          <div role="alert" className="mt-6 flex gap-3 rounded-[var(--radius-lg)] border border-heat-3/30 bg-heat-3-tint px-4 py-3 text-heat-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p className="text-[13.5px] leading-snug">
              <span className="font-semibold">Reminders haven&apos;t run in the last {ENGINE_STALE_MIN} minutes for at least one company.</span> Check that the every-minute job calling{" "}
              <code className="rounded bg-surface/60 px-1">/api/cron/tick</code> is switched on at cron-job.org.
            </p>
          </div>
        )}

        <div className="mt-8">
          <SectionHeading title="Needs your attention" aside={attention.length || undefined} className="mb-3" />
          {attention.length === 0 ? (
            <Panel className="px-5 py-6 text-[14px] text-muted">Nothing to chase. Subscriptions are paid, plans fit, and every company is using Pulse.</Panel>
          ) : (
            <Panel className="overflow-hidden">
              <ul>
                {attention.map((a, i) => (
                  <li key={`${a.company.id}-${i}`} className="border-b border-line last:border-0">
                    <Link href={`/admin/companies/${a.company.id}`} className="relative flex items-center gap-3 px-4 py-3.5 pl-5 transition-colors hover:bg-hover">
                      <span className={`absolute inset-y-2 left-0 w-[3px] rounded-r-full ${a.tone === "heat-3" ? "bg-heat-3" : a.tone === "heat-1" ? "bg-heat-1" : "bg-line-strong"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14.5px] font-medium text-text">
                          {a.company.name} <AccessBadge access={a.company.access} />
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted">{a.why}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <aside className="space-y-6">
        <Panel className="p-5">
          <SectionHeading title="This month" className="mb-4" />
          <dl className="space-y-3.5 text-[14px]">
            <Stat label="Collected" value={pkr(collected)} sub={`payments since ${shortDate(thisMonth(now).toISOString())}`} />
            <Stat label="Monthly value" value={pkr(monthly)} sub="plans of companies with access now" />
            <Stat label="Companies" value={String(working.length)} sub={`with access, of ${rows.length}`} />
            <Stat label="People" value={String(people)} sub={`${activePeople} active this week`} />
          </dl>
          <Button asChild variant="primary" className="mt-5 w-full">
            <Link href="/admin/companies/new">
              <Plus /> Add a company
            </Link>
          </Button>
        </Panel>

        <Panel>
          <div className="px-5 pt-4">
            <SectionHeading title="Latest payments" />
          </div>
          {recent.length === 0 ? (
            <p className="px-5 pb-5 pt-2 text-[13.5px] text-muted">Payments you record show up here.</p>
          ) : (
            <ul className="mt-2">
              {recent.map((p) => (
                <li key={p.id} className="border-t border-line">
                  <Link href={`/admin/companies/${p.orgId}`} className="flex items-baseline justify-between gap-3 px-5 py-3 text-[13.5px] transition-colors hover:bg-hover">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text">{p.company}</span>
                      <span className="text-faint">
                        {p.method}, {p.months} {p.months === 1 ? "month" : "months"}, {ago(p.paidAt, now.getTime()).toLowerCase()}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular text-text">{pkr(p.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <dt className="font-medium text-text">{label}</dt>
        <dd className="text-[12.5px] text-faint">{sub}</dd>
      </div>
      <dd className="font-display text-[22px] font-semibold leading-none tabular text-text">{value}</dd>
    </div>
  );
}
