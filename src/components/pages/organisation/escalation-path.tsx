"use client";

import * as React from "react";
import type { Department, OrgSettings, Person, Team } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field, Select } from "@/components/ui/primitives";
import { Panel } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";

export interface EscalationStep {
  key: "member" | "lead" | "head" | "owner";
  role: string;
  person?: Person;
  when: string;
  skipped?: string;
}

/** who hears about silence on this person's tasks, in order */
export function escalationChain(p: Person, people: Person[], teams: Team[], departments: Department[], esc: OrgSettings["escalation"]): EscalationStep[] {
  const first = p.name.split(" ")[0];
  const team = teams.find((t) => t.id === p.teamId);
  const dept = departments.find((d) => d.id === p.departmentId);
  const owner = people.find((x) => x.role === "owner");
  const lead = team && team.leadId !== p.id ? people.find((x) => x.id === team.leadId) : undefined;
  const headRaw = dept ? people.find((x) => x.id === dept.headId) : undefined;
  const head = headRaw && headRaw.id !== p.id && headRaw.id !== lead?.id ? headRaw : undefined;

  let leadSkip: string | undefined;
  if (!lead) leadSkip = team ? `Skipped, ${first} leads ${team.name}` : `Skipped, ${first} isn't in a team`;
  let headSkip: string | undefined;
  if (!head) {
    if (headRaw?.id === p.id) headSkip = `Skipped, ${first} heads ${dept?.name}`;
    else if (headRaw && headRaw.id === lead?.id) headSkip = `Skipped, ${headRaw.name.split(" ")[0]} already heard as team lead`;
    else headSkip = "Skipped, no department head";
  }

  return [
    { key: "member", role: "Member", person: p, when: `Gets the task and a reminder every few minutes until they acknowledge` },
    { key: "lead", role: "Team lead", person: lead, when: `Told after ${esc.l2Ignored} ignored reminders`, skipped: leadSkip },
    { key: "head", role: "Department head", person: head, when: `Told after ${esc.l3Ignored} ignored reminders`, skipped: headSkip },
    { key: "owner", role: "Owner", person: owner, when: `Told when a task is ${esc.l4HoursPastDue} hours past due with no response` },
  ];
}

export function EscalationPath({
  people,
  teams,
  departments,
  escalation,
}: {
  people: Person[];
  teams: Team[];
  departments: Department[];
  escalation: OrgSettings["escalation"];
}) {
  const staff = people.filter((p) => p.role !== "owner");
  const [personId, setPersonId] = React.useState(() => staff.find((p) => p.role === "employee")?.id ?? staff[0]?.id ?? "");
  const person = staff.find((p) => p.id === personId) ?? staff[0];
  if (!person) return null;
  const steps = escalationChain(person, people, teams, departments, escalation);
  const numbers = steps.reduce<number[]>((acc, s) => [...acc, (acc[acc.length - 1] ?? 0) + (s.skipped ? 0 : 1)], []);

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-[52ch] text-[13.5px] leading-snug text-muted">
          When someone doesn&apos;t respond, Pulse moves up their department one step at a time. Each step is told only when the one before stayed silent.
        </p>
        <Field label="Show the path for" htmlFor="esc-person" className="sm:w-64">
          <Select id="esc-person" value={person.id} onChange={(e) => setPersonId(e.target.value)}>
            {departments.map((d) => {
              const members = staff.filter((p) => p.departmentId === d.id);
              if (!members.length) return null;
              return (
                <optgroup key={d.id} label={d.name}>
                  {members.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </Field>
      </div>

      <ol className="mt-6 grid md:grid-cols-4">
        {steps.map((s, i) => {
          const live = !s.skipped;
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className={cn("relative flex gap-3.5 pb-6 last:pb-0 md:block md:pb-0 md:pr-5", !live && "opacity-70")}>
              {!last && (
                <span
                  aria-hidden
                  className="absolute bottom-1 left-[15px] top-9 w-px bg-line-strong md:bottom-auto md:left-10 md:right-2 md:top-[15px] md:h-px md:w-auto"
                />
              )}
              <span
                className={cn(
                  "tabular relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                  live ? "bg-ink text-white" : "border border-dashed border-line-strong bg-surface text-faint",
                )}
                aria-hidden
              >
                {live ? numbers[i] : "–"}
              </span>
              <div className="min-w-0 md:mt-3.5">
                <p className="text-[12.5px] font-medium text-muted">{s.role}</p>
                {s.person && live ? (
                  <p className="mt-1.5 flex items-center gap-2">
                    <Avatar person={s.person} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-text">{s.person.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">{s.person.title}</span>
                    </span>
                  </p>
                ) : (
                  <p className="mt-1.5 text-[13.5px] text-muted">{s.skipped ?? "Nobody set"}</p>
                )}
                {live && <p className="mt-2 text-[12.5px] leading-snug text-text/75">{s.when}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
