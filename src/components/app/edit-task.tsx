"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import type { Priority, Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DialogContent, Field, Input, Segmented, Select, Switch, Textarea } from "@/components/ui/primitives";
import type { TaskPatch } from "@/domain/commands";

const toLocal = (iso?: string) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");
const INTERVALS = [10, 15, 30, 60, 120, 1440];

/** change a task's details; the deadline and the owner have their own buttons */
export function EditTaskForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const dispatch = useApp((s) => s.dispatch);
  const tasks = useApp((s) => s.tasks);
  const people = useApp((s) => s.people);
  const projects = useApp((s) => s.projects);
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description);
  const [priority, setPriority] = React.useState<Priority>(task.priority);
  const [estimate, setEstimate] = React.useState(String(task.estimateHours));
  const [startAt, setStartAt] = React.useState(toLocal(task.startAt));
  const [interval, setIntervalMin] = React.useState(task.reminder.intervalMin);
  const [workingOnly, setWorkingOnly] = React.useState(task.reminder.window === "working");
  const [approval, setApproval] = React.useState(task.requiresApproval);
  const [proof, setProof] = React.useState(task.requiresProof);
  const [projectId, setProjectId] = React.useState(task.projectId ?? "");
  const [repeat, setRepeat] = React.useState(task.recurrence ?? "");
  const [deps, setDeps] = React.useState<string[]>(task.dependsOn ?? []);
  const [error, setError] = React.useState<string | null>(null);

  const candidates = tasks.filter((t) => t.id !== task.id && !deps.includes(t.id) && !["approved", "cancelled", "draft"].includes(t.status)).slice(0, 200);

  const save = () => {
    const patch: TaskPatch = {
      title,
      description,
      priority,
      estimateHours: Math.max(0, Number(estimate) || 0),
      startAt: startAt ? new Date(startAt).toISOString() : null,
      requiresApproval: approval,
      requiresProof: proof,
      projectId: projectId || null,
      recurrence: (repeat || null) as TaskPatch["recurrence"],
      dependsOn: deps,
    };
    if (interval !== task.reminder.intervalMin || workingOnly !== (task.reminder.window === "working")) {
      patch.reminder = { intervalMin: interval, window: workingOnly ? "working" : "always" };
    }
    const r = dispatch({ type: "editTask", taskId: task.id, patch });
    if (!r.ok) return setError(r.error);
    toast.success("Task updated", task.assigneeId ? { description: `${people.find((p) => p.id === task.assigneeId)?.name.split(" ")[0]} has been told what changed.` } : undefined);
    onClose();
  };

  return (
    <DialogContent title="Edit task" description="Changes are recorded in the history. To move the deadline or change the owner, use their own buttons." wide>
      <div className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Instructions">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Priority">
          <Segmented
            value={priority}
            onChange={setPriority}
            options={(["low", "normal", "high", "urgent"] as Priority[]).map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))}
            className="w-full [&>button]:flex-1 [&>button]:justify-center"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estimate (hours)">
            <Input type="number" min="0" step="0.25" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          </Field>
          <Field label="Starts" hint="No reminders before this.">
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="Project">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Remind every">
            <Select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))}>
              {Array.from(new Set([...INTERVALS, task.reminder.intervalMin])).sort((a, b) => a - b).map((n) => (
                <option key={n} value={n}>{n >= 1440 ? "Daily" : n >= 60 ? `${n / 60} hour${n > 60 ? "s" : ""}` : `${n} min`}</option>
              ))}
            </Select>
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
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-[13.5px]">
            Working hours only <Switch checked={workingOnly} onCheckedChange={setWorkingOnly} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-[13.5px]">
            Needs approval <Switch checked={approval} onCheckedChange={setApproval} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-[13.5px]">
            Proof photo <Switch checked={proof} onCheckedChange={setProof} />
          </label>
        </div>
        <Field label="Waits for" hint="It can't be started until these are done.">
          <Select value="" onChange={(e) => e.target.value && setDeps((d) => [...d, e.target.value])}>
            <option value="">Add a task it waits for</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </Select>
          {deps.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {deps.map((d) => (
                <button key={d} type="button" onClick={() => setDeps((x) => x.filter((y) => y !== d))} className="rounded-full bg-sunken px-2.5 py-1 text-[12px] hover:bg-heat-3-tint" aria-label="Remove">
                  {tasks.find((t) => t.id === d)?.title ?? "A task you can't see"} ×
                </button>
              ))}
            </div>
          )}
        </Field>
        {error && <p className="text-[13px] text-heat-3">{error}</p>}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!title.trim()}>Save changes</Button>
      </div>
    </DialogContent>
  );
}
