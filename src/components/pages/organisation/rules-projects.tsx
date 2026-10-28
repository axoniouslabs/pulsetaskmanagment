"use client";

import * as React from "react";
import { toast } from "sonner";
import { FolderKanban, Pencil, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Department, DepartmentSettings, Person, Project } from "@/lib/types";
import { plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Field, Input, Select, Switch } from "@/components/ui/primitives";
import { EmptyState, Panel } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { WorkHoursFields } from "@/components/app/work-hours";

const INTERVALS = [
  { v: 10, l: "10 min" },
  { v: 15, l: "15 min" },
  { v: 30, l: "30 min" },
  { v: 60, l: "1 hour" },
  { v: 120, l: "2 hours" },
  { v: 240, l: "4 hours" },
];

/** one line describing what a department does differently, for its panel */
export function departmentRulesSummary(d: Department) {
  const st = d.settings;
  if (!st) return null;
  const parts: string[] = [];
  if (st.workStart || st.workEnd || st.workDays) parts.push(`own hours${st.workStart || st.workEnd ? ` ${st.workStart ?? "…"} to ${st.workEnd ?? "…"}` : ""}`);
  if (st.defaultReminder?.intervalMin) parts.push(`reminds every ${INTERVALS.find((i) => i.v === st.defaultReminder!.intervalMin)?.l ?? `${st.defaultReminder.intervalMin} min`}`);
  if (st.approvalByDefault !== undefined) parts.push(st.approvalByDefault ? "work needs approval" : "routine work closes without review");
  return parts.length ? parts.join(", ") : null;
}

