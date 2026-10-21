"use client";

import {
  AlertOctagon,
  BellRing,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  Eye,
  Hourglass,
  Repeat,
  XCircle,
  FileEdit,
} from "lucide-react";
import type { HeatLevel, Priority, Task, TaskStatus } from "@/lib/types";
import { STATUS_LABEL, heatOf, isOverdue } from "@/lib/selectors";
import { ago, cn, dueLabel } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { Tip } from "@/components/ui/primitives";

export const HEAT = {
  0: { bar: "bg-transparent", text: "text-muted", tint: "bg-sunken", label: "On track" },
  1: { bar: "bg-heat-1", text: "text-heat-1", tint: "bg-heat-1-tint", label: "Level 1: nudging the assignee" },
  2: { bar: "bg-heat-2", text: "text-heat-2", tint: "bg-heat-2-tint", label: "Level 2: team lead told" },
  3: { bar: "bg-heat-3", text: "text-heat-3", tint: "bg-heat-3-tint", label: "Level 3: department head told" },
  4: { bar: "bg-heat-4", text: "text-heat-4", tint: "bg-heat-4-tint", label: "Level 4: owner told, no response" },
} as const;

const STATUS_STYLE: Record<TaskStatus, { icon: React.ElementType; cls: string }> = {
  draft: { icon: FileEdit, cls: "text-faint bg-sunken" },
  assigned: { icon: CircleDashed, cls: "text-heat-1 bg-heat-1-tint" },
  acknowledged: { icon: Eye, cls: "text-info bg-info-tint" },
  in_progress: { icon: CircleDot, cls: "text-ink bg-ink-tint" },
  blocked: { icon: AlertOctagon, cls: "text-heat-2 bg-heat-2-tint" },
  submitted: { icon: Hourglass, cls: "text-[#6a4fb3] bg-[#efeafb]" },
  approved: { icon: CheckCircle2, cls: "text-ok bg-ok-tint" },
  cancelled: { icon: XCircle, cls: "text-faint bg-sunken" },
};

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const S = STATUS_STYLE[status];
  const Icon = S.icon;
  return <Icon className={cn("size-[18px] shrink-0", S.cls.split(" ")[0], className)} strokeWidth={2.2} />;
}

export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  const S = STATUS_STYLE[status];
  const Icon = S.icon;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] font-medium", S.cls, className)}>
      <Icon className="size-3.5" strokeWidth={2.4} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: "text-heat-3",
  high: "text-heat-2",
  normal: "text-muted",
  low: "text-faint",
};

export function PriorityTag({ priority, hideNormal }: { priority: Priority; hideNormal?: boolean }) {
  if (hideNormal && (priority === "normal" || priority === "low")) return null;
  const bars = { urgent: 4, high: 3, normal: 2, low: 1 }[priority];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium", PRIORITY_STYLE[priority])}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("w-[3px] rounded-[1px]", i <= bars ? "bg-current" : "bg-line-strong")} style={{ height: `${i * 3}px` }} />
        ))}
      </span>
      {priority[0].toUpperCase() + priority.slice(1)}
    </span>
  );
}

export function HeatEdge({ level, className }: { level: HeatLevel; className?: string }) {
  return <span aria-hidden className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full", HEAT[level].bar, className)} />;
}

export function HeatBadge({ level, compact }: { level: HeatLevel; compact?: boolean }) {
  if (!level) return null;
  return (
    <Tip label={HEAT[level].label}>
      <span className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[12px] font-semibold", HEAT[level].tint, HEAT[level].text)}>
        <span className="flex gap-[2px]" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={cn("size-[5px] rounded-full", i <= level ? "bg-current" : "bg-current/20")} />
          ))}
        </span>
        {compact ? `L${level}` : `Level ${level}`}
      </span>
    </Tip>
  );
}

export function Due({ task, className }: { task: Task; className?: string }) {
  const overdue = isOverdue(task);
  const done = task.status === "approved" || task.status === "cancelled";
  return (
    <span className={cn("tabular whitespace-nowrap text-[12.5px]", overdue ? "font-semibold text-heat-3" : "text-muted", done && "text-faint", className)}>
      {done ? (task.approvedAt ? `Done ${ago(task.approvedAt)}` : "Closed") : dueLabel(task.dueAt)}
    </span>
  );
}

export function ReminderStat({ task, className }: { task: Task; className?: string }) {
  if (!task.remindersSent) return null;
  const ignored = task.status === "assigned" ? task.remindersIgnored : 0;
  return (
    <Tip label={`Reminded every ${task.reminder.intervalMin} min. ${task.remindersSent} sent${ignored ? `, ${ignored} not answered` : ""}. Last ${ago(task.lastReminderAt)}.`}>
      <span className={cn("inline-flex items-center gap-1 text-[12.5px] tabular", ignored >= 3 ? "text-heat-2" : "text-faint", className)}>
        <BellRing className="size-3.5" />
        {task.remindersSent}
        {ignored > 0 && <span className="text-[11.5px]">/ {ignored} unanswered</span>}
      </span>
    </Tip>
  );
}

export function ProjectTag({ id }: { id?: string }) {
  const p = useApp((s) => s.projects.find((x) => x.id === id));
  if (!p) return null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-muted">
      <span className="size-2 rounded-[3px]" style={{ background: `oklch(0.65 0.13 ${p.hue})` }} />
      {p.name}
    </span>
  );
}

export function RecurrenceTag({ task }: { task: Task }) {
  if (!task.recurrence) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-faint">
      <Repeat className="size-3.5" />
      {task.recurrence === "daily" ? "Daily" : task.recurrence === "weekly" ? "Weekly" : "Monthly"}
    </span>
  );
}

export function useHeat(task: Task) {
  return heatOf(task);
}

export { Circle };
