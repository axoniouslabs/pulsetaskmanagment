/**
 * Pulse database schema (Drizzle + PostgreSQL).
 *
 * Every business table carries orgId so many client companies can share one
 * deployment without seeing each other's data. Text columns hold the same
 * string unions as src/lib/types.ts (status, priority, kinds), so the domain
 * code and the database speak one vocabulary.
 *
 * Column names are snake_case in the database (drizzle `casing: "snake_case"`).
 */
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  Attachment,
  Comment,
  OrgSettings,
  ReminderRule,
  Subtask,
} from "@/lib/types";
import type { EngineState } from "@/domain/engine";
import type { NewTaskInput } from "@/domain/commands";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const ts = (name?: string) => (name ? timestamp(name, { withTimezone: true, mode: "date" }) : timestamp({ withTimezone: true, mode: "date" }));

/* ───────────────────────── Auth (Better Auth) ───────────────────────── */

export const user = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: ts().notNull(),
    token: text().notNull().unique(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts().notNull(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.identifier)],
);

/* ───────────────────────── Organisation ───────────────────────── */

export const organizations = pgTable("organizations", {
  id: text().primaryKey(),
  name: text().notNull(),
  timezone: text().notNull().default("Asia/Karachi"),
  settings: jsonb().$type<OrgSettings>().notNull(),
  /** reminder engine bookkeeping: last tick, daily reset, digests sent */
  engine: jsonb().$type<EngineState>().notNull().default({}),
  createdAt: ts().notNull().defaultNow(),
});

export const people = pgTable(
  "people",
  {
    id: text().primaryKey(),
    orgId: text()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text()
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    name: text().notNull(),
    initials: text().notNull(),
    role: text().notNull(), // owner | manager | employee
    title: text().notNull(),
    departmentId: text().notNull().default(""),
    teamId: text().notNull().default(""),
    hue: integer().notNull(),
    capacityHours: doublePrecision().notNull().default(8),
    email: text().notNull(),
    phone: text().notNull().default(""),
    workType: text().notNull().default("desk"),
    onLeave: boolean().notNull().default(false),
    backupId: text(),
    active: boolean().notNull().default(true),
    /** set when someone else chose their password; asked to change it after signing in */
    mustChangePassword: boolean().notNull().default(false),
    /** personal notification preferences, keys like "push:assigned" */
    prefs: jsonb().$type<Record<string, boolean>>().notNull().default({}),
    /** the person's own order for My Day */
    dayOrder: text().array().notNull().default([]),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.orgId)],
);

/** A phone, PC or browser that receives reminders. Holds the Web Push subscription. */
export const devices = pgTable(
  "devices",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    personId: text()
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: text().notNull(), // windows | android | iphone | browser
    label: text().notNull(),
    lastSeen: ts().notNull().defaultNow(),
    healthy: boolean().notNull().default(true),
    endpoint: text().unique(),
    p256dh: text(),
    auth: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.orgId), index().on(t.personId)],
);

export const departments = pgTable(
  "departments",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(),
    headId: text().notNull(),
    description: text().notNull().default(""),
  },
  (t) => [index().on(t.orgId)],
);

export const teams = pgTable(
  "teams",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    departmentId: text().notNull(),
    name: text().notNull(),
    leadId: text().notNull(),
  },
  (t) => [index().on(t.orgId)],
);

export const groups = pgTable(
  "groups",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""),
    memberIds: text().array().notNull().default([]),
    ownerId: text().notNull(),
    archivedAt: ts(),
  },
  (t) => [index().on(t.orgId)],
);

export const projects = pgTable(
  "projects",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(),
    hue: integer().notNull(),
    leadId: text().notNull(),
  },
  (t) => [index().on(t.orgId)],
);

/* ───────────────────────── Work ───────────────────────── */

export const tasks = pgTable(
  "tasks",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""),
    assigneeId: text().notNull(),
    createdById: text().notNull(),
    reviewerId: text().notNull(),
    projectId: text(),
    departmentId: text().notNull(),
    priority: text().notNull(),
    status: text().notNull(),
    createdAt: ts().notNull(),
    startAt: ts(),
    dueAt: ts().notNull(),
    estimateHours: doublePrecision().notNull().default(1),
    requiresApproval: boolean().notNull().default(true),
    requiresProof: boolean().notNull().default(false),
    requiresResult: boolean().notNull().default(false),
    reminder: jsonb().$type<ReminderRule>().notNull(),
    remindersSent: integer().notNull().default(0),
    remindersIgnored: integer().notNull().default(0),
    lastReminderAt: ts(),
    escalationLevel: integer().notNull().default(0),
    subtasks: jsonb().$type<Subtask[]>().notNull().default([]),
    comments: jsonb().$type<Comment[]>().notNull().default([]),
    attachments: jsonb().$type<Attachment[]>().notNull().default([]),
    watcherIds: text().array().notNull().default([]),
    tags: text().array().notNull().default([]),
    blockedReason: text(),
    blockedOwnerId: text(),
    blockedAt: ts(),
    blockedFrom: text(),
    submittedAt: ts(),
    submissionNote: text(),
    rejections: integer().notNull().default(0),
    lastRejectionReason: text(),
    acknowledgedAt: ts(),
    startedAt: ts(),
    approvedAt: ts(),
    statusChangedAt: ts().notNull(),
    snoozedUntil: ts(),
    snoozesToday: integer().notNull().default(0),
    loggedMinutes: integer().notNull().default(0),
    recurrence: text(),
    recurrenceNextId: text(),
    remindersToday: integer().notNull().default(0),
    dependsOn: text().array().notNull().default([]),
    groupClaim: jsonb().$type<{ unitName: string; claimed: boolean }>(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.orgId, t.status), index().on(t.orgId, t.assigneeId), index().on(t.orgId, t.dueAt)],
);