/* ---------------- department rules ---------------- */
export function DepartmentRulesDialog({ department, onOpenChange }: { department: Department | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={!!department} onOpenChange={onOpenChange}>
      {department && (
        <DialogContent title={`${department.name}: its own rules`} description="Leave anything as it is to follow the company settings. Rules here apply to everyone in the department.">
          <RulesForm department={department} onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function RulesForm({ department, onDone }: { department: Department; onDone: () => void }) {
  const settings = useApp((s) => s.settings);
  const act = useApp((s) => s.act);
  const st = department.settings ?? {};
  const [hours, setHours] = React.useState<Pick<DepartmentSettings, "workDays" | "workStart" | "workEnd">>({ workDays: st.workDays, workStart: st.workStart, workEnd: st.workEnd });
  const [interval, setInterval] = React.useState<string>(st.defaultReminder?.intervalMin ? String(st.defaultReminder.intervalMin) : "");
  const [approval, setApproval] = React.useState<"" | "yes" | "no">(st.approvalByDefault === undefined ? "" : st.approvalByDefault ? "yes" : "no");
  const [error, setError] = React.useState<string | null>(null);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const start = hours.workStart ?? settings.workStart;
    const end = hours.workEnd ?? settings.workEnd;
    if (end <= start) return setError("The day has to end after it starts.");
    const next: DepartmentSettings = {
      ...(hours.workDays ? { workDays: hours.workDays } : {}),
      ...(hours.workStart ? { workStart: hours.workStart } : {}),
      ...(hours.workEnd ? { workEnd: hours.workEnd } : {}),
      ...(interval ? { defaultReminder: { intervalMin: Number(interval) } } : {}),
      ...(approval ? { approvalByDefault: approval === "yes" } : {}),
    };
    const r = act({ type: "updateDepartment", departmentId: department.id, patch: { settings: Object.keys(next).length ? next : null } });
    if (!r.ok) return setError(r.error);
    toast.success(Object.keys(next).length ? `${department.name} rules saved` : `${department.name} follows the company rules`);
    onDone();
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <section>
        <h4 className="mb-2 text-[13.5px] font-medium text-text">Working hours</h4>
        <WorkHoursFields idPrefix="dep" value={hours} onChange={setHours} inherited={{ workDays: settings.workDays, workStart: settings.workStart, workEnd: settings.workEnd }} />
        <p className="mt-2 text-[12px] leading-snug text-muted">Reminders, lateness and the end-of-day timer stop follow these hours. A person can still have their own hours on top.</p>
      </section>
      <Field label="Remind new tasks every" htmlFor="dep-interval">
        <Select id="dep-interval" value={interval} onChange={(e) => setInterval(e.target.value)}>
          <option value="">Company default ({INTERVALS.find((i) => i.v === settings.defaultReminder.intervalMin)?.l ?? `${settings.defaultReminder.intervalMin} min`})</option>
          {INTERVALS.map((i) => (
            <option key={i.v} value={i.v}>
              {i.l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="New tasks need approval" htmlFor="dep-approval">
        <Select id="dep-approval" value={approval} onChange={(e) => setApproval(e.target.value as "" | "yes" | "no")}>
          <option value="">Company default ({settings.approvalByDefault ? "yes" : "no"})</option>
          <option value="yes">Yes, a reviewer closes each task</option>
          <option value="no">No, routine tasks close when marked done</option>
        </Select>
      </Field>
      {error && <p className="text-[13px] text-heat-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save rules
        </Button>
      </div>
    </form>
  );
}

/* ---------------- projects ---------------- */
export function ProjectsSection({ people }: { people: Person[] }) {
  const projects = useApp((s) => s.projects);
  const tasks = useApp((s) => s.tasks);
  const role = useApp((s) => s.role);
  const meId = useApp((s) => s.viewer?.personId);
  const [editing, setEditing] = React.useState<Project | "new" | null>(null);
  return (
    <>
      {projects.length ? (
        <Panel>
          <ul>
            {projects.map((p) => {
              const lead = people.find((x) => x.id === p.leadId);
              const auto = people.find((x) => x.id === p.defaultAssigneeId);
              const open = tasks.filter((t) => t.projectId === p.id && !["approved", "cancelled", "draft"].includes(t.status)).length;
              return (
                <li key={p.id} className="flex flex-col gap-2 border-b border-line px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
                  <span className="size-3 shrink-0 rounded-[4px]" style={{ background: `oklch(0.65 0.13 ${p.hue})` }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium text-text">{p.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                      {lead && (
                        <span className="flex items-center gap-1.5">
                          <Avatar person={lead} size="xs" /> Led by {lead.name}
                        </span>
                      )}
                      <span>{auto ? `New tasks go to ${auto.name.split(" ")[0]}` : "No automatic assignee"}</span>
                      <span className="tabular">{plural(open, "open task")}</span>
                    </p>
                  </div>
                  {(role === "owner" || p.leadId === meId) && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                      <Pencil /> Edit
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            body="A project groups work for one client or goal. Reports and the burn-down chart can follow it, and you can choose who its new tasks go to."
            action={
              <Button variant="primary" onClick={() => setEditing("new")}>
                <Plus /> New project
              </Button>
            }
          />
        </Panel>
      )}
      {projects.length > 0 && (
        <div className="mt-3">
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> New project
          </Button>
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === "new" ? "New project" : `Edit ${editing.name}`} description="Tasks can be filed under a project when they're created.">
            <ProjectForm project={editing === "new" ? null : editing} people={people} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function ProjectForm({ project, people, onDone }: { project: Project | null; people: Person[]; onDone: () => void }) {
  const act = useApp((s) => s.act);
  const projects = useApp((s) => s.projects);
  const [name, setName] = React.useState(project?.name ?? "");
  const [leadId, setLeadId] = React.useState(project?.leadId ?? "");
  const [auto, setAuto] = React.useState(!!project?.defaultAssigneeId);
  const [autoId, setAutoId] = React.useState(project?.defaultAssigneeId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const clash = projects.some((p) => p.id !== project?.id && p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const active = people.filter((p) => p.active !== false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !leadId || clash) return;
    if (auto && !autoId) return setError("Pick who new tasks go to, or switch that off.");
    const r = project
      ? act({ type: "editProject", projectId: project.id, patch: { name: name.trim(), leadId, defaultAssigneeId: auto ? autoId : null } })
      : act({ type: "addProject", id: `prj_${Date.now().toString(36)}${Math.random().toString(16).slice(2, 8)}`, name: name.trim(), leadId, defaultAssigneeId: auto ? autoId : undefined });
    if (!r.ok) return setError(r.error);
    toast.success(project ? "Project saved" : "Project created", { description: auto ? `New tasks in ${name.trim()} go to ${people.find((p) => p.id === autoId)?.name.split(" ")[0]}.` : undefined });
    onDone();
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Name" htmlFor="prj-name" hint={clash ? <span className="text-heat-3">There&apos;s already a project with this name.</span> : undefined}>
        <Input id="prj-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Dealer app" />
      </Field>
      <Field label="Project lead" htmlFor="prj-lead">
        <Select id="prj-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
          <option value="" disabled>
            Choose a person
          </option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {p.title}
            </option>
          ))}
        </Select>
      </Field>
      <div className="rounded-[var(--radius-md)] border border-line p-3.5">
        <label className="flex items-start justify-between gap-4" htmlFor="prj-auto">
          <span>
            <span className="block text-[13.5px] font-medium text-text">Send new tasks to one person</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
              When someone files a task under this project, this person is picked for them. They can still choose someone else.
            </span>
          </span>
          <Switch id="prj-auto" checked={auto} onCheckedChange={setAuto} />
        </label>
        {auto && (
          <Select value={autoId} onChange={(e) => setAutoId(e.target.value)} className="mt-3" aria-label="New tasks go to">
            <option value="" disabled>
              Choose a person
            </option>
            {active
              .filter((p) => p.role !== "owner")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {p.title}
                </option>
              ))}
          </Select>
        )}
      </div>
      {error && <p className="text-[13px] text-heat-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim() || !leadId || clash}>
          {project ? "Save project" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
