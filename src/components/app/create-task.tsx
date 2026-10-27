"use client";

import * as React from "react";
import { addDays, endOfWeek, format, set as setTime } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, FileCheck2, Sparkles, Repeat, ChevronDown } from "lucide-react";
import { useApp, useMeId } from "@/lib/store";
import type { Priority } from "@/lib/types";
import { committedHours, scopePeople } from "@/lib/selectors";
import { parseQuickAdd } from "@/lib/quickadd";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Segmented, Select, Switch, Textarea, Bar } from "@/components/ui/primitives";
import { Avatar } from "./avatar";

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

function CreateTaskForm() {
  const s = useApp();
  const meId = useMeId();
  const defaults = s.createDefaults;
  const scope = React.useMemo(
    () => (s.role === "employee" ? s.people.filter((p) => p.id === meId) : scopePeople(s, s.role, meId).filter((p) => p.role !== "owner")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.role, meId, s.people],
  );

  const [quick, setQuick] = React.useState(defaults?.title ?? "");
  const [title, setTitle] = React.useState(defaults?.title ?? "");
  const [description, setDescription] = React.useState("");
  const [showMore, setShowMore] = React.useState(false);
  const [assigneeId, setAssigneeId] = React.useState(defaults?.assigneeId ?? (s.role === "employee" ? meId : ""));
  const [due, setDue] = React.useState(
    toLocal(setTime(new Date(), { hours: 17, minutes: 0 }) < new Date() ? setTime(addDays(new Date(), 1), { hours: 17, minutes: 0 }) : setTime(new Date(), { hours: 17, minutes: 0 })),
  );
  const [priority, setPriority] = React.useState<Priority>("normal");
  const [interval, setIntervalMin] = React.useState(s.settings.defaultReminder.intervalMin);
  const [workingOnly, setWorkingOnly] = React.useState(true);
  const [approval, setApproval] = React.useState(s.settings.approvalByDefault);
  const [proof, setProof] = React.useState(false);
  const [result, setResult] = React.useState(false);
  const [checklist, setChecklist] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [estimate, setEstimate] = React.useState("1");
  const [startAt, setStartAt] = React.useState("");
  const [repeat, setRepeat] = React.useState<"" | "daily" | "weekly" | "monthly">("");
  const [touched, setTouched] = React.useState(false);
  const [mode, setMode] = React.useState<"one" | "many" | "unit">("one");
  const [many, setMany] = React.useState<string[]>([]);
  const [unit, setUnit] = React.useState("");
  const [deps, setDeps] = React.useState<string[]>([]);
  const [tplName, setTplName] = React.useState<string | null>(null);
  const parsed = React.useMemo(() => (quick.trim() ? parseQuickAdd(quick, scope) : null), [quick, scope]);

  // teams and groups this person may offer work to
  const units = React.useMemo(() => {
    if (s.role === "employee") return [];
    const mine = (leadId: string, depId: string) => s.role === "owner" || leadId === meId || s.departments.some((d) => d.id === depId && d.headId === meId);
    return [
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
    setRepeat(i.recurrence ?? "");
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
    recurrence: repeat || undefined,
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
    if (p.priority === "urgent") setIntervalMin(10);
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
      recurrence: repeat || undefined,
      dependsOn: deps.length ? deps : undefined,
      draft,
    };
    if (mode === "many") {
      if (!many.length) return;
      const ids = many.map((pid) => s.createTask({ ...base, assigneeId: pid })).filter(Boolean);
      s.closeCreate();
      toast.success(`Assigned to ${ids.length} ${ids.length === 1 ? "person" : "people"}`, {
        description: "Each person has their own copy and their own reminders.",
      });
      return;
    }
    if (mode === "unit") {
      const u = units.find((x) => x.key === unit);
      if (!u) return;
      const [unitType, unitId] = u.key.split(":") as ["team" | "group", string];
      const id = s.createTask({
        ...base,
        assigneeId: u.holder,
        claim: { unitType, unitId },
      });
      if (!id) return;
      s.closeCreate();
      toast.success(`Offered to ${u.label}`, {
        description: "Everyone in it is told. The first to claim it owns it.",
        action: { label: "Open", onClick: () => s.openTask(id) },
      });
      return;
    }
    if (!assigneeId) return;
    const id = s.createTask({
      title,
      description,
      assigneeId,
      priority,
      dueAt: dueDate.toISOString(),
      estimateHours: Number(estimate) || 1,
      projectId: projectId || undefined,
      requiresApproval: approval,
      requiresProof: proof,
      requiresResult: result,
      reminder: {
        intervalMin: interval,
        window: workingOnly ? "working" : "always",
      },
      subtasks: checklist
        .split(/\n|,/)
        .map((x) => x.trim())
        .filter(Boolean),
      tags: parsed?.tags ?? [],
      recurrence: repeat || undefined,
      dependsOn: deps.length ? deps : undefined,
      draft,
    });
    if (!id) return;
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
            options={[{ value: "one", label: "One person" }, { value: "many", label: "Several people" }, ...(units.length ? [{ value: "unit" as const, label: "Team, first to claim" }] : [])]}
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
          <Field label="Offer it to" hint="Everyone in it is told. Whoever claims it first owns it and gets the reminders.">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Pick a team or group</option>
              {units.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </Select>
            {touched && !unit && <p className="text-[12.5px] text-heat-3">Pick a team or group.</p>}
          </Field>
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
                    onClick={() => setAssigneeId(p.id)}
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
                if (v === "urgent") setIntervalMin(10);
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

        {/* reminder rule */}
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
              <span className="block text-[12px] text-muted">
                {s.settings.workStart}–{s.settings.workEnd}, skips holidays and leave
              </span>
            </span>
            <Switch checked={workingOnly} onCheckedChange={setWorkingOnly} />
          </label>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle icon={CheckCircle2} label="Needs approval" sub="A reviewer closes it" checked={approval} onChange={setApproval} />
          <Toggle icon={Camera} label="Proof photo" sub="Can't submit without one" checked={proof} onChange={setProof} />
          <Toggle icon={FileCheck2} label="Result report" sub="Send a result at the deadline" checked={result} onChange={setResult} />
        </div>

        <button type="button" onClick={() => setShowMore((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} />
          {showMore ? "Fewer options" : "Instructions, checklist, project, repeat"}
        </button>

        {showMore && (
          <div className="space-y-4">
            <Field label="Instructions">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything they need to know to do it right the first time" />
            </Field>
            <Field label="Checklist" hint="One step per line.">
              <Textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder={"Collect cheque\nTake photo of cheque\nDeposit at HBL"} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Project">
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
              <Field label="Repeat">
                <Select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
                  <option value="">Doesn't repeat</option>
                  <option value="daily">Every working day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </Select>
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
                      aria-label="Remove"
                    >
                      {s.tasks.find((t) => t.id === d)?.title} ×
                    </button>
                  ))}
                </div>
              )}
            </Field>
            {repeat && (
              <p className="flex items-center gap-2 text-[12.5px] text-muted">
                <Repeat className="size-3.5" /> A new copy appears on schedule even if the last one isn't done. Missed copies pile up to a maximum of 3.
              </p>
            )}
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
                ? "Offer to the team"
                : "Assign task"}
        </Button>
      </div>
    </DialogContent>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-ink ring-1 ring-ink/15">{children}</span>;
}

function Toggle({ icon: Icon, label, sub, checked, onChange }: { icon: React.ElementType; label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("flex items-start gap-2.5 rounded-[var(--radius-md)] border p-3 text-left transition-colors", checked ? "border-ink bg-ink-tint" : "border-line hover:border-ink/30")}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", checked ? "text-ink" : "text-faint")} />
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-[12px] leading-snug text-muted">{sub}</span>
      </span>
    </button>
  );
}
