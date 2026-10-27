"use client";

import * as React from "react";
import { toast } from "sonner";
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { Bookmark, BookmarkPlus, CalendarDays, ChartGantt, Check, ChevronDown, Columns3, List, Search, Trash2, X } from "lucide-react";
import type { Person, Project, Role } from "@/lib/types";
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/selectors";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Segmented, Select, Switch } from "@/components/ui/primitives";
import { QUICK_CHIPS, QUICK_LABEL, SORT_LABEL, activeFilterCount, type QuickKey, type SavedView, type SortKey, type TaskFilters, type ViewMode } from "./filters";

const STATUS_OPTIONS = ["assigned", "acknowledged", "in_progress", "blocked", "submitted", "approved", "cancelled"] as const;

export function TasksToolbar({
  role,
  meId,
  filters,
  onChange,
  onClear,
  sort,
  onSort,
  mode,
  onMode,
  assignees,
  projects,
  tags,
  chipCounts,
  resultCount,
  views,
  activeViewId,
  onApplyView,
  onSaveView,
  onRemoveView,
}: {
  role: Role;
  meId: string;
  filters: TaskFilters;
  onChange: (patch: Partial<TaskFilters>) => void;
  onClear: () => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  assignees: Person[];
  projects: Project[];
  tags: string[];
  chipCounts: Record<QuickKey, number>;
  resultCount: number;
  views: SavedView[];
  activeViewId: string | null;
  onApplyView: (v: SavedView) => void;
  onSaveView: (name: string) => void;
  onRemoveView: (id: string) => void;
}) {
  const [saveOpen, setSaveOpen] = React.useState(false);
  const active = activeFilterCount(filters);
  const builtIns = views.filter((v) => v.builtIn);
  const custom = views.filter((v) => !v.builtIn);
  const activeView = views.find((v) => v.id === activeViewId);
  // chips that only a saved view can turn on are still shown while active, so they can be removed
  const extraChips: { label: string; clear: Partial<TaskFilters> }[] = [];
  if (filters.quick === "stuck") extraChips.push({ label: QUICK_LABEL.stuck, clear: { quick: null } });
  if (filters.reviewerMe && role !== "owner") extraChips.push({ label: "Reviewed by me", clear: { reviewerMe: false } });

  return (
    <div className="space-y-3">
      {/* search + view switch */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input type="search" value={filters.q} onChange={(e) => onChange({ q: e.target.value })} placeholder="Search titles, descriptions, comments and #tags" className="pl-9" />
        </label>
        <Segmented<ViewMode>
          value={mode}
          onChange={onMode}
          className="self-start sm:self-auto"
          options={[
            {
              value: "list",
              label: (
                <>
                  <List className="size-4" /> List
                </>
              ),
            },
            {
              value: "board",
              label: (
                <>
                  <Columns3 className="size-4" /> Board
                </>
              ),
            },
            {
              value: "calendar",
              label: (
                <>
                  <CalendarDays className="size-4" /> Calendar
                </>
              ),
            },
            {
              value: "timeline",
              label: (
                <>
                  <ChartGantt className="size-4" /> Timeline
                </>
              ),
            },
          ]}
        />
      </div>

      {/* quick chips */}
      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap" role="group" aria-label="Quick filters">
          {QUICK_CHIPS.map((c) => {
            const on = filters.quick === c.key;
            const n = chipCounts[c.key];
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ quick: on ? null : c.key, reviewerMe: !on && c.key === "review" ? filters.reviewerMe : false })}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors",
                  on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-text hover:border-ink/40",
                )}
              >
                {on && <Check className="size-3.5" />}
                {c.label}
                <span className={cn("tabular text-[12px]", on ? "text-white/70" : "text-faint")}>{n}</span>
              </button>
            );
          })}
          {extraChips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => onChange(c.clear)}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-ink bg-ink-tint px-3 text-[13px] font-medium text-ink"
              aria-label={`Remove filter: ${c.label}`}
            >
              {c.label}
              <X className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* field filters: each one can take several values */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {role !== "employee" && (
          <MultiFilter
            label="Assignee"
            any="Everyone"
            value={filters.assignee}
            onChange={(v) => onChange({ assignee: v })}
            options={assignees.map((p) => ({ value: p.id, label: p.id === meId ? `${p.name} (you)` : p.name }))}
          />
        )}
        <MultiFilter
          label="Status"
          any="Any status"
          value={filters.status}
          onChange={(v) => onChange({ status: v as TaskFilters["status"] })}
          options={[...(role !== "employee" ? (["draft"] as const) : []), ...STATUS_OPTIONS].map((st) => ({ value: st, label: STATUS_LABEL[st] }))}
        />
        <MultiFilter
          label="Priority"
          any="Any priority"
          value={filters.priority}
          onChange={(v) => onChange({ priority: v as TaskFilters["priority"] })}
          options={(["urgent", "high", "normal", "low"] as const).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
        />
        <MultiFilter
          label="Project"
          any="All projects"
          value={filters.project}
          onChange={(v) => onChange({ project: v })}
          options={[...projects.map((p) => ({ value: p.id, label: p.name })), { value: "none", label: "No project" }]}
        />
        {tags.length > 0 && <MultiFilter label="Tag" any="Any tag" value={filters.tags} onChange={(v) => onChange({ tags: v })} options={tags.map((t) => ({ value: t, label: `#${t}` }))} />}
        <DueRange from={filters.from} to={filters.to} onChange={(from, to) => onChange({ from, to })} />
      </div>

      {/* result line */}
      <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px] text-muted" aria-live="polite">
          <span>
            <span className="tabular font-semibold text-text">{plural(resultCount, "task")}</span>
            {activeView ? ` in ${activeView.name}` : active ? " match" : ""}
          </span>
          {active > 0 && (
            <button type="button" onClick={onClear} className="font-medium text-ink underline-offset-4 hover:underline">
              Clear filters
            </button>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex h-9 cursor-pointer items-center gap-2 text-[13.5px] text-text">
            <Switch checked={filters.showDone} onCheckedChange={(v) => onChange({ showDone: v })} aria-label="Show done" />
            Show done
          </label>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-[13.5px] text-text">
            <Switch checked={filters.archived} onCheckedChange={(v) => onChange({ archived: v })} aria-label="Show archived" />
            Archived
          </label>
          <label className="flex items-center gap-2 text-[13.5px] text-muted">
            Sort
            <Select value={sort} onChange={(e) => onSort(e.target.value as SortKey)} className="h-9 w-auto text-[13.5px]">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </Select>
          </label>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="md" className="max-w-56">
                <Bookmark />
                <span className="truncate">{activeView ? activeView.name : "Saved views"}</span>
              </Button>
            </MenuTrigger>
            <MenuContent className="w-64">
              <MenuLabel>Ready-made</MenuLabel>
              {builtIns.map((v) => (
                <MenuItem key={v.id} onSelect={() => onApplyView(v)}>
                  <Bookmark />
                  <span className="flex-1">{v.name}</span>
                  {v.id === activeViewId && <Check className="!text-ink" />}
                </MenuItem>
              ))}
              {custom.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Saved by you</MenuLabel>
                  {custom.map((v) => (
                    <MenuItem key={v.id} onSelect={() => onApplyView(v)} className="pr-1">
                      <Bookmark />
                      <span className="min-w-0 flex-1 truncate">{v.name}</span>
                      {v.id === activeViewId && <Check className="!text-ink" />}
                      <button
                        type="button"
                        aria-label={`Delete ${v.name}`}
                        className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-faint hover:bg-surface hover:text-heat-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onRemoveView(v.id);
                          toast("View deleted", { description: v.name });
                        }}
                      >
                        <Trash2 className="!size-3.5" />
                      </button>
                    </MenuItem>
                  ))}
                </>
              )}
              <MenuSeparator />
              <MenuItem onSelect={() => setSaveOpen(true)} disabled={active === 0}>
                <BookmarkPlus /> Save current filters
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={onSaveView} />
    </div>
  );
}

