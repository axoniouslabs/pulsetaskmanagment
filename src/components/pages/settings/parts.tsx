"use client";

import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import type { OrgSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/primitives";

/** apply a settings patch immediately and confirm quietly */
export function useSave() {
  const update = useApp((s) => s.updateSettings);
  return React.useCallback(
    (patch: Partial<OrgSettings>, message = "Saved") => {
      update(patch);
      toast.success(message, { id: "settings-saved", duration: 1600 });
    },
    [update],
  );
}

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
  tag,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tag?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 lg:scroll-mt-24">
      <div className="mb-3">
        <h2 id={`${id}-title`} className="flex flex-wrap items-center gap-2 text-[17px] font-semibold text-text">
          {title}
          {tag}
        </h2>
        {description && <p className="mt-1 max-w-[62ch] text-[13.5px] leading-snug text-muted">{description}</p>}
      </div>
      <div className={cn("rounded-[var(--radius-lg)] border border-line bg-surface", className)}>{children}</div>
    </section>
  );
}

export function SettingRow({
  label,
  hint,
  children,
  htmlFor,
  stacked,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  htmlFor?: string;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-5",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 sm:max-w-[52ch]">
        <label htmlFor={htmlFor} className="text-[14px] font-medium text-text">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>}
      </div>
      <div className={cn("shrink-0", stacked && "w-full")}>{children}</div>
    </div>
  );
}

/** number input that commits on blur or Enter, and explains how to fix a bad value */
export function NumberSetting({
  id,
  value,
  onCommit,
  min,
  max,
  suffix,
  validate,
  label,
  className,
}: {
  id?: string;
  value: number;
  onCommit: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
  validate?: (n: number) => string | null;
  label?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(String(value));
  const [prev, setPrev] = React.useState(value);
  if (value !== prev) {
    setPrev(value);
    setDraft(String(value));
  }
  const n = Number(draft);
  const error =
    draft.trim() === "" || !Number.isFinite(n) || !Number.isInteger(n)
      ? "Enter a whole number."
      : n < min
        ? `Use ${min} or more.`
        : n > max
          ? `Use ${max} or less.`
          : (validate?.(n) ?? null);
  const commit = () => {
    if (error) return;
    if (n !== value) onCommit(n);
  };
  return (
    <div className={cn("flex flex-col items-start gap-1 sm:items-end", className)}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          aria-label={label}
          aria-invalid={!!error}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className={cn("tabular w-20 text-right", error && "border-heat-3 focus:border-heat-3 focus:ring-heat-3/15")}
        />
        {suffix && <span className="text-[13.5px] text-muted">{suffix}</span>}
      </div>
      {error && (
        <p className="text-[12px] text-heat-3" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Chips<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "tabular inline-flex h-9 min-w-12 items-center justify-center rounded-full border px-3 text-[13px] font-medium transition-colors",
              on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-muted hover:border-ink/40 hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function intervalLabel(min: number) {
  if (min < 60) return `${min} minutes`;
  if (min === 60) return "hour";
  return `${min / 60} hours`;
}

export function shortInterval(min: number) {
  return min < 60 ? `${min} min` : `${min / 60}h`;
}
