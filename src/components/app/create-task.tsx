"use client";

import * as React from "react";
import { addDays, endOfWeek, format, set as setTime } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, FileCheck2, Sparkles, ChevronDown } from "lucide-react";
import { membersOf, useApp, useMeId } from "@/lib/store";
import type { Priority, RepeatRule } from "@/lib/types";
import { ruleOf } from "@/domain/repeat";
import { RepeatEditor } from "./repeat-editor";
import { approvalOptional } from "@/domain/world";
import { committedHours, scopePeople } from "@/lib/selectors";
import { parseQuickAdd } from "@/lib/quickadd";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Dialog, DialogContent, Field, Input, Segmented, Select, Switch, Textarea, Bar } from "@/components/ui/primitives";
import { Avatar } from "./avatar";
import { CadenceSelect, ReminderFields, TagInput, WatcherPicker } from "./task-fields";
import { ACCEPT, uploadToTask } from "@/lib/upload";

const INTERVALS = [
  { v: 10, l: "10 min" },
  { v: 15, l: "15 min" },
  { v: 30, l: "30 min" },
  { v: 60, l: "1 hour" },
  { v: 120, l: "2 hours" },
  { v: 1440, l: "Daily" },
];

const toLocal = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
const hoursUntil = (local: string) => Math.max(1, Math.round((new Date(local).getTime() - Date.now()) / 3600000));
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600000);
const newTemplateId = () => `tpl_${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`;

export function CreateTaskDialog() {
  const open = useApp((s) => s.createOpen);
  const close = useApp((s) => s.closeCreate);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {open && <CreateTaskForm />}
    </Dialog>
  );
}

/** how often a new task reminds, by priority, starting from the company default */
function useIntervalFor() {
  const base = useApp((s) => s.settings.defaultReminder.intervalMin);
  return (p: Priority) => (p === "urgent" ? 10 : p === "high" ? Math.min(base, 15) : p === "low" ? Math.max(base, 60) : base);
}

