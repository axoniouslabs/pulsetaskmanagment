"use client";

import * as React from "react";
import { toast } from "sonner";
import { differenceInCalendarDays, differenceInHours, endOfDay, format, parseISO, startOfDay } from "date-fns";
import { ArrowRight, CalendarCheck, CheckCircle2, Info } from "lucide-react";
import { useApp } from "@/lib/store";
import type { DeadlineRequest, Leave, Task } from "@/lib/types";
import { isActive, isOverdue } from "@/lib/selectors";
import { ago, cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/app/avatar";
import { ProjectTag } from "@/components/app/task-bits";

function Shell({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <article className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
      <div className="p-4 sm:p-5">{children}</div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/40 px-4 py-3 sm:px-5 sm:pl-[64px]">{footer}</footer>
    </article>
  );
}

function shiftLabel(fromIso: string, toIso: string) {
  const hrs = differenceInHours(new Date(toIso), new Date(fromIso));
  if (hrs <= 0) return "earlier than now";
  if (hrs < 48) return `${hrs}h later`;
  return `${Math.round(hrs / 24)} days later`;
}

/* ---------------- more time ---------------- */
export function ExtensionItem({ request, task, now }: { request: DeadlineRequest; task: Task; now: Date }) {
  const by = useApp((s) => s.people.find((p) => p.id === request.byId));
  const openTask = useApp((s) => s.openTask);
  const decide = useApp((s) => s.decideDeadline);
  const first = by?.name.split(" ")[0] ?? "They";
  const late = isOverdue(task, now);
  const newDue = format(new Date(request.newDueAt), "EEE d MMM, h:mm a");
  const oldDue = format(new Date(task.dueAt), "EEE d MMM, h:mm a");

  return (
    <Shell
      footer={
        <>
          <Button
            variant="ok"
            onClick={() => {
              if (decide(request.id, true).ok)
                toast.success("Approved", {
                  description: `Now due ${newDue}. ${first} has been told.`,
                });
            }}
          >
            <CalendarCheck /> Approve
          </Button>
          <Button
            onClick={() => {
              if (decide(request.id, false).ok)
                toast("Declined", {
                  description: `The deadline stays ${oldDue}. ${first} has been told.`,
                });
            }}
          >
            Decline
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <Avatar person={by} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="pt-1 text-[13.5px] leading-snug text-muted">
            <span className="font-medium text-text">{by?.name}</span> asked for more time {ago(request.at, now)}
          </p>
          <button
            type="button"
            onClick={() => openTask(task.id)}
            className="relative mt-1.5 block text-left text-[16px] font-semibold leading-snug text-text underline-offset-4 before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] hover:underline"
          >
            {task.title}
          </button>
          <div className="mt-1.5">
            <ProjectTag id={task.projectId} />
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-[var(--radius-md)] border border-line p-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0">
              <p className="text-[12.5px] text-muted">Due now</p>
              <p className={cn("tabular text-[14px]", late ? "font-semibold text-heat-3" : "text-text")}>
                {oldDue}
                {late && <span className="font-normal">, already late</span>}
              </p>
            </div>
            <ArrowRight className="hidden size-4 shrink-0 text-faint sm:block" />
            <div className="min-w-0">
              <p className="text-[12.5px] text-muted">Asks for</p>
              <p className="tabular text-[14px] font-semibold text-text">
                {newDue} <span className="font-normal text-muted">({shiftLabel(task.dueAt, request.newDueAt)})</span>
              </p>
            </div>
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-text">“{request.reason}”</p>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- leave ---------------- */
const LEAVE_LABEL: Record<Leave["type"], string> = {
  sick: "Sick leave",
  annual: "Annual leave",
  casual: "Casual leave",
};

export function LeaveItem({ leave, tasks, now }: { leave: Leave; tasks: Task[]; now: Date }) {
  const person = useApp((s) => s.people.find((p) => p.id === leave.personId));
  const openTask = useApp((s) => s.openTask);
  const decide = useApp((s) => s.decideLeave);
  const first = person?.name.split(" ")[0] ?? "They";
  const from = parseISO(leave.from);
  const to = parseISO(leave.to);
  const days = differenceInCalendarDays(to, from) + 1;
  const startsIn = differenceInCalendarDays(from, now);
  const clashes = tasks.filter((t) => t.assigneeId === leave.personId && isActive(t) && new Date(t.dueAt) >= startOfDay(from) && new Date(t.dueAt) <= endOfDay(to));
  const range = days === 1 ? format(from, "EEE d MMM") : `${format(from, "EEE d MMM")} to ${format(to, "EEE d MMM")}`;
  const when = startsIn < 0 ? "already started" : startsIn === 0 ? "starts today" : startsIn === 1 ? "starts tomorrow" : `starts in ${startsIn} days`;

  return (
    <Shell
      footer={
        <>
          <Button
            variant="ok"
            onClick={() => {
              if (decide(leave.id, true).ok)
                toast.success("Approved", {
                  description: `${first} has been told.${clashes.length ? " Remember to hand over their tasks." : ""}`,
                });
            }}
          >
            <CheckCircle2 /> Approve
          </Button>
          <Button
            onClick={() => {
              if (decide(leave.id, false).ok) toast("Declined", { description: `${first} has been told.` });
            }}
          >
            Decline
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <Avatar person={person} size="md" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="pt-1 text-[13.5px] leading-snug text-muted">
            <span className="font-medium text-text">{person?.name}</span>, {person?.title}
          </p>
          <p className="mt-1.5 text-[16px] font-semibold leading-snug text-text">
            {LEAVE_LABEL[leave.type]}, {plural(days, "day")}
          </p>
          <p className="tabular mt-0.5 text-[13.5px] text-muted">
            {range}, {when}
          </p>
          {leave.note && <p className="mt-3 text-[14px] leading-relaxed text-text">“{leave.note}”</p>}

          {clashes.length > 0 ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-line p-3">
              <p className="flex items-start gap-2 text-[13.5px] text-text">
                <Info className="mt-0.5 size-4 shrink-0 text-info" />
                <span>
                  {plural(clashes.length, "task is", "tasks are")} due while {first} is away. Hand {clashes.length === 1 ? "it" : "them"} over after approving.
                </span>
              </p>
              <ul className="mt-2 space-y-1 pl-6">
                {clashes.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openTask(t.id)} className="text-left text-[13px] text-muted underline-offset-4 hover:text-text hover:underline">
                      {t.title}, {format(new Date(t.dueAt), "EEE h:mm a")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
              <CheckCircle2 className="size-4 text-ok" /> Nothing of {first}
              &rsquo;s is due during this time.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}
