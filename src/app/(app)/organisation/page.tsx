"use client";

import * as React from "react";
import { Network, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import { useScope } from "@/lib/hooks";
import type { Department, Person, Team } from "@/lib/types";
import { plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, SectionHeading } from "@/components/app/page-header";
import { DepartmentList, GroupList } from "@/components/pages/organisation/structure";
import { EscalationPath } from "@/components/pages/organisation/escalation-path";
import { AddDepartmentDialog, AddTeamDialog, LeaderDialog, MovePersonDialog, NewGroupDialog } from "@/components/pages/organisation/dialogs";

export default function OrganisationPage() {
  const { role, allPeople, teams, departments } = useScope();
  const groups = useApp((s) => s.groups);
  const channels = useApp((s) => s.channels);
  const escalation = useApp((s) => s.settings.escalation);

  const [deptOpen, setDeptOpen] = React.useState(false);
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [teamFor, setTeamFor] = React.useState<Department | null>(null);
  const [moving, setMoving] = React.useState<Person | null>(null);
  const [leader, setLeader] = React.useState<{ kind: "head"; unit: Department } | { kind: "lead"; unit: Team } | null>(null);
  const people = React.useMemo(() => allPeople.filter((p) => p.active !== false), [allPeople]);

  if (role !== "owner")
    return (
      <>
        <PageHeader title="Organisation" />
        <Panel>
          <EmptyState icon={Network} title="Only the owner can change the organisation" body="Ask the owner if someone needs to move to another team or a new group is needed." />
        </Panel>
      </>
    );

  return (
    <div>
      <PageHeader
        title="Organisation"
        description="Escalation follows departments. Collaboration follows groups."
        actions={
          <Button variant="primary" onClick={() => setDeptOpen(true)}>
            <Plus /> Add department
          </Button>
        }
      />

      <div className="space-y-10">
        <section>
          <SectionHeading
            title="Departments and teams"
            aside={`${plural(departments.length, "department")}, ${plural(teams.length, "team")}, ${plural(people.length, "person", "people")}`}
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

        <section>
          <SectionHeading title="Escalation path" />
          <EscalationPath people={people} teams={teams} departments={departments} escalation={escalation} />
        </section>

        <section>
          <SectionHeading
            title="Groups"
            aside={
              groups.length ? (
                <Button size="sm" onClick={() => setGroupOpen(true)}>
                  <Plus /> New group
                </Button>
              ) : undefined
            }
          />
          <p className="-mt-1 mb-3 max-w-[64ch] text-[13.5px] leading-snug text-muted">
            Groups cut across departments for a customer, a launch or a shift. Members share a channel, and nobody&apos;s reporting line changes.
          </p>
          <GroupList groups={groups} people={people} channels={channels} onCreate={() => setGroupOpen(true)} />
        </section>
      </div>

      <AddDepartmentDialog open={deptOpen} onOpenChange={setDeptOpen} />
      <NewGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />
      <AddTeamDialog department={teamFor} open={!!teamFor} onOpenChange={(o) => !o && setTeamFor(null)} />
      <MovePersonDialog person={moving} open={!!moving} onOpenChange={(o) => !o && setMoving(null)} />
      <LeaderDialog target={leader} onOpenChange={(o) => !o && setLeader(null)} />
    </div>
  );
}
