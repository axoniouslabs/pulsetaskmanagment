"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import type { Priority, ReminderRule, Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DialogContent, Field, Input, Segmented, Select, Switch, Textarea } from "@/components/ui/primitives";
import type { TaskPatch } from "@/domain/commands";
import { CadenceSelect, ReminderFields, TagInput, WatcherPicker } from "./task-fields";

const toLocal = (iso?: string) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");

/** the assignee may only rewrite the description of their own task */
export function EditDescriptionForm({ task, onClose }: { task: Task; onClose: () => void }) {
  const act = useApp((s) => s.act);
  const [description, setDescription] = React.useState(task.description);
  return (
    <DialogContent title="Edit the description" description="Add what you've learned so the task explains itself. The change is recorded in the history.">
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8} aria-label="Description" />
      <p className="mt-2 text-[12px] text-faint">Formatting: **bold**, *italic*, lines starting with - become a list, and links work.</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (act({ type: "editTask", taskId: task.id, patch: { description } }).ok) {
              toast.success("Description saved");
              onClose();
            }
          }}
        >
          Save
        </Button>
      </div>
    </DialogContent>
  );
}

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
  const [reminder, setReminder] = React.useState<ReminderRule>(task.reminder);
  const [approval, setApproval] = React.useState(task.requiresApproval);
  const [proof, setProof] = React.useState(task.requiresProof);
  const [result, setResult] = React.useState(task.requiresResult);
  const [tags, setTags] = React.useState<string[]>(task.tags);
  const [watchers, setWatchers] = React.useState<string[]>(task.watcherIds);
  const [reviewerId, setReviewerId] = React.useState(task.reviewerId);
  const [allDay, setAllDay] = React.useState(!!task.dueAllDay);
  const [cadence, setCadence] = React.useState<number | "">(task.updateEveryDays ?? "");
  const [projectId, setProjectId] = React.useState(task.projectId ?? "");
  const [repeat, setRepeat] = React.useState(task.recurrence ?? "");
  const [deps, setDeps] = React.useState<string[]>(task.dependsOn ?? []);
  const [error, setError] = React.useState<string | null>(null);

  const candidates = tasks.filter((t) => t.id !== task.id && !deps.includes(t.id) && !["approved", "cancelled", "draft"].includes(t.status)).slice(0, 200);

  const save = () => {
    if (!title.trim()) return setError("Give the task a title.");
    if (startAt && Number.isNaN(new Date(startAt).getTime())) return setError("Pick a valid start date and time, or clear it.");
    const patch: TaskPatch = {
      title,
      description,
      priority,
      estimateHours: Math.max(0, Number(estimate) || 0),
      startAt: startAt ? new Date(startAt).toISOString() : null,
      requiresApproval: approval,
      requiresProof: proof,
      requiresResult: result,
      projectId: projectId || null,
      recurrence: (repeat || null) as TaskPatch["recurrence"],
      dependsOn: deps,
      tags,
      dueAllDay: allDay,
      updateEveryDays: cadence === "" ? null : cadence,
    };
    if (JSON.stringify(watchers) !== JSON.stringify(task.watcherIds)) patch.watcherIds = watchers;
    if (reviewerId !== task.reviewerId) patch.reviewerId = reviewerId;
    if (JSON.stringify(reminder) !== JSON.stringify(task.reminder)) patch.reminder = reminder;
    const r = dispatch({ type: "editTask", taskId: task.id, patch });
    if (!r.ok) return setError(r.error);
    toast.success(
      "Task updated",
      task.assigneeId
        ? {
            description: `${people.find((p) => p.id === task.assigneeId)?.name.split(" ")[0]} has been told what changed.`,
          }
        : undefined,
    );
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
          <p className="text-[12px] text-faint">Formatting: **bold**, *italic*, lines starting with - become a list, and links work.</p>
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
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tags" htmlFor="edit-tags">
            <TagInput id="edit-tags" value={tags} onChange={setTags} />
          </Field>
          <Field label="Repeat">
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
              <option value="">Doesn't repeat</option>
              <option value="daily">Every working day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </Select>
          </Field>
          <Field label="Watchers" htmlFor="edit-watchers" hint="They see every update without being responsible.">
            <WatcherPicker id="edit-watchers" value={watchers} onChange={setWatchers} exclude={[task.assigneeId]} />
          </Field>
          <Field label="Reviewer" htmlFor="edit-reviewer" hint="Who approves the work when it's submitted.">
            <Select id="edit-reviewer" value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              {people
                .filter((p) => p.active !== false && p.id !== task.assigneeId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.title}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Ask for progress updates" htmlFor="edit-cadence" hint="For long work: the assignee is reminded to post where it stands.">
            <CadenceSelect id="edit-cadence" value={cadence} onChange={setCadence} />
          </Field>
          <label className="flex items-center justify-between gap-3 self-end rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-[13.5px]">
            <span>
              Due on the day, no set time
              <span className="block text-[12px] text-muted">Counts as due at the end of their working day.</span>
            </span>
            <Switch checked={allDay} onCheckedChange={setAllDay} />
          </label>
        </div>
        <div className="rounded-[var(--radius-md)] border border-line p-4">
          <p className="mb-3 text-[13px] font-medium">Reminders</p>
          <ReminderFields idPrefix="edit-rem" value={reminder} onChange={setReminder} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-[13.5px]">
            Needs approval <Switch checked={approval} onCheckedChange={setApproval} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-[13.5px]">
            Proof photo <Switch checked={proof} onCheckedChange={setProof} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-[13.5px]">
            Result report <Switch checked={result} onCheckedChange={setResult} />
          </label>
        </div>
        <Field label="Waits for" hint="It can't be started until these are done.">
          <Select value="" onChange={(e) => e.target.value && setDeps((d) => [...d, e.target.value])}>
            <option value="">Add a task it waits for</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
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
                  className="rounded-full bg-sunken px-2.5 py-1 text-[12px] hover:bg-heat-3-tint"
                  aria-label={`Stop waiting for ${tasks.find((t) => t.id === d)?.title ?? "this task"}`}
                >
                  {tasks.find((t) => t.id === d)?.title ?? "A task you can't see"} ×
                </button>
              ))}
            </div>
          )}
        </Field>
        {error && <p className="text-[13px] text-heat-3">{error}</p>}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={!title.trim()}>
          Save changes
        </Button>
      </div>
    </DialogContent>
  );
}
