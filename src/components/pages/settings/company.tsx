"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/primitives";
import { SettingRow, useSave } from "./parts";

const DAYS = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 0, short: "Sun", long: "Sunday" },
];

/** every zone the browser knows, with the company's current one always present */
const TIME_ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? ["Asia/Karachi"];
  } catch {
    return ["Asia/Karachi"];
  }
})();

function offsetLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

export function CompanySettings() {
  const settings = useApp((s) => s.settings);
  const addHoliday = useApp((s) => s.addHoliday);
  const removeHoliday = useApp((s) => s.removeHoliday);
  const save = useSave();

  const [name, setName] = React.useState(settings.name);
  const [prevName, setPrevName] = React.useState(settings.name);
  if (settings.name !== prevName) {
    setPrevName(settings.name);
    setName(settings.name);
  }
  const nameError = name.trim() ? null : "Enter the company name. It appears on reports and notices.";

  const [hours, setHours] = React.useState({
    start: settings.workStart,
    end: settings.workEnd,
  });
  const [prevHours, setPrevHours] = React.useState({
    start: settings.workStart,
    end: settings.workEnd,
  });
  if (settings.workStart !== prevHours.start || settings.workEnd !== prevHours.end) {
    const next = { start: settings.workStart, end: settings.workEnd };
    setPrevHours(next);
    setHours(next);
  }
  const hoursError = hours.start && hours.end && hours.end <= hours.start ? "The end time must be after the start time." : null;
  const commitHours = (next: { start: string; end: string }) => {
    setHours(next);
    if (next.start && next.end && next.end > next.start && (next.start !== settings.workStart || next.end !== settings.workEnd)) {
      save({ workStart: next.start, workEnd: next.end });
    }
  };

  const [hDate, setHDate] = React.useState("");
  const [hName, setHName] = React.useState("");
  const dup = settings.holidays.some((h) => h.date === hDate);

  const toggleDay = (n: number) => {
    const on = settings.workDays.includes(n);
    if (on && settings.workDays.length === 1) {
      toast.error("Keep at least one working day", {
        description: "Reminders only go out on working days.",
      });
      return;
    }
    save({
      workDays: on ? settings.workDays.filter((d) => d !== n) : [...settings.workDays, n].sort((a, b) => a - b),
    });
  };

  return (
    <>
      <SettingRow htmlFor="company-name" label="Company name" hint="Shown on reports, digests and printed appraisals.">
        <div className="flex w-full flex-col gap-1 sm:w-72">
          <Input
            id="company-name"
            value={name}
            aria-invalid={!!nameError}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!nameError && name.trim() !== settings.name) save({ name: name.trim() });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className={cn(nameError && "border-heat-3")}
          />
          {nameError && <p className="text-[12px] text-heat-3">{nameError}</p>}
        </div>
      </SettingRow>
      <SettingRow htmlFor="org-timezone" label="Time zone" hint="All deadlines, reminders and reports use this time zone.">
        <Select id="org-timezone" value={settings.timezone} onChange={(e) => save({ timezone: e.target.value }, "Time zone saved")} className="max-w-xs">
          {Array.from(new Set([settings.timezone, ...TIME_ZONES])).map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")} ({offsetLabel(tz)})
            </option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow label="Working days" hint="Reminders set to working hours only go out on these days.">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
          {DAYS.map((d) => {
            const on = settings.workDays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                aria-pressed={on}
                aria-label={d.long}
                onClick={() => toggleDay(d.n)}
                className={cn(
                  "h-10 w-11 rounded-[var(--radius-sm)] border text-[13px] font-medium transition-colors",
                  on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-muted hover:border-ink/40 hover:text-text",
                )}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </SettingRow>
      <SettingRow label="Working hours" hint="Quiet outside these hours unless a task is set to remind at any time.">
        <div className="flex flex-col gap-1 sm:items-end">
          <div className="flex items-center gap-2">
            <Input type="time" aria-label="Start of working hours" value={hours.start} onChange={(e) => commitHours({ ...hours, start: e.target.value })} className="tabular w-32" />
            <span className="text-[13.5px] text-muted">to</span>
            <Input
              type="time"
              aria-label="End of working hours"
              value={hours.end}
              onChange={(e) => commitHours({ ...hours, end: e.target.value })}
              className={cn("tabular w-32", hoursError && "border-heat-3")}
            />
          </div>
          {hoursError && <p className="text-[12px] text-heat-3">{hoursError}</p>}
        </div>
      </SettingRow>
      <SettingRow stacked label="Holidays" hint="No reminders go out on holidays, and deadlines that fall on one are flagged when assigning.">
        <div className="space-y-3">
          {settings.holidays.length ? (
            <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
              {settings.holidays.map((h) => (
                <li key={h.date} className="flex items-center gap-3 py-1 pl-3 pr-1">
                  <span className="tabular w-28 shrink-0 text-[13.5px] text-muted">{format(new Date(`${h.date}T00:00:00`), "EEE d MMM yyyy")}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-text">{h.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${h.name}`}
                    onClick={() => {
                      removeHoliday(h.date);
                      toast.success("Holiday removed", {
                        id: "settings-saved",
                        description: h.name,
                      });
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted">No holidays yet. Add public holidays so nobody is reminded on a day off.</p>
          )}
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!hDate || !hName.trim() || dup) return;
              addHoliday(hDate, hName.trim());
              toast.success("Holiday added", {
                id: "settings-saved",
                description: `${hName.trim()}, ${format(new Date(`${hDate}T00:00:00`), "d MMM yyyy")}`,
              });
              setHDate("");
              setHName("");
            }}
          >
            <Input type="date" aria-label="Holiday date" value={hDate} onChange={(e) => setHDate(e.target.value)} className="tabular sm:w-44" />
            <Input aria-label="Holiday name" placeholder="Name, for example Labour Day" value={hName} onChange={(e) => setHName(e.target.value)} className="sm:flex-1" />
            <Button type="submit" variant="secondary" className="h-10" disabled={!hDate || !hName.trim() || dup}>
              <Plus /> Add holiday
            </Button>
          </form>
          {dup && <p className="text-[12px] text-heat-3">There is already a holiday on that date. Remove it first to rename it.</p>}
        </div>
      </SettingRow>
    </>
  );
}
