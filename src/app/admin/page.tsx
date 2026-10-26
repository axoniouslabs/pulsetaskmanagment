import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, SectionHeading } from "@/components/app/page-header";
import { AdminSkeleton, StatusBadge } from "@/components/admin/bits";
import { ago } from "@/lib/admin-shared";
import { listCompanies, type CompanyRow } from "@/server/admin-data";
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

/** companies that have stopped using Pulse, or never started */
function quiet(rows: CompanyRow[], now: number) {
  return rows
    .filter((c) => c.access === "active")
    .map((c) => {
      const since = c.lastActivityAt ? new Date(c.lastActivityAt).getTime() : new Date(c.createdAt).getTime();
      const days = Math.floor((now - since) / 86_400_000);
      return { c, days, why: c.lastActivityAt ? `Nobody has used Pulse for ${days} days. Worth a call.` : "Set up but never used yet. Help them get started." };
    })
    .filter((x) => x.days >= QUIET_DAYS)
    .sort((a, b) => b.days - a.days);
}

async function Overview() {
  await requireAdmin();
  const now = new Date();
  const t = now.getTime();
  const rows = await listCompanies(now);
  const attention = quiet(rows, t);
  const active = rows.filter((c) => c.access === "active");
  const people = rows.reduce((sum, c) => sum + c.users, 0);
  const activePeople = rows.reduce((sum, c) => sum + c.activeThisWeek, 0);
  const tasks30 = rows.reduce((sum, c) => sum + c.tasks30, 0);
  // a company added in the last few minutes may not have had its first reminder run yet
  const settled = active.filter((c) => t - new Date(c.createdAt).getTime() > ENGINE_STALE_MIN * 60000);
  const engineStale = settled.some((c) => !c.engineLastTickAt || t - new Date(c.engineLastTickAt).getTime() > ENGINE_STALE_MIN * 60000);
  const newest = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <p className="text-[14px] text-muted">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-2 font-display text-[34px] font-semibold leading-[1.05] tracking-tight text-text sm:text-[42px]">
          {attention.length === 0 ? "Every company is using Pulse." : `${attention.length} ${attention.length === 1 ? "company has" : "companies have"} gone quiet.`}
        </h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
          {rows.length} {rows.length === 1 ? "company is" : "companies are"} on Pulse, with {people} {people === 1 ? "person" : "people"}. {activePeople} of them did something this week.
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
          <SectionHeading title="Not using Pulse lately" aside={attention.length || undefined} className="mb-3" />
          {attention.length === 0 ? (
            <Panel className="px-5 py-6 text-[14px] text-muted">Every company has used Pulse in the last {QUIET_DAYS} days.</Panel>
          ) : (
            <Panel className="overflow-hidden">
              <ul>
                {attention.map(({ c, why }) => (
                  <li key={c.id} className="border-b border-line last:border-0">
                    <Link href={`/admin/companies/${c.id}`} className="relative flex items-center gap-3 px-4 py-3.5 pl-5 transition-colors hover:bg-hover">
                      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-heat-1" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-medium text-text">{c.name}</p>
                        <p className="mt-0.5 text-[13px] text-muted">
                          {why}
                          {c.contactPhone ? ` ${c.contactPhone}.` : ""}
                        </p>
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
          <SectionHeading title="Across all companies" className="mb-4" />
          <dl className="space-y-3.5 text-[14px]">
            <Stat label="Companies" value={rows.length} sub={rows.length - active.length ? `${rows.length - active.length} paused` : "all active"} />
            <Stat label="People" value={people} sub="with a sign-in" />
            <Stat label="Active this week" value={activePeople} sub="did something in Pulse" />
            <Stat label="Tasks" value={tasks30} sub="created in the last 30 days" />
          </dl>
          <Button asChild variant="primary" className="mt-5 w-full">
            <Link href="/admin/companies/new">
              <Plus /> Add a company
            </Link>
          </Button>
        </Panel>

        <Panel>
          <div className="px-5 pt-4">
            <SectionHeading title="Newest companies" />
          </div>
          <ul className="mt-2">
            {newest.map((c) => (
              <li key={c.id} className="border-t border-line">
                <Link href={`/admin/companies/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px] transition-colors hover:bg-hover">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-text">{c.name}</span>
                    <span className="text-faint">Added {ago(c.createdAt, t).toLowerCase()}</span>
                  </span>
                  <StatusBadge access={c.access} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
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
