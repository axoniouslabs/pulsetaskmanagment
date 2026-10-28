"use client";

import * as React from "react";
import { ArrowRightLeft, Network, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import { useScope } from "@/lib/hooks";
import type { Department, Group, Person, Team } from "@/lib/types";
import { plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, SectionHeading } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { DepartmentList, GroupList } from "@/components/pages/organisation/structure";
import { EscalationPath } from "@/components/pages/organisation/escalation-path";
import { AddDepartmentDialog, AddTeamDialog, EditGroupDialog, LeaderDialog, MovePersonDialog, NewGroupDialog } from "@/components/pages/organisation/dialogs";
import { DepartmentRulesDialog, ProjectsSection } from "@/components/pages/organisation/rules-projects";

export default function OrganisationPage() {
  const { role, meId, allPeople, teams: allTeams, departments: allDepartments } = useScope();
  const isOwner = role === "owner";
  // heads see their department; team leads see the department their team is in
  const departments = React.useMemo(
    () => (isOwner ? allDepartments : allDepartments.filter((d) => d.headId === meId || allTeams.some((t) => t.departmentId === d.id && t.leadId === meId))),
    [isOwner, allDepartments, allTeams, meId],
  );
  const teams = React.useMemo(
    () => (isOwner ? allTeams : allTeams.filter((t) => departments.some((d) => d.id === t.departmentId && (d.headId === meId || t.leadId === meId)))),
    [isOwner, allTeams, departments, meId],
  );
  const [editingGroup, setEditingGroup] = React.useState<Group | null>(null);
  const groups = useApp((s) => s.groups);
  const channels = useApp((s) => s.channels);
  const escalation = useApp((s) => s.settings.escalation);

  const [deptOpen, setDeptOpen] = React.useState(false);
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [teamFor, setTeamFor] = React.useState<Department | null>(null);
  const [moving, setMoving] = React.useState<Person | null>(null);
  const [rulesFor, setRulesFor] = React.useState<Department | null>(null);
  const [leader, setLeader] = React.useState<{ kind: "head"; unit: Department } | { kind: "lead"; unit: Team } | null>(null);
  const people = React.useMemo(() => allPeople.filter((p) => p.active !== false), [allPeople]);
  // staff who aren't in any team (added with "No team yet", or whose team was never set)
  const unplaced = React.useMemo(
    () => (isOwner ? people.filter((p) => p.role !== "owner" && !allTeams.some((t) => t.id === p.teamId) && !allDepartments.some((d) => d.headId === p.id)) : []),
    [isOwner, people, allTeams, allDepartments],
  );
  const myGroups = React.useMemo(() => (isOwner ? groups : groups.filter((g) => g.ownerId === meId || g.memberIds.includes(meId))), [isOwner, groups, meId]);

  if (role === "employee")
    return (
      <>
        <PageHeader title="Organisation" />
        <Panel>
          <EmptyState icon={Network} title="Your manager looks after this" body="Ask your team lead or the owner if someone needs to move to another team or a new group is needed." />
        </Panel>
      </>
    );

  return (
    <div>
      <PageHeader
        title={isOwner ? "Organisation" : "My units"}
        description={isOwner ? "Escalation follows departments. Collaboration follows groups." : "The units you run: who is in them, and the groups you work in."}
        actions={
          isOwner ? (
            <Button variant="primary" onClick={() => setDeptOpen(true)}>
              <Plus /> Add department
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-10">
        <section>
          <SectionHeading
            title="Departments and teams"
            aside={`${plural(departments.length, "department")}, ${plural(teams.length, "team")}, ${plural(isOwner ? people.length : people.filter((p) => departments.some((d) => d.id === p.departmentId)).length, "person", "people")}`}
          />
          {departments.length ? (
            <DepartmentList
              departments={departments}
              teams={teams}
              people={people}
              onAddTeam={setTeamFor}
              onMove={setMoving}
              onChangeHead={(d) => setLeader({ kind: "head", unit: d })}
              onChangeLead={(t) => setLeader({ kind: "lead", unit: t })}
              onRules={setRulesFor}
              isOwner={isOwner}
              meId={meId}
            />
          ) : (
            <Panel>
              <EmptyState
                icon={Network}
                title="No departments yet"
                body="Start with a department and its head. Escalations climb from team lead to department head to you."
                action={
                  <Button variant="primary" onClick={() => setDeptOpen(true)}>
                    <Plus /> Add department
                  </Button>
                }
              />
            </Panel>
          )}
        </section>

        {unplaced.length > 0 && (
          <section>
            <SectionHeading title="Not in a team yet" aside={plural(unplaced.length, "person", "people")} />
            <p className="-mt-1 mb-3 max-w-[64ch] text-[13.5px] leading-snug text-muted">
              They can be assigned work, but their reminders have nobody to escalate to until they join a team.
              {teams.length === 0 ? " Add a department and a team first." : ""}
            </p>
            <Panel className="overflow-hidden">
              <ul>
                {unplaced.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                    <Avatar person={p} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-text">{p.name}</p>
                      <p className="truncate text-[12.5px] text-muted">{p.title}</p>
                    </div>
                    <Button size="sm" onClick={() => setMoving(p)} disabled={teams.length === 0}>
                      <ArrowRightLeft /> Put in a team
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        )}

        {isOwner && (
          <section>
            <SectionHeading title="Escalation path" />
            <EscalationPath people={people} teams={teams} departments={departments} escalation={escalation} />
          </section>
        )}

        <section>
          <SectionHeading title="Projects" />
          <ProjectsSection people={people} />
        </section>

        <section>
          <SectionHeading
            title="Groups"
            aside={
              myGroups.length ? (
                <Button size="sm" onClick={() => setGroupOpen(true)}>
                  <Plus /> New group
                </Button>
              ) : undefined
            }
          />
          <p className="-mt-1 mb-3 max-w-[64ch] text-[13.5px] leading-snug text-muted">
            Groups cut across departments for a customer, a launch or a shift. Members share a channel, and nobody&apos;s reporting line changes.
          </p>
          <GroupList groups={myGroups} people={people} channels={channels} onCreate={() => setGroupOpen(true)} onEdit={setEditingGroup} canManage={(g) => isOwner || g.ownerId === meId} />
        </section>
      </div>

      <AddDepartmentDialog open={deptOpen} onOpenChange={setDeptOpen} />
      <NewGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />
      <EditGroupDialog group={editingGroup} onOpenChange={(o) => !o && setEditingGroup(null)} />
      <AddTeamDialog department={teamFor} open={!!teamFor} onOpenChange={(o) => !o && setTeamFor(null)} />
      <MovePersonDialog person={moving} open={!!moving} onOpenChange={(o) => !o && setMoving(null)} />
      <LeaderDialog target={leader} onOpenChange={(o) => !o && setLeader(null)} />
      <DepartmentRulesDialog department={rulesFor} onOpenChange={(o) => !o && setRulesFor(null)} />
    </div>
  );
}