function CreateTaskForm() {
  const intervalFor = useIntervalFor();
  const s = useApp();
  const meId = useMeId();
  const defaults = s.createDefaults;
  const scope = React.useMemo(
    () => (s.role === "employee" ? s.people.filter((p) => p.id === meId) : scopePeople(s, s.role, meId).filter((p) => p.role !== "owner")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.role, meId, s.people],
  );

  // a duplicate fills the fields directly; a typed title from search goes through quick add
  const [quick, setQuick] = React.useState(defaults?.subtasks ? "" : (defaults?.title ?? ""));
  const [title, setTitle] = React.useState(defaults?.title ?? "");
  const [description, setDescription] = React.useState(defaults?.description ?? "");
  const [showMore, setShowMore] = React.useState(!!(defaults?.description || defaults?.subtasks?.length || defaults?.tags?.length || defaults?.watcherIds?.length));
  const [assigneeId, setAssigneeId] = React.useState(defaults?.assigneeId ?? (s.role === "employee" ? meId : ""));
  const [due, setDue] = React.useState(
    toLocal(setTime(new Date(), { hours: 17, minutes: 0 }) < new Date() ? setTime(addDays(new Date(), 1), { hours: 17, minutes: 0 }) : setTime(new Date(), { hours: 17, minutes: 0 })),
  );
  const [priority, setPriority] = React.useState<Priority>(defaults?.priority ?? "normal");
  // review can be skipped only for low-priority work, by the owner or managers the owner allows (spec §10)
  const canSkipReview = !s.settings.approvalByDefault || approvalOptional(s, meId, priority);
  const [interval, setIntervalMin] = React.useState(defaults?.reminder?.intervalMin ?? s.settings.defaultReminder.intervalMin);
  const [workingOnly, setWorkingOnly] = React.useState((defaults?.reminder?.window ?? "working") === "working");
  const [dailyCap, setDailyCap] = React.useState(defaults?.reminder?.dailyCap ?? s.settings.defaultReminder.dailyCap);
  const [quietAfter, setQuietAfter] = React.useState(defaults?.reminder?.quietAfterAckMin ?? s.settings.defaultReminder.quietAfterAckMin);
  const [channels, setChannels] = React.useState(defaults?.reminder?.channels ?? s.settings.defaultReminder.channels);
  const [tags, setTags] = React.useState<string[]>(defaults?.tags ?? []);
  const [watchers, setWatchers] = React.useState<string[]>(defaults?.watcherIds ?? []);
  const [reviewerId, setReviewerId] = React.useState("");
  const [allDay, setAllDay] = React.useState(false);
  const [cadence, setCadence] = React.useState<number | "">(defaults?.updateEveryDays ?? "");
  const [files, setFiles] = React.useState<File[]>([]);
  const [approval, setApproval] = React.useState(defaults?.requiresApproval ?? s.settings.approvalByDefault);
  const [proof, setProof] = React.useState(!!defaults?.requiresProof);
  const [result, setResult] = React.useState(!!defaults?.requiresResult);
  const [checklist, setChecklist] = React.useState((defaults?.subtasks ?? []).join("\n"));
  const [projectId, setProjectId] = React.useState(defaults?.projectId ?? "");
  const [estimate, setEstimate] = React.useState(String(defaults?.estimateHours ?? 1));
  const [startAt, setStartAt] = React.useState("");
  const [repeat, setRepeat] = React.useState<RepeatRule | null>(
    () => defaults?.repeat ?? (defaults?.recurrence ? (ruleOf({ recurrence: defaults.recurrence, dueAt: new Date().toISOString() }) ?? null) : null),
  );
  const [touched, setTouched] = React.useState(false);
  const [mode, setMode] = React.useState<"one" | "many" | "unit">("one");
  const [many, setMany] = React.useState<string[]>([]);
  const [unit, setUnit] = React.useState("");
  const [unitMode, setUnitMode] = React.useState<"claim" | "roundrobin" | "route" | "everyone">("claim");
  const approvalTouched = React.useRef(false);
  const [deps, setDeps] = React.useState<string[]>([]);
  const [tplName, setTplName] = React.useState<string | null>(null);
  const parsed = React.useMemo(() => (quick.trim() ? parseQuickAdd(quick, scope) : null), [quick, scope]);

  // teams and groups this person may offer work to
  const units = React.useMemo(() => {
    if (s.role === "employee") return [];
    const mine = (leadId: string, depId: string) => s.role === "owner" || leadId === meId || s.departments.some((d) => d.id === depId && d.headId === meId);
    return [
      ...s.departments
        .filter((d) => s.role === "owner" || d.headId === meId)
        .map((d) => ({
          key: `department:${d.id}`,
          label: `${d.name} department`,
          holder: d.headId,
        })),
      ...s.teams
        .filter((t) => mine(t.leadId, t.departmentId))
        .map((t) => ({
          key: `team:${t.id}`,
          label: `${t.name} team`,
          holder: t.leadId,
        })),
      ...s.groups
        .filter((g) => s.role === "owner" || g.ownerId === meId)
        .map((g) => ({
          key: `group:${g.id}`,
          label: `${g.name} (group)`,
          holder: g.ownerId,
        })),
    ];
  }, [s.role, s.teams, s.groups, s.departments, meId]);
  const unitMembers = (key: string) => {
    const [unitType, unitId] = key.split(":");
    return membersOf(s, unitType, unitId)
      .map((id) => s.people.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.active !== false && p.role !== "owner");
  };
  // a department's own rules become the defaults for work given to its people
  const pickAssignee = (id: string) => {
    setAssigneeId(id);
    const dep = s.departments.find((d) => d.id === s.people.find((p) => p.id === id)?.departmentId)?.settings;
    if (!approvalTouched.current) setApproval(dep?.approvalByDefault ?? s.settings.approvalByDefault);
    if (dep?.defaultReminder?.intervalMin && priority !== "urgent") setIntervalMin(dep.defaultReminder.intervalMin);
  };
  // rule-based assignment: a project can say who its tasks go to
  const pickProject = (id: string) => {
    setProjectId(id);
    const rule = s.projects.find((p) => p.id === id)?.defaultAssigneeId;
    if (rule && mode === "one" && scope.some((p) => p.id === rule)) {
      pickAssignee(rule);
      toast(`${s.people.find((p) => p.id === rule)?.name.split(" ")[0]} picked`, { description: "Tasks in this project go to them by default. You can still pick someone else." });
    }
  };
  const openTasks = React.useMemo(() => s.tasks.filter((t) => ["assigned", "acknowledged", "in_progress", "blocked", "submitted"].includes(t.status)).slice(0, 200), [s.tasks]);

  const applyTemplate = (id: string) => {
    const tpl = s.templates.find((t) => t.id === id);
    if (!tpl) return;
    const i = tpl.input;
    setTitle(i.title);
    setQuick("");
    setDescription(i.description ?? "");
    setPriority(i.priority);
    setEstimate(String(i.estimateHours ?? 1));
    setApproval(i.requiresApproval ?? s.settings.approvalByDefault);
    setProof(!!i.requiresProof);
    setResult(!!i.requiresResult);
    if (i.reminder?.intervalMin) setIntervalMin(i.reminder.intervalMin);
    if (i.reminder?.window) setWorkingOnly(i.reminder.window === "working");
    setChecklist((i.subtasks ?? []).join("\n"));
    setProjectId(i.projectId ?? "");
    setRepeat(i.repeat ?? (i.recurrence ? (ruleOf({ recurrence: i.recurrence, dueAt: new Date().toISOString() }) ?? null) : null));
    if (i.dueInHours) setDue(toLocal(hoursFromNow(i.dueInHours)));
    if (i.description || i.subtasks?.length || i.recurrence || i.projectId) setShowMore(true);
    toast.success(`Filled from "${tpl.name}"`, {
      description: "Pick who owns it and check the deadline.",
    });
  };

  const templateInput = () => ({
    title: title.trim(),
    description: description.trim() || undefined,
    priority,
    estimateHours: Number(estimate) || 1,
    projectId: projectId || undefined,
    requiresApproval: approval,
    requiresProof: proof,
    requiresResult: result,
    reminder: {
      intervalMin: interval,
      window: workingOnly ? ("working" as const) : ("always" as const),
    },
    subtasks: checklist
      .split(/\n|,/)
      .map((x) => x.trim())
      .filter(Boolean),
    tags: parsed?.tags ?? [],
    repeat: repeat ?? undefined,
    dueInHours: hoursUntil(due),
  });

  const saveTemplate = () => {
    const name = (tplName ?? "").trim();
    if (!name || !title.trim()) return toast.error(!title.trim() ? "Add a title first." : "Give the template a name.");
    const r = s.dispatch({
      type: "saveTemplate",
      id: newTemplateId(),
      name,
      input: templateInput(),
    });
    if (!r.ok) return toast.error(r.error);
    setTplName(null);
    toast.success("Template saved", {
      description: `"${name}" is ready in New task.`,
    });
  };

  const onQuick = (v: string) => {
    setQuick(v);
    const p = v.trim() ? parseQuickAdd(v, scope) : null;
    if (!p) return;
    setTitle(p.title);
    if (p.assigneeId && scope.some((x) => x.id === p.assigneeId)) setAssigneeId(p.assigneeId);
    if (p.dueAt) setDue(toLocal(p.dueAt));
    if (p.priority) setPriority(p.priority);
    if (p.priority) setIntervalMin(intervalFor(p.priority));
  };

  const loads = React.useMemo(() => Object.fromEntries(scope.map((p) => [p.id, committedHours(s.tasks, p.id)])), [scope, s.tasks]);
  const selected = scope.find((p) => p.id === assigneeId);
  const over = selected ? loads[selected.id] + Number(estimate || 0) > selected.capacityHours : false;

  const dueDate = new Date(due);
  const dueBad = !due || Number.isNaN(dueDate.getTime());
  const startDate = startAt ? new Date(startAt) : null;
  const startBad = !!startAt && (Number.isNaN(startDate!.getTime()) || (!dueBad && startDate! >= dueDate));
  const submit = (draft: boolean) => {
    setTouched(true);
    if (!title.trim() || dueBad || startBad) return;
    const base = {
      title,
      description,
      priority,
      dueAt: dueDate.toISOString(),
      startAt: startDate ? startDate.toISOString() : undefined,
      estimateHours: Number(estimate) || 1,
      projectId: projectId || undefined,
      requiresApproval: approval || !canSkipReview,
      requiresProof: proof,
      requiresResult: result,
      reminder: {
        intervalMin: interval,
        window: workingOnly ? ("working" as const) : ("always" as const),
        dailyCap,
        quietAfterAckMin: quietAfter,
        channels,
      },
      subtasks: checklist
        .split(/\n|,/)
        .map((x) => x.trim())
        .filter(Boolean),
      tags: Array.from(new Set([...(parsed?.tags ?? []), ...tags])),
      repeat: repeat ?? undefined,
      dependsOn: deps.length ? deps : undefined,
      watcherIds: watchers.length ? watchers : undefined,
      reviewerId: reviewerId || undefined,
      dueAllDay: allDay || undefined,
      updateEveryDays: cadence === "" ? undefined : cadence,
      draft,
    };
    // files picked while creating go up once the task exists
    const attach = (ids: string[]) => {
      if (!files.length || !ids.length) return;
      const list = files;
      void (async () => {
        for (const id of ids)
          for (const f of list) {
            const r = await uploadToTask(id, f);
            if (!r.ok) toast.error(`${f.name}: ${r.error}`);
          }
      })();
    };
    if (mode === "many") {
      if (!many.length) return;
      const ids = many.map((pid) => s.createTask({ ...base, assigneeId: pid })).filter(Boolean);
      attach(ids);
      s.closeCreate();
      toast.success(`Assigned to ${ids.length} ${ids.length === 1 ? "person" : "people"}`, {
        description: "Each person has their own copy and their own reminders.",
      });
      return;
    }
    if (mode === "unit") {
      const u = units.find((x) => x.key === unit);
      if (!u) return;
      const [unitType, unitId] = u.key.split(":") as ["department" | "team" | "group", string];
      if (unitMode === "everyone") {
        // broadcast: everyone in the unit gets their own copy, tracked on its own
        const members = unitMembers(u.key).filter((p) => !p.onLeave);
        if (!members.length) return toast.error(`Nobody in ${u.label} is available.`);
        const ids = members.map((p) => s.createTask({ ...base, assigneeId: p.id, tags: [...(base.tags ?? []), u.label.replace(/ \(group\)| team| department/g, "")] })).filter(Boolean);
        if (!ids.length) return;
        attach(ids);
        s.closeCreate();
        toast.success(`${ids.length} copies sent to ${u.label}`, { description: "Each person has their own copy, reminders and review." });
        return;
      }
      if (unitMode === "claim") {
        const id = s.createTask({ ...base, assigneeId: u.holder, claim: { unitType, unitId } });
        if (!id) return;
        attach([id]);
        s.closeCreate();
        toast.success(`Offered to ${u.label}`, {
          description: "Everyone in it is told. The first to claim it owns it.",
          action: { label: "Open", onClick: () => s.openTask(id) },
        });
        return;
      }
      const id = s.createTask({ ...base, assigneeId: "", pool: { unitType, unitId, mode: unitMode } });
      if (!id) return;
      attach([id]);
      s.closeCreate();
      const got = useApp.getState().tasks.find((t) => t.id === id);
      const who = s.people.find((p) => p.id === got?.assigneeId)?.name.split(" ")[0] ?? "the next person";
      toast.success(unitMode === "route" ? `Sent to ${who} to pass on` : `${who}'s turn: assigned to them`, {
        description: unitMode === "route" ? `${who} runs ${u.label} and picks who does it.` : `Work from ${u.label} goes round in turns.`,
        action: { label: "Open", onClick: () => s.openTask(id) },
      });
      return;
    }
    if (!assigneeId) return;
    const id = s.createTask({ ...base, assigneeId });
    if (!id) return;
    attach([id]);
    s.closeCreate();
    const who = s.people.find((p) => p.id === assigneeId)!;
    toast.success(draft ? "Saved as draft" : who.id === meId ? "Task added" : `Assigned to ${who.name.split(" ")[0]}`, {
      description: draft
        ? "Publish it when you're ready."
        : who.id === meId
          ? undefined
          : `First reminder goes out now, then every ${INTERVALS.find((i) => i.v === interval)?.l ?? `${interval} min`}.`,
      action: { label: "Open", onClick: () => s.openTask(id) },
    });
  };

  const dueChips = [
    { l: "Today 5 PM", d: setTime(new Date(), { hours: 17, minutes: 0 }) },
    {
      l: "Tomorrow noon",
      d: setTime(addDays(new Date(), 1), { hours: 12, minutes: 0 }),
    },
    {
      l: "End of week",
      d: setTime(endOfWeek(new Date(), { weekStartsOn: 1 }), {
        hours: 17,
        minutes: 0,
      }),
    },
  ];

  return (
    <DialogContent title="New task" description="One person owns it. Pulse reminds them until they respond." wide>
      <div className="space-y-5">
        {s.templates.length > 0 && (
          <Field label="Start from a template">
            <Select defaultValue="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
              <option value="">Blank task</option>
              {s.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {/* quick add */}
        <div className="rounded-[var(--radius-md)] bg-ink-tint/60 p-3">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink" htmlFor="quick">
            <Sparkles className="size-3.5" /> Type it the way you'd say it
          </label>
          <Input id="quick" autoFocus value={quick} onChange={(e) => onQuick(e.target.value)} placeholder="Send invoice to Mariam tomorrow 5pm !high" className="mt-2 border-ink/20 bg-surface" />
          {parsed && (parsed.assigneeId || parsed.dueAt || parsed.priority || parsed.tags.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
              {parsed.assigneeId && <Chip>For {s.people.find((p) => p.id === parsed.assigneeId)?.name.split(" ")[0]}</Chip>}
              {parsed.dueAt && <Chip>Due {format(parsed.dueAt, "EEE h:mm a")}</Chip>}
              {parsed.priority && <Chip>{parsed.priority[0].toUpperCase() + parsed.priority.slice(1)} priority</Chip>}
              {parsed.tags.map((t) => (
                <Chip key={t}>#{t}</Chip>
              ))}
            </div>
          )}
        </div>

        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" aria-invalid={touched && !title.trim()} />
          {touched && !title.trim() && <p className="text-[12.5px] text-heat-3">Add a title so the assignee knows what to do.</p>}
        </Field>

        {s.role !== "employee" && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[{ value: "one", label: "One person" }, { value: "many", label: "Several people" }, ...(units.length ? [{ value: "unit" as const, label: "A team or unit" }] : [])]}
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
          />
        )}

        {mode === "many" && (
          <Field label="Who gets a copy?" hint="Each person gets their own task, reminders and review.">
            <div className="thin-scrollbar grid max-h-[232px] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {scope.map((p) => {
                const on = many.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setMany((m) => (on ? m.filter((x) => x !== p.id) : [...m, p.id]))}
                    className={cn("flex items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left", on ? "border-ink bg-ink-tint" : "border-line hover:border-ink/30")}
                    aria-pressed={on}
                  >
                    <Avatar person={p} size="md" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{p.name}</span>
                    {on && <CheckCircle2 className="size-4 text-ink" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 text-[12.5px]">
              <button type="button" className="font-medium text-ink" onClick={() => setMany(scope.filter((p) => !p.onLeave).map((p) => p.id))}>
                Everyone available
              </button>
              <button type="button" className="text-muted" onClick={() => setMany([])}>
                Clear
              </button>
              <span className="ml-auto text-muted">{many.length} selected</span>
            </div>
            {touched && !many.length && <p className="text-[12.5px] text-heat-3">Pick at least one person.</p>}
          </Field>
        )}

        {mode === "unit" && (
          <div className="space-y-4">
            <Field label="Which unit">
              <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">Pick a department, team or group</option>
                {units.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </Select>
              {touched && !unit && <p className="text-[12.5px] text-heat-3">Pick a department, team or group.</p>}
            </Field>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-text">How it reaches someone</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { v: "claim", l: "First to claim it", d: "Everyone is told. Whoever claims it first owns it. Use for a support queue or new leads." },
                    { v: "roundrobin", l: "Take turns", d: "Pulse gives it to the next available person in turn, so the load spreads evenly." },
                    { v: "route", l: "Head decides", d: "It goes to whoever runs the unit, who picks the right person." },
                    { v: "everyone", l: "Everyone does it", d: "Each person gets their own copy, tracked separately. Use for policy sign-offs." },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.v}
                    className={cn("flex cursor-pointer gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5", unitMode === o.v ? "border-ink bg-ink-tint" : "border-line hover:border-ink/30")}
                  >
                    <input type="radio" name="unit-mode" value={o.v} checked={unitMode === o.v} onChange={() => setUnitMode(o.v)} className="mt-1 accent-[var(--color-ink)]" />
                    <span>
                      <span className="block text-[13.5px] font-medium">{o.l}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>
              {unit && unitMode === "everyone" && <p className="mt-2 text-[12.5px] text-muted">{plural(unitMembers(unit).filter((p) => !p.onLeave).length, "copy", "copies")} will be made.</p>}
            </fieldset>
          </div>
        )}

        {/* assignee with load */}
        {mode === "one" && (
          <Field label="Who owns it?" hint={s.role !== "employee" ? "Today's committed hours are shown so nobody gets an impossible day." : undefined}>
            <div className="thin-scrollbar grid max-h-[232px] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {scope.map((p) => {
                const load = loads[p.id] ?? 0;
                const pctLoad = load / p.capacityHours;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickAssignee(p.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
                      assigneeId === p.id ? "border-ink bg-ink-tint" : "border-line hover:border-ink/30",
                    )}
                  >
                    <Avatar person={p} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13.5px] font-medium">{p.name}</span>
                        <span className={cn("tabular text-[11.5px]", pctLoad > 1 ? "font-semibold text-heat-3" : "text-faint")}>
                          {p.onLeave ? "On leave" : `${load.toFixed(1)}/${p.capacityHours}h`}
                        </span>
                      </span>
                      {!p.onLeave && <Bar value={load} max={p.capacityHours} tone={pctLoad > 1 ? "heat-3" : pctLoad > 0.8 ? "heat-1" : "ink"} className="mt-1.5 h-1" />}
                      {p.onLeave && <span className="mt-0.5 block text-[11.5px] text-muted">Goes to {s.people.find((x) => x.id === p.backupId)?.name.split(" ")[0] ?? "their manager"} instead</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {touched && !assigneeId && <p className="text-[12.5px] text-heat-3">Pick one person. A task owned by a group is owned by nobody.</p>}
            {over && selected && (
              <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-heat-1-tint px-3 py-2 text-[13px] text-text">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-heat-1" />
                {selected.name.split(" ")[0]} already has {loads[selected.id].toFixed(1)} of {selected.capacityHours} hours today. You can still assign it, or pick someone with more room.
              </p>
            )}
          </Field>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Deadline">
            <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-invalid={touched && dueBad} />
            {touched && dueBad && <p className="text-[12.5px] text-heat-3">Pick a date and time for the deadline.</p>}
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              <Checkbox checked={allDay} onCheckedChange={(v) => setAllDay(!!v)} />
              No set time: due by the end of their working day
            </label>
            <div className="flex flex-wrap gap-1.5">
              {dueChips.map((c) => (
                <button key={c.l} type="button" onClick={() => setDue(toLocal(c.d))} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted hover:border-ink/40 hover:text-text">
                  {c.l}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Start date (optional)" hint="Keeps it off their My day until then. Reminders start from this date too.">
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-invalid={touched && startBad} />
            {touched && startBad && <p className="text-[12.5px] text-heat-3">The start has to be before the deadline.</p>}
          </Field>
          <Field label="Priority" hint="Urgent tasks remind more often by default." className="sm:col-span-2">
            <Segmented
              value={priority}
              onChange={(v) => {
                setPriority(v);
                // priority sets how hard the reminders push (spec §6); the interval can still be changed
                setIntervalMin(intervalFor(v));
              }}
              options={[
                { value: "low", label: "Low" },
                { value: "normal", label: "Normal" },
                { value: "high", label: "High" },
                { value: "urgent", label: "Urgent" },
              ]}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
            />
          </Field>
        </div>

        {/* reminder rule: managers set it; an employee's own task follows the company's rule (spec §17) */}
        {s.role === "employee" ? (
          <p className="rounded-[var(--radius-md)] border border-line px-4 py-3 text-[13px] text-muted">Reminders follow your company&apos;s usual rule for this kind of task.</p>
        ) : (
          <div className="rounded-[var(--radius-md)] border border-line p-4">
            <p className="text-[13px] font-medium">Remind {selected ? selected.name.split(" ")[0] : "them"} every</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {INTERVALS.map((i) => (
                <button
                  key={i.v}
                  type="button"
                  onClick={() => setIntervalMin(i.v)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-[13px] transition-colors",
                    interval === i.v ? "border-ink bg-ink text-white" : "border-line text-muted hover:border-ink/40 hover:text-text",
                  )}
                >
                  {i.l}
                </button>
              ))}
            </div>
            <label className="mt-3.5 flex items-center justify-between gap-3 text-[13.5px]">
              <span>
                Only during working hours
                <span className="block text-[12px] text-muted">Their own hours, skipping days off, holidays and leave</span>
              </span>
              <Switch checked={workingOnly} onCheckedChange={setWorkingOnly} />
            </label>
            <details className="mt-3 border-t border-line pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-ink">More reminder options: custom time, daily limit, where they go</summary>
              <div className="mt-3">
                <ReminderFields
                  idPrefix="new-rem"
                  value={{ intervalMin: interval, window: workingOnly ? "working" : "always", dailyCap, quietAfterAckMin: quietAfter, channels }}
                  onChange={(r) => {
                    setIntervalMin(r.intervalMin);
                    setWorkingOnly(r.window === "working");
                    setDailyCap(r.dailyCap);
                    setQuietAfter(r.quietAfterAckMin);
                    setChannels(r.channels);
                  }}
                />
              </div>
            </details>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle
            icon={CheckCircle2}
            label="Needs approval"
            sub={canSkipReview ? "A reviewer closes it" : priority === "low" ? "Always reviewed: ask the owner to allow skipping" : "Always reviewed at this priority"}
            checked={approval || !canSkipReview}
            disabled={!canSkipReview}
            onChange={(v) => {
              approvalTouched.current = true;
              setApproval(v);
            }}
          />
          <Toggle icon={Camera} label="Proof photo" sub="Can't submit without one" checked={proof} onChange={setProof} />
          <Toggle icon={FileCheck2} label="Result report" sub="Send a result at the deadline" checked={result} onChange={setResult} />
        </div>

        <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} />
          {showMore ? "Fewer options" : "Instructions, files, checklist, tags, watchers, project, repeat"}
        </button>

        {showMore && (
          <div className="space-y-4">
            <Field label="Instructions">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything they need to know to do it right the first time" />
            </Field>
            <Field label="Files" htmlFor="new-files" hint="Attached as soon as the task is created.">
              <input
                id="new-files"
                type="file"
                multiple
                accept={ACCEPT}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  setFiles((cur) => [...cur, ...picked].slice(0, 10));
                }}
                className="block w-full text-[13px] text-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-text"
              />
              {files.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                        className="rounded-full bg-sunken px-2.5 py-1 text-[12px] hover:bg-heat-3-tint"
                        aria-label={`Remove ${f.name}`}
                      >
                        {f.name} ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
            <Field label="Checklist" hint="One step per line.">
              <Textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={"Collect cheque\nTake photo of cheque\nDeposit at HBL"} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Project">
                <Select value={projectId} onChange={(e) => pickProject(e.target.value)}>
                  <option value="">None</option>
                  {s.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Estimate (hours)">
                <Input type="number" min="0.25" step="0.25" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
              </Field>
            </div>
            <Field label="Repeat" htmlFor="new-repeat-preset">
              <RepeatEditor idPrefix="new-repeat" value={repeat} onChange={setRepeat} due={dueDate} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tags" htmlFor="new-tags">
                <TagInput id="new-tags" value={tags} onChange={setTags} />
              </Field>
              <Field label="Watchers" htmlFor="new-watchers" hint="They see every update without being responsible.">
                <WatcherPicker id="new-watchers" value={watchers} onChange={setWatchers} exclude={mode === "one" && assigneeId ? [assigneeId] : []} />
              </Field>
              {s.role !== "employee" && (
                <Field label="Reviewer" htmlFor="new-reviewer" hint="Who approves the work. Usually you.">
                  <Select id="new-reviewer" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
                    <option value="">Me</option>
                    {s.people
                      .filter((p) => p.active !== false && p.id !== meId && p.id !== assigneeId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}, {p.title}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
              <Field label="Ask for progress updates" htmlFor="new-cadence" hint="For long work: they're reminded to post where it stands.">
                <CadenceSelect id="new-cadence" value={cadence} onChange={setCadence} />
              </Field>
            </div>
            <Field label="Waits for" hint="It can be acknowledged now but not started until these are done. The owner is told when it's ready.">
              <Select value="" onChange={(e) => e.target.value && setDeps((d) => Array.from(new Set([...d, e.target.value])))}>
                <option value="">Add a task it waits for</option>
                {openTasks
                  .filter((t) => !deps.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({s.people.find((p) => p.id === t.assigneeId)?.name.split(" ")[0] ?? "unassigned"})
                    </option>
                  ))}
              </Select>
              {deps.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {deps.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDeps((x) => x.filter((y) => y !== d))}
                      className="rounded-full bg-sunken px-2.5 py-1 text-[12px] text-text hover:bg-heat-3-tint"
                      aria-label={`Stop waiting for ${s.tasks.find((t) => t.id === d)?.title ?? "this task"}`}
                    >
                      {s.tasks.find((t) => t.id === d)?.title} ×
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </div>
        )}
      </div>

      <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 mt-6 flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 pb-5 pt-4 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-6">
        {s.role !== "employee" ? (
          tplName !== null ? (
            <div className="flex items-center gap-2">
              <Input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" className="h-9 w-44" onKeyDown={(e) => e.key === "Enter" && saveTemplate()} />
              <Button size="sm" variant="secondary" onClick={saveTemplate}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTplName(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              {mode === "one" && (
                <Button variant="ghost" onClick={() => submit(true)}>
                  Save as draft
                </Button>
              )}
              <Button variant="ghost" onClick={() => setTplName(title.trim())}>
                Save as template
              </Button>
            </div>
          )
        ) : (
          <span />
        )}
        <Button variant="primary" size="lg" onClick={() => submit(false)}>
          {s.role === "employee"
            ? "Add task"
            : mode === "many"
              ? `Assign to ${many.length || ""} ${many.length === 1 ? "person" : "people"}`.replace("  ", " ")
              : mode === "unit"
                ? unitMode === "claim"
                  ? "Offer to the unit"
                  : unitMode === "roundrobin"
                    ? "Give to the next in turn"
                    : unitMode === "route"
                      ? "Send to the head"
                      : "Send everyone a copy"
                : "Assign task"}
        </Button>
      </div>
    </DialogContent>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-ink ring-1 ring-ink/15">{children}</span>;
}

function Toggle({
  icon: Icon,
  label,
  sub,
  checked,
  onChange,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius-md)] border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70",
        checked ? "border-ink bg-ink-tint" : "border-line hover:border-ink/30",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", checked ? "text-ink" : "text-faint")} />
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-[12px] leading-snug text-muted">{sub}</span>
      </span>
    </button>
  );
}
