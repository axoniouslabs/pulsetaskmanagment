"use client";

import * as React from "react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { BarChart3, FileDown, Printer } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useScope } from "@/lib/hooks";
import type { DailyStat } from "@/lib/seed";
import { Button } from "@/components/ui/button";
import { Input, Segmented, Select } from "@/components/ui/primitives";
import { EmptyState, PageHeader, Panel, SectionHeading } from "@/components/app/page-header";
import { MetricStrip } from "@/components/pages/reports/metric-strip";
import { DepartmentChart, EstimateChart, ThroughputChart, TimeSplitChart, type DayPoint } from "@/components/pages/reports/charts";
import { FairnessNote, PeopleTable, valueOf, type SortKey } from "@/components/pages/reports/people-table";
import { AppraisalDialog } from "@/components/pages/reports/appraisal-dialog";
import { PrintStyle } from "@/components/pages/reports/print-style";
import { downloadXlsx } from "@/lib/xlsx";
import { LoadChart, ProjectReport, projectRows } from "@/components/pages/reports/projects";
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
  const { role, me, meId, people, allPeople, tasks, teams } = useScope();
  const loadedStats = useApp((s) => s.stats);
  const departments = useApp((s) => s.departments);
  const projects = useApp((s) => s.projects);
  const orgName = useApp((s) => s.settings.name);

  const [period, setPeriod] = React.useState<Period>("week");
  const [custom, setCustom] = React.useState(() => ({ from: format(subDays(new Date(), 13), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") }));
  const [dept, setDept] = React.useState("all");
  const [team, setTeam] = React.useState("all");
  const [personFilter, setPersonFilter] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "completion", dir: "desc" });
  const [deptMetric, setDeptMetric] = React.useState<MetricKey>("completion");
  const [appraisalId, setAppraisalId] = React.useState<string | null>(null);

  const today = React.useMemo(() => new Date(now.toDateString()), [now]);
  const w = React.useMemo(() => windows(period, today, custom), [period, today, custom]);

  /* the app holds five weeks of report rows; anything older is fetched for the range asked for */
  const [extra, setExtra] = React.useState<{ key: string; stats: DailyStat[] } | null>(null);
  const earliestLoaded = format(subDays(today, 34), "yyyy-MM-dd");
  const needFrom = w.trendPrev[0] < w.range[0] ? w.trendPrev[0] : w.range[0];
  const fetchKey = needFrom < earliestLoaded ? `${needFrom}|${w.range[1]}` : "";
  React.useEffect(() => {
    if (!fetchKey) return;
    const [from, to] = fetchKey.split("|");
    let alive = true;
    fetch(`/api/stats?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { stats: DailyStat[] }) => alive && setExtra({ key: fetchKey, stats: d.stats }))
      .catch(() => alive && toast.error("Couldn't load the older numbers", { description: "Check your connection and pick the range again." }));
    return () => {
      alive = false;
    };
  }, [fetchKey]);
  const stats = React.useMemo(() => {
    if (!fetchKey || extra?.key !== fetchKey) return loadedStats;
    const seen = new Set(loadedStats.map((r) => `${r.personId}|${r.date}`));
    return [...loadedStats, ...extra.stats.filter((r) => !seen.has(`${r.personId}|${r.date}`))];
  }, [loadedStats, extra, fetchKey]);
  const loadingOlder = !!fetchKey && extra?.key !== fetchKey;
  const longRange = w.range[0] < format(subDays(today, 13), "yyyy-MM-dd");

  /* who is in the report */
  const scoped = React.useMemo(() => {
    if (role === "employee") return allPeople.filter((p) => p.id === meId);
    let base = people.filter((p) => p.role !== "owner");
    if (role === "owner" && dept !== "all") base = base.filter((p) => p.departmentId === dept);
    if (team !== "all") base = base.filter((p) => p.teamId === team || p.secondaryTeamIds?.includes(team));
    if (personFilter !== "all") base = base.filter((p) => p.id === personFilter);
    return base;
  }, [role, people, allPeople, meId, dept, team, personFilter]);
  const teamOptions = React.useMemo(() => {
    const ids = new Set(people.flatMap((p) => [p.teamId, ...(p.secondaryTeamIds ?? [])]));
    return teams.filter((t) => ids.has(t.id) && (dept === "all" || t.departmentId === dept));
  }, [people, teams, dept]);
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

  /* estimate vs actual: per day for short ranges, per week for longer ones */
  const estData = React.useMemo(() => {
    if (!longRange) return days.map((d) => ({ label: d.label, full: d.full, est: d.est, actual: d.actual }));
    const end = new Date(`${w.range[1]}T00:00:00`);
    const weeks = Math.min(26, Math.ceil((end.getTime() - new Date(`${w.range[0]}T00:00:00`).getTime()) / (7 * 86400000)) + 1);
    return Array.from({ length: weeks }, (_, k) => weeks - 1 - k).map((i) => {
      const from = format(subDays(end, i * 7 + 6), "yyyy-MM-dd");
      const to = format(subDays(end, i * 7), "yyyy-MM-dd");
      const t = sumRows(inPeriod.filter((r) => inRange(r.date, [from, to])));
      const start = new Date(`${from}T00:00:00`);
      return {
        label: i === 0 ? "This week" : format(start, "d MMM"),
        full: `Week starting ${format(start, "EEEE d MMMM")}`,
        est: Math.round(t.estHours * 10) / 10,
        actual: Math.round(t.actualHours * 10) / 10,
      };
    });
  }, [longRange, days, inPeriod, w]);

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

  /* teams: owner sees every team, a head their department's */
  const teamData = React.useMemo(() => {
    const def = METRICS.find((m) => m.key === deptMetric)!;
    const visibleTeams = role === "owner" ? teams.filter((t) => dept === "all" || t.departmentId === dept) : teams.filter((t) => departments.some((d) => d.headId === meId && d.id === t.departmentId));
    return visibleTeams.map((t) => {
      const pids = new Set(allPeople.filter((p) => (p.teamId === t.id || p.secondaryTeamIds?.includes(t.id)) && p.role !== "owner").map((p) => p.id));
      const r = ratesOf(sumRows(stats.filter((s) => pids.has(s.personId) && inRange(s.date, w.range))));
      return { name: t.name, value: r[deptMetric], def };
    });
  }, [teams, departments, allPeople, stats, w, deptMetric, role, dept, meId]);

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
  const filterLabel = [team !== "all" ? `${teams.find((t) => t.id === team)?.name} team` : "", personFilter !== "all" ? allPeople.find((p) => p.id === personFilter)?.name : ""].filter(Boolean).join(", ");

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "ack" || key === "rework" || key === "escalations" ? "asc" : "desc" }));

  const exportExcel = () => {
    const list = isEmployee ? personRows : sortedRows;
    if (!list.length) {
      toast("Nothing to export", { description: "There is no data for this period yet." });
      return;
    }
    const r1 = (v: number | null) => (v === null ? null : Math.round(v));
    const r10 = (v: number) => Math.round(v * 10) / 10;
    const projectList = projectRows(projects, tasks, now);
    downloadXlsx(`pulse-report-${w.range[0]}-to-${w.range[1]}.xlsx`, [
      {
        name: "People",
        widths: [24, 18, 10, 13, 18, 11, 22, 22, 11, 12, 16, 18, 10, 10],
        rows: [
          ["Person", "Department", "Work type", "Completion %", "Weighted volume (h)", "On time %", "Avg time to acknowledge (min)", "Answered first reminder %", "Rework %", "Escalations", "Typical cycle (h)", "Time vs estimate %", "Assigned", "Approved"],
          ...list.map((r) => [
            r.person.name,
            departments.find((d) => d.id === r.person.departmentId)?.name ?? "",
            r.person.workType === "field" ? "Field" : "Desk",
            r1(r.rates.completion),
            r10(r.rates.volume),
            r1(r.rates.onTime),
            r1(r.rates.ack),
            r1(r.rates.firstReminder),
            r1(r.rates.rework),
            r.rates.escalations,
            r.rates.cycle === null ? null : r10(r.rates.cycle),
            r1(r.rates.accuracy),
            r.totals.assigned,
            r.totals.approved,
          ]),
        ],
      },
      {
        name: "Days",
        widths: [12, 10, 10, 16, 14],
        rows: [["Date", "Assigned", "Approved", "Estimated hours", "Actual hours"], ...days.map((d) => [d.date, d.assigned, d.approved, d.est, d.actual])],
      },
      ...(projectList.length
        ? [
            {
              name: "Projects",
              widths: [24, 8, 8, 8, 10, 10, 16, 14, 14],
              rows: [
                ["Project", "Tasks", "Done", "Open", "Overdue", "On time %", "Estimated hours", "Hours worked", "Last deadline"],
                ...projectList.map((p) => [p.project.name, p.total, p.done, p.open, p.overdue, r1(p.onTime), r10(p.estHours), r10(p.actualHours), p.deadline ? format(new Date(p.deadline), "yyyy-MM-dd") : ""]),
              ],
            },
          ]
        : []),
      {
        name: "About",
        widths: [22, 60],
        rows: [
          ["Report", isEmployee ? "My stats" : "Reports"],
          ["Company", orgName],
          ["Period", `${w.range[0]} to ${w.range[1]}`],
          ["Covers", [scopeLabel, filterLabel].filter(Boolean).join(", ")],
          ["Made", format(new Date(), "yyyy-MM-dd HH:mm")],
          ["Note", "Everything comes from the activity log. Response time measures availability, not diligence: compare field staff with field staff."],
        ],
      },
    ]);
    toast.success("Exported", { description: `${list.length === 1 ? "1 person" : `${list.length} people`}, saved as an Excel file.` });
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
            <Button size="md" onClick={exportExcel}>
              <FileDown /> Export Excel
            </Button>
            <Button size="md" onClick={() => window.print()}>
              <Printer /> Export PDF
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={(["today", "week", "month", "thisMonth", "custom"] as const).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        />
        {period === "custom" && (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 w-auto" />
            to
            <Input type="date" aria-label="To" value={custom.to} min={custom.from} max={format(new Date(), "yyyy-MM-dd")} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 w-auto" />
          </span>
        )}
        {loadingOlder && <span className="text-[13px] text-muted">Loading older numbers…</span>}
        {!isEmployee && teamOptions.length > 1 && (
          <Select value={team} onChange={(e) => setTeam(e.target.value)} className="h-9 w-auto min-w-40" aria-label="Team">
            <option value="all">All teams</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        {!isEmployee && (
          <Select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="h-9 w-auto min-w-40" aria-label="Person">
            <option value="all">Everyone</option>
            {people
              .filter((p) => p.role !== "owner" && (dept === "all" || p.departmentId === dept))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        )}
        {role === "owner" && (
          <Select
            value={dept}
            onChange={(e) => {
              setDept(e.target.value);
              setTeam("all");
            }}
            className="h-9 w-auto min-w-44"
            aria-label="Department"
          >
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
          <EmptyState
            icon={BarChart3}
            title={loadingOlder ? "Loading these numbers…" : "No numbers for this period yet"}
            body={loadingOlder ? "Older report rows are on their way." : "Reports fill in as tasks are assigned and finished. Try a longer period, or remove a filter."}
            action={!loadingOlder && period !== "month" ? <Button onClick={() => setPeriod("month")}>Show last 4 weeks</Button> : undefined}
          />
        </Panel>
      ) : (
        <>
          <MetricStrip cur={cur} prev={prev} trendCur={trendCur} note={w.trendNote} />

          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-1">
            <ThroughputChart data={days} />
            <TimeSplitChart totals={totals} />
          </div>
          <EstimateChart data={estData} unitLabel={longRange ? "week" : "day"} />
          {!isEmployee && <LoadChart people={scoped} tasks={tasks} now={now} />}

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

          {!isEmployee && teamData.length > 1 && (
            <section className="print:break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-text">Teams compared</h2>
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
                <DepartmentChart data={teamData} format={deptDef.format} domainMax={deptDef.key === "completion" || deptDef.key === "onTime" ? 100 : undefined} />
              </Panel>
            </section>
          )}
        </>
      )}

      {!isEmployee && (
        <section className="print:break-before-page">
          <SectionHeading title="Projects" aside="Progress against each project's last deadline" />
          <ProjectReport projects={projects} tasks={tasks} now={now} />
        </section>
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
