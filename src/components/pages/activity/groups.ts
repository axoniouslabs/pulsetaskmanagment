import type { ActivityKind } from "@/lib/types";

export type EventGroup = "reminders" | "status" | "escalations" | "comments" | "attendance" | "notices";

export const GROUPS: { value: EventGroup; label: string; kinds: ActivityKind[] }[] = [
  { value: "reminders", label: "Reminders", kinds: ["reminder_sent", "reminder_delivered", "reminder_seen", "reminder_failed", "snoozed", "reminders_paused"] },
  {
    value: "status",
    label: "Status changes",
    kinds: [
      "created",
      "assigned",
      "reassigned",
      "acknowledged",
      "started",
      "blocked",
      "unblocked",
      "submitted",
      "approved",
      "rejected",
      "cancelled",
      "deadline_changed",
      "deadline_requested",
      "subtask_done",
      "timer",
    ],
  },
  { value: "escalations", label: "Escalations", kinds: ["escalated", "deescalated"] },
  { value: "comments", label: "Comments", kinds: ["commented", "question", "answered"] },
  { value: "attendance", label: "Attendance", kinds: ["check_in", "check_out", "break"] },
  { value: "notices", label: "Notices", kinds: ["announcement", "security"] },
];

export const GROUP_OF = Object.fromEntries(GROUPS.flatMap((g) => g.kinds.map((k) => [k, g.value]))) as Record<ActivityKind, EventGroup>;

export const KIND_LABEL: Record<ActivityKind, string> = {
  created: "Created",
  assigned: "Assigned",
  reassigned: "Reassigned",
  acknowledged: "Acknowledged",
  started: "Started",
  reminder_sent: "Reminder sent",
  reminder_seen: "Reminder seen",
  reminder_delivered: "Reminder delivered",
  reminder_failed: "Reminder failed",
  snoozed: "Snoozed",
  blocked: "Blocked",
  unblocked: "Unblocked",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Sent back",
  cancelled: "Cancelled",
  escalated: "Escalated",
  deescalated: "De-escalated",
  commented: "Comment",
  deadline_changed: "Deadline changed",
  deadline_requested: "More time requested",
  reminders_paused: "Reminders paused",
  check_in: "Checked in",
  check_out: "Checked out",
  announcement: "Notice",
  question: "Question",
  answered: "Answer",
  subtask_done: "Step done",
  timer: "Timer",
  break: "Break",
  security: "Account security",
};

export type DateRange = "today" | "yesterday" | "week" | "all";
