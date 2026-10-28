export type Role = "owner" | "manager" | "employee";

export type TaskStatus = "draft" | "assigned" | "acknowledged" | "in_progress" | "blocked" | "submitted" | "approved" | "cancelled";

export type Priority = "urgent" | "high" | "normal" | "low";
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface Device {
  id: string;
  kind: "windows" | "android" | "iphone" | "browser";
  label: string;
  lastSeen: string;
  healthy: boolean;
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  role: Role;
  title: string;
  departmentId: string;
  teamId: string;
  hue: number; // avatar colour hue
  capacityHours: number;
  email: string;
  phone: string;
  workType: "desk" | "field";
  onLeave?: boolean;
  backupId?: string;
  active?: boolean;
  mustChangePassword?: boolean;
  /** this person's own hours or time zone, when they differ from their department's and the company's */
  schedule?: WorkSchedule;
  /** other teams this person also works in; their home team (teamId) is still where escalation goes */
  secondaryTeamIds?: string[];
  /** a short note on when they're around ("At the Lahore depot until 3"); clears itself after `until` */
  availability?: { note: string; until?: string; at: string };
  /** a deactivated person's phone and email were wiped; their history stays */
  contactPurgedAt?: string;
  devices: Device[];
}

/** working hours and time zone; any field left out comes from the level above */
export interface WorkSchedule {
  timezone?: string;
  workDays?: number[];
  workStart?: string;
  workEnd?: string;
}

/** a department's own rules, overriding the company defaults for everyone in it */
export interface DepartmentSettings extends Omit<WorkSchedule, "timezone"> {
  defaultReminder?: Partial<ReminderRule>;
  approvalByDefault?: boolean;
}

export interface Department {
  id: string;
  name: string;
  headId: string;
  description: string;
  settings?: DepartmentSettings;
  archivedAt?: string;
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  leadId: string;
  archivedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  ownerId: string;
  /** archived when its purpose ends; its history and channel stay readable */
  archivedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  hue: number;
  leadId: string;
  /** rule-based assignment: new tasks in this project go to this person unless someone else is picked */
  defaultAssigneeId?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  at: string;
  kind: "text" | "voice";
  durationSec?: number;
  /** a reply to another comment on the same task */
  parentId?: string;
  /** set when the author changed the text; earlier versions are kept in history */
  editedAt?: string;
  history?: { body: string; at: string }[];
}

/**
 * A repeat rule (spec §6): daily, weekly on chosen days, monthly on a date or
 * an nth weekday, or every N days; on a fixed schedule or N days after the
 * last one was approved; ending never, after N copies, or on a date.
 */
export interface RepeatRule {
  freq: "day" | "week" | "month";
  /** every N days / weeks / months */
  interval: number;
  /** day: skip days off and holidays */
  workingDays?: boolean;
  /** week: which weekdays (0 = Sunday) */
  weekdays?: number[];
  /** month: on a date (1-31, clamped to short months) or the nth weekday (-1 = last) */
  monthly?: { kind: "date"; day: number } | { kind: "weekday"; nth: 1 | 2 | 3 | 4 | -1; weekday: number };
  /** fixed schedule, or the next one N days after the last is approved */
  mode: "schedule" | "afterDone";
  afterDays?: number;
  ends?: { kind: "never" } | { kind: "count"; count: number } | { kind: "date"; date: string };
  /** an unfinished copy when the next is due: let them pile up (capped), or close the old one as missed */
  missed?: "pile" | "close";
}

/** a stretch of work on a task: from the timer, or added by hand for work done away from Pulse */
export interface TimeEntry {
  id: string;
  personId: string;
  minutes: number;
  /** when the work started (timer) or the day it was done (manual) */
  from: string;
  to?: string;
  manual?: boolean;
  /** stopped by Pulse at the end of working hours, not by the person */
  autoStopped?: boolean;
  /** changed by a manager afterwards: what it was, who changed it and why (0 minutes = struck out) */
  corrected?: { fromMinutes: number; byId: string; at: string; reason: string };
  note?: string;
  /** who added a manual entry, when it wasn't the person themselves */
  byId?: string;
}

/** work aimed at a unit that Pulse hands to one person: by turns, or through the unit's head */
export interface TaskPool {
  unitType: "department" | "team" | "group";
  unitId: string;
  unitName: string;
  mode: "roundrobin" | "route";
  /** route: when the head passed it on */
  routedAt?: string;
  /** round-robin: whose turn it was (the assignee may change later) */
  pickedId?: string;
}

