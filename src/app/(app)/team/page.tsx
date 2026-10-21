"use client";

import * as React from "react";
import { format } from "date-fns";
import { Users } from "lucide-react";
import { useApp } from "@/lib/store";
import { useNow, useQueryParam, useScope } from "@/lib/hooks";
import { Segmented } from "@/components/ui/primitives";
import { EmptyState, PageHeader, Panel } from "@/components/app/page-header";
import { LoadView } from "@/components/pages/team/load-view";
import { PeopleView } from "@/components/pages/team/people-view";
import { PersonPanel } from "@/components/pages/team/person-panel";
import { upcomingWorkDays } from "@/components/pages/team/shared";

type View = "load" | "people";

export default function TeamPage() {
  const now = useNow(60000);
  const { role, meId, people, tasks, teams, departments } = useScope();
  const leaves = useApp((s) => s.leaves);
  const attendance = useApp((s) => s.attendance);
  const workDays = useApp((s) => s.settings.workDays);
  const [view, setView] = React.useState<View>("load");

  // deep link: /team?person=p_xxx opens the panel; after that the viewer's own choice wins
  const linked = useQueryParam("person");
  const [picked, setPicked] = React.useState<string | null | undefined>(undefined);
  const team = React.useMemo(() => people.filter((p) => p.role !== "owner"), [people]);
  const candidate = picked === undefined ? linked : picked;
  const openId = candidate && team.some((p) => p.id === candidate) ? candidate : null;

  const openPerson = (id: string | null) => {
    setPicked(id);
    const url = id ? `${window.location.pathname}?person=${id}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
  };

  const dayStamp = format(now, "yyyy-MM-dd");
  const days = React.useMemo(() => upcomingWorkDays(new Date(`${dayStamp}T00:00:00`), 7, workDays), [dayStamp, workDays]);

  if (role === "employee")
    return (
      <>
        <PageHeader title="Team" />
        <Panel>
          <EmptyState icon={Users} title="Team is for owners and managers" body="Your own tasks and stats are under My day and My stats. Ask your manager if you need to know who is free." />
        </Panel>
      </>
    );

  const scopeNote =
    role === "owner"
      ? `${team.length} people across ${departments.length} departments.`
      : `${team.length} people in ${departments.find((d) => d.headId === meId)?.name ?? "your department"}.`;

  return (
    <div>
      <PageHeader
        title="Team"
        description="Who is loaded, who is free, and who needs a hand."
        actions={
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: "load", label: "Load" },
              { value: "people", label: "People", count: team.length },
            ]}
          />
        }
      />

      {team.length === 0 ? (
        <Panel>
          <EmptyState icon={Users} title="Nobody here yet" body="Add people to a team in Organisation, then assign them tasks to see their load." />
        </Panel>
      ) : (
        <>
          <p className="-mt-2 mb-5 text-[13.5px] text-muted">
            {scopeNote} {view === "load" ? `Next ${days.length} working days, by committed hours against each person's day.` : "Today, as of " + format(now, "h:mm a") + "."}
          </p>
          {view === "load" ? (
            <LoadView people={team} tasks={tasks} teams={teams} departments={departments} leaves={leaves} days={days} now={now} onOpen={openPerson} />
          ) : (
            <PeopleView people={team} tasks={tasks} teams={teams} departments={departments} attendance={attendance} today={dayStamp} now={now} onOpen={openPerson} />
          )}
        </>
      )}

      <PersonPanel personId={openId} onClose={() => openPerson(null)} />
    </div>
  );
}
