"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { useApp } from "@/lib/store";
import type { Department, Person, Team } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Dialog, DialogContent, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Avatar } from "@/components/app/avatar";
import { escalationChain } from "./escalation-path";

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void };

const firstName = (p?: Person) => p?.name.split(" ")[0] ?? "";

function Actions({ onCancel, submitLabel, disabled }: { onCancel: () => void; submitLabel: string; disabled?: boolean }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

function PeopleOptions({ people: all, departments }: { people: Person[]; departments: Department[] }) {
  const people = all.filter((p) => p.active !== false);
  const unplaced = people.filter((p) => !departments.some((d) => d.id === p.departmentId));
  return (
    <>
      {unplaced.length > 0 && (
        <optgroup label="Not in a department yet">
          {unplaced.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {p.title}
            </option>
          ))}
        </optgroup>
      )}
      {departments.map((d) => {
        const list = people.filter((p) => p.departmentId === d.id);
        if (!list.length) return null;
        return (
          <optgroup key={d.id} label={d.name}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.title}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/* ---------------- add department ---------------- */
export function AddDepartmentDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title="Add a department" description="The head hears about silence from every team in the department. A department channel is created too.">
          <AddDepartmentForm onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function AddDepartmentForm({ onDone }: { onDone: () => void }) {
  const people = useApp((s) => s.people);
  const departments = useApp((s) => s.departments);
  const addDepartment = useApp((s) => s.addDepartment);
  const staff = people.filter((p) => p.role !== "owner");
  const [name, setName] = React.useState("");
  const [headId, setHeadId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const clash = departments.some((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase());

  if (staff.length === 0)
    return (
      <div className="space-y-4">
        <p className="text-[14px] leading-relaxed text-muted">Every department has a head chosen from your staff, and nobody has been added yet. Add your people first, then come back here.</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Close
          </Button>
          <Button asChild variant="primary">
            <Link href="/team">Add people</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !headId || clash) return;
        if (
          !addDepartment({
            name: name.trim(),
            headId,
            description: description.trim(),
          }).ok
        )
          return;
        onDone();
        toast.success("Department added", {
          description: `${name.trim()} is ready. Add a team so people can be moved in.`,
        });
      }}
      className="space-y-4"
    >
      <Field label="Name" htmlFor="dept-name" hint={clash ? <span className="text-heat-3">There is already a department with this name. Pick another name.</span> : undefined}>
        <Input id="dept-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Customer support" />
      </Field>
      <Field label="Head of department" htmlFor="dept-head" hint="They stay in their current team until you move them.">
        <Select id="dept-head" value={headId} onChange={(e) => setHeadId(e.target.value)}>
          <option value="" disabled>
            Choose a person
          </option>
          <PeopleOptions people={staff} departments={departments} />
        </Select>
      </Field>
      <Field label="What it does (optional)" htmlFor="dept-desc">
        <Textarea id="dept-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line people will recognise" className="min-h-16" />
      </Field>
      <Actions onCancel={onDone} submitLabel="Add department" disabled={!name.trim() || !headId || clash} />
    </form>
  );
}

/* ---------------- add team ---------------- */
export function AddTeamDialog({ department, ...props }: DialogProps & { department: Department | null }) {
  return (
    <Dialog open={props.open && !!department} onOpenChange={props.onOpenChange}>
      {props.open && department && (
        <DialogContent title={`Add a team to ${department.name}`} description="The lead hears first when someone in the team goes quiet.">
          <AddTeamForm department={department} onDone={() => props.onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function AddTeamForm({ department, onDone }: { department: Department; onDone: () => void }) {
  const people = useApp((s) => s.people);
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const addTeam = useApp((s) => s.addTeam);
  const inDept = people.filter((p) => p.role !== "owner" && (p.departmentId === department.id || p.id === department.headId));
  const options = inDept.length ? inDept : people.filter((p) => p.role !== "owner");
  const [name, setName] = React.useState("");
  const [leadId, setLeadId] = React.useState(department.headId && options.some((p) => p.id === department.headId) ? department.headId : "");
  const clash = teams.some((t) => t.departmentId === department.id && t.name.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !leadId || clash) return;
        if (!addTeam({ name: name.trim(), departmentId: department.id, leadId }).ok) return;
        onDone();
        toast.success("Team added", {
          description: `${name.trim()} is part of ${department.name}. Move people in from their menu.`,
        });
      }}
      className="space-y-4"
    >
      <Field label="Team name" htmlFor="team-name" hint={clash ? <span className="text-heat-3">{department.name} already has a team with this name. Pick another name.</span> : undefined}>
        <Input id="team-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Key accounts" />
      </Field>
      <Field
        label="Team lead"
        htmlFor="team-lead"
        hint={inDept.length ? "The lead keeps their current team. Move people into the new team from their menu." : `Nobody is in ${department.name} yet, so everyone is listed.`}
      >
        <Select id="team-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
          <option value="" disabled>
            Choose a person
          </option>
          {inDept.length ? (
            options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.title}
              </option>
            ))
          ) : (
            <PeopleOptions people={options} departments={departments} />
          )}
        </Select>
      </Field>
      <Actions onCancel={onDone} submitLabel="Add team" disabled={!name.trim() || !leadId || clash} />
    </form>
  );
}

/* ---------------- move a person ---------------- */
export function MovePersonDialog({ person, ...props }: DialogProps & { person: Person | null }) {
  const inTeam = useApp((s) => !!person && s.teams.some((t) => t.id === person.teamId));
  return (
    <Dialog open={props.open && !!person} onOpenChange={props.onOpenChange}>
      {props.open && person && (
        <DialogContent
          title={inTeam ? `Move ${person.name} to another team` : `Put ${person.name} in a team`}
          description={
            inTeam ? "Open tasks stay with them. Reviews and escalations follow the new team from now on." : "Their reviews and escalations go to that team's lead and department head from now on."
          }
        >
          <MoveForm person={person} onDone={() => props.onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function MoveForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const people = useApp((s) => s.people);
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const escalation = useApp((s) => s.settings.escalation);
  const movePerson = useApp((s) => s.movePerson);
  const [teamId, setTeamId] = React.useState("");
  const target = teams.find((t) => t.id === teamId);
  const preview = target ? escalationChain({ ...person, teamId: target.id, departmentId: target.departmentId }, people, teams, departments, escalation).filter((s) => !s.skipped && s.person) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!target) return;
        if (!movePerson(person.id, target.id).ok) return;
        onDone();
        toast.success("Moved. Their access changed automatically.", {
          description: `${firstName(person)} is now in ${target.name}.`,
        });
      }}
      className="space-y-4"
    >
      <Field label="New team" htmlFor="move-team">
        <Select id="move-team" autoFocus value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="" disabled>
            Choose a team
          </option>
          {departments.map((d) => {
            const list = teams.filter((t) => t.departmentId === d.id && t.id !== person.teamId);
            if (!list.length) return null;
            return (
              <optgroup key={d.id} label={d.name}>
                {list.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </Select>
      </Field>

      {preview && (
        <div className="rounded-[var(--radius-md)] bg-sunken px-4 py-3.5">
          <p className="text-[13px] font-medium text-text">Who hears about silence after the move</p>
          <ol className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {preview.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3.5 text-faint" aria-hidden />}
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface pl-0.5 pr-2.5 text-[12.5px]">
                  <Avatar person={s.person} size="sm" />
                  {firstName(s.person)}
                </span>
              </li>
            ))}
          </ol>
          {target && target.departmentId !== person.departmentId && (
            <p className="mt-2.5 text-[12.5px] leading-snug text-muted">
              This also moves {firstName(person)} to {departments.find((d) => d.id === target.departmentId)?.name}. They&apos;ll see that department&apos;s channel instead of their current one.
            </p>
          )}
        </div>
      )}

      <Actions onCancel={onDone} submitLabel="Move" disabled={!target} />
    </form>
  );
}

/* ---------------- new group ---------------- */
export function NewGroupDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title="New group" description="Groups bring people from different departments together. They get a shared channel. Escalations still follow departments." wide>
          <NewGroupForm onDone={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function NewGroupForm({ onDone }: { onDone: () => void }) {
  const people = useApp((s) => s.people);
  const departments = useApp((s) => s.departments);
  const addGroup = useApp((s) => s.addGroup);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [members, setMembers] = React.useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setMembers((m) => (on ? [...m, id] : m.filter((x) => x !== id)));
  const staff = people.filter((p) => p.role !== "owner" && p.active !== false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !members.length) return;
        if (
          !addGroup({
            name: name.trim(),
            description: description.trim(),
            memberIds: members,
          }).ok
        )
          return;
        onDone();
        toast.success("Group created", {
          description: `${plural(members.length, "person", "people")} added, and a channel was opened for them.`,
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="group-name">
          <Input id="group-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Lahore expo stand" />
        </Field>
        <Field label="What it's for (optional)" htmlFor="group-desc">
          <Input id="group-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line" />
        </Field>
      </div>

      <fieldset>
        <legend className="flex w-full items-baseline justify-between text-[13px] font-medium text-text">
          Members
          <span className="tabular text-[12.5px] font-normal text-muted">{members.length ? `${members.length} selected` : "Pick at least one"}</span>
        </legend>
        <div className="thin-scrollbar mt-1.5 max-h-[min(340px,44dvh)] overflow-y-auto rounded-[var(--radius-md)] border border-line">
          {departments.map((d) => {
            const list = staff.filter((p) => p.departmentId === d.id);
            if (!list.length) return null;
            return (
              <div key={d.id}>
                <p className="sticky top-0 z-[1] border-b border-line bg-hover px-3.5 py-1.5 text-[12.5px] font-semibold text-text">{d.name}</p>
                <ul>
                  {list.map((p) => {
                    const on = members.includes(p.id);
                    return (
                      <li key={p.id} className="border-b border-line last:border-b-0">
                        <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-1.5 transition-colors hover:bg-hover", on && "bg-ink-tint/40")}>
                          <Checkbox checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} aria-label={p.name} />
                          <Avatar person={p} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium text-text">{p.name}</span>
                            <span className="block truncate text-[12px] text-muted">{p.title}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </fieldset>

      <Actions onCancel={onDone} submitLabel="Create group" disabled={!name.trim() || !members.length} />
    </form>
  );
}

/* ---------------- change a team lead or department head ---------------- */
export function LeaderDialog({ target, onOpenChange }: { target: { kind: "head"; unit: Department } | { kind: "lead"; unit: Team } | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      {target && <LeaderForm target={target} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function LeaderForm({ target, onDone }: { target: { kind: "head"; unit: Department } | { kind: "lead"; unit: Team }; onDone: () => void }) {
  const everyone = useApp((s) => s.people);
  const people = React.useMemo(() => everyone.filter((p) => p.active !== false && p.role !== "owner"), [everyone]);
  const departments = useApp((s) => s.departments);
  const dispatch = useApp((s) => s.dispatch);
  const current = target.kind === "head" ? target.unit.headId : target.unit.leadId;
  const depId = target.kind === "head" ? target.unit.id : target.unit.departmentId;
  const [pick, setPick] = React.useState(current);
  const sorted = [...people].sort((a, b) => Number(b.departmentId === depId) - Number(a.departmentId === depId) || a.name.localeCompare(b.name));
  const chosen = people.find((p) => p.id === pick);
  return (
    <DialogContent
      title={target.kind === "head" ? `Who heads ${target.unit.name}?` : `Who leads ${target.unit.name}?`}
      description={
        target.kind === "head"
          ? "Escalations for this department go to them. If they're an employee, they become a manager."
          : "Escalations for this team go to them first. They join the team if they aren't in it."
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r =
            target.kind === "head"
              ? dispatch({
                  type: "setDepartmentHead",
                  departmentId: target.unit.id,
                  personId: pick,
                })
              : dispatch({
                  type: "setTeamLead",
                  teamId: target.unit.id,
                  personId: pick,
                });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Saved", {
            description: `${chosen?.name.split(" ")[0]} now ${target.kind === "head" ? "heads" : "leads"} ${target.unit.name}.`,
          });
          onDone();
        }}
      >
        <Field label="Person">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.title}
                {p.departmentId !== depId ? ` (${departments.find((d) => d.id === p.departmentId)?.name ?? "no department"})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        {chosen && chosen.departmentId !== depId && (
          <p className="mt-3 rounded-[var(--radius-sm)] bg-heat-1-tint px-3 py-2 text-[13px] text-text">
            {chosen.name.split(" ")[0]} will move into this {target.kind === "head" ? "department" : "team"}.
          </p>
        )}
        <Actions onCancel={onDone} submitLabel="Save" disabled={!pick || pick === current} />
      </form>
    </DialogContent>
  );
}
