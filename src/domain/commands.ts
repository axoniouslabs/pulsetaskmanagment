/**
 * Every change anyone can make in Pulse, as a pure function of (world, command).
 *
 * The browser runs these for an instant (optimistic) update; the server runs the
 * same code inside a database transaction as the source of truth, after the
 * permission check in ./permissions.ts. Each command writes its own activity
 * entries and notifications, so the history can never drift from the data.
 */
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { Activity, ActivityKind, AppNotification, HeatLevel, Leave, NotificationKind, OrgSettings, Priority, ReminderRule, Task, TaskStatus, TaskTemplate } from "@/lib/types";
import { backupFor, headOf, leadOf, membersOf, ownerOf, type World } from "./world";
import { isAway, localDate } from "./time";

export interface NewTaskInput {
  title: string;
  description?: string;
  assigneeId: string;
  priority: Priority;
  dueAt: string;
  startAt?: string;
  estimateHours?: number;
  projectId?: string;
  requiresApproval?: boolean;
  requiresProof?: boolean;
  requiresResult?: boolean;
  reminder?: Partial<ReminderRule>;
  subtasks?: string[];
  tags?: string[];
  recurrence?: Task["recurrence"];
  draft?: boolean;
  /** tasks that must be done before this one can start */
  dependsOn?: string[];
  /** offer it to a team or group; the first to claim it owns it (assigneeId holds it meanwhile) */
  claim?: { unitType: "team" | "group"; unitId: string };
}

export interface TaskPatch {
  title?: string;
  description?: string;
  priority?: Priority;
  estimateHours?: number;
  projectId?: string | null;
  tags?: string[];
  startAt?: string | null;
  requiresApproval?: boolean;
  requiresProof?: boolean;
  requiresResult?: boolean;
  reminder?: Partial<ReminderRule>;
  recurrence?: Task["recurrence"] | null;
  dependsOn?: string[];
}

export type Command =
  | { type: "createTask"; id: string; input: NewTaskInput }
  | { type: "editTask"; taskId: string; patch: TaskPatch }
  | {
      type: "saveTemplate";
      id: string;
      name: string;
      input: TaskTemplate["input"];
    }
  | { type: "deleteTemplate"; id: string }
  | { type: "publishDraft"; taskId: string }
  | { type: "claimTask"; taskId: string }
  | { type: "acknowledge"; taskId: string }
  | { type: "start"; taskId: string }
  | { type: "snooze"; taskId: string; minutes: number }
  | { type: "block"; taskId: string; reason: string; blockerOwnerId?: string }
  | { type: "unblock"; taskId: string; note?: string }
  | { type: "submit"; taskId: string; note: string }
  | { type: "approve"; taskId: string; note?: string }
  | { type: "reject"; taskId: string; reason: string }
  | { type: "cancel"; taskId: string; reason: string }
  | { type: "reassign"; taskId: string; toId: string; reason: string }
  | { type: "changeDeadline"; taskId: string; newDueAt: string; reason: string }
  | {
      type: "requestDeadline";
      taskId: string;
      newDueAt: string;
      reason: string;
    }
  | { type: "decideDeadline"; requestId: string; approve: boolean }
  | { type: "toggleSubtask"; taskId: string; subtaskId: string }
  | { type: "addSubtask"; taskId: string; title: string }
  | {
      type: "addComment";
      taskId: string;
      body: string;
      kind?: "text" | "voice";
      durationSec?: number;
    }
  | {
      type: "addAttachment";
      taskId: string;
      name: string;
      kind: "image" | "file";
      fileId?: string;
      url?: string;
      sizeKb?: number;
      contentType?: string;
      proof?: boolean;
    }
  | { type: "stopTimer" }
  | { type: "markRead"; id: string }
  | { type: "markAllRead" }
  | {
      type: "postAnnouncement";
      channelId: string;
      title: string;
      body: string;
      requiresAck: boolean;
      ackDueAt?: string;
    }
  | { type: "ackAnnouncement"; id: string }
  | { type: "remindAnnouncement"; id: string }
  | { type: "readAnnouncement"; id: string }
  | { type: "askQuestion"; toId: string; body: string; taskId?: string }
  | { type: "answerQuestion"; id: string; answer: string }
  | { type: "checkIn" }
  | { type: "checkOut" }
  | { type: "requestLeave"; input: Omit<Leave, "id" | "status" | "personId"> }
  | { type: "decideLeave"; id: string; approve: boolean }
  | { type: "updateSettings"; patch: Partial<OrgSettings> }
  | { type: "addHoliday"; date: string; name: string }
  | { type: "removeHoliday"; date: string }
  | { type: "addDepartment"; name: string; headId: string; description: string }
  | { type: "addTeam"; name: string; departmentId: string; leadId: string }
  | { type: "addGroup"; name: string; description: string; memberIds: string[] }
  | { type: "movePerson"; personId: string; teamId: string }
  | { type: "setTeamLead"; teamId: string; personId: string }
  | { type: "setDepartmentHead"; departmentId: string; personId: string }
  | { type: "setOnLeave"; personId: string; onLeave: boolean }
  | { type: "setPref"; key: string; value: boolean }
  | { type: "setDayOrder"; ids: string[] };

export type CommandType = Command["type"];

export type CommandResult = { ok: true } | { ok: false; error: string };

export interface Ctx {
  actorId: string;
  now: Date;
  uid: (prefix: string) => string;
}

