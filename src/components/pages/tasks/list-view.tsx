"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { Role, Task, TaskStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { TaskList, TaskRow } from "@/components/app/task-row";
import { StatusIcon } from "@/components/app/task-bits";
import { LIFECYCLE, STUCK_HOURS, durationLabel, useMediaQuery, type SortKey } from "./filters";

const GROUP_NOTE: Record<Role, Partial<Record<TaskStatus, string>>> = {
  owner: {
    draft: "Only you can see these until they are published.",
    assigned: "Pulse keeps reminding until they acknowledge.",
    blocked: "Blocked time counts against the blocker, not the assignee.",
    submitted: "Reviews older than a day are escalated to you.",
  },
  manager: {
    draft: "Only you can see these until they are published.",
    assigned: "Pulse keeps reminding until they acknowledge.",
    blocked: "Blocked time counts against the blocker, not the assignee.",
    submitted: "Reviews older than a day are escalated to the owner.",
  },
  employee: {
    assigned: "Acknowledge these so reminders stop.",
    blocked: "Waiting on someone else. This never counts against you.",
    submitted: "Waiting for your reviewer. Nothing to do for now.",
  },
};

export function ListView({
  tasks,
  role,
  meId,
  sort,
  now,
}: {
  tasks: Task[];
  role: Role;
  meId: string;
  sort: SortKey;
  now: Date;
}) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const order: TaskStatus[] = [...(role === "employee" ? [] : (["draft"] as TaskStatus[])), ...LIFECYCLE, "cancelled"];
  const groups = order
    .map((status) => ({ status, items: tasks.filter((t) => t.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-7">
      {groups.map((g) => (
        <Group key={g.status} status={g.status} count={g.items.length} note={GROUP_NOTE[role][g.status]} collapsible={g.status === "approved" || g.status === "cancelled"}>
          {g.items.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showAssignee={role !== "employee" || t.assigneeId !== meId}
              showStatus={false}
              showActions={desktop}
              reason={sort === "stale" ? <StateAge task={t} now={now} /> : undefined}
            />
          ))}
        </Group>
      ))}
    </div>
  );
}

function Group({
  status,
  count,
  note,
  collapsible,
  children,
}: {
  status: TaskStatus;
  count: number;
  note?: string;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const title = status === "draft" ? "Drafts" : STATUS_LABEL[status];
  const heading = (
    <span className="flex items-center gap-2">
      <StatusIcon status={status} className="size-4" />
      <span className="text-[15px] font-semibold text-text">{title}</span>
      <span className="tabular text-[14px] text-muted">{count}</span>
    </span>
  );
  return (
    <section aria-label={title}>
      <div className="mb-2.5 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h2>
          {collapsible ? (
            <button type="button" onClick={() => setOpen((v) => !v)} className="-ml-1 flex items-center gap-1 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-sunken" aria-expanded={open}>
              <ChevronDown className={cn("size-4 text-faint transition-transform", !open && "-rotate-90")} />
              {heading}
            </button>
          ) : (
            heading
          )}
        </h2>
        {note && <p className="text-[13px] text-muted">{note}</p>}
      </div>
      {open && <TaskList>{children}</TaskList>}
    </section>
  );
}

function StateAge({ task, now }: { task: Task; now: Date }) {
  const hours = (now.getTime() - new Date(task.statusChangedAt).getTime()) / 3600000;
  const stuck = hours >= STUCK_HOURS && task.status !== "approved" && task.status !== "cancelled";
  return (
    <span className={cn(stuck ? "font-medium text-heat-2" : "text-muted")}>
      {STATUS_LABEL[task.status]} for {durationLabel(task.statusChangedAt, now)}
      {stuck ? ". Nothing has moved since." : ""}
    </span>
  );
}
