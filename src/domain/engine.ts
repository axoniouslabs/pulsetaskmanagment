/**
 * The reminder engine: one pure "tick" over an organisation's world.
 * The server calls it every minute (cron), saves what changed and sends push.
 *
 * For a task that hasn't been acknowledged, a reminder goes out only when all
 * five gates are open:
 *   1. window    it's working time (or the task is set to remind at any hour)
 *   2. presence  the assignee isn't on leave or deactivated
 *   3. snooze    the assignee hasn't snoozed it
 *   4. interval  enough minutes have passed since the last reminder
 *   5. cap       today's reminders for this task are under the daily cap
 *
 * Silence climbs the ladder: L1 after N ignored reminders (marked urgent),
 * L2 tells the team lead, L3 the department head (also any overdue task),
 * L4 the owner when it's still not acknowledged long after the deadline.
 */
import { addDays, addMonths, addWeeks, differenceInMinutes } from "date-fns";
import type { Activity, ActivityKind, AppNotification, HeatLevel, NotificationKind, Task } from "@/lib/types";
import { headOf, leadOf, membersOf, ownerOf, type World } from "./world";
import { isAway, isHoliday, isWorkDay, isWorkingTime, localNow, toMinutes } from "./time";

export interface EngineState {
  lastTickAt?: string;
  /** org-local date of the last daily reset */
  day?: string;
  morningSent?: string;
  eveningSent?: string;
  /** when report rows were last recomputed */
  rollupAt?: string;
  /** org-local date of the last weekly summary */
  weeklySent?: string;
  /** org-local date the 48-hour horizon warning last went out */
  horizonSent?: string;
  /** last reminder per notice per person, for notices that need an acknowledgment */
  noticeReminders?: Record<string, Record<string, string>>;
  /** tasks whose daily reminder cap was logged today (date → task ids) */
  capLogged?: { date: string; ids: string[] };
}

export interface TickResult {
  world: World;
  state: EngineState;
  /** org-local dates whose report rows should be recomputed */
  rollupDates: string[];
  /** notification ids that are digests (also emailed when email is set up) */
  digestIds: string[];
}

const BLOCKED_NUDGE_MIN = 240;
const DUE_SOON_MIN = 60;
const DIGEST_GRACE_MIN = 120;
/** not started with this little time left: the team lead hears about it */
const NOT_STARTED_SOON_MIN = 120;
/** notices that need an OK are chased this often (at most twice in a working day) */
const NOTICE_REMIND_MIN = 240;
/** a repeating task stops making new copies while this many are still open */
const RECURRENCE_PILE_CAP = 3;
/** the 48-hour horizon warning goes to managers at this org-local time */
const HORIZON_MINUTES = 15 * 60;

const OPEN = ["assigned", "acknowledged", "in_progress"];