export interface Attachment {
  id: string;
  name: string;
  kind: "image" | "file" | "link";
  sizeKb: number;
  at: string;
  byId: string;
  isProof?: boolean;
  hue?: number;
  /** where the file can be opened; absent for demo placeholders */
  url?: string;
  contentType?: string;
  /** when the photo was taken, from the device (upload time is `at`) */
  capturedAt?: string;
  /** where a proof photo was taken, when the phone shared it */
  location?: { lat: number; lng: number; accuracyM?: number };
}

export type Channel = "push" | "inapp" | "email" | "whatsapp";

export interface ReminderRule {
  intervalMin: number;
  window: "working" | "always";
  dailyCap: number;
  channels: Channel[];
  quietAfterAckMin: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  createdById: string;
  reviewerId: string;
  projectId?: string;
  departmentId: string;
  priority: Priority;
  status: TaskStatus;
  createdAt: string;
  startAt?: string;
  dueAt: string;
  estimateHours: number;
  requiresApproval: boolean;
  requiresProof: boolean;
  requiresResult: boolean;
  reminder: ReminderRule;
  remindersSent: number;
  remindersIgnored: number;
  lastReminderAt?: string;
  escalationLevel: HeatLevel;
  subtasks: Subtask[];
  comments: Comment[];
  attachments: Attachment[];
  watcherIds: string[];
  tags: string[];
  blockedReason?: string;
  blockedOwnerId?: string;
  blockedAt?: string;
  blockedFrom?: TaskStatus;
  submittedAt?: string;
  submissionNote?: string;
  rejections: number;
  lastRejectionReason?: string;
  acknowledgedAt?: string;
  startedAt?: string;
  approvedAt?: string;
  statusChangedAt: string;
  snoozedUntil?: string;
  snoozesToday: number;
  loggedMinutes: number;
  /** the simple repeat from before repeat rules; still read, see ruleOf() */
  recurrence?: "daily" | "weekly" | "monthly";
  /** how it repeats: which days, how often, until when, and what happens to missed copies */
  repeat?: RepeatRule;
  /** which copy in its series this is (1 for the first) */
  repeatIndex?: number;
  /** the next copy of a repeating task, once it has been made */
  recurrenceNextId?: string;
  /** reminders sent today, for the daily cap */
  remindersToday?: number;
  /** tasks that must be done before this one can start */
  dependsOn?: string[];
  /** open to a whole team or group: the first person to claim it owns it */
  groupClaim?: { unitName: string; claimed: boolean; unitType?: "department" | "team" | "group"; unitId?: string };
  /** handed out by turns, or routed through a unit head */
  pool?: TaskPool;
  /** every work session and manual entry; loggedMinutes is their total */
  timeEntries?: TimeEntry[];
  /** set when the engine flagged it as idle in progress; cleared by any activity */
  idleFlaggedAt?: string;
  /** due on a day, not at a time: it counts as due at the end of the assignee's working day */
  dueAllDay?: boolean;
  /** when it actually turns overdue: the next working moment at or after the deadline */
  overdueAt?: string;
  /** hidden from the usual lists, kept and searchable */
  archivedAt?: string;
  /** how far along the assignee says it is, 0 to 100, with their latest one-line update */
  progress?: number;
  progressNote?: string;
  progressAt?: string;
  /** the assignee is asked for a progress update this often while it's open */
  updateEveryDays?: number;
  lastUpdateRemindedAt?: string;
}

export type ActivityKind =
  | "created"
  | "assigned"
  | "reassigned"
  | "acknowledged"
  | "started"
  | "reminder_sent"
  | "reminder_seen"
  | "reminder_delivered"
  | "reminder_failed"
  | "snoozed"
  | "blocked"
  | "unblocked"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "escalated"
  | "deescalated"
  | "commented"
  | "deadline_changed"
  | "deadline_requested"
  | "reminders_paused"
  | "check_in"
  | "check_out"
  | "announcement"
  | "question"
  | "answered"
  | "subtask_done"
  | "timer"
  | "break"
  | "security";

export interface Activity {
  id: string;
  at: string;
  actorId: string; // person id or "system"
  kind: ActivityKind;
  taskId?: string;
  text: string;
  /** whose record this counts against in reports: the assignee for their reminders, the reviewer for a slow review, the blocker for a block */
  aboutId?: string;
}

