"use client";

import * as React from "react";
import { Repeat } from "lucide-react";
import type { RepeatRule } from "@/lib/types";
import { describeRule } from "@/domain/repeat";
import { cn } from "@/lib/utils";
import { Input, Select } from "@/components/ui/primitives";

const DAYS = [
  { n: 1, l: "Mon" },
  { n: 2, l: "Tue" },
  { n: 3, l: "Wed" },
  { n: 4, l: "Thu" },
  { n: 5, l: "Fri" },
  { n: 6, l: "Sat" },
  { n: 0, l: "Sun" },
];
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Preset = "" | "workday" | "day" | "week" | "month" | "after";

const presetOf = (r: RepeatRule | null): Preset =>
  !r ? "" : r.mode === "afterDone" ? "after" : r.freq === "day" ? (r.workingDays ? "workday" : "day") : r.freq;

/**
 * How a task repeats. A plain choice covers most work ("every working day",
 * "weekly on Mon and Thu"); the details underneath set the rest: every N,
 * monthly by date or weekday, after-completion, the end, and missed copies.
 */
export function RepeatEditor({ value, onChange, due, idPrefix }: { value: RepeatRule | null; onChange: (r: RepeatRule | null) => void; due: Date; idPrefix: string }) {
  const preset = presetOf(value);
  const dow = Number.isNaN(due.getTime()) ? 1 : due.getDay();
  const dom = Number.isNaN(due.getTime()) ? 1 : due.getDate();
  const set = (patch: Partial<RepeatRule>) => value && onChange({ ...value, ...patch });

  const pick = (p: Preset) => {
    if (!p) return onChange(null);
    const keep = { ends: value?.ends, missed: value?.missed };
    if (p === "workday") onChange({ freq: "day", interval: 1, workingDays: true, mode: "schedule", ...keep });
    if (p === "day") onChange({ freq: "day", interval: 1, mode: "schedule", ...keep });
    if (p === "week") onChange({ freq: "week", interval: 1, weekdays: [dow], mode: "schedule", ...keep });
    if (p === "month") onChange({ freq: "month", interval: 1, monthly: { kind: "date", day: dom }, mode: "schedule", ...keep });
    if (p === "after") onChange({ freq: "day", interval: 1, mode: "afterDone", afterDays: 7, ends: value?.ends });
  };

  return (
    <div className="space-y-3">
      <Select id={`${idPrefix}-preset`} value={preset} onChange={(e) => pick(e.target.value as Preset)} aria-label="Repeat">
        <option value="">Doesn&apos;t repeat</option>
        <option value="workday">Every working day</option>
        <option value="day">Every day, or every few days</option>
        <option value="week">Weekly, on chosen days</option>
        <option value="month">Monthly</option>
        <option value="after">Some days after the last one is approved</option>
      </Select>

      {value && (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-line p-3.5">
          {value.mode === "schedule" && (value.freq === "day" || value.freq === "week" || value.freq === "month") && (
            <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted" htmlFor={`${idPrefix}-interval`}>
              Every
              <Input
                id={`${idPrefix}-interval`}
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={value.interval}
                onChange={(e) => set({ interval: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })}
                className="h-9 w-20"
              />
              {value.freq === "day" ? (value.workingDays ? "working days" : "days") : value.freq === "week" ? "weeks" : "months"}
            </label>
          )}

          {value.mode === "schedule" && value.freq === "week" && (
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] text-muted">On</legend>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const on = value.weekdays?.includes(d.n) ?? false;
                  return (
                    <button
                      key={d.n}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const cur = value.weekdays ?? [];
                        const next = on ? cur.filter((x) => x !== d.n) : [...cur, d.n];
                        if (next.length) set({ weekdays: next });
                      }}
                      className={cn("h-9 min-w-11 rounded-[var(--radius-sm)] border px-2.5 text-[13px] font-medium", on ? "border-ink bg-ink text-white" : "border-line-strong text-muted hover:border-ink/40")}
                    >
                      {d.l}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {value.mode === "schedule" && value.freq === "month" && (
            <Select
              id={`${idPrefix}-monthly`}
              aria-label="Which day of the month"
              value={value.monthly?.kind === "weekday" ? `w:${value.monthly.nth}` : "date"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "date") set({ monthly: { kind: "date", day: dom } });
                else set({ monthly: { kind: "weekday", nth: Number(v.slice(2)) as 1 | 2 | 3 | 4 | -1, weekday: dow } });
              }}
            >
              <option value="date">On day {value.monthly?.kind === "date" ? value.monthly.day : dom} of the month</option>
              {([1, 2, 3, 4, -1] as const).map((n) => (
                <option key={n} value={`w:${n}`}>
                  On the {n === -1 ? "last" : ["", "first", "second", "third", "fourth"][n]} {WEEKDAY[value.monthly?.kind === "weekday" ? value.monthly.weekday : dow]}
                </option>
              ))}
            </Select>
          )}

          {value.mode === "afterDone" && (
            <label className="flex flex-wrap items-center gap-2 text-[13px] text-muted" htmlFor={`${idPrefix}-after`}>
              The next one is due
              <Input
                id={`${idPrefix}-after`}
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={value.afterDays ?? 7}
                onChange={(e) => set({ afterDays: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })}
                className="h-9 w-20"
              />
              days after this one is approved. Right for maintenance and follow-ups.
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-ends`}>
              Ends
              <Select
                id={`${idPrefix}-ends`}
                value={value.ends?.kind ?? "never"}
                onChange={(e) => {
                  const k = e.target.value;
                  set({ ends: k === "count" ? { kind: "count", count: 10 } : k === "date" ? { kind: "date", date: new Date(due.getTime() + 90 * 86400000).toISOString().slice(0, 10) } : { kind: "never" } });
                }}
                className="mt-1"
              >
                <option value="never">Never</option>
                <option value="count">After a number of times</option>
                <option value="date">On a date</option>
              </Select>
            </label>
            {value.ends?.kind === "count" && (
              <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-count`}>
                How many times in all
                <Input
                  id={`${idPrefix}-count`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  value={value.ends.count}
                  onChange={(e) => set({ ends: { kind: "count", count: Math.min(1000, Math.max(1, Number(e.target.value) || 1)) } })}
                  className="mt-1"
                />
              </label>
            )}
            {value.ends?.kind === "date" && (
              <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-until`}>
                Last one on or before
                <Input id={`${idPrefix}-until`} type="date" value={value.ends.date} onChange={(e) => e.target.value && set({ ends: { kind: "date", date: e.target.value } })} className="mt-1" />
              </label>
            )}
            {value.mode === "schedule" && (
              <label className="text-[12.5px] text-muted sm:col-span-2" htmlFor={`${idPrefix}-missed`}>
                If the last one isn&apos;t done when the next is due
                <Select id={`${idPrefix}-missed`} value={value.missed ?? "pile"} onChange={(e) => set({ missed: e.target.value as "pile" | "close" })} className="mt-1">
                  <option value="pile">Keep it open too (at most 3 pile up)</option>
                  <option value="close">Close it as missed</option>
                </Select>
              </label>
            )}
          </div>
          <p className="flex items-start gap-2 text-[12.5px] text-muted">
            <Repeat className="mt-0.5 size-3.5 shrink-0" />
            {describeRule(value)}.{" "}
            {value.mode === "afterDone" ? "Nothing new appears until this one is approved." : "A new copy appears on schedule even if the last one isn't done."}
          </p>
        </div>
      )}
    </div>
  );
}
