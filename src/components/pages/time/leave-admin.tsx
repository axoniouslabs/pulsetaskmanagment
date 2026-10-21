"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, Info, Plus, TreePalm } from "lucide-react";
import { useApp } from "@/lib/store";
import { isOpenWork } from "@/lib/selectors";
import type { Leave, Person } from "@/lib/types";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, SectionHeading } from "@/components/app/page-header";
import { Avatar } from "@/components/app/avatar";
import { LeaveDialog } from "./leave-dialog";
import { UpcomingHolidays } from "./my-time";
import { LEAVE_LABEL, approverFor, leaveDays, leaveRange } from "./lib";

export function LeaveAdmin({ people, now, meId, canRequest }: { people: Person[]; now: Date; meId: string; canRequest: boolean }) {
  const leaves = useApp((s) => s.leaves);
  const settings = useApp((s) => s.settings);
  const allPeople = useApp((s) => s.people);
  const teams = useApp((s) => s.teams);
  const departments = useApp((s) => s.departments);
  const today = format(now, "yyyy-MM-dd");
  const [asking, setAsking] = React.useState(false);

  const ids = React.useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const pending = React.useMemo(
    () => leaves.filter((l) => l.status === "pending" && ids.has(l.personId) && l.personId !== meId).sort((a, b) => a.from.localeCompare(b.from)),
    [leaves, ids, meId],
  );
  const upcoming = React.useMemo(
    () => leaves.filter((l) => l.status === "approved" && ids.has(l.personId) && l.to >= today).sort((a, b) => a.from.localeCompare(b.from)),
    [leaves, ids, today],
  );
  const myPending = leaves.filter((l) => l.personId === meId && l.status === "pending");
  const myApprover = approverFor({ people: allPeople, teams, departments }, meId);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-8">
        <p className="flex items-start gap-2 text-[13.5px] leading-snug text-muted">
          <Info className="mt-px size-4 shrink-0 text-faint" />
          Approved leave stops reminders and routes new tasks to the backup person.
        </p>

        <section>
          <SectionHeading title="Waiting for you" aside={pending.length ? plural(pending.length, "request") : undefined} />
          {pending.length ? (
            <Panel className="overflow-hidden">
              <ul>
                {pending.map((l) => (
                  <PendingRow key={l.id} leave={l} />
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel>
              <EmptyState icon={Check} title="No leave requests waiting" body="When someone asks for leave, it shows up here for you to approve or decline. They're notified either way." />
            </Panel>
          )}
        </section>

        <section>
          <SectionHeading title="Approved and coming up" aside={upcoming.length ? plural(upcoming.length, "person", "people") : undefined} />
          {upcoming.length ? (
            <Panel className="overflow-hidden">
              <ul>
                {upcoming.map((l) => {
                  const p = allPeople.find((x) => x.id === l.personId);
                  const backup = allPeople.find((x) => x.id === p?.backupId);
                  const current = l.from <= today;
                  return (
                    <li key={l.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <Avatar person={p} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-medium text-text">{p?.name}</p>
                        <p className="truncate text-[13px] text-muted">
                          {LEAVE_LABEL[l.type]}, {leaveRange(l)}
                        </p>
                        <p className="truncate text-[12.5px] text-faint">{backup ? `New tasks go to ${backup.name.split(" ")[0]}` : "No backup set, new tasks wait for their return"}</p>
                      </div>
                      {current && <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[12px] font-medium text-muted">On leave now</span>}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : (
            <Panel>
              <EmptyState icon={TreePalm} title="Nobody is on leave soon" body="Approved leave appears here so you can plan around it." />
            </Panel>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        {canRequest && (
          <Panel className="p-5">
            <SectionHeading title="Your own leave" />
            <p className="text-[13.5px] leading-snug text-muted">
              {myPending.length
                ? `${plural(myPending.length, "request")} waiting for ${myApprover?.name.split(" ")[0] ?? "approval"}.`
                : `Requests go to ${myApprover?.name.split(" ")[0] ?? "the owner"}. Your reminders pause on approved days.`}
            </p>
            <Button className="mt-4 w-full" onClick={() => setAsking(true)}>
              <Plus /> Request leave
            </Button>
            <LeaveDialog open={asking} onOpenChange={setAsking} today={today} approverName={myApprover?.name.split(" ")[0] ?? "the owner"} />
          </Panel>
        )}
        <UpcomingHolidays now={now} today={today} />
        <p className="px-1 text-[12.5px] leading-snug text-muted">
          {settings.workDays.length === 6 ? "Monday to Saturday" : `${settings.workDays.length} days a week`} are working days. Leave counts working days only.
        </p>
      </aside>
    </div>
  );
}

function PendingRow({ leave: l }: { leave: Leave }) {
  const decide = useApp((s) => s.decideLeave);
  const people = useApp((s) => s.people);
  const tasks = useApp((s) => s.tasks);
  const settings = useApp((s) => s.settings);
  const p = people.find((x) => x.id === l.personId);
  const first = p?.name.split(" ")[0] ?? "They";
  const backup = people.find((x) => x.id === p?.backupId);
  const due = tasks.filter((t) => t.assigneeId === l.personId && isOpenWork(t) && format(new Date(t.dueAt), "yyyy-MM-dd") >= l.from && format(new Date(t.dueAt), "yyyy-MM-dd") <= l.to).length;
  const days = leaveDays(l, settings);

  return (
    <li className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar person={p} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] text-text">
            <span className="font-medium">{p?.name}</span> <span className="text-muted">asked for {LEAVE_LABEL[l.type].toLowerCase()}</span>
          </p>
          <p className="mt-0.5 text-[13.5px] text-text">
            {leaveRange(l)}
            <span className="text-muted">, {plural(days, "working day")}</span>
          </p>
          {l.note && <p className="mt-1.5 text-[13.5px] leading-snug text-text/80">“{l.note}”</p>}
          <p className={cn("mt-1.5 text-[12.5px]", due && !backup ? "text-heat-1" : "text-faint")}>
            {due ? `${plural(due, "open task")} due in these days. ` : ""}
            {backup ? `${backup.name.split(" ")[0]} is the backup.` : "No backup person set."}
          </p>
        </div>
      </div>
      <div className="flex gap-2 pl-11 sm:pl-0 sm:pt-0.5">
        <Button
          size="sm"
          variant="ok"
          className="h-10 sm:h-8"
          onClick={() => {
            decide(l.id, true);
            toast.success("Leave approved", { description: `${first} has been told. Reminders pause on those days.` });
          }}
        >
          <Check /> Approve
        </Button>
        <Button
          size="sm"
          className="h-10 sm:h-8"
          onClick={() => {
            decide(l.id, false);
            toast("Leave declined", { description: `${first} has been told.` });
          }}
        >
          Decline
        </Button>
      </div>
    </li>
  );
}