export type NotificationKind =
  "reminder" | "assigned" | "escalation" | "blocked" | "unblocked" | "submitted" | "approved" | "rejected" | "mention" | "announcement" | "question" | "answer" | "digest" | "deadline";

export interface AppNotification {
  id: string;
  at: string;
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId?: string;
  read: boolean;
}

export interface ChannelSpace {
  id: string;
  name: string;
  kind: "announcement" | "open" | "task_feed" | "private";
  unitType: "org" | "department" | "team" | "group";
  unitId: string;
  description: string;
  /** private channels only: who was invited (the creator always is) */
  memberIds?: string[];
  createdById?: string;
  archivedAt?: string;
  /** SOPs, templates, contact lists, shared files: what people ask for repeatedly */
  pins?: ChannelPin[];
}

export interface ChannelPin {
  id: string;
  title: string;
  /** a link, or a file shared with the unit */
  url?: string;
  fileId?: string;
  fileName?: string;
  byId: string;
  at: string;
}

export interface NoticeReply {
  id: string;
  authorId: string;
  at: string;
  body: string;
}

export interface Announcement {
  id: string;
  channelId: string;
  authorId: string;
  at: string;
  title: string;
  body: string;
  requiresAck: boolean;
  ackDueAt?: string;
  ackBy: Record<string, string>;
  readBy: Record<string, string>;
  pinned?: boolean;
  /** discussion under a post */
  replies?: NoticeReply[];
}

export interface AttendanceDay {
  personId: string;
  date: string; // yyyy-MM-dd
  checkIn?: string;
  checkOut?: string;
  breakMin: number;
  /** breaks taken today; an open one has no end yet */
  breaks?: { start: string; end?: string }[];
  status: "present" | "late" | "absent" | "leave" | "holiday" | "weekend";
  /** fixed by a manager (a forgotten check-out, a wrong time): who, when and why */
  corrected?: { byId: string; at: string; reason: string };
}

export interface Leave {
  id: string;
  personId: string;
  from: string;
  to: string;
  type: "sick" | "annual" | "casual";
  status: "approved" | "pending" | "declined";
  note?: string;
}

export interface Question {
  id: string;
  fromId: string;
  toId: string;
  taskId?: string;
  body: string;
  at: string;
  answer?: string;
  answeredAt?: string;
}

export interface DeadlineRequest {
  id: string;
  taskId: string;
  byId: string;
  newDueAt: string;
  reason: string;
  at: string;
  status: "pending" | "approved" | "declined";
}

export interface OrgSettings {
  name: string;
  timezone: string;
  workDays: number[]; // 0 = Sunday
  workStart: string; // "09:00"
  workEnd: string; // "18:00"
  defaultReminder: ReminderRule;
  escalation: { l1Ignored: number; l2Ignored: number; l3Ignored: number; l4HoursPastDue: number };
  /** tighter thresholds for urgent tasks (spec §15); the normal ones apply when unset */
  urgentEscalation?: { l1Ignored: number; l2Ignored: number; l3Ignored: number; l4HoursPastDue: number };
  approvalByDefault: boolean;
  snoozeMaxPerDay: number;
  reviewSlaHours: number;
  holidays: { date: string; name: string }[];
  digestMorning: string;
  digestEvening: string;
  retentionMonths: number;
  /** in-progress work with no activity for this many days is flagged as idle */
  idleDays?: number;
  /** finished work leaves the lists this many days after it closed (it stays searchable) */
  autoArchiveDays?: number;
  /** the company logo, shown in the sidebar and on the sign-in page */
  logoUrl?: string;
  /** the owner lets managers skip review on low-priority work (spec §10, optional bypass) */
  lowPriorityNoApproval?: boolean;
}

/** a named set of task filters, kept on the person's account so it follows them across devices */
export interface StoredView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sort: string;
}

export interface Timer {
  taskId: string;
  startedAt: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  input: {
    title: string;
    description?: string;
    priority: Priority;
    estimateHours?: number;
    projectId?: string;
    requiresApproval?: boolean;
    requiresProof?: boolean;
    requiresResult?: boolean;
    reminder?: Partial<ReminderRule>;
    subtasks?: string[];
    tags?: string[];
    recurrence?: Task["recurrence"];
    repeat?: RepeatRule;
    /** default deadline, in hours from when it's assigned */
    dueInHours?: number;
  };
}