/** Append-only. UPDATE and DELETE are rejected by a trigger (see the migration). */
export const activity = pgTable(
  "activity",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    at: ts().notNull(),
    actorId: text().notNull(),
    kind: text().notNull(),
    taskId: text(),
    text: text().notNull(),
  },
  (t) => [index().on(t.orgId, t.at), index().on(t.taskId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    recipientId: text().notNull(),
    at: ts().notNull(),
    kind: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    taskId: text(),
    read: boolean().notNull().default(false),
    pushedAt: ts(),
    deliveredAt: ts(),
    seenAt: ts(),
  },
  (t) => [index().on(t.orgId, t.recipientId, t.at)],
);

export const timers = pgTable("timers", {
  personId: text().primaryKey(),
  orgId: text().notNull(),
  taskId: text().notNull(),
  startedAt: ts().notNull(),
});

/* ───────────────────────── Communication ───────────────────────── */

export const channels = pgTable(
  "channels",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(),
    kind: text().notNull(),
    unitType: text().notNull(),
    unitId: text().notNull(),
    description: text().notNull().default(""),
  },
  (t) => [index().on(t.orgId)],
);

export const announcements = pgTable(
  "announcements",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    authorId: text().notNull(),
    at: ts().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    requiresAck: boolean().notNull().default(false),
    ackDueAt: ts(),
    ackBy: jsonb().$type<Record<string, string>>().notNull().default({}),
    readBy: jsonb().$type<Record<string, string>>().notNull().default({}),
    pinned: boolean().notNull().default(false),
  },
  (t) => [index().on(t.orgId, t.channelId)],
);

export const questions = pgTable(
  "questions",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    fromId: text().notNull(),
    toId: text().notNull(),
    taskId: text(),
    body: text().notNull(),
    at: ts().notNull(),
    answer: text(),
    answeredAt: ts(),
  },
  (t) => [index().on(t.orgId)],
);

export const deadlineRequests = pgTable(
  "deadline_requests",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    taskId: text().notNull(),
    byId: text().notNull(),
    newDueAt: ts().notNull(),
    reason: text().notNull(),
    at: ts().notNull(),
    status: text().notNull(),
  },
  (t) => [index().on(t.orgId)],
);

/* ───────────────────────── Time ───────────────────────── */

export const attendance = pgTable(
  "attendance",
  {
    id: text().primaryKey(), // `${personId}_${date}`
    orgId: text().notNull(),
    personId: text().notNull(),
    date: text().notNull(), // yyyy-MM-dd in the org timezone
    checkIn: ts(),
    checkOut: ts(),
    breakMin: integer().notNull().default(0),
    status: text().notNull(),
  },
  (t) => [uniqueIndex().on(t.personId, t.date), index().on(t.orgId, t.date)],
);

export const leaves = pgTable(
  "leaves",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    personId: text().notNull(),
    from: text().notNull(),
    to: text().notNull(),
    type: text().notNull(),
    status: text().notNull(),
    note: text(),
  },
  (t) => [index().on(t.orgId)],
);

/** Daily per-person rollup that powers Reports. */
export const dailyStats = pgTable(
  "daily_stats",
  {
    id: text().primaryKey(), // `${personId}_${date}`
    orgId: text().notNull(),
    personId: text().notNull(),
    date: text().notNull(),
    assigned: integer().notNull(),
    approved: integer().notNull(),
    onTime: integer().notNull(),
    ackMinutes: integer().notNull(),
    remindersSent: integer().notNull(),
    ackFirst: integer().notNull(),
    submissions: integer().notNull(),
    rejections: integer().notNull(),
    estHours: doublePrecision().notNull(),
    actualHours: doublePrecision().notNull(),
    escalations: integer().notNull(),
    reviewHours: doublePrecision().notNull(),
  },
  (t) => [uniqueIndex().on(t.personId, t.date), index().on(t.orgId, t.date)],
);

/* ───────────────────────── Templates & files ───────────────────────── */

/** a saved task form ("Monthly stock count") that can be assigned again in one step */
export const templates = pgTable(
  "templates",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    name: text().notNull(),
    createdById: text().notNull(),
    input: jsonb().$type<Omit<NewTaskInput, "assigneeId" | "dueAt"> & { dueInHours?: number }>().notNull(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.orgId)],
);

/**
 * Uploaded photos and files. Stored in object storage (Vercel Blob) when it's
 * configured, otherwise in this table so a small company needs nothing extra.
 */
export const files = pgTable(
  "files",
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    taskId: text(),
    byId: text().notNull(),
    name: text().notNull(),
    contentType: text().notNull(),
    size: integer().notNull(),
    data: bytea(),
    blobUrl: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index().on(t.orgId), index().on(t.taskId)],
);
