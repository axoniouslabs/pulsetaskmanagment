"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FileText, MoreHorizontal, Scale, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/app/avatar";
import { Bar, Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/primitives";
import { METRICS, type MetricKey, type PersonRow } from "./metrics";

type SortKey = "name" | MetricKey | "volume";

const COLS: { key: SortKey; label: string; className?: string }[] = [
  { key: "name", label: "Person", className: "text-left pl-4 sm:pl-5" },
  { key: "completion", label: "Completion" },
  { key: "volume", label: "Weighted volume" },
  { key: "onTime", label: "On time" },
  { key: "ack", label: "Avg ack" },
  { key: "firstReminder", label: "First reminder" },
  { key: "rework", label: "Rework" },
  { key: "escalations", label: "Escalations" },
];

const def = (k: MetricKey) => METRICS.find((m) => m.key === k)!;

export function valueOf(r: PersonRow, k: SortKey): number | string {
  if (k === "name") return r.person.name;
  if (k === "volume") return r.rates.volume;
  return r.rates[k] ?? -1;
}

/** average ack time for desk staff and for field staff, so each is judged against its own kind */
export function ackBaselines(rows: PersonRow[]) {
  const avg = (kind: "desk" | "field") => {
    const xs = rows.filter((r) => r.person.workType === kind && r.rates.ack !== null).map((r) => r.rates.ack!);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return { desk: avg("desk"), field: avg("field") };
}

export function PeopleTable({
  rows,
  sort,
  onSort,
  onAppraisal,
}: {
  rows: PersonRow[];
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  onAppraisal: (personId: string) => void;
}) {
  const router = useRouter();
  const base = ackBaselines(rows);
  const maxVol = Math.max(1, ...rows.map((r) => r.rates.volume));

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <div className="thin-scrollbar relative overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-hover">
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("px-3 py-0 text-right font-medium text-muted", c.className)}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(c.key)}
                      className={cn("inline-flex h-10 items-center gap-1 whitespace-nowrap text-[12.5px] hover:text-text print:h-8", active && "text-text", c.key !== "name" && "flex-row-reverse")}
                    >
                      {c.label}
                      {active ? sort.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <span className="size-3.5" aria-hidden />}
                    </button>
                  </th>
                );
              })}
              <th className="w-12 print:hidden">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.person;
              const baseline = base[p.workType];
              const slowAck = r.rates.ack !== null && baseline !== null && r.rates.ack > baseline * 1.5 && r.rates.ack - baseline > 15;
              const lowOnTime = r.rates.onTime !== null && r.rates.onTime < 70;
              const highRework = r.rates.rework !== null && r.rates.rework >= 20;
              return (
                <tr key={p.id} onClick={() => router.push(`/team?person=${p.id}`)} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-hover">
                  <td className="py-2.5 pl-4 pr-3 sm:pl-5">
                    <div className="flex items-center gap-2.5">
                      <Avatar person={p} size="md" />
                      <div className="min-w-0">
                        <Link href={`/team?person=${p.id}`} onClick={(e) => e.stopPropagation()} className="relative -my-1 block truncate py-1 font-medium text-text hover:underline">
                          {p.name}
                        </Link>
                        <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                          <span className={cn("rounded-[4px] px-1.5 text-[11px] font-medium leading-[18px]", p.workType === "field" ? "bg-info-tint text-info" : "bg-sunken text-muted")}>
                            {p.workType === "field" ? "Field" : "Desk"}
                          </span>
                          <span className="truncate">{p.title}</span>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="ml-auto flex w-[104px] items-center gap-2">
                      <Bar value={r.rates.completion ?? 0} className="flex-1" />
                      <span className="tabular w-9 text-right font-medium">{def("completion").format(r.rates.completion)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="ml-auto flex w-[84px] items-center justify-end gap-2" title="Estimated hours of work assigned">
                      <span
                        className="h-1.5 rounded-full bg-line-strong"
                        style={{
                          width: `${Math.max(4, (r.rates.volume / maxVol) * 36)}px`,
                        }}
                        aria-hidden
                      />
                      <span className="tabular text-muted">{Math.round(r.rates.volume)}h</span>
                    </div>
                  </td>
                  <td className={cn("tabular px-3 py-2.5 text-right", lowOnTime && "font-medium text-heat-2")}>{def("onTime").format(r.rates.onTime)}</td>
                  <td className={cn("tabular px-3 py-2.5 text-right", slowAck && "font-medium text-heat-2")}>{def("ack").format(r.rates.ack)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{def("firstReminder").format(r.rates.firstReminder)}</td>
                  <td className={cn("tabular px-3 py-2.5 text-right", highRework && "font-medium text-heat-2")}>{def("rework").format(r.rates.rework)}</td>
                  <td className={cn("tabular px-3 py-2.5 text-right", r.rates.escalations >= 4 && "font-medium text-heat-3")}>{r.rates.escalations}</td>
                  <td className="pr-2 text-right print:hidden" onClick={(e) => e.stopPropagation()}>
                    <Menu>
                      <MenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-10 items-center justify-center rounded-[var(--radius-sm)] text-faint hover:bg-sunken hover:text-text"
                          aria-label={`More for ${p.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => onAppraisal(p.id)}>
                          <FileText /> Appraisal report
                        </MenuItem>
                        <MenuItem onSelect={() => router.push(`/team?person=${p.id}`)}>
                          <UserRound /> Open profile
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FairnessNote() {
  return (
    <p className="mb-3 flex items-start gap-2 text-[13px] leading-snug text-muted">
      <Scale className="mt-0.5 size-4 shrink-0 text-faint" />
      <span>
        Completion rate is shown next to weighted volume, so someone finishing a few big tasks isn&apos;t ranked below someone finishing many small ones. Response time measures availability, so field
        staff are compared with field staff.
      </span>
    </p>
  );
}

export type { SortKey };
