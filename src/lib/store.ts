"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { differenceInHours, format } from "date-fns";
import { createSeed, DEFAULT_REMINDER, type SeedData } from "./seed";
import type {
  Activity,
  ActivityKind,
  AppNotification,
  HeatLevel,
  NotificationKind,
  Priority,
  ReminderRule,
  Role,
  Task,
  TaskStatus,
  Timer,
  OrgSettings,
  Leave,
} from "./types";
import { uid } from "./utils";

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
}

export interface DemoSettings {
  engineOn: boolean;
  intervalSec: number;
  systemNotifications: boolean;
}

export interface FiredReminder {
  taskId: string;
  title: string;
  body: string;
  count: number;
}

type ActionResult = { ok: true } | { ok: false; error: string };

interface Actions {
  setRole: (role: Role) => void;
  openTask: (id: string | null) => void;
  openCreate: (defaults?: Partial<NewTaskInput>) => void;
  closeCreate: () => void;
  setCommandOpen: (open: boolean) => void;

  createTask: (input: NewTaskInput) => string;
  acknowledge: (taskId: string) => void;
  start: (taskId: string) => void;
  snooze: (taskId: string, minutes: number) => ActionResult;
  block: (taskId: string, reason: string, blockerOwnerId?: string) => void;
  unblock: (taskId: string, note?: string) => void;
  submit: (taskId: string, note: string, proofName?: string) => ActionResult;
  approve: (taskId: string, note?: string) => void;
  reject: (taskId: string, reason: string) => void;
  cancel: (taskId: string, reason: string) => void;
  reassign: (taskId: string, toId: string, reason: string) => void;
  changeDeadline: (taskId: string, newDueAt: string, reason: string) => void;
  requestDeadline: (taskId: string, newDueAt: string, reason: string) => void;
  decideDeadline: (requestId: string, approve: boolean) => void;
  claimTask: (taskId: string) => void;
  publishDraft: (taskId: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  addComment: (taskId: string, body: string, kind?: "text" | "voice", durationSec?: number) => void;
  addAttachment: (taskId: string, name: string, kind: "image" | "file") => void;

  startTimer: (taskId: string) => void;
  stopTimer: () => void;

  markRead: (id: string) => void;
  markAllRead: () => void;

  postAnnouncement: (input: { channelId: string; title: string; body: string; requiresAck: boolean; ackDueAt?: string }) => void;
  ackAnnouncement: (id: string) => void;
  readAnnouncement: (id: string) => void;

  askQuestion: (input: { toId: string; body: string; taskId?: string }) => void;
  answerQuestion: (id: string, answer: string) => void;

  checkIn: () => void;
  checkOut: () => void;
  requestLeave: (input: Omit<Leave, "id" | "status" | "personId">) => void;
  decideLeave: (id: string, approve: boolean) => void;

  updateSettings: (patch: Partial<OrgSettings>) => void;
  addHoliday: (date: string, name: string) => void;
  removeHoliday: (date: string) => void;
  addDepartment: (input: { name: string; headId: string; description: string }) => void;
  addTeam: (input: { name: string; departmentId: string; leadId: string }) => void;
  addGroup: (input: { name: string; description: string; memberIds: string[] }) => void;
  movePerson: (personId: string, teamId: string) => void;
  setOnLeave: (personId: string, onLeave: boolean) => void;
  setPref: (key: string, value: boolean) => void;
  setDemo: (patch: Partial<DemoSettings>) => void;
  engineTick: () => FiredReminder | null;
  resetDemo: () => void;
}

export interface AppState extends SeedData, Actions {
  role: Role;
  userIds: Record<Role, string>;
  openTaskId: string | null;
  createOpen: boolean;
  createDefaults: Partial<NewTaskInput> | null;
  commandOpen: boolean;
  timers: Record<string, Timer | undefined>;
  demo: DemoSettings;
  dayOrder: Record<string, string[]>;
  prefs: Record<string, Record<string, boolean>>;
  setDayOrder: (ids: string[]) => void;
}

const DEFAULT_USERS: Record<Role, string> = {
  owner: "p_imran",
  manager: "p_saad",
  employee: "p_ali",
};

const firstName = (s: SeedData, id: string) =>
  s.people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      /* ---------- internal helpers ---------- */
      const me = () => get().userIds[get().role];
      const nowIso = () => new Date().toISOString();

