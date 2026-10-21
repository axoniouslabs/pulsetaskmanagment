"use client";

import * as React from "react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { BarChart3, FileDown, Printer } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import type { DailyStat } from "@/lib/seed";
import { Button } from "@/components/ui/button";
import { Segmented, Select } from "@/components/ui/primitives";
import { EmptyState, PageHeader, Panel, SectionHeading } from "@/components/app/page-header";
import { MetricStrip } from "@/components/pages/reports/metric-strip";
import { DepartmentChart, EstimateChart, ThroughputChart, TimeSplitChart, type DayPoint } from "@/components/pages/reports/charts";
import { FairnessNote, PeopleTable, valueOf, type SortKey } from "@/components/pages/reports/people-table";
import { AppraisalDialog } from "@/components/pages/reports/appraisal-dialog";
import { PrintStyle } from "@/components/pages/reports/print-style";
import { downloadCsv } from "@/components/pages/reports/csv";
import {
  METRICS,
  PERIOD_LABEL,
  inRange,
  ratesOf,
  sumRows,
  windows,
  type MetricKey,
  type Period,
  type PersonRow,
} from "@/components/pages/reports/metrics";

export default function ReportsPage() {
  const now = useNow(60000);
  const { role, me, meId, people, allPeople } = useScope();
  const stats = useApp((s) => s.stats);
  const departments = useApp((s) => s.departments);
  const orgName = useApp((s) => s.settings.name);

  const [period, setPeriod] = React.useState<Period>("week");
  const [dept, setDept] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "completion", dir: "desc" });
  const [deptMetric, setDeptMetric] = React.useState<MetricKey>("completion");
  const [appraisalId, setAppraisalId] = React.useState<string | null>(null);

  const today = React.useMemo(() => new Date(now.toDateString()), [now]);
  const w = React.useMemo(() => windows(period, today), [period, today]);

  /* who is in the report */
  const scoped = React.useMemo(() => {
    if (role === "employee") return allPeople.filter((p) => p.id === meId);
    const base = people.filter((p) => p.role !== "owner");
    return role === "owner" && dept !== "all" ? base.filter((p) => p.departmentId === dept) : base;
  }, [role, people, allPeople, meId, dept]);
  const ids = React.useMemo(() => new Set(scoped.map((p) => p.id)), [scoped]);
  const rows = React.useMemo(() => stats.filter((r) => ids.has(r.personId)), [stats, ids]);
  const inPeriod = React.useMemo(() => rows.filter((r) => inRange(r.date, w.range)), [rows, w]);

  const totals = React.useMemo(() => sumRows(inPeriod), [inPeriod]);
  const cur = React.useMemo(() => ratesOf(totals), [totals]);
  const trendCur = React.useMemo(() => ratesOf(sumRows(rows.filter((r) => inRange(r.date, w.trendCur)))), [rows, w]);
  const prev = React.useMemo(() => ratesOf(sumRows(rows.filter((r) => inRange(r.date, w.trendPrev)))), [rows, w]);

  /* throughput per day */
  const days: DayPoint[] = React.useMemo(() => {
    const by = new Map<string, DailyStat[]>();
    for (const r of inPeriod) by.set(r.date, [...(by.get(r.date) ?? []), r]);
    return [...by.keys()].sort().map((date) => {
      const t = sumRows(by.get(date)!);
      const d = new Date(`${date}T00:00:00`);
      return {
        date,
        label: period === "week" ? format(d, "EEE") : format(d, "d MMM"),
        full: format(d, "EEEE d MMMM"),
        assigned: t.assigned,
        approved: t.approved,
        est: Math.round(t.estHours * 10) / 10,
        actual: Math.round(t.actualHours * 10) / 10,
      };
    });
  }, [inPeriod, period]);

  /* estimate vs actual: per day this week, per week over 4 weeks */
  const estData = React.useMemo(() => {
    if (period === "week") return days.map((d) => ({ label: d.label, full: d.full, est: d.est, actual: d.actual }));
    return [3, 2, 1, 0].map((i) => {
      const from = format(subDays(today, i * 7 + 6), "yyyy-MM-dd");
      const to = format(subDays(today, i * 7), "yyyy-MM-dd");
      const t = sumRows(inPeriod.filter((r) => inRange(r.date, [from, to])));
      const start = new Date(`${from}T00:00:00`);
      return {
        label: i === 0 ? "This week" : format(start, "d MMM"),
        full: `Week starting ${format(start, "EEEE d MMMM")}`,
        est: Math.round(t.estHours * 10) / 10,
        actual: Math.round(t.actualHours * 10) / 10,
      };
    });
  }, [period, days, inPeriod, today]);

  /* people table */
  const personRows: PersonRow[] = React.useMemo(
    () =>
      scoped
        .map((p) => {
          const t = sumRows(inPeriod.filter((r) => r.personId === p.id));
          return { person: p, totals: t, rates: ratesOf(t) };
        })
        .filter((r) => r.totals.days > 0),
    [scoped, inPeriod],
  );
  const sortedRows = React.useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...personRows].sort((a, b) => {
      const va = valueOf(a, sort.key);
      const vb = valueOf(b, sort.key);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [personRows, sort]);

  /* departments (owner, all departments) */
  const deptData = React.useMemo(() => {
    const def = METRICS.find((m) => m.key === deptMetric)!;
    return departments.map((d) => {
      const pids = new Set(allPeople.filter((p) => p.departmentId === d.id && p.role !== "owner").map((p) => p.id));
      const r = ratesOf(sumRows(stats.filter((s) => pids.has(s.personId) && inRange(s.date, w.range))));
      return { name: d.name, value: r[deptMetric], def };
    });
  }, [departments, allPeople, stats, w, deptMetric]);

  const isEmployee = role === "employee";
  const myDept = departments.find((d) => d.headId === meId);
  const rangeLabel = `${format(new Date(`${w.range[0]}T00:00:00`), "d MMM")} to ${format(new Date(`${w.range[1]}T00:00:00`), "d MMM yyyy")}`;
  const scopeLabel = isEmployee
    ? "your own work"
    : role === "owner"
      ? dept === "all"
        ? "the whole company"
        : `${departments.find((d) => d.id === dept)?.name ?? ""}`
      : `${myDept?.name ?? "your team"}`;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "ack" || key === "rework" || key === "escalations" ? "asc" : "desc" }));

  const exportCsv = () => {
    const list = isEmployee ? personRows : sortedRows;
    if (!list.length) {
      toast("Nothing to export", { description: "There is no data for this period yet." });
      return;
    }
    const r1 = (v: number | null) => (v === null ? "" : Math.round(v));
    downloadCsv(
      `pulse-report-${format(new Date(), "yyyy-MM-dd")}.csv`,
      ["Person", "Department", "Work type", "Completion %", "Weighted volume (h)", "On time %", "Avg time to acknowledge (min)", "Answered first reminder %", "Rework %", "Escalations", "Assigned", "Approved"],
      list.map((r) => [
        r.person.name,
        departments.find((d) => d.id === r.person.departmentId)?.name ?? "",
        r.person.workType === "field" ? "Field" : "Desk",
        r1(r.rates.completion),
        Math.round(r.rates.volume * 10) / 10,
        r1(r.rates.onTime),
        r1(r.rates.ack),
        r1(r.rates.firstReminder),
        r1(r.rates.rework),
        r.rates.escalations,
        r.totals.assigned,
        r.totals.approved,
      ]),
    );
    toast.success("Exported", { description: `${list.length === 1 ? "1 row" : `${list.length} rows`} saved as a CSV file that opens in Excel.` });
  };

  const appraisalRow = personRows.find((r) => r.person.id === appraisalId) ?? null;
  const deptDef = METRICS.find((m) => m.key === deptMetric)!;

  return (
    <div className="space-y-6">
      <PrintStyle />
      <p className="hidden text-[12px] text-muted print:block">
        {orgName}, printed {format(now, "d MMM yyyy, h:mm a")} by {me.name}
      </p>
      <PageHeader
        className="mb-0"
        title={isEmployee ? "My stats" : "Reports"}
        description={
          isEmployee
            ? `Your own numbers for ${rangeLabel}. These are exactly what your manager sees, and blocked time never counts against you.`
            : `How work moved in ${scopeLabel}, ${rangeLabel}. Everything here comes from the activity log, so nobody can adjust it.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button size="md" onClick={exportCsv}>
              <FileDown /> Export Excel
            </Button>
            <Button size="md" onClick={() => window.print()}>
              <Printer /> Export PDF
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Segmented value={period} onChange={setPeriod} options={[{ value: "week", label: PERIOD_LABEL.week }, { value: "month", label: PERIOD_LABEL.month }]} />
        {role === "owner" && (
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 w-auto min-w-44" aria-label="Department">
            <option value="all">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        {role === "manager" && myDept && <span className="text-[13px] text-muted">Showing {myDept.name}, the department you lead</span>}
      </div>

      {!inPeriod.length ? (
        <Panel>
          <EmptyState icon={BarChart3} title="No numbers for this period yet" body="Reports fill in as tasks are assigned and finished. Try the last 4 weeks instead." action={period === "week" ? <Button onClick={() => setPeriod("month")}>Show last 4 weeks</Button> : undefined} />
        </Panel>
      ) : (
        <>
          <MetricStrip cur={cur} prev={prev} trendCur={trendCur} note={w.trendNote} />

          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-1">
            <ThroughputChart data={days} />
            <TimeSplitChart totals={totals} />
          </div>
          <EstimateChart data={estData} unitLabel={period === "week" ? "day" : "week"} />

          {!isEmployee && (
            <section className="print:break-before-page">
              <SectionHeading title="People" aside={`${personRows.length} in this report. Click a row to open their profile.`} />
              <FairnessNote />
              {personRows.length ? (
                <PeopleTable rows={sortedRows} sort={sort} onSort={toggleSort} onAppraisal={setAppraisalId} />
              ) : (
                <Panel>
                  <EmptyState icon={BarChart3} title="Nobody to show" body="No one in this department had tasks in this period. Pick another department or period." />
                </Panel>
              )}
            </section>
          )}

          {role === "owner" && dept === "all" && (
            <section className="print:break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-text">Departments compared</h2>
                <Segmented
                  size="sm"
                  value={deptMetric}
                  onChange={setDeptMetric}
                  className="print:hidden"
                  options={[
                    { value: "completion", label: "Completion" },
                    { value: "onTime", label: "On time" },
                    { value: "ack", label: "Avg ack" },
                    { value: "escalations", label: "Escalations" },
                  ]}
                />
              </div>
              <Panel className="p-4 sm:p-5">
                <DepartmentChart data={deptData} format={deptDef.format} domainMax={deptDef.key === "completion" || deptDef.key === "onTime" ? 100 : undefined} />
                <p className="mt-3 text-[12.5px] text-muted">
                  {deptDef.label} for {PERIOD_LABEL[period].toLowerCase()}. {deptDef.better === "up" ? "Longer bars are better." : "Shorter bars are better."} Departments with more field staff
                  naturally take longer to acknowledge.
                </p>
              </Panel>
            </section>
          )}
        </>
      )}

      <AppraisalDialog
        row={appraisalRow}
        allRows={personRows}
        periodLabel={PERIOD_LABEL[period]}
        rangeLabel={rangeLabel}
        onOpenChange={(o) => !o && setAppraisalId(null)}
      />
    </div>
  );
}
