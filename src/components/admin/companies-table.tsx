"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Segmented } from "@/components/ui/primitives";
import { EmptyState, Panel } from "@/components/app/page-header";
import { ago } from "@/lib/admin-shared";
import type { CompanyRow } from "@/server/admin-data";
import { PageTitle, StatusBadge } from "./bits";

type Filter = "all" | "active" | "paused";

export function CompaniesTable({ rows, now }: { rows: CompanyRow[]; now: number }) {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const shown = rows.filter((c) => {
    const text = `${c.name} ${c.owner?.name ?? ""} ${c.owner?.email ?? ""} ${c.contactPhone}`.toLowerCase();
    if (q && !text.includes(q.trim().toLowerCase())) return false;
    if (filter === "active") return c.access === "active";
    if (filter === "paused") return c.access === "paused";
    return true;
  });

  return (
    <>
      <PageTitle
        title="Companies"
        sub="Every company on Pulse and how much it's being used. Open one to see its people, reset the owner's password or pause it."
        action={
          <Button asChild variant="primary">
            <Link href="/admin/companies/new">
              <Plus /> Add a company
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block sm:w-72">
          <span className="sr-only">Search companies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by company, owner or phone" className="h-10 pl-9" />
        </label>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${rows.length}` },
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <Panel>
          <EmptyState icon={Building2} title={rows.length ? "No company matches" : "No companies yet"} body={rows.length ? "Try another search or filter." : "Add your first client company and send them their login."} />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          {/* desktop: a table that reads across */}
          <table className="hidden w-full text-left text-[13.5px] md:table">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-faint">
                <th className="px-5 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium">People</th>
                <th className="px-3 py-2.5 font-medium">Active this week</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Last used</th>
                <th className="px-3 py-2.5 text-right font-medium">Tasks, 30 days</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="group relative border-b border-line transition-colors last:border-0 hover:bg-hover">
                  <td className="px-5 py-3">
                    <Link href={`/admin/companies/${c.id}`} className="font-medium text-text after:absolute after:inset-0">
                      {c.name}
                    </Link>
                    <p className="text-[12.5px] text-faint">{c.owner ? `${c.owner.name}, ${c.owner.email}` : "No owner"}</p>
                  </td>
                  <td className="px-3 py-3 tabular text-text">{c.users}</td>
                  <td className="px-3 py-3 tabular text-text">{c.activeThisWeek}</td>
                  <td className="px-3 py-3">
                    <StatusBadge access={c.access} />
                  </td>
                  <td className="px-3 py-3 text-muted">{ago(c.lastActivityAt, now)}</td>
                  <td className="px-3 py-3 text-right tabular text-text">{c.tasks30}</td>
                  <td className="pr-4">
                    <ChevronRight className="size-4 text-faint transition-transform duration-200 ease-[var(--ease-settle)] group-hover:translate-x-0.5" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* phone: one card per company */}
          <ul className="md:hidden">
            {shown.map((c) => (
              <li key={c.id} className="border-b border-line last:border-0">
                <Link href={`/admin/companies/${c.id}`} className="block px-4 py-3.5 transition-colors hover:bg-hover">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-medium text-text">{c.name}</p>
                      <p className="truncate text-[12.5px] text-faint">{c.owner?.name ?? "No owner"}</p>
                    </div>
                    <StatusBadge access={c.access} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-4 text-[12.5px] text-muted">
                    <span>
                      {c.users} {c.users === 1 ? "person" : "people"}
                      <br />
                      {c.activeThisWeek} active this week
                    </span>
                    <span className="text-right">
                      Used {ago(c.lastActivityAt, now).toLowerCase()}
                      <br />
                      {c.tasks30} tasks in 30 days
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