export class CommandError extends Error {}

const fail = (msg: string): never => {
  throw new CommandError(msg);
};

/**
 * Apply one command. Returns a new world (the input is not modified).
 * Throws CommandError with a plain-English message when the command can't apply.
 */
export function applyCommand(world: World, cmd: Command, ctx: Ctx): World {
  const w: World = structuredClone(world);
  const acts: Activity[] = [];
  const notes: AppNotification[] = [];
  const now = ctx.now;
  const nowIso = now.toISOString();
  const me = ctx.actorId;
  const tz = w.settings.timezone || "Asia/Karachi";
  const fmt = (iso: string | Date, pattern: string) => format(new TZDate(new Date(iso), tz), pattern);
  const first = (id: string) => w.people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";

  const log = (kind: ActivityKind, text: string, taskId?: string, actorId?: string) =>
    acts.push({
      id: ctx.uid("act"),
      at: nowIso,
      actorId: actorId ?? me,
      kind,
      text,
      taskId,
    });
  const note = (recipientId: string, kind: NotificationKind, title: string, body: string, taskId?: string) => {
    if (recipientId === me) return;
    notes.push({
      id: ctx.uid("n"),
      at: nowIso,
      recipientId,
      kind,
      title,
      body,
      taskId,
      read: false,
    });
  };

  const task = (id: string): Task => w.tasks.find((t) => t.id === id) ?? fail("That task no longer exists.");
  const set = (t: Task, patch: Partial<Task>) => Object.assign(t, patch);

  const stopTimerFor = (personId: string) => {
    const timer = w.timers[personId];
    if (!timer) return;
    const mins = Math.max(1, Math.round((now.getTime() - new Date(timer.startedAt).getTime()) / 60000));
    const t = w.tasks.find((x) => x.id === timer.taskId);
    if (t) t.loggedMinutes += mins;
    w.timers[personId] = undefined;
  };

  /** a task is done: tell the owners of tasks that were waiting only for it */
  const releaseDependents = (done: Task) => {
    for (const d of w.tasks) {
      if (!d.dependsOn?.includes(done.id) || ["approved", "cancelled", "draft"].includes(d.status)) continue;
      const stillWaiting = d.dependsOn.some((id) => id !== done.id && !["approved", "cancelled"].includes(w.tasks.find((x) => x.id === id)?.status ?? "approved"));
      if (!stillWaiting) note(d.assigneeId, "unblocked", "You can start now", `"${done.title}" is done, so ${d.title} is ready.`, d.id);
    }
  };

  const deescalate = (t: Task) => {
    if (t.escalationLevel > 0) log("deescalated", `Back to level 0 after ${first(t.assigneeId)} responded`, t.id, "system");
    set(t, { escalationLevel: 0 as HeatLevel, remindersIgnored: 0 });
  };

  switch (cmd.type) {
    /* ---------------- task lifecycle ---------------- */
    case "createTask": {
      const input = cmd.input;
      const assignee = w.people.find((p) => p.id === input.assigneeId) ?? fail("Pick who owns this task.");
      if (!input.title.trim()) fail("Add a title so the assignee knows what to do.");
      if (w.tasks.some((t) => t.id === cmd.id)) fail("This task was already created.");
      const reviewerId = me === input.assigneeId ? (leadOf(w, input.assigneeId) ?? headOf(w, input.assigneeId) ?? ownerOf(w) ?? me) : me;
      const deps = (input.dependsOn ?? []).filter((id) => w.tasks.some((x) => x.id === id));
      // the person is away today: the work goes to whoever covers for them, and they stay a watcher
      let routedFrom: string | undefined;
      let assigneeId = input.assigneeId;
      if (!input.draft && !input.claim && assigneeId !== me && isAway(w, assigneeId, localDate(now, tz))) {
        const cover = backupFor(w, assigneeId);
        if (cover && cover !== me) {
          routedFrom = assigneeId;
          assigneeId = cover;
        }
      }
      let claim: Task["groupClaim"];
      if (input.claim) {
        const c = input.claim;
        const unit = c.unitType === "team" ? w.teams.find((x) => x.id === c.unitId) : w.groups.find((x) => x.id === c.unitId);
        if (!unit) fail("Pick the team or group to offer this task to.");
        claim = {
          unitName: unit!.name,
          claimed: false,
          unitType: c.unitType,
          unitId: c.unitId,
        };
      }
      const t: Task = {
        id: cmd.id,
        title: input.title.trim(),
        description: input.description?.trim() ?? "",
        assigneeId,
        createdById: me,
        reviewerId,
        projectId: input.projectId || undefined,
        departmentId: assignee.departmentId || w.departments[0]?.id || "",
        priority: input.priority,
        status: input.draft ? "draft" : "assigned",
        createdAt: nowIso,
        startAt: input.startAt,
        dueAt: input.dueAt,
        estimateHours: input.estimateHours ?? 1,
        requiresApproval: input.requiresApproval ?? w.settings.approvalByDefault,
        requiresProof: input.requiresProof ?? false,
        requiresResult: input.requiresResult ?? false,
        reminder: { ...w.settings.defaultReminder, ...input.reminder },
        remindersSent: 0,
        remindersIgnored: 0,
        escalationLevel: 0,
        subtasks: (input.subtasks ?? []).filter(Boolean).map((title) => ({ id: ctx.uid("s"), title, done: false })),
        comments: [],
        attachments: [],
        watcherIds: routedFrom ? [routedFrom] : [],
        tags: input.tags ?? [],
        rejections: 0,
        statusChangedAt: nowIso,
        snoozesToday: 0,
        loggedMinutes: 0,
        recurrence: input.recurrence,
        dependsOn: deps.length ? deps : undefined,
        groupClaim: claim,
      };
      w.tasks.unshift(t);
      if (routedFrom) {
        log("reassigned", `${first(routedFrom)} is away, so this went to ${first(assigneeId)} instead. ${first(routedFrom)} is watching it.`, t.id);
        note(assigneeId, "assigned", `${first(me)} assigned you a task (covering for ${first(routedFrom)})`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}`, t.id);
        note(me, "assigned", `${first(routedFrom)} is away: ${first(assigneeId)} got the task`, t.title, t.id);
      }
      if (input.draft) log("created", "Saved as draft", t.id);
      else if (claim) {
        log("assigned", `Offered to ${claim.unitName}: the first to claim it owns it`, t.id);
        for (const r of membersOf(w, claim.unitType!, claim.unitId!)) {
          note(r, "assigned", `Open task for ${claim.unitName}`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}. Claim it if you can take it.`, t.id);
        }
      } else if (!routedFrom) {
        log("assigned", `Assigned to ${first(assigneeId)}`, t.id);
        note(assigneeId, "assigned", `${first(me)} assigned you a task`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}`, t.id);
      }
      if (deps.length) log("created", `Waits for: ${deps.map((d) => `"${w.tasks.find((x) => x.id === d)?.title}"`).join(", ")}`, t.id);
      break;
    }

    case "editTask": {
      const t = task(cmd.taskId);
      if (["approved", "cancelled"].includes(t.status)) fail("This task is closed and can't be edited.");
      const p = cmd.patch;
      const changed: string[] = [];
      if (p.title !== undefined) {
        const title = p.title.trim() || fail("The title can't be empty.");
        if (title !== t.title) changed.push(`title to "${title}"`);
        t.title = title;
      }
      if (p.description !== undefined && p.description.trim() !== t.description) {
        t.description = p.description.trim();
        changed.push("instructions");
      }
      if (p.priority && p.priority !== t.priority) {
        changed.push(`priority to ${p.priority}`);
        t.priority = p.priority;
      }
      if (p.estimateHours !== undefined && p.estimateHours !== t.estimateHours) {
        changed.push(`estimate to ${p.estimateHours}h`);
        t.estimateHours = p.estimateHours;
      }
      if (p.projectId !== undefined) t.projectId = p.projectId || undefined;
      if (p.tags) t.tags = p.tags;
      if (p.startAt !== undefined) t.startAt = p.startAt || undefined;
      if (p.requiresApproval !== undefined) t.requiresApproval = p.requiresApproval;
      if (p.requiresProof !== undefined) t.requiresProof = p.requiresProof;
      if (p.requiresResult !== undefined) t.requiresResult = p.requiresResult;
      if (p.reminder) {
        t.reminder = { ...t.reminder, ...p.reminder };
        changed.push("reminder rule");
      }
      if (p.recurrence !== undefined) t.recurrence = p.recurrence || undefined;
      if (p.dependsOn) {
        const deps = p.dependsOn.filter((id) => id !== t.id && w.tasks.some((x) => x.id === id));
        // no loops: a task can't (indirectly) wait for itself
        const waitsOn = (id: string, seen = new Set<string>()): boolean => {
          if (id === t.id) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return (w.tasks.find((x) => x.id === id)?.dependsOn ?? []).some((d) => waitsOn(d, seen));
        };
        if (deps.some((d) => waitsOn(d))) fail("That would make tasks wait for each other forever.");
        t.dependsOn = deps.length ? deps : undefined;
        changed.push("what it waits for");
      }
      if (!changed.length && p.description === undefined && p.title === undefined) changed.push("details");
      log("created", `Edited ${changed.join(", ") || "details"}`, t.id);
      if (t.assigneeId !== me && changed.length) note(t.assigneeId, "deadline", "A task you own was changed", `${t.title}: ${changed.join(", ")}`, t.id);
      break;
    }

    case "saveTemplate": {
      const name = cmd.name.trim() || fail("Give the template a name.");
      if (!cmd.input.title.trim()) fail("A template needs a task title.");
      const existing = w.templates.find((x) => x.id === cmd.id);
      if (existing) Object.assign(existing, { name, input: cmd.input });
      else
        w.templates.push({
          id: cmd.id,
          name,
          createdById: me,
          createdAt: nowIso,
          input: cmd.input,
        });
      w.templates.sort((a, b) => a.name.localeCompare(b.name));
      log("created", `Saved the template "${name}"`);
      break;
    }
    case "deleteTemplate": {
      const tpl = w.templates.find((x) => x.id === cmd.id) ?? fail("That template no longer exists.");
      w.templates = w.templates.filter((x) => x.id !== cmd.id);
      log("created", `Deleted the template "${tpl.name}"`);
      break;
    }

    case "publishDraft": {
      const t = task(cmd.taskId);
      if (t.status !== "draft") fail("This task is already published.");
      set(t, {
        status: "assigned",
        statusChangedAt: nowIso,
        createdAt: nowIso,
      });
      log("assigned", `Published and assigned to ${first(t.assigneeId)}`, t.id);
      note(t.assigneeId, "assigned", `${first(me)} assigned you a task`, t.title, t.id);
      break;
    }

    case "claimTask": {
      const t = task(cmd.taskId);
      if (!t.groupClaim || t.groupClaim.claimed) fail("Someone has already claimed this task.");
      set(t, {
        assigneeId: me,
        status: "acknowledged",
        acknowledgedAt: nowIso,
        statusChangedAt: nowIso,
        groupClaim: { ...t.groupClaim!, claimed: true },
        escalationLevel: 0,
        remindersIgnored: 0,
      });
      log("acknowledged", `Claimed from ${t.groupClaim?.unitName ?? "the team"}`, t.id);
      break;
    }

    case "acknowledge": {
      const t = task(cmd.taskId);
      if (t.status !== "assigned") break; // already acknowledged on another device: nothing to do
      set(t, {
        status: "acknowledged",
        acknowledgedAt: nowIso,
        statusChangedAt: nowIso,
        snoozedUntil: undefined,
      });
      log("acknowledged", "Acknowledged", t.id);
      deescalate(t);
      break;
    }

    case "start": {
      const t = task(cmd.taskId);
      if (!["assigned", "acknowledged", "in_progress"].includes(t.status)) fail("This task can't be started in its current state.");
      const waiting = (t.dependsOn ?? []).map((d) => w.tasks.find((x) => x.id === d)).filter((d) => d && !["approved", "cancelled"].includes(d.status));
      if (waiting.length) fail(`This waits for "${waiting[0]!.title}" to be done first. You can acknowledge it now and start when that's finished.`);
      stopTimerFor(t.assigneeId);
      const resumed = !!t.startedAt;
      set(t, {
        status: "in_progress",
        acknowledgedAt: t.acknowledgedAt ?? nowIso,
        startedAt: t.startedAt ?? nowIso,
        statusChangedAt: t.status === "in_progress" ? t.statusChangedAt : nowIso,
        snoozedUntil: undefined,
      });
      log("started", resumed ? "Resumed work" : "Started work", t.id);
      deescalate(t);
      w.timers[t.assigneeId] = { taskId: t.id, startedAt: nowIso };
      break;
    }

    case "snooze": {
      const t = task(cmd.taskId);
      const max = w.settings.snoozeMaxPerDay;
      if (t.snoozesToday >= max) fail(`You can snooze a task ${max} times a day. Acknowledge it or mark it blocked.`);
      if (![15, 30, 60].includes(cmd.minutes)) fail("Snooze for 15, 30 or 60 minutes.");
      set(t, {
        snoozedUntil: new Date(now.getTime() + cmd.minutes * 60000).toISOString(),
        snoozesToday: t.snoozesToday + 1,
      });
      log("snoozed", `Snoozed reminders for ${cmd.minutes} min`, t.id);
      break;
    }

    case "block": {
      const t = task(cmd.taskId);
      if (!["assigned", "acknowledged", "in_progress"].includes(t.status)) fail("Only open tasks can be marked as blocked.");
      const reason = cmd.reason.trim() || fail("Write one line about what's stopping you.");
      const owner = cmd.blockerOwnerId ?? t.reviewerId;
      if (w.timers[t.assigneeId]?.taskId === t.id) stopTimerFor(t.assigneeId);
      set(t, {
        status: "blocked",
        blockedFrom: t.status,
        blockedReason: reason,
        blockedOwnerId: owner,
        blockedAt: nowIso,
        statusChangedAt: nowIso,
        escalationLevel: 0,
        remindersIgnored: 0,
      });
      log("blocked", `Blocked: ${reason}`, t.id);
      for (const r of Array.from(new Set([t.reviewerId, owner]))) {
        note(r, "blocked", `${first(t.assigneeId)} is blocked${r === owner ? " and waiting on you" : ""}`, `${t.title}: ${reason}`, t.id);
      }
      break;
    }

    case "unblock": {
      const t = task(cmd.taskId);
      if (t.status !== "blocked") break;
      const back: TaskStatus = t.startedAt ? "in_progress" : t.blockedFrom && t.blockedFrom !== "blocked" ? t.blockedFrom : "acknowledged";
      set(t, {
        status: back,
        blockedReason: undefined,
        blockedOwnerId: undefined,
        blockedAt: undefined,
        blockedFrom: undefined,
        statusChangedAt: nowIso,
      });
      log("unblocked", cmd.note ? `Blocker cleared: ${cmd.note}` : "Blocker cleared", t.id);
      note(t.assigneeId, "unblocked", "You can continue", `${t.title}${cmd.note ? `: ${cmd.note}` : ""}`, t.id);
      break;
    }

    case "submit": {
      const t = task(cmd.taskId);
      if (t.status !== "in_progress") fail("Start the task before submitting it.");
      const hasProof = t.attachments.some((a) => a.isProof);
      if (t.requiresProof && !hasProof) fail("This task needs a photo or file as proof before you can submit it.");
      if (t.requiresResult && !cmd.note.trim()) fail("This task asks for a short result report. Write what the outcome was, then submit.");
      if (w.timers[t.assigneeId]?.taskId === t.id) stopTimerFor(t.assigneeId);
      const noteText = cmd.note.trim();
      if (!t.requiresApproval) {
        set(t, {
          status: "approved",
          submittedAt: nowIso,
          approvedAt: nowIso,
          statusChangedAt: nowIso,
          submissionNote: noteText,
          escalationLevel: 0,
        });
        log("submitted", noteText ? `Submitted: ${noteText}` : "Submitted", t.id);
        log("approved", "Auto-approved (routine task)", t.id, "system");
        releaseDependents(t);
      } else {
        set(t, {
          status: "submitted",
          submittedAt: nowIso,
          statusChangedAt: nowIso,
          submissionNote: noteText,
          escalationLevel: 0,
        });
        log("submitted", noteText ? `Submitted: ${noteText}` : "Submitted for review", t.id);
        note(t.reviewerId, "submitted", `${first(t.assigneeId)} submitted work for review`, t.title, t.id);
      }
      break;
    }

    case "approve": {
      const t = task(cmd.taskId);
      if (t.status !== "submitted") fail("Only submitted work can be approved.");
      set(t, {
        status: "approved",
        approvedAt: nowIso,
        statusChangedAt: nowIso,
        escalationLevel: 0,
      });
      log("approved", cmd.note ? `Approved with note: ${cmd.note}` : "Approved", t.id);
      note(t.assigneeId, "approved", `${first(me)} approved your work`, cmd.note ? `${t.title}. "${cmd.note}"` : t.title, t.id);
      releaseDependents(t);
      break;
    }

    case "reject": {
      const t = task(cmd.taskId);
      if (t.status !== "submitted") fail("Only submitted work can be sent back.");
      const reason = cmd.reason.trim() || fail("Say what needs to change so it gets fixed the first time.");
      set(t, {
        status: "in_progress",
        rejections: t.rejections + 1,
        lastRejectionReason: reason,
        statusChangedAt: nowIso,
        submittedAt: undefined,
      });
      log("rejected", `Sent back: ${reason}`, t.id);
      note(t.assigneeId, "rejected", `${first(me)} sent your work back`, `${t.title}: ${reason}`, t.id);
      break;
    }

    case "cancel": {
      const t = task(cmd.taskId);
      if (["approved", "cancelled"].includes(t.status)) fail("This task is already closed.");
      const reason = cmd.reason.trim() || fail("Give a reason so the history explains itself.");
      set(t, { status: "cancelled", statusChangedAt: nowIso });
      if (w.timers[t.assigneeId]?.taskId === t.id) stopTimerFor(t.assigneeId);
      log("cancelled", `Cancelled: ${reason}`, t.id);
      note(t.assigneeId, "deadline", "A task was cancelled", `${t.title}: ${reason}`, t.id);
      break;
    }

    case "reassign": {
      const t = task(cmd.taskId);
      const to = w.people.find((p) => p.id === cmd.toId) ?? fail("Pick who should take this task.");
      const from = t.assigneeId;
      if (from === to.id) fail(`${to.name.split(" ")[0]} already owns this task.`);
      if (!cmd.reason.trim()) fail("Say why it's being handed over. It's recorded on the task.");
      if (w.timers[from]?.taskId === t.id) stopTimerFor(from);
      set(t, {
        assigneeId: to.id,
        status: t.status === "submitted" ? "submitted" : "assigned",
        statusChangedAt: nowIso,
        watcherIds: Array.from(new Set([...t.watcherIds, from])).filter((id) => id !== to.id),
        escalationLevel: 0,
        remindersIgnored: 0,
        acknowledgedAt: undefined,
        departmentId: to.departmentId || t.departmentId,
      });
      log("reassigned", `Handed over from ${first(from)} to ${first(to.id)}: ${cmd.reason}`, t.id);
      note(to.id, "assigned", `${first(me)} handed you a task`, `${t.title}. Full history is attached.`, t.id);
      note(from, "deadline", "A task moved to someone else", `${t.title} now with ${first(to.id)}. You stay as a watcher.`, t.id);
      break;
    }

    case "changeDeadline": {
      const t = task(cmd.taskId);
      if (Number.isNaN(new Date(cmd.newDueAt).getTime())) fail("Pick a valid date and time.");
      const old = t.dueAt;
      set(t, { dueAt: cmd.newDueAt });
      log("deadline_changed", `Deadline moved from ${fmt(old, "EEE d MMM h:mm a")} to ${fmt(cmd.newDueAt, "EEE d MMM h:mm a")}: ${cmd.reason}`, t.id);
      note(t.assigneeId, "deadline", "Deadline changed", `${t.title} is now due ${fmt(cmd.newDueAt, "EEE h:mm a")}`, t.id);
      break;
    }

    case "requestDeadline": {
      const t = task(cmd.taskId);
      const reason = cmd.reason.trim() || fail("Say why you need more time.");
      if (new Date(cmd.newDueAt) <= new Date(t.dueAt)) fail("Pick a time after the current deadline.");
      w.deadlineRequests.unshift({
        id: ctx.uid("dr"),
        taskId: t.id,
        byId: me,
        newDueAt: cmd.newDueAt,
        reason,
        at: nowIso,
        status: "pending",
      });
      log("deadline_requested", `Asked to move the deadline to ${fmt(cmd.newDueAt, "EEE d MMM h:mm a")}: ${reason}`, t.id);
      note(t.reviewerId, "deadline", `${first(me)} asked for more time`, `${t.title}: ${reason}`, t.id);
      break;
    }

    case "decideDeadline": {
      const r = w.deadlineRequests.find((d) => d.id === cmd.requestId) ?? fail("That request no longer exists.");
      if (r.status !== "pending") fail("This request has already been decided.");
      r.status = cmd.approve ? "approved" : "declined";
      const t = task(r.taskId);
      if (cmd.approve) {
        const old = t.dueAt;
        t.dueAt = r.newDueAt;
        log("deadline_changed", `Extension approved. Deadline moved from ${fmt(old, "EEE d MMM h:mm a")} to ${fmt(r.newDueAt, "EEE d MMM h:mm a")}`, t.id);
        note(r.byId, "deadline", "Extension approved", `${t.title} is now due ${fmt(r.newDueAt, "EEE h:mm a")}`, t.id);
      } else {
        log("deadline_changed", "Extension request declined", t.id);
        note(r.byId, "deadline", "Extension declined", t.title, t.id);
      }
      break;
    }

    case "toggleSubtask": {
      const t = task(cmd.taskId);
      const st = t.subtasks.find((x) => x.id === cmd.subtaskId) ?? fail("That checklist item no longer exists.");
      st.done = !st.done;
      if (st.done) log("subtask_done", `Ticked off "${st.title}"`, t.id);
      break;
    }

    case "addSubtask": {
      const t = task(cmd.taskId);
      const title = cmd.title.trim() || fail("Write the step first.");
      t.subtasks.push({ id: ctx.uid("s"), title, done: false });
      break;
    }

    case "addComment": {
      const t = task(cmd.taskId);
      const body = cmd.body.trim() || fail("Write something first.");
      const kind = cmd.kind ?? "text";
      t.comments.push({
        id: ctx.uid("c"),
        authorId: me,
        body,
        at: nowIso,
        kind,
        durationSec: cmd.durationSec,
      });
      log("commented", kind === "voice" ? `Voice note (${cmd.durationSec ?? 0}s)` : body, t.id);
      for (const p of w.people) if (body.includes(`@${p.name.split(" ")[0]}`)) note(p.id, "mention", `${first(me)} mentioned you`, `${t.title}: ${body}`, t.id);
      if (t.assigneeId === me && t.escalationLevel > 0) deescalate(t);
      break;
    }

    case "addAttachment": {
      const t = task(cmd.taskId);
      if (["approved", "cancelled"].includes(t.status)) fail("This task is closed. Files can't be added any more.");
      const isProof = t.assigneeId === me && (cmd.proof ?? (t.requiresProof && cmd.kind === "image"));
      t.attachments.push({
        id: cmd.fileId ?? ctx.uid("a"),
        name: cmd.name,
        kind: cmd.kind,
        sizeKb: cmd.sizeKb ?? 0,
        at: nowIso,
        byId: me,
        isProof,
        hue: (cmd.name.length * 37) % 360,
        url: cmd.url,
        contentType: cmd.contentType,
      });
      log("commented", `${isProof ? "Added proof" : "Attached"}: ${cmd.name}`, t.id);
      break;
    }

    case "stopTimer": {
      const timer = w.timers[me];
      if (!timer) break;
      stopTimerFor(me);
      log("timer", "Paused the timer", timer.taskId);
      break;
    }

    /* ---------------- notifications ---------------- */
    case "markRead": {
      const n = w.notifications.find((x) => x.id === cmd.id && x.recipientId === me);
      if (n) n.read = true;
      break;
    }
    case "markAllRead": {
      for (const n of w.notifications) if (n.recipientId === me) n.read = true;
      break;
    }

    /* ---------------- channels ---------------- */
    case "postAnnouncement": {
      const ch = w.channels.find((c) => c.id === cmd.channelId) ?? fail("That channel no longer exists.");
      const title = cmd.title.trim() || fail("Give the notice a title.");
      w.announcements.unshift({
        id: ctx.uid("an"),
        channelId: ch.id,
        authorId: me,
        at: nowIso,
        title,
        body: cmd.body.trim(),
        requiresAck: cmd.requiresAck,
        ackDueAt: cmd.ackDueAt,
        ackBy: {},
        readBy: { [me]: nowIso },
      });
      log("announcement", `Posted "${title}" in ${ch.name}`);
      for (const r of membersOf(w, ch.unitType, ch.unitId)) {
        note(r, "announcement", cmd.requiresAck ? `${first(me)} posted a notice that needs your OK` : `New notice in ${ch.name}`, title);
      }
      break;
    }
    case "ackAnnouncement": {
      const a = w.announcements.find((x) => x.id === cmd.id) ?? fail("That notice no longer exists.");
      if (a.ackBy[me]) break;
      a.ackBy[me] = nowIso;
      a.readBy[me] = a.readBy[me] ?? nowIso;
      log("announcement", `Acknowledged "${a.title}"`);
      break;
    }
    case "readAnnouncement": {
      const a = w.announcements.find((x) => x.id === cmd.id);
      if (a && !a.readBy[me]) a.readBy[me] = nowIso;
      break;
    }
    case "remindAnnouncement": {
      const a = w.announcements.find((x) => x.id === cmd.id) ?? fail("That notice no longer exists.");
      if (!a.requiresAck) fail("This notice doesn't ask for an acknowledgment.");
      const ch = w.channels.find((c) => c.id === a.channelId) ?? fail("That channel no longer exists.");
      const waiting = membersOf(w, ch.unitType, ch.unitId).filter((id) => !a.ackBy[id] && id !== a.authorId);
      if (!waiting.length) fail("Everyone has already acknowledged this notice.");
      for (const r of waiting) note(r, "announcement", `${first(me)} is waiting for your OK`, `Please read and acknowledge "${a.title}".`);
      log("announcement", `Reminded ${waiting.length} ${waiting.length === 1 ? "person" : "people"} to acknowledge "${a.title}"`);
      break;
    }

    /* ---------------- questions ---------------- */
    case "askQuestion": {
      const body = cmd.body.trim() || fail("Write your question first.");
      if (!w.people.some((p) => p.id === cmd.toId)) fail("Pick who to ask.");
      w.questions.unshift({
        id: ctx.uid("q"),
        fromId: me,
        toId: cmd.toId,
        body,
        taskId: cmd.taskId,
        at: nowIso,
      });
      log("question", `Asked ${first(cmd.toId)}: ${body}`, cmd.taskId);
      note(cmd.toId, "question", `${first(me)} asked you a question`, body, cmd.taskId);
      break;
    }
    case "answerQuestion": {
      const q = w.questions.find((x) => x.id === cmd.id) ?? fail("That question no longer exists.");
      const answer = cmd.answer.trim() || fail("Write your answer first.");
      q.answer = answer;
      q.answeredAt = nowIso;
      log("answered", `Answered ${first(q.fromId)}: ${answer}`, q.taskId);
      note(q.fromId, "answer", `${first(me)} answered your question`, answer, q.taskId);
      break;
    }

    /* ---------------- attendance ---------------- */
    case "checkIn": {
      const local = new TZDate(now, tz);
      const date = format(local, "yyyy-MM-dd");
      const [sh, sm] = w.settings.workStart.split(":").map(Number);
      const late = local.getHours() * 60 + local.getMinutes() > sh * 60 + sm + 15;
      const existing = w.attendance.find((a) => a.personId === me && a.date === date);
      if (existing?.checkIn && !existing.checkOut) fail("You're already checked in.");
      const rec = {
        personId: me,
        date,
        checkIn: existing?.checkIn ?? nowIso,
        checkOut: undefined,
        breakMin: existing?.breakMin ?? 0,
        status: existing?.status && existing.checkIn ? existing.status : late ? ("late" as const) : ("present" as const),
      };
      if (existing) Object.assign(existing, rec);
      else w.attendance.push(rec);
      log("check_in", "Checked in");
      break;
    }
    case "checkOut": {
      const date = format(new TZDate(now, tz), "yyyy-MM-dd");
      const rec = w.attendance.find((a) => a.personId === me && a.date === date);
      if (!rec?.checkIn) fail("Check in first.");
      stopTimerFor(me);
      rec!.checkOut = nowIso;
      log("check_out", "Checked out");
      break;
    }
    case "requestLeave": {
      const { from, to, type, note: n } = cmd.input;
      if (!from || !to || to < from) fail("Pick a start date and an end date on or after it.");
      const approver = leadOf(w, me) ?? headOf(w, me) ?? ownerOf(w);
      w.leaves.unshift({
        id: ctx.uid("lv"),
        personId: me,
        from,
        to,
        type,
        note: n,
        status: "pending",
      });
      if (approver) note(approver, "deadline", `${first(me)} asked for leave`, `${type} leave, ${from}${to !== from ? ` to ${to}` : ""}`);
      break;
    }
    case "decideLeave": {
      const l = w.leaves.find((x) => x.id === cmd.id) ?? fail("That leave request no longer exists.");
      if (l.status !== "pending") fail("This request has already been decided.");
      l.status = cmd.approve ? "approved" : "declined";
      const today = format(new TZDate(now, tz), "yyyy-MM-dd");
      if (cmd.approve && l.from <= today && l.to >= today) {
        const p = w.people.find((x) => x.id === l.personId);
        if (p) p.onLeave = true;
      }
      log(
        cmd.approve ? "reminders_paused" : "deadline_changed",
        cmd.approve
          ? `Approved ${first(l.personId)}'s ${l.type} leave (${l.from}${l.to !== l.from ? ` to ${l.to}` : ""}). Reminders pause on those days.`
          : `Declined ${first(l.personId)}'s ${l.type} leave request`,
      );
      note(l.personId, "deadline", cmd.approve ? "Leave approved" : "Leave declined", `${l.type} leave, ${l.from}`);
      break;
    }

    /* ---------------- organisation & settings ---------------- */
    case "updateSettings": {
      w.settings = { ...w.settings, ...cmd.patch };
      log("created", `Changed settings: ${Object.keys(cmd.patch).join(", ")}`);
      break;
    }
    case "addHoliday": {
      if (!cmd.date || !cmd.name.trim()) fail("Add both a date and a name.");
      w.settings.holidays = [...w.settings.holidays.filter((h) => h.date !== cmd.date), { date: cmd.date, name: cmd.name.trim() }].sort((a, b) => a.date.localeCompare(b.date));
      log("created", `Added the holiday ${cmd.name.trim()} on ${cmd.date}`);
      break;
    }
    case "removeHoliday": {
      w.settings.holidays = w.settings.holidays.filter((h) => h.date !== cmd.date);
      log("created", `Removed the holiday on ${cmd.date}`);
      break;
    }
    case "addDepartment": {
      const name = cmd.name.trim() || fail("Give the department a name.");
      const head = w.people.find((p) => p.id === cmd.headId) ?? fail("Pick who heads the department.");
      if (w.departments.some((d) => d.headId === head.id) || w.teams.some((t) => t.leadId === head.id)) {
        fail(`${first(head.id)} already heads a department or leads a team. Pick someone else, or give that role away first.`);
      }
      const id = ctx.uid("d");
      w.departments.push({
        id,
        name,
        headId: head.id,
        description: cmd.description.trim(),
      });
      // the head works in the department they run, with a manager's view of it
      if (head.role === "employee") head.role = "manager";
      head.departmentId = id;
      head.teamId = "";
      w.channels.push({
        id: ctx.uid("c"),
        name,
        kind: "open",
        unitType: "department",
        unitId: id,
        description: `Day-to-day coordination for ${name}`,
      });
      log("created", `Created the ${name} department`);
      break;
    }
    case "addTeam": {
      const name = cmd.name.trim() || fail("Give the team a name.");
      if (!w.departments.some((d) => d.id === cmd.departmentId)) fail("Pick a department.");
      w.teams.push({
        id: ctx.uid("t"),
        name,
        departmentId: cmd.departmentId,
        leadId: cmd.leadId,
      });
      log("created", `Created the ${name} team`);
      break;
    }
    case "addGroup": {
      const name = cmd.name.trim() || fail("Give the group a name.");
      const id = ctx.uid("g");
      w.groups.push({
        id,
        name,
        description: cmd.description.trim(),
        memberIds: cmd.memberIds,
        ownerId: me,
      });
      w.channels.push({
        id: ctx.uid("c"),
        name,
        kind: "open",
        unitType: "group",
        unitId: id,
        description: cmd.description.trim(),
      });
      log("created", `Created the group "${name}"`);
      break;
    }
    case "movePerson": {
      const team = w.teams.find((t) => t.id === cmd.teamId) ?? fail("Pick a team.");
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      if (w.teams.some((t) => t.leadId === p.id && t.id !== team.id) || w.departments.some((d) => d.headId === p.id && d.id !== team.departmentId)) {
        fail(`${first(p.id)} leads a team or heads a department. Give that role to someone else first.`);
      }
      p.teamId = team.id;
      p.departmentId = team.departmentId;
      log("reassigned", `Moved ${first(p.id)} to ${team.name}. Their access changed automatically.`);
      break;
    }
    case "setTeamLead": {
      const team = w.teams.find((t) => t.id === cmd.teamId) ?? fail("Pick a team.");
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("Pick a person.");
      if (w.teams.some((t) => t.leadId === p.id && t.id !== team.id) || w.departments.some((d) => d.headId === p.id && d.id !== team.departmentId)) {
        fail(`${first(p.id)} already leads a team or heads a department. Give that role to someone else first.`);
      }
      team.leadId = p.id;
      if (p.teamId !== team.id) {
        p.teamId = team.id;
        p.departmentId = team.departmentId;
      }
      if (p.role === "employee") p.role = "manager";
      log("reassigned", `${first(p.id)} now leads ${team.name}`);
      break;
    }
    case "setDepartmentHead": {
      const dep = w.departments.find((d) => d.id === cmd.departmentId) ?? fail("Pick a department.");
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("Pick a person.");
      dep.headId = p.id;
      if (p.role === "employee") p.role = "manager";
      if (p.departmentId !== dep.id) {
        p.departmentId = dep.id;
        p.teamId = w.teams.find((t) => t.departmentId === dep.id)?.id ?? "";
      }
      log("reassigned", `${first(p.id)} now heads ${dep.name}`);
      break;
    }
    case "setOnLeave": {
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      p.onLeave = cmd.onLeave;
      log(cmd.onLeave ? "reminders_paused" : "check_in", cmd.onLeave ? `Marked ${first(p.id)} on leave. Their reminders stopped.` : `${first(p.id)} is back from leave`);
      if (cmd.onLeave) {
        // nothing goes quietly overdue: whoever marked them away sees what's open
        const open = w.tasks.filter((t) => t.assigneeId === p.id && ["assigned", "acknowledged", "in_progress", "blocked"].includes(t.status));
        const dueSoon = open.filter((t) => new Date(t.dueAt).getTime() - now.getTime() < 48 * 60 * 60000);
        if (open.length) {
          note(
            me,
            "deadline",
            `${first(p.id)} has ${open.length} open ${open.length === 1 ? "task" : "tasks"}`,
            `${dueSoon.length ? `${dueSoon.length} due within two days. ` : ""}Hand them over from Tasks so nothing goes overdue while they're away.`,
          );
        }
      }
      break;
    }
    case "setPref": {
      w.prefs[me] = { ...(w.prefs[me] ?? {}), [cmd.key]: cmd.value };
      break;
    }
    case "setDayOrder": {
      w.dayOrder[me] = cmd.ids;
      break;
    }

    default: {
      const never: never = cmd;
      fail(`Unknown action ${(never as { type: string }).type}`);
    }
  }

  w.activity = [...acts.reverse(), ...w.activity];
  w.notifications = [...notes, ...w.notifications];
  return w;
}

/** run a command and turn errors into a result instead of throwing */
export function tryCommand(world: World, cmd: Command, ctx: Ctx): { world: World; result: CommandResult } {
  try {
    return { world: applyCommand(world, cmd, ctx), result: { ok: true } };
  } catch (e) {
    if (e instanceof CommandError) return { world, result: { ok: false, error: e.message } };
    throw e;
  }
}