/** a filter that takes several values: "Blocked" or "2 statuses" on the button, ticks in the menu */
function MultiFilter({ label, any, value, onChange, options }: { label: string; any: string; value: string[]; onChange: (v: string[]) => void; options: { value: string; label: string }[] }) {
  const picked = options.filter((o) => value.includes(o.value));
  const text = !picked.length ? any : picked.length === 1 ? picked[0].label : `${label}: ${picked.length}`;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${picked.length ? picked.map((p) => p.label).join(", ") : any}`}
          className={cn(
            "flex h-10 min-w-0 items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-left text-[13.5px] text-text hover:border-ink/35 sm:h-9 sm:min-w-36",
            picked.length > 0 && "border-ink/50 bg-ink-tint/50 font-medium",
          )}
        >
          <span className="truncate">{text}</span>
          <ChevronDown className="size-3.5 shrink-0 text-faint" />
        </button>
      </MenuTrigger>
      <MenuContent className="max-h-80 w-64 overflow-y-auto">
        <MenuLabel>{label}: pick any number</MenuLabel>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <MenuItem
              key={o.value}
              onSelect={(e) => {
                e.preventDefault(); // keep the menu open to pick more
                onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]);
              }}
              role="menuitemcheckbox"
              aria-checked={on}
            >
              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-ink bg-ink text-white" : "border-line-strong")}>
                {on && <Check className="!size-3 !text-white" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
            </MenuItem>
          );
        })}
        {value.length > 0 && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => onChange([])}>
              <X /> Clear
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** due between two days, with the common ranges one tap away */
function DueRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [custom, setCustom] = React.useState(false);
  const now = new Date();
  const presets = [
    { l: "Due today", f: iso(now), t: iso(now) },
    { l: "Due this week", f: iso(startOfWeek(now, { weekStartsOn: 1 })), t: iso(endOfWeek(now, { weekStartsOn: 1 })) },
    { l: "Due in the next 7 days", f: iso(now), t: iso(addDays(now, 7)) },
    { l: "Due this month", f: iso(startOfMonth(now)), t: iso(endOfMonth(now)) },
  ];
  const preset = presets.find((p) => p.f === from && p.t === to);
  const label = preset ? preset.l : from || to ? `Due ${from ? format(new Date(`${from}T00:00`), "d MMM") : "…"} to ${to ? format(new Date(`${to}T00:00`), "d MMM") : "…"}` : "Any due date";
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-10 min-w-0 items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-left text-[13.5px] text-text hover:border-ink/35 sm:h-9 sm:min-w-36",
              (from || to) && "border-ink/50 bg-ink-tint/50 font-medium",
            )}
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="size-3.5 shrink-0 text-faint" />
          </button>
        </MenuTrigger>
        <MenuContent className="w-60">
          {presets.map((p) => (
            <MenuItem
              key={p.l}
              onSelect={() => {
                setCustom(false);
                onChange(p.f, p.t);
              }}
            >
              <span className="flex-1">{p.l}</span>
              {preset?.l === p.l && <Check className="!text-ink" />}
            </MenuItem>
          ))}
          <MenuItem onSelect={() => setCustom(true)}>Pick dates…</MenuItem>
          {(from || to) && (
            <>
              <MenuSeparator />
              <MenuItem
                onSelect={() => {
                  setCustom(false);
                  onChange("", "");
                }}
              >
                <X /> Any due date
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      {custom && (
        <span className="col-span-2 flex items-center gap-2 text-[13px] text-muted">
          <Input type="date" aria-label="Due from" value={from} onChange={(e) => onChange(e.target.value, to)} className="h-9 w-auto" />
          to
          <Input type="date" aria-label="Due until" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className="h-9 w-auto" />
        </span>
      )}
    </>
  );
}

function SaveViewDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; onSave: (name: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SaveViewForm
          onCancel={() => onOpenChange(false)}
          onSave={(n) => {
            onSave(n);
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}

function SaveViewForm({ onCancel, onSave }: { onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = React.useState("");
  return (
    <DialogContent title="Save these filters" description="The view is kept on your account, so it shows up under Saved views on every device you use.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave(name.trim());
          toast.success("View saved", { description: name.trim() });
        }}
      >
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Urgent work in Sales" maxLength={40} />
        </Field>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save view
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
