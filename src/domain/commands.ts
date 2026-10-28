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
import type {
  Activity,
  ActivityKind,
  AppNotification,
  ChannelSpace,
  DepartmentSettings,
  HeatLevel,
  Leave,
  NotificationKind,
  OrgSettings,
  Priority,
  ReminderRule,
  RepeatRule,
  Task,
  StoredView,
  TaskStatus,
  TaskTemplate,
  WorkSchedule,
} from "@/lib/types";
import { approvalOptional, backupFor, needsReview, channelMembersOf, headOf, leadOf, membersOf, ownerOf, unitHeadOf, unitName, workersOf, type World } from "./world";
import { endOfWorkingDay, isAway, localDate, localNowFor, overdueFrom, scheduleFor, timerCutoff, toMinutes } from "./time";

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
  repeat?: RepeatRule;
  draft?: boolean;
  /** tasks that must be done before this one can start */
  dependsOn?: string[];
  /** offer it to a unit; the first to claim it owns it (assigneeId holds it meanwhile) */
  claim?: { unitType: "department" | "team" | "group"; unitId: string };
  /** people who follow it without being responsible */
  watcherIds?: string[];
  /** who reviews it; by default whoever assigned it (or the assignee's manager for their own task) */
  reviewerId?: string;
  /** due on a day rather than at a time */
  dueAllDay?: boolean;
  /** ask the assignee for a progress update this often */
  updateEveryDays?: number;
  /** aim it at a unit: Pulse picks the next person in turn, or sends it to the unit's head to pass on */
  pool?: { unitType: "department" | "team" | "group"; unitId: string; mode: "roundrobin" | "route" };
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
  repeat?: RepeatRule | null;
  dependsOn?: string[];
  watcherIds?: string[];
  reviewerId?: string;
  dueAllDay?: boolean;
  updateEveryDays?: number | null;
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
      /** reply to this comment */
      parentId?: string;
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
      capturedAt?: string;
      location?: { lat: number; lng: number; accuracyM?: number };
    }
  | { type: "stopTimer"; at?: string }
  | { type: "setWatching"; taskId: string; watch: boolean }
  | { type: "archiveTask"; taskId: string; archived: boolean }
  | { type: "setProgress"; taskId: string; pct: number; note: string }
  | { type: "escalateReview"; taskId: string; note: string }
  | { type: "addLink"; taskId: string; url: string; title?: string }
  | { type: "addTimeEntry"; taskId: string; minutes: number; date: string; note: string }
  /** a manager fixes a time entry; 0 minutes strikes it out. The original stays on record */
  | { type: "correctTimeEntry"; taskId: string; entryId: string; minutes: number; reason: string }
  /** a manager fixes a day's check-in or check-out (times are HH:mm in the person's time zone; "" clears) */
  | { type: "correctAttendance"; personId: string; date: string; checkIn?: string; checkOut?: string; reason: string }
  /** a manager records leave for someone (sick, annual, casual), approved as it's entered */
  | { type: "recordLeave"; personId: string; from: string; to: string; leaveType: "sick" | "annual" | "casual"; note: string }
  | { type: "editComment"; taskId: string; commentId: string; body: string }
  | { type: "routeTask"; taskId: string; toId: string }
  | { type: "startBreak" }
  | { type: "endBreak" }
  | { type: "addProject"; id: string; name: string; leadId: string; defaultAssigneeId?: string }
  | { type: "editProject"; projectId: string; patch: { name?: string; leadId?: string; defaultAssigneeId?: string | null } }
  | { type: "updateDepartment"; departmentId: string; patch: { name?: string; description?: string; settings?: DepartmentSettings | null } }
  | { type: "setPersonSchedule"; personId: string; schedule: WorkSchedule | null }
  | { type: "setSecondaryTeams"; personId: string; teamIds: string[] }
  | { type: "setBackup"; personId: string; backupId: string | null }
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
  /** a manager or the owner sets where someone's notifications go (spec §12, per-user overrides) */
  | { type: "setPrefFor"; personId: string; key: string; value: boolean | null }
  | { type: "editGroup"; groupId: string; name?: string; description?: string; memberIds?: string[] }
  | { type: "archiveGroup"; groupId: string; archived: boolean }
  | { type: "addChannel"; id?: string; name: string; kind: "open" | "announcement" | "private"; unitType: ChannelSpace["unitType"]; unitId: string; description: string; memberIds?: string[] }
  | { type: "editChannel"; channelId: string; name?: string; description?: string; memberIds?: string[] }
  | { type: "archiveChannel"; channelId: string; archived: boolean }
  | { type: "addPin"; channelId: string; title: string; url?: string; fileId?: string; fileName?: string }
  | { type: "removePin"; channelId: string; pinId: string }
  | { type: "replyNotice"; id: string; body: string }
  | { type: "setAvailability"; personId: string; note: string; until?: string }
  | { type: "purgeContact"; personId: string }
  | { type: "setTeamMember"; teamId: string; personId: string; member: boolean }
  | { type: "archiveTeam"; teamId: string }
  | { type: "archiveDepartment"; departmentId: string }
  | { type: "setDayOrder"; ids: string[] }
  | { type: "setSavedViews"; views: StoredView[] };

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
  const actorRole = w.people.find((p) => p.id === me)?.role;
  /** review can be skipped only where the rules allow it; an employee never skips it */
  const approvalFor = (asked: boolean | undefined, byDefault: boolean, priority: string) => {
    if (asked === undefined || asked) return asked ?? byDefault;
    if (!byDefault) return false;
    if (approvalOptional(w, me, priority)) return false;
    if (actorRole === "employee") return true;
    return fail(w.settings.lowPriorityNoApproval || actorRole === "owner" ? "Only low-priority work can skip review." : "Only the owner can let work skip review. Ask them, or keep approval on.");
  };
  /** people named in a post: @everyone or @channel, a group's name, or a person's first or full name */
  const mentioned = (text: string, members: string[]) => {
    const out = new Set<string>();
    const lower = text.toLowerCase();
    /** "@name" followed by something that isn't part of a longer word */
    const has = (name: string) => {
      for (let at = lower.indexOf(`@${name}`); at >= 0; at = lower.indexOf(`@${name}`, at + 1)) {
        const next = lower[at + name.length + 1];
        if (!next || !/[a-z0-9]/.test(next)) return true;
      }
      return false;
    };
    if (has("everyone") || has("channel") || has("all")) members.forEach((id) => out.add(id));
    for (const g of w.groups) if (!g.archivedAt && has(g.name.toLowerCase())) [...g.memberIds, g.ownerId].forEach((id) => out.add(id));
    for (const p of w.people) {
      if (p.active === false) continue;
      const full = p.name.toLowerCase();
      if (has(full) || has(full.split(" ")[0])) out.add(p.id);
    }
    out.delete(me);
    return [...out];
  };
  const muted = (personId: string, channelId: string) => !!w.prefs[personId]?.[`mute:${channelId}`];
  /** a unit's own channels, made when it is: day-to-day, plus notices and a task feed for departments and teams */
  const unitChannels = (unitType: ChannelSpace["unitType"], unitId: string, name: string, description: string, kinds: ChannelSpace["kind"][]) => {
    for (const kind of kinds)
      w.channels.push({
        id: ctx.uid("c"),
        name: kind === "announcement" ? `${name} notices` : kind === "task_feed" ? `${name} task feed` : name,
        kind,
        unitType,
        unitId,
        description:
          kind === "announcement" ? `Notices for everyone in ${name}` : kind === "task_feed" ? `Every task event in ${name}, posted by Pulse` : description || `Day-to-day coordination for ${name}`,
        createdById: me,
      });
  };

  const log = (kind: ActivityKind, text: string, taskId?: string, actorId?: string, aboutId?: string) =>
    acts.push({
      id: ctx.uid("act"),
      at: nowIso,
      actorId: actorId ?? me,
      kind,
      text,
      taskId,
      ...(aboutId ? { aboutId } : {}),
    });
  const note = (recipientId: string, kind: NotificationKind, title: string, body: string, taskId?: string, opts: { self?: boolean } = {}) => {
    if (recipientId === me && !opts.self) return;
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

  /** stop someone's timer and record the session; never past the end of their working day */
  const stopTimerFor = (personId: string, at: Date = now) => {
    const timer = w.timers[personId];
    if (!timer) return 0;
    const start = new Date(timer.startedAt);
    const cutoff = timerCutoff(w, personId, timer.startedAt);
    const end = new Date(Math.max(start.getTime(), Math.min(at.getTime(), now.getTime(), cutoff.getTime())));
    const mins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
    const t = w.tasks.find((x) => x.id === timer.taskId);
    if (t) {
      t.loggedMinutes += mins;
      t.timeEntries = [
        ...(t.timeEntries ?? []),
        { id: ctx.uid("te"), personId, minutes: mins, from: timer.startedAt, to: end.toISOString(), autoStopped: end < at && end.getTime() === cutoff.getTime() ? true : undefined },
      ];
    }
    w.timers[personId] = undefined;
    return mins;
  };

  /** a task is done: tell the owners of tasks that were waiting only for it */
  const releaseDependents = (done: Task) => {
    for (const d of w.tasks) {
      if (!d.dependsOn?.includes(done.id) || ["approved", "cancelled", "draft"].includes(d.status)) continue;
      const stillWaiting = d.dependsOn.some((id) => id !== done.id && !["approved", "cancelled"].includes(w.tasks.find((x) => x.id === id)?.status ?? "approved"));
      if (!stillWaiting) note(d.assigneeId, "unblocked", "You can start now", `"${done.title}" is ${done.status === "cancelled" ? "cancelled" : "done"}, so ${d.title} is ready.`, d.id);
    }
  };

  /** end an open break; returns its length in minutes */
  const closeBreak = (rec: World["attendance"][number]) => {
    const open = rec.breaks?.find((b) => !b.end);
    if (!open) return 0;
    open.end = nowIso;
    const mins = Math.max(1, Math.round((now.getTime() - new Date(open.start).getTime()) / 60000));
    rec.breakMin = (rec.breakMin ?? 0) + mins;
    return mins;
  };

  const deescalate = (t: Task) => {
    if (t.escalationLevel > 0) log("deescalated", `Back to level 0 after ${first(t.assigneeId)} responded`, t.id, "system");
    set(t, { escalationLevel: 0 as HeatLevel, remindersIgnored: 0 });
  };

  switch (cmd.type) {
    /* ---------------- task lifecycle ---------------- */
    case "createTask": {
      const input = { ...cmd.input };
      // rule-based assignment: a project can name who its tasks go to
      if (!input.assigneeId && !input.pool && !input.claim && input.projectId) input.assigneeId = w.projects.find((p) => p.id === input.projectId)?.defaultAssigneeId ?? "";
      // aimed at a unit: by turns, or to the unit's head who passes it on
      let pool: Task["pool"];
      if (input.pool && !input.draft) {
        const u = input.pool;
        const name = unitName(w, u.unitType, u.unitId) ?? fail("Pick the team, department or group.");
        const today = localDate(now, tz);
        if (u.mode === "route") {
          const head = unitHeadOf(w, u.unitType, u.unitId);
          if (!head || !w.people.some((p) => p.id === head && p.active !== false)) fail(`${name} has nobody running it to pass the task on. Pick a person instead.`);
          input.assigneeId = head!;
        } else {
          const available = workersOf(w, u.unitType, u.unitId).filter((id) => !isAway(w, id, today));
          // whoever runs the unit hands work out; they're only in the rotation when nobody else is free
          const head = unitHeadOf(w, u.unitType, u.unitId);
          const workers = available.filter((id) => id !== head).length ? available.filter((id) => id !== head) : available;
          if (!workers.length) fail(`Nobody in ${name} is available today. Pick a person instead.`);
          // whoever got work from this pool longest ago (or never) is next
          const lastTurn = (id: string) =>
            w.tasks.reduce((latest, t) => (t.pool?.mode === "roundrobin" && t.pool.unitId === u.unitId && t.pool.pickedId === id && t.createdAt > latest ? t.createdAt : latest), "");
          input.assigneeId = [...workers].sort((a, b) => lastTurn(a).localeCompare(lastTurn(b)))[0];
        }
        pool = { unitType: u.unitType, unitId: u.unitId, unitName: name, mode: u.mode, pickedId: u.mode === "roundrobin" ? input.assigneeId : undefined };
      }
      const assignee = w.people.find((p) => p.id === input.assigneeId) ?? fail("Pick who owns this task.");
      // the department's own rules fill in what the creator didn't choose
      const depRules = w.departments.find((d) => d.id === assignee.departmentId)?.settings;
      if (!input.title.trim()) fail("Add a title so the assignee knows what to do.");
      if (w.tasks.some((t) => t.id === cmd.id)) fail("This task was already created.");
      const defaultReviewer = me === input.assigneeId ? (leadOf(w, input.assigneeId) ?? headOf(w, input.assigneeId) ?? ownerOf(w) ?? me) : me;
      if (input.reviewerId && input.reviewerId === input.assigneeId) fail("Someone else has to review the work. Pick a different reviewer.");
      const reviewerId = input.reviewerId && w.people.some((p) => p.id === input.reviewerId && p.active !== false) ? input.reviewerId : defaultReviewer;
      const deps = (input.dependsOn ?? []).filter((id) => w.tasks.some((x) => x.id === id));
      // the person is away today: the work goes to whoever covers for them, and they stay a watcher
      let routedFrom: string | undefined;
      let assigneeId = input.assigneeId;
      if (!input.draft && !input.claim && !pool && assigneeId !== me && isAway(w, assigneeId, localDate(now, tz))) {
        const cover = backupFor(w, assigneeId);
        if (cover && cover !== me) {
          routedFrom = assigneeId;
          assigneeId = cover;
        }
      }
      let claim: Task["groupClaim"];
      if (input.claim) {
        const c = input.claim;
        const name = unitName(w, c.unitType, c.unitId) ?? fail("Pick the team, department or group to offer this task to.");
        claim = {
          unitName: name,
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
        requiresApproval: approvalFor(input.requiresApproval, depRules?.approvalByDefault ?? w.settings.approvalByDefault, input.priority),
        requiresProof: input.requiresProof ?? false,
        requiresResult: input.requiresResult ?? false,
        // reminder rules are set by managers; an employee's own task follows the defaults (spec §17)
        reminder: { ...w.settings.defaultReminder, ...depRules?.defaultReminder, ...(actorRole === "employee" ? {} : input.reminder) },
        remindersSent: 0,
        remindersIgnored: 0,
        escalationLevel: 0,
        subtasks: (input.subtasks ?? []).filter(Boolean).map((title) => ({ id: ctx.uid("s"), title, done: false })),
        comments: [],
        attachments: [],
        watcherIds: Array.from(
          new Set([...(routedFrom ? [routedFrom] : []), ...(input.watcherIds ?? []).filter((id) => id !== assigneeId && w.people.some((p) => p.id === id && p.active !== false))]),
        ),
        dueAllDay: input.dueAllDay || undefined,
        updateEveryDays: input.updateEveryDays && input.updateEveryDays > 0 ? input.updateEveryDays : undefined,
        tags: input.tags ?? [],
        rejections: 0,
        statusChangedAt: nowIso,
        snoozesToday: 0,
        loggedMinutes: 0,
        recurrence: input.repeat ? undefined : input.recurrence,
        repeat: input.repeat,
        repeatIndex: input.repeat || input.recurrence ? 1 : undefined,
        dependsOn: deps.length ? deps : undefined,
        groupClaim: claim,
        pool,
      };
      w.tasks.unshift(t);
      if (routedFrom) {
        log("reassigned", `${first(routedFrom)} is away, so this went to ${first(assigneeId)} instead. ${first(routedFrom)} is watching it.`, t.id);
        note(assigneeId, "assigned", `${first(me)} assigned you a task (covering for ${first(routedFrom)})`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}`, t.id);
        note(me, "assigned", `${first(routedFrom)} is away: ${first(assigneeId)} got the task`, t.title, t.id, { self: true });
      }
      if (input.draft) log("created", "Saved as draft", t.id);
      else if (claim) {
        log("assigned", `Offered to ${claim.unitName}: the first to claim it owns it`, t.id);
        for (const r of membersOf(w, claim.unitType!, claim.unitId!)) {
          note(r, "assigned", `Open task for ${claim.unitName}`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}. Claim it if you can take it.`, t.id);
        }
      } else if (pool?.mode === "route") {
        log("assigned", `Sent to ${first(assigneeId)}, who runs ${pool.unitName}, to pass on to the right person`, t.id);
        note(assigneeId, "assigned", `${first(me)} sent ${pool.unitName} a task to pass on`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}. Pick who in ${pool.unitName} should do it.`, t.id);
      } else if (pool?.mode === "roundrobin") {
        log("assigned", `${first(assigneeId)}'s turn in ${pool.unitName}: assigned to them`, t.id);
        note(assigneeId, "assigned", `${first(me)} assigned you a task (your turn in ${pool.unitName})`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}`, t.id);
      } else if (!routedFrom) {
        log("assigned", `Assigned to ${first(assigneeId)}`, t.id);
        note(assigneeId, "assigned", `${first(me)} assigned you a task`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}`, t.id);
      }
      if (deps.length) log("created", `Waits for: ${deps.map((d) => `"${w.tasks.find((x) => x.id === d)?.title}"`).join(", ")}`, t.id);
      if (!input.draft) for (const wid of t.watcherIds) if (wid !== routedFrom) note(wid, "assigned", `${first(me)} added you as a watcher`, `${t.title}, assigned to ${first(assigneeId)}`, t.id);
      if (t.reviewerId !== me && t.reviewerId !== defaultReviewer) log("created", `${first(t.reviewerId)} reviews this work`, t.id);
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
      if (p.requiresApproval !== undefined) t.requiresApproval = approvalFor(p.requiresApproval, true, p.priority ?? t.priority);
      if (p.requiresProof !== undefined) t.requiresProof = p.requiresProof;
      if (p.requiresResult !== undefined) t.requiresResult = p.requiresResult;
      if (p.reminder) {
        t.reminder = { ...t.reminder, ...p.reminder };
        changed.push("reminder rule");
      }
      if (p.recurrence !== undefined) t.recurrence = p.recurrence || undefined;
      if (p.repeat !== undefined) {
        // a rule replaces the older simple repeat; null stops the series
        t.repeat = p.repeat ?? undefined;
        t.recurrence = undefined;
        if (p.repeat && !t.repeatIndex) t.repeatIndex = 1;
        changed.push(p.repeat ? "how it repeats" : "it no longer repeats");
      }
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
      if (p.watcherIds) {
        const next = Array.from(new Set(p.watcherIds)).filter((id) => id !== t.assigneeId && w.people.some((x) => x.id === id));
        const added = next.filter((id) => !t.watcherIds.includes(id));
        t.watcherIds = next;
        for (const id of added) note(id, "assigned", `${first(me)} added you as a watcher`, t.title, t.id);
        changed.push("watchers");
      }
      if (p.reviewerId && p.reviewerId !== t.reviewerId) {
        if (p.reviewerId === t.assigneeId) fail("Someone else has to review the work. Pick a different reviewer.");
        if (!w.people.some((x) => x.id === p.reviewerId && x.active !== false)) fail("Pick a reviewer who is still in the company.");
        t.reviewerId = p.reviewerId;
        changed.push(`reviewer to ${first(p.reviewerId)}`);
        if (t.status === "submitted") note(p.reviewerId, "submitted", `${first(t.assigneeId)}'s work is waiting for your review`, t.title, t.id);
      }
      if (p.dueAllDay !== undefined) t.dueAllDay = p.dueAllDay || undefined;
      if (p.updateEveryDays !== undefined) {
        t.updateEveryDays = p.updateEveryDays && p.updateEveryDays > 0 ? p.updateEveryDays : undefined;
        changed.push(t.updateEveryDays ? `updates every ${t.updateEveryDays} days` : "no regular updates");
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
      t.idleFlaggedAt = undefined;
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
      // the time blocked counts against whoever it's waiting on, not the assignee (spec §15)
      log("blocked", `Blocked: ${reason}`, t.id, undefined, owner);
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
      if (!needsReview(t)) {
        set(t, {
          status: "approved",
          submittedAt: nowIso,
          approvedAt: nowIso,
          statusChangedAt: nowIso,
          submissionNote: noteText,
          escalationLevel: 0,
        });
        log("submitted", noteText ? `Submitted: ${noteText}` : "Submitted", t.id);
        log("approved", t.requiresApproval ? "Closed: nobody above them to review it" : "Auto-approved (routine task)", t.id, "system");
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
      // the reminder rule starts over for the rework
      set(t, {
        status: "in_progress",
        rejections: t.rejections + 1,
        lastRejectionReason: reason,
        statusChangedAt: nowIso,
        submittedAt: undefined,
        escalationLevel: 0,
        remindersIgnored: 0,
        remindersToday: 0,
        lastReminderAt: undefined,
        snoozedUntil: undefined,
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
      // anything that was waiting for it can go ahead
      releaseDependents(t);
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
      // their manager hears too (spec §16)
      for (const mgr of new Set([leadOf(w, from) ?? headOf(w, from), leadOf(w, to.id) ?? headOf(w, to.id)]))
        if (mgr && mgr !== from && mgr !== to.id) note(mgr, "deadline", `${first(me)} handed ${t.title} from ${first(from)} to ${first(to.id)}`, cmd.reason, t.id);
      break;
    }

    case "changeDeadline": {
      const t = task(cmd.taskId);
      if (Number.isNaN(new Date(cmd.newDueAt).getTime())) fail("Pick a valid date and time.");
      const old = t.dueAt;
      set(t, { dueAt: cmd.newDueAt });
      log("deadline_changed", `Deadline moved from ${fmt(old, "EEE d MMM h:mm a")} to ${fmt(cmd.newDueAt, "EEE d MMM h:mm a")}: ${cmd.reason}`, t.id);
      note(t.assigneeId, "deadline", "Deadline changed", `${t.title} is now due ${fmt(cmd.newDueAt, "EEE h:mm a")}`, t.id);
      const mgr = leadOf(w, t.assigneeId) ?? headOf(w, t.assigneeId);
      if (mgr && mgr !== t.assigneeId)
        note(mgr, "deadline", `Deadline moved for ${first(t.assigneeId)}`, `${t.title}: ${fmt(old, "EEE d MMM h:mm a")} to ${fmt(cmd.newDueAt, "EEE d MMM h:mm a")}. ${cmd.reason}`, t.id);
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
      t.idleFlaggedAt = undefined;
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
      const parent = cmd.parentId ? (t.comments.find((c) => c.id === cmd.parentId) ?? fail("That comment no longer exists.")) : undefined;
      // replies stay one level deep: a reply to a reply joins the same thread
      const parentId = parent ? (parent.parentId ?? parent.id) : undefined;
      t.comments.push({
        id: ctx.uid("c"),
        authorId: me,
        body,
        at: nowIso,
        kind,
        durationSec: cmd.durationSec,
        parentId,
      });
      log("commented", kind === "voice" ? `Voice note (${cmd.durationSec ?? 0}s)` : parent ? `Replied to ${first(parent.authorId)}: ${body}` : body, t.id);
      if (parent && parent.authorId !== me) note(parent.authorId, "mention", `${first(me)} replied to you`, `${t.title}: ${body}`, t.id);
      if (t.idleFlaggedAt) t.idleFlaggedAt = undefined;
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
        capturedAt: cmd.capturedAt,
        location: cmd.location,
      });
      log("commented", `${isProof ? "Added proof" : "Attached"}: ${cmd.name}`, t.id);
      break;
    }

    case "setWatching": {
      const t = task(cmd.taskId);
      if (t.assigneeId === me) fail("You own this task, so you already get every update.");
      t.watcherIds = cmd.watch ? Array.from(new Set([...t.watcherIds, me])) : t.watcherIds.filter((id) => id !== me);
      log("created", cmd.watch ? `${first(me)} is watching this task` : `${first(me)} stopped watching`, t.id);
      break;
    }

    case "archiveTask": {
      const t = task(cmd.taskId);
      if (cmd.archived) {
        if (!["approved", "cancelled"].includes(t.status)) fail("Only finished or cancelled work can be archived. Cancel it first if it isn't needed.");
        t.archivedAt = nowIso;
        log("created", "Archived. It's hidden from the usual lists and still searchable.", t.id);
      } else {
        t.archivedAt = undefined;
        log("created", "Brought back from the archive", t.id);
      }
      break;
    }

    case "setProgress": {
      const t = task(cmd.taskId);
      if (!["acknowledged", "in_progress", "blocked"].includes(t.status)) fail("Progress can be updated while the work is open.");
      const pct = Math.round(cmd.pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) fail("Progress is between 0 and 100 percent.");
      const why = cmd.note.trim() || fail("Add one line on where it stands.");
      set(t, { progress: pct, progressNote: why, progressAt: nowIso });
      log("commented", `Progress ${pct}%: ${why}`, t.id);
      if (t.reviewerId !== me) note(t.reviewerId, "mention", `${first(me)}: ${pct}% done`, `${t.title}: ${why}`, t.id);
      break;
    }

    case "escalateReview": {
      const t = task(cmd.taskId);
      if (t.status !== "submitted") fail("Only work waiting for review can be passed up.");
      const why = cmd.note.trim() || fail("Say why it needs someone more senior.");
      const up = headOf(w, me) ?? ownerOf(w);
      if (!up || up === me) fail("There's nobody above you to pass this to. Approve it or send it back.");
      set(t, { reviewerId: up!, escalationLevel: Math.max(t.escalationLevel, 2) as HeatLevel });
      log("escalated", `${first(me)} passed the review up to ${first(up!)}: ${why}`, t.id, undefined, me);
      note(up!, "escalation", `${first(me)} needs you to review this`, `${t.title}: ${why}`, t.id);
      note(t.assigneeId, "deadline", `Your work went to ${first(up!)} for review`, why, t.id);
      break;
    }

    case "addLink": {
      const t = task(cmd.taskId);
      if (["approved", "cancelled"].includes(t.status)) fail("This task is closed. Links can't be added any more.");
      let url: URL;
      try {
        url = new URL(cmd.url.trim());
      } catch {
        return fail("That doesn't look like a web address. Paste the full link, starting with https://");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") fail("Only web links (https://) can be added.");
      const name = cmd.title?.trim() || url.hostname.replace(/^www\./, "");
      t.attachments.push({ id: ctx.uid("a"), name, kind: "link", sizeKb: 0, at: nowIso, byId: me, url: url.toString() });
      log("commented", `Added a link: ${name}`, t.id);
      break;
    }

    case "stopTimer": {
      const timer = w.timers[me];
      if (!timer) break;
      // "stop when I was last active": the idle prompt passes the moment activity stopped
      const at = cmd.at ? new Date(cmd.at) : now;
      if (Number.isNaN(at.getTime())) fail("That time doesn't look right.");
      const mins = stopTimerFor(me, at < new Date(timer.startedAt) ? new Date(timer.startedAt) : at);
      log("timer", cmd.at ? `Paused the timer at the last activity (${mins} min counted)` : "Paused the timer", timer.taskId);
      break;
    }

    case "addTimeEntry": {
      const t = task(cmd.taskId);
      if (["draft", "cancelled"].includes(t.status)) fail("Time can't be added to this task.");
      const minutes = Math.round(cmd.minutes);
      if (!Number.isFinite(minutes) || minutes < 1) fail("Enter how long you worked.");
      if (minutes > 16 * 60) fail("One entry can be at most 16 hours. Add separate entries for separate days.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cmd.date)) fail("Pick the day the work was done.");
      if (cmd.date > localDate(now, tz)) fail("You can't log time for a day that hasn't happened yet.");
      const why = cmd.note.trim() || fail("Say what was done, so the entry explains itself.");
      const sc = scheduleFor(w, t.assigneeId);
      const from = new TZDate(`${cmd.date}T${sc.workStart}:00`, sc.timezone).toISOString();
      t.timeEntries = [...(t.timeEntries ?? []), { id: ctx.uid("te"), personId: t.assigneeId, minutes, from, manual: true, note: why, byId: me !== t.assigneeId ? me : undefined }];
      t.loggedMinutes += minutes;
      const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
      log("timer", `Added ${label} by hand for ${cmd.date}${me !== t.assigneeId ? ` for ${first(t.assigneeId)}` : ""} (manual entry): ${why}`, t.id);
      if (me !== t.assigneeId) note(t.assigneeId, "deadline", `${first(me)} added time to your task`, `${label} on ${t.title}: ${why}`, t.id);
      break;
    }

    case "correctTimeEntry": {
      const t = task(cmd.taskId);
      const e = t.timeEntries?.find((x) => x.id === cmd.entryId) ?? fail("That time entry no longer exists.");
      const reason = cmd.reason.trim() || fail("Say why it's being changed. It's kept with the entry.");
      const minutes = Math.round(cmd.minutes);
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 16 * 60) fail("Enter between 0 and 16 hours.");
      if (minutes === e.minutes) fail("That's the same as before.");
      const label = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
      e.corrected = { fromMinutes: e.corrected?.fromMinutes ?? e.minutes, byId: me, at: nowIso, reason };
      t.loggedMinutes = Math.max(0, t.loggedMinutes - e.minutes + minutes);
      log(
        "timer",
        minutes ? `Corrected ${first(e.personId)}'s time from ${label(e.minutes)} to ${label(minutes)}: ${reason}` : `Struck out ${first(e.personId)}'s ${label(e.minutes)} entry: ${reason}`,
        t.id,
      );
      e.minutes = minutes;
      if (e.personId !== me) note(e.personId, "deadline", `${first(me)} corrected your time`, `${t.title}: ${reason}`, t.id);
      break;
    }
    case "correctAttendance": {
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      const reason = cmd.reason.trim() || fail("Say why it's being changed. It's kept with the day.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cmd.date) || cmd.date > localDate(now, tz)) fail("Pick a day that has already started.");
      const sc = scheduleFor(w, p.id);
      const at = (hm?: string) => (hm ? new TZDate(`${cmd.date}T${hm}:00`, sc.timezone).toISOString() : undefined);
      let rec = w.attendance.find((a) => a.personId === p.id && a.date === cmd.date);
      if (!rec) {
        rec = { personId: p.id, date: cmd.date, breakMin: 0, status: "present" };
        w.attendance.push(rec);
      }
      const before = `${rec.checkIn ? fmt(rec.checkIn, "h:mm a") : "no check-in"}${rec.checkOut ? ` to ${fmt(rec.checkOut, "h:mm a")}` : ""}`;
      if (cmd.checkIn !== undefined) rec.checkIn = at(cmd.checkIn);
      if (cmd.checkOut !== undefined) rec.checkOut = at(cmd.checkOut);
      if (rec.checkIn && rec.checkOut && rec.checkOut <= rec.checkIn) fail("Check-out must be after check-in.");
      if (rec.checkIn) {
        const late = new Date(rec.checkIn).getTime() - new Date(at(sc.workStart)!).getTime() > 15 * 60000;
        if (rec.status === "absent" || rec.status === "present" || rec.status === "late") rec.status = late ? "late" : "present";
      } else if (rec.status === "present" || rec.status === "late") rec.status = "absent";
      rec.corrected = { byId: me, at: nowIso, reason };
      const after = `${rec.checkIn ? fmt(rec.checkIn, "h:mm a") : "no check-in"}${rec.checkOut ? ` to ${fmt(rec.checkOut, "h:mm a")}` : ""}`;
      log("check_in", `Corrected ${first(p.id)}'s attendance for ${cmd.date}: ${before} → ${after} (${reason})`);
      note(p.id, "deadline", `${first(me)} corrected your attendance`, `${cmd.date}: ${after}. ${reason}`);
      break;
    }
    case "recordLeave": {
      const p = w.people.find((x) => x.id === cmd.personId && x.active !== false) ?? fail("That person is no longer in the company.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cmd.from) || !/^\d{4}-\d{2}-\d{2}$/.test(cmd.to) || cmd.to < cmd.from) fail("Pick the first and last day of the leave.");
      if (w.leaves.some((l) => l.personId === p.id && l.status !== "declined" && l.from <= cmd.to && l.to >= cmd.from)) fail(`${first(p.id)} already has leave on some of those days.`);
      w.leaves.push({ id: ctx.uid("lv"), personId: p.id, from: cmd.from, to: cmd.to, type: cmd.leaveType, status: "approved", note: cmd.note.trim() || undefined });
      const today = localDate(now, tz);
      if (cmd.from <= today && cmd.to >= today) p.onLeave = true;
      const cover = backupFor(w, p.id);
      log(
        "reminders_paused",
        `Recorded ${first(p.id)}'s ${cmd.leaveType} leave, ${cmd.from}${cmd.to !== cmd.from ? ` to ${cmd.to}` : ""}. Reminders pause and new work goes to ${cover ? first(cover) : "their lead"}.`,
      );
      note(p.id, "deadline", `${first(me)} recorded your leave`, `${cmd.leaveType} leave, ${cmd.from}${cmd.to !== cmd.from ? ` to ${cmd.to}` : ""}. Reminders pause on those days.`, undefined);
      break;
    }
    case "editComment": {
      const t = task(cmd.taskId);
      const c = t.comments.find((x) => x.id === cmd.commentId) ?? fail("That comment no longer exists.");
      if (c.authorId !== me) fail("Only the person who wrote a comment can edit it.");
      if (c.kind === "voice") fail("Voice notes can't be edited. Add a new comment instead.");
      const body = cmd.body.trim() || fail("A comment can't be empty.");
      if (body === c.body) break;
      // nothing is quietly rewritten: every earlier version stays visible
      c.history = [...(c.history ?? []), { body: c.body, at: c.editedAt ?? c.at }];
      c.body = body;
      c.editedAt = nowIso;
      log("commented", `Edited a comment (the earlier version is kept)`, t.id);
      break;
    }

    case "routeTask": {
      const t = task(cmd.taskId);
      const pool = t.pool?.mode === "route" ? t.pool : fail("This task wasn't sent to be passed on.");
      if (pool.routedAt) fail("This task has already been passed on.");
      if (t.assigneeId !== me) fail(`Only ${first(t.assigneeId)} can pass this task on.`);
      if (!["assigned", "acknowledged"].includes(t.status)) fail("Pass it on before work starts.");
      const to = w.people.find((p) => p.id === cmd.toId && p.active !== false) ?? fail("Pick who should do it.");
      if (to.id !== me && !membersOf(w, pool.unitType, pool.unitId).includes(to.id)) fail(`Pick someone in ${pool.unitName}.`);
      if (to.id === me) {
        set(t, { pool: { ...pool, routedAt: nowIso } });
        log("assigned", `${first(me)} kept it to do themselves`, t.id);
        break;
      }
      set(t, {
        assigneeId: to.id,
        status: "assigned",
        statusChangedAt: nowIso,
        acknowledgedAt: undefined,
        escalationLevel: 0,
        remindersIgnored: 0,
        remindersSent: 0,
        remindersToday: 0,
        lastReminderAt: undefined,
        departmentId: to.departmentId || t.departmentId,
        watcherIds: Array.from(new Set([...t.watcherIds, me])).filter((id) => id !== to.id),
        pool: { ...pool, routedAt: nowIso },
      });
      log("reassigned", `${first(me)} passed it on to ${first(to.id)}`, t.id);
      note(to.id, "assigned", `${first(me)} assigned you a task`, `${t.title}, ${fmt(t.dueAt, "EEE h:mm a")}`, t.id);
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
      if (ch.archivedAt) fail("This channel is archived. Restore it to post here.");
      log("announcement", `Posted "${title}" in ${ch.name}`);
      const members = channelMembersOf(w, ch);
      const named = new Set(mentioned(`${title} ${cmd.body}`, members));
      for (const r of members) {
        if (named.has(r)) continue;
        // a notice that needs an OK always arrives; anything else respects the person's mute
        if (!cmd.requiresAck && muted(r, ch.id)) continue;
        note(r, "announcement", cmd.requiresAck ? `${first(me)} posted a notice that needs your OK` : `New notice in ${ch.name}`, title);
      }
      for (const r of named) note(r, "mention", `${first(me)} mentioned you in ${ch.name}`, title);
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
      const waiting = channelMembersOf(w, ch).filter((id) => !a.ackBy[id] && id !== a.authorId);
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
      // late is judged against this person's own hours, in their own time zone
      const sc = scheduleFor(w, me);
      const ln = localNowFor(w, me, now);
      const date = ln.date;
      const late = ln.minutes > toMinutes(sc.workStart) + 15;
      const existing = w.attendance.find((a) => a.personId === me && a.date === date);
      if (existing?.checkIn && !existing.checkOut) fail("You're already checked in.");
      const rec = {
        personId: me,
        date,
        checkIn: existing?.checkIn ?? nowIso,
        checkOut: undefined,
        breakMin: existing?.breakMin ?? 0,
        breaks: existing?.breaks ?? [],
        status: existing?.status && existing.checkIn ? existing.status : late ? ("late" as const) : ("present" as const),
      };
      if (existing) Object.assign(existing, rec);
      else w.attendance.push(rec);
      log("check_in", "Checked in");
      break;
    }
    case "checkOut": {
      const date = localNowFor(w, me, now).date;
      const rec = w.attendance.find((a) => a.personId === me && a.date === date);
      if (!rec?.checkIn) fail("Check in first.");
      stopTimerFor(me);
      closeBreak(rec!);
      rec!.checkOut = nowIso;
      log("check_out", "Checked out");
      break;
    }
    case "startBreak": {
      const date = localNowFor(w, me, now).date;
      const rec = w.attendance.find((a) => a.personId === me && a.date === date);
      if (!rec?.checkIn || rec.checkOut) fail("Check in first. A break is part of a working day.");
      if (rec!.breaks?.some((b) => !b.end)) fail("You're already on a break.");
      // the clock stops with you: a running timer pauses for the break
      const timer = w.timers[me];
      if (timer) {
        stopTimerFor(me);
        log("timer", "Timer paused for a break", timer.taskId);
      }
      rec!.breaks = [...(rec!.breaks ?? []), { start: nowIso }];
      log("break", "Started a break");
      break;
    }
    case "endBreak": {
      const date = localNowFor(w, me, now).date;
      const rec = w.attendance.find((a) => a.personId === me && a.date === date);
      if (!rec?.breaks?.some((b) => !b.end)) fail("You're not on a break.");
      const mins = closeBreak(rec!);
      log("break", `Back from a ${mins}-minute break`);
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
      // every change is on the record with what it was before (spec §12, audit trail)
      const show = (v: unknown) => (v === undefined ? "unset" : typeof v === "string" && v.startsWith("data:") ? "an image" : JSON.stringify(v));
      const diffs = (Object.keys(cmd.patch) as (keyof typeof cmd.patch)[])
        .filter((k) => JSON.stringify(w.settings[k]) !== JSON.stringify(cmd.patch[k]))
        .map((k) => `${k}: ${show(w.settings[k])} → ${show(cmd.patch[k])}`);
      w.settings = { ...w.settings, ...cmd.patch };
      if (diffs.length) log("security", `Changed company settings. ${diffs.join("; ")}`.slice(0, 1800));
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
      unitChannels("department", id, name, "", ["announcement", "open", "task_feed"]);
      log("created", `Created the ${name} department`);
      break;
    }
    case "addTeam": {
      const name = cmd.name.trim() || fail("Give the team a name.");
      if (!w.departments.some((d) => d.id === cmd.departmentId)) fail("Pick a department.");
      const teamId = ctx.uid("t");
      w.teams.push({
        id: teamId,
        name,
        departmentId: cmd.departmentId,
        leadId: cmd.leadId,
      });
      unitChannels("team", teamId, name, "", ["open", "task_feed"]);
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
      unitChannels("group", id, name, cmd.description.trim(), ["open"]);
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
            `${dueSoon.length ? `${dueSoon.length} due within two days. ` : ""}New work for them goes to ${first(backupFor(w, p.id) ?? me)}. Hand the open tasks over from Tasks so nothing goes overdue while they're away.`,
            undefined,
            { self: true },
          );
        }
      }
      break;
    }
    case "addProject": {
      const name = cmd.name.trim() || fail("Give the project a name.");
      if (w.projects.some((p) => p.id === cmd.id)) fail("This project was already created.");
      if (w.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail(`There's already a project called ${name}.`);
      const lead = w.people.find((p) => p.id === cmd.leadId && p.active !== false) ?? fail("Pick who leads the project.");
      if (cmd.defaultAssigneeId && !w.people.some((p) => p.id === cmd.defaultAssigneeId && p.active !== false)) fail("Pick who new tasks go to, or leave it empty.");
      w.projects.push({ id: cmd.id, name, hue: (name.length * 47 + w.projects.length * 83) % 360, leadId: lead.id, defaultAssigneeId: cmd.defaultAssigneeId || undefined });
      log("created", `Created the project ${name}, led by ${first(lead.id)}${cmd.defaultAssigneeId ? `. New tasks in it go to ${first(cmd.defaultAssigneeId)}` : ""}`);
      break;
    }
    case "editProject": {
      const pr = w.projects.find((p) => p.id === cmd.projectId) ?? fail("That project no longer exists.");
      const p = cmd.patch;
      if (p.name !== undefined) {
        const name = p.name.trim() || fail("The project needs a name.");
        if (w.projects.some((x) => x.id !== pr.id && x.name.toLowerCase() === name.toLowerCase())) fail(`There's already a project called ${name}.`);
        pr.name = name;
      }
      if (p.leadId !== undefined) pr.leadId = (w.people.find((x) => x.id === p.leadId && x.active !== false) ?? fail("Pick who leads the project.")).id;
      if (p.defaultAssigneeId !== undefined) {
        if (p.defaultAssigneeId && !w.people.some((x) => x.id === p.defaultAssigneeId && x.active !== false)) fail("Pick who new tasks go to, or leave it empty.");
        pr.defaultAssigneeId = p.defaultAssigneeId || undefined;
      }
      log("created", `Updated the project ${pr.name}${pr.defaultAssigneeId ? `. New tasks in it go to ${first(pr.defaultAssigneeId)}` : ""}`);
      break;
    }
    case "updateDepartment": {
      const dep = w.departments.find((d) => d.id === cmd.departmentId) ?? fail("That department no longer exists.");
      const p = cmd.patch;
      if (p.name !== undefined) dep.name = p.name.trim() || fail("The department needs a name.");
      if (p.description !== undefined) dep.description = p.description.trim();
      if (p.settings !== undefined) {
        const st = p.settings ?? undefined;
        if (st?.workStart && st.workEnd && toMinutes(st.workEnd) <= toMinutes(st.workStart)) fail("The day has to end after it starts.");
        if (st?.workDays && !st.workDays.length) fail("Keep at least one working day.");
        dep.settings = st && Object.keys(st).length ? st : undefined;
      }
      log("created", `Updated the ${dep.name} department${p.settings !== undefined ? (dep.settings ? "'s own rules" : ": it follows the company rules again") : ""}`);
      break;
    }
    case "setPersonSchedule": {
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      const sc = cmd.schedule ?? undefined;
      if (sc?.workStart && sc.workEnd && toMinutes(sc.workEnd) <= toMinutes(sc.workStart)) fail("The day has to end after it starts.");
      if (sc?.workDays && !sc.workDays.length) fail("Keep at least one working day.");
      if (sc?.timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: sc.timezone });
        } catch {
          fail("That time zone isn't recognised.");
        }
      }
      const clean = sc ? (Object.fromEntries(Object.entries(sc).filter(([, v]) => v !== undefined && v !== "")) as WorkSchedule) : undefined;
      p.schedule = clean && Object.keys(clean).length ? clean : undefined;
      log("created", p.schedule ? `Set ${first(p.id)}'s own working hours${p.schedule.timezone ? ` (${p.schedule.timezone})` : ""}` : `${first(p.id)} follows their department's working hours again`);
      break;
    }
    case "setSecondaryTeams": {
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      const ids = Array.from(new Set(cmd.teamIds)).filter((id) => id !== p.teamId);
      for (const id of ids) if (!w.teams.some((t) => t.id === id)) fail("One of those teams no longer exists.");
      p.secondaryTeamIds = ids.length ? ids : undefined;
      const names = ids.map((id) => w.teams.find((t) => t.id === id)!.name);
      log("reassigned", names.length ? `${first(p.id)} also works in ${names.join(", ")}. Their home team is unchanged.` : `${first(p.id)} is only in their home team now`);
      break;
    }
    case "setBackup": {
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      if (cmd.backupId) {
        if (cmd.backupId === p.id) fail("Pick someone else to cover for them.");
        const b = w.people.find((x) => x.id === cmd.backupId && x.active !== false) ?? fail("Pick a backup who is still in the company.");
        p.backupId = b.id;
        log("reassigned", `${first(b.id)} now covers for ${first(p.id)} when they're away`);
      } else {
        p.backupId = undefined;
        log("reassigned", `${first(p.id)} has no named backup: their team lead covers when they're away`);
      }
      break;
    }
    case "replyNotice": {
      const a = w.announcements.find((x) => x.id === cmd.id) ?? fail("That notice no longer exists.");
      const ch = w.channels.find((c) => c.id === a.channelId) ?? fail("That channel no longer exists.");
      if (ch.archivedAt) fail("This channel is archived.");
      const body = cmd.body.trim() || fail("Write a reply first.");
      if (body.length > 2000) fail("Keep replies under 2,000 characters.");
      a.replies = [...(a.replies ?? []), { id: ctx.uid("rp"), authorId: me, at: nowIso, body }];
      const members = channelMembersOf(w, ch);
      const named = new Set(mentioned(body, members));
      for (const r of named) note(r, "mention", `${first(me)} mentioned you in ${ch.name}`, body.slice(0, 140));
      // whoever posted, and anyone already in the thread, hears about replies
      const thread = new Set([a.authorId, ...(a.replies ?? []).map((r) => r.authorId)]);
      for (const r of thread) if (!named.has(r) && !muted(r, ch.id) && members.includes(r)) note(r, "mention", `${first(me)} replied to "${a.title}"`, body.slice(0, 140));
      break;
    }
    case "addChannel": {
      const name = cmd.name.trim() || fail("Give the channel a name.");
      if (cmd.id && w.channels.some((c) => c.id === cmd.id)) fail("This channel was already created.");
      // the id comes from the browser, so the channel it shows straight away is the one that is saved
      const chId = cmd.id ?? ctx.uid("c");
      if (cmd.kind === "private") {
        const ids = Array.from(new Set([...(cmd.memberIds ?? []), me]));
        if (ids.length < 2) fail("Invite at least one other person.");
        w.channels.push({ id: chId, name, kind: "private", unitType: cmd.unitType, unitId: cmd.unitId, description: cmd.description.trim(), memberIds: ids, createdById: me });
        for (const r of ids) note(r, "announcement", `${first(me)} added you to ${name}`, "A private channel: only invited people can see it.");
      } else {
        w.channels.push({ id: chId, name, kind: cmd.kind, unitType: cmd.unitType, unitId: cmd.unitId, description: cmd.description.trim(), createdById: me });
      }
      log("created", `Created the channel ${name}`);
      break;
    }
    case "editChannel": {
      const ch = w.channels.find((c) => c.id === cmd.channelId) ?? fail("That channel no longer exists.");
      if (cmd.name !== undefined) ch.name = cmd.name.trim() || fail("Give the channel a name.");
      if (cmd.description !== undefined) ch.description = cmd.description.trim();
      if (cmd.memberIds) {
        if (ch.kind !== "private") fail("Membership follows the unit. Change who is in the team or group instead.");
        const before = new Set(channelMembersOf(w, ch));
        ch.memberIds = Array.from(new Set([...cmd.memberIds, ch.createdById ?? me]));
        for (const r of ch.memberIds) if (!before.has(r)) note(r, "announcement", `${first(me)} added you to ${ch.name}`, "A private channel: only invited people can see it.");
      }
      log("created", `Updated the channel ${ch.name}`);
      break;
    }
    case "archiveChannel": {
      const ch = w.channels.find((c) => c.id === cmd.channelId) ?? fail("That channel no longer exists.");
      ch.archivedAt = cmd.archived ? nowIso : undefined;
      log("created", cmd.archived ? `Archived the channel ${ch.name}. Its notices stay readable.` : `Restored the channel ${ch.name}`);
      break;
    }
    case "addPin": {
      const ch = w.channels.find((c) => c.id === cmd.channelId) ?? fail("That channel no longer exists.");
      const title = cmd.title.trim() || fail("Give it a name people will recognise.");
      if (!cmd.url && !cmd.fileId) fail("Add a link or a file.");
      if (cmd.url && !/^https?:\/\//i.test(cmd.url.trim())) fail("Links start with http:// or https://");
      if ((ch.pins?.length ?? 0) >= 30) fail("A channel holds up to 30 pinned items. Remove one first.");
      ch.pins = [...(ch.pins ?? []), { id: ctx.uid("pin"), title, url: cmd.url?.trim() || undefined, fileId: cmd.fileId, fileName: cmd.fileName, byId: me, at: nowIso }];
      log("created", `Pinned "${title}" in ${ch.name}`);
      break;
    }
    case "removePin": {
      const ch = w.channels.find((c) => c.id === cmd.channelId) ?? fail("That channel no longer exists.");
      const pin = ch.pins?.find((p) => p.id === cmd.pinId) ?? fail("That item is no longer pinned.");
      ch.pins = ch.pins!.filter((p) => p.id !== pin.id);
      log("created", `Unpinned "${pin.title}" from ${ch.name}`);
      break;
    }
    case "editGroup": {
      const g = w.groups.find((x) => x.id === cmd.groupId) ?? fail("That group no longer exists.");
      if (cmd.name !== undefined) {
        const name = cmd.name.trim() || fail("Give the group a name.");
        for (const ch of w.channels) if (ch.unitType === "group" && ch.unitId === g.id && ch.name === g.name) ch.name = name;
        g.name = name;
      }
      if (cmd.description !== undefined) g.description = cmd.description.trim();
      if (cmd.memberIds) {
        const added = cmd.memberIds.filter((id) => !g.memberIds.includes(id));
        const removed = g.memberIds.filter((id) => !cmd.memberIds!.includes(id));
        g.memberIds = Array.from(new Set(cmd.memberIds));
        for (const r of added) note(r, "announcement", `${first(me)} added you to ${g.name}`, g.description || "You'll see its channel and the work sent to it.");
        if (added.length || removed.length)
          log("reassigned", `${g.name}: ${[added.length ? `added ${added.map(first).join(", ")}` : "", removed.length ? `removed ${removed.map(first).join(", ")}` : ""].filter(Boolean).join("; ")}`);
      }
      break;
    }
    case "archiveGroup": {
      const g = w.groups.find((x) => x.id === cmd.groupId) ?? fail("That group no longer exists.");
      if (cmd.archived && w.tasks.some((t) => t.pool?.unitType === "group" && t.pool.unitId === g.id && !["approved", "cancelled"].includes(t.status) && !t.pool.pickedId))
        fail("Work sent to this group is still waiting for someone. Assign or cancel it first.");
      g.archivedAt = cmd.archived ? nowIso : undefined;
      // its channels go with it, and stay readable
      for (const ch of w.channels) if (ch.unitType === "group" && ch.unitId === g.id) ch.archivedAt = cmd.archived ? nowIso : undefined;
      log("created", cmd.archived ? `Archived the group ${g.name}. Its history stays.` : `Restored the group ${g.name}`);
      break;
    }
    case "setAvailability": {
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      const note_ = cmd.note.trim();
      if (note_.length > 120) fail("Keep it short: under 120 characters.");
      if (cmd.until && cmd.until <= nowIso) fail("Pick a time later than now.");
      p.availability = note_ ? { note: note_, until: cmd.until, at: nowIso } : undefined;
      break;
    }
    case "purgeContact": {
      const p = w.people.find((x) => x.id === cmd.personId) ?? fail("That person no longer exists.");
      if (p.active !== false) fail("Deactivate them first. Contact details are only wiped for people who have left.");
      p.phone = "";
      p.availability = undefined;
      p.contactPurgedAt = nowIso;
      log("security", `Wiped ${first(p.id)}'s personal contact details. Their work history stays.`);
      break;
    }
    case "archiveTeam": {
      const team = w.teams.find((t) => t.id === cmd.teamId) ?? fail("That team no longer exists.");
      const inIt = w.people.filter((p) => p.active !== false && (p.teamId === team.id || p.secondaryTeamIds?.includes(team.id)) && p.id !== team.leadId);
      if (inIt.length) fail(`${inIt.length === 1 ? `${first(inIt[0].id)} is` : `${inIt.length} people are`} still in ${team.name}. Move them to another team first.`);
      const lead = w.people.find((p) => p.id === team.leadId);
      if (lead && lead.teamId === team.id) lead.teamId = "";
      team.archivedAt = nowIso;
      for (const ch of w.channels) if (ch.unitType === "team" && ch.unitId === team.id) ch.archivedAt = nowIso;
      log("created", `Wound up the ${team.name} team. Its channel and history stay readable.`);
      break;
    }
    case "archiveDepartment": {
      const d = w.departments.find((x) => x.id === cmd.departmentId) ?? fail("That department no longer exists.");
      if (w.teams.some((t) => t.departmentId === d.id && !t.archivedAt)) fail(`${d.name} still has teams. Wind those up or move them first.`);
      const inIt = w.people.filter((p) => p.active !== false && p.departmentId === d.id && p.id !== d.headId);
      if (inIt.length) fail(`${inIt.length === 1 ? `${first(inIt[0].id)} is` : `${inIt.length} people are`} still in ${d.name}. Move them first.`);
      const head = w.people.find((p) => p.id === d.headId);
      if (head && head.departmentId === d.id) head.departmentId = "";
      d.archivedAt = nowIso;
      for (const ch of w.channels) if (ch.unitType === "department" && ch.unitId === d.id) ch.archivedAt = nowIso;
      log("created", `Wound up the ${d.name} department. Its channels and history stay readable.`);
      break;
    }
    case "setTeamMember": {
      const team = w.teams.find((t) => t.id === cmd.teamId) ?? fail("That team no longer exists.");
      const p = w.people.find((x) => x.id === cmd.personId && x.active !== false) ?? fail("That person is no longer in the company.");
      if (p.teamId === team.id) fail(`${team.name} is ${first(p.id)}'s home team. Move them to another team first.`);
      const cur = new Set(p.secondaryTeamIds ?? []);
      if (cmd.member) cur.add(team.id);
      else cur.delete(team.id);
      p.secondaryTeamIds = [...cur];
      if (cmd.member) note(p.id, "announcement", `${first(me)} added you to ${team.name}`, "You'll see its work and channel. Your home team stays the same.");
      log("reassigned", cmd.member ? `Added ${first(p.id)} to ${team.name}` : `Took ${first(p.id)} off ${team.name}`);
      break;
    }
    case "setPrefFor": {
      if (!w.people.some((x) => x.id === cmd.personId)) fail("That person no longer exists.");
      const cur = { ...(w.prefs[cmd.personId] ?? {}) };
      if (cmd.value === null) delete cur[cmd.key];
      else cur[cmd.key] = cmd.value;
      w.prefs[cmd.personId] = cur;
      log("security", `Changed where ${first(cmd.personId)}'s ${cmd.key.split(":")[1] ?? ""} notifications go`);
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
    case "setSavedViews": {
      if (cmd.views.length > 30) fail("Keep it to 30 saved views. Delete one you don't use.");
      w.savedViews[me] = cmd.views.map((v) => ({ ...v, name: v.name.trim().slice(0, 60) || "Saved view" }));
      break;
    }

    default: {
      const never: never = cmd;
      fail(`Unknown action ${(never as { type: string }).type}`);
    }
  }

  // a deadline or owner that changed moves the moment the work turns overdue (working hours aware);
  // a date-only deadline is due at the end of the assignee's working day
  const was = new Map(world.tasks.map((t) => [t.id, `${t.dueAt}|${t.assigneeId}|${t.dueAllDay ?? ""}`]));
  for (const t of w.tasks) {
    const key = `${t.dueAt}|${t.assigneeId}|${t.dueAllDay ?? ""}`;
    if (was.get(t.id) === key && t.overdueAt) continue;
    if (t.dueAllDay) t.dueAt = endOfWorkingDay(w, t.assigneeId, localDate(t.dueAt, scheduleFor(w, t.assigneeId).timezone));
    t.overdueAt = overdueFrom(w, t.assigneeId, t.dueAt);
  }

  // any human action on a task means it isn't idle any more
  for (const a of acts) {
    if (!a.taskId || a.actorId === "system") continue;
    const t = w.tasks.find((x) => x.id === a.taskId);
    if (t?.idleFlaggedAt) t.idleFlaggedAt = undefined;
  }
  // watchers see what happens to the task, without being responsible for it (spec §6)
  const WATCHED: Partial<Record<ActivityKind, NotificationKind>> = {
    submitted: "submitted",
    approved: "approved",
    rejected: "rejected",
    blocked: "blocked",
    unblocked: "unblocked",
    deadline_changed: "deadline",
    reassigned: "assigned",
    cancelled: "deadline",
    commented: "mention",
  };
  const told = new Set<string>();
  for (const a of acts) {
    const kind = a.taskId ? WATCHED[a.kind] : undefined;
    const t = kind && w.tasks.find((x) => x.id === a.taskId);
    if (!t || !kind) continue;
    for (const id of t.watcherIds ?? []) {
      const key = `${id}:${t.id}`;
      // once per command, and not for people already told about this task just now
      if (id === me || told.has(key) || notes.some((n) => n.recipientId === id && n.taskId === t.id)) continue;
      told.add(key);
      note(id, kind, `${t.title}`, `${first(a.actorId === "system" ? t.assigneeId : a.actorId)}: ${a.text}`.slice(0, 240), t.id);
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
