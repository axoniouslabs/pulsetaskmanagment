import "server-only";
import { z } from "zod";
import type { Command } from "@/domain/commands";

const id = z.string().min(1).max(80);
const text = (max = 2000) => z.string().max(max);
const iso = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "Pick a valid date and time.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

const reminder = z
  .object({
    intervalMin: z.number().int().min(5).max(10080),
    window: z.enum(["working", "always"]),
    dailyCap: z.number().int().min(1).max(100),
    channels: z.array(z.enum(["push", "inapp", "email", "whatsapp"])),
    quietAfterAckMin: z.number().int().min(0).max(1440),
  })
  .partial();

const repeatRule = z.object({
  freq: z.enum(["day", "week", "month"]),
  interval: z.number().int().min(1).max(365),
  workingDays: z.boolean().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  monthly: z
    .union([
      z.object({ kind: z.literal("date"), day: z.number().int().min(1).max(31) }),
      z.object({ kind: z.literal("weekday"), nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]), weekday: z.number().int().min(0).max(6) }),
    ])
    .optional(),
  mode: z.enum(["schedule", "afterDone"]),
  afterDays: z.number().int().min(1).max(365).optional(),
  ends: z
    .union([z.object({ kind: z.literal("never") }), z.object({ kind: z.literal("count"), count: z.number().int().min(1).max(1000) }), z.object({ kind: z.literal("date"), date: day })])
    .optional(),
  missed: z.enum(["pile", "close"]).optional(),
});

const newTask = z.object({
  title: text(200).min(1, "Add a title so the assignee knows what to do."),
  description: text(5000).optional(),
  // empty when a unit or a project rule decides who gets it
  assigneeId: z.string().max(80),
  priority: z.enum(["urgent", "high", "normal", "low"]),
  dueAt: iso,
  startAt: iso.optional(),
  estimateHours: z.number().min(0).max(500).optional(),
  projectId: z.string().max(80).optional(),
  requiresApproval: z.boolean().optional(),
  requiresProof: z.boolean().optional(),
  requiresResult: z.boolean().optional(),
  reminder: reminder.optional(),
  subtasks: z.array(text(300)).max(50).optional(),
  tags: z.array(text(40)).max(20).optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
  repeat: repeatRule.optional(),
  draft: z.boolean().optional(),
  dependsOn: z.array(id).max(20).optional(),
  claim: z.object({ unitType: z.enum(["department", "team", "group"]), unitId: id }).optional(),
  pool: z.object({ unitType: z.enum(["department", "team", "group"]), unitId: id, mode: z.enum(["roundrobin", "route"]) }).optional(),
  watcherIds: z.array(id).max(30).optional(),
  reviewerId: id.optional(),
  dueAllDay: z.boolean().optional(),
  updateEveryDays: z.number().int().min(1).max(30).optional(),
});

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 09:00.");
const timeZone = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Pick a time zone from the list.");
const workDays = z.array(z.number().int().min(0).max(6)).max(7);
const schedule = z.object({ timezone: timeZone.optional(), workDays: workDays.optional(), workStart: hhmm.optional(), workEnd: hhmm.optional() });
const departmentSettings = z.object({
  workDays: workDays.optional(),
  workStart: hhmm.optional(),
  workEnd: hhmm.optional(),
  defaultReminder: z
    .object({
      intervalMin: z.number().int().min(5).max(10080),
      window: z.enum(["working", "always"]),
      dailyCap: z.number().int().min(1).max(100),
    })
    .partial()
    .optional(),
  approvalByDefault: z.boolean().optional(),
});

const taskPatch = z
  .object({
    title: text(200),
    description: text(5000),
    priority: z.enum(["urgent", "high", "normal", "low"]),
    estimateHours: z.number().min(0).max(500),
    projectId: z.string().max(80).nullable(),
    tags: z.array(text(40)).max(20),
    startAt: iso.nullable(),
    requiresApproval: z.boolean(),
    requiresProof: z.boolean(),
    requiresResult: z.boolean(),
    reminder,
    recurrence: z.enum(["daily", "weekly", "monthly"]).nullable(),
    repeat: repeatRule.nullable(),
    dependsOn: z.array(id).max(20),
    watcherIds: z.array(id).max(30),
    reviewerId: id,
    dueAllDay: z.boolean(),
    updateEveryDays: z.number().int().min(1).max(30).nullable(),
  })
  .partial();