export function runTick(world: World, state: EngineState, now: Date, uid: (p: string) => string): TickResult {
  const w: World = structuredClone(world);
  const s = w.settings;
  const tz = s.timezone || "Asia/Karachi";
  const l = localNow(now, tz);
  const nowIso = now.toISOString();
  const working = isWorkingTime(s, now);
  const acts: Activity[] = [];
  const notes: AppNotification[] = [];
  const digestIds: string[] = [];
  const next: EngineState = { ...state, lastTickAt: nowIso };
  const rollupDates: string[] = [];

  const first = (id: string) => w.people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  const log = (kind: ActivityKind, text: string, taskId?: string) =>
    acts.push({
      id: uid("act"),
      at: nowIso,
      actorId: "system",
      kind,
      text,
      taskId,
    });
  const note = (recipientId: string | undefined, kind: NotificationKind, title: string, body: string, taskId?: string) => {
    if (!recipientId) return undefined;
    let p = w.people.find((x) => x.id === recipientId);
    // someone who has left can't act on an escalation or a review: the owner hears instead
    if (p?.active === false && (kind === "escalation" || kind === "submitted")) {
      const owner = ownerOf(w);
      p = owner && owner !== recipientId ? w.people.find((x) => x.id === owner) : undefined;
      recipientId = p?.id;
    }
    if (!p || !recipientId || p.active === false) return undefined;
    const n: AppNotification = {
      id: uid("n"),
      at: nowIso,
      recipientId,
      kind,
      title,
      body,
      taskId,
      read: false,
    };
    notes.push(n);
    return n;
  };
  const minsSince = (iso?: string) => (iso ? differenceInMinutes(now, new Date(iso)) : Infinity);
  const hasHealthyDevice = (personId: string) => w.people.find((p) => p.id === personId)?.devices.some((d) => d.healthy) ?? false;

  /* ---------- 1. a new day: reset daily counters, sync leave, roll up yesterday ---------- */
  if (next.day !== l.date) {
    if (next.day) rollupDates.push(next.day);
    for (const t of w.tasks) {
      if (t.snoozesToday) t.snoozesToday = 0;
      if (t.remindersToday) t.remindersToday = 0;
    }
    for (const p of w.people) {
      const onApprovedLeave = w.leaves.some((x) => x.personId === p.id && x.status === "approved" && x.from <= l.date && x.to >= l.date);
      const leaveEndedRecently = w.leaves.some((x) => x.personId === p.id && x.status === "approved" && x.to < l.date && x.to >= (next.day ?? x.to));
      if (onApprovedLeave && !p.onLeave) {
        p.onLeave = true;
        log("reminders_paused", `${first(p.id)} is on leave today. Their reminders are paused.`);
      } else if (!onApprovedLeave && p.onLeave && leaveEndedRecently) {
        p.onLeave = false;
        log("check_in", `${first(p.id)} is back from leave. Reminders resume.`);
      }
    }
    next.day = l.date;
  }
  rollupDates.push(l.date);

  /* ---------- 2. tasks ---------- */
  const escalate = (t: Task, level: HeatLevel, why: string, opts: { overdue?: boolean } = {}) => {
    if (level <= t.escalationLevel) return;
    t.escalationLevel = level;
    log("escalated", `Escalated to level ${level}: ${why}`, t.id);
    const who = first(t.assigneeId);
    const lead = leadOf(w, t.assigneeId);
    const head = headOf(w, t.assigneeId);
    const owner = ownerOf(w);
    const audience = level === 4 ? [owner, head, lead] : level === 3 ? [lead, head, opts.overdue ? owner : (head ?? owner)] : level === 2 ? [lead ?? head ?? owner] : [];
    const title = level === 4 ? `${who} has not responded for ${Math.round(minsSince(t.dueAt) / 60)} hours past the deadline` : `${who}: ${why}`;
    for (const r of Array.from(new Set(audience.filter((x): x is string => !!x && x !== t.assigneeId)))) {
      note(r, "escalation", title, `${t.title} is now level ${level}.`, t.id);
    }
  };

  for (const t of w.tasks) {
    if (t.status === "draft" || t.status === "approved" || t.status === "cancelled") continue;
    if (t.startAt && new Date(t.startAt) > now) continue;
    const away = isAway(w, t.assigneeId, l.date);
    const overdueMin = minsSince(t.dueAt); // > 0 when overdue
    const overdue = overdueMin > 0;

    const unclaimed = !!t.groupClaim && !t.groupClaim.claimed;
    if (t.status === "assigned") {
      // ladder first: lateness counts even when reminders are paused by the window
      if (!away && working) {
        if (overdue && overdueMin >= s.escalation.l4HoursPastDue * 60)
          escalate(t, 4, "still not acknowledged long after the deadline", {
            overdue: true,
          });
        else if (overdue) escalate(t, 3, unclaimed ? "past the deadline and nobody claimed it" : "past the deadline and not acknowledged", { overdue: true });
        else if (-overdueMin <= NOT_STARTED_SOON_MIN) escalate(t, 2, "due within 2 hours and not started");
        else {
          // a quarter of the time to the deadline gone with no response: mark it, before any reminder count does
          const total = new Date(t.dueAt).getTime() - new Date(t.createdAt).getTime();
          if (total > 0 && (now.getTime() - new Date(t.createdAt).getTime()) / total >= 0.25) escalate(t, 1, "a quarter of the time to the deadline passed without a response");
        }
      }
      const windowOpen = t.reminder.window === "always" || working;
      const snoozed = !!t.snoozedUntil && new Date(t.snoozedUntil) > now;
      const intervalOk = minsSince(t.lastReminderAt ?? t.createdAt) >= t.reminder.intervalMin;
      const underCap = (t.remindersToday ?? 0) < t.reminder.dailyCap;
      if (!underCap && windowOpen && intervalOk) {
        // the cap is the one gate the owner can't infer from the clock: say so once a day
        const logged = next.capLogged?.date === l.date ? next.capLogged.ids : [];
        if (!logged.includes(t.id)) {
          next.capLogged = { date: l.date, ids: [...logged, t.id] };
          log("reminders_paused", `Daily reminder cap of ${t.reminder.dailyCap} reached. No more reminders today; the escalation ladder still applies.`, t.id);
        }
      }
      if (unclaimed) {
        // offered to a unit and not claimed: every member is reminded until someone takes it
        if (!(windowOpen && intervalOk && underCap) || !t.groupClaim?.unitType || !t.groupClaim.unitId) continue;
        const members = membersOf(w, t.groupClaim.unitType, t.groupClaim.unitId).filter((id) => !isAway(w, id, l.date));
        if (!members.length) continue;
        t.remindersSent += 1;
        t.remindersToday = (t.remindersToday ?? 0) + 1;
        t.lastReminderAt = nowIso;
        for (const id of members)
          note(id, "reminder", `Still unclaimed: ${t.title}`, `Offered to ${t.groupClaim.unitName}. The first to claim it owns it.${overdue ? " It is past its deadline." : ""}`, t.id);
        log("reminder_sent", `Reminded ${members.length} people in ${t.groupClaim.unitName} that nobody has claimed this yet`, t.id);
        continue;
      }
      if (!(windowOpen && !away && !snoozed && intervalOk && underCap)) continue;

      const count = t.remindersSent + 1;
      // a reminder that couldn't reach any device isn't held against the person
      const counted = t.remindersSent > 0 && hasHealthyDevice(t.assigneeId);
      t.remindersSent = count;
      t.remindersToday = (t.remindersToday ?? 0) + 1;
      t.lastReminderAt = nowIso;
      if (counted) t.remindersIgnored += 1;
      const reviewer = first(t.reviewerId);
      const urgent = t.priority === "urgent" || t.escalationLevel >= 1;
      note(
        t.assigneeId,
        "reminder",
        `${urgent ? "Urgent. " : ""}Reminder ${count}: ${t.title}`,
        overdue ? `This is past its deadline. Tap Acknowledge so ${reviewer} knows you've seen it.` : `Tap Acknowledge so ${reviewer} knows you've seen it.`,
        t.id,
      );
      log("reminder_sent", `Reminder ${count} sent to ${first(t.assigneeId)}${hasHealthyDevice(t.assigneeId) ? "" : " (no working device: in-app only, not counted as ignored)"}`, t.id);

      const ig = t.remindersIgnored;
      const e = s.escalation;
      if (ig >= e.l3Ignored) escalate(t, 3, `${ig} reminders ignored`);
      else if (ig >= e.l2Ignored) escalate(t, 2, `${ig} reminders ignored`);
      else if (ig >= e.l1Ignored) escalate(t, 1, `${ig} reminders ignored`);
      continue;
    }

    if (t.status === "acknowledged" || t.status === "in_progress") {
      if (away || !(t.reminder.window === "always" || working)) continue;
      if (overdue) {
        if (overdueMin >= s.escalation.l4HoursPastDue * 60) escalate(t, 4, "a full day past the deadline", { overdue: true });
        else if (t.escalationLevel < 3) {
          t.escalationLevel = 3;
          log("escalated", "Past the deadline", t.id);
          // the reviewer (or lead), the department head and the owner hear that it's late
          const late = [t.reviewerId !== t.assigneeId ? t.reviewerId : leadOf(w, t.assigneeId), headOf(w, t.assigneeId), ownerOf(w)];
          for (const r of Array.from(new Set(late.filter((x): x is string => !!x && x !== t.assigneeId)))) {
            note(r, "escalation", `${first(t.assigneeId)} is late`, `${t.title} was due ${Math.max(1, Math.round(overdueMin / 60))}h ago.`, t.id);
          }
        }
        const gap = Math.max(t.reminder.intervalMin, t.reminder.quietAfterAckMin);
        if (minsSince(t.lastReminderAt) >= gap && (t.remindersToday ?? 0) < t.reminder.dailyCap) {
          t.remindersSent += 1;
          t.remindersToday = (t.remindersToday ?? 0) + 1;
          t.lastReminderAt = nowIso;
          note(t.assigneeId, "reminder", `Overdue: ${t.title}`, "Submit it, or ask for more time so your reviewer knows the new plan.", t.id);
          log("reminder_sent", `Overdue reminder sent to ${first(t.assigneeId)}`, t.id);
        }
      } else if (-overdueMin <= DUE_SOON_MIN && (!t.lastReminderAt || new Date(t.lastReminderAt) < new Date(new Date(t.dueAt).getTime() - DUE_SOON_MIN * 60000))) {
        t.lastReminderAt = nowIso;
        t.remindersSent += 1;
        t.remindersToday = (t.remindersToday ?? 0) + 1;
        note(t.assigneeId, "reminder", `Due within the hour: ${t.title}`, "Submit it on time, or ask for more time now.", t.id);
        log("reminder_sent", `Due-soon reminder sent to ${first(t.assigneeId)}`, t.id);
      } else if (t.status === "acknowledged" && t.acknowledgedAt) {
        // seen but not started: a gentler nudge at twice the interval, after the quiet period, never counted as ignored
        if (-overdueMin <= NOT_STARTED_SOON_MIN) escalate(t, 2, "due within 2 hours and not started");
        const snoozed = !!t.snoozedUntil && new Date(t.snoozedUntil) > now;
        const sinceAck = minsSince(t.acknowledgedAt);
        const sinceLast = t.lastReminderAt && t.lastReminderAt > t.acknowledgedAt ? minsSince(t.lastReminderAt) : sinceAck;
        const gap = Math.max(t.reminder.intervalMin * 2, t.reminder.quietAfterAckMin);
        if (!snoozed && sinceAck >= t.reminder.quietAfterAckMin && sinceLast >= gap && (t.remindersToday ?? 0) < t.reminder.dailyCap) {
          t.lastReminderAt = nowIso;
          t.remindersSent += 1;
          t.remindersToday = (t.remindersToday ?? 0) + 1;
          note(t.assigneeId, "reminder", `Not started yet: ${t.title}`, "Tap Start when you begin, or Blocked if something is in the way.", t.id);
          log("reminder_sent", `Gentle reminder sent to ${first(t.assigneeId)} (seen, not started)`, t.id);
        }
      }
      continue;
    }

    if (t.status === "blocked") {
      if (!working || !t.blockedOwnerId) continue;
      const since = t.lastReminderAt && t.blockedAt && t.lastReminderAt > t.blockedAt ? t.lastReminderAt : t.blockedAt;
      if (minsSince(since) >= BLOCKED_NUDGE_MIN) {
        t.lastReminderAt = nowIso;
        note(t.blockedOwnerId, "blocked", `${first(t.assigneeId)} is still waiting on you`, `${t.title}: ${t.blockedReason ?? "blocked"}`, t.id);
        log("reminder_sent", `Reminded ${first(t.blockedOwnerId)} that ${first(t.assigneeId)} is still blocked`, t.id);
      }
      continue;
    }

    if (t.status === "submitted" && t.submittedAt) {
      if (!working) continue;
      const waitH = minsSince(t.submittedAt) / 60;
      if (waitH >= s.reviewSlaHours * 2 && t.escalationLevel < 2) {
        t.escalationLevel = 2;
        const up = headOf(w, t.reviewerId) ?? ownerOf(w);
        note(
          up !== t.reviewerId ? up : undefined,
          "escalation",
          `${first(t.assigneeId)}'s work has waited ${Math.round(waitH)} hours for review`,
          `${t.title} is waiting on ${first(t.reviewerId)}.`,
          t.id,
        );
        log("escalated", `Review overdue: waiting ${Math.round(waitH)} hours on ${first(t.reviewerId)}`, t.id);
      } else if (waitH >= s.reviewSlaHours && t.escalationLevel < 1) {
        t.escalationLevel = 1;
        note(t.reviewerId, "submitted", `${first(t.assigneeId)}'s work is waiting for you`, `${t.title} has waited ${Math.round(waitH)} hours. Approve it or send it back.`, t.id);
        log("reminder_sent", `Reminded ${first(t.reviewerId)} to review`, t.id);
      }
    }
  }

  /* ---------- 3. repeating tasks: make the next copy once this one is done or due ---------- */
  const stillOpen = (x: Task) => !["approved", "cancelled"].includes(x.status);
  /** open copies behind this one in its repeat chain (this one included) */
  const openInChain = (t: Task) => {
    let n = stillOpen(t) ? 1 : 0;
    let cur: Task | undefined = t;
    for (let i = 0; i < 50 && cur; i++) {
      const prev: Task | undefined = w.tasks.find((x) => x.recurrenceNextId === cur!.id);
      if (!prev) break;
      if (stillOpen(prev)) n++;
      cur = prev;
    }
    return n;
  };
  // "daily" means every working day: weekends and holidays are skipped
  const isOff = (d: Date) => {
    const ln = localNow(d, tz);
    return !s.workDays.includes(ln.dow) || isHoliday(s, ln.date);
  };
  for (const t of [...w.tasks]) {
    if (!t.recurrence || t.recurrenceNextId || t.status === "draft" || t.status === "cancelled") continue;
    if (t.status !== "approved" && new Date(t.dueAt) > now) continue;
    if (openInChain(t) >= RECURRENCE_PILE_CAP) continue; // the pile is capped; a holiday never creates fifty overdue copies
    const step = (d: Date) => (t.recurrence === "daily" ? addDays(d, 1) : t.recurrence === "weekly" ? addWeeks(d, 1) : addMonths(d, 1));
    let due = step(new Date(t.dueAt));
    let start = t.startAt ? step(new Date(t.startAt)) : undefined;
    let guard = 0;
    while ((due <= now || (t.recurrence === "daily" && isOff(due))) && guard++ < 400) {
      due = step(due);
      if (start) start = step(start);
    }
    const id = uid("task");
    const copy: Task = {
      ...structuredClone(t),
      id,
      status: "assigned",
      createdAt: nowIso,
      startAt: start?.toISOString(),
      dueAt: due.toISOString(),
      remindersSent: 0,
      remindersIgnored: 0,
      remindersToday: 0,
      lastReminderAt: undefined,
      escalationLevel: 0,
      subtasks: t.subtasks.map((x) => ({ ...x, id: uid("s"), done: false })),
      comments: [],
      attachments: [],
      blockedReason: undefined,
      blockedOwnerId: undefined,
      blockedAt: undefined,
      blockedFrom: undefined,
      submittedAt: undefined,
      submissionNote: undefined,
      rejections: 0,
      lastRejectionReason: undefined,
      acknowledgedAt: undefined,
      startedAt: undefined,
      approvedAt: undefined,
      statusChangedAt: nowIso,
      snoozedUntil: undefined,
      snoozesToday: 0,
      loggedMinutes: 0,
      recurrenceNextId: undefined,
      dependsOn: [],
    };
    // the person it repeated for has left: the next copy goes to the owner to hand on
    if (w.people.find((p) => p.id === t.assigneeId)?.active === false) {
      const owner = ownerOf(w);
      if (owner) copy.assigneeId = owner;
    }
    if (w.people.find((p) => p.id === copy.reviewerId)?.active === false) copy.reviewerId = ownerOf(w) ?? copy.reviewerId;
    t.recurrenceNextId = id;
    w.tasks.unshift(copy);
    log("assigned", `Repeats ${t.recurrence}: next copy assigned to ${first(t.assigneeId)}`, id);
    note(
      t.assigneeId,
      "assigned",
      `New ${t.recurrence} task`,
      `${copy.title}, due ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(due)}`,
      id,
    );
  }

  /* ---------- 4. digests ---------- */
  if (isWorkDay(s, l)) {
    const active = w.people.filter((p) => p.active !== false && !isAway(w, p.id, l.date));
    const open = w.tasks.filter((t) => ["assigned", "acknowledged", "in_progress", "blocked"].includes(t.status));
    const endOfDay = new Date(now.getTime() + (24 * 60 - l.minutes) * 60000);

    // a digest is only worth sending close to its time; if the engine was down, skip it
    const morningDue = l.minutes >= toMinutes(s.digestMorning) && next.morningSent !== l.date;
    if (morningDue && l.minutes > toMinutes(s.digestMorning) + DIGEST_GRACE_MIN) next.morningSent = l.date;
    if (morningDue && next.morningSent !== l.date) {
      next.morningSent = l.date;
      const rank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
      for (const p of active) {
        const mine = open.filter((t) => t.assigneeId === p.id && t.status !== "blocked" && !(t.startAt && new Date(t.startAt) > endOfDay));
        const late = mine.filter((t) => new Date(t.dueAt) <= now).length;
        const reviews = w.tasks.filter((t) => t.status === "submitted" && t.reviewerId === p.id).length;
        // the day, in order: overdue first, then by deadline, urgent before normal
        const ordered = [...mine].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() || rank[a.priority] - rank[b.priority]);
        const top = ordered.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`);
        const more = ordered.length - top.length;
        const parts = [late ? `${late} overdue` : "", reviews ? `${reviews} waiting for your review` : ""].filter(Boolean);
        if (!mine.length && !reviews) continue;
        const title = mine.length ? `Good morning. ${mine.length} ${mine.length === 1 ? "task" : "tasks"} today${late ? `, ${late} overdue` : ""}` : "Good morning. Here's your day";
        const body = [...top, more > 0 ? `and ${more} more` : "", parts.length && !mine.length ? parts.join(", ") + "." : reviews ? `${reviews} waiting for your review.` : ""]
          .filter(Boolean)
          .join("\n");
        const n = note(p.id, "digest", title, body);
        if (n) digestIds.push(n.id);
      }
    }

    // 48-hour horizon: work that is due soon and hasn't been started, for whoever manages it
    const horizonDue = l.minutes >= HORIZON_MINUTES && next.horizonSent !== l.date;
    if (horizonDue && l.minutes > HORIZON_MINUTES + DIGEST_GRACE_MIN) next.horizonSent = l.date;
    if (horizonDue && next.horizonSent !== l.date) {
      next.horizonSent = l.date;
      const in48 = new Date(now.getTime() + 48 * 60 * 60000);
      const notStarted = open.filter((t) => (t.status === "assigned" || t.status === "acknowledged") && new Date(t.dueAt) > now && new Date(t.dueAt) <= in48);
      for (const p of active.filter((x) => x.role !== "employee")) {
        const team = new Set(
          p.role === "owner"
            ? w.people.map((x) => x.id)
            : w.people.filter((x) => w.departments.some((d) => d.headId === p.id && d.id === x.departmentId) || w.teams.some((tm) => tm.leadId === p.id && tm.id === x.teamId)).map((x) => x.id),
        );
        const theirs = notStarted.filter((t) => team.has(t.assigneeId) && t.assigneeId !== p.id);
        if (!theirs.length) continue;
        const names = Array.from(new Set(theirs.map((t) => first(t.assigneeId))))
          .slice(0, 4)
          .join(", ");
        const n = note(
          p.id,
          "deadline",
          `${theirs.length} ${theirs.length === 1 ? "task is" : "tasks are"} due within 48 hours and not started`,
          `${names}${theirs.length > 4 ? " and others" : ""}. Worth a word before the deadline, not after.`,
        );
        if (n) digestIds.push(n.id);
      }
    }

    // weekly summary: first working day of the week, with the morning brief
    const weekStart = l.dow === Math.min(...s.workDays.filter((d) => d !== 0), 1);
    if (weekStart && next.morningSent === l.date && next.weeklySent !== l.date) {
      next.weeklySent = l.date;
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60000);
      const lastWeek = w.activity.filter((a) => new Date(a.at) >= weekAgo);
      for (const p of active.filter((x) => x.role !== "employee")) {
        const team = new Set(
          p.role === "owner"
            ? w.people.map((x) => x.id)
            : w.people.filter((x) => w.departments.some((d) => d.headId === p.id && d.id === x.departmentId) || w.teams.some((tm) => tm.leadId === p.id && tm.id === x.teamId)).map((x) => x.id),
        );
        const teamTasks = w.tasks.filter((t) => team.has(t.assigneeId));
        const approved = teamTasks.filter((t) => t.status === "approved" && t.approvedAt && new Date(t.approvedAt) >= weekAgo);
        const onTime = approved.filter((t) => t.approvedAt! <= t.dueAt).length;
        const escalated = lastWeek.filter((a) => a.kind === "escalated" && teamTasks.some((t) => t.id === a.taskId)).length;
        const reminders = lastWeek.filter((a) => a.kind === "reminder_sent" && teamTasks.some((t) => t.id === a.taskId)).length;
        const lateNow = teamTasks.filter((t) => OPEN.includes(t.status) && new Date(t.dueAt) <= now).length;
        if (!approved.length && !escalated && !reminders && !lateNow) continue;
        const n = note(
          p.id,
          "digest",
          "Last week in one line",
          `${approved.length} approved (${approved.length ? Math.round((onTime / approved.length) * 100) : 0}% on time), ${reminders} reminders sent, ${escalated} escalations. ${lateNow} ${lateNow === 1 ? "task is" : "tasks are"} overdue right now.`,
        );
        if (n) digestIds.push(n.id);
      }
    }

    // notices that need an OK are chased until everyone has given it
    const reminded = { ...(next.noticeReminders ?? {}) };
    for (const a of w.announcements) {
      if (!a.requiresAck) continue;
      const ch = w.channels.find((c) => c.id === a.channelId);
      if (!ch) continue;
      const waiting = membersOf(w, ch.unitType, ch.unitId).filter((id) => !a.ackBy[id] && id !== a.authorId && !isAway(w, id, l.date));
      if (!waiting.length) {
        delete reminded[a.id];
        continue;
      }
      if (!working) continue;
      const per = { ...(reminded[a.id] ?? {}) };
      let sent = 0;
      for (const id of waiting) {
        // every 4 working hours, which is at most twice in a working day
        const last = per[id] ?? a.at;
        if (minsSince(last) < NOTICE_REMIND_MIN) continue;
        per[id] = nowIso;
        sent++;
        note(id, "announcement", `${first(a.authorId)} is waiting for your OK`, `Please read and acknowledge "${a.title}".`);
      }
      if (sent) {
        reminded[a.id] = per;
        log("announcement", `Reminded ${sent} ${sent === 1 ? "person" : "people"} to acknowledge "${a.title}"`);
        // overdue notice: the author hears who is still missing, once
        if (a.ackDueAt && new Date(a.ackDueAt) <= now && !per.__escalated) {
          per.__escalated = nowIso;
          note(
            a.authorId,
            "announcement",
            `${waiting.length} ${waiting.length === 1 ? "person hasn't" : "people haven't"} acknowledged "${a.title}"`,
            `It was due ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(a.ackDueAt))}. ${waiting.map(first).slice(0, 5).join(", ")}${waiting.length > 5 ? " and others" : ""}.`,
          );
        }
      }
    }
    next.noticeReminders = reminded;

    const eveningDue = l.minutes >= toMinutes(s.digestEvening) && next.eveningSent !== l.date;
    if (eveningDue && l.minutes > toMinutes(s.digestEvening) + DIGEST_GRACE_MIN) next.eveningSent = l.date;
    if (eveningDue && next.eveningSent !== l.date) {
      next.eveningSent = l.date;
      const doneToday = w.tasks.filter((t) => t.status === "approved" && t.approvedAt && localNow(new Date(t.approvedAt), tz).date === l.date);
      for (const p of active.filter((x) => x.role !== "employee")) {
        const team = new Set(
          p.role === "owner"
            ? w.people.map((x) => x.id)
            : w.people.filter((x) => w.departments.some((d) => d.headId === p.id && d.id === x.departmentId) || w.teams.some((tm) => tm.leadId === p.id && tm.id === x.teamId)).map((x) => x.id),
        );
        const done = doneToday.filter((t) => team.has(t.assigneeId)).length;
        const late = open.filter((t) => team.has(t.assigneeId) && new Date(t.dueAt) <= now).length;
        const unseen = open.filter((t) => team.has(t.assigneeId) && t.status === "assigned").length;
        const blocked = open.filter((t) => team.has(t.assigneeId) && t.status === "blocked").length;
        const n = note(p.id, "digest", "End of day summary", `${done} done today, ${late} overdue, ${unseen} not acknowledged yet, ${blocked} blocked.`);
        if (n) digestIds.push(n.id);
      }
    }
  }

  w.activity = [...acts.reverse(), ...w.activity];
  w.notifications = [...notes, ...w.notifications];
  return {
    world: w,
    state: next,
    rollupDates: Array.from(new Set(rollupDates)),
    digestIds,
  };
}

/** open work that the engine is responsible for */
export const isEngineTask = (t: Task) => OPEN.includes(t.status);
