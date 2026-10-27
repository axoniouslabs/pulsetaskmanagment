"use client";

import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { Paperclip, MessageSquare, ListChecks, Camera, Users } from "lucide-react";
import { EASE_EXIT, SETTLE } from "@/lib/motion";
import type { Task } from "@/lib/types";
import { useApp } from "@/lib/store";
import { heatOf } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Due, HeatBadge, HeatEdge, PriorityTag, ProjectTag, RecurrenceTag, ReminderStat, StatusIcon, StatusPill } from "./task-bits";
import { TaskActions } from "./task-actions";

/**
 * The one way a task is shown in a list. A heat edge on the left,
 * the title, then a single quiet meta line. Optional inline actions.
 */
export function TaskRow({
  task,
  showAssignee = true,
  showActions = false,
  showStatus = true,
  reason,
  className,
}: {
  task: Task;
  showAssignee?: boolean;
  showActions?: boolean;
  showStatus?: boolean;
  reason?: React.ReactNode;
  className?: string;
}) {
  const openTask = useApp((s) => s.openTask);
  const assignee = useApp((s) => s.people.find((p) => p.id === task.assigneeId));
  const heat = heatOf(task);
  const doneSubs = task.subtasks.filter((s) => s.done).length;

  // a soft glow when the status changes while the row is on screen (by you or by someone else)
  const [seen, setSeen] = React.useState(task.status);
  const [flash, setFlash] = React.useState(0);
  if (seen !== task.status) {
    setSeen(task.status);
    setFlash((f) => f + 1);
  }

  return (
    <m.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        transition: { duration: 0.22, ease: EASE_EXIT },
      }}
      transition={SETTLE}
      role="button"
      tabIndex={0}
      // only the row itself opens the task: not its buttons, and not the dialogs those
      // buttons open (React bubbles portal events up to here)
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (!e.currentTarget.contains(t) || t.closest("button, a, input, textarea, select, [role=menuitem], [role=dialog]")) return;
        openTask(task.id);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openTask(task.id);
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2 overflow-hidden border-b border-line bg-surface px-4 py-3 pl-5 transition-colors duration-150 last:border-b-0 hover:bg-hover focus-visible:bg-sunken focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
    >
      {flash > 0 && <span key={flash} aria-hidden className="pointer-events-none absolute inset-0 animate-row-flash" />}
      <HeatEdge level={heat} />
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusIcon status={task.status} className="mt-[1px]" />
        <div className="min-w-0 flex-1">
          <p
            className={cn("truncate text-[14.5px] font-medium leading-snug text-text", (task.status === "approved" || task.status === "cancelled") && "text-muted line-through decoration-line-strong")}
          >
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {showAssignee && assignee && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                <Avatar person={assignee} size="xs" />
                {assignee.name.split(" ")[0]}
                {task.groupClaim && !task.groupClaim.claimed && (
                  <span className="inline-flex items-center gap-1 text-heat-1">
                    <Users className="size-3.5" /> {task.groupClaim.unitName}, unclaimed
                  </span>
                )}
              </span>
            )}
            {heat > 0 && (
              <span className="sm:hidden">
                <HeatBadge level={heat} compact />
              </span>
            )}
            <Due task={task} />
            <PriorityTag priority={task.priority} hideNormal />
            <ProjectTag id={task.projectId} />
            <RecurrenceTag task={task} />
            <ReminderStat task={task} />
            {task.subtasks.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[12.5px] tabular text-faint">
                <ListChecks className="size-3.5" />
                {doneSubs}/{task.subtasks.length}
              </span>
            )}
            {task.comments.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[12.5px] tabular text-faint">
                <MessageSquare className="size-3.5" />
                {task.comments.length}
              </span>
            )}
            {task.requiresProof && task.status !== "approved" && (
              <span className="inline-flex items-center gap-1 text-[12.5px] text-faint">
                <Camera className="size-3.5" /> Proof
              </span>
            )}
            {task.attachments.length > 0 && !task.requiresProof && (
              <span className="inline-flex items-center gap-1 text-[12.5px] tabular text-faint">
                <Paperclip className="size-3.5" />
                {task.attachments.length}
              </span>
            )}
          </div>
          {reason && <p className="mt-1.5 text-[13px] leading-snug text-text/80">{reason}</p>}
        </div>
      </div>
      <div className={cn("flex shrink-0 items-center gap-2 pl-[30px] sm:pl-0", !showActions && !showStatus && heat === 0 && "hidden sm:flex")}>
        {heat > 0 && (
          <span className="hidden sm:inline-flex">
            <HeatBadge level={heat} compact />
          </span>
        )}
        {showStatus && <StatusPill status={task.status} className="hidden md:inline-flex" />}
        {showActions && <TaskActions task={task} size="sm" compact />}
      </div>
    </m.div>
  );
}

/** rows settle in, glide when the order changes, and fold away when they leave */
export function TaskList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)]", className)}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}
