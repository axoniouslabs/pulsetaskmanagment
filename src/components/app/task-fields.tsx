"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Channel, Person, ReminderRule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Checkbox, Input, Select, Switch } from "@/components/ui/primitives";

/* ---------------- tags ---------------- */
export const cleanTag = (t: string) => t.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase().slice(0, 40);

/** free tags, typed or picked from the ones already in use */
export function TagInput({ value, onChange, id }: { value: string[]; onChange: (tags: string[]) => void; id?: string }) {
  const tasks = useApp((s) => s.tasks);
  const [draft, setDraft] = React.useState("");
  const known = React.useMemo(() => Array.from(new Set(tasks.flatMap((t) => t.tags))).sort(), [tasks]);
  const add = (raw: string) => {
    const tag = cleanTag(raw);
    if (tag && !value.includes(tag) && value.length < 20) onChange([...value, tag]);
    setDraft("");
  };
  const listId = `${id ?? "tags"}-known`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2 py-1.5 focus-within:border-ink focus-within:ring-[3px] focus-within:ring-ink/12">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sunken py-0.5 pl-2.5 pr-1 text-[12.5px] text-text">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="rounded-full p-0.5 text-faint hover:bg-hover hover:text-text" aria-label={`Remove tag ${t}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          list={listId}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,\s]$/.test(v) && v.trim()) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "Add another" : "accounts, urgent-client"}
          className="h-7 min-w-28 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
        />
        <datalist id={listId}>
          {known
            .filter((t) => !value.includes(t))
            .map((t) => (
              <option key={t} value={t} />
            ))}
        </datalist>
      </div>
    </div>
  );
}

/* ---------------- watchers ---------------- */
export function WatcherPicker({
  value,
  onChange,
  exclude,
  id,
  addLabel = ["Add someone to keep in the loop", "Add another watcher"],
  removeLabel = (n: string) => `Stop ${n} watching`,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  exclude?: string[];
  id?: string;
  addLabel?: [string, string];
  removeLabel?: (name: string) => string;
}) {
  const people = useApp((s) => s.people);
  const options = people.filter((p) => p.active !== false && !value.includes(p.id) && !exclude?.includes(p.id));
  const name = (pid: string) => people.find((p) => p.id === pid)?.name ?? "Someone";
  return (
    <div className="space-y-2">
      <Select id={id} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">{value.length ? addLabel[1] : addLabel[0]}</option>
        {options.map((p: Person) => (
          <option key={p.id} value={p.id}>
            {p.name}, {p.title}
          </option>
        ))}
      </Select>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((pid) => (
            <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-sunken py-0.5 pl-2.5 pr-1 text-[12.5px]">
              {name(pid)}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== pid))}
                className="rounded-full p-0.5 text-faint hover:bg-hover hover:text-text"
                aria-label={removeLabel(name(pid))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- reminder rule ---------------- */
export const INTERVAL_CHOICES = [10, 15, 30, 60, 120, 240, 1440];
export const intervalText = (n: number) =>
  n >= 1440 && n % 1440 === 0 ? (n === 1440 ? "Daily" : `Every ${n / 1440} days`) : n >= 60 && n % 60 === 0 ? `${n / 60} hour${n > 60 ? "s" : ""}` : `${n} min`;

const CHANNELS: { v: Channel; l: string }[] = [
  { v: "push", l: "Phone & PC" },
  { v: "inapp", l: "In the app" },
  { v: "email", l: "Email digest" },
];

/**
 * Everything about how a task reminds: how often (including a custom number of
 * minutes), when, how many a day, the quiet time after it's seen, and where.
 */
export function ReminderFields({ value, onChange, idPrefix, compact }: { value: ReminderRule; onChange: (r: ReminderRule) => void; idPrefix: string; compact?: boolean }) {
  const custom = !INTERVAL_CHOICES.includes(value.intervalMin);
  const [customOpen, setCustomOpen] = React.useState(custom);
  const set = (patch: Partial<ReminderRule>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-interval`}>
          Remind every
          <Select
            id={`${idPrefix}-interval`}
            value={customOpen ? "custom" : String(value.intervalMin)}
            onChange={(e) => {
              if (e.target.value === "custom") return setCustomOpen(true);
              setCustomOpen(false);
              set({ intervalMin: Number(e.target.value) });
            }}
            className="mt-1"
          >
            {INTERVAL_CHOICES.map((n) => (
              <option key={n} value={n}>
                {intervalText(n)}
              </option>
            ))}
            <option value="custom">Custom…</option>
          </Select>
        </label>
        {customOpen && (
          <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-custom`}>
            Minutes between reminders
            <Input
              id={`${idPrefix}-custom`}
              type="number"
              inputMode="numeric"
              min={5}
              max={10080}
              value={value.intervalMin}
              onChange={(e) => set({ intervalMin: Math.min(10080, Math.max(5, Number(e.target.value) || 5)) })}
              className="mt-1"
            />
          </label>
        )}
        <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-cap`}>
          At most, per day
          <Input
            id={`${idPrefix}-cap`}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={value.dailyCap}
            onChange={(e) => set({ dailyCap: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
            className="mt-1"
          />
        </label>
        <label className="text-[12.5px] text-muted" htmlFor={`${idPrefix}-quiet`}>
          Quiet after it&apos;s seen (min)
          <Input
            id={`${idPrefix}-quiet`}
            type="number"
            inputMode="numeric"
            min={0}
            max={1440}
            value={value.quietAfterAckMin}
            onChange={(e) => set({ quietAfterAckMin: Math.min(1440, Math.max(0, Number(e.target.value) || 0)) })}
            className="mt-1"
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="sr-only">Where reminders go</legend>
          {CHANNELS.map((c) => (
            <label key={c.v} className="flex items-center gap-2 text-[13px] text-text">
              <Checkbox
                checked={value.channels.includes(c.v)}
                onCheckedChange={(on) => {
                  const next = on ? Array.from(new Set([...value.channels, c.v])) : value.channels.filter((x) => x !== c.v);
                  if (next.length) set({ channels: next });
                }}
              />
              {c.l}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2.5 text-[13px] text-text" htmlFor={`${idPrefix}-window`}>
          Working hours only
          <Switch id={`${idPrefix}-window`} checked={value.window === "working"} onCheckedChange={(on) => set({ window: on ? "working" : "always" })} />
        </label>
      </div>
    </div>
  );
}

/* ---------------- progress cadence ---------------- */
export function CadenceSelect({ value, onChange, id }: { value: number | ""; onChange: (v: number | "") => void; id?: string }) {
  return (
    <Select id={id} value={value === "" ? "" : String(value)} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}>
      <option value="">No regular updates</option>
      <option value="1">Every day</option>
      <option value="2">Every 2 days</option>
      <option value="3">Every 3 days</option>
      <option value="7">Every week</option>
      <option value="14">Every 2 weeks</option>
    </Select>
  );
}