      const logEntry = (kind: ActivityKind, text: string, taskId?: string, actorId?: string): Activity => ({
        id: uid("act"),
        at: nowIso(),
        actorId: actorId ?? me(),
        kind,
        text,
        taskId,
      });

      const note = (
        recipientId: string,
        kind: NotificationKind,
        title: string,
        body: string,
        taskId?: string,
      ): AppNotification => ({
        id: uid("n"),
        at: nowIso(),
        recipientId,
        kind,
        title,
        body,
        taskId,
        read: recipientId === me(),
      });

      /** apply a patch to one task + append log entries and notifications */
      const commit = (
        taskId: string,
        patch: Partial<Task> | ((t: Task) => Partial<Task>),
        logs: Activity[] = [],
        notes: AppNotification[] = [],
      ) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) }
              : t,
          ),
          activity: [...logs.reverse(), ...s.activity],
          notifications: [...notes, ...s.notifications],
        }));

      const task = (id: string) => get().tasks.find((t) => t.id === id)!;

      const leadOf = (personId: string) => {
        const s = get();
        const p = s.people.find((x) => x.id === personId);
        const team = s.teams.find((t) => t.id === p?.teamId);
        return team?.leadId && team.leadId !== personId ? team.leadId : undefined;
      };
      const headOf = (personId: string) => {
        const s = get();
        const p = s.people.find((x) => x.id === personId);
        const dep = s.departments.find((d) => d.id === p?.departmentId);
        return dep?.headId && dep.headId !== personId ? dep.headId : undefined;
      };

      const stopTimerFor = (personId: string): Partial<AppState> | null => {
        const s = get();
        const timer = s.timers[personId];
        if (!timer) return null;
        const mins = Math.max(1, Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 60000));
        return {
          timers: { ...s.timers, [personId]: undefined },
          tasks: s.tasks.map((t) => (t.id === timer.taskId ? { ...t, loggedMinutes: t.loggedMinutes + mins } : t)),
        };
      };

      const deescalate = (t: Task): { patch: Partial<Task>; log?: Activity } =>
        t.escalationLevel > 0
          ? {
              patch: { escalationLevel: 0 as HeatLevel, remindersIgnored: 0 },
              log: logEntry("deescalated", `Back to level 0 after ${firstName(get(), t.assigneeId)} responded`, t.id, "system"),
            }
          : { patch: { remindersIgnored: 0 } };

      return {
        ...createSeed(),
        role: "owner",
        userIds: DEFAULT_USERS,
        openTaskId: null,
        createOpen: false,
        createDefaults: null,
        commandOpen: false,
        timers: { p_ali: undefined },
        demo: { engineOn: true, intervalSec: 45, systemNotifications: false },
        dayOrder: {},
        prefs: {},
        setDayOrder: (ids) => set((s) => ({ dayOrder: { ...s.dayOrder, [s.userIds[s.role]]: ids } })),

        /* ---------- navigation-ish ---------- */
        setRole: (role) => set({ role, openTaskId: null }),
        openTask: (id) => set({ openTaskId: id }),
        openCreate: (defaults) => set({ createOpen: true, createDefaults: defaults ?? null }),
        closeCreate: () => set({ createOpen: false, createDefaults: null }),
        setCommandOpen: (open) => set({ commandOpen: open }),

        /* ---------- task lifecycle ---------- */
        createTask: (input) => {
          const s = get();
          const id = uid("task");
          const assignee = s.people.find((p) => p.id === input.assigneeId)!;
          const reviewerId = me() === input.assigneeId ? leadOf(input.assigneeId) ?? "p_imran" : me();
          const t: Task = {
            id,
            title: input.title.trim(),
            description: input.description?.trim() ?? "",
            assigneeId: input.assigneeId,
            createdById: me(),
            reviewerId,
            projectId: input.projectId,
            departmentId: assignee.departmentId || "d_ops",
            priority: input.priority,
            status: input.draft ? "draft" : "assigned",
            createdAt: nowIso(),
            startAt: input.startAt,
            dueAt: input.dueAt,
            estimateHours: input.estimateHours ?? 1,
            requiresApproval: input.requiresApproval ?? s.settings.approvalByDefault,
            requiresProof: input.requiresProof ?? false,
            requiresResult: input.requiresResult ?? false,
            reminder: { ...s.settings.defaultReminder, ...input.reminder },
            remindersSent: 0,
            remindersIgnored: 0,
            escalationLevel: 0,
            subtasks: (input.subtasks ?? []).filter(Boolean).map((title) => ({ id: uid("s"), title, done: false })),
            comments: [],
            attachments: [],
            watcherIds: [],
            tags: input.tags ?? [],
            rejections: 0,
            statusChangedAt: nowIso(),
            snoozesToday: 0,
            loggedMinutes: 0,
            recurrence: input.recurrence,
          };
          const logs = [
            input.draft
              ? logEntry("created", "Saved as draft", id)
              : logEntry("assigned", `Assigned to ${firstName(s, input.assigneeId)}`, id),
          ];
          const notes =
            input.draft || input.assigneeId === me()
              ? []
              : [
                  note(
                    input.assigneeId,
                    "assigned",
                    `${firstName(s, me())} assigned you a task`,
                    `${t.title}, ${format(new Date(t.dueAt), "EEE h:mm a")}`,
                    id,
                  ),
                ];
          set((st) => ({
            tasks: [t, ...st.tasks],
            activity: [...logs, ...st.activity],
            notifications: [...notes, ...st.notifications],
          }));
          return id;
        },

        publishDraft: (taskId) => {
          const t = task(taskId);
          commit(
            taskId,
            { status: "assigned", statusChangedAt: nowIso(), createdAt: nowIso() },
            [logEntry("assigned", `Published and assigned to ${firstName(get(), t.assigneeId)}`, taskId)],
            [note(t.assigneeId, "assigned", `${firstName(get(), me())} assigned you a task`, t.title, taskId)],
          );
        },

        claimTask: (taskId) => {
          const t = task(taskId);
          const who = me();
          commit(
            taskId,
            {
              assigneeId: who,
              status: "acknowledged",
              acknowledgedAt: nowIso(),
              statusChangedAt: nowIso(),
              groupClaim: t.groupClaim ? { ...t.groupClaim, claimed: true } : undefined,
              escalationLevel: 0,
              remindersIgnored: 0,
            },
            [logEntry("acknowledged", `Claimed from ${t.groupClaim?.unitName ?? "the team"}`, taskId)],
          );
        },

        acknowledge: (taskId) => {
          const t = task(taskId);
          if (t.status !== "assigned") return;
          const d = deescalate(t);
          commit(
            taskId,
            { status: "acknowledged", acknowledgedAt: nowIso(), statusChangedAt: nowIso(), snoozedUntil: undefined, ...d.patch },
            [logEntry("acknowledged", "Acknowledged", taskId), ...(d.log ? [d.log] : [])],
          );
        },

        start: (taskId) => {
          const t = task(taskId);
          const who = t.assigneeId;
          const stopped = stopTimerFor(who);
          if (stopped) set(stopped);
          const d = deescalate(t);
          commit(
            taskId,
            {
              status: "in_progress",
              acknowledgedAt: t.acknowledgedAt ?? nowIso(),
              startedAt: t.startedAt ?? nowIso(),
              statusChangedAt: nowIso(),
              snoozedUntil: undefined,
              ...d.patch,
            },
            [logEntry("started", t.startedAt ? "Resumed work" : "Started work", taskId), ...(d.log ? [d.log] : [])],
          );
          set((s) => ({ timers: { ...s.timers, [who]: { taskId, startedAt: nowIso() } } }));
        },

        snooze: (taskId, minutes) => {
          const t = task(taskId);
          const max = get().settings.snoozeMaxPerDay;
          if (t.snoozesToday >= max) return { ok: false, error: `You can snooze a task ${max} times a day. Acknowledge it or mark it blocked.` };
          commit(
            taskId,
            { snoozedUntil: new Date(Date.now() + minutes * 60000).toISOString(), snoozesToday: t.snoozesToday + 1 },
            [logEntry("snoozed", `Snoozed reminders for ${minutes} min`, taskId)],
          );
          return { ok: true };
        },

        block: (taskId, reason, blockerOwnerId) => {
          const t = task(taskId);
          const owner = blockerOwnerId ?? t.reviewerId;
          const stopped = get().timers[t.assigneeId]?.taskId === taskId ? stopTimerFor(t.assigneeId) : null;
          if (stopped) set(stopped);
          const recipients = Array.from(new Set([t.reviewerId, owner])).filter((id) => id !== me());
          commit(
            taskId,
            {
              status: "blocked",
              blockedFrom: t.status,
              blockedReason: reason,
              blockedOwnerId: owner,
              blockedAt: nowIso(),
              statusChangedAt: nowIso(),
              escalationLevel: 0,
              remindersIgnored: 0,
            },
            [logEntry("blocked", `Blocked: ${reason}`, taskId)],
            recipients.map((r) =>
              note(r, "blocked", `${firstName(get(), t.assigneeId)} is blocked${r === owner ? " and waiting on you" : ""}`, `${t.title}: ${reason}`, taskId),
            ),
          );
        },

        unblock: (taskId, noteText) => {
          const t = task(taskId);
          const back: TaskStatus = t.startedAt ? "in_progress" : t.blockedFrom && t.blockedFrom !== "blocked" ? t.blockedFrom : "acknowledged";
          commit(
            taskId,
            { status: back, blockedReason: undefined, blockedOwnerId: undefined, blockedAt: undefined, blockedFrom: undefined, statusChangedAt: nowIso() },
            [logEntry("unblocked", noteText ? `Blocker cleared: ${noteText}` : "Blocker cleared", taskId)],
            t.assigneeId === me() ? [] : [note(t.assigneeId, "unblocked", "You can continue", `${t.title}${noteText ? `: ${noteText}` : ""}`, taskId)],
          );
        },

        submit: (taskId, noteText, proofName) => {
          const t = task(taskId);
          const hasProof = t.attachments.some((a) => a.isProof) || !!proofName;
          if (t.requiresProof && !hasProof) return { ok: false, error: "This task needs a photo or file as proof before you can submit it." };
          const stopped = get().timers[t.assigneeId]?.taskId === taskId ? stopTimerFor(t.assigneeId) : null;
          if (stopped) set(stopped);
          const attachments = proofName
            ? [
                ...t.attachments,
                { id: uid("a"), name: proofName, kind: "image" as const, sizeKb: 380, at: nowIso(), byId: me(), isProof: true, hue: 160 },
              ]
            : t.attachments;
          if (!t.requiresApproval) {
            commit(
              taskId,
              { status: "approved", submittedAt: nowIso(), approvedAt: nowIso(), statusChangedAt: nowIso(), submissionNote: noteText, attachments, escalationLevel: 0 },
              [logEntry("submitted", noteText ? `Submitted: ${noteText}` : "Submitted", taskId), logEntry("approved", "Auto-approved (routine task)", taskId, "system")],
            );
            return { ok: true };
          }
          commit(
            taskId,
            { status: "submitted", submittedAt: nowIso(), statusChangedAt: nowIso(), submissionNote: noteText, attachments, escalationLevel: 0 },
            [logEntry("submitted", noteText ? `Submitted: ${noteText}` : "Submitted for review", taskId)],
            [note(t.reviewerId, "submitted", `${firstName(get(), t.assigneeId)} submitted work for review`, t.title, taskId)],
          );
          return { ok: true };
        },

        approve: (taskId, noteText) => {
          const t = task(taskId);
          commit(
            taskId,
            { status: "approved", approvedAt: nowIso(), statusChangedAt: nowIso(), escalationLevel: 0 },
            [logEntry("approved", noteText ? `Approved with note: ${noteText}` : "Approved", taskId)],
            [note(t.assigneeId, "approved", `${firstName(get(), me())} approved your work`, noteText ? `${t.title}. "${noteText}"` : t.title, taskId)],
          );
        },

        reject: (taskId, reason) => {
          const t = task(taskId);
          commit(
            taskId,
            { status: "in_progress", rejections: t.rejections + 1, lastRejectionReason: reason, statusChangedAt: nowIso(), submittedAt: undefined },
            [logEntry("rejected", `Sent back: ${reason}`, taskId)],
            [note(t.assigneeId, "rejected", `${firstName(get(), me())} sent your work back`, `${t.title}: ${reason}`, taskId)],
          );
        },

        cancel: (taskId, reason) => {
          const t = task(taskId);
          commit(
            taskId,
            { status: "cancelled", statusChangedAt: nowIso() },
            [logEntry("cancelled", `Cancelled: ${reason}`, taskId)],
            t.assigneeId === me() ? [] : [note(t.assigneeId, "deadline", "A task was cancelled", `${t.title}: ${reason}`, taskId)],
          );
        },

        reassign: (taskId, toId, reason) => {
          const t = task(taskId);
          const from = t.assigneeId;
          commit(
            taskId,
            {
              assigneeId: toId,
              status: "assigned",
              statusChangedAt: nowIso(),
              watcherIds: Array.from(new Set([...t.watcherIds, from])),
              escalationLevel: 0,
              remindersIgnored: 0,
              acknowledgedAt: undefined,
            },
            [logEntry("reassigned", `Handed over from ${firstName(get(), from)} to ${firstName(get(), toId)}: ${reason}`, taskId)],
            [
              note(toId, "assigned", `${firstName(get(), me())} handed you a task`, `${t.title}. Full history is attached.`, taskId),
              note(from, "deadline", "A task moved to someone else", `${t.title} now with ${firstName(get(), toId)}. You stay as a watcher.`, taskId),
            ],
          );
        },

        changeDeadline: (taskId, newDueAt, reason) => {
          const t = task(taskId);
          commit(
            taskId,
            { dueAt: newDueAt },
            [logEntry("deadline_changed", `Deadline moved from ${format(new Date(t.dueAt), "EEE d MMM h:mm a")} to ${format(new Date(newDueAt), "EEE d MMM h:mm a")}: ${reason}`, taskId)],
            t.assigneeId === me() ? [] : [note(t.assigneeId, "deadline", "Deadline changed", `${t.title} is now due ${format(new Date(newDueAt), "EEE h:mm a")}`, taskId)],
          );
        },

        requestDeadline: (taskId, newDueAt, reason) => {
          const t = task(taskId);
          set((s) => ({
            deadlineRequests: [{ id: uid("dr"), taskId, byId: me(), newDueAt, reason, at: nowIso(), status: "pending" }, ...s.deadlineRequests],
            activity: [logEntry("deadline_requested", `Asked to move the deadline to ${format(new Date(newDueAt), "EEE d MMM h:mm a")}: ${reason}`, taskId), ...s.activity],
            notifications: [note(t.reviewerId, "deadline", `${firstName(s, me())} asked for more time`, `${t.title}: ${reason}`, taskId), ...s.notifications],
          }));
        },

        decideDeadline: (requestId, approve) => {
          const r = get().deadlineRequests.find((d) => d.id === requestId);
          if (!r) return;
          set((s) => ({ deadlineRequests: s.deadlineRequests.map((d) => (d.id === requestId ? { ...d, status: approve ? "approved" : "declined" } : d)) }));
          if (approve) get().changeDeadline(r.taskId, r.newDueAt, "Extension approved");
          else {
            const t = task(r.taskId);
            commit(r.taskId, {}, [logEntry("deadline_changed", "Extension request declined", r.taskId)], [note(r.byId, "deadline", "Extension declined", t.title, r.taskId)]);
          }
        },

        toggleSubtask: (taskId, subtaskId) => {
          const t = task(taskId);
          const st = t.subtasks.find((x) => x.id === subtaskId);
          commit(
            taskId,
            { subtasks: t.subtasks.map((x) => (x.id === subtaskId ? { ...x, done: !x.done } : x)) },
            st && !st.done ? [logEntry("subtask_done", `Ticked off "${st.title}"`, taskId)] : [],
          );
        },

        addSubtask: (taskId, title) => {
          const t = task(taskId);
          commit(taskId, { subtasks: [...t.subtasks, { id: uid("s"), title, done: false }] });
        },

        addComment: (taskId, body, kind = "text", durationSec) => {
          const t = task(taskId);
          const s = get();
          const mentioned = s.people.filter((p) => body.includes(`@${p.name.split(" ")[0]}`) && p.id !== me());
          commit(
            taskId,
            { comments: [...t.comments, { id: uid("c"), authorId: me(), body, at: nowIso(), kind, durationSec }] },
            [logEntry("commented", kind === "voice" ? `Voice note (${durationSec ?? 0}s)` : body, taskId)],
            mentioned.map((p) => note(p.id, "mention", `${firstName(s, me())} mentioned you`, `${t.title}: ${body}`, taskId)),
          );
          if (t.escalationLevel > 0 && t.assigneeId === me()) {
            const d = deescalate(task(taskId));
            commit(taskId, d.patch, d.log ? [d.log] : []);
          }
        },

        addAttachment: (taskId, name, kind) => {
          const t = task(taskId);
          commit(
            taskId,
            { attachments: [...t.attachments, { id: uid("a"), name, kind, sizeKb: 240 + Math.round(Math.random() * 600), at: nowIso(), byId: me(), isProof: t.requiresProof && kind === "image", hue: Math.round(Math.random() * 360) }] },
            [logEntry("commented", `Attached ${name}`, taskId)],
          );
        },

        /* ---------- timers ---------- */
        startTimer: (taskId) => get().start(taskId),
        stopTimer: () => {
          const who = me();
          const timer = get().timers[who];
          const stopped = stopTimerFor(who);
          if (stopped) {
            set(stopped);
            if (timer) set((s) => ({ activity: [logEntry("timer", "Paused the timer", timer.taskId), ...s.activity] }));
          }
        },

        /* ---------- notifications ---------- */
        markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
        markAllRead: () => {
          const who = me();
          set((s) => ({ notifications: s.notifications.map((n) => (n.recipientId === who ? { ...n, read: true } : n)) }));
        },

        /* ---------- channels ---------- */
        postAnnouncement: ({ channelId, title, body, requiresAck, ackDueAt }) => {
          const s = get();
          const ch = s.channels.find((c) => c.id === channelId)!;
          const members = membersOf(s, ch.unitType, ch.unitId).filter((id) => id !== me());
          const an = { id: uid("an"), channelId, authorId: me(), at: nowIso(), title, body, requiresAck, ackDueAt, ackBy: {}, readBy: {} };
          set((st) => ({
            announcements: [an, ...st.announcements],
            activity: [logEntry("announcement", `Posted "${title}" in ${ch.name}`), ...st.activity],
            notifications: [
              ...members.map((r) =>
                note(r, "announcement", requiresAck ? `${firstName(st, me())} posted a notice that needs your OK` : `New notice in ${ch.name}`, title),
              ),
              ...st.notifications,
            ],
          }));
        },
        ackAnnouncement: (id) => {
          const who = me();
          set((s) => ({
            announcements: s.announcements.map((a) =>
              a.id === id ? { ...a, ackBy: { ...a.ackBy, [who]: nowIso() }, readBy: { ...a.readBy, [who]: a.readBy[who] ?? nowIso() } } : a,
            ),
            activity: [logEntry("announcement", `Acknowledged "${s.announcements.find((a) => a.id === id)?.title}"`), ...s.activity],
          }));
        },
        readAnnouncement: (id) => {
          const who = me();
          const a = get().announcements.find((x) => x.id === id);
          if (!a || a.readBy[who]) return;
          set((s) => ({ announcements: s.announcements.map((x) => (x.id === id ? { ...x, readBy: { ...x.readBy, [who]: nowIso() } } : x)) }));
        },

        /* ---------- questions ---------- */
        askQuestion: ({ toId, body, taskId }) => {
          const s = get();
          set((st) => ({
            questions: [{ id: uid("q"), fromId: me(), toId, body, taskId, at: nowIso() }, ...st.questions],
            activity: [logEntry("question", `Asked ${firstName(s, toId)}: ${body}`, taskId), ...st.activity],
            notifications: [note(toId, "question", `${firstName(s, me())} asked you a question`, body, taskId), ...st.notifications],
          }));
        },
        answerQuestion: (id, answer) => {
          const q = get().questions.find((x) => x.id === id);
          if (!q) return;
          set((s) => ({
            questions: s.questions.map((x) => (x.id === id ? { ...x, answer, answeredAt: nowIso() } : x)),
            activity: [logEntry("answered", `Answered ${firstName(s, q.fromId)}: ${answer}`, q.taskId), ...s.activity],
            notifications: [note(q.fromId, "answer", `${firstName(s, me())} answered your question`, answer, q.taskId), ...s.notifications],
          }));
        },

        /* ---------- attendance ---------- */
        checkIn: () => {
          const who = me();
          const date = format(new Date(), "yyyy-MM-dd");
          const late = new Date().getHours() * 60 + new Date().getMinutes() > 9 * 60 + 15;
          set((s) => {
            const exists = s.attendance.some((a) => a.personId === who && a.date === date);
            const rec = { personId: who, date, checkIn: nowIso(), checkOut: undefined, breakMin: 0, status: late ? ("late" as const) : ("present" as const) };
            return {
              attendance: exists ? s.attendance.map((a) => (a.personId === who && a.date === date ? { ...a, ...rec } : a)) : [...s.attendance, rec],
              activity: [logEntry("check_in", "Checked in"), ...s.activity],
            };
          });
        },
        checkOut: () => {
          const who = me();
          const date = format(new Date(), "yyyy-MM-dd");
          const stopped = stopTimerFor(who);
          if (stopped) set(stopped);
          set((s) => ({
            attendance: s.attendance.map((a) => (a.personId === who && a.date === date ? { ...a, checkOut: nowIso() } : a)),
            activity: [logEntry("check_out", "Checked out"), ...s.activity],
          }));
        },
        requestLeave: (input) => {
          const s = get();
          const who = me();
          const approver = leadOf(who) ?? headOf(who) ?? "p_imran";
          set((st) => ({
            leaves: [{ ...input, id: uid("lv"), personId: who, status: "pending" }, ...st.leaves],
            notifications: [note(approver, "deadline", `${firstName(s, who)} asked for leave`, `${input.type} leave, ${input.from}${input.to !== input.from ? ` to ${input.to}` : ""}`), ...st.notifications],
          }));
        },
        decideLeave: (id, approve) => {
          const l = get().leaves.find((x) => x.id === id);
          if (!l) return;
          const todayStr = format(new Date(), "yyyy-MM-dd");
          const coversToday = approve && l.from <= todayStr && l.to >= todayStr;
          set((s) => ({
            leaves: s.leaves.map((x) => (x.id === id ? { ...x, status: approve ? "approved" : "declined" } : x)),
            people: coversToday ? s.people.map((p) => (p.id === l.personId ? { ...p, onLeave: true } : p)) : s.people,
            activity: [
              logEntry(approve ? "reminders_paused" : "deadline_changed", approve ? `Approved ${firstName(s, l.personId)}'s ${l.type} leave (${l.from}${l.to !== l.from ? ` to ${l.to}` : ""}). Reminders pause on those days.` : `Declined ${firstName(s, l.personId)}'s ${l.type} leave request`),
              ...s.activity,
            ],
            notifications: [note(l.personId, "deadline", approve ? "Leave approved" : "Leave declined", `${l.type} leave, ${l.from}`), ...s.notifications],
          }));
        },

        /* ---------- settings & demo ---------- */
        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        addHoliday: (date, name) =>
          set((s) => ({ settings: { ...s.settings, holidays: [...s.settings.holidays.filter((h) => h.date !== date), { date, name }].sort((a, b) => a.date.localeCompare(b.date)) } })),
        removeHoliday: (date) => set((s) => ({ settings: { ...s.settings, holidays: s.settings.holidays.filter((h) => h.date !== date) } })),
        addDepartment: ({ name, headId, description }) => {
          const id = uid("d");
          set((s) => ({
            departments: [...s.departments, { id, name, headId, description }],
            channels: [...s.channels, { id: uid("c"), name, kind: "open", unitType: "department", unitId: id, description: `Day-to-day coordination for ${name}` }],
            activity: [logEntry("created", `Created the ${name} department`), ...s.activity],
          }));
        },
        addTeam: ({ name, departmentId, leadId }) =>
          set((s) => ({
            teams: [...s.teams, { id: uid("t"), name, departmentId, leadId }],
            activity: [logEntry("created", `Created the ${name} team`), ...s.activity],
          })),
        addGroup: ({ name, description, memberIds }) => {
          const id = uid("g");
          set((s) => ({
            groups: [...s.groups, { id, name, description, memberIds, ownerId: me() }],
            channels: [...s.channels, { id: uid("c"), name, kind: "open", unitType: "group", unitId: id, description }],
            activity: [logEntry("created", `Created the group "${name}"`), ...s.activity],
          }));
        },
        movePerson: (personId, teamId) => {
          const s0 = get();
          const team = s0.teams.find((t) => t.id === teamId);
          if (!team) return;
          set((s) => ({
            people: s.people.map((p) => (p.id === personId ? { ...p, teamId, departmentId: team.departmentId } : p)),
            activity: [logEntry("reassigned", `Moved ${firstName(s, personId)} to ${team.name}. Their access changed automatically.`), ...s.activity],
          }));
        },
        setOnLeave: (personId, onLeave) => {
          set((s) => ({
            people: s.people.map((p) => (p.id === personId ? { ...p, onLeave } : p)),
            activity: [logEntry(onLeave ? "reminders_paused" : "check_in", onLeave ? `Marked ${firstName(s, personId)} on leave. Their reminders stopped.` : `${firstName(s, personId)} is back from leave`), ...s.activity],
          }));
        },
        setPref: (key, value) => {
          const who = me();
          set((s) => ({ prefs: { ...s.prefs, [who]: { ...(s.prefs[who] ?? {}), [key]: value } } }));
        },
        setDemo: (patch) => set((s) => ({ demo: { ...s.demo, ...patch } })),

        /**
         * Simulated reminder engine (the real one runs on the server).
         * Fires one reminder per tick for the employee being demoed,
         * counts ignored reminders and climbs the escalation ladder.
         */
        engineTick: () => {
          const s = get();
          if (!s.demo.engineOn) return null;
          const who = s.userIds.employee;
          const now = Date.now();
          const rank: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
          const candidates = s.tasks
            .filter(
              (t) =>
                t.assigneeId === who &&
                t.status === "assigned" &&
                (!t.snoozedUntil || new Date(t.snoozedUntil).getTime() < now) &&
                t.remindersSent < t.reminder.dailyCap + 6,
            )
            .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.lastReminderAt ?? "").localeCompare(b.lastReminderAt ?? ""));
          const t = candidates[0];
          if (!t) return null;

          const count = t.remindersSent + 1;
          const ignored = t.remindersSent > 0 ? t.remindersIgnored + 1 : t.remindersIgnored;
          const { l1Ignored, l2Ignored, l3Ignored } = s.settings.escalation;
          const level: HeatLevel = ignored >= l3Ignored ? 3 : ignored >= l2Ignored ? 2 : ignored >= l1Ignored ? 1 : 0;
          const newLevel = (Math.max(level, t.escalationLevel) as HeatLevel);

          const logs: Activity[] = [logEntry("reminder_sent", `Reminder ${count} delivered to ${firstName(s, who)}'s phone and PC`, t.id, "system")];
          const notes: AppNotification[] = [
            {
              ...note(who, "reminder", `Reminder ${count}: ${t.title}`, `${t.priority === "urgent" ? "Urgent. " : ""}Tap Acknowledge so ${firstName(s, t.reviewerId)} knows you've seen it.`, t.id),
              read: false,
            },
          ];
          if (newLevel > t.escalationLevel) {
            logs.push(logEntry("escalated", `Escalated to level ${newLevel} after ${ignored} ignored reminders`, t.id, "system"));
            const lead = leadOf(who);
            const head = headOf(who);
            const audience = newLevel >= 3 ? [lead, head] : newLevel === 2 ? [lead] : [];
            for (const r of Array.from(new Set(audience.filter(Boolean) as string[]))) {
              notes.push(note(r, "escalation", `${firstName(s, who)} has ignored ${ignored} reminders`, `${t.title} is now level ${newLevel}.`, t.id));
            }
          }
          commit(t.id, { remindersSent: count, remindersIgnored: ignored, lastReminderAt: new Date(now).toISOString(), escalationLevel: newLevel }, logs, notes);
          return {
            taskId: t.id,
            title: t.title,
            body: notes[0].body,
            count,
          };
        },

        resetDemo: () =>
          set({
            ...createSeed(),
            openTaskId: null,
            createOpen: false,
            timers: { p_ali: undefined },
          }),
      };
    },
    {
      name: "pulse-demo",
      version: 1,
      storage: createJSONStorage(() => {
        try {
          const probe = "__pulse_probe__";
          window.localStorage.setItem(probe, "1");
          window.localStorage.removeItem(probe);
          return window.localStorage;
        } catch {
          const mem = new Map<string, string>();
          return {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
          };
        }
      }),
      partialize: (s) => {
        const { openTaskId, createOpen, createDefaults, commandOpen, ...rest } = s;
        void openTaskId; void createOpen; void createDefaults; void commandOpen;
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== "function")) as Partial<AppState>;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState> | undefined;
        // reseed when the demo data is older than 18 hours so dates stay meaningful
        if (!p?.seededAt || differenceInHours(new Date(), new Date(p.seededAt)) > 18) {
          return { ...current, role: p?.role ?? current.role, demo: p?.demo ?? current.demo };
        }
        return { ...current, ...p };
      },
    },
  ),
);

/** everyone who belongs to a unit, used for channel audiences */
export function membersOf(s: Pick<SeedData, "people" | "teams" | "groups">, unitType: string, unitId: string): string[] {
  if (unitType === "org") return s.people.map((p) => p.id);
  if (unitType === "department") return s.people.filter((p) => p.departmentId === unitId || p.role === "owner").map((p) => p.id);
  if (unitType === "team") return s.people.filter((p) => p.teamId === unitId).map((p) => p.id);
  if (unitType === "group") {
    const g = s.groups.find((x) => x.id === unitId);
    return g ? Array.from(new Set([...g.memberIds, g.ownerId])) : [];
  }
  return [];
}

export const useMe = () => useApp((s) => s.people.find((p) => p.id === s.userIds[s.role])!);
export const useMeId = () => useApp((s) => s.userIds[s.role]);

export { DEFAULT_REMINDER };
