"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { hoursLabel, type Totals, timeSplit } from "./metrics";

export const C = {
  ink: "var(--color-ink)",
  inkSoft: "var(--color-ink-soft)",
  muted: "var(--color-faint)",
  light: "var(--color-line-strong)",
  ok: "var(--color-ok)",
  grid: "var(--color-line)",
  text: "var(--color-muted)",
};

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: C.text, fontSize: 11.5 },
} as const;

/* ---------- shared tooltip ---------- */
interface TipItem {
  name?: string | number;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
  payload?: Record<string, unknown>;
}

export function ChartTip({ active, payload, label, unit = "", labelKey }: { active?: boolean; payload?: readonly TipItem[]; label?: string | number; unit?: string; labelKey?: string }) {
  if (!active || !payload?.length) return null;
  const heading = labelKey ? String(payload[0]?.payload?.[labelKey] ?? label) : label;
  return (
    <div className="min-w-36 rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[12.5px] shadow-pop">
      <p className="mb-1 font-medium text-text">{heading}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-medium text-text">
            {typeof p.value === "number" ? Math.round(p.value * 10) / 10 : String(p.value)}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.line ? <span className="h-0.5 w-3.5 rounded-full" style={{ background: i.color }} /> : <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartPanel({
  title,
  aside,
  legend,
  children,
  footnote,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
  footnote?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:p-5 print:break-inside-avoid", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {aside && <div className="text-[13px] text-muted">{aside}</div>}
      </div>
      {legend && <div className="mt-2">{legend}</div>}
      <div className="mt-4">{children}</div>
      {footnote && <p className="mt-3 text-[12.5px] leading-snug text-muted">{footnote}</p>}
    </section>
  );
}

/* ---------- throughput ---------- */
export interface DayPoint {
  date: string;
  label: string;
  full: string;
  assigned: number;
  approved: number;
  est: number;
  actual: number;
}

export function ThroughputChart({ data }: { data: DayPoint[] }) {
  const approved = data.reduce((s, d) => s + d.approved, 0);
  const assigned = data.reduce((s, d) => s + d.assigned, 0);
  const many = data.length > 8;
  return (
    <ChartPanel
      title="Throughput per day"
      aside={`${approved} approved of ${assigned} assigned`}
      legend={
        <Legend
          items={[
            { label: "Approved", color: C.ink },
            { label: "Assigned", color: C.muted, line: true },
          ]}
        />
      }
    >
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barCategoryGap={many ? "22%" : "34%"}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} interval={many ? "preserveStartEnd" : 0} minTickGap={8} />
            <YAxis {...axisProps} allowDecimals={false} width={44} />
            <Tooltip cursor={{ fill: "var(--color-hover)" }} content={<ChartTip labelKey="full" />} />
            <Bar dataKey="approved" name="Approved" fill={C.ink} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Line
              dataKey="assigned"
              name="Assigned"
              stroke={C.muted}
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                stroke: "var(--color-surface)",
              }}
              type="monotone"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}

/* ---------- where time goes ---------- */
export function TimeSplitChart({ totals }: { totals: Totals }) {
  const { parts, total } = timeSplit(totals);
  const biggest = [...parts].sort((a, b) => b.hours - a.hours)[0];
  const advice: Record<string, string> = {
    waiting: "Most of the cycle is tasks sitting before anyone starts. Clearer priorities at assignment would help most.",
    working: "Most of the cycle is real work. Queues and reviews are not slowing the team down.",
    review: "Most of the cycle is finished work waiting for a reviewer. Faster reviews would shorten delivery more than faster work.",
    blocked: "Most of the cycle is spent blocked. Clearing blockers is the quickest win.",
  };
  return (
    <ChartPanel
      title="Where time goes"
      aside={total ? `About ${hoursLabel(total)} per task, assigned to approved` : undefined}
      footnote={<>Measured on each approved task: assignment to start, start to submission, time blocked, and time waiting for review.</>}
    >
      {total ? (
        <>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-sunken" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.hours / total) * 100)}%`).join(", ")}>
            {parts.map((p) => (p.hours > 0 ? <span key={p.key} style={{ flex: p.hours, background: p.color }} /> : null))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {parts.map((p) => (
              <div key={p.key}>
                <dt className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
                  {p.label}
                </dt>
                <dd className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="tabular font-display text-[19px] font-semibold leading-none text-text">{hoursLabel(p.hours)}</span>
                  <span className="tabular text-[12.5px] text-faint">{Math.round((p.hours / total) * 100)}%</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13.5px] leading-snug text-text">{advice[biggest.key]}</p>
        </>
      ) : (
        <p className="py-6 text-center text-[13.5px] text-muted">No finished work in this period yet.</p>
      )}
    </ChartPanel>
  );
}

/* ---------- estimate vs actual ---------- */
export function EstimateChart({ data, unitLabel }: { data: { label: string; full: string; est: number; actual: number }[]; unitLabel: string }) {
  const est = data.reduce((s, d) => s + d.est, 0);
  const actual = data.reduce((s, d) => s + d.actual, 0);
  const over = est ? Math.round(((actual - est) / est) * 100) : 0;
  return (
    <ChartPanel
      title="Estimate vs actual hours"
      aside={`Per ${unitLabel}`}
      legend={
        <Legend
          items={[
            { label: "Estimated", color: C.light },
            { label: "Actual", color: C.ink },
          ]}
        />
      }
      footnote={
        est ? (
          <>
            Work took{" "}
            <span className="font-medium text-text">
              {Math.abs(over)}% {over >= 0 ? "longer" : "less"}
            </span>{" "}
            than estimated ({Math.round(actual)}h logged against {Math.round(est)}h planned).
            {over > 20 ? " Estimates are optimistic; plan bigger tasks with more room." : ""}
          </>
        ) : undefined
      }
    >
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} interval={0} minTickGap={4} />
            <YAxis {...axisProps} width={44} />
            <Tooltip cursor={{ fill: "var(--color-hover)" }} content={<ChartTip unit="h" labelKey="full" />} />
            <Bar dataKey="est" name="Estimated" fill={C.light} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="actual" name="Actual" fill={C.ink} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}

/* ---------- departments ---------- */
export function DepartmentChart({ data, format, domainMax }: { data: { name: string; value: number | null }[]; format: (v: number | null) => string; domainMax?: number }) {
  const rows = data.map((d) => ({
    name: d.name,
    value: d.value ?? 0,
    label: format(d.value),
  }));
  return (
    <div style={{ height: Math.max(140, rows.length * 44 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" {...axisProps} domain={[0, domainMax ?? "auto"]} hide />
          <YAxis type="category" dataKey="name" {...axisProps} width={92} tick={{ fill: "var(--color-text)", fontSize: 13 }} />
          <Tooltip
            cursor={{ fill: "var(--color-hover)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[12.5px] shadow-pop">
                  <p className="font-medium text-text">{String(payload[0].payload.name)}</p>
                  <p className="tabular text-muted">{String(payload[0].payload.label)}</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" fill={C.ink} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="label" position="right" fill="var(--color-text)" fontSize={12.5} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
