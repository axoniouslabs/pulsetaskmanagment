export type Role = "owner" | "manager" | "employee";

export type TaskStatus =
  | "draft"
  | "assigned"
  | "acknowledged"
  | "in_progress"
  | "blocked"
  | "submitted"
  | "approved"
  | "cancelled";

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
  devices: Device[];
}

export interface Department {
  id: string;
  name: string;
  headId: string;
  description: string;
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  leadId: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  ownerId: string;
}

export interface Project {
  id: string;
  name: string;
  hue: number;
  leadId: string;
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
}

export interface Attachment {
  id: string;
  name: string;
  kind: "image" | "file";
  sizeKb: number;
  at: string;
  byId: string;
  isProof?: boolean;
  hue?: number;
  /** where the file can be opened; absent for demo placeholders */
  url?: string;
  contentType?: string;
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
  recurrence?: "daily" | "weekly" | "monthly";
  /** the next copy of a repeating task, once it has been made */
  recurrenceNextId?: string;
  /** reminders sent today, for the daily cap */
  remindersToday?: number;
  /** tasks that must be done before this one can start */
  dependsOn?: string[];
  /** open to a whole team or group: the first person to claim it owns it */
  groupClaim?: { unitName: string; claimed: boolean; unitType?: "team" | "group"; unitId?: string };
}

export type ActivityKind =
  | "created"
  | "assigned"
  | "reassigned"
  | "acknowledged"
  | "started"
  | "reminder_sent"
  | "reminder_seen"
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
  | "timer";

export interface Activity {
  id: string;
  at: string;
  actorId: string; // person id or "system"
  kind: ActivityKind;
  taskId?: string;
  text: string;
}

export type NotificationKind =
  | "reminder"
  | "assigned"
  | "escalation"
  | "blocked"
  | "unblocked"
  | "submitted"
  | "approved"
  | "rejected"
  | "mention"
  | "announcement"
  | "question"
  | "answer"
  | "digest"
  | "deadline";

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
  kind: "announcement" | "open" | "task_feed";
  unitType: "org" | "department" | "team" | "group";
  unitId: string;
  description: string;
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
}

export interface AttendanceDay {
  personId: string;
  date: string; // yyyy-MM-dd
  checkIn?: string;
  checkOut?: string;
  breakMin: number;
  status: "present" | "late" | "absent" | "leave" | "holiday" | "weekend";
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
  approvalByDefault: boolean;
  snoozeMaxPerDay: number;
  reviewSlaHours: number;
  holidays: { date: string; name: string }[];
  digestMorning: string;
  digestEvening: string;
  retentionMonths: number;
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
    /** default deadline, in hours from when it's assigned */
    dueInHours?: number;
  };
}
