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

const newTask = z.object({
  title: text(200).min(1, "Add a title so the assignee knows what to do."),
  description: text(5000).optional(),
  assigneeId: id,
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
  draft: z.boolean().optional(),
  dependsOn: z.array(id).max(20).optional(),
  claim: z.object({ unitType: z.enum(["team", "group"]), unitId: id }).optional(),
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
    dependsOn: z.array(id).max(20),
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
  dueInHours: z.number().min(0).max(24 * 366).optional(),
});

const settingsPatch = z
  .object({
    name: text(120),
    workDays: z.array(z.number().int().min(0).max(6)),
    workStart: z.string().regex(/^\d{2}:\d{2}$/),
    workEnd: z.string().regex(/^\d{2}:\d{2}$/),
    defaultReminder: reminder.required(),
    escalation: z.object({ l1Ignored: z.number().int().min(1), l2Ignored: z.number().int().min(1), l3Ignored: z.number().int().min(1), l4HoursPastDue: z.number().min(1) }),
    approvalByDefault: z.boolean(),
    snoozeMaxPerDay: z.number().int().min(0).max(20),
    reviewSlaHours: z.number().min(1).max(720),
    digestMorning: z.string().regex(/^\d{2}:\d{2}$/),
    digestEvening: z.string().regex(/^\d{2}:\d{2}$/),
    retentionMonths: z.number().int().min(12).max(120),
  })
  .partial();

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createTask"), id, input: newTask }),
  z.object({ type: z.literal("editTask"), taskId: id, patch: taskPatch }),
  z.object({ type: z.literal("saveTemplate"), id, name: text(100), input: templateInput }),
  z.object({ type: z.literal("deleteTemplate"), id }),
  z.object({ type: z.literal("publishDraft"), taskId: id }),
  z.object({ type: z.literal("claimTask"), taskId: id }),
  z.object({ type: z.literal("acknowledge"), taskId: id }),
  z.object({ type: z.literal("start"), taskId: id }),
  z.object({ type: z.literal("snooze"), taskId: id, minutes: z.number().int() }),
  z.object({ type: z.literal("block"), taskId: id, reason: text(500), blockerOwnerId: id.optional() }),
  z.object({ type: z.literal("unblock"), taskId: id, note: text(500).optional() }),
  z.object({ type: z.literal("submit"), taskId: id, note: text(2000) }),
  z.object({ type: z.literal("approve"), taskId: id, note: text(1000).optional() }),
  z.object({ type: z.literal("reject"), taskId: id, reason: text(1000) }),
  z.object({ type: z.literal("cancel"), taskId: id, reason: text(500) }),
  z.object({ type: z.literal("reassign"), taskId: id, toId: id, reason: text(500) }),
  z.object({ type: z.literal("changeDeadline"), taskId: id, newDueAt: iso, reason: text(500) }),
  z.object({ type: z.literal("requestDeadline"), taskId: id, newDueAt: iso, reason: text(500) }),
  z.object({ type: z.literal("decideDeadline"), requestId: id, approve: z.boolean() }),
  z.object({ type: z.literal("toggleSubtask"), taskId: id, subtaskId: id }),
  z.object({ type: z.literal("addSubtask"), taskId: id, title: text(300) }),
  z.object({ type: z.literal("addComment"), taskId: id, body: text(4000), kind: z.enum(["text", "voice"]).optional(), durationSec: z.number().int().min(0).max(600).optional() }),
  z.object({
    type: z.literal("addAttachment"),
    taskId: id,
    name: text(200),
    kind: z.enum(["image", "file"]),
    fileId: id.optional(),
    url: z.string().max(500).regex(/^\/api\/files\//, "Upload the file first.").optional(),
    sizeKb: z.number().int().min(0).max(100000).optional(),
    contentType: text(120).optional(),
    proof: z.boolean().optional(),
  }),
  z.object({ type: z.literal("stopTimer") }),
  z.object({ type: z.literal("markRead"), id }),
  z.object({ type: z.literal("markAllRead") }),
  z.object({ type: z.literal("postAnnouncement"), channelId: id, title: text(200), body: text(5000), requiresAck: z.boolean(), ackDueAt: iso.optional() }),
  z.object({ type: z.literal("ackAnnouncement"), id }),
  z.object({ type: z.literal("readAnnouncement"), id }),
  z.object({ type: z.literal("askQuestion"), toId: id, body: text(2000), taskId: id.optional() }),
  z.object({ type: z.literal("answerQuestion"), id, answer: text(2000) }),
  z.object({ type: z.literal("checkIn") }),
  z.object({ type: z.literal("checkOut") }),
  z.object({ type: z.literal("requestLeave"), input: z.object({ from: day, to: day, type: z.enum(["sick", "annual", "casual"]), note: text(500).optional() }) }),
  z.object({ type: z.literal("decideLeave"), id, approve: z.boolean() }),
  z.object({ type: z.literal("updateSettings"), patch: settingsPatch }),
  z.object({ type: z.literal("addHoliday"), date: day, name: text(100) }),
  z.object({ type: z.literal("removeHoliday"), date: day }),
  z.object({ type: z.literal("addDepartment"), name: text(100), headId: id, description: text(300) }),
  z.object({ type: z.literal("addTeam"), name: text(100), departmentId: id, leadId: id }),
  z.object({ type: z.literal("addGroup"), name: text(100), description: text(300), memberIds: z.array(id).max(200) }),
  z.object({ type: z.literal("movePerson"), personId: id, teamId: id }),
  z.object({ type: z.literal("setTeamLead"), teamId: id, personId: id }),
  z.object({ type: z.literal("setDepartmentHead"), departmentId: id, personId: id }),
  z.object({ type: z.literal("setOnLeave"), personId: id, onLeave: z.boolean() }),
  z.object({ type: z.literal("setPref"), key: text(80), value: z.boolean() }),
  z.object({ type: z.literal("setDayOrder"), ids: z.array(id).max(500) }),
]);

export function validateCommand(raw: unknown): Command {
  const r = schema.safeParse(raw);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "That request didn't make sense.");
  return r.data as Command;
}