const templateInput = z.object({
  title: text(200).min(1, "A template needs a task title."),
  description: text(5000).optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]),
  estimateHours: z.number().min(0).max(500).optional(),
  projectId: z.string().max(80).optional(),
  requiresApproval: z.boolean().optional(),
  requiresProof: z.boolean().optional(),
  requiresResult: z.boolean().optional(),
  reminder: reminder.optional(),
  subtasks: z.array(text(300)).max(50).optional(),
  tags: z.array(text(40)).max(20).optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
  repeat: repeatRule.optional(),
  dueInHours: z
    .number()
    .min(0)
    .max(24 * 366)
    .optional(),
});

const settingsPatch = z
  .object({
    name: text(120),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "Pick a time zone from the list."),
    workDays: z.array(z.number().int().min(0).max(6)),
    workStart: z.string().regex(/^\d{2}:\d{2}$/),
    workEnd: z.string().regex(/^\d{2}:\d{2}$/),
    defaultReminder: reminder.required(),
    escalation: z.object({
      l1Ignored: z.number().int().min(1),
      l2Ignored: z.number().int().min(1),
      l3Ignored: z.number().int().min(1),
      l4HoursPastDue: z.number().min(1),
    }),
    urgentEscalation: z.object({
      l1Ignored: z.number().int().min(1),
      l2Ignored: z.number().int().min(1),
      l3Ignored: z.number().int().min(1),
      l4HoursPastDue: z.number().min(1),
    }),
    approvalByDefault: z.boolean(),
    snoozeMaxPerDay: z.number().int().min(0).max(20),
    reviewSlaHours: z.number().min(1).max(720),
    digestMorning: z.string().regex(/^\d{2}:\d{2}$/),
    digestEvening: z.string().regex(/^\d{2}:\d{2}$/),
    retentionMonths: z.number().int().min(12).max(120),
    idleDays: z.number().int().min(1).max(60),
    autoArchiveDays: z.number().int().min(1).max(365),
    lowPriorityNoApproval: z.boolean(),
    // a small image, resized in the browser before it is sent
    logoUrl: z.union([
      z.literal(""),
      z
        .string()
        .max(120_000)
        .regex(/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/, "Upload a PNG, JPG or WebP image."),
    ]),
  })
  .partial();

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createTask"), id, input: newTask }),
  z.object({ type: z.literal("editTask"), taskId: id, patch: taskPatch }),
  z.object({
    type: z.literal("saveTemplate"),
    id,
    name: text(100),
    input: templateInput,
  }),
  z.object({ type: z.literal("deleteTemplate"), id }),
  z.object({ type: z.literal("publishDraft"), taskId: id }),
  z.object({ type: z.literal("claimTask"), taskId: id }),
  z.object({ type: z.literal("acknowledge"), taskId: id }),
  z.object({ type: z.literal("start"), taskId: id }),
  z.object({
    type: z.literal("snooze"),
    taskId: id,
    minutes: z.number().int(),
  }),
  z.object({
    type: z.literal("block"),
    taskId: id,
    reason: text(500),
    blockerOwnerId: id.optional(),
  }),
  z.object({
    type: z.literal("unblock"),
    taskId: id,
    note: text(500).optional(),
  }),
  z.object({ type: z.literal("submit"), taskId: id, note: text(2000) }),
  z.object({
    type: z.literal("approve"),
    taskId: id,
    note: text(1000).optional(),
  }),
  z.object({ type: z.literal("reject"), taskId: id, reason: text(1000) }),
  z.object({ type: z.literal("cancel"), taskId: id, reason: text(500) }),
  z.object({
    type: z.literal("reassign"),
    taskId: id,
    toId: id,
    reason: text(500),
  }),
  z.object({
    type: z.literal("changeDeadline"),
    taskId: id,
    newDueAt: iso,
    reason: text(500),
  }),
  z.object({
    type: z.literal("requestDeadline"),
    taskId: id,
    newDueAt: iso,
    reason: text(500),
  }),
  z.object({
    type: z.literal("decideDeadline"),
    requestId: id,
    approve: z.boolean(),
  }),
  z.object({ type: z.literal("toggleSubtask"), taskId: id, subtaskId: id }),
  z.object({ type: z.literal("addSubtask"), taskId: id, title: text(300) }),
  z.object({
    type: z.literal("addComment"),
    taskId: id,
    body: text(4000),
    kind: z.enum(["text", "voice"]).optional(),
    durationSec: z.number().int().min(0).max(600).optional(),
    parentId: id.optional(),
  }),
  z.object({
    type: z.literal("addAttachment"),
    taskId: id,
    name: text(200),
    kind: z.enum(["image", "file"]),
    fileId: id.optional(),
    url: z
      .string()
      .max(500)
      .regex(/^\/api\/files\//, "Upload the file first.")
      .optional(),
    sizeKb: z.number().int().min(0).max(100000).optional(),
    contentType: text(120).optional(),
    proof: z.boolean().optional(),
    capturedAt: iso.optional(),
    location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(100000).optional() }).optional(),
  }),
  z.object({ type: z.literal("stopTimer"), at: iso.optional() }),
  z.object({ type: z.literal("setWatching"), taskId: id, watch: z.boolean() }),
  z.object({ type: z.literal("archiveTask"), taskId: id, archived: z.boolean() }),
  z.object({ type: z.literal("setProgress"), taskId: id, pct: z.number().min(0).max(100), note: text(500) }),
  z.object({ type: z.literal("escalateReview"), taskId: id, note: text(500) }),
  z.object({ type: z.literal("addLink"), taskId: id, url: text(1000), title: text(200).optional() }),
  z.object({ type: z.literal("addTimeEntry"), taskId: id, minutes: z.number().int().min(1).max(960), date: day, note: text(500) }),
  z.object({ type: z.literal("correctTimeEntry"), taskId: id, entryId: id, minutes: z.number().int().min(0).max(960), reason: text(300) }),
  z.object({
    type: z.literal("correctAttendance"),
    personId: id,
    date: day,
    checkIn: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
    checkOut: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
    reason: text(300),
  }),
  z.object({ type: z.literal("recordLeave"), personId: id, from: day, to: day, leaveType: z.enum(["sick", "annual", "casual"]), note: text(300) }),
  z.object({ type: z.literal("editComment"), taskId: id, commentId: id, body: text(4000) }),
  z.object({ type: z.literal("routeTask"), taskId: id, toId: id }),
  z.object({ type: z.literal("startBreak") }),
  z.object({ type: z.literal("endBreak") }),
  z.object({ type: z.literal("addProject"), id, name: text(100), leadId: id, defaultAssigneeId: id.optional() }),
  z.object({
    type: z.literal("editProject"),
    projectId: id,
    patch: z.object({ name: text(100), leadId: id, defaultAssigneeId: id.nullable() }).partial(),
  }),
  z.object({
    type: z.literal("updateDepartment"),
    departmentId: id,
    patch: z.object({ name: text(100), description: text(300), settings: departmentSettings.nullable() }).partial(),
  }),
  z.object({ type: z.literal("setPersonSchedule"), personId: id, schedule: schedule.nullable() }),
  z.object({ type: z.literal("setSecondaryTeams"), personId: id, teamIds: z.array(id).max(20) }),
  z.object({ type: z.literal("setBackup"), personId: id, backupId: id.nullable() }),
  z.object({ type: z.literal("markRead"), id }),
  z.object({ type: z.literal("markAllRead") }),
  z.object({
    type: z.literal("postAnnouncement"),
    channelId: id,
    title: text(200),
    body: text(5000),
    requiresAck: z.boolean(),
    ackDueAt: iso.optional(),
  }),
  z.object({ type: z.literal("ackAnnouncement"), id }),
  z.object({ type: z.literal("remindAnnouncement"), id }),
  z.object({ type: z.literal("readAnnouncement"), id }),
  z.object({
    type: z.literal("askQuestion"),
    toId: id,
    body: text(2000),
    taskId: id.optional(),
  }),
  z.object({ type: z.literal("answerQuestion"), id, answer: text(2000) }),
  z.object({ type: z.literal("checkIn") }),
  z.object({ type: z.literal("checkOut") }),
  z.object({
    type: z.literal("requestLeave"),
    input: z.object({
      from: day,
      to: day,
      type: z.enum(["sick", "annual", "casual"]),
      note: text(500).optional(),
    }),
  }),
  z.object({ type: z.literal("decideLeave"), id, approve: z.boolean() }),
  z.object({ type: z.literal("updateSettings"), patch: settingsPatch }),
  z.object({ type: z.literal("addHoliday"), date: day, name: text(100) }),
  z.object({ type: z.literal("removeHoliday"), date: day }),
  z.object({
    type: z.literal("addDepartment"),
    name: text(100),
    headId: id,
    description: text(300),
  }),
  z.object({
    type: z.literal("addTeam"),
    name: text(100),
    departmentId: id,
    leadId: id,
  }),
  z.object({
    type: z.literal("addGroup"),
    name: text(100),
    description: text(300),
    memberIds: z.array(id).max(200),
  }),
  z.object({ type: z.literal("movePerson"), personId: id, teamId: id }),
  z.object({ type: z.literal("setTeamLead"), teamId: id, personId: id }),
  z.object({
    type: z.literal("setDepartmentHead"),
    departmentId: id,
    personId: id,
  }),
  z.object({
    type: z.literal("setOnLeave"),
    personId: id,
    onLeave: z.boolean(),
  }),
  z.object({ type: z.literal("setPref"), key: text(80), value: z.boolean() }),
  z.object({ type: z.literal("setDayOrder"), ids: z.array(id).max(500) }),
  z.object({ type: z.literal("setPrefFor"), personId: id, key: text(80), value: z.boolean().nullable() }),
  z.object({ type: z.literal("editGroup"), groupId: id, name: text(100).optional(), description: text(300).optional(), memberIds: z.array(id).max(200).optional() }),
  z.object({ type: z.literal("archiveGroup"), groupId: id, archived: z.boolean() }),
  z.object({
    type: z.literal("addChannel"),
    id: z
      .string()
      .regex(/^ch_[a-z0-9]{6,30}$/)
      .optional(),
    name: text(80),
    kind: z.enum(["open", "announcement", "private"]),
    unitType: z.enum(["org", "department", "team", "group"]),
    unitId: id,
    description: text(300),
    memberIds: z.array(id).max(200).optional(),
  }),
  z.object({ type: z.literal("editChannel"), channelId: id, name: text(80).optional(), description: text(300).optional(), memberIds: z.array(id).max(200).optional() }),
  z.object({ type: z.literal("archiveChannel"), channelId: id, archived: z.boolean() }),
  z.object({ type: z.literal("addPin"), channelId: id, title: text(120), url: text(1000).optional(), fileId: id.optional(), fileName: text(200).optional() }),
  z.object({ type: z.literal("removePin"), channelId: id, pinId: id }),
  z.object({ type: z.literal("replyNotice"), id, body: text(2000) }),
  z.object({ type: z.literal("setAvailability"), personId: id, note: text(120), until: iso.optional() }),
  z.object({ type: z.literal("purgeContact"), personId: id }),
  z.object({ type: z.literal("archiveTeam"), teamId: id }),
  z.object({ type: z.literal("archiveDepartment"), departmentId: id }),
  z.object({ type: z.literal("setTeamMember"), teamId: id, personId: id, member: z.boolean() }),
  z.object({
    type: z.literal("setSavedViews"),
    views: z.array(z.object({ id, name: text(60), filters: z.record(z.string(), z.unknown()).refine((f) => JSON.stringify(f).length < 4000, "That view is too large."), sort: text(20) })).max(30),
  }),
]);

export function validateCommand(raw: unknown): Command {
  const r = schema.safeParse(raw);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "That request didn't make sense.");
  return r.data as Command;
}
