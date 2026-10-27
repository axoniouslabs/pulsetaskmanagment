"use client";

import * as React from "react";
import type { WorkSchedule } from "@/lib/types";
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

export const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "America/New_York", "UTC"];
  }
})();

/** "UTC+05:00" for a zone, right now */
export function offsetLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
    return part?.replace("GMT", "UTC") || "UTC";
  } catch {
    return "";
  }
}

export function TimeZoneSelect({ id, value, onChange, inheritLabel }: { id?: string; value: string; onChange: (tz: string) => void; inheritLabel?: string }) {
  const zones = React.useMemo(() => Array.from(new Set([...(value ? [value] : []), ...TIME_ZONES])), [value]);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {inheritLabel !== undefined && <option value="">{inheritLabel}</option>}
      {zones.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, " ")} ({offsetLabel(tz)})
        </option>
      ))}
    </Select>
  );
}

/**
 * Days and hours, each field optional: an empty value means "same as the level
 * above" (company, or department), which is shown as the placeholder.
 */
export function WorkHoursFields({
  value,
  onChange,
  inherited,
  idPrefix,
}: {
  value: Pick<WorkSchedule, "workDays" | "workStart" | "workEnd">;
  onChange: (v: Pick<WorkSchedule, "workDays" | "workStart" | "workEnd">) => void;
  inherited: Required<Pick<WorkSchedule, "workDays" | "workStart" | "workEnd">>;
  idPrefix: string;
}) {
  const days = value.workDays ?? inherited.workDays;
  const own = !!value.workDays;
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 text-[12.5px] text-muted">
          Working days{" "}
          {own ? (
            <button type="button" className="ml-1 font-medium text-ink hover:underline" onClick={() => onChange({ ...value, workDays: undefined })}>
              Use the usual days
            </button>
          ) : (
            <span className="text-faint">(the usual days)</span>
          )}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = days.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? days.filter((x) => x !== d.n) : [...days, d.n].sort((a, b) => a - b);
                  if (!next.length) return;
                  onChange({ ...value, workDays: next });
                }}
                className={cn(
                  "h-9 min-w-11 rounded-[var(--radius-sm)] border px-2.5 text-[13px] font-medium",
                  on ? "border-ink bg-ink text-white" : "border-line-strong text-muted hover:border-ink/40",
                )}
              >
                {d.l}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-start`}>
          Starts
          <Input
            id={`${idPrefix}-start`}
            type="time"
            value={value.workStart ?? ""}
            placeholder={inherited.workStart}
            onChange={(e) => onChange({ ...value, workStart: e.target.value || undefined })}
            className="mt-1"
          />
          {!value.workStart && <span className="mt-1 block text-[11.5px] text-faint">Usual: {inherited.workStart}</span>}
        </label>
        <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-end`}>
          Ends
          <Input
            id={`${idPrefix}-end`}
            type="time"
            value={value.workEnd ?? ""}
            placeholder={inherited.workEnd}
            onChange={(e) => onChange({ ...value, workEnd: e.target.value || undefined })}
            className="mt-1"
          />
          {!value.workEnd && <span className="mt-1 block text-[11.5px] text-faint">Usual: {inherited.workEnd}</span>}
        </label>
      </div>
    </div>
  );
}
